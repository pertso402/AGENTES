'use strict';

const axios = require('axios');
const FormData = require('form-data');

const http = axios.create({
  baseURL: process.env.EVOLUTION_URL,
  headers: { apikey: process.env.EVOLUTION_KEY },
  timeout: 30_000,
});

// O nome da instância pode ter espaço e maiúscula ("Chapela - atendimento").
const INSTANCIA = encodeURIComponent(process.env.EVOLUTION_INSTANCE || '');

function erroEvolution(err, acao) {
  const resp = err.response?.data;
  const detalhe = resp?.response?.message
    ? JSON.stringify(resp.response.message)
    : resp?.message || resp?.error || err.message;
  const e = new Error(`Evolution (${acao}): ${detalhe}`);
  e.status = err.response?.status;
  return e;
}

async function enviarTexto(telefone, texto) {
  try {
    const { data } = await http.post(`/message/sendText/${INSTANCIA}`, {
      number: String(telefone).replace(/\D/g, ''),
      text: texto,
    });
    return data;
  } catch (err) {
    throw erroEvolution(err, 'enviarTexto');
  }
}

// "Digitando..." antes de responder. Não é enfeite: sem isso a resposta da IA
// chega instantânea demais e denuncia o robô — com ela, o ritmo parece humano.
async function mostrarDigitando(telefone, ms = 1800) {
  try {
    await http.post(`/chat/sendPresence/${INSTANCIA}`, {
      number: String(telefone).replace(/\D/g, ''),
      presence: 'composing',
      delay: ms,
    });
  } catch {
    /* presença é cosmética — nunca deve impedir a resposta */
  }
}

// O webhook entrega o áudio como referência, não como arquivo. Isto busca o
// conteúdo em base64 para mandar ao Whisper.
async function baixarMidiaBase64(mensagem) {
  try {
    const { data } = await http.post(`/chat/getBase64FromMediaMessage/${INSTANCIA}`, {
      message: { key: mensagem.key },
      convertToMp4: false,
    });
    return data?.base64 || null;
  } catch (err) {
    throw erroEvolution(err, 'baixarMidia');
  }
}

// ─── TRANSCRIÇÃO ─────────────────────────────────────────────────────────────
// O dono do restaurante quase sempre responde por áudio na demo — é o jeito
// natural de quem está com as mãos ocupadas. Sem isso, a demo morre na
// primeira resposta.
async function transcreverAudio(base64) {
  if (!base64) return null;

  const form = new FormData();
  form.append('file', Buffer.from(base64, 'base64'), {
    filename: 'audio.ogg',
    contentType: 'audio/ogg',
  });
  form.append('model', process.env.OPENAI_MODEL_AUDIO || 'whisper-1');
  form.append('language', 'pt');

  try {
    const { data } = await axios.post('https://api.openai.com/v1/audio/transcriptions', form, {
      headers: { ...form.getHeaders(), Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      timeout: 60_000,
    });
    return (data?.text || '').trim() || null;
  } catch (err) {
    const detalhe = err.response?.data?.error?.message || err.message;
    throw new Error(`Whisper: ${detalhe}`);
  }
}

module.exports = { enviarTexto, mostrarDigitando, baixarMidiaBase64, transcreverAudio };
