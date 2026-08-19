'use strict';

require('dotenv').config();

const express = require('express');
const db = require('./db');
const { enviarTexto, mostrarDigitando, baixarMidiaBase64, transcreverAudio } = require('./evolution');
const { rodar } = require('./agente');
const { precificar, fmtBRL, avaliar } = require('./precos');
const { ehConfirmacao } = require('./texto');

const app = express();
app.use(express.json({ limit: '10mb' }));

// ─── FILA POR TELEFONE ───────────────────────────────────────────────────────
// Duas mensagens do mesmo cliente ao mesmo tempo leriam e escreveriam o mesmo
// rascunho, e a segunda apagaria o que a primeira acabou de salvar. Uma fila
// por número resolve sem travar quem está conversando em paralelo.
const filas = new Map();

function enfileirar(telefone, tarefa) {
  const anterior = filas.get(telefone) || Promise.resolve();
  const atual = anterior.then(tarefa).catch((err) => console.error('[fila]', telefone, err.message));
  filas.set(telefone, atual);
  return atual;
}

// ─── DEDUPLICAÇÃO ────────────────────────────────────────────────────────────
// A Evolution reenvia o mesmo evento quando o webhook demora a responder. Sem
// esta trava, o cliente recebe a mesma resposta duas vezes.
const processadas = new Map();

function jaProcessada(id) {
  if (!id) return false;
  const agora = Date.now();
  for (const [k, t] of processadas) if (agora - t > 300_000) processadas.delete(k);
  if (processadas.has(id)) return true;
  processadas.set(id, agora);
  return false;
}

// ─── AGRUPAMENTO DE MENSAGENS PICADAS ────────────────────────────────────────
// Muita gente escreve "quero uma pizza" / "grande" / "de calabresa" em três
// mensagens. Responder a cada uma faz o agente perguntar o que já foi dito na
// mensagem seguinte. Espera alguns segundos e trata como uma fala só.
const ESPERA_MS = Number(process.env.AGRUPAR_SEG || 6) * 1000;
const TETO_MS = ESPERA_MS * 4;
const buffers = new Map();

function agrupar(telefone, texto, contexto) {
  const buffer = buffers.get(telefone) || { textos: [], desde: Date.now(), contexto };
  buffer.textos.push(texto);
  buffer.contexto = contexto;
  clearTimeout(buffer.timer);

  // O teto existe pra quem digita sem parar: em algum momento é preciso
  // responder, senão o agente fica mudo enquanto o cliente monologa.
  const espera = Date.now() - buffer.desde > TETO_MS ? 0 : ESPERA_MS;
  buffer.timer = setTimeout(() => {
    buffers.delete(telefone);
    enfileirar(telefone, () => atender(telefone, buffer.textos.join('\n'), buffer.contexto));
  }, espera);

  buffers.set(telefone, buffer);
}

// ─── ATENDIMENTO ─────────────────────────────────────────────────────────────

async function atender(telefone, texto, contexto = {}) {
  const restaurante = await db.resolverRestaurante(telefone);

  if (!restaurante) {
    await db.log('warn', 'sem_tenant', { telefone, mensagem: 'Nenhum restaurante ativo para atender' });
    return;
  }

  const cliente = await db.garantirCliente(restaurante.id, telefone, contexto.pushName);
  const cupom = await db.buscarCupomAtivo(cliente.id);
  const rascunho = await db.carregarRascunho(restaurante.id, telefone);

  await db.salvarMensagem(restaurante.id, telefone, 'user', texto);

  // Confirmação do pedido: quem grava é o SISTEMA, nunca a LLM.
  if (rascunho?.etapa_atual === 'aguardando_confirmacao' && ehConfirmacao(texto)) {
    const resposta = await confirmarPedido({ restaurante, cliente, telefone, cupom });
    if (resposta) {
      await responder(restaurante.id, telefone, resposta);
      return;
    }
    // Se a confirmação não pôde ser fechada (outro fluxo pegou primeiro),
    // segue pro agente normalmente em vez de deixar o cliente sem resposta.
  }

  const historico = await db.carregarHistorico(restaurante.id, telefone);
  const produtos = await db.buscarProdutos(restaurante.id);

  await mostrarDigitando(telefone);

  const { texto: saida } = await rodar({
    texto, historico, restaurante, produtos, rascunho, cupom, telefone,
  });

  if (saida) await responder(restaurante.id, telefone, saida);
}

async function responder(restauranteId, telefone, texto) {
  await enviarTexto(telefone, texto);
  await db.salvarMensagem(restauranteId, telefone, 'assistant', texto);
}

