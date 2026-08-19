// Formatação e normalização compartilhadas. Sem dependência de banco ou rede,
// pra poder ser usada tanto no servidor quanto no navegador.

export function fmtBRL(v) {
  return `R$ ${Number(v || 0).toFixed(2).replace('.', ',')}`;
}

// Arredondamento monetário explícito — evita 0.1+0.2 = 0.30000000000000004
// virar centavo fantasma na diferença entre o resumo e o pedido gravado.
export function money(v) {
  return Math.round(Number(v || 0) * 100) / 100;
}

// A Evolution exige o número internacional completo. "44 99708-8509" é aceito
// pela API e só falha lá na frente com "exists: false" — então o DDI é reposto
// aqui, no ponto de entrada, em vez de confiar em quem digitou.
export function normalizarTelefone(telefone) {
  const digitos = String(telefone || '').replace(/\D/g, '');
  if (!digitos) return '';
  if (digitos.startsWith('55')) return digitos;
  if (digitos.length === 10 || digitos.length === 11) return `55${digitos}`;
  return digitos;
}

// Slug a partir do nome do restaurante, para a URL e a chave do tenant.
export function gerarSlug(nome) {
  const base = String(nome || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return base || 'restaurante';
}

export function telefoneBonito(telefone) {
  const d = normalizarTelefone(telefone).replace(/^55/, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return telefone;
}
