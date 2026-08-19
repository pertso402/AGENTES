'use strict';

const axios = require('axios');
const { TOOLS, executarTool } = require('./ferramentas');
const { fmtBRL, avaliar, descreverFalta, rotuloPagamento } = require('./precos');

const openai = axios.create({
  baseURL: 'https://api.openai.com/v1',
  headers: { 'content-type': 'application/json' },
  timeout: 60_000,
});

const MODELO = process.env.OPENAI_MODEL || 'gpt-4o';
const MAX_ITERACOES = 6;

// ─── PROMPT ──────────────────────────────────────────────────────────────────
// Nada aqui é fixo por restaurante: persona, cardápio, taxa, PIX e horário vêm
// todos do tenant. É o que permite atender a Pizzaria do Léo hoje e a Doceria
// da Bia amanhã sem tocar numa linha de código.

function montarCardapio(produtos) {
  const categorias = {};
  for (const p of produtos) {
    const c = (p.categoria || 'Outros').trim();
    (categorias[c] = categorias[c] || []).push(p);
  }

  return Object.entries(categorias)
    .map(([cat, itens]) => {
      const linhas = itens.map((p) => {
        const preco = fmtBRL(p.preco_promocional ?? p.preco);
        return `- ${p.nome} — ${preco}${p.descricao ? ` (${p.descricao})` : ''}`;
      });
      return `*${cat}*\n${linhas.join('\n')}`;
    })
    .join('\n\n');
}

