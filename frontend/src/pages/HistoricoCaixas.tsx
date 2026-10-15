import { apiFetch } from '../services/apiClient';
import { useEffect, useMemo, useState } from 'react';
import Dialog from '../components/Dialog';
import Icon from '../components/Icon';
import ResponsiveFilters from '../components/ResponsiveFilters';
import './HistoricoCaixas.css';
import { useLoja } from '../contexts/LojaContext';

type Sessao = { id: number; lojaId: number; lojaNome: string; localId: number; localNome: string; usuarioId: number; usuarioNome: string; abertoEm: string; fechadoEm: string | null; status: 'ABERTO' | 'FECHADO'; saldoInicial: number; valorContado: number | null; valorEsperado: number; diferenca: number | null; quantidadeVendas: number; totalVendas: number; observacaoAbertura?: string | null; observacaoFechamento?: string | null; fechadoPorNome?: string | null };
type Resumo = { quantidadeVendas: number; totalVendas: number; dinheiro: number; valorEsperado: number; porForma: { formaPagamento: string; total: number }[] };
type Loja = { id: number; nome: string };
const moeda = (valor: number | null | undefined) => valor == null ? '—' : Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
function dataHora(valor: string | null | undefined) {
  if (!valor) return '—';
  const date = new Date(valor.includes('T') ? valor : `${valor.replace(' ', 'T')}Z`);
  return Number.isNaN(date.valueOf()) ? valor : date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}
