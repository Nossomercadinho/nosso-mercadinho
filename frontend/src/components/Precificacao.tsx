import { useState } from 'react';
import { calcularPrecificacao } from '../services/precificacao';
import './Precificacao.css';

type Produto = { id: number; nome: string; ean: string; categoria: string; preco_custo: number; preco_venda: number };
type Ajuste = { margem: string; taxas: string; quantidade: string };
const dinheiro = (v: number | null | undefined) => v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const percentual = (v: number | null) => v == null ? '—' : `${v.toFixed(2)}%`;
const numero = (v: string) => v.trim() === '' ? NaN : Number(v.replace(',', '.'));
const padrao: Ajuste = { margem: '30', taxas: '8', quantidade: '0' };

export default function Precificacao({ produtos, unidade, onAplicar }: { produtos: Produto[]; unidade: string; onAplicar: (id: number, preco: string) => void }) {
  const [busca, setBusca] = useState('');
  const [pagina, setPagina] = useState(0);
  const [ajustes, setAjustes] = useState<Record<number, Ajuste>>({});
  const [sim, setSim] = useState({ custo: '10', venda: '12.50', margem: '30', taxas: '6', despesas: '2', quantidade: '100', fixos: '0' });
  const campos = [['custo', 'Custo de aquisição (R$)'], ['venda', 'Preço atual (R$)'], ['margem', 'Margem bruta desejada (%)'], ['taxas', 'Taxas e impostos (%)'], ['despesas', 'Outras despesas variáveis (%)'], ['quantidade', 'Quantidade mensal estimada'], ['fixos', 'Custos fixos alocados (R$/mês)']] as const;
  const resultado = numero(sim.taxas) >= 0 && numero(sim.despesas) >= 0 ? calcularPrecificacao({ custo: numero(sim.custo), venda: numero(sim.venda), margem: numero(sim.margem), taxas: numero(sim.taxas) + numero(sim.despesas), quantidade: numero(sim.quantidade), fixos: numero(sim.fixos) }) : null;
  const filtrados = produtos.filter(p => `${p.nome} ${p.ean} ${p.categoria}`.toLocaleLowerCase().includes(busca.toLocaleLowerCase()));
  const paginas = Math.max(1, Math.ceil(filtrados.length / 20));
  const atual = Math.min(pagina, paginas - 1);
  return <section className="precificacao" aria-label="Calculadora de precificação">
    <h2>Precificação · {unidade}</h2>
    <p>Preço sugerido = custo ÷ (1 − margem bruta). As taxas reduzem a contribuição. Margem bruta e contribuição não são lucro líquido.</p>
    <details><summary>Simulador de precificação</summary>
      <p>Valores iniciais são o exemplo da planilha. Altere para simular uma compra.</p>
      <div className="prec-grid">{campos.map(([campo, label]) => <label key={campo}>{label}<input type="number" min="0" step="any" value={sim[campo]} onChange={e => setSim(s => ({ ...s, [campo]: e.target.value }))}/></label>)}</div>
      {resultado ? <dl className="prec-resultados">{[
        ['Preço sugerido', dinheiro(resultado.sugerido)], ['Margem bruta atual', percentual(resultado.margemAtual)], ['Markup atual', percentual(resultado.markup)],
        ['Contribuição atual/un.', dinheiro(resultado.contribuicaoAtual)], ['Contribuição sugerida/un.', dinheiro(resultado.contribuicaoSugerida)],
        ['Resultado mensal atual', dinheiro(resultado.mensalAtual)], ['Resultado mensal sugerido', dinheiro(resultado.mensalSugerido)], ['Diferença de preço', dinheiro(resultado.diferenca)],
        ['Ponto de equilíbrio (unidades)', resultado.equilibrio == null ? 'Sem contribuição positiva' : String(resultado.equilibrio)],
      ].map(([label, valor]) => <div key={label}><dt>{label}</dt><dd>{valor}</dd></div>)}</dl> : <p role="alert">Preencha todos os campos com valores não negativos, margem menor que 100% e taxas somadas até 100%.</p>}
    </details>
    <h3>Tabela de produtos</h3>
    <p>Custos e preços vêm do cadastro da unidade. Margem inicial: 30%; taxas e despesas: 8%. Quantidade inicia em zero: informe a previsão mensal. Simulações permanecem apenas nesta tela e são descartadas ao fechá-la ou trocar a unidade.</p>
    <label>Buscar produto<input type="search" value={busca} onChange={e => { setBusca(e.target.value); setPagina(0); }} placeholder="Nome, EAN ou categoria"/></label>
    <div className="prec-scroll"><table><thead><tr>{['Produto', 'Categoria', 'Custo', 'Preço atual', 'Margem alvo (%)', 'Taxas e despesas (%)', 'Qtd./mês', 'Preço sugerido', 'Margem atual', 'Markup', 'Contribuição atual/un.', 'Contribuição sugerida/un.', 'Receita atual/mês', 'Contribuição atual/mês', 'Contribuição sugerida/mês', 'Ação'].map(t => <th key={t} scope="col">{t}</th>)}</tr></thead>
      <tbody>{filtrados.slice(atual * 20, atual * 20 + 20).map(p => {
        const a = ajustes[p.id] || padrao;
        const r = calcularPrecificacao({ custo: Number(p.preco_custo), venda: Number(p.preco_venda), margem: numero(a.margem), taxas: numero(a.taxas), quantidade: numero(a.quantidade) });
        const semCusto = !(Number(p.preco_custo) > 0);
        return <tr key={p.id}><td><strong>{p.nome}</strong><small>{p.ean}</small></td><td>{p.categoria}</td><td>{dinheiro(Number(p.preco_custo))}</td><td>{dinheiro(Number(p.preco_venda))}</td>
          {(['margem', 'taxas', 'quantidade'] as const).map(campo => <td key={campo}><input aria-label={`${campo} de ${p.nome}`} type="number" min="0" max={campo === 'margem' ? '99.99' : campo === 'taxas' ? '100' : undefined} step="any" value={a[campo]} onChange={e => setAjustes(s => ({ ...s, [p.id]: { ...a, [campo]: e.target.value } }))}/></td>)}
          <td>{semCusto ? 'Informe o custo' : dinheiro(r?.sugerido)}</td><td>{r ? percentual(r.margemAtual) : '—'}</td><td>{r ? percentual(r.markup) : '—'}</td>
          {[r?.contribuicaoAtual, r?.contribuicaoSugerida, r?.receita, r?.mensalAtual, r?.mensalSugerido].map((v, i) => <td key={i}>{dinheiro(v)}</td>)}
          <td><button className="secondary-button" type="button" disabled={!r || semCusto} onClick={() => r && onAplicar(p.id, (Math.ceil(r.sugerido * 100) / 100).toFixed(2))}>Revisar preço</button>{!r && <small role="alert">Confira margem, taxas e quantidade.</small>}</td></tr>;
      })}{!filtrados.length && <tr><td colSpan={16}>Nenhum produto encontrado nesta unidade.</td></tr>}</tbody></table></div>
    <div className="prec-paginacao"><span>{filtrados.length} produtos · página {atual + 1} de {paginas}</span><button type="button" className="secondary-button" disabled={atual === 0} onClick={() => setPagina(atual - 1)}>Anterior</button><button type="button" className="secondary-button" disabled={atual >= paginas - 1} onClick={() => setPagina(atual + 1)}>Próxima</button></div>
    <p>“Revisar preço” abre o cadastro com a sugestão arredondada para cima ao centavo. Confira e clique em “Salvar Alterações” para gravar o preço nesta unidade.</p>
  </section>;
}
