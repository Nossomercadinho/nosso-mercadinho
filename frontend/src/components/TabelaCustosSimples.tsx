import {useDadosCompartilhados} from '../hooks/useDadosCompartilhados';
import {useEffect,useRef,useState} from 'react';
import {apiFetch} from '../services/apiClient';
import {useLoja} from '../contexts/LojaContext';
import {calcularCustoSimples,reais,decimal} from '../services/custoReal';
import './TabelaCustosSimples.css';

type Produto={id:number;nome:string;ean:string;unidade_medida:string;preco_custo:string|number};
type Entrada={total:string;quantidade:string};
const normalizar=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/(\d)\s*litros?\b/g,'$1l').trim();
function numeroDigitado(s:string){
  const t=s.trim();if(!t)throw new Error('Informe o valor.');
  const n=t.includes(',')?t.replace(/\./g,'').replace(',','.'):/^\d{1,3}(?:\.\d{3})+$/.test(t)?t.replace(/\./g,''):t;
  if(!/^\d+(?:\.\d+)?$/.test(n))throw new Error('Use um número válido, como 12,50.');
  return n;
}
function resultado(e:Entrada){try{return {calculo:calcularCustoSimples(numeroDigitado(e.total),numeroDigitado(e.quantidade)),erro:''};}catch(x){return {calculo:null,erro:x instanceof Error?x.message:'Confira os valores.'};}}

