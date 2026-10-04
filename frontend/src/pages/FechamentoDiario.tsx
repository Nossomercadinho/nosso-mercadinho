import { useEffect, useState } from 'react';

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
  return fetch(url, { ...init, headers });
}
const vazio = () => ({
  dinheiro: '', pix: '', debito: '', credito: '', aPrazo: '', outros: '',
  executorId: '', observacao: ''
});

export default function FechamentoDiario() {
  const [data, setData] = useState(hoje());
  const [form, setForm] = useState<any>(vazio());
  const [executores, setExecutores] = useState<any[]>([]);
  const [historico, setHistorico] = useState<any[]>([]);
  const [jaExiste, setJaExiste] = useState(false);
  const [erro, setErro] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [salvando, setSalvando] = useState(false);

  const total = ['dinheiro','pix','debito','credito','aPrazo','outros']
    .reduce((s, k) => s + Number(form[k] || 0), 0);

  useEffect(() => {
    carregarExecutores();
    carregarData(data);
    carregarHistorico();
  }, []);

  async function carregarExecutores() {
    const r = await fetchAuth(`${API}/fechamento-diario/executores`);
    const d = await r.json();
    if (r.ok && d.sucesso) setExecutores(d.executores || []);
  }

  async function carregarData(dia: string) {
    setErro(''); setMensagem('');
    try {
      const r = await fetchAuth(`${API}/fechamento-diario?data=${dia}`);
      const d = await r.json();
      if (!r.ok || !d.sucesso) throw new Error(d.erro || 'Erro ao consultar.');
      if (!d.fechamento) {
        setJaExiste(false);
        setForm(vazio());
        return;
      }
      const f = d.fechamento;
      setJaExiste(true);
      setForm({
        dinheiro: String(f.dinheiro ?? ''),
        pix: String(f.pix ?? ''),
        debito: String(f.debito ?? ''),
        credito: String(f.credito ?? ''),
        aPrazo: String(f.aPrazo ?? ''),
        outros: String(f.outros ?? ''),
        executorId: String(f.executorId ?? ''),
        observacao: f.observacao || '',
      });
    } catch (e: any) {
      setErro(e?.message || 'Erro ao carregar fechamento.');
    }
  }

  async function carregarHistorico() {
    try {
      const r = await fetchAuth(`${API}/fechamento-diario`);
      const d = await r.json();
      if (r.ok && d.sucesso) setHistorico(d.fechamentos || []);
    } catch {}
  }

  function mudar(campo: string, valor: string) {
    setForm((a: any) => ({ ...a, [campo]: valor }));
    setMensagem('');
  }

  async function salvar() {
    setErro(''); setMensagem('');
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
          lojaId: 1,
          dinheiro: Number(form.dinheiro || 0),
          pix: Number(form.pix || 0),
          debito: Number(form.debito || 0),
          credito: Number(form.credito || 0),
          aPrazo: Number(form.aPrazo || 0),
          outros: Number(form.outros || 0),
          executorId: Number(form.executorId || 0) || null,
          observacao: form.observacao,
          motivoAlteracao,
        }),
      });
      const d = await r.json();
      if (!r.ok || !d.sucesso) throw new Error(d.erro || 'Erro ao salvar.');
      setMensagem('Fechamento diário salvo.');
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
    <div>
      <div className="page-header">
        <div>
          <h1>Fechamento Diário</h1>
          <p>Lançamento manual e independente das vendas registradas no PDV.</p>
        </div>
      </div>

      {erro && <div style={{marginTop:16,padding:12,background:'#fff2f2',borderRadius:10,color:'#b42318'}}>{erro}</div>}
      {mensagem && <div style={{marginTop:16,padding:12,background:'#f2fff5',borderRadius:10}}>{mensagem}</div>}

      <div style={{display:'grid',gridTemplateColumns:'minmax(480px,1fr) minmax(380px,.8fr)',gap:18,marginTop:18,alignItems:'start'}}>
        <section style={card}>
          <h2 style={{marginTop:0}}>Lançamento manual — Matriz</h2>

          <label>Data
            <input type="date" value={data} onChange={(e) => {
              const d=e.target.value; setData(d); carregarData(d);
            }} style={{display:'block',marginTop:5,marginBottom:15}} />
          </label>

          <div style={{display:'grid',gridTemplateColumns:'repeat(2,minmax(160px,1fr))',gap:12}}>
            {[
              ['dinheiro','Dinheiro'],['pix','PIX'],['debito','Débito'],
              ['credito','Crédito'],['aPrazo','A Prazo'],['outros','Outros']
            ].map(([campo,nome]) => (
              <label key={campo}>{nome}
                <input type="number" min="0" step="0.01"
                  value={form[campo]}
                  onChange={(e)=>mudar(campo,e.target.value)}
                  placeholder="0,00"
                  style={{display:'block',width:'100%',boxSizing:'border-box',marginTop:5}} />
              </label>
            ))}
          </div>

          <div style={{...card,marginTop:16}}>
            <small>Total informado manualmente</small>
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

          <button type="button" onClick={salvar} disabled={salvando}
            style={{width:'100%',marginTop:16,padding:11}}>
            {salvando ? 'Salvando...' : jaExiste ? 'Salvar alteração' : 'Salvar fechamento'}
          </button>

          <small style={{display:'block',marginTop:10,color:'#737373'}}>
            Este lançamento não importa valores da aba Vendas e não altera o Valor do Caixa.
          </small>
        </section>

        <section style={card}>
          <h2 style={{marginTop:0}}>Histórico</h2>
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
                </small>
              </button>
            ))
          }
        </section>
      </div>
    </div>
  );
}
