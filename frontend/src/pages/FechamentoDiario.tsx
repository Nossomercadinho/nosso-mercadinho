import {useDadosCompartilhados} from '../hooks/useDadosCompartilhados';
import { apiFetch } from '../services/apiClient';
import { useEffect, useRef, useState } from 'react';
import { useLoja } from '../contexts/LojaContext';

const API = '/api';

function hoje() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function moeda(v: any) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function fetchAuth(url: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  const token = localStorage.getItem('token');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body) headers.set('Content-Type', 'application/json');
  return apiFetch(url, { ...init, headers });
}
const vazio = () => ({
  dinheiro: '', pix: '', debito: '', credito: '', aPrazo: '', outros: '',
  executorId: '', observacao: '', inicial: '', final: '', retiradas: '', itau: '', pagbank: ''
});

export default function FechamentoDiario() {
  const { lojaAtiva, lojas, selecionarLoja, carregando: carregandoLojas } = useLoja();
  const [data, setData] = useState(() => {
    const [loja, dia] = (sessionStorage.getItem('nm-fechamento-data') || '').split(':');
    return loja === String(lojaAtiva?.id) && /^\d{4}-\d{2}-\d{2}$/.test(dia || '') ? dia : hoje();
  });
  const [form, setForm] = useState<any>(vazio());
  const [executores, setExecutores] = useState<any[]>([]);
  const [historico, setHistorico] = useState<any[]>([]);
  const [modoCaixa, setModoCaixa] = useState(false);
  const matriz = lojaAtiva?.tipo === 'MATRIZ';
  const [jaExiste, setJaExiste] = useState(false);
  const [erro, setErro] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [carregandoData, setCarregandoData] = useState(true);
  const consultaAtual = useRef('');
  consultaAtual.current = `${lojaAtiva?.id}:${data}`;

  const centavos = (campo: string) => Math.round(Number(form[campo] || 0) * 100);
  const dinheiroApurado = (centavos('final') - centavos('inicial') + centavos('retiradas')) / 100;
  const total = !matriz ? Number(form.outros || 0) : modoCaixa ? (centavos('final') - centavos('inicial') + centavos('retiradas') + centavos('itau') + centavos('pagbank')) / 100 : ['dinheiro','pix','debito','credito','aPrazo','outros']
    .reduce((s, k) => s + Number(form[k] || 0), 0);

  useDadosCompartilhados(()=>carregarHistorico());

  useEffect(() => {
    sessionStorage.removeItem('nm-fechamento-data');
    carregarExecutores();
  }, []);

  useEffect(() => {
    setForm(vazio()); setJaExiste(false); setHistorico([]);
    setModoCaixa(matriz);
    if (lojaAtiva) { carregarData(data); carregarHistorico(); }
  }, [lojaAtiva?.id]);

  async function carregarExecutores() {
    try {
      const r = await fetchAuth(`${API}/fechamento-diario/executores`);
      const d = await r.json();
      if (!r.ok || !d.sucesso) throw new Error(d.erro || 'Erro ao carregar executores.');
      setExecutores(d.executores || []);
    } catch (error) { setErro(error instanceof Error ? error.message : 'Erro ao carregar executores.'); }
  }

  async function carregarData(dia: string) {
    const consulta = `${lojaAtiva?.id}:${dia}`;
    setCarregandoData(true);
    setErro(''); setMensagem('');
    try {
      const r = await fetchAuth(`${API}/fechamento-diario?data=${dia}&lojaId=${lojaAtiva?.id || ''}`);
      const d = await r.json();
      if (consulta !== consultaAtual.current) return;
      if (!r.ok || !d.sucesso) throw new Error(d.erro || 'Erro ao consultar.');
      if (!d.fechamento) {
        setJaExiste(false);
        setForm(vazio());
        setModoCaixa(matriz);
        return;
      }
      const f = d.fechamento;
      setJaExiste(true);
      setModoCaixa(Boolean(f.caixa));
      setForm({
        dinheiro: String(f.dinheiro ?? ''),
        pix: String(f.pix ?? ''),
        debito: String(f.debito ?? ''),
        credito: String(f.credito ?? ''),
        aPrazo: String(f.aPrazo ?? ''),
        outros: String(f.outros ?? ''),
        executorId: String(f.executorId ?? ''),
        observacao: f.observacao || '',
        inicial: String(f.caixa?.inicial ?? ''), final: String(f.caixa?.final ?? ''),
        retiradas: String(f.caixa?.retiradas ?? ''), itau: String(f.caixa?.itau ?? ''),
        pagbank: String(f.caixa?.pagbank ?? ''),
        // As filiais lançam somente o total das maquininhas. O total de
        // fechamentos antigos é preservado ao abrir para conferência.
        ...(!matriz ? { dinheiro: '', pix: '', debito: '', credito: '', aPrazo: '', outros: String(f.totalInformado ?? 0) } : {}),
      });
    } catch (e: any) {
      if (consulta === consultaAtual.current) setErro(e?.message || 'Erro ao carregar fechamento.');
    } finally {
      if (consulta === consultaAtual.current) setCarregandoData(false);
    }
  }

  async function carregarHistorico() {
    const lojaConsultada = String(lojaAtiva?.id);
    try {
      const r = await fetchAuth(`${API}/fechamento-diario?lojaId=${lojaAtiva?.id || ''}`);
      const d = await r.json();
      if (consultaAtual.current.split(':')[0] === lojaConsultada && r.ok && d.sucesso) setHistorico(d.fechamentos || []);
    } catch {}
  }

  function mudar(campo: string, valor: string) {
    setForm((a: any) => ({ ...a, [campo]: valor }));
    setMensagem('');
  }

  async function salvar() {
    setErro(''); setMensagem('');
    if (!lojaAtiva) { setErro('Selecione a unidade do fechamento.'); return; }
    if (modoCaixa && (form.inicial === '' || form.final === '')) {
      setErro('Informe o caixa inicial e o valor final em caixa.'); return;
    }
    let motivoAlteracao = '';
    if (jaExiste) {
      motivoAlteracao = window.prompt('Informe o motivo da alteração deste fechamento:') || '';
      if (motivoAlteracao.trim().length < 5) {
        setErro('Para alterar um fechamento já salvo, informe o motivo da alteração.');
        return;
      }
    }

    setSalvando(true);
    try {
      const r = await fetchAuth(`${API}/fechamento-diario`, {
        method: 'PUT',
        body: JSON.stringify({
          dataReferencia: data,
          lojaId: lojaAtiva.id,
          ...(modoCaixa ? { caixa: {
            inicial: Number(form.inicial), final: Number(form.final),
            retiradas: Number(form.retiradas || 0), itau: Number(form.itau || 0),
            pagbank: Number(form.pagbank || 0),
          } } : {}),
          dinheiro: modoCaixa ? 0 : Number(form.dinheiro || 0),
          pix: modoCaixa ? 0 : Number(form.pix || 0),
          debito: modoCaixa ? 0 : Number(form.debito || 0),
          credito: modoCaixa ? 0 : Number(form.credito || 0),
          aPrazo: modoCaixa ? 0 : Number(form.aPrazo || 0),
          outros: modoCaixa ? 0 : Number(form.outros || 0),
          executorId: Number(form.executorId || 0) || null,
          observacao: form.observacao,
          motivoAlteracao,
        }),
      });
      const d = await r.json();
      if (!r.ok || !d.sucesso) throw new Error(d.erro || 'Erro ao salvar.');
      setMensagem(`Fechamento diário de ${lojaAtiva.nome} salvo.`);
      setJaExiste(true);
      await carregarHistorico();
    } catch (e: any) {
      setErro(e?.message || 'Erro ao salvar fechamento.');
    } finally {
      setSalvando(false);
    }
  }

  const card: React.CSSProperties = {
    background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 18
  };

  return (
    <div className="module-page fechamento-page">
      <div className="page-header">
        <div>
          <h1>Fechamento Diário</h1>
          <p>Lançamento manual e independente das vendas registradas no PDV.</p>
        </div>
      </div>

      {erro && <div style={{marginTop:16,padding:12,background:'#fff2f2',borderRadius:10,color:'#b42318'}}>{erro}</div>}
      {mensagem && <div style={{marginTop:16,padding:12,background:'#f2fff5',borderRadius:10}}>{mensagem}</div>}

      <div className="module-grid">
        <section style={card}>
          <h2 style={{marginTop:0}}>Lançamento manual</h2>
          <label style={{display:'block',marginBottom:16,fontWeight:600}}>
            Unidade do fechamento
            <select
              aria-label="Unidade do fechamento"
              value={lojaAtiva?.id ?? ''}
              onChange={(e) => selecionarLoja(Number(e.target.value))}
              disabled={salvando || carregandoLojas || lojas.length === 0}
              style={{display:'block',width:'100%',marginTop:6,padding:'10px 12px',minHeight:44,border:'1px solid #d1d5db',borderRadius:8,background:'#fff',fontSize:16}}
            >
              {!lojaAtiva && <option value="">Selecione a unidade</option>}
              {lojas.map(loja => <option key={loja.id} value={loja.id}>{loja.nome}</option>)}
            </select>
          </label>

          <label>Data
            <input type="date" value={data} onChange={(e) => {
              const d=e.target.value; setData(d); carregarData(d);
            }} style={{display:'block',marginTop:5,marginBottom:15}} />
          </label>

          {matriz && jaExiste && !modoCaixa && <p>
            Fechamento antigo por forma de pagamento. Os valores originais foram preservados.{' '}
            <button type="button" onClick={() => setModoCaixa(true)}>Usar conferência de caixa</button>
          </p>}

          <div className="module-fields">
            {(!matriz ? [['outros', 'Maquininhas']] : modoCaixa ? [
              ['inicial','Caixa inicial'], ['final','Valor final em caixa'],
              ['itau','Maquininha Laranja / Itaú'], ['pagbank','Maquininha Amarela / PagBank'],
              ['retiradas','Retirada em dinheiro'],
            ] : [
              ['dinheiro','Dinheiro'],['pix','PIX'],['debito','Débito'],
              ['credito','Crédito'],['aPrazo','A Prazo'],['outros','Outros']
            ]).map(([campo,nome]) => (
              <label key={campo}>{nome}
                <input aria-label={nome} type="number" min="0" step="0.01"
                  value={form[campo]}
                  onChange={(e)=>mudar(campo,e.target.value)}
                  placeholder="0,00"
                  style={{display:'block',width:'100%',boxSizing:'border-box',marginTop:5}} />
              </label>
            ))}
          </div>

          <div style={{...card,marginTop:16}}>
            {modoCaixa && <>
              <small>Dinheiro apurado: caixa final − caixa inicial + retiradas</small>
              <strong style={{display:'block',margin:'5px 0 12px'}}>{moeda(dinheiroApurado)}</strong>
            </>}
            <small>{!matriz ? 'Faturamento diário: maquininhas' : modoCaixa ? 'Faturamento diário: dinheiro apurado + Itaú + PagBank' : 'Total informado manualmente'}</small>
            <strong style={{display:'block',fontSize:28,marginTop:5}}>{moeda(total)}</strong>
          </div>

          <label style={{display:'block',marginTop:15}}>Executor responsável
            <select value={form.executorId} onChange={(e)=>mudar('executorId',e.target.value)}
              style={{display:'block',width:'100%',marginTop:5,padding:8}}>
              <option value="">Selecione</option>
              {executores.map(e => <option key={e.id} value={e.id}>{e.codigo} - {e.nome}</option>)}
            </select>
          </label>

          <label style={{display:'block',marginTop:15}}>Observações
            <textarea value={form.observacao} onChange={(e)=>mudar('observacao',e.target.value)}
              style={{display:'block',width:'100%',minHeight:80,boxSizing:'border-box',marginTop:5}} />
          </label>

          <button className="module-save" type="button" onClick={salvar} disabled={salvando || carregandoData}
            style={{width:'100%',marginTop:16,padding:11}}>
            {salvando ? 'Salvando...' : carregandoData ? 'Carregando...' : jaExiste ? 'Salvar alteração' : 'Salvar fechamento'}
          </button>

          <small style={{display:'block',marginTop:10,color:'#737373'}}>
            {modoCaixa && 'O caixa final não é somado integralmente. As retiradas recompõem o dinheiro das vendas. Informe nas maquininhas os totais dos recebimentos, sem repetir valores. '}
            O faturamento salvo gera automaticamente uma entrada recebida no Financeiro e compõe as Entradas do mês na Visão Geral. Este lançamento não importa valores da aba Vendas e não altera o Valor do Caixa.
          </small>
        </section>

        <section style={card}>
          <h2 style={{marginTop:0}}>Histórico</h2>
          <p className="active-store-note">{lojaAtiva?.nome}{!matriz && ' · Maquininhas'}</p>
          {historico.length===0 ? <p>Nenhum fechamento salvo.</p> :
            historico.map(f => (
              <button key={f.id} type="button" onClick={()=>{
                setData(f.dataReferencia); carregarData(f.dataReferencia);
              }} style={{
                width:'100%',textAlign:'left',padding:12,marginBottom:8,
                background:'#fff',border:'1px solid #e5e7eb',borderRadius:9,cursor:'pointer'
              }}>
                <strong>{f.dataReferencia}</strong>
                <span style={{float:'right',fontWeight:700}}>{moeda(f.totalInformado)}</span>
                <small style={{display:'block',marginTop:4}}>
                  {f.executorNome || f.usuarioNome || 'Sem executor informado'}
                  {f.caixa && <span style={{display:'block',marginTop:4}}>
                    Inicial: {moeda(f.caixa.inicial)} · Final: {moeda(f.caixa.final)} · Retiradas: {moeda(f.caixa.retiradas)}<br />
                    Itaú: {moeda(f.caixa.itau)} · PagBank: {moeda(f.caixa.pagbank)}
                  </span>}
                </small>
              </button>
            ))
          }
        </section>
      </div>
    </div>
  );
}