function promptSistema(restaurante, produtos) {
  const entrega = [
    restaurante.aceita_delivery
      ? `entrega com taxa fixa de ${fmtBRL(restaurante.taxa_entrega)}`
      : null,
    restaurante.aceita_retirada ? 'retirada no balcão (sem taxa)' : null,
  ].filter(Boolean).join(' e ');

  return `Você é ${restaurante.persona_nome} ${restaurante.persona_emoji}, o atendente virtual do ${restaurante.nome}${restaurante.descricao_negocio ? ` — ${restaurante.descricao_negocio}` : ''}.

## PERSONALIDADE
- Caloroso, simpático, ágil e objetivo. Português brasileiro natural, com leveza.
- Emojis com moderação. Trate o cliente pelo nome quando souber.
- Mensagens curtas (é WhatsApp). Conduza a conversa — não deixe o cliente perdido.
${restaurante.tom_de_voz ? `- Tom da casa: ${restaurante.tom_de_voz}\n` : ''}
## PRECISÃO ABSOLUTA (vem antes de todas as outras seções)
1. ⛔ VOCÊ NUNCA FAZ CONTA. Nem soma, nem multiplica, nem calcula total, subtotal, desconto ou troco. Todo valor que você escreve tem que ter vindo LITERALMENTE do retorno de uma tool nesta conversa, ou do cardápio abaixo.
2. ⛔ VOCÊ NUNCA MONTA O RESUMO DO PEDIDO. Quando salvar_dados_pedido retornar RESUMO_FINAL_TEXTO_EXATO, sua resposta é aquele texto copiado caractere por caractere. Não reescreva, não reformate, não acrescente saudação antes nem pergunta depois.
3. ⛔ NUNCA invente produto, preço, prazo, taxa ou promoção. Só existe o que está escrito aqui.
4. ⛔ Na dúvida sobre qualquer coisa — item, quantidade, valor, o que o cliente quis dizer — pergunte ao cliente. Nunca chute.

## FORMATAÇÃO (isto é WhatsApp, não um documento)
⛔ NUNCA use markdown de título (#, ##) nem listas numeradas — aparecem literais na tela do cliente.
✅ Use *asterisco* pra negrito, emoji como marcador e linhas curtas.

## CARDÁPIO (é tudo o que existe)
${montarCardapio(produtos)}

## COMO ATENDER
1. Cumprimente e pergunte o que a pessoa deseja hoje.
2. Se pedirem o cardápio, apresente os itens de forma apetitosa, agrupados, com os preços. Não despeje tudo sem contexto: destaque dois ou três e pergunte.
3. Assim que o cliente escolher, chame salvar_dados_pedido com os NOMES EXATOS do cardápio e CONFIRME de volta o item e o preço que o retorno trouxe, já emendando na próxima escolha. Ex: "Anotei: 1x Pizza Calabresa G — R$ 54,00 ✅ Quer uma bebida gelada pra acompanhar?"
4. O campo "itens" é a lista COMPLETA e substitui a anterior inteira. Para adicionar, reenvie os antigos + o novo.
5. Colete, nesta ordem, uma coisa por mensagem: itens → nome → ${entrega ? 'entrega ou retirada' : 'retirada'} → endereço (se entrega) → forma de pagamento → troco (se dinheiro).
6. 💵 SE FOR DINHEIRO, é OBRIGATÓRIO perguntar: "Precisa de troco pra quanto?" Se ele disser que tem o valor certo, salve troco_para = 0. Nunca calcule o troco — quem calcula é o sistema.
7. Se o cliente falar qualquer coisa fora dos campos normais ("sem cebola", "tocar a campainha", "interfone quebrado"), SALVE: no campo observacao do item, se for sobre um item; em observacao_geral, se for sobre o pedido. Isso vai direto pro painel da cozinha.
8. SEMPRE que coletar algo, chame salvar_dados_pedido. O retorno diz o que ainda falta.
9. Quando o retorno trouxer PRONTO_PARA_CONFIRMACAO, responda com o RESUMO_FINAL_TEXTO_EXATO copiado. Nada além disso.
10. Depois que o cliente responder SIM, o SISTEMA cria o pedido e avisa. Você não cria pedido e não diz que criou.

## COMO VENDER
- Preço nunca anda sozinho: sempre colado no que a pessoa ganha e numa pergunta.
  ❌ "A grande sai R$ 54,00."  ✅ "A Calabresa G sai *R$ 54* e vem com 8 fatias — dá pra dois. Prefere ela ou a Portuguesa?"
- Termine SEMPRE com uma pergunta de escolha fechada, que não dê pra responder só "sim" ou "não". A ÚNICA exceção é o RESUMO_FINAL_TEXTO_EXATO, que já termina pedindo o SIM.
- Quando houver itens no carrinho, sugira UM item específico que combina (uma bebida, uma sobremesa), com o preço colado. Um só, escolhido por você — não uma lista.
- ⛔ Não existe frete grátis, desconto extra, brinde ou combo além do que está escrito aqui. Prometer o que o sistema não cumpre é pior que perder a venda.

## A CASA
- ${restaurante.nome}${restaurante.endereco ? `, ${restaurante.endereco}` : ''}
- Atendimento: ${restaurante.horario_texto}
- ${entrega ? `Formas de receber: ${entrega}.` : 'Só retirada no balcão.'}
${restaurante.chave_pix ? `- Chave PIX: ${restaurante.chave_pix}${restaurante.pix_titular ? ` (titular ${restaurante.pix_titular}${restaurante.pix_banco ? `, ${restaurante.pix_banco}` : ''})` : ''}. Mande a chave junto com o nome do titular quando o pedido for confirmado no PIX — cliente que não reconhece o nome na tela do banco desiste de pagar.\n` : ''}
## COMUNICAÇÃO
Escreva para uma pessoa com fome, no celular. Uma ideia por mensagem, frases curtas, sem jargão e sem encher de confirmação ("Perfeito! Ótima escolha! Maravilha!"). Direto ao ponto, com simpatia.`;
}

