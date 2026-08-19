'use strict';

const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');
const { money } = require('./precos');

// Conexão criada na primeira consulta, não na importação. Com o createClient no
// topo do módulo, uma variável de ambiente ausente matava o processo na
// primeira linha — antes de o /health existir pra dizer QUAL variável faltava.
// O container reiniciava em laço e a única pista era um 502 mudo.
let conexao = null;

function sb() {
  if (!conexao) {
    if (!process.env.SUPA_URL || !process.env.SUPA_SERVICE_KEY) {
      throw new Error('Supabase não configurado: faltam SUPA_URL e/ou SUPA_SERVICE_KEY');
    }
    conexao = createClient(process.env.SUPA_URL, process.env.SUPA_SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      // O cliente monta um canal de realtime ao ser criado, e realtime exige
      // WebSocket — que só é nativo a partir do Node 22. Este agente nunca usa
      // realtime (quem usa é o painel, no navegador), mas sem uma implementação
      // aqui toda consulta ao banco falhava com "native WebSocket not found".
      // Entregar o `ws` explicitamente desacopla o agente da versão do Node:
      // funciona em 18, 20, 22 ou 24, seja qual for a que a hospedagem escolher.
      realtime: { transport: WebSocket },
    });
  }
  return conexao;
}

function limparTelefone(telefone) {
  return String(telefone || '').replace(/\D/g, '');
}

// ─── QUAL RESTAURANTE É ESTE? ────────────────────────────────────────────────
// Um número de WhatsApp só atende todas as demos, então a identidade vem da
// sessão aberta no disparo: telefone → restaurante. Se não houver sessão (o
// dono guardou o contato e voltou semanas depois, ou alguém escreveu do nada),
// cai no restaurante marcado como ativo, que é o da demo mais recente.
async function resolverRestaurante(telefone) {
  const tel = limparTelefone(telefone);

  const { data: sessao } = await sb()
    .from('demo_sessoes')
    .select('restaurante_id, expira_em')
    .eq('telefone', tel)
    .maybeSingle();

  if (sessao && new Date(sessao.expira_em) > new Date()) {
    const { data } = await sb().from('restaurantes').select('*').eq('id', sessao.restaurante_id).maybeSingle();
    if (data) return data;
  }

  const { data: ativo } = await sb()
    .from('restaurantes')
    .select('*')
    .eq('ativo', true)
    .eq('template', false)
    .maybeSingle();

  return ativo || null;
}

async function buscarProdutos(restauranteId) {
  const { data, error } = await sb()
    .from('produtos')
    .select('*')
    .eq('restaurante_id', restauranteId)
    .eq('disponivel', true)
    .order('categoria')
    .order('ordem');
  if (error) throw new Error(`db/buscarProdutos: ${error.message}`);
  return data || [];
}

// ─── HISTÓRICO ───────────────────────────────────────────────────────────────
// Busca as mais recentes (DESC) e só depois inverte. Pegar as PRIMEIRAS 16 de
// uma conversa longa faria o agente responder ao começo da conversa achando
// que era o agora.
async function carregarHistorico(restauranteId, telefone, limite = 16) {
  const { data, error } = await sb()
    .from('mensagens')
    .select('role, conteudo')
    .eq('restaurante_id', restauranteId)
    .eq('telefone', limparTelefone(telefone))
    .order('criado_em', { ascending: false })
    .limit(limite);
  if (error) throw new Error(`db/carregarHistorico: ${error.message}`);

  return (data || []).reverse().map((m) => ({ role: m.role, content: m.conteudo }));
}

async function salvarMensagem(restauranteId, telefone, role, conteudo) {
  const { error } = await sb().from('mensagens').insert({
    restaurante_id: restauranteId,
    telefone: limparTelefone(telefone),
    role,
    conteudo,
  });
  if (error) throw new Error(`db/salvarMensagem: ${error.message}`);
}

// ─── RASCUNHO ────────────────────────────────────────────────────────────────

async function carregarRascunho(restauranteId, telefone) {
  const { data } = await sb()
    .from('pedido_rascunho')
    .select('*')
    .eq('restaurante_id', restauranteId)
    .eq('telefone', limparTelefone(telefone))
    .maybeSingle();
  return data || null;
}

async function salvarRascunho(restauranteId, telefone, campos) {
  const { data, error } = await sb()
    .from('pedido_rascunho')
    .upsert(
      {
        restaurante_id: restauranteId,
        telefone: limparTelefone(telefone),
        ...campos,
        atualizado_em: new Date().toISOString(),
      },
      { onConflict: 'restaurante_id,telefone' }
    )
    .select()
    .single();
  if (error) throw new Error(`db/salvarRascunho: ${error.message}`);
  return data;
}

// Trava de corrida: só UM fluxo pode transformar o rascunho em pedido. Se o
// cliente mandar "sim" duas vezes seguidas (ou mandar "sim" e "isso" picados),
// a segunda tentativa encontra a etapa já mudada e não grava um pedido gêmeo.
async function tentarIniciarConfirmacao(restauranteId, telefone) {
  const { data } = await sb()
    .from('pedido_rascunho')
    .update({ etapa_atual: 'confirmando' })
    .eq('restaurante_id', restauranteId)
    .eq('telefone', limparTelefone(telefone))
    .eq('etapa_atual', 'aguardando_confirmacao')
    .select();

  return Array.isArray(data) && data.length === 1 ? data[0] : null;
}

