import {
  buscarRestaurante, produtoDaOferta, garantirCliente, criarCupom,
  registrarOferta, abrirSessaoDemo, limparConversa,
} from '../../../lib/db';
import { verificarNumero, enviarAudio, enviarMidia, enviarTexto } from '../../../lib/evolution';
import { gerarOferta } from '../../../lib/copy';
import { gerarAudioBase64 } from '../../../lib/voz';

export const maxDuration = 60;

// O disparo da demo. A ordem das etapas aqui não é arbitrária: o que é barato e
// falha rápido vem antes do que custa dinheiro e demora.
export async function POST(request) {
  const avisos = [];

  try {
    const { restauranteId, telefone, nome, comAudio = true } = await request.json();

    if (!restauranteId || !telefone) {
      return Response.json({ error: 'Escolha o restaurante e digite o telefone.' }, { status: 400 });
    }

    const restaurante = await buscarRestaurante(restauranteId);
    if (!restaurante) return Response.json({ error: 'Restaurante não encontrado.' }, { status: 404 });

    const produto = await produtoDaOferta(restauranteId);
    if (!produto) {
      return Response.json(
        { error: `${restaurante.nome} não tem nenhum produto disponível pra ancorar a oferta.` },
        { status: 400 }
      );
    }

    // 1º: o número existe? É o erro mais comum na correria da abordagem, e
    // descobrir depois de gerar copy e áudio custa tempo e crédito à toa.
    const check = await verificarNumero(telefone);
    if (!check.existe) {
      return Response.json(
        { error: `O número ${check.numero || telefone} não existe no WhatsApp. Confira o DDD (não precisa digitar o 55).` },
        { status: 400 }
      );
    }

    // Estado limpo antes de começar: rascunho, histórico e cupom não usado de
    // uma demo anterior neste mesmo número voltariam no meio da conversa nova.
    await limparConversa(restauranteId, telefone);

    const cliente = await garantirCliente(restauranteId, telefone, nome);
    const cupom = await criarCupom({
      restauranteId,
      clienteId: cliente.id,
      descontoPercentual: restaurante.desconto_padrao,
      validadeDias: restaurante.validade_cupom_dias,
    });

    const { audio: textoAudio, cta } = await gerarOferta({ restaurante, produto, cliente, cupom });

    // Áudio é o que arranca o "uau", mas não pode ser o que impede a demo de
    // acontecer: se a ElevenLabs recusar, a oferta sai sem ele e você fica
    // sabendo por quê, em vez de a tela travar na frente do dono.
    let audioBase64 = null;
    if (comAudio) {
      try {
        audioBase64 = await gerarAudioBase64(textoAudio);
        if (!audioBase64) avisos.push('Áudio desligado: faltam ELEVENLABS_API_KEY / ELEVENLABS_VOICE_ID.');
      } catch (err) {
        avisos.push(`Enviei sem áudio — ${err.message}`);
      }
    }

    if (audioBase64) await enviarAudio(telefone, audioBase64);

    const midiaUrl = produto.video_url || produto.imagem_url || null;
    if (midiaUrl) {
      await enviarMidia(telefone, {
        url: midiaUrl,
        tipo: produto.video_url ? 'video' : 'image',
        legenda: cta,
      });
    } else {
      await enviarTexto(telefone, cta);
      avisos.push(`${produto.nome} não tem vídeo nem foto — foi só texto. Suba uma mídia no setup.`);
    }

    // Amarra o número ao tenant: quando o dono responder, o agente de
    // atendimento sabe de qual restaurante ele é.
    await abrirSessaoDemo(telefone, restauranteId);

    await registrarOferta({
      restaurante_id: restauranteId,
      cliente_id: cliente.id,
      cupom_id: cupom.id,
      cupom_codigo: cupom.codigo,
      tipo_oferta: 'reconexao',
      desconto_percentual: cupom.desconto_percentual,
      mensagem_audio: audioBase64 ? textoAudio : null,
      mensagem_cta: cta,
      mensagem_video: midiaUrl,
    });

    return Response.json({
      sucesso: true,
      cupom: { codigo: cupom.codigo, desconto: cupom.desconto_percentual, valido_ate: cupom.valido_ate },
      produto: produto.nome,
      cta,
      textoAudio,
      comAudio: Boolean(audioBase64),
      avisos,
    });
  } catch (err) {
    console.error('Erro no disparo:', err);
    return Response.json({ error: err.message || 'Erro interno', avisos }, { status: 500 });
  }
}
