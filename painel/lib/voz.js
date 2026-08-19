import axios from 'axios';

// Eleven v3 entende audio tags inline ([warm], [laughs], [sighs]) e pontuação
// como direção de atuação — é o que separa "voz humana" de "locutor de robô",
// e é justamente o momento em que o dono do restaurante levanta a sobrancelha.
const MODEL_ID = process.env.ELEVENLABS_MODEL || 'eleven_v3';

// A resposta de sucesso é binária (arraybuffer), então o corpo de ERRO chega
// binário também. Sem decodificar, sobra só "Request failed with status code
// 401" — que tanto pode ser chave errada quanto crédito acabado.
function erroElevenLabs(err) {
  const status = err.response?.status;
  let detalhe = err.message;
  let motivo = null;

  if (err.response?.data) {
    try {
      const json = JSON.parse(Buffer.from(err.response.data).toString('utf8'));
      motivo = json.detail?.status || null;
      detalhe = json.detail?.message || motivo || json.message || detalhe;
    } catch {
      /* corpo não era JSON legível — mantém a mensagem do axios */
    }
  }

  const semCota = motivo === 'quota_exceeded' || status === 429 || /quota/i.test(detalhe);
  if (semCota) detalhe = `créditos esgotados (${detalhe}). Recarregue em elevenlabs.io/app/usage.`;
  else if (status === 401) detalhe = `chave recusada (${detalhe}). Confira ELEVENLABS_API_KEY.`;

  const e = new Error(`ElevenLabs: ${detalhe}`);
  e.status = status;
  return e;
}

// Devolve null (em vez de estourar) quando não há chave configurada: o disparo
// segue com vídeo + texto. Áudio é o que dá o "uau", mas não pode ser o que
// impede a demo de acontecer.
export async function gerarAudioBase64(texto) {
  if (!process.env.ELEVENLABS_API_KEY || !process.env.ELEVENLABS_VOICE_ID) return null;

  try {
    const { data } = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVENLABS_VOICE_ID}`,
      {
        text: texto,
        model_id: MODEL_ID,
        language_code: 'pt',
        voice_settings: {
          stability: 0.5,          // v3 aceita só 0.0 / 0.5 / 1.0 — 0.5 é o "Natural"
          similarity_boost: 0.75,
          style: 0.45,
          use_speaker_boost: true,
          speed: 1.0,
        },
      },
      {
        headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, accept: 'audio/mpeg' },
        responseType: 'arraybuffer',
        timeout: 60_000,
      }
    );
    return Buffer.from(data).toString('base64');
  } catch (err) {
    throw erroElevenLabs(err);
  }
}