async function limparRascunho(restauranteId, telefone) {
  await sb()
    .from('pedido_rascunho')
    .delete()
    .eq('restaurante_id', restauranteId)
    .eq('telefone', limparTelefone(telefone));
}

// ─── CLIENTE E CUPOM ─────────────────────────────────────────────────────────

async function garantirCliente(restauranteId, telefone, nome) {
  const tel = limparTelefone(telefone);

  const { data: existente } = await sb()
    .from('clientes')
    .select('*')
    .eq('restaurante_id', restauranteId)
    .eq('telefone', tel)
    .maybeSingle();

  if (existente) {
    // Não sobrescreve um nome real por "Cliente" — o disparo pode ter cadastrado
    // o nome certo antes de a conversa começar.
    if (nome && nome !== 'Cliente' && existente.nome !== nome) {
      await sb().from('clientes').update({ nome }).eq('id', existente.id);
      return { ...existente, nome };
    }
    return existente;
  }

  const { data, error } = await sb()
    .from('clientes')
    .insert({ restaurante_id: restauranteId, telefone: tel, nome: nome || 'Cliente' })
    .select()
    .single();
  if (error) throw new Error(`db/garantirCliente: ${error.message}`);
  return data;
}

// O cupom que o disparo acabou de criar. O cliente nunca digita o código: o
// agente já sabe que ele existe e aplica sozinho no fechamento.
async function buscarCupomAtivo(clienteId) {
  const hoje = new Date().toISOString().slice(0, 10);

  const { data } = await sb()
    .from('cupons')
    .select('*')
    .eq('cliente_id', clienteId)
    .eq('usado', false)
    .gte('valido_ate', hoje)
    .order('criado_em', { ascending: false })
    .limit(1)
    .maybeSingle();

  return data || null;
}

// ─── PEDIDO ──────────────────────────────────────────────────────────────────
// Grava o pedido inteiro. O número sequencial por restaurante é responsabilidade
// do trigger no banco, não daqui.
async function criarPedido({ restauranteId, cliente, rascunho, itens, totais, cupom }) {
  const { data: pedido, error } = await sb()
    .from('pedidos')
    .insert({
      restaurante_id: restauranteId,
      cliente_id: cliente.id,
      status: 'pendente',
      tipo_entrega: rascunho.tipo_entrega,
      endereco_entrega: rascunho.tipo_entrega === 'delivery' ? rascunho.endereco : null,
      forma_pagamento: rascunho.forma_pagamento,
      troco_para: rascunho.troco_para ?? null,
      subtotal: totais.subtotal,
      taxa_entrega: totais.taxaEntrega,
      desconto: totais.desconto,
      total: totais.total,
      cupom_id: totais.cupomAplicado?.id || null,
      observacao: rascunho.observacao || null,
      canal: 'whatsapp',
    })
    .select()
    .single();
  if (error) throw new Error(`db/criarPedido: ${error.message}`);

  const { error: errItens } = await sb().from('itens_pedido').insert(
    itens.map((i) => ({
      pedido_id: pedido.id,
      produto_id: i.produto_id,
      nome_produto: i.nome,
      quantidade: i.quantidade,
      preco_unitario: i.preco_unitario,
      total: i.total,
      observacao: i.observacao,
    }))
  );
  if (errItens) throw new Error(`db/criarItensPedido: ${errItens.message}`);

  // As três chamadas abaixo são melhor esforço: o pedido já existe e já está no
  // painel. Falhar aqui não pode desfazer uma venda.
  if (totais.cupomAplicado) {
    await sb()
      .from('cupons')
      .update({ usado: true, pedido_id: pedido.id })
      .eq('id', totais.cupomAplicado.id)
      .eq('usado', false)   // condição evita dar baixa duas vezes numa corrida
      .then(() => sb()
        .from('ofertas_enviadas')
        .update({ converteu: true, pedido_convertido_id: pedido.id })
        .eq('cupom_id', totais.cupomAplicado.id))
      .catch(() => {});
  }

  await sb()
    .from('clientes')
    .update({
      total_pedidos: (cliente.total_pedidos || 0) + 1,
      total_gasto: money((cliente.total_gasto || 0) + totais.total),
      ultimo_pedido: new Date().toISOString(),
      primeiro_pedido: cliente.primeiro_pedido || new Date().toISOString(),
    })
    .eq('id', cliente.id)
    .then(() => {})
    .catch(() => {});

  return pedido;
}

// ─── LOG ─────────────────────────────────────────────────────────────────────
// Nunca lança: um erro ao gravar log não pode derrubar um atendimento.
async function log(nivel, etapa, dados = {}) {
  try {
    await sb().from('agent_logs').insert({
      restaurante_id: dados.restauranteId || null,
      telefone: dados.telefone || null,
      nivel,
      etapa,
      mensagem: dados.mensagem || null,
      dados: dados.extra || null,
      erro_stack: dados.stack || null,
    });
  } catch {
    /* sem log é ruim; sem atendimento é pior */
  }
}

module.exports = {
  sb, limparTelefone, resolverRestaurante, buscarProdutos,
  carregarHistorico, salvarMensagem,
  carregarRascunho, salvarRascunho, limparRascunho, tentarIniciarConfirmacao,
  garantirCliente, buscarCupomAtivo, criarPedido, log,
};
