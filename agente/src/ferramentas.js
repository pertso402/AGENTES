'use strict';

const db = require('./db');
const {
  fmtBRL, validarItens, precificar, avaliar, descreverFalta, montarResumo, subtotalDe,
} = require('./precos');

// Uma tool só, de propósito. O cardápio da demo tem 7 itens e vai inteiro no
// prompt — buscar cardápio por tool seria uma ida e volta a mais ao modelo em
// cima de uma informação que cabe no contexto, e cada ida e volta é mais um
// segundo de silêncio na frente do dono do restaurante.
const DEFINICOES = [
  {
    name: 'salvar_dados_pedido',
    description:
      'Salva ou atualiza o pedido em andamento. Chame SEMPRE que o cliente informar qualquer coisa ' +
      '(itens, nome, entrega, endereço, pagamento, troco, observação) — pode ser um campo só. ' +
      'Pode chamar sem nenhum campo apenas para consultar o estado. O retorno diz o que ainda falta e, ' +
      'quando tudo estiver completo, entrega o RESUMO_FINAL_TEXTO_EXATO já pronto para você copiar.',
    parameters: {
      type: 'object',
      properties: {
        nome_cliente: { type: 'string', description: 'Nome do cliente' },
        itens: {
          type: 'array',
          description:
            'Lista COMPLETA dos itens (substitui a anterior inteira, não é acréscimo). ' +
            'Para adicionar um item, reenvie os antigos junto com o novo. Use os NOMES EXATOS do cardápio.',
          items: {
            type: 'object',
            properties: {
              nome: { type: 'string' },
              quantidade: { type: 'number' },
              observacao: { type: 'string', description: 'Pedido específico deste item (ex: "sem cebola")' },
            },
            required: ['nome', 'quantidade'],
          },
        },
        tipo_entrega: { type: 'string', enum: ['delivery', 'retirada'] },
        endereco: { type: 'string', description: 'Endereço completo (só se delivery)' },
        forma_pagamento: { type: 'string', enum: ['pix', 'dinheiro', 'cartao'] },
        troco_para: {
          type: 'number',
          description:
            'SÓ quando o pagamento for dinheiro. É a nota com que o cliente vai pagar (100 se ele disser ' +
            '"troco pra 100"). Se ele disser que tem o valor certo, envie 0. NUNCA envie o troco calculado.',
        },
        observacao_geral: {
          type: 'string',
          description: 'Observação do pedido todo (ex: "tocar a campainha", "apartamento 302"). Vai pro painel da cozinha.',
        },
      },
      required: [],
    },
  },
];

const TOOLS = DEFINICOES.map((d) => ({ type: 'function', function: d }));

async function executarTool(nome, args, ctx) {
  if (nome !== 'salvar_dados_pedido') throw new Error(`Tool desconhecida: ${nome}`);

  const { restaurante, produtos, telefone, cupom } = ctx;
  const campos = {};
  let naoEncontrados = [];

  if (args.nome_cliente) campos.nome_cliente = args.nome_cliente;
  if (args.tipo_entrega) campos.tipo_entrega = args.tipo_entrega;
  if (args.endereco) campos.endereco = args.endereco;
  if (args.forma_pagamento) campos.forma_pagamento = args.forma_pagamento;
  if (args.observacao_geral) campos.observacao = args.observacao_geral;
  if (args.troco_para != null) campos.troco_para = Math.max(0, Number(args.troco_para) || 0);

  if (args.itens) {
    // Os itens são revalidados contra o cardápio real e reprecificados aqui.
    // O preço nunca vem do que a LLM escreveu.
    const validado = validarItens(args.itens, produtos);
    campos.itens = validado.itens;
    naoEncontrados = validado.naoEncontrados;
  }

  let rascunho;
  if (Object.keys(campos).length) {
    rascunho = await db.salvarRascunho(restaurante.id, telefone, campos);
  } else {
    rascunho = (await db.carregarRascunho(restaurante.id, telefone))
      || (await db.salvarRascunho(restaurante.id, telefone, {}));
  }

  const itens = Array.isArray(rascunho.itens) ? rascunho.itens : [];
  const avaliacao = avaliar(rascunho, restaurante);

  const resposta = {
    salvo: true,
    itens: itens.map((i) => `${i.quantidade}x ${i.nome}${i.observacao ? ` (${i.observacao})` : ''} — ${fmtBRL(i.preco_unitario)} cada`),
    nome: rascunho.nome_cliente || null,
    tipo_entrega: rascunho.tipo_entrega || null,
    endereco: rascunho.endereco || null,
    forma_pagamento: rascunho.forma_pagamento || null,
    observacao_geral: rascunho.observacao || null,
    troco_para: rascunho.troco_para == null
      ? null
      : (Number(rascunho.troco_para) === 0 ? 'não precisa de troco' : fmtBRL(rascunho.troco_para)),
  };

  if (naoEncontrados.length) {
    resposta.ATENCAO_itens_nao_encontrados = naoEncontrados;
    resposta.instrucao =
      `Estes itens não existem no cardápio: ${naoEncontrados.join(', ')}. ` +
      'Confirme o nome certo com o cliente — não substitua por outro parecido por conta própria.';
  }

  // Munição de venda já calculada: o agente recebe o número pronto em vez de
  // somar. Sem taxa de propósito — ela ainda não faz parte da conta nesta hora.
  if (itens.length && !avaliacao.completo) {
    resposta.subtotal_ate_agora_sem_taxa = fmtBRL(subtotalDe(itens));
  }

  if (!avaliacao.completo) {
    resposta.status = 'FALTA_COLETAR';
    resposta.falta = descreverFalta(avaliacao.faltando);
    resposta.instrucao_final =
      `Ainda falta: ${descreverFalta(avaliacao.faltando)}. Pergunte de forma natural, UMA coisa de cada vez. ` +
      'Não apresente resumo nem total agora.';
    return JSON.stringify(resposta);
  }

  // Tudo coletado: o SISTEMA calcula e RENDERIZA. A mesma função roda de novo
  // quando o cliente disser SIM, então resumo e pedido não podem divergir.
  const totais = precificar({
    itens,
    tipoEntrega: rascunho.tipo_entrega,
    taxaEntregaConfig: restaurante.taxa_entrega,
    cupom,
  });

  await db.salvarRascunho(restaurante.id, telefone, {
    etapa_atual: 'aguardando_confirmacao',
    total_confirmado: totais.total,
  });

  resposta.status = 'PRONTO_PARA_CONFIRMACAO';
  resposta.subtotal = fmtBRL(totais.subtotal);
  resposta.desconto = fmtBRL(totais.desconto);
  resposta.taxa_entrega = fmtBRL(totais.taxaEntrega);
  resposta.total = fmtBRL(totais.total);
  resposta.RESUMO_FINAL_TEXTO_EXATO = montarResumo({ itens, rascunho, totais, restaurante });
  resposta.instrucao_final =
    'ENVIE O CAMPO RESUMO_FINAL_TEXTO_EXATO COMO SUA RESPOSTA, LETRA POR LETRA, SEM REESCREVER, ' +
    'SEM RECALCULAR NENHUM VALOR, SEM ACRESCENTAR NEM REMOVER LINHAS. Não escreva nada antes nem depois. ' +
    'O SISTEMA cria o pedido quando o cliente responder SIM — você NÃO cria.';

  return JSON.stringify(resposta);
}

module.exports = { TOOLS, executarTool };
