import sb from '../../../lib/db';

export const maxDuration = 60;

// Upload da mídia do produto. Existe para o caso que mais impressiona: você
// fotografa (ou filma) o prato real do lead ali na hora, e a oferta sai com a
// comida DELE. Passa pelo servidor porque a chave publicável não escreve no
// storage — e não deve mesmo.
export async function POST(request) {
  try {
    const form = await request.formData();
    const arquivo = form.get('arquivo');
    const restauranteId = form.get('restauranteId');

    if (!arquivo || typeof arquivo === 'string') {
      return Response.json({ error: 'Nenhum arquivo enviado.' }, { status: 400 });
    }
    if (arquivo.size > 25 * 1024 * 1024) {
      return Response.json({ error: 'Arquivo maior que 25 MB — o WhatsApp recusaria.' }, { status: 400 });
    }

    const ext = (arquivo.name?.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
    const caminho = `${restauranteId || 'geral'}/${Date.now()}.${ext}`;

    const { error } = await sb().storage
      .from('demo-midia')
      .upload(caminho, Buffer.from(await arquivo.arrayBuffer()), {
        contentType: arquivo.type || 'application/octet-stream',
        upsert: false,
      });
    if (error) throw new Error(error.message);

    const { data } = sb().storage.from('demo-midia').getPublicUrl(caminho);
    const tipo = (arquivo.type || '').startsWith('video') ? 'video' : 'imagem';

    return Response.json({ url: data.publicUrl, tipo });
  } catch (err) {
    return Response.json({ error: err.message || 'Falha no upload' }, { status: 500 });
  }
}