// Estado do pedido + cupom entram como uma SEGUNDA mensagem de sistema, logo
// antes da fala do cliente: assim o modelo lê o que já foi coletado por último,
// e para de perguntar de novo coisas que o cliente já respondeu.
function contextoDinamico(rascunho, cupom, restaurante) {
  const partes = [];

  if (rascunho) {
    const itens = Array.isArray(rascunho.itens) ? rascunho.itens : [];
    const linhas = [
      itens.length && `- Itens: ${itens.map((i) => `${i.quantidade}x ${i.nome}`).join(', ')}`,
      rascunho.nome_cliente && `- Nome: ${rascunho.nome_cliente}`,
      rascunho.tipo_entrega && `- Entrega: ${rascunho.tipo_entrega}`,
      rascunho.endereco && `- Endereço: ${rascunho.endereco}`,
      rascunho.forma_pagamento && `- Pagamento: ${rotuloPagamento(rascunho.forma_pagamento)}`,
      rascunho.troco_para != null &&
        `- Troco para: ${Number(rascunho.troco_para) === 0 ? 'não precisa' : fmtBRL(rascunho.troco_para)}`,
    ].filter(Boolean);

    partes.push(`## ESTADO ATUAL DO PEDIDO (já coletado — NÃO pergunte de novo)\n${linhas.join('\n') || '- (vazio)'}`);

    const av = avaliar(rascunho, restaurante);
    partes.push(
      av.completo
        ? '✅ TUDO COLETADO. Se você ainda não recebeu o RESUMO_FINAL_TEXTO_EXATO nesta rodada, chame salvar_dados_pedido (pode ser sem nenhum campo) para recebê-lo, e responda com ele copiado.'
        : `⏳ AINDA FALTA: ${descreverFalta(av.faltando)}. Pergunte isso de forma natural, uma coisa de cada vez.`
    );
  }

  if (cupom) {
    partes.push(`## 🎟️ CUPOM ATIVO PRA ESTE CLIENTE
Ele recebeu a oferta com o cupom *${cupom.codigo}* (${cupom.desconto_percentual}% de desconto, válido até ${cupom.valido_ate}).
- O SISTEMA aplica o desconto AUTOMATICAMENTE no fechamento. Você NÃO precisa perguntar se ele quer usar, nem pedir o código.
- Pode mencionar de forma leve que o desconto já está garantido, sem repetir a cada mensagem.
- NUNCA calcule o desconto você mesmo, e nunca cite outro percentual: o valor aparece pronto no resumo.`);
  }

  return partes.join('\n\n');
}

// ─── LOOP DO MODELO ──────────────────────────────────────────────────────────

async function chamarModelo(mensagens) {
  const { data } = await openai.post(
    '/chat/completions',
    {
      model: MODELO,
      messages: mensagens,
      tools: TOOLS,
      tool_choice: 'auto',
      // Uma tool por vez: o rascunho é lido e reescrito a cada chamada, então
      // duas em paralelo se atropelariam no mesmo estado.
      parallel_tool_calls: false,
      max_tokens: 800,
    },
    { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` } }
  );
  return data.choices[0].message;
}

async function rodar({ texto, historico, restaurante, produtos, rascunho, cupom, telefone }) {
  const mensagens = [
    { role: 'system', content: promptSistema(restaurante, produtos) },
    { role: 'system', content: contextoDinamico(rascunho, cupom, restaurante) },
    ...historico,
    { role: 'user', content: texto },
  ];

  const ctx = { restaurante, produtos, telefone, cupom };

  for (let i = 0; i < MAX_ITERACOES; i++) {
    const resposta = await chamarModelo(mensagens);
    mensagens.push(resposta);

    if (!resposta.tool_calls?.length) {
      return { texto: (resposta.content || '').trim() };
    }

    for (const chamada of resposta.tool_calls) {
      let resultado;
      try {
        const args = JSON.parse(chamada.function.arguments || '{}');
        resultado = await executarTool(chamada.function.name, args, ctx);
      } catch (err) {
        // O erro volta como resultado da tool em vez de estourar: o modelo lê,
        // se desculpa e continua a conversa, em vez de o cliente ver silêncio.
        resultado = JSON.stringify({ erro: err.message });
      }
      mensagens.push({ role: 'tool', tool_call_id: chamada.id, content: resultado });
    }
  }

  // Chegou ao teto de iterações sem uma resposta de texto: melhor uma frase
  // honesta do que nada.
  return { texto: 'Me dá um segundinho... pode repetir o que você quer, por favor?' };
}

module.exports = { rodar, promptSistema, contextoDinamico };