export default function TabelaCustosSimples({onSalvo}:{onSalvo?:()=>void}){
  const {lojaAtiva}=useLoja();
  const [produtos,setProdutos]=useState<Produto[]>([]),[entradas,setEntradas]=useState<Record<number,Entrada>>({});
  const [busca,setBusca]=useState(''),[semCusto,setSemCusto]=useState(false),[preenchidos,setPreenchidos]=useState(false),[pagina,setPagina]=useState(0);
  const [carregando,setCarregando]=useState(true),[salvando,setSalvando]=useState(false),[erro,setErro]=useState(''),[mensagem,setMensagem]=useState('');
  const lojaAtual=useRef(lojaAtiva?.id);lojaAtual.current=lojaAtiva?.id;
  let podeSalvar=false;try{podeSalvar=JSON.parse(localStorage.getItem('usuarioLogado')||'{}').permissoes?.includes('produtos')===true;}catch{/* A API também valida a permissão. */}
  async function carregar(signal?:AbortSignal){
    const loja=lojaAtiva?.id;if(!loja)return;setCarregando(true);setErro('');
    try{const r=await apiFetch('/api/produtos/loja/catalogo',{signal,headers:{'X-Loja-Id':String(loja)}});const d=await r.json();if(!r.ok||!d.sucesso)throw new Error(d.erro||'Não foi possível carregar os produtos.');if(lojaAtual.current===loja&&!signal?.aborted)setProdutos(d.produtos||[]);}
    catch(x){if(!signal?.aborted&&lojaAtual.current===loja)setErro(x instanceof Error?x.message:'Falha ao carregar produtos.');}
    finally{if(!signal?.aborted&&lojaAtual.current===loja)setCarregando(false);}
  }
  useEffect(()=>{const c=new AbortController();setEntradas({});setMensagem('');setProdutos([]);setPagina(0);void carregar(c.signal);return()=>c.abort();},[lojaAtiva?.id]);
  useDadosCompartilhados(()=>{if(!salvando&&!Object.values(entradas).some(e=>e.total.trim()))return carregar();});
  const informados=produtos.filter(p=>entradas[p.id]?.total.trim());
  const invalidos=informados.some(p=>!resultado(entradas[p.id]).calculo);
  const termos=normalizar(busca).split(/\s+/).filter(Boolean);
  const filtrados=produtos.filter(p=>(!semCusto||Number(p.preco_custo)<=0)&&(!preenchidos||!!entradas[p.id]?.total.trim())&&termos.every(t=>normalizar(`${p.nome} ${p.ean}`).includes(t)));
  const paginas=Math.max(1,Math.ceil(filtrados.length/25)),atual=Math.min(pagina,paginas-1),visiveis=filtrados.slice(atual*25,atual*25+25);
  function editar(id:number,patch:Partial<Entrada>){setEntradas(e=>({...e,[id]:{...(e[id]||{total:'',quantidade:'1'}),...patch}}));setMensagem('');setErro('');}
  async function salvar(){
    const loja=lojaAtiva?.id;if(!loja||!informados.length||invalidos||salvando)return;
    if(informados.length>100){setErro('Salve até 100 produtos por vez.');return;}
    setSalvando(true);setErro('');setMensagem('');
    try{
      const itens=informados.map(p=>({produtoId:p.id,valorTotal:numeroDigitado(entradas[p.id].total),quantidade:numeroDigitado(entradas[p.id].quantidade),custoAnteriorEsperado:p.preco_custo}));
      const r=await apiFetch('/api/produtos/custos/simples',{method:'POST',headers:{'Content-Type':'application/json','X-Loja-Id':String(loja)},body:JSON.stringify({lojaId:loja,confirmado:true,itens})});const d=await r.json();if(!r.ok||!d.sucesso)throw new Error(d.erro||'Não foi possível salvar os custos.');
      if(lojaAtual.current!==loja)return;
      const custos=new Map<number,string>(d.itens.map((i:{produtoId:number;custoUnitario:string})=>[i.produtoId,i.custoUnitario]));
      setProdutos(ps=>ps.map(p=>custos.has(p.id)?{...p,preco_custo:custos.get(p.id)!}:p));setEntradas({});setMensagem(`${d.atualizados} custo(s) atualizado(s) em ${lojaAtiva.nome}. Preços de venda e estoque preservados.`);onSalvo?.();
    }catch(x){if(lojaAtual.current===loja)setErro(x instanceof Error?x.message:'Falha ao salvar.');}
    finally{if(lojaAtual.current===loja)setSalvando(false);}
  }
  return <section className="tabela-custos" aria-label="Lançamento simples de custos">
    <div className="tc-heading"><div><h2>Lançamento simples de custos</h2><p>Unidade: <strong>{lojaAtiva?.nome||'Selecione uma unidade no topo'}</strong>. Informe o valor total e a quantidade para calcular o custo por unidade.</p></div><button type="button" className="secondary-button" disabled={carregando||salvando} onClick={()=>void carregar()}>Atualizar lista</button></div>
    <p className="tc-exemplo">Exemplo: R$ 120,00 ÷ 24 unidades = <strong>R$ 5,00 por unidade</strong>. Para informar o custo diretamente, use quantidade 1. Informe o total já com impostos e despesas, descontando os abatimentos. Para produtos vendidos por unidade, conte também as unidades dentro das caixas.</p>
    {!podeSalvar&&<p role="status">Seu acesso permite consultar. A gravação exige permissão de Produtos.</p>}
    <div className="tc-filtros"><label className="tc-busca">Buscar produto ou código<input type="search" value={busca} onChange={e=>{setBusca(e.target.value);setPagina(0);}} placeholder="Nome, marca ou código de barras"/></label><label className="tc-check"><input type="checkbox" checked={semCusto} onChange={e=>{setSemCusto(e.target.checked);setPagina(0);}}/>Somente sem custo</label><label className="tc-check"><input type="checkbox" checked={preenchidos} onChange={e=>{setPreenchidos(e.target.checked);setPagina(0);}}/>Somente preenchidos</label></div>
    <div className="tc-table-scroll"><table><thead><tr><th>Produto</th><th>Valor total (R$)</th><th>Quantidade</th><th>Unidade</th><th>Custo calculado</th><th>Custo atual</th></tr></thead><tbody>
      {carregando?<tr><td colSpan={6}>Carregando produtos…</td></tr>:!visiveis.length?<tr><td colSpan={6}>Nenhum produto encontrado nesta unidade.</td></tr>:visiveis.map(p=>{
        const e=entradas[p.id]||{total:'',quantidade:'1'},r=e.total.trim()?resultado(e):null;
        return <tr key={p.id}><td data-label="Produto" className="tc-produto"><strong>{p.nome}</strong><small>{p.ean}</small></td><td data-label="Valor total (R$)"><input aria-label={`Valor total de ${p.nome}`} type="text" inputMode="decimal" placeholder="0,00" value={e.total} disabled={salvando||!podeSalvar} onBlur={()=>{if(!e.total.trim())return;try{const n=decimal(numeroDigitado(e.total));if(n.decimalPlaces()<=2){const v=Number(n.toString()).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});if(v!==e.total)editar(p.id,{total:v});}}catch{/* O erro é mostrado junto ao valor. */}}} onChange={ev=>{if(/^[\d.,]*$/.test(ev.target.value))editar(p.id,{total:ev.target.value});}}/>{r?.erro&&<small className="tc-error">{r.erro}</small>}</td><td data-label="Quantidade"><input aria-label={`Quantidade de ${p.nome}`} type="text" inputMode="decimal" value={e.quantidade} disabled={salvando||!podeSalvar} onChange={ev=>{if(/^[\d.,]*$/.test(ev.target.value))editar(p.id,{quantidade:ev.target.value});}}/></td><td data-label="Unidade">{p.unidade_medida||'UN'}</td><td data-label="Custo calculado"><strong>{reais(r?.calculo?.custoUnitario)}</strong></td><td data-label="Custo atual">{reais(p.preco_custo)}</td></tr>;
      })}
    </tbody></table></div>
    <div className="tc-paginacao"><span>{filtrados.length} produto(s) · página {atual+1} de {paginas}</span><button type="button" className="secondary-button" disabled={atual===0} onClick={()=>setPagina(atual-1)}>Anterior</button><button type="button" className="secondary-button" disabled={atual>=paginas-1} onClick={()=>setPagina(atual+1)}>Próxima</button></div>
    <div className="tc-salvar"><p>{informados.length} produto(s) preenchido(s), incluindo outras páginas e filtros. Apenas esses custos serão salvos. A quantidade serve para o cálculo e não altera o estoque.</p><button type="button" className="primary-button" disabled={!podeSalvar||carregando||salvando||!informados.length||invalidos} onClick={()=>void salvar()}>{salvando?'Salvando…':`Salvar ${informados.length} custo(s) informado(s)`}</button></div>
    {mensagem&&<p role="status" className="tc-success">{mensagem}</p>}{erro&&<p role="alert" className="tc-error">{erro}</p>}
  </section>;
}
