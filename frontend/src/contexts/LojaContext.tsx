import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { apiFetch, definirLojaDaAba, LOJA_ATIVA_KEY } from '../services/apiClient';

export type LojaAtiva = { id: number; nome: string; codigo?: string; tipo?: string };
type Contexto = { lojaAtiva: LojaAtiva | null; lojas: LojaAtiva[]; carregando: boolean; erro: string; selecionarLoja: (id: number) => void; atualizarLojas: () => Promise<void> };
const LojaContext = createContext<Contexto | null>(null);
export function LojaProvider({ children }: { children: ReactNode }) {
  const [lojas, setLojas] = useState<LojaAtiva[]>([]);
  const [lojaAtiva, setLojaAtiva] = useState<LojaAtiva | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const usuarioId = (() => { try { return JSON.parse(localStorage.getItem('usuarioLogado') || '{}').id || ''; } catch { return ''; } })();
  const preferencia = 'nm-loja-usuario-' + usuarioId;
  const atualizarLojas = useCallback(async () => {
    try {
      const response = await apiFetch('/api/auth/lojas');
      const data = await response.json();
      if (!response.ok || !data.sucesso) throw new Error(data.erro || 'Não foi possível consultar seus mercados.');
      const permitidas: LojaAtiva[] = Array.isArray(data.lojas) ? data.lojas : [];
      const salvo = Number(localStorage.getItem(preferencia));
      const ativa = permitidas.find(loja => loja.id === salvo) || permitidas[0] || null;
      definirLojaDaAba(ativa?.id || null);
      if (ativa) { localStorage.setItem(LOJA_ATIVA_KEY, String(ativa.id)); localStorage.setItem(preferencia, String(ativa.id)); }
      else localStorage.removeItem(LOJA_ATIVA_KEY);
      setLojas(permitidas); setLojaAtiva(ativa); setErro('');
    } catch (error) { setErro(error instanceof Error ? error.message : 'Não foi possível consultar seus mercados.'); }
    finally { setCarregando(false); }
  }, [preferencia]);
  useEffect(() => {
    void atualizarLojas();
    const refresh = () => void atualizarLojas();
    const sincronizar = (event: StorageEvent) => { if (event.key === preferencia) void atualizarLojas(); };
    window.addEventListener('nm:lojas-updated', refresh); window.addEventListener('nm:access-updated', refresh); window.addEventListener('focus', refresh);
    window.addEventListener('storage', sincronizar);
    return () => { window.removeEventListener('nm:lojas-updated', refresh); window.removeEventListener('nm:access-updated', refresh); window.removeEventListener('focus', refresh); window.removeEventListener('storage', sincronizar); };
  }, [atualizarLojas, preferencia]);
  const selecionarLoja = useCallback((id: number) => {
    const loja = lojas.find(item => item.id === id);
    if (!loja) return;
    definirLojaDaAba(loja.id);
    localStorage.setItem(LOJA_ATIVA_KEY, String(loja.id)); localStorage.setItem(preferencia, String(loja.id)); setLojaAtiva(loja);
  }, [lojas, preferencia]);
  return <LojaContext.Provider value={{lojas, lojaAtiva, carregando, erro, selecionarLoja, atualizarLojas}}>{children}</LojaContext.Provider>;
}
export function useLoja() { const context = useContext(LojaContext); if (!context) throw new Error('Contexto de loja indisponível.'); return context; }
