import axios from 'axios';

const client = axios.create({
  baseURL: 'https://api.openai.com/v1',
  headers: { 'content-type': 'application/json' },
  timeout: 60_000,
});

// O servidor roda em UTC. `new Date().getHours()` sozinho leria 13h de São
// Paulo como 16h e a copy sairia falando de jantar no meio do almoço.
function horaSaoPauloAgora() {
  return Number(
    new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false,
    }).format(new Date())
  );
}

const MOMENTOS = [
  { ate: 11, nome: 'manhã — dia começando, já pensando no que vai comer mais tarde',
    dores: 'correria do início do dia / indecisão sobre o que comer mais tarde' },
  { ate: 15, nome: 'horário de almoço — decisão de última hora, fome batendo, sem paciência pra cozinhar',
    dores: 'fome forte batendo agora / falta de tempo pra cozinhar / indecisão do que pedir' },
  { ate: 18, nome: 'meio da tarde — aquele cansaço e tédio que dá vontade de beliscar algo bom',
    dores: 'cansaço da tarde / vontade de comer algo gostoso sem fazer esforço' },
  { ate: 22, nome: 'fim do dia — chegando cansado, sem vontade nenhuma de cozinhar ou decidir o que jantar',
    dores: 'chegar cansado do trabalho / não ter vontade de cozinhar ou decidir o jantar' },
  { ate: 24, nome: 'tarde da noite — bateu a fome de quem não jantou direito e só quer resolver rápido',
    dores: 'fome de quem não jantou direito / vontade de resolver rápido sem esforço' },
];

function momentoDoDia(hora) {
  return MOMENTOS.find((m) => hora < m.ate) || MOMENTOS[1];
}

function erroOpenAI(err) {
  const status = err.response?.status;
  const resp = err.response?.data?.error;
  let detalhe = resp?.message || err.message;

  if (status === 429) {
    detalhe = resp?.code === 'insufficient_quota'
      ? `créditos da conta esgotados (${detalhe}). Confira o billing em platform.openai.com.`
      : `limite de requisições atingido (${detalhe}). Espere alguns segundos e tente de novo.`;
  }
  if (status === 401) detalhe = `chave recusada (${detalhe}). Confira OPENAI_API_KEY.`;

  const e = new Error(`OpenAI (copy): ${detalhe}`);
  e.status = status;
  return e;
}

