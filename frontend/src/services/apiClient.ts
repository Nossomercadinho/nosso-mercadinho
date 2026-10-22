export const LOJA_ATIVA_KEY = 'nm-loja-ativa';
let lojaContextId: string | null = null;
export function definirLojaDaAba(id: number | null) { lojaContextId = id == null ? null : String(id); }

/** Every management request carries the store currently displayed by the UI. */
export function apiFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  const token = localStorage.getItem('token');
  if (token) headers.set('Authorization', 'Bearer ' + token);
  const path = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, window.location.origin).pathname;
  if (/^\/api\/(produtos|estoque|financeiro|nfe|clientes-prazo|fornecedores|fechamento-diario|vendas-gestao)(?:\/|$)/.test(path)) {
    const loja = lojaContextId;
    if (loja && /^\d+$/.test(loja) && !headers.has('X-Loja-Id')) headers.set('X-Loja-Id', loja);
  }
  return fetch(input, { ...init, headers });
}

/** Reconciles existing daily closings without creating duplicate receipts. */
export async function sincronizarFechamentosFinanceiro(lojaId: number) {
  const response = await apiFetch('/api/financeiro/sincronizar-fechamentos', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Loja-Id': String(lojaId) },
    body: JSON.stringify({ lojaId }),
  });
  const data = await response.json();
  if (!response.ok || !data.sucesso) throw new Error(data.erro || 'Não foi possível integrar os fechamentos ao Financeiro.');
  return data.resultado as { criados: number; atualizados: number; existentes: number; semValor: number; conflitos: { data: string; lancamentoId: number }[] };
}
