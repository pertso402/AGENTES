'use strict';

// ─── FONTE ÚNICA DA VERDADE DOS VALORES ──────────────────────────────────────
// Todo número que o cliente vê passa por aqui: o resumo do "confira seu pedido"
// e o pedido gravado no banco chamam a MESMA função. É o que torna impossível
// o resumo mostrar um total e o pedido registrar outro.
//
// A LLM não faz conta nenhuma. Ela coleta; este arquivo calcula.

function fmtBRL(v) {
  return `R$ ${Number(v || 0).toFixed(2).replace('.', ',')}`;
}

// Arredondamento monetário explícito — sem ele, 0.1 + 0.2 vira
// 0.30000000000000004 e aparece um centavo fantasma na diferença entre o
// resumo e o pedido.
function money(v) {
  return Math.round(Number(v || 0) * 100) / 100;
}

function normalizar(txt) {
  return String(txt || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim();
}

// Casa o que o cliente falou com o cardápio real. Exato primeiro; só depois
// aproximado, e apenas se houver UM candidato — duas pizzas parecidas casando
// por acaso viraria o item errado no pedido, que é pior que perguntar.
function acharProduto(nome, produtos) {
  const alvo = normalizar(nome);
  if (!alvo) return null;

  const exato = produtos.find((p) => normalizar(p.nome) === alvo);
  if (exato) return exato;

  const contendo = produtos.filter(
    (p) => normalizar(p.nome).includes(alvo) || alvo.includes(normalizar(p.nome))
  );
  return contendo.length === 1 ? contendo[0] : null;
}

// Repreça sempre a partir do catálogo fresco: o preço guardado no rascunho pode
// ter envelhecido durante a conversa (e, na demo, você pode ter editado o
// cardápio no painel enquanto o dono digitava).
function validarItens(itensBrutos, produtos) {
  const itens = [];
  const naoEncontrados = [];

  for (const bruto of Array.isArray(itensBrutos) ? itensBrutos : []) {
    const produto = acharProduto(bruto.nome, produtos);
    if (!produto) {
      naoEncontrados.push(bruto.nome);
      continue;
    }

    const quantidade = Math.max(1, Math.floor(Number(bruto.quantidade) || 1));
    const precoUnitario = money(produto.preco_promocional ?? produto.preco);

    itens.push({
      produto_id: produto.id,
      nome: produto.nome,
      quantidade,
      preco_unitario: precoUnitario,
      total: money(precoUnitario * quantidade),
      observacao: bruto.observacao || null,
    });
  }

  return { itens, naoEncontrados };
}

function subtotalDe(itens) {
  return money((itens || []).reduce((soma, i) => soma + Number(i.total || 0), 0));
}

// ─── PRECIFICAÇÃO ────────────────────────────────────────────────────────────
// O desconto do cupom incide só sobre os itens, nunca sobre a taxa de entrega —
// cobrir parte do frete com o desconto sairia do bolso do restaurante sem
// ninguém ter decidido isso.
function precificar({ itens, tipoEntrega, taxaEntregaConfig, cupom }) {
  const subtotal = subtotalDe(itens);
  const taxaEntrega = tipoEntrega === 'delivery' ? money(taxaEntregaConfig) : 0;

  const percentual = cupom && !cupom.usado ? Number(cupom.desconto_percentual || 0) : 0;
  const desconto = money(subtotal * (percentual / 100));

  return {
    subtotal,
    taxaEntrega,
    desconto,
    total: money(subtotal - desconto + taxaEntrega),
    cupomAplicado: percentual > 0 ? cupom : null,
  };
}

// ─── O QUE AINDA FALTA ───────────────────────────────────────────────────────
function avaliar(rascunho, restaurante) {
  const itens = Array.isArray(rascunho?.itens) ? rascunho.itens : [];
  const faltando = [];

  if (!itens.length) faltando.push('itens');
  if (!rascunho?.nome_cliente) faltando.push('nome');
  if (!rascunho?.tipo_entrega) faltando.push('entrega');
  if (rascunho?.tipo_entrega === 'delivery' && !rascunho?.endereco) faltando.push('endereco');
  if (!rascunho?.forma_pagamento) faltando.push('pagamento');
  // Troco 0 é resposta válida ("tenho o valor certo"), por isso o teste é
  // contra null e não contra "valor falsy".
  if (rascunho?.forma_pagamento === 'dinheiro' && rascunho?.troco_para == null) faltando.push('troco');

  return { completo: faltando.length === 0, faltando };
}

const DESCRICAO_FALTA = {
  itens: 'o que ele quer pedir',
  nome: 'o nome dele',
  entrega: 'se é entrega ou retirada',
  endereco: 'o endereço completo',
  pagamento: 'a forma de pagamento (PIX, dinheiro ou cartão)',
  troco: 'se precisa de troco e pra quanto',
};

function descreverFalta(faltando) {
  return (faltando || []).map((f) => DESCRICAO_FALTA[f] || f).join(', ');
}

// ─── RESUMO FINAL ────────────────────────────────────────────────────────────
// Renderizado por CÓDIGO e copiado pela LLM letra por letra. Deixar o modelo
// escrever esse texto foi, no sistema original, exatamente como um cliente viu
// um valor no resumo e outro no pedido confirmado.
function montarResumo({ itens, rascunho, totais, restaurante }) {
  const linhas = ['🧾 *Confira seu pedido*', ''];

  for (const i of itens) {
    linhas.push(`${i.quantidade}x ${i.nome} — ${fmtBRL(i.total)}`);
    if (i.observacao) linhas.push(`   ↳ _${i.observacao}_`);
  }

  linhas.push('');
  linhas.push(`Subtotal: ${fmtBRL(totais.subtotal)}`);
  if (totais.desconto > 0) {
    linhas.push(`Desconto (${totais.cupomAplicado.desconto_percentual}% · ${totais.cupomAplicado.codigo}): − ${fmtBRL(totais.desconto)}`);
  }
  if (rascunho.tipo_entrega === 'delivery') {
    linhas.push(`Entrega: ${fmtBRL(totais.taxaEntrega)}`);
  }
  linhas.push(`*Total: ${fmtBRL(totais.total)}*`);
  linhas.push('');

  linhas.push(rascunho.tipo_entrega === 'delivery' ? `📍 Entrega em: ${rascunho.endereco}` : '🏃 Retirada no balcão');
  linhas.push(`💳 Pagamento: ${rotuloPagamento(rascunho.forma_pagamento)}`);

  if (rascunho.forma_pagamento === 'dinheiro' && rascunho.troco_para != null) {
    linhas.push(
      Number(rascunho.troco_para) === 0
        ? '💵 Sem troco (valor certo)'
        : `💵 Troco para ${fmtBRL(rascunho.troco_para)} — levo ${fmtBRL(money(rascunho.troco_para - totais.total))}`
    );
  }

  if (rascunho.observacao) linhas.push(`📝 ${rascunho.observacao}`);

  linhas.push('');
  linhas.push('Está tudo certo? Responde *SIM* que eu já mando pra cozinha 👨‍🍳');

  return linhas.join('\n');
}

function rotuloPagamento(forma) {
  return { pix: 'PIX', dinheiro: 'Dinheiro', cartao: 'Cartão na entrega' }[forma] || forma || '';
}

module.exports = {
  fmtBRL, money, normalizar, acharProduto, validarItens, subtotalDe,
  precificar, avaliar, descreverFalta, montarResumo, rotuloPagamento,
};
