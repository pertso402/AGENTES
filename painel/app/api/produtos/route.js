import { listarProdutos, salvarProduto, excluirProduto } from '../../../lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const restauranteId = searchParams.get('restauranteId');
    if (!restauranteId) return Response.json({ error: 'restauranteId é obrigatório' }, { status: 400 });

    return Response.json({ produtos: await listarProdutos(restauranteId) });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

// Serve para criar e para editar: com `id` no corpo, atualiza; sem, insere.
export async function POST(request) {
  try {
    const produto = await request.json();
    if (!produto.restaurante_id || !produto.nome?.trim()) {
      return Response.json({ error: 'restaurante_id e nome são obrigatórios' }, { status: 400 });
    }

    return Response.json({ produto: await salvarProduto(produto) });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return Response.json({ error: 'id é obrigatório' }, { status: 400 });

    await excluirProduto(id);
    return Response.json({ sucesso: true });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
