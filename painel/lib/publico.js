import { createClient } from '@supabase/supabase-js';

// Cliente do NAVEGADOR: chave publicável, sujeita a RLS. Só lê, e só atualiza
// status de pedido. Nunca importe o lib/db.js aqui — ele carrega a service key.
export const sb = createClient(
  process.env.NEXT_PUBLIC_SUPA_URL,
  process.env.NEXT_PUBLIC_SUPA_KEY
);

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
