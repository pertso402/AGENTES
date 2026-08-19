import { listarRestaurantes } from '../../../lib/db';

export const dynamic = 'force-dynamic';

// Diagnóstico de configuração. Diz o que está faltando pelo NOME, nunca pelo
// valor — dá pra abrir no celular, no meio de uma visita, sem expor chave
// nenhuma. Existe porque "não funciona" tem muitas causas, e sem isso a
// investigação vira adivinhação em cima de uma tela de erro genérica.
const OBRIGATORIAS = [
  'SUPA_URL', 'SUPA_SERVICE_KEY',
  'NEXT_PUBLIC_SUPA_URL', 'NEXT_PUBLIC_SUPA_KEY',
  'EVOLUTION_URL', 'EVOLUTION_KEY', 'EVOLUTION_INSTANCE',
  'OPENAI_API_KEY',
];

const OPCIONAIS = ['ELEVENLABS_API_KEY', 'ELEVENLABS_VOICE_ID', 'PANEL_PASSWORD'];

export async function GET() {
  const faltando = OBRIGATORIAS.filter((n) => !process.env[n]);
  const opcionaisAusentes = OPCIONAIS.filter((n) => !process.env[n]);

  let banco = 'nao testado';
  let restaurantes = null;

  if (!faltando.includes('SUPA_URL') && !faltando.includes('SUPA_SERVICE_KEY')) {
    try {
      const lista = await listarRestaurantes();
      restaurantes = lista.filter((r) => !r.template).length;
      banco = 'ok';
    } catch (err) {
      banco = err.message;
    }
  }

  return Response.json({
    ok: faltando.length === 0 && banco === 'ok',
    faltando,
    opcionaisAusentes,
    banco,
    leadsCadastrados: restaurantes,
    audio: process.env.ELEVENLABS_API_KEY ? 'ligado' : 'desligado (a oferta sai sem voz)',
  });
}
