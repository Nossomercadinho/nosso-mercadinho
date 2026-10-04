import { useEffect, useMemo, useState } from 'react';

const API = '/api';

function hoje() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dia}`;
}

function moeda(v: unknown) {
  return Number(v || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

function dataHora(v: string) {
  if (!v) return '-';
  const d = new Date(v.includes('T') ? v : v.replace(' ', 'T') + 'Z');
  return Number.isNaN(d.getTime()) ? v : d.toLocaleString('pt-BR');
}

function fetchAuth(input: RequestInfo | URL, init: RequestInit = {}) {
  const token = localStorage.getItem('token');
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  return fetch(input, { ...init, headers });
}

type Venda = {
  id: number;
  lojaId: number;
  lojaNome: string;
  executorNome?: string;
  usuarioNome?: string;
  status: string;
  valorTotal: number;
  criadoEm: string;
  formasPagamento?: string;
  quantidadeItens?: number;
};

type Item = {
  id: number;
  produtoId: number;
  ean?: string;
  descricao: string;
  quantidade: number;
  precoUnitario: number;
  subtotal: number;
};

export default function Vendas() {
  const usuario = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('usuarioLogado') || '{}');
    } catch {
      return {};
    }
  }, []);
  const perfil = String(usuario?.perfil || '').toUpperCase();
  const caixa = perfil === 'CAIXA';
  const acessoTotal = perfil === 'ADMINISTRADOR' || perfil === 'CEO';

  const [dataInicio, setDataInicio] = useState(hoje());
  const [dataFim, setDataFim] = useState(hoje());
  const [vendas, setVendas] = useState<Venda[]>([]);
  const [resumo, setResumo] = useState<any>({
    quantidade: 0,
    total: 0,
    ticketMedio: 0,
    porForma: [],
  });
  const [valorCaixa, setValorCaixa] = useState('');
  const [salvandoCaixa, setSalvandoCaixa] = useState(false);
  const [caixaSalvo, setCaixaSalvo] = useState('');
  const [caixaAtualizadoPor, setCaixaAtualizadoPor] = useState('');
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [detalhe, setDetalhe] = useState<any>(null);
  const [editando, setEditando] = useState(false);
  const [itensEdicao, setItensEdicao] = useState<Item[]>([]);
  const [formaEdicao, setFormaEdicao] = useState('');
  const [motivo, setMotivo] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    carregar();
    carregarValorCaixa(dataInicio);
  }, []);

  async function carregarValorCaixa(data: string) {
    setCaixaSalvo('');
    try {
      const params = new URLSearchParams({ data });
      const r = await fetchAuth(`${API}/vendas-gestao/caixa-diario?${params.toString()}`);
      const d = await r.json();
      if (!r.ok || !d.sucesso) {
        throw new Error(d.erro || 'Erro ao carregar o valor do caixa.');
      }

      const valor = d.caixa?.valorCaixa;
      setValorCaixa(valor === null || valor === undefined ? '' : String(valor));
      setCaixaAtualizadoPor(d.caixa?.usuarioNome || '');
    } catch (e: any) {
      setErro(e?.message || 'Erro ao carregar o valor do caixa.');
    }
  }

  async function salvarValorCaixa() {
    if (!dataInicio || dataInicio !== dataFim) {
      setErro('Para salvar o Valor do Caixa, selecione apenas um dia.');
      return;
    }

    if (valorCaixa === '' || !Number.isFinite(Number(valorCaixa)) || Number(valorCaixa) < 0) {
      setErro('Informe um Valor do Caixa válido.');
      return;
    }

    setSalvandoCaixa(true);
    setCaixaSalvo('');
    setErro('');

    try {
      const r = await fetchAuth(`${API}/vendas-gestao/caixa-diario`, {
        method: 'PUT',
        body: JSON.stringify({
          data: dataInicio,
          valorCaixa: Number(valorCaixa),
          lojaId: 1,
        }),
      });
      const d = await r.json();
      if (!r.ok || !d.sucesso) {
        throw new Error(d.erro || 'Erro ao salvar o valor do caixa.');
      }

      setValorCaixa(String(d.caixa?.valorCaixa ?? valorCaixa));
      setCaixaAtualizadoPor(d.caixa?.usuarioNome || '');
      setCaixaSalvo('Valor do caixa salvo no banco.');
    } catch (e: any) {
      setErro(e?.message || 'Erro ao salvar o valor do caixa.');
    } finally {
      setSalvandoCaixa(false);
    }
  }

  async function carregar() {
    setCarregando(true);
    setErro('');
    try {
      const params = new URLSearchParams({
        dataInicio,
        dataFim,
      });
      const r = await fetchAuth(`${API}/vendas-gestao?${params.toString()}`);
      const d = await r.json();
      if (!r.ok || !d.sucesso) throw new Error(d.erro || 'Erro ao carregar vendas.');
      setVendas(d.vendas || []);
      setResumo(d.resumo || {});
    } catch (e: any) {
      setErro(e?.message || 'Erro ao carregar vendas.');
    } finally {
      setCarregando(false);
    }
  }

  async function abrir(id: number) {
    setErro('');
    try {
      const r = await fetchAuth(`${API}/vendas-gestao/${id}`);
      const d = await r.json();
      if (!r.ok || !d.sucesso) throw new Error(d.erro || 'Erro ao abrir venda.');
      setDetalhe(d);
      setEditando(false);
    } catch (e: any) {
      setErro(e?.message || 'Erro ao abrir venda.');
    }
  }

  function iniciarCorrecao() {
    setItensEdicao(
      (detalhe?.itens || []).map((i: Item) => ({ ...i }))
    );
    setFormaEdicao(
      detalhe?.pagamentos?.[0]?.formaPagamento || ''
    );
    setMotivo('');
    setEditando(true);
  }

  async function salvarCorrecao() {
    if (!detalhe?.venda?.id) return;
    setSalvando(true);
    setErro('');
    try {
      const r = await fetchAuth(
        `${API}/vendas-gestao/${detalhe.venda.id}/corrigir`,
        {
          method: 'PUT',
          body: JSON.stringify({
            motivo,
            formaPagamento: formaEdicao,
            itens: itensEdicao.map((i) => ({
              id: i.id,
              quantidade: Number(i.quantidade),
            })),
          }),
        }
      );
      const d = await r.json();
      if (!r.ok || !d.sucesso) throw new Error(d.erro || 'Erro ao corrigir.');
      setEditando(false);
      await abrir(detalhe.venda.id);
      await carregar();
    } catch (e: any) {
      setErro(e?.message || 'Erro ao corrigir venda.');
    } finally {
      setSalvando(false);
    }
  }

  async function cancelarVenda() {
    if (!detalhe?.venda?.id) return;
    const motivoCancelamento = window.prompt(
      'Informe o motivo do cancelamento:'
    );
    if (!motivoCancelamento) return;

    setErro('');
    try {
      const r = await fetchAuth(
        `${API}/vendas-gestao/${detalhe.venda.id}/cancelar`,
        {
          method: 'POST',
          body: JSON.stringify({ motivo: motivoCancelamento }),
        }
      );
      const d = await r.json();
      if (!r.ok || !d.sucesso) throw new Error(d.erro || 'Erro ao cancelar.');
      await abrir(detalhe.venda.id);
      await carregar();
    } catch (e: any) {
      setErro(e?.message || 'Erro ao cancelar venda.');
    }
  }

  function totalForma(nome: string) {
    const item = (resumo.porForma || []).find(
      (x: any) => String(x.formaPagamento).toUpperCase() === nome
    );
    return Number(item?.total || 0);
  }

  const totalEdicao = itensEdicao.reduce(
    (s, i) => s + Number(i.quantidade || 0) * Number(i.precoUnitario || 0),
    0
  );

  const card: React.CSSProperties = {
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 12,
    padding: 18,
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Vendas</h1>
          <p>
            {caixa
              ? 'Vendas da Matriz, conferência e correções.'
              : 'Acompanhamento das vendas, pagamentos e correções.'}
          </p>
        </div>
      </div>

      {erro && (
        <div style={{
          marginTop: 16, padding: 14, borderRadius: 10,
          background: '#fff2f2', color: '#b42318',
        }}>
          {erro}
        </div>
      )}

      <section style={{ ...card, marginTop: 20 }}>
        <div style={{
          display: 'flex', gap: 12, alignItems: 'end', flexWrap: 'wrap',
        }}>
          <label>
            <span style={{ display: 'block', marginBottom: 5 }}>De</span>
            <input type="date" value={dataInicio}
              onChange={(e) => {
                const novaData = e.target.value;
                setDataInicio(novaData);
                if (novaData === dataFim) carregarValorCaixa(novaData);
                else {
                  setValorCaixa('');
                  setCaixaAtualizadoPor('');
                }
              }} />
          </label>
          <label>
            <span style={{ display: 'block', marginBottom: 5 }}>Até</span>
            <input type="date" value={dataFim}
              onChange={(e) => {
                const novaData = e.target.value;
                setDataFim(novaData);
                if (novaData === dataInicio) carregarValorCaixa(novaData);
                else {
                  setValorCaixa('');
                  setCaixaAtualizadoPor('');
                }
              }} />
          </label>
          <button type="button" onClick={carregar}>Atualizar</button>
          <button type="button" onClick={() => {
            const h = hoje();
            setDataInicio(h);
            setDataFim(h);
            carregarValorCaixa(h);
            setTimeout(() => carregar(), 0);
          }}>
            Hoje
          </button>
        </div>
      </section>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, minmax(170px, 1fr))',
        gap: 14, marginTop: 16,
      }}>
        <div style={card}>
          <small>Valor do Caixa</small>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
            <span style={{ fontWeight: 700 }}>R$</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={valorCaixa}
              onChange={(e) => {
                setValorCaixa(e.target.value);
                setCaixaSalvo('');
              }}
              placeholder="0,00"
              style={{ width: '100%', fontSize: 20, fontWeight: 700 }}
            />
          </div>
          <button
            type="button"
            onClick={salvarValorCaixa}
            disabled={salvandoCaixa || dataInicio !== dataFim}
            style={{ marginTop: 9, width: '100%' }}
          >
            {salvandoCaixa ? 'Salvando...' : 'Salvar Valor do Caixa'}
          </button>
          {caixaSalvo && (
            <small style={{ display: 'block', marginTop: 7 }}>
              {caixaSalvo}
            </small>
          )}
          {caixaAtualizadoPor && (
            <small style={{ display: 'block', marginTop: 4, color: '#737373' }}>
              Último lançamento: {caixaAtualizadoPor}
            </small>
          )}
          <small style={{ display: 'block', marginTop: 7, color: '#737373' }}>
            Salvo por data na aba Vendas. Não integra o Fechamento Diário.
          </small>
        </div>

        <div style={card}>
          <small>Total de Vendas do Dia</small>
          <strong style={{ display: 'block', fontSize: 26, marginTop: 5 }}>
            {moeda(resumo.total)}
          </strong>
          <small style={{ color: '#737373' }}>Calculado pelas vendas do PDV.</small>
        </div>

        <div style={card}>
          <small>Quantidade de vendas</small>
          <strong style={{ display: 'block', fontSize: 26, marginTop: 5 }}>
            {resumo.quantidade || 0}
          </strong>
        </div>

        <div style={card}>
          <small>Ticket médio</small>
          <strong style={{ display: 'block', fontSize: 26, marginTop: 5 }}>
            {moeda(resumo.ticketMedio)}
          </strong>
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(5, minmax(140px, 1fr))',
        gap: 12, marginTop: 12,
      }}>
        {[
          ['Dinheiro', totalForma('DINHEIRO')],
          ['PIX', totalForma('PIX')],
          ['Débito', totalForma('DEBITO')],
          ['Crédito', totalForma('CREDITO')],
          ['A Prazo', totalForma('A_PRAZO')],
        ].map(([nome, valor]) => (
          <div key={String(nome)} style={{ ...card, padding: 14 }}>
            <small>{String(nome)}</small>
            <strong style={{ display: 'block', fontSize: 19, marginTop: 4 }}>
              {moeda(valor)}
            </strong>
          </div>
        ))}
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(500px, 1.4fr) minmax(420px, 1fr)',
        gap: 18, marginTop: 18, alignItems: 'start',
      }}>
        <section style={card}>
          <h2 style={{ marginTop: 0 }}>Vendas do período</h2>
          {carregando ? (
            <p>Carregando...</p>
          ) : vendas.length === 0 ? (
            <p>Nenhuma venda encontrada.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Venda', 'Data', 'Executor', 'Pagamento', 'Total', 'Status'].map((x) => (
                      <th key={x} style={{
                        padding: 9, textAlign: 'left',
                        borderBottom: '1px solid #ddd',
                      }}>{x}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {vendas.map((v) => (
                    <tr key={v.id}
                      onClick={() => abrir(v.id)}
                      style={{ cursor: 'pointer' }}>
                      <td style={{ padding: 9 }}>#{v.id}</td>
                      <td style={{ padding: 9 }}>{dataHora(v.criadoEm)}</td>
                      <td style={{ padding: 9 }}>{v.executorNome || '-'}</td>
                      <td style={{ padding: 9 }}>
                        {String(v.formasPagamento || '').replaceAll('_', ' ')}
                      </td>
                      <td style={{ padding: 9, fontWeight: 700 }}>
                        {moeda(v.valorTotal)}
                      </td>
                      <td style={{ padding: 9 }}>{v.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section style={card}>
          {!detalhe ? (
            <div style={{
              minHeight: 280, display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              color: '#737373', textAlign: 'center',
            }}>
              Clique em uma venda para conferir os detalhes.
            </div>
          ) : (
            <>
              <div style={{
                display: 'flex', justifyContent: 'space-between',
                gap: 12, alignItems: 'start',
              }}>
                <div>
                  <h2 style={{ margin: 0 }}>Venda #{detalhe.venda.id}</h2>
                  <p style={{ marginTop: 5 }}>
                    {dataHora(detalhe.venda.criado_em)} · {detalhe.venda.lojaNome}
                  </p>
                </div>
                <strong style={{ fontSize: 22 }}>
                  {moeda(detalhe.venda.valor_total)}
                </strong>
              </div>

              <p>
                <strong>Executor:</strong> {detalhe.venda.executorNome || '-'}
                <br />
                <strong>Status:</strong> {detalhe.venda.status}
                {detalhe.venda.clienteNome && (
                  <>
                    <br />
                    <strong>Cliente:</strong> {detalhe.venda.clienteNome}
                  </>
                )}
              </p>

              {!editando ? (
                <>
                  <h3>Itens</h3>
                  {(detalhe.itens || []).map((i: Item) => (
                    <div key={i.id} style={{
                      display: 'flex', justifyContent: 'space-between',
                      gap: 12, padding: '9px 0',
                      borderBottom: '1px solid #eee',
                    }}>
                      <span>
                        {i.descricao}
                        <small style={{ display: 'block' }}>
                          {i.quantidade} × {moeda(i.precoUnitario)}
                        </small>
                      </span>
                      <strong>{moeda(i.subtotal)}</strong>
                    </div>
                  ))}

                  <h3>Pagamento</h3>
                  {(detalhe.pagamentos || []).map((p: any) => (
                    <p key={p.id}>
                      {String(p.formaPagamento).replaceAll('_', ' ')} —{' '}
                      <strong>{moeda(p.valor)}</strong>
                    </p>
                  ))}

                  {detalhe.venda.status === 'CONCLUIDA' && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
                      <button type="button" onClick={iniciarCorrecao}>
                        Corrigir venda
                      </button>
                      {acessoTotal && (
                        <button type="button" onClick={cancelarVenda}>
                          Cancelar venda
                        </button>
                      )}
                    </div>
                  )}

                  {(detalhe.correcoes || []).length > 0 && (
                    <>
                      <h3 style={{ marginTop: 24 }}>Histórico de correções</h3>
                      {detalhe.correcoes.map((c: any) => (
                        <div key={c.id} style={{
                          padding: '8px 0', borderBottom: '1px solid #eee',
                        }}>
                          <strong>{c.motivo}</strong>
                          <small style={{ display: 'block' }}>
                            {dataHora(c.criadoEm)} · {c.usuarioNome || 'Usuário'}
                          </small>
                        </div>
                      ))}
                    </>
                  )}
                </>
              ) : (
                <>
                  <h3>Corrigir quantidades</h3>
                  {itensEdicao.map((i, idx) => (
                    <div key={i.id} style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 90px',
                      gap: 10, alignItems: 'center',
                      marginBottom: 10,
                    }}>
                      <span>
                        {i.descricao}
                        <small style={{ display: 'block' }}>
                          {moeda(i.precoUnitario)} cada
                        </small>
                      </span>
                      <input
                        type="number"
                        min="0.001"
                        step="1"
                        value={i.quantidade}
                        onChange={(e) => {
                          const copia = [...itensEdicao];
                          copia[idx] = {
                            ...copia[idx],
                            quantidade: Number(e.target.value),
                          };
                          setItensEdicao(copia);
                        }}
                      />
                    </div>
                  ))}

                  <label>
                    <strong>Forma de pagamento</strong>
                    <select
                      value={formaEdicao}
                      onChange={(e) => setFormaEdicao(e.target.value)}
                      style={{ display: 'block', width: '100%', marginTop: 6, padding: 8 }}
                    >
                      <option value="PIX">PIX</option>
                      <option value="DINHEIRO">Dinheiro</option>
                      <option value="DEBITO">Débito</option>
                      <option value="CREDITO">Crédito</option>
                      <option value="A_PRAZO">A Prazo</option>
                    </select>
                  </label>

                  <p style={{ fontSize: 18 }}>
                    Novo total: <strong>{moeda(totalEdicao)}</strong>
                  </p>

                  <label>
                    <strong>Motivo da correção *</strong>
                    <textarea
                      value={motivo}
                      onChange={(e) => setMotivo(e.target.value)}
                      placeholder="Ex.: quantidade lançada incorretamente"
                      style={{
                        display: 'block', width: '100%',
                        minHeight: 70, marginTop: 6, boxSizing: 'border-box',
                      }}
                    />
                  </label>

                  <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                    <button
                      type="button"
                      onClick={salvarCorrecao}
                      disabled={salvando}
                    >
                      {salvando ? 'Salvando...' : 'Salvar correção'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditando(false)}
                      disabled={salvando}
                    >
                      Voltar
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
