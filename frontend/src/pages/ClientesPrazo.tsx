import './ClientesPrazo.css';
import { useEffect, useMemo, useState } from 'react';

const API = '/api';

type Cliente = {
  id: number;
  nome: string;
  cpf: string;
  telefone: string;
  quantidadeCompras?: number;
  totalComprado?: number;
  totalPago?: number;
  saldoDevedor?: number;
  limiteCredito?: number;
  limiteDisponivel?: number;
};

type Conta = {
  id: number;
  vendaId: number;
  valorOriginal: number;
  valorPago: number;
  saldo: number;
  status: string;
  criadoEm: string;
  lojaNome?: string;
  executorNome?: string;
};

type Recebimento = {
  id: number;
  contaReceberId: number;
  vendaId: number;
  valor: number;
  formaPagamento: string;
  observacao?: string;
  recebidoEm: string;
  executorNome?: string;
};

function moeda(valor: unknown) {
  return Number(valor || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

function dataHora(valor: string) {
  if (!valor) return '-';
  const d = new Date(valor.includes('T') ? valor : valor.replace(' ', 'T') + 'Z');
  return Number.isNaN(d.getTime()) ? valor : d.toLocaleString('pt-BR');
}

function cpfFormatado(cpf: string) {
  const d = String(cpf || '').replace(/\D/g, '');
  if (d.length !== 11) return cpf || '-';
  return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

function fetchAutenticado(input: RequestInfo | URL, init: RequestInit = {}) {
  const token = localStorage.getItem('token');
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  return fetch(input, { ...init, headers });
}

export default function ClientesPrazo() {
  const [termo, setTermo] = useState('');
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [selecionado, setSelecionado] = useState<Cliente | null>(null);
  const [contas, setContas] = useState<Conta[]>([]);
  const [recebimentos, setRecebimentos] = useState<Recebimento[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [contaReceber, setContaReceber] = useState<Conta | null>(null);
  const [valor, setValor] = useState('');
  const [forma, setForma] = useState('PIX');
  const [executorCodigo, setExecutorCodigo] = useState('');
  const [observacao, setObservacao] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [editandoLimite, setEditandoLimite] = useState(false);
  const [limiteCredito, setLimiteCredito] = useState('');
  const [salvandoLimite, setSalvandoLimite] = useState(false);

  useEffect(() => {
    carregarClientes('');
  }, []);

  const totalAberto = useMemo(
    () => clientes.reduce((soma, c) => soma + Number(c.saldoDevedor || 0), 0),
    [clientes]
  );

  const contasAbertas = useMemo(
    () => contas.filter((c) => Number(c.saldo || 0) > 0).length,
    [contas]
  );

  const totalPagoCliente = useMemo(
    () => contas.reduce((soma, c) => soma + Number(c.valorPago || 0), 0),
    [contas]
  );

  async function carregarClientes(q = termo) {
    setCarregando(true);
    setErro('');
    try {
      const resposta = await fetchAutenticado(
        `${API}/clientes-prazo?q=${encodeURIComponent(q)}`
      );
      const dados = await resposta.json();
      if (!resposta.ok || !dados.sucesso) {
        throw new Error(dados.erro || 'Não foi possível carregar os clientes.');
      }
      setClientes(dados.clientes || []);
    } catch (error: any) {
      setErro(error?.message || 'Erro ao carregar.');
    } finally {
      setCarregando(false);
    }
  }

  async function abrirCliente(cliente: Cliente) {
    setErro('');
    try {
      const resposta = await fetchAutenticado(`${API}/clientes-prazo/${cliente.id}`);
      const dados = await resposta.json();
      if (!resposta.ok || !dados.sucesso) {
        throw new Error(dados.erro || 'Não foi possível abrir o cliente.');
      }
      setSelecionado(dados.cliente);
      setLimiteCredito(Number(dados.cliente?.limiteCredito || 0).toFixed(2).replace('.', ','));
      setContas(dados.contas || []);
      setRecebimentos(dados.recebimentos || []);
      setContaReceber(null);
    } catch (error: any) {
      setErro(error?.message || 'Erro ao abrir cliente.');
    }
  }

  async function salvarLimiteCredito() {
    if (!selecionado) return;
    setSalvandoLimite(true); setErro('');
    try {
      const resposta = await fetchAutenticado(`${API}/clientes-prazo/${selecionado.id}/limite`, { method: 'PATCH', body: JSON.stringify({ limiteCredito }) });
      const dados = await resposta.json();
      if (!resposta.ok || !dados.sucesso) throw new Error(dados.erro || 'Não foi possível atualizar o limite.');
      setEditandoLimite(false);
      await abrirCliente(selecionado);
      await carregarClientes(termo);
    } catch (error: any) { setErro(error?.message || 'Erro ao atualizar limite.'); }
    finally { setSalvandoLimite(false); }
  }

  function prepararRecebimento(conta: Conta) {
    setContaReceber(conta);
    setValor(Number(conta.saldo || 0).toFixed(2).replace('.', ','));
    setForma('PIX');
    setExecutorCodigo('');
    setObservacao('');
  }

  async function confirmarRecebimento() {
    if (!contaReceber || !selecionado) return;

    setSalvando(true);
    setErro('');

    try {
      const resposta = await fetchAutenticado(
        `${API}/clientes-prazo/contas/${contaReceber.id}/recebimentos`,
        {
          method: 'POST',
          body: JSON.stringify({
            valor,
            formaPagamento: forma,
            executorCodigo: executorCodigo.trim() || undefined,
            observacao: observacao.trim() || undefined,
          }),
        }
      );

      const dados = await resposta.json();
      if (!resposta.ok || !dados.sucesso) {
        throw new Error(dados.erro || 'Não foi possível registrar o recebimento.');
      }

      setContaReceber(null);
      await abrirCliente(selecionado);
      await carregarClientes(termo);
    } catch (error: any) {
      setErro(error?.message || 'Erro ao registrar recebimento.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="cp-page">
      <header className="cp-header">
        <div>
          <span className="cp-eyebrow">FINANCEIRO</span>
          <h1>Clientes / A Prazo</h1>
          <p>Controle de compras fiadas, saldos e recebimentos.</p>
        </div>
        <div className="cp-header-total">
          <span>Saldo total em aberto</span>
          <strong>{moeda(totalAberto)}</strong>
          <small>{clientes.length} cliente(s) na consulta</small>
        </div>
      </header>

      {erro && <div className="cp-alert">{erro}</div>}

      <div className="cp-layout">
        <aside className="cp-sidebar">
          <div className="cp-sidebar-head">
            <div>
              <span className="cp-section-kicker">CLIENTES</span>
              <h2>Localizar cliente</h2>
            </div>
            <span className="cp-count">{clientes.length}</span>
          </div>

          <div className="cp-search">
            <span className="cp-search-icon">⌕</span>
            <input
              value={termo}
              onChange={(e) => setTermo(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && carregarClientes()}
              placeholder="Nome, CPF ou telefone"
            />
            <button type="button" onClick={() => carregarClientes()}>
              Buscar
            </button>
          </div>

          <div className="cp-total-card">
            <div>
              <span>Em aberto</span>
              <strong>{moeda(totalAberto)}</strong>
            </div>
            <div className="cp-total-icon">R$</div>
          </div>

          <div className="cp-client-list">
            {carregando ? (
              <div className="cp-empty-small">Carregando clientes...</div>
            ) : clientes.length === 0 ? (
              <div className="cp-empty-small">Nenhum cliente encontrado.</div>
            ) : (
              clientes.map((cliente) => {
                const ativo = selecionado?.id === cliente.id;
                return (
                  <button
                    key={cliente.id}
                    type="button"
                    className={`cp-client ${ativo ? 'is-active' : ''}`}
                    onClick={() => abrirCliente(cliente)}
                  >
                    <span className="cp-avatar">
                      {String(cliente.nome || '?').trim().charAt(0).toUpperCase()}
                    </span>
                    <span className="cp-client-main">
                      <strong>{cliente.nome}</strong>
                      <small>
                        {cpfFormatado(cliente.cpf)}
                        {cliente.telefone ? ` · ${cliente.telefone}` : ''}
                      </small>
                    </span>
                    <span className="cp-client-balance">
                      <small>Saldo</small>
                      <strong>{moeda(cliente.saldoDevedor)}</strong>
                      <small>Disp. {moeda(cliente.limiteDisponivel)}</small>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        <main className="cp-content">
          {!selecionado ? (
            <div className="cp-placeholder">
              <div className="cp-placeholder-icon">👤</div>
              <h2>Selecione um cliente</h2>
              <p>Escolha um cliente ao lado para visualizar compras e recebimentos.</p>
            </div>
          ) : (
            <>
              <section className="cp-client-hero">
                <div className="cp-identity">
                  <span className="cp-avatar cp-avatar-large">
                    {String(selecionado.nome || '?').trim().charAt(0).toUpperCase()}
                  </span>
                  <div>
                    <span className="cp-section-kicker">CLIENTE SELECIONADO</span>
                    <h2>{selecionado.nome}</h2>
                    <p>
                      {cpfFormatado(selecionado.cpf)}
                      {selecionado.telefone ? ` · ${selecionado.telefone}` : ''}
                    </p>
                  </div>
                </div>
                <div className="cp-debt">
                  <span>Saldo devedor</span>
                  <strong>{moeda(selecionado.saldoDevedor)}</strong>
                  <small>{contasAbertas} compra(s) em aberto</small>
                </div>
              </section>

              <section style={{ marginTop: 14, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                  <div>
                    <span className="cp-section-kicker">CRÉDITO A PRAZO</span>
                    <h3 style={{ margin: '4px 0 0' }}>Limite do cliente</h3>
                  </div>
                  {!editandoLimite ? (
                    <button type="button" className="cp-primary" onClick={() => setEditandoLimite(true)}>
                      Alterar limite
                    </button>
                  ) : (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <input
                        value={limiteCredito}
                        onChange={(e) => setLimiteCredito(e.target.value)}
                        placeholder="0,00"
                        inputMode="decimal"
                        style={{ width: 140, padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: 8 }}
                      />
                      <button type="button" className="cp-primary" onClick={salvarLimiteCredito} disabled={salvandoLimite}>
                        {salvandoLimite ? 'Salvando...' : 'Salvar limite'}
                      </button>
                      <button type="button" onClick={() => { setEditandoLimite(false); setLimiteCredito(Number(selecionado.limiteCredito || 0).toFixed(2).replace('.', ',')); }}>
                        Cancelar
                      </button>
                    </div>
                  )}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12, marginTop: 14 }}>
                  <div><small>Limite</small><div style={{ fontSize: 20, fontWeight: 900 }}>{moeda(selecionado.limiteCredito)}</div></div>
                  <div><small>Em aberto</small><div style={{ fontSize: 20, fontWeight: 900 }}>{moeda(selecionado.saldoDevedor)}</div></div>
                  <div><small>Disponível</small><div style={{ fontSize: 20, fontWeight: 900 }}>{moeda(selecionado.limiteDisponivel)}</div></div>
                </div>
                {Number(selecionado.limiteDisponivel ?? 0) <= 0 && (
                  <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 8, background: '#fff1f2', color: '#b42318', fontWeight: 800 }}>
                    BLOQUEADO PARA VENDA A PRAZO
                  </div>
                )}
              </section>

              <div className="cp-metrics">
                <div className="cp-metric">
                  <span>Compras</span>
                  <strong>{selecionado.quantidadeCompras ?? contas.length}</strong>
                  <small>registradas</small>
                </div>
                <div className="cp-metric">
                  <span>Total comprado</span>
                  <strong>
                    {moeda(
                      selecionado.totalComprado ??
                        contas.reduce((s, c) => s + Number(c.valorOriginal || 0), 0)
                    )}
                  </strong>
                  <small>histórico do cliente</small>
                </div>
                <div className="cp-metric">
                  <span>Total pago</span>
                  <strong>{moeda(selecionado.totalPago ?? totalPagoCliente)}</strong>
                  <small>já recebido</small>
                </div>
              </div>

              <section className="cp-panel">
                <div className="cp-panel-title">
                  <div>
                    <span className="cp-section-kicker">CONTAS</span>
                    <h3>Compras A Prazo</h3>
                  </div>
                  <span className="cp-badge">{contas.length} registro(s)</span>
                </div>

                {contas.length === 0 ? (
                  <div className="cp-empty">Nenhuma compra A Prazo encontrada.</div>
                ) : (
                  <div className="cp-purchases">
                    {contas.map((conta) => {
                      const aberta = Number(conta.saldo || 0) > 0;
                      return (
                        <article className="cp-purchase" key={conta.id}>
                          <div className="cp-purchase-top">
                            <div>
                              <span className="cp-sale">Venda #{conta.vendaId}</span>
                              <span className={`cp-status ${aberta ? 'open' : 'paid'}`}>
                                {aberta ? 'EM ABERTO' : conta.status || 'PAGO'}
                              </span>
                            </div>
                            <strong className="cp-purchase-balance">
                              {moeda(conta.saldo)}
                            </strong>
                          </div>

                          <div className="cp-purchase-grid">
                            <div>
                              <small>Data</small>
                              <span>{dataHora(conta.criadoEm)}</span>
                            </div>
                            <div>
                              <small>Valor da compra</small>
                              <span>{moeda(conta.valorOriginal)}</span>
                            </div>
                            <div>
                              <small>Já pago</small>
                              <span>{moeda(conta.valorPago)}</span>
                            </div>
                            {conta.lojaNome && (
                              <div>
                                <small>Unidade</small>
                                <span>{conta.lojaNome}</span>
                              </div>
                            )}
                          </div>

                          {aberta && (
                            <div className="cp-purchase-actions">
                              <span>
                                Restante: <strong>{moeda(conta.saldo)}</strong>
                              </span>
                              <button
                                type="button"
                                onClick={() => prepararRecebimento(conta)}
                              >
                                Receber pagamento
                              </button>
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>

              <section className="cp-panel">
                <div className="cp-panel-title">
                  <div>
                    <span className="cp-section-kicker">MOVIMENTAÇÕES</span>
                    <h3>Histórico de recebimentos</h3>
                  </div>
                  <span className="cp-badge">{recebimentos.length} registro(s)</span>
                </div>

                {recebimentos.length === 0 ? (
                  <div className="cp-empty">
                    Nenhum recebimento registrado para este cliente.
                  </div>
                ) : (
                  <div className="cp-history">
                    {recebimentos.map((r) => (
                      <div className="cp-history-item" key={r.id}>
                        <span className="cp-history-dot">✓</span>
                        <div className="cp-history-main">
                          <strong>{moeda(r.valor)}</strong>
                          <span>
                            Venda #{r.vendaId} · {r.formaPagamento}
                            {r.executorNome ? ` · ${r.executorNome}` : ''}
                          </span>
                          {r.observacao && <small>{r.observacao}</small>}
                        </div>
                        <time>{dataHora(r.recebidoEm)}</time>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </main>
      </div>

      {contaReceber && (
        <div className="cp-modal-backdrop" onMouseDown={() => !salvando && setContaReceber(null)}>
          <div className="cp-modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="cp-modal-head">
              <div>
                <span className="cp-section-kicker">RECEBIMENTO</span>
                <h2>Registrar pagamento</h2>
                <p>
                  Venda #{contaReceber.vendaId} · saldo{' '}
                  <strong>{moeda(contaReceber.saldo)}</strong>
                </p>
              </div>
              <button
                className="cp-close"
                type="button"
                onClick={() => setContaReceber(null)}
                disabled={salvando}
                aria-label="Fechar"
              >
                ×
              </button>
            </div>

            <div className="cp-form">
              <label>
                Valor recebido
                <input value={valor} onChange={(e) => setValor(e.target.value)} />
              </label>

              <label>
                Forma de pagamento
                <select value={forma} onChange={(e) => setForma(e.target.value)}>
                  <option value="PIX">PIX</option>
                  <option value="DINHEIRO">Dinheiro</option>
                  <option value="DEBITO">Cartão de débito</option>
                  <option value="CREDITO">Cartão de crédito</option>
                  <option value="TRANSFERENCIA">Transferência</option>
                </select>
              </label>

              <label>
                Código do executor <span>(opcional)</span>
                <input
                  value={executorCodigo}
                  onChange={(e) => setExecutorCodigo(e.target.value)}
                />
              </label>

              <label>
                Observação
                <textarea
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  rows={3}
                />
              </label>
            </div>

            <div className="cp-modal-actions">
              <button
                className="cp-btn-secondary"
                type="button"
                onClick={() => setContaReceber(null)}
                disabled={salvando}
              >
                Cancelar
              </button>
              <button
                className="cp-btn-primary"
                type="button"
                onClick={confirmarRecebimento}
                disabled={salvando}
              >
                {salvando ? 'Registrando...' : 'Confirmar recebimento'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
