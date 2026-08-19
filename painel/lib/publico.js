import { createClient } from '@supabase/supabase-js';

// Cliente do NAVEGADOR: chave publicável, sujeita a RLS. Só lê, e só atualiza
// status de pedido. Nunca importe o lib/db.js aqui — ele carrega a service key.
//
// Criado na primeira chamada, não na importação. O `next build` pré-renderiza
// as páginas no servidor, e um createClient no topo do módulo derrubava o build
// inteiro ("supabaseUrl is required") quando as variáveis ainda não estavam
// cadastradas na Vercel. Página que não abre por falta de configuração é um
// problema; deploy que nem chega a existir é outro bem pior.
let conexao = null;

export function sb() {
  if (!conexao) {
    const url = process.env.NEXT_PUBLIC_SUPA_URL;
    const chave = process.env.NEXT_PUBLIC_SUPA_KEY;
    if (!url || !chave) {
      throw new Error(
        'Faltam NEXT_PUBLIC_SUPA_URL e NEXT_PUBLIC_SUPA_KEY. Cadastre nas variáveis de ambiente e republique.'
      );
    }
    conexao = createClient(url, chave);
  }
  return conexao;
}

// O tenant escolhido fica no navegador: você abre o painel no celular já no
// restaurante certo, sem precisar selecionar de novo a cada aba.
const CHAVE = 'agente-demo:restaurante';

export function tenantSalvo() {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(CHAVE);
}

export function salvarTenant(id) {
  if (typeof window === 'undefined') return;
  if (id) window.localStorage.setItem(CHAVE, id);
  else window.localStorage.removeItem(CHAVE);
}
