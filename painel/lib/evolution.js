import axios from 'axios';
import { normalizarTelefone } from './formato';

// Uma instância só: o mesmo número dispara a oferta e faz o atendimento, pra
// o dono receber e responder no mesmo chat. Isso é o que faz a demo parecer
// um produto, e não duas ferramentas amarradas com barbante.
function cliente() {
  if (!process.env.EVOLUTION_URL || !process.env.EVOLUTION_KEY || !process.env.EVOLUTION_INSTANCE) {
    throw new Error('Evolution não configurada: faltam EVOLUTION_URL, EVOLUTION_KEY ou EVOLUTION_INSTANCE.');
  }
  return {
    http: axios.create({
      baseURL: process.env.EVOLUTION_URL,
      headers: { apikey: process.env.EVOLUTION_KEY },
      timeout: 30_000,
    }),
    // O nome da instância pode ter espaço/maiúscula; o encode evita URL quebrada.
    instancia: encodeURIComponent(process.env.EVOLUTION_INSTANCE),
  };
}

// Transforma o erro cru do axios ("Request failed with status code 400") no que
// a Evolution realmente respondeu — senão fica impossível saber, no meio de uma
// demo, se o problema foi número inválido, instância caída ou payload recusado.
function erroEvolution(err, acao) {
  const resp = err.response?.data;
  const detalhe = resp?.response?.message
    ? JSON.stringify(resp.response.message)
    : resp?.message || resp?.error || err.message;
  const e = new Error(`Evolution (${acao}): ${detalhe}`);
  e.status = err.response?.status;
  return e;
}

// Pergunta ao WhatsApp se o número existe. Roda ANTES de gastar OpenAI e
// ElevenLabs: número digitado errado é o erro mais comum na correria da
// abordagem, e falhar barato é melhor que falhar caro.
export async function verificarNumero(telefone) {
  const number = normalizarTelefone(telefone);
  if (!number) return { existe: false, numero: '', motivo: 'Telefone vazio' };

  const { http, instancia } = cliente();
  try {
    const { data } = await http.post(`/chat/whatsappNumbers/${instancia}`, { numbers: [number] });
    const info = Array.isArray(data) ? data[0] : null;
    return { existe: Boolean(info?.exists), numero: number, nomeWhatsapp: info?.name || null };
  } catch (err) {
    throw erroEvolution(err, 'verificarNumero');
  }
}

export async function enviarTexto(telefone, texto) {
  const { http, instancia } = cliente();
  try {
    const { data } = await http.post(`/message/sendText/${instancia}`, {
      number: normalizarTelefone(telefone),
      text: texto,
    });
    return data;
  } catch (err) {
    throw erroEvolution(err, 'enviarTexto');
  }
}

export async function enviarMidia(telefone, { url, tipo = 'video', legenda = '' }) {
  const { http, instancia } = cliente();
  try {
    const { data } = await http.post(`/message/sendMedia/${instancia}`, {
      number: normalizarTelefone(telefone),
      mediatype: tipo === 'video' ? 'video' : 'image',
      media: url,
      caption: legenda,
    });
    return data;
  } catch (err) {
    throw erroEvolution(err, 'enviarMidia');
  }
}

export async function enviarAudio(telefone, audioBase64) {
  const { http, instancia } = cliente();
  try {
    const { data } = await http.post(`/message/sendWhatsAppAudio/${instancia}`, {
      number: normalizarTelefone(telefone),
      audio: audioBase64,
    });
    return data;
  } catch (err) {
    throw erroEvolution(err, 'enviarAudio');
  }
}
