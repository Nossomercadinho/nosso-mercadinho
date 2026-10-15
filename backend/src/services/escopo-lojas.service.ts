import { AsyncLocalStorage } from 'node:async_hooks';
import type { UsuarioAcesso } from './acessos.service';

/** The authenticated request's store scope also follows asynchronous SQL calls. */
export type ContextoLojas = UsuarioAcesso & { lojaAtivaId?: number };
export const contextoLojas = new AsyncLocalStorage<ContextoLojas>();

export function obterLojaAtivaId(): number | undefined {
  return contextoLojas.getStore()?.lojaAtivaId;
}

export function escopoLojaSql(coluna: string): string {
  const usuario = contextoLojas.getStore();
  if (!usuario || usuario.acessoTodasLojas) return '1 = 1';
  const ids = usuario.lojaIds.filter(id => Number.isInteger(id) && id > 0);
  return ids.length ? `${coluna} IN (${ids.join(',')})` : '1 = 0';
}

export function possuiEscopoRestrito(): boolean {
  const usuario = contextoLojas.getStore();
  return !!usuario && !usuario.acessoTodasLojas;
}
