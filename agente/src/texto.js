'use strict';

// ─── DETECÇÃO DE "SIM" ───────────────────────────────────────────────────────
// Fica separado do servidor de propósito: é a função que decide se um pedido
// vira realidade, e uma função assim precisa poder ser testada sem subir
// Express, banco nem WhatsApp.

const CONFIRMACOES = new Set([
  'sim', 's', 'ss', 'isso', 'isso mesmo', 'confirmo', 'confirmado', 'ok', 'okay', 'blz',
  'beleza', 'pode', 'pode ser', 'pode mandar', 'certo', 'ta certo', 'tá certo', 'perfeito',
  'fechado', 'fechou', 'bora', 'manda', 'pode fazer', 'tudo certo', 'positivo', 'aham', 'uhum',
]);

// Uma ressalva dentro do "sim" muda tudo: "sim, mas tira a cebola" NÃO é
// confirmação — é pedido de alteração, e gravar o pedido ali seria gravar errado.
const RESSALVA = /\b(mas|so que|só que|so quero|quero mudar|muda|troca|corrige|corrigir|errado|espera|pera|calma|antes|na verdade|ainda nao|ainda não|primeiro)\b/i;

function ehConfirmacao(texto) {
  const limpo = String(texto || '')
    .toLowerCase()
    .replace(/[!.,;:]/g, '')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!limpo || RESSALVA.test(limpo)) return false;
  if (CONFIRMACOES.has(limpo)) return true;

  // Frases curtas que COMEÇAM com confirmação ("sim pode mandar") também valem.
  // O limite de tamanho evita que um texto longo qualquer iniciado por "ok"
  // seja lido como fechamento de pedido.
  return limpo.length <= 25 && [...CONFIRMACOES].some((c) => limpo.startsWith(`${c} `));
}

module.exports = { ehConfirmacao, CONFIRMACOES, RESSALVA };