// ─── GERAÇÃO DA OFERTA ───────────────────────────────────────────────────────
// Tudo que identifica o negócio vem do tenant (`restaurante`) e do produto —
// nada é fixo no código. É isso que permite trocar do lead X pro Y sem tocar
// numa linha.
export async function gerarOferta({ restaurante, produto, cliente: pessoa, cupom }) {
  const hora = horaSaoPauloAgora();
  const momento = momentoDoDia(hora);
  const nomePessoa = pessoa?.nome && pessoa.nome !== 'Cliente' ? pessoa.nome : null;

  const prompt = `Você escreve o roteiro de um ÁUDIO de WhatsApp (a pessoa vai OUVIR, não ler) de um
negócio de comida, para reativar um cliente. Também escreve um TEXTO curtíssimo que acompanha o
vídeo/foto do prato.

## O NEGÓCIO (use exatamente estes dados, não invente outros)
- Nome: ${restaurante.nome}
- Tipo: ${restaurante.nicho}${restaurante.descricao_negocio ? ` — ${restaurante.descricao_negocio}` : ''}
- Quem fala no áudio: ${restaurante.persona_nome}, do atendimento do ${restaurante.nome}
${restaurante.tom_de_voz ? `- Tom desejado: ${restaurante.tom_de_voz}` : ''}

## A PESSOA
- Nome: ${nomePessoa || '(não sabemos o nome — não invente, fale sem citar nome)'}
- Último pedido dela: ${produto.nome}${produto.descricao ? ` (${produto.descricao})` : ''}
- Momento atual: ${momento.nome}
- Dores prováveis nesse horário: ${momento.dores}

## A OFERTA
- Cupom ${cupom.codigo}, ${cupom.desconto_percentual}% de desconto, válido até ${cupom.valido_ate}.

## TAMANHO (a regra mais importante depois da veracidade)
O áudio TEM QUE caber em 20 a 25 segundos falados — no máximo 400 caracteres, contando tudo.
No WhatsApp a duração aparece no balão antes de a pessoa tocar play: um "0:45" de um número que ela
não reconhece é adiado, e áudio adiado nunca é ouvido. Um "0:22" ela ouve na hora.
Escreva 3 ou 4 frases. Se passar disso, corte — não resuma no fim, corte de verdade.

## ESTRUTURA DO ÁUDIO (problema → solução, como gente puxando papo)
1. Abre dizendo o nome dela e de onde você fala, numa frase só. Varie a abertura entre gerações.
2. Nomeia, em meia frase, um problema real e provável pro momento acima. Não invente detalhes da vida dela.
3. Descreve ${produto.nome} de forma apetitosa e sensorial (sabor, textura, aroma) como a saída óbvia.
4. Fecha citando o cupom como dica de amigo, não como código de robô.

Tom: humano, caloroso, conversa de gente normal. Frases curtas, linguagem falada ("tá", "pra", "né").

## COMO ESCREVER PRO ÁUDIO SOAR HUMANO
O texto é lido por um motor de voz (ElevenLabs v3) que interpreta marcações de atuação e pontuação:
- No máximo 2 audio tags no total, sempre ANTES da frase que elas afetam. Úteis: [warm] [friendly]
  [thoughtful] [excited] [curious] [reassuring].
- Reticências (...) viram silêncio de verdade no áudio: no máximo uma no roteiro inteiro, e só onde a
  pausa fizer diferença. Vírgulas dão o respiro natural sem custar tempo.
- Uma hesitação natural ("ó", "olha", "então", "sabe?") no máximo — é o que quebra a sensação de locutor,
  mas em excesso vira enrolação paga por segundo.
- NÃO use emoji no áudio (o motor engasga). Emoji só no CTA.
- Escreva o cupom normal (ex: "${cupom.codigo}"), nunca letra por letra.

## PROIBIDO (ou variações próximas)
- "sentimos sua falta" / "matar a saudade" / "há quanto tempo" / "faz tempo que você não..."
- qualquer coisa que soe como lembrete de CRM ou script de vendas
- inventar prazo, frete grátis, brinde ou promoção que não esteja escrito aqui

Retorne um único objeto JSON PLANO com exatamente duas chaves:
"audio": o roteiro completo com as audio tags e pausas, sem emoji.
"cta": uma linha de no máximo 12 palavras, só a chamada pra ação (cupom + urgência). Vai como legenda
do vídeo, é texto puro: sem audio tags, pode ter emoji.`;

  let data;
  try {
    ({ data } = await client.post(
      '/chat/completions',
      {
        model: process.env.OPENAI_MODEL || 'gpt-4o',
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'oferta_whatsapp',
            strict: true,
            schema: {
              type: 'object',
              properties: { audio: { type: 'string' }, cta: { type: 'string' } },
              required: ['audio', 'cta'],
              additionalProperties: false,
            },
          },
        },
      },
      { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` } }
    ));
  } catch (err) {
    throw erroOpenAI(err);
  }

  const resultado = JSON.parse(data.choices[0].message.content);

  // O CTA é texto que a pessoa LÊ. Se o modelo escorregar e deixar uma audio
  // tag ali, ela apareceria como "[warm]" literal na legenda do vídeo.
  const cta = String(resultado.cta || '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return { audio: limparTags(String(resultado.audio || '')), cta };
}

// Tags que o eleven_v3 reconhece como direção de atuação. Qualquer outra coisa
// entre colchetes é risco de virar fala: uma tag inventada pelo modelo pode ser
// LIDA em voz alta ("colchete easygoing") no meio da oferta, na frente do lead.
// O prompt já pede pra usar só estas — isto aqui é a rede embaixo do prompt,
// porque instrução de prompt o modelo contorna e código não.
const TAGS_PERMITIDAS = new Set([
  'warm', 'friendly', 'thoughtful', 'excited', 'curious', 'reassuring',
  'laughs', 'sighs', 'whispers', 'happy', 'calm', 'sad', 'serious', 'sarcastic',
]);

function limparTags(texto) {
  return texto
    .replace(/\[([^\]]*)\]/g, (tagInteira, conteudo) =>
      (TAGS_PERMITIDAS.has(conteudo.trim().toLowerCase()) ? tagInteira : ''))
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
