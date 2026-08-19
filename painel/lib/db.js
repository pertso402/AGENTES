import { createClient } from '@supabase/supabase-js';
import { gerarSlug, normalizarTelefone } from './formato';

// Cliente com service_role: ignora RLS. SÓ pode ser importado por código de
// servidor (rotas em app/api). Se isto vazar pro navegador, a chave vaza junto.
//
// Criado na primeira chamada, não na importação: o `next build` carrega os
// módulos das rotas sem as env vars de produção, e um createClient no topo
// derrubava o build inteiro por causa de uma chave que só existe em runtime.
let conexao = null;

function sb() {
  if (!conexao) {
    if (!process.env.SUPA_URL || !process.env.SUPA_SERVICE_KEY) {
      throw new Error('Supabase não configurado: preencha SUPA_URL e SUPA_SERVICE_KEY no .env.local');
    }
    conexao = createClient(process.env.SUPA_URL, process.env.SUPA_SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      // O Next substitui o fetch global e guarda as respostas GET no Data
      // Cache — inclusive as consultas que o cliente do Supabase faz por baixo.
      // O efeito é o banco parecer congelado no servidor: uma rota via 2 leads
      // e outra via 1 ao mesmo tempo, e o disparo poderia montar a oferta com
      // um cardápio que você acabou de editar no Setup. Aqui nada é cacheável:
      // é tudo estado que muda no meio da demo.
      global: {
        fetch: (url, opcoes = {}) => fetch(url, { ...opcoes, cache: 'no-store' }),
      },
    });
  }
  return conexao;
}

export default sb;

// ─── RESTAURANTES ────────────────────────────────────────────────────────────

export async function listarRestaurantes() {
  const { data, error } = await sb()
    .from('restaurantes')
    .select('*')
    .order('template', { ascending: false })
    .order('criado_em', { ascending: false });
  if (error) throw new Error(`db/listarRestaurantes: ${error.message}`);
  return data || [];
}

export async function buscarRestaurante(id) {
  const { data, error } = await sb().from('restaurantes').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(`db/buscarRestaurante: ${error.message}`);
  return data;
}

// Clona um template de nicho num tenant novo. O slug tem que ser único, e o
// dono do lead não pode ver um erro de "já existe" na tela — então o sufixo
// numérico é resolvido aqui, em silêncio.
export async function clonarTemplate(templateSlug, nome) {
  const base = gerarSlug(nome);
  let slug = base;

  for (let tentativa = 0; tentativa < 20; tentativa++) {
    const { data, error } = await sb().rpc('clonar_restaurante', {
      p_template_slug: templateSlug,
      p_nome: nome,
      p_slug: slug,
    });

    if (!error) return data; // uuid do restaurante novo

    // 23505 = unique_violation no slug. Tenta o próximo sufixo.
    if (error.code === '23505' || /duplicate key/i.test(error.message)) {
      slug = `${base}-${tentativa + 2}`;
      continue;
    }
    throw new Error(`db/clonarTemplate: ${error.message}`);
  }
  throw new Error('Não consegui gerar um identificador livre para esse nome.');
}

const CAMPOS_EDITAVEIS = [
  'nome', 'nicho', 'persona_nome', 'persona_emoji', 'descricao_negocio', 'tom_de_voz',
  'cor_primaria', 'logo_url', 'endereco', 'horario_texto', 'sempre_aberto',
  'aceita_delivery', 'aceita_retirada', 'taxa_entrega', 'pedido_minimo',
  'chave_pix', 'pix_titular', 'pix_banco', 'desconto_padrao', 'validade_cupom_dias',
];

export async function atualizarRestaurante(id, campos) {
  const payload = {};
  for (const k of CAMPOS_EDITAVEIS) {
    if (campos[k] !== undefined) payload[k] = campos[k];
  }
  if (!Object.keys(payload).length) return buscarRestaurante(id);

  const { data, error } = await sb().from('restaurantes').update(payload).eq('id', id).select().single();
  if (error) throw new Error(`db/atualizarRestaurante: ${error.message}`);
  return data;
}

export async function ativarRestaurante(id) {
  const { error } = await sb().rpc('ativar_restaurante', { p_id: id });
  if (error) throw new Error(`db/ativarRestaurante: ${error.message}`);
}

export async function resetarDemo(id) {
  const { error } = await sb().rpc('resetar_demo', { p_restaurante_id: id });
  if (error) throw new Error(`db/resetarDemo: ${error.message}`);
}

export async function excluirRestaurante(id) {
  const { error } = await sb().from('restaurantes').delete().eq('id', id).eq('template', false);
  if (error) throw new Error(`db/excluirRestaurante: ${error.message}`);
}

// ─── PRODUTOS ────────────────────────────────────────────────────────────────

export async function listarProdutos(restauranteId) {
  const { data, error } = await sb()
    .from('produtos')
    .select('*')
    .eq('restaurante_id', restauranteId)
    .order('ordem')
    .order('nome');
  if (error) throw new Error(`db/listarProdutos: ${error.message}`);
  return data || [];
}

export async function salvarProduto(produto) {
  const payload = {
    restaurante_id: produto.restaurante_id,
    nome: produto.nome,
    descricao: produto.descricao || null,
    categoria: produto.categoria || 'Outros',
    preco: Number(produto.preco) || 0,
    disponivel: produto.disponivel !== false,
    destaque: Boolean(produto.destaque),
    imagem_url: produto.imagem_url || null,
    video_url: produto.video_url || null,
    ordem: Number(produto.ordem) || 0,
  };

  // O destaque é o produto que vai no disparo. Só pode haver um por tenant,
  // senão a oferta sai citando um prato e mostrando o vídeo de outro.
  if (payload.destaque) {
    await sb().from('produtos').update({ destaque: false }).eq('restaurante_id', payload.restaurante_id);
  }

  const query = produto.id
    ? sb().from('produtos').update(payload).eq('id', produto.id)
    : sb().from('produtos').insert(payload);

  const { data, error } = await query.select().single();
  if (error) throw new Error(`db/salvarProduto: ${error.message}`);
  return data;
}

