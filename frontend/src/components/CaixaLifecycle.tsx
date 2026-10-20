import { apiFetch } from '../services/apiClient';
import { useEffect, useState } from 'react';
import Dialog from './Dialog';
import Icon from './Icon';
import './CaixaLifecycle.css';

export type MercadoCaixa = { id: number; nome: string; locais: { id: number; nome: string }[] };
export type SessaoCaixa = {
  id: number; lojaId: number; lojaNome: string; localId: number; localNome: string;
  usuarioId: number; usuarioNome: string; abertoEm: string; fechadoEm?: string;
  status: string; saldoInicial: number; valorContado?: number; valorEsperado?: number; diferenca?: number;
};
type ResumoCaixa = { quantidadeVendas: number; totalVendas: number; dinheiro: number; valorEsperado: number; porForma: { formaPagamento: string; total: number }[] };
const moeda = (value: unknown) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export async function caixaRequest(path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${localStorage.getItem('token') || ''}`);
  if (options.body) headers.set('Content-Type', 'application/json');
  const response = await apiFetch(`/api/caixas${path}`, { ...options, headers });
  const data = await response.json();
  if (!response.ok || !data.sucesso) throw new Error(data.erro || 'Não foi possível consultar o caixa.');
  return data;
}

export function AberturaCaixa({ lojas, onOpened, onHistory, ultimoFechamento, lojaInicialId }: {
  lojas: MercadoCaixa[]; onOpened: (session: SessaoCaixa) => void; onHistory?: () => void; ultimoFechamento?: SessaoCaixa | null; lojaInicialId?: number;
}) {
  const [lojaId, setLojaId] = useState(lojas.some(item => item.id === lojaInicialId) ? String(lojaInicialId) : lojas.length === 1 ? String(lojas[0].id) : '');
  const loja = lojas.find(item => String(item.id) === lojaId);
  const [localId, setLocalId] = useState(loja?.locais.length === 1 ? String(loja.locais[0].id) : '');
  const [saldo, setSaldo] = useState('0');
  const [observacao, setObservacao] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const usuario = (() => { try { return JSON.parse(localStorage.getItem('usuarioLogado') || '{}'); } catch { return {}; } })();

  async function abrir(event: React.FormEvent) {
    event.preventDefault(); setError('');
    if (!lojaId || !localId) { setError('Escolha o mercado e o local de venda.'); return; }
    setSaving(true);
    try {
      const data = await caixaRequest('/abrir', { method: 'POST', body: JSON.stringify({ lojaId: Number(lojaId), localId: Number(localId), saldoInicial: Number(saldo), observacao }) });
      onOpened(data.sessao);
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível abrir o caixa.'); }
    finally { setSaving(false); }
  }

  return <div className="cash-opening-layout">
    <div className="cash-opening-intro"><span className="page-kicker">INÍCIO DO EXPEDIENTE</span><h1>Vamos abrir o caixa?</h1><p>Escolha onde vai trabalhar e informe o fundo de troco. As vendas ficam vinculadas ao seu acesso e a este expediente.</p><div className="cash-operator"><span><Icon name="users" size={23} /></span><div><small>Responsável pela abertura</small><strong>{usuario.nome || 'Usuário conectado'}</strong><small>{usuario.papelNome || usuario.perfil}</small></div></div>{onHistory && <button type="button" className="cash-history-link" onClick={onHistory}><Icon name="clock" size={17} />Consultar histórico dos caixas<Icon name="arrow" size={16} /></button>}</div>
    <form className="cash-opening-form" onSubmit={abrir}>
      {ultimoFechamento && <div className="cash-closed-notice" role="status"><Icon name="check" size={18} /><div><strong>Caixa #{ultimoFechamento.id} encerrado</strong><small>Diferença da conferência: {moeda(ultimoFechamento.diferenca)}</small></div></div>}
      <div className="cash-form-heading"><Icon name="store" size={21} /><div><h2>Abertura de caixa</h2><p>{lojas.length} mercado(s) disponível(is) para você</p></div></div>
      {!lojas.length ? <div className="cash-empty-access"><Icon name="shield" size={24} /><strong>Nenhum mercado liberado</strong><p>Peça ao administrador que associe seu usuário a um mercado com local habilitado para venda.</p></div> : <>
        <label>Mercado<select required value={lojaId} onChange={event => { const next = lojas.find(item => String(item.id) === event.target.value); setLojaId(event.target.value); setLocalId(next?.locais.length === 1 ? String(next.locais[0].id) : ''); }}><option value="">Escolha o mercado</option>{lojas.map(item => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label>
        <label>Local de venda<select required value={localId} disabled={!lojaId} onChange={event => setLocalId(event.target.value)}><option value="">Escolha o local</option>{loja?.locais.map(local => <option key={local.id} value={local.id}>{local.nome}</option>)}</select></label>
        <label>Fundo de troco inicial<input type="number" min="0" step="0.01" inputMode="decimal" required value={saldo} onChange={event => setSaldo(event.target.value)} /><small>Dinheiro que já está no caixa antes da primeira venda.</small></label>
        <label>Observações <span className="cash-optional">opcional</span><textarea rows={2} maxLength={1000} value={observacao} onChange={event => setObservacao(event.target.value)} placeholder="Alguma informação para este expediente?" /></label>
        {error && <div className="pos-alert" role="alert">{error}</div>}
        <button className="cash-open-submit" type="submit" disabled={saving || !lojaId || !localId}><Icon name="check" size={19} />{saving ? 'Abrindo caixa...' : 'Abrir caixa e começar'}</button>
      </>}
    </form>
  </div>;
}

export function FechamentoCaixa({ open, session, close, onClosed }: { open: boolean; session: SessaoCaixa; close: () => void; onClosed: (session: SessaoCaixa) => void }) {
  const [resumo, setResumo] = useState<ResumoCaixa | null>(null);
  const [contado, setContado] = useState('');
  const [observacao, setObservacao] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open) return;
    let live = true; setLoading(true); setError(''); setContado(''); setObservacao(''); setResumo(null);
    caixaRequest(`/${session.id}`).then(data => { if (live) setResumo(data.resumo); }).catch(err => { if (live) setError(err.message); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [open, session.id]);
  async function fechar(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setError('');
    try { const data = await caixaRequest(`/${session.id}/fechar`, { method: 'POST', body: JSON.stringify({ valorContado: Number(contado), observacao }) }); onClosed(data.sessao); }
    catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível encerrar o caixa.'); }
    finally { setSaving(false); }
  }
  return <Dialog open={open} title={`Fechar caixa #${session.id}`} close={() => { if (!saving) close(); }}><form className="cash-closing-form" onSubmit={fechar}>
    <p className="dialog-description">{session.lojaNome} · {session.localNome}<br />Aberto por {session.usuarioNome}</p>
    {loading && <p className="dialog-description">Conferindo as vendas deste expediente...</p>}
    {resumo && <><div className="cash-closing-summary"><div><small>Fundo inicial</small><strong>{moeda(session.saldoInicial)}</strong></div><div><small>Vendas em dinheiro</small><strong>{moeda(resumo.dinheiro)}</strong></div><div><small>Dinheiro esperado</small><strong>{moeda(resumo.valorEsperado)}</strong></div><div><small>{resumo.quantidadeVendas} venda(s) no expediente</small><strong>{moeda(resumo.totalVendas)}</strong></div></div><p className="cash-closing-help">Conte somente o dinheiro físico, incluindo o fundo de troco. Pix e cartões ficam registrados no histórico, separados do dinheiro.</p>
      <label>Dinheiro contado no caixa<input type="number" min="0" step="0.01" inputMode="decimal" required value={contado} onChange={event => setContado(event.target.value)} placeholder="0,00" /></label>
      {contado !== '' && <div className={`cash-difference ${Math.abs(Number(contado) - resumo.valorEsperado) < .005 ? 'balanced' : ''}`}><span>Diferença da conferência</span><strong>{moeda(Number(contado) - resumo.valorEsperado)}</strong></div>}
      <label>Observações<textarea rows={2} maxLength={1000} value={observacao} onChange={event => setObservacao(event.target.value)} placeholder="Informe o motivo se houver diferença." /></label></>}
    {error && <div className="pos-alert" role="alert">{error}</div>}
    <div className="cash-close-actions"><button type="button" className="secondary-button" disabled={saving} onClick={close}>Continuar trabalhando</button><button type="submit" className="primary-button" disabled={saving || !resumo || contado === ''}>{saving ? 'Encerrando...' : 'Confirmar fechamento'}</button></div>
  </form></Dialog>;
}