function dataLocal(valor: string) {
  const date = new Date(valor.includes('T') ? valor : `${valor.replace(' ', 'T')}Z`);
  if (Number.isNaN(date.valueOf())) return valor.slice(0, 10);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
async function buscar<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await apiFetch(`/api/caixas${path}`, { headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` }, signal });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.sucesso === false) throw new Error(data.erro || data.mensagem || 'Não foi possível carregar os caixas. Tente novamente.');
  return data as T;
}

export default function HistoricoCaixas() {
  const { lojaAtiva } = useLoja();
  const [sessoes, setSessoes] = useState<Sessao[]>([]);
  const [lojas, setLojas] = useState<Loja[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [loja, setLoja] = useState(String(lojaAtiva?.id || ''));
  const [status, setStatus] = useState('todos');
  const [busca, setBusca] = useState('');
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [detalheId, setDetalheId] = useState<number | null>(null);
  const [detalhe, setDetalhe] = useState<{ sessao: Sessao; resumo: Resumo } | null>(null);
  const [erroDetalhe, setErroDetalhe] = useState('');
  const [atualizacao, setAtualizacao] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setCarregando(true); setErro('');
    Promise.all([buscar<{ sessoes: Sessao[] }>(`?lojaId=${lojaAtiva?.id || ''}`, controller.signal), buscar<{ lojas: Loja[] }>('/contexto', controller.signal)])
      .then(([lista, contexto]) => {
        const registros = lista.sessoes || [];
        const mercados = new Map<number, Loja>((contexto.lojas || []).map((mercado) => [mercado.id, mercado]));
        registros.forEach((sessao) => { if (!mercados.has(sessao.lojaId)) mercados.set(sessao.lojaId, { id: sessao.lojaId, nome: sessao.lojaNome }); });
        setSessoes(registros);
        setLojas([...mercados.values()]);
      })
      .catch((error) => { if (!controller.signal.aborted) setErro(error instanceof Error ? error.message : 'Falha ao carregar o histórico.'); })
      .finally(() => { if (!controller.signal.aborted) setCarregando(false); });
    return () => controller.abort();
  }, [atualizacao, lojaAtiva?.id]);

  useEffect(() => {
    setDetalhe(null); setErroDetalhe('');
    if (detalheId === null) return;
    const controller = new AbortController();
    buscar<{ sessao: Sessao; resumo: Resumo }>(`/${detalheId}`, controller.signal).then(setDetalhe).catch((error) => { if (!controller.signal.aborted) setErroDetalhe(error instanceof Error ? error.message : 'Falha ao carregar detalhes.'); });
    return () => controller.abort();
  }, [detalheId]);

  const filtrados = useMemo(() => sessoes.filter((sessao) => {
    const dia = dataLocal(sessao.abertoEm);
    return (!loja || String(sessao.lojaId) === loja) && (status === 'todos' || sessao.status === status) && (!de || dia >= de) && (!ate || dia <= ate) && `${sessao.usuarioNome} ${sessao.lojaNome} ${sessao.id}`.toLocaleLowerCase('pt-BR').includes(busca.trim().toLocaleLowerCase('pt-BR'));
  }).sort((a, b) => b.id - a.id), [sessoes, loja, status, busca, de, ate]);
  const ativos = sessoes.filter((sessao) => sessao.status === 'ABERTO').length;
  const filtrosAtivos = Number(status !== 'todos') + Number(Boolean(busca)) + Number(Boolean(de)) + Number(Boolean(ate));
  const limpar = () => { setLoja(String(lojaAtiva?.id || '')); setStatus('todos'); setBusca(''); setDe(''); setAte(''); };

  return <div className="cash-history">
    <div className="page-header"><div><h1>Histórico de caixas</h1><p>Aberturas, vendas e conferência do caixa por mercado e operador.</p></div><button type="button" className="secondary-button" disabled={carregando} onClick={() => setAtualizacao((value) => value + 1)}><Icon name="refresh" size={16} />Atualizar</button></div>
    <div className="cash-history-summary"><span><Icon name="store" size={17} /><strong>{ativos}</strong> {ativos === 1 ? 'caixa aberto' : 'caixas abertos'}</span><span><Icon name="receipt" size={17} /><strong>{sessoes.length}</strong> {sessoes.length === 1 ? 'abertura registrada' : 'aberturas registradas'}</span><span className="cash-history-summary-note">Registros de {lojaAtiva?.nome || 'seu mercado'}.</span></div>
    {erro && <div className="cash-history-error" role="alert">{erro}<button type="button" onClick={() => setAtualizacao((value) => value + 1)}>Tentar novamente</button></div>}
    <ResponsiveFilters label="Filtrar histórico" activeCount={filtrosAtivos} onClear={limpar}>
      <div className="cash-history-filters"><label className="cash-history-search">Operador ou mercado<input type="search" placeholder="Buscar no histórico" value={busca} onChange={(event) => setBusca(event.target.value)} /></label><label>Mercado<select value={loja} disabled aria-label="Mercado selecionado"><option value="">Todos os mercados</option>{lojas.map((mercado) => <option value={mercado.id} key={mercado.id}>{mercado.nome}</option>)}</select></label><label>Situação<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="todos">Todas</option><option value="ABERTO">Aberto</option><option value="FECHADO">Fechado</option></select></label><label>Abertura de<input type="date" value={de} onChange={(event) => setDe(event.target.value)} max={ate || undefined} /></label><label>Até<input type="date" value={ate} onChange={(event) => setAte(event.target.value)} min={de || undefined} /></label></div>
    </ResponsiveFilters>
    <div className="cash-history-list" aria-busy={carregando}>
      <div className="cash-history-list-heading"><span>Mercado / operador</span><span>Abertura</span><span>Fechamento</span><span>Vendas</span><span>Conferência</span><span>Situação</span><span /></div>
      {carregando ? <p className="cash-history-empty" role="status">Carregando histórico…</p> : erro ? <p className="cash-history-empty">O histórico não pôde ser carregado.</p> : filtrados.length === 0 ? <div className="cash-history-empty"><Icon name="calendar" size={26} /><strong>Nenhum caixa encontrado</strong><span>{filtrosAtivos ? 'Ajuste os filtros para encontrar outras aberturas.' : 'Ao abrir o PDV, o trabalho do operador será registrado aqui.'}</span></div> : filtrados.map((sessao) => <article className="cash-history-row" key={sessao.id}>
        <div className="cash-history-person"><strong>{sessao.lojaNome}</strong><span>{sessao.usuarioNome}</span><small>Caixa #{sessao.id} · {sessao.localNome}</small></div>
        <div className="cash-history-date"><small>Aberto em</small><span>{dataHora(sessao.abertoEm)}</span></div>
        <div className="cash-history-date"><small>Fechado em</small><span>{sessao.fechadoEm ? dataHora(sessao.fechadoEm) : 'Em atendimento'}</span></div>
        <div className="cash-history-amount"><small>Vendas</small><strong>{moeda(sessao.totalVendas)}</strong><span>{sessao.quantidadeVendas || 0} vendas</span></div>
        <div className="cash-history-balance"><small>Conferência</small>{sessao.status === 'ABERTO' ? <span className="cash-history-muted">A conferir</span> : <><strong className={Math.abs(sessao.diferenca || 0) < 0.005 ? 'is-balanced' : 'is-different'}>{Math.abs(sessao.diferenca || 0) < 0.005 ? 'Conferido' : moeda(sessao.diferenca)}</strong><span>{Math.abs(sessao.diferenca || 0) < 0.005 ? 'Sem diferença' : 'Diferença no caixa'}</span></>}</div>
        <span className={`cash-history-status ${sessao.status === 'ABERTO' ? 'is-open' : ''}`}>{sessao.status === 'ABERTO' ? 'Aberto' : 'Fechado'}</span>
        <button className="cash-history-detail" type="button" onClick={() => setDetalheId(sessao.id)} aria-label={`Ver detalhes do caixa ${sessao.id}`}><Icon name="eye" size={17} /><span>Detalhes</span></button>
      </article>)}
    </div>
    <p className="cash-history-count">{!carregando && `${filtrados.length} ${filtrados.length === 1 ? 'caixa exibido' : 'caixas exibidos'}`}</p>
    <Dialog open={detalheId !== null} title={`Caixa #${detalheId || ''}`} close={() => setDetalheId(null)}>
      {erroDetalhe ? <p className="cash-history-error" role="alert">{erroDetalhe}</p> : !detalhe ? <p className="cash-history-empty" role="status">Carregando detalhes…</p> : <div className="cash-detail">
        <div className="cash-detail-heading"><div><strong>{detalhe.sessao.lojaNome}</strong><span>{detalhe.sessao.localNome}</span></div><span className={`cash-history-status ${detalhe.sessao.status === 'ABERTO' ? 'is-open' : ''}`}>{detalhe.sessao.status === 'ABERTO' ? 'Aberto' : 'Fechado'}</span></div>
        <dl className="cash-detail-people"><div><dt>Aberto por</dt><dd>{detalhe.sessao.usuarioNome}</dd><span>{dataHora(detalhe.sessao.abertoEm)}</span></div><div><dt>Fechado por</dt><dd>{detalhe.sessao.fechadoEm ? detalhe.sessao.fechadoPorNome || detalhe.sessao.usuarioNome : 'Aguardando fechamento'}</dd><span>{dataHora(detalhe.sessao.fechadoEm)}</span></div></dl>
        <div className="cash-detail-sales"><span>Vendas deste caixa<strong>{moeda(detalhe.resumo.totalVendas)}</strong></span><small>{detalhe.resumo.quantidadeVendas} vendas registradas</small></div>
        <dl className="cash-detail-payment">{detalhe.resumo.porForma.map((pagamento) => <div key={pagamento.formaPagamento}><dt>{({ DINHEIRO: 'Dinheiro', PIX: 'Pix', DEBITO: 'Débito', CREDITO: 'Crédito', A_PRAZO: 'A prazo' } as Record<string, string>)[pagamento.formaPagamento] || pagamento.formaPagamento}</dt><dd>{moeda(pagamento.total)}</dd></div>)}</dl>
        <div className="cash-detail-reconciliation"><h3>Conferência em dinheiro</h3><dl><div><dt>Fundo inicial</dt><dd>{moeda(detalhe.sessao.saldoInicial)}</dd></div><div><dt>Vendas em dinheiro</dt><dd>{moeda(detalhe.resumo.dinheiro)}</dd></div><div><dt>Esperado no caixa</dt><dd>{moeda(detalhe.resumo.valorEsperado)}</dd></div><div><dt>Valor contado</dt><dd>{moeda(detalhe.sessao.valorContado)}</dd></div>{detalhe.sessao.status === 'FECHADO' && <div className="cash-detail-difference"><dt>Diferença</dt><dd className={Math.abs(detalhe.sessao.diferenca || 0) < 0.005 ? 'is-balanced' : 'is-different'}>{moeda(detalhe.sessao.diferenca)}</dd></div>}</dl><p>O valor esperado soma o fundo inicial às vendas recebidas em dinheiro.</p></div>
        {(detalhe.sessao.observacaoAbertura || detalhe.sessao.observacaoFechamento) && <div className="cash-detail-notes">{detalhe.sessao.observacaoAbertura && <p><strong>Observação da abertura</strong>{detalhe.sessao.observacaoAbertura}</p>}{detalhe.sessao.observacaoFechamento && <p><strong>Observação do fechamento</strong>{detalhe.sessao.observacaoFechamento}</p>}</div>}
        <div className="cash-detail-actions"><button type="button" className="secondary-button" onClick={() => setDetalheId(null)}>Fechar detalhes</button></div>
      </div>}
    </Dialog>
  </div>;
}