export async function excluirProduto(id) {
  const { error } = await sb().from('produtos').delete().eq('id', id);
  if (error) throw new Error(`db/excluirProduto: ${error.message}`);
}

// Produto que ancora a oferta: o marcado como destaque, ou o mais caro
// disponível (que costuma ser o carro-chefe) se ninguém marcou nada.
export async function produtoDaOferta(restauranteId) {
  const { data } = await sb()
    .from('produtos')
    .select('*')
    .eq('restaurante_id', restauranteId)
    .eq('disponivel', true)
    .eq('destaque', true)
    .limit(1)
    .maybeSingle();
  if (data) return data;

  const { data: caro } = await sb()
    .from('produtos')
    .select('*')
    .eq('restaurante_id', restauranteId)
    .eq('disponivel', true)
    .order('preco', { ascending: false })
    .limit(1)
    .maybeSingle();
  return caro || null;
}

// ─── CLIENTES E CUPONS ───────────────────────────────────────────────────────

export async function garantirCliente(restauranteId, telefone, nome) {
  const tel = normalizarTelefone(telefone);

  const { data: existente } = await sb()
    .from('clientes')
    .select('*')
    .eq('restaurante_id', restauranteId)
    .eq('telefone', tel)
    .maybeSingle();

  if (existente) {
    if (nome && existente.nome !== nome) {
      await sb().from('clientes').update({ nome }).eq('id', existente.id);
      return { ...existente, nome };
    }
    return existente;
  }

  const { data, error } = await sb()
    .from('clientes')
    .insert({ restaurante_id: restauranteId, telefone: tel, nome: nome || 'Cliente' })
    .select()
    .single();
  if (error) throw new Error(`db/garantirCliente: ${error.message}`);
  return data;
}

const PALAVRAS_CUPOM = ['FOME', 'BORA', 'QUERO', 'TOPA', 'VEM', 'MASSA', 'BOA', 'AGORA'];

// O código vira parte da copy do áudio, então precisa ser curto e falável —
// um uuid seria impronunciável. A colisão é resolvida por retry: o UNIQUE é
// por tenant, e o espaço de 8 palavras x 90 números não aperta numa demo.
export async function criarCupom({ restauranteId, clienteId, descontoPercentual, validadeDias }) {
  const validoAte = new Date(Date.now() + (validadeDias || 7) * 86_400_000).toISOString().slice(0, 10);

  for (let tentativa = 0; tentativa < 10; tentativa++) {
    const palavra = PALAVRAS_CUPOM[Math.floor(Math.random() * PALAVRAS_CUPOM.length)];
    const codigo = `${palavra}${Math.floor(Math.random() * 90 + 10)}`;

    const { data, error } = await sb()
      .from('cupons')
      .insert({
        restaurante_id: restauranteId,
        cliente_id: clienteId,
        codigo,
        tipo: 'desconto_percentual',
        desconto_percentual: descontoPercentual,
        valido_ate: validoAte,
      })
      .select()
      .single();

    if (!error) return data;
    if (error.code !== '23505') throw new Error(`db/criarCupom: ${error.message}`);
  }
  throw new Error('Não consegui gerar um código de cupom livre.');
}

export async function registrarOferta(oferta) {
  const { data, error } = await sb().from('ofertas_enviadas').insert(oferta).select().single();
  if (error) throw new Error(`db/registrarOferta: ${error.message}`);
  return data;
}

// ─── SESSÃO DA DEMO ──────────────────────────────────────────────────────────
// É isto que diz ao agente de atendimento de qual restaurante ele é quando o
// dono responder. Um número de WhatsApp só serve todas as demos.
export async function abrirSessaoDemo(telefone, restauranteId, horas = 24) {
  const tel = normalizarTelefone(telefone);
  const { error } = await sb().from('demo_sessoes').upsert(
    {
      telefone: tel,
      restaurante_id: restauranteId,
      criado_em: new Date().toISOString(),
      expira_em: new Date(Date.now() + horas * 3_600_000).toISOString(),
    },
    { onConflict: 'telefone' }
  );
  if (error) throw new Error(`db/abrirSessaoDemo: ${error.message}`);
}

// Limpa o estado da conversa DESTE número neste tenant, sem tocar nos pedidos
// já feitos. Roda a cada disparo: um carrinho esquecido de uma demo anterior
// voltando no meio da conversa nova é o jeito mais fácil de queimar o pitch.
export async function limparConversa(restauranteId, telefone) {
  const tel = normalizarTelefone(telefone);

  await sb().from('pedido_rascunho').delete().eq('restaurante_id', restauranteId).eq('telefone', tel);
  await sb().from('mensagens').delete().eq('restaurante_id', restauranteId).eq('telefone', tel);

  const { data: cliente } = await sb()
    .from('clientes')
    .select('id')
    .eq('restaurante_id', restauranteId)
    .eq('telefone', tel)
    .maybeSingle();

  // Cupom antigo não usado ficaria ativo junto com o novo, e o atendimento pega
  // o mais recente — mas dois cupons vivos é estado sujo esperando pra confundir.
  if (cliente) {
    await sb().from('cupons').delete().eq('cliente_id', cliente.id).eq('usado', false);
  }
}