// Fecha o pedido: repreça do zero (mesma função do resumo), grava, limpa o
// rascunho e responde. Devolve null se outro fluxo já estava fechando.
async function confirmarPedido({ restaurante, cliente, telefone, cupom }) {
  const rascunho = await db.tentarIniciarConfirmacao(restaurante.id, telefone);
  if (!rascunho) return null;

  try {
    const itens = Array.isArray(rascunho.itens) ? rascunho.itens : [];
    const avaliacao = avaliar(rascunho, restaurante);

    // Rede de segurança: se algo sumiu do rascunho entre o resumo e o SIM,
    // melhor voltar a coletar do que gravar um pedido pela metade.
    if (!avaliacao.completo) {
      await db.salvarRascunho(restaurante.id, telefone, { etapa_atual: 'coletando' });
      return null;
    }

    const totais = precificar({
      itens,
      tipoEntrega: rascunho.tipo_entrega,
      taxaEntregaConfig: restaurante.taxa_entrega,
      cupom,
    });

    const pedido = await db.criarPedido({
      restauranteId: restaurante.id, cliente, rascunho, itens, totais, cupom,
    });

    await db.limparRascunho(restaurante.id, telefone);
    await db.log('info', 'pedido_criado', {
      restauranteId: restaurante.id,
      telefone,
      mensagem: `Pedido #${pedido.numero_pedido} — ${fmtBRL(totais.total)}`,
    });

    const linhas = [
      `✅ *Pedido #${pedido.numero_pedido} confirmado!*`,
      '',
      `Total: *${fmtBRL(totais.total)}*`,
    ];

    if (rascunho.forma_pagamento === 'pix' && restaurante.chave_pix) {
      linhas.push('');
      linhas.push(`💠 Chave PIX: *${restaurante.chave_pix}*`);
      if (restaurante.pix_titular) {
        linhas.push(`Em nome de ${restaurante.pix_titular}${restaurante.pix_banco ? ` (${restaurante.pix_banco})` : ''}`);
      }
      linhas.push('Me manda o comprovante quando pagar 😊');
    }

    linhas.push('');
    linhas.push(
      rascunho.tipo_entrega === 'delivery'
        ? 'Já mandei pra cozinha e te aviso quando sair pra entrega 🛵'
        : 'Já mandei pra cozinha, é só vir buscar quando eu avisar 🏃'
    );

    return linhas.join('\n');
  } catch (err) {
    // Devolve o rascunho ao estado anterior: assim o cliente pode confirmar de
    // novo em vez de ficar preso num limbo sem pedido e sem resumo.
    await db.salvarRascunho(restaurante.id, telefone, { etapa_atual: 'aguardando_confirmacao' });
    throw err;
  }
}

// ─── WEBHOOK ─────────────────────────────────────────────────────────────────

app.post('/webhook', async (req, res) => {
  // Responde na hora: a Evolution reenvia o evento se o webhook demorar, e o
  // atendimento leva segundos.
  res.sendStatus(200);

  try {
    const dados = req.body?.data;
    if (!dados?.key) return;
    if (dados.key.fromMe) return;                 // eco das nossas próprias mensagens
    if (jaProcessada(dados.key.id)) return;

    const telefone = String(dados.key.remoteJid || '').split('@')[0].replace(/\D/g, '');
    if (!telefone || dados.key.remoteJid?.includes('@g.us')) return;  // ignora grupos

    const msg = dados.message || {};
    let texto = msg.conversation || msg.extendedTextMessage?.text || null;

    // Áudio: o dono do restaurante quase sempre responde falando.
    if (!texto && (msg.audioMessage || msg.pttMessage)) {
      try {
        const base64 = await baixarMidiaBase64(dados);
        const transcrito = await transcreverAudio(base64);
        if (transcrito) texto = transcrito;
      } catch (err) {
        await db.log('warn', 'audio_falhou', { telefone, mensagem: err.message });
        await enviarTexto(telefone, 'Não consegui escutar direito 😅 me manda por escrito?');
        return;
      }
    }

    if (!texto) {
      // Imagem, figurinha, documento: nada pra fazer, mas responder é melhor
      // que sumir no meio da conversa.
      if (msg.imageMessage || msg.stickerMessage || msg.documentMessage) {
        await enviarTexto(telefone, 'Recebi! 😊 Me conta por escrito o que você precisa?');
      }
      return;
    }

    agrupar(telefone, texto.trim(), { pushName: dados.pushName });
  } catch (err) {
    console.error('[webhook]', err.message);
    await db.log('error', 'webhook', { mensagem: err.message, stack: err.stack });
  }
});

// ─── SAÚDE ───────────────────────────────────────────────────────────────────

app.get('/health', async (_req, res) => {
  const faltando = ['SUPA_URL', 'SUPA_SERVICE_KEY', 'EVOLUTION_URL', 'EVOLUTION_KEY', 'EVOLUTION_INSTANCE', 'OPENAI_API_KEY']
    .filter((k) => !process.env[k]);

  let banco = 'ok';
  let tenantAtivo = null;
  try {
    const r = await db.resolverRestaurante('0');
    tenantAtivo = r?.nome || null;
  } catch (err) {
    banco = err.message;
  }

  res.json({
    ok: !faltando.length && banco === 'ok',
    envFaltando: faltando,
    banco,
    tenantAtivo,
    modelo: process.env.OPENAI_MODEL || 'gpt-4o',
    // A versão fica exposta porque já custou tempo: o cliente do Supabase
    // precisa de Node 22+, e no container antigo a única pista era o erro de
    // WebSocket. Assim dá pra ver de fora qual imagem está rodando.
    node: process.version,
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Agente demo ouvindo na porta ${PORT}`);
  console.log(`Webhook: POST /webhook  ·  Saúde: GET /health`);
});
