import { useEffect, useState } from 'react';
import { useLoja } from '../contexts/LojaContext';
import { apiFetch } from '../services/apiClient';
import { reais } from '../services/custoReal';
type Produto = { id: number; ean: string; nome: string; preco_custo: number; preco_venda: number };

export default function PrecosPorUnidade({ onSalvo }: { onSalvo: () => void }) {
  const { lojas } = useLoja();
  const matriz = lojas.find(l => l.id === 1 || l.nome.toLowerCase() === 'matriz');
  const mercados = lojas.filter(l => l.id !== matriz?.id);
  const [mercadoId, setMercadoId] = useState(String(mercados[0]?.id || ''));
  const [produtos, setProdutos] = useState<Produto[]>([]), [matrizItens, setMatrizItens] = useState<Map<number, Produto>>(new Map()), [mercadoItens, setMercadoItens] = useState<Map<number, Produto>>(new Map());
  const [rascunhos, setRascunhos] = useState<Record<number, { matriz?: string; mercado?: string }>>({});
  const [busca, setBusca] = useState(''), [pagina, setPagina] = useState(0), [carregando, setCarregando] = useState(false), [salvando, setSalvando] = useState<number | null>(null), [mensagem, setMensagem] = useState('');
  const mercado = mercados.find(l => String(l.id) === mercadoId);
  async function consultar(loja: number, signal: AbortSignal) {
    const r = await apiFetch('/api/produtos/loja/catalogo', { signal, headers: { 'X-Loja-Id': String(loja) } });
    const d = await r.json(); if (!r.ok || !d.sucesso) throw new Error(d.erro || 'Não foi possível carregar os preços.');
    return d.produtos as Produto[];
  }
  useEffect(() => {
    const c = new AbortController(); setRascunhos({}); setProdutos([]); setMensagem(''); setPagina(0);
    if (!matriz || !mercado) return () => c.abort();
    setCarregando(true);
    Promise.all([consultar(matriz.id, c.signal), consultar(mercado.id, c.signal)]).then(([a, b]) => {
      if (c.signal.aborted) return;
      setMatrizItens(new Map(a.map(p => [p.id, p]))); setMercadoItens(new Map(b.map(p => [p.id, p])));
      setProdutos([...new Map([...b, ...a].map(p => [p.id, p])).values()].sort((x, y) => x.nome.localeCompare(y.nome)));
    }).catch(e => { if (!c.signal.aborted) setMensagem(e instanceof Error ? e.message : 'Erro ao carregar.'); }).finally(() => { if (!c.signal.aborted) setCarregando(false); });
    return () => c.abort();
  }, [matriz?.id, mercado?.id]);
  async function gravar(p: Produto) {
    if (!matriz || !mercado || salvando !== null) return;
    const d = rascunhos[p.id] || {};
    const alvos = [{ loja: matriz, texto: d.matriz, atual: matrizItens.get(p.id), mapa: setMatrizItens }, { loja: mercado, texto: d.mercado, atual: mercadoItens.get(p.id), mapa: setMercadoItens }].filter(a => a.texto !== undefined);
    if (!alvos.length) return;
    if (alvos.some(a => !a.texto?.trim() || !Number.isFinite(Number(a.texto)) || Number(a.texto) < 0)) { setMensagem('Informe preços válidos, maiores ou iguais a zero.'); return; }
    setSalvando(p.id); setMensagem(''); const gravados: string[] = [];
    try {
      for (const a of alvos) {
        const r = await apiFetch(a.atual ? `/api/produtos/loja/${p.id}` : `/api/produtos/loja/integrar/${p.id}`, { method: a.atual ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json', 'X-Loja-Id': String(a.loja.id) }, body: JSON.stringify({ precoVenda: Number(a.texto) }) });
        const resultado = await r.json(); if (!r.ok || !resultado.sucesso) throw new Error(resultado.erro || `Falha ao salvar em ${a.loja.nome}.`);
        a.mapa(m => new Map(m).set(p.id, { ...(a.atual || p), preco_venda: Number(a.texto) })); gravados.push(a.loja.nome);
        setRascunhos(s => { const item = { ...s[p.id] }; delete item[a.loja.id === matriz.id ? 'matriz' : 'mercado']; return { ...s, [p.id]: item }; });
      }
      setMensagem(`Preço salvo: ${p.nome} · ${gravados.join(' e ')}.`); onSalvo();
    } catch (e) { setMensagem(`${e instanceof Error ? e.message : 'Erro ao salvar.'}${gravados.length ? ` Já salvo em: ${gravados.join(', ')}.` : ''}`); }
    finally { setSalvando(null); }
  }
  const filtrados = produtos.filter(p => `${p.nome} ${p.ean}`.toLowerCase().includes(busca.toLowerCase()));
  const paginas = Math.max(1, Math.ceil(filtrados.length / 20)), atual = Math.min(pagina, paginas - 1);
  return <section className="precificacao" aria-label="Preços separados da Matriz e Mercadinhos"><h2>Preço de venda · Matriz e Mercadinhos</h2>
    <p>O mesmo produto tem preços independentes por unidade. Altere os campos desejados e salve a linha. Custos e quantidades de estoque são preservados.</p>
    {!matriz || !mercados.length ? <p>Este acesso precisa ter a Matriz e pelo menos um mercadinho autorizado para comparar preços.</p> : <>
      <label>Mercadinho para precificar<select aria-label="Mercadinho para precificar" value={mercadoId} disabled={salvando !== null} onChange={e => setMercadoId(e.target.value)}>{mercados.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}</select></label>
      <label>Buscar para comparar preços<input value={busca} type="search" placeholder="Nome ou EAN para comparar preços" onChange={e => { setBusca(e.target.value); setPagina(0); }} /></label>
      <p>Matriz: margem por produto, até 45%. Mercadinhos: margem por produto, até 60%. Esses valores são referências e não são aplicados automaticamente.</p>
      {carregando ? <p role="status">Carregando preços das unidades…</p> : <div className="prec-scroll"><table><thead><tr><th>Produto / EAN</th><th>Custo Matriz</th><th>Preço de venda Matriz · {matriz.nome}</th><th>Preço de venda Mercadinho · {mercado?.nome}</th><th>Ação</th></tr></thead><tbody>{filtrados.slice(atual * 20, atual * 20 + 20).map(p => <tr key={p.id}><td>{p.nome}<small>{p.ean}</small></td><td>{reais(matrizItens.get(p.id)?.preco_custo)}</td>{(['matriz', 'mercado'] as const).map(tipo => {
        const cadastro = (tipo === 'matriz' ? matrizItens : mercadoItens).get(p.id);
        return <td key={tipo}><input aria-label={`Preço de venda ${tipo === 'matriz' ? 'Matriz' : 'Mercadinho'} de ${p.nome}`} type="number" min="0" step="0.01" disabled={salvando !== null} placeholder="Não vinculado" value={rascunhos[p.id]?.[tipo] ?? (cadastro ? String(cadastro.preco_venda) : '')} onChange={e => setRascunhos(s => ({ ...s, [p.id]: { ...s[p.id], [tipo]: e.target.value } }))} />{!cadastro && <small>Será vinculado a esta unidade ao salvar um preço.</small>}</td>;
      })}<td><button type="button" className="primary-button" disabled={salvando !== null || !Object.keys(rascunhos[p.id] || {}).length} onClick={() => void gravar(p)}>{salvando === p.id ? 'Salvando…' : 'Salvar preços da linha'}</button></td></tr>)}</tbody></table></div>}
      <div className="prec-paginacao"><span>{filtrados.length} produtos · página {atual + 1} de {paginas}</span><button type="button" className="secondary-button" disabled={atual === 0} onClick={() => setPagina(atual - 1)}>Anterior</button><button type="button" className="secondary-button" disabled={atual >= paginas - 1} onClick={() => setPagina(atual + 1)}>Próxima</button></div>
    </>}{mensagem && <p role="status">{mensagem}</p>}
  </section>;
}
