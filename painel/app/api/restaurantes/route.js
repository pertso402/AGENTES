import {
  listarRestaurantes, buscarRestaurante, clonarTemplate, atualizarRestaurante,
  ativarRestaurante, resetarDemo, excluirRestaurante,
} from '../../../lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const restaurantes = await listarRestaurantes();
    return Response.json({ restaurantes });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

// Cria um lead novo clonando um template de nicho, com produtos e tudo.
// É o "setup de 90 segundos": nome + nicho, e está pronto pra disparar.
export async function POST(request) {
  try {
    const { templateSlug, nome } = await request.json();
    if (!templateSlug || !nome?.trim()) {
      return Response.json({ error: 'Informe o nicho e o nome do restaurante.' }, { status: 400 });
    }

    const id = await clonarTemplate(templateSlug, nome.trim());
    await ativarRestaurante(id);
    return Response.json({ restaurante: await buscarRestaurante(id) });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const { id, acao, campos } = await request.json();
    if (!id) return Response.json({ error: 'id é obrigatório' }, { status: 400 });

    if (acao === 'ativar') {
      await ativarRestaurante(id);
    } else if (acao === 'resetar') {
      // Zera pedidos, conversas, cupons e clientes deste tenant, mantendo a
      // configuração e o cardápio. É o botão de "posso repetir a demo".
      await resetarDemo(id);
    } else if (campos) {
      await atualizarRestaurante(id, campos);
    }

    return Response.json({ restaurante: await buscarRestaurante(id) });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return Response.json({ error: 'id é obrigatório' }, { status: 400 });

    await excluirRestaurante(id); // templates são protegidos dentro do db
    return Response.json({ sucesso: true });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
