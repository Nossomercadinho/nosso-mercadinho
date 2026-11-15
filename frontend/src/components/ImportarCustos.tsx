import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../services/apiClient';
import { chaveEan, lerTabelaCustos } from '../services/importacaoCustos';
import type { LinhaCusto } from '../services/importacaoCustos';
import { calcularCustoSimples, reais } from '../services/custoReal';
type Produto = { id: number; ean: string; nome: string; preco_custo: string | number };

export default function ImportarCustos({ lojaId, unidade, onSalvo }: { lojaId: number; unidade: string; onSalvo: () => void }) {
  const [texto, setTexto] = useState(''), [linhas, setLinhas] = useState<LinhaCusto[]>([]);
  const [ocupado, setOcupado] = useState(false), [erro, setErro] = useState(''), [relatorio, setRelatorio] = useState<string[]>([]);
  const ativo = useRef(true);
  useEffect(() => { ativo.current = true; return () => { ativo.current = false; }; }, []);
  async function api(path: string, body?: unknown) {
    if (!ativo.current) throw new Error('Importação interrompida após troca de unidade ou fechamento da tela. Os itens já salvos foram preservados.');
    const r = await apiFetch(path, { headers: { 'X-Loja-Id': String(lojaId), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}) });
    const d = await r.json();
    if (!r.ok || !d.sucesso) throw new Error(d.erro || 'Não foi possível concluir a operação.');
    return d;
  }
  async function salvar() {
    if (ocupado || !linhas.length) return;
    setOcupado(true); setErro(''); setRelatorio([]);
    try {
      const [geral, local] = await Promise.all([api('/api/produtos'), api('/api/produtos/loja/catalogo')]);
      const catalogo = new Map<string, Produto>();
      for (const p of geral.produtos as Produto[]) {
        const k = chaveEan(p.ean);
        if (catalogo.has(k)) throw new Error(`Existem cadastros com EAN equivalente (${p.ean}). Confira o catálogo antes de importar.`);
        catalogo.set(k, p);
      }
      const vinculados = new Map<number, Produto>((local.produtos as Produto[]).map(p => [p.id, p]));
      for (const linha of linhas) {
        if (!ativo.current) break;
        const k = chaveEan(linha.ean);
        let produto = catalogo.get(k);
        const custo = calcularCustoSimples(linha.valorTotal, linha.quantidade).custoUnitario;
        let acao = 'Custo conferido';
        if (!produto) {
          if (!linha.ncm) throw new Error(`${linha.nome}: informe o NCM para criar o cadastro.`);
          const fiscal = await api(`/api/ncm/${linha.ncm}`);
          const d = await api('/api/produtos', { ean: linha.ean, nome: linha.nome, marca: linha.marca, categoria: linha.categoria, fornecedor: linha.fornecedor, unidadeMedida: linha.unidade, precoCusto: custo, precoVenda: 0, estoqueInicial: 0, estoqueMinimo: 0, ncm: linha.ncm, cest: linha.cest, descricaoNcm: fiscal.descricao });
          produto = { id: d.id, ean: linha.ean, nome: linha.nome, preco_custo: custo };
          catalogo.set(k, produto); vinculados.set(produto.id, produto); acao = 'Cadastrado sem estoque e com venda pendente';
        } else {
          if (!vinculados.has(produto.id)) {
            await api(`/api/produtos/loja/integrar/${produto.id}`, {});
            const atualizado = await api('/api/produtos/loja/catalogo');
            for (const p of atualizado.produtos as Produto[]) vinculados.set(p.id, p);
            acao = 'Vinculado ao mercado e custo conferido';
          }
          const p = vinculados.get(produto.id);
          if (!p) throw new Error(`${linha.nome}: vínculo não encontrado. Atualize a lista.`);
          await api('/api/produtos/custos/simples', { lojaId, confirmado: true, itens: [{ produtoId: produto.id, valorTotal: linha.valorTotal, quantidade: linha.quantidade, custoAnteriorEsperado: p.preco_custo }] });
          vinculados.set(produto.id, { ...p, preco_custo: custo });
        }
        if (ativo.current) setRelatorio(r => [...r, `${linha.ean} · ${linha.nome} · ${reais(custo)} · ${acao}`]);
      }
      if (ativo.current) onSalvo();
    } catch (e) { if (ativo.current) { setErro(`${e instanceof Error ? e.message : 'Falha na importação.'} Os itens confirmados abaixo já foram salvos. É possível conferir e repetir sem criar outro produto com o mesmo EAN.`); onSalvo(); } }
    finally { if (ativo.current) setOcupado(false); }
  }
  return <section className="precificacao" aria-label="Importação de custos em lote"><h2>Importar produtos e custos · {unidade}</h2>
    <p>O EAN identifica o produto no catálogo geral, inclusive códigos equivalentes com zero à esquerda. Produtos existentes recebem somente o custo desta unidade. Novos cadastros ficam com estoque e preço de venda zerados, aguardando precificação.</p>
    <p>Informe o total líquido já com os impostos e despesas cobrados e a quantidade de unidades vendáveis. O ICMS já incluído no produto não deve ser somado novamente.</p>
    <label htmlFor="importacao-custos-tabela">Tabela de produtos e custos</label><textarea id="importacao-custos-tabela" rows={7} style={{ width: '100%', padding: 12 }} disabled={ocupado} value={texto} onChange={e => { setTexto(e.target.value); setLinhas([]); setErro(''); setRelatorio([]); }} placeholder={'EAN\tNome\tValor total\tQuantidade\tNCM\tCEST\tUnidade\tFornecedor\tMarca\tCategoria'} />
    <p>Colunas separadas por tabulação, nesta ordem: EAN, nome, valor total, quantidade, NCM, CEST, unidade, fornecedor, marca e categoria. Limite de 300 produtos.</p>
    <button className="secondary-button" type="button" disabled={ocupado} onClick={() => { try { setLinhas(lerTabelaCustos(texto)); setErro(''); } catch (e) { setLinhas([]); setErro(e instanceof Error ? e.message : 'Confira a tabela.'); } }}>Conferir tabela</button>
    {!!linhas.length && <><p>{linhas.length} produtos conferidos. Unidade de destino: <strong>{unidade}</strong>.</p><div className="prec-scroll"><table><thead><tr><th>EAN</th><th>Produto</th><th>Total líquido</th><th>Quantidade</th><th>Custo por unidade</th></tr></thead><tbody>{linhas.map(l => <tr key={l.ean}><td>{l.ean}</td><td>{l.nome}</td><td>{reais(l.valorTotal)}</td><td>{l.quantidade}</td><td>{reais(calcularCustoSimples(l.valorTotal, l.quantidade).custoUnitario)}</td></tr>)}</tbody></table></div><button type="button" className="primary-button" disabled={ocupado} onClick={() => void salvar()}>{ocupado ? `Salvando… ${relatorio.length}/${linhas.length}` : 'Salvar produtos e custos nesta unidade'}</button></>}
    {erro && <p role="alert">{erro}</p>}{!!relatorio.length && <div role="status"><strong>{relatorio.length} de {linhas.length} produtos salvos.</strong><ul>{relatorio.map((r, i) => <li key={i}>{r}</li>)}</ul></div>}
  </section>;
}
