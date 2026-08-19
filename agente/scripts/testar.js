'use strict';

// Testes da lógica que decide dinheiro e fecha pedido. Roda sem banco, sem
// WhatsApp e sem OpenAI de propósito: é justamente a parte que não pode
// depender de nada externo pra estar certa.
//
//   npm test

const assert = require('node:assert/strict');
const {
  validarItens, precificar, avaliar, descreverFalta, montarResumo, fmtBRL,
} = require('../src/precos');
const { ehConfirmacao } = require('../src/texto');

let passou = 0;
function teste(nome, fn) {
  try {
    fn();
    passou++;
    console.log(`  ok  ${nome}`);
  } catch (err) {
    console.error(`  FALHOU  ${nome}\n        ${err.message}`);
    process.exitCode = 1;
  }
}

const PRODUTOS = [
  { id: 'p1', nome: 'Pizza Calabresa G', preco: 54.9, categoria: 'Pizzas' },
  { id: 'p2', nome: 'Pizza Mussarela G', preco: 49.9, categoria: 'Pizzas' },
  { id: 'p3', nome: 'Coca-Cola 2L', preco: 14.9, preco_promocional: 12.9, categoria: 'Bebidas' },
];

const RESTAURANTE = { taxa_entrega: 8, aceita_delivery: true, aceita_retirada: true };

console.log('\nPreços e itens');

teste('casa o nome exato do cardápio', () => {
  const { itens, naoEncontrados } = validarItens([{ nome: 'Pizza Calabresa G', quantidade: 2 }], PRODUTOS);
  assert.equal(naoEncontrados.length, 0);
  assert.equal(itens[0].preco_unitario, 54.9);
  assert.equal(itens[0].total, 109.8);
});

teste('casa nome parcial quando só existe um candidato', () => {
  const { itens } = validarItens([{ nome: 'calabresa', quantidade: 1 }], PRODUTOS);
  assert.equal(itens[0].nome, 'Pizza Calabresa G');
});

teste('recusa nome ambíguo em vez de chutar', () => {
  const { itens, naoEncontrados } = validarItens([{ nome: 'pizza', quantidade: 1 }], PRODUTOS);
  assert.equal(itens.length, 0);
  assert.deepEqual(naoEncontrados, ['pizza']);
});

teste('usa o preço promocional quando existe', () => {
  const { itens } = validarItens([{ nome: 'Coca-Cola 2L', quantidade: 1 }], PRODUTOS);
  assert.equal(itens[0].preco_unitario, 12.9);
});

teste('quantidade nunca fica menor que 1', () => {
  const { itens } = validarItens([{ nome: 'Coca-Cola 2L', quantidade: 0 }], PRODUTOS);
  assert.equal(itens[0].quantidade, 1);
});

console.log('\nPrecificação');

const { itens: cesta } = validarItens(
  [{ nome: 'Pizza Calabresa G', quantidade: 1 }, { nome: 'Coca-Cola 2L', quantidade: 1 }],
  PRODUTOS
);

teste('desconto incide sobre os itens, nunca sobre a taxa', () => {
  const t = precificar({
    itens: cesta,
    tipoEntrega: 'delivery',
    taxaEntregaConfig: 8,
    cupom: { id: 'c1', codigo: 'BORA42', desconto_percentual: 15, usado: false },
  });
  assert.equal(t.subtotal, 67.8);          // 54.90 + 12.90
  assert.equal(t.desconto, 10.17);         // 15% de 67.80
  assert.equal(t.taxaEntrega, 8);
  assert.equal(t.total, 65.63);            // 67.80 − 10.17 + 8.00
});

teste('retirada não cobra taxa', () => {
  const t = precificar({ itens: cesta, tipoEntrega: 'retirada', taxaEntregaConfig: 8, cupom: null });
  assert.equal(t.taxaEntrega, 0);
  assert.equal(t.total, 67.8);
});

teste('cupom já usado não desconta nada', () => {
  const t = precificar({
    itens: cesta,
    tipoEntrega: 'retirada',
    taxaEntregaConfig: 8,
    cupom: { id: 'c1', codigo: 'BORA42', desconto_percentual: 15, usado: true },
  });
  assert.equal(t.desconto, 0);
  assert.equal(t.total, 67.8);
});

teste('não sobra centavo fantasma no arredondamento', () => {
  const t = precificar({
    itens: [{ total: 0.1 }, { total: 0.2 }],
    tipoEntrega: 'retirada',
    taxaEntregaConfig: 0,
    cupom: null,
  });
  assert.equal(t.subtotal, 0.3);
});

console.log('\nO que falta coletar');

teste('pedido vazio pede tudo', () => {
  const av = avaliar({ itens: [] }, RESTAURANTE);
  assert.equal(av.completo, false);
  assert.ok(av.faltando.includes('itens'));
});

teste('dinheiro sem troco definido não está completo', () => {
  const av = avaliar(
    { itens: cesta, nome_cliente: 'Léo', tipo_entrega: 'retirada', forma_pagamento: 'dinheiro' },
    RESTAURANTE
  );
  assert.equal(av.completo, false);
  assert.ok(av.faltando.includes('troco'));
});

teste('troco zero é resposta válida, não campo vazio', () => {
  const av = avaliar(
    { itens: cesta, nome_cliente: 'Léo', tipo_entrega: 'retirada', forma_pagamento: 'dinheiro', troco_para: 0 },
    RESTAURANTE
  );
  assert.equal(av.completo, true);
});

teste('delivery sem endereço não está completo', () => {
  const av = avaliar(
    { itens: cesta, nome_cliente: 'Léo', tipo_entrega: 'delivery', forma_pagamento: 'pix' },
    RESTAURANTE
  );
  assert.ok(av.faltando.includes('endereco'));
  assert.ok(descreverFalta(av.faltando).includes('endereço'));
});

console.log('\nResumo final');

teste('o resumo mostra exatamente os totais calculados', () => {
  const rascunho = {
    itens: cesta, nome_cliente: 'Léo', tipo_entrega: 'delivery',
    endereco: 'Rua A, 100', forma_pagamento: 'dinheiro', troco_para: 100,
  };
  const totais = precificar({
    itens: cesta,
    tipoEntrega: 'delivery',
    taxaEntregaConfig: 8,
    cupom: { id: 'c1', codigo: 'BORA42', desconto_percentual: 15, usado: false },
  });
  const texto = montarResumo({ itens: cesta, rascunho, totais, restaurante: RESTAURANTE });

  assert.ok(texto.includes(fmtBRL(totais.total)), 'total precisa aparecer no resumo');
  assert.ok(texto.includes('BORA42'), 'cupom precisa aparecer');
  assert.ok(texto.includes(fmtBRL(34.37)), 'troco de R$ 100 − R$ 65,63');
  assert.ok(texto.includes('SIM'), 'precisa pedir a confirmação');
});

console.log('\nDetecção de confirmação');

for (const frase of ['sim', 'Sim!', 'isso mesmo', 'pode mandar', 'ok pode mandar', 'Perfeito.', 'fechou 👍']) {
  teste(`"${frase}" confirma`, () => assert.equal(ehConfirmacao(frase), true));
}

for (const frase of [
  'sim, mas tira a cebola',
  'não',
  'espera',
  'ok mas antes quero mudar o endereço',
  'sim quero adicionar uma coca também por favor obrigado',
  '',
]) {
  teste(`"${frase}" NÃO confirma`, () => assert.equal(ehConfirmacao(frase), false));
}

console.log(`\n${passou} testes passaram${process.exitCode ? ' (com falhas acima)' : ''}\n`);
