import {useDadosCompartilhados} from '../hooks/useDadosCompartilhados';
import { apiFetch } from '../services/apiClient';
import Dialog from "../components/Dialog";
import ResponsiveFilters from "../components/ResponsiveFilters";
import Icon from "../components/Icon";
import { useLoja } from '../contexts/LojaContext';
import { useEffect, useMemo, useState } from "react";

const API = "/api";

function hoje() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dia}`;
}

function moeda(v: unknown) {
  return Number(v || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function dataHora(v: string) {
  if (!v) return "-";
  const d = new Date(v.includes("T") ? v : v.replace(" ", "T") + "Z");
  return Number.isNaN(d.getTime()) ? v : d.toLocaleString("pt-BR");
}

function fetchAuth(input: RequestInfo | URL, init: RequestInit = {}) {
  const token = localStorage.getItem("token");
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return apiFetch(input, { ...init, headers });
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
  const { lojaAtiva } = useLoja();
  const usuario = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem("usuarioLogado") || "{}");
    } catch {
      return {};
    }
  }, []);
  const acessoTotal = Boolean(usuario?.permissoes?.includes('vendas'));

  const [dataInicio, setDataInicio] = useState(hoje());
  const [dataFim, setDataFim] = useState(hoje());
  const [vendas, setVendas] = useState<Venda[]>([]);
  const [resumo, setResumo] = useState<any>({
    quantidade: 0,
    total: 0,
    ticketMedio: 0,
    porForma: [],
  });
  const [valorCaixa, setValorCaixa] = useState("");
  const [salvandoCaixa, setSalvandoCaixa] = useState(false);
  const [caixaSalvo, setCaixaSalvo] = useState("");
  const [caixaAtualizadoPor, setCaixaAtualizadoPor] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [detalhe, setDetalhe] = useState<any>(null);
  const [editarCaixa, setEditarCaixa] = useState(false);
  const [editando, setEditando] = useState(false);
  const [itensEdicao, setItensEdicao] = useState<Item[]>([]);
  const [formaEdicao, setFormaEdicao] = useState("");
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);

  useDadosCompartilhados(()=>carregar());

  useEffect(() => {
    carregar();
    carregarValorCaixa(dataInicio);
  }, []);

  async function carregarValorCaixa(data: string) {
    setCaixaSalvo("");
    try {
      const params = new URLSearchParams({ data, lojaId: String(lojaAtiva?.id || '') });
      const r = await fetchAuth(
        `${API}/vendas-gestao/caixa-diario?${params.toString()}`,
      );
      const d = await r.json();
      if (!r.ok || !d.sucesso) {
        throw new Error(d.erro || "Erro ao carregar o valor do caixa.");
      }

      const valor = d.caixa?.valorCaixa;
      setValorCaixa(valor === null || valor === undefined ? "" : String(valor));
      setCaixaAtualizadoPor(d.caixa?.usuarioNome || "");
    } catch (e: any) {
      setErro(e?.message || "Erro ao carregar o valor do caixa.");
    }
  }

  async function salvarValorCaixa() {
    if (!lojaAtiva) { setErro('Selecione um mercado no topo do sistema.'); return; }
    if (!dataInicio || dataInicio !== dataFim) {
      setErro("Para salvar o Valor do Caixa, selecione apenas um dia.");
      return;
    }

    if (
      valorCaixa === "" ||
      !Number.isFinite(Number(valorCaixa)) ||
      Number(valorCaixa) < 0
    ) {
      setErro("Informe um Valor do Caixa válido.");
      return;
    }

    setSalvandoCaixa(true);
    setCaixaSalvo("");
    setErro("");

    try {
      const r = await fetchAuth(`${API}/vendas-gestao/caixa-diario`, {
        method: "PUT",
        body: JSON.stringify({
          data: dataInicio,
          valorCaixa: Number(valorCaixa),
          lojaId: lojaAtiva.id,
        }),
      });
      const d = await r.json();
      if (!r.ok || !d.sucesso) {
        throw new Error(d.erro || "Erro ao salvar o valor do caixa.");
      }

      setValorCaixa(String(d.caixa?.valorCaixa ?? valorCaixa));
      setCaixaAtualizadoPor(d.caixa?.usuarioNome || "");
      setCaixaSalvo("Valor do caixa salvo no banco.");
    } catch (e: any) {
      setErro(e?.message || "Erro ao salvar o valor do caixa.");
    } finally {
      setSalvandoCaixa(false);
    }
  }

  async function carregar(inicio = dataInicio, fim = dataFim) {
    setCarregando(true);
    setErro("");
    try {
      const params = new URLSearchParams({
        dataInicio: inicio,
        dataFim: fim,
        lojaId: String(lojaAtiva?.id || ''),
      });
      const r = await fetchAuth(`${API}/vendas-gestao?${params.toString()}`);
      const d = await r.json();
      if (!r.ok || !d.sucesso)
        throw new Error(d.erro || "Erro ao carregar vendas.");
      setVendas(d.vendas || []);
      setResumo(d.resumo || {});
    } catch (e: any) {
      setErro(e?.message || "Erro ao carregar vendas.");
    } finally {
      setCarregando(false);
    }
  }

  async function abrir(id: number) {
    setErro("");
    try {
      const r = await fetchAuth(`${API}/vendas-gestao/${id}`);
      const d = await r.json();
      if (!r.ok || !d.sucesso)
        throw new Error(d.erro || "Erro ao abrir venda.");
      setDetalhe(d);
      setEditando(false);
    } catch (e: any) {
      setErro(e?.message || "Erro ao abrir venda.");
    }
  }

  function iniciarCorrecao() {
    setItensEdicao((detalhe?.itens || []).map((i: Item) => ({ ...i })));
    const forma = detalhe?.pagamentos?.[0]?.formaPagamento || "";
    setFormaEdicao(forma === "DEBITO" || forma === "CREDITO" ? `CARTAO_${forma}` : forma);
    setMotivo("");
    setEditando(true);
  }

  async function salvarCorrecao() {
    if (!detalhe?.venda?.id) return;
    setSalvando(true);
    setErro("");
    try {
      const r = await fetchAuth(
        `${API}/vendas-gestao/${detalhe.venda.id}/corrigir`,
        {
          method: "PUT",
          body: JSON.stringify({
            motivo,
            formaPagamento: formaEdicao,
            itens: itensEdicao.map((i) => ({
              id: i.id,
              quantidade: Number(i.quantidade),
            })),
          }),
        },
      );
      const d = await r.json();
      if (!r.ok || !d.sucesso) throw new Error(d.erro || "Erro ao corrigir.");
      setEditando(false);
      await abrir(detalhe.venda.id);
      await carregar();
    } catch (e: any) {
      setErro(e?.message || "Erro ao corrigir venda.");
    } finally {
      setSalvando(false);
    }
  }

  async function cancelarVenda() {
    if (!detalhe?.venda?.id) return;
    const motivoCancelamento = window.prompt(
      "Informe o motivo do cancelamento:",
    );
    if (!motivoCancelamento) return;

    setErro("");
    try {
      const r = await fetchAuth(
        `${API}/vendas-gestao/${detalhe.venda.id}/cancelar`,
        {
          method: "POST",
          body: JSON.stringify({ motivo: motivoCancelamento }),
        },
      );
      const d = await r.json();
      if (!r.ok || !d.sucesso) throw new Error(d.erro || "Erro ao cancelar.");
      await abrir(detalhe.venda.id);
      await carregar();
    } catch (e: any) {
      setErro(e?.message || "Erro ao cancelar venda.");
    }
  }

  function totalForma(nome: string) {
    return (resumo.porForma || [])
      .filter(
        (item: any) =>
          String(item.formaPagamento).toUpperCase().replace("CARTAO_", "") ===
          nome,
      )
      .reduce((sum: number, item: any) => sum + Number(item.total || 0), 0);
  }

  const totalEdicao = itensEdicao.reduce(
    (s, i) => s + Number(i.quantidade || 0) * Number(i.precoUnitario || 0),
    0,
  );

  return (
    <div className="module-page vendas-page">
      <div className="page-header">
        <div>
          <h1>Vendas</h1>
          <p>
            Acompanhe as vendas, confira os pagamentos e consulte cada operação.
          </p>
        </div>
        <button
          type="button"
          className="primary-button"
          onClick={() => {
            window.location.hash = "PDV";
          }}
        >
          <Icon name="cart" size={17} /> Abrir PDV
        </button>
      </div>
      {erro && (
        <div className="overview-erro" role="alert">
          {erro}
        </div>
      )}
      <ResponsiveFilters
        label="Período da consulta"
        activeCount={dataInicio !== hoje() || dataFim !== hoje() ? 1 : 0}
      >
        <section className="sales-toolbar">
          <label>
            De
            <input
              type="date"
              value={dataInicio}
              onChange={(event) => {
                const value = event.target.value;
                setDataInicio(value);
                if (value === dataFim) void carregarValorCaixa(value);
                else {
                  setValorCaixa("");
                  setCaixaAtualizadoPor("");
                }
              }}
            />
          </label>
          <label>
            Até
            <input
              type="date"
              value={dataFim}
              onChange={(event) => {
                const value = event.target.value;
                setDataFim(value);
                if (value === dataInicio) void carregarValorCaixa(value);
                else {
                  setValorCaixa("");
                  setCaixaAtualizadoPor("");
                }
              }}
            />
          </label>
          <button
            type="button"
            className="primary-button"
            disabled={carregando}
            onClick={() => void carregar()}
          >
            <Icon name="refresh" size={15} />{" "}
            {carregando ? "Consultando..." : "Consultar"}
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              const h = hoje();
              setDataInicio(h);
              setDataFim(h);
              void carregarValorCaixa(h);
              void carregar(h, h);
            }}
          >
            Hoje
          </button>
          <span className="sales-period">
            <Icon name="calendar" size={15} />
            {dataInicio === dataFim
              ? "Consulta de um dia"
              : "Consulta por período"}
          </span>
        </section>
      </ResponsiveFilters>
      <section className="sales-metrics" aria-label="Resumo das vendas">
        <article>
          <span className="sales-metric-icon">
            <Icon name="chart" />
          </span>
          <div>
            <small>Vendas do período</small>
            <strong>{moeda(resumo.total)}</strong>
          </div>
        </article>
        <article>
          <span className="sales-metric-icon">
            <Icon name="receipt" />
          </span>
          <div>
            <small>Vendas realizadas</small>
            <strong>{resumo.quantidade || 0}</strong>
          </div>
        </article>
        <article>
          <span className="sales-metric-icon">
            <Icon name="wallet" />
          </span>
          <div>
            <small>Ticket médio</small>
            <strong>{moeda(resumo.ticketMedio)}</strong>
          </div>
        </article>
        <article className="sales-cash-metric">
          <span className="sales-metric-icon">
            <Icon name="store" />
          </span>
          <div>
            <small>Valor do caixa</small>
            <strong>
              {dataInicio === dataFim ? moeda(valorCaixa) : "Por dia"}
            </strong>
            <button
              type="button"
              className="text-button"
              disabled={dataInicio !== dataFim}
              onClick={() => setEditarCaixa(true)}
            >
              Informar valor <Icon name="chevron" size={12} />
            </button>
          </div>
        </article>
      </section>
      <section
        className="sales-payment-strip"
        aria-label="Valores por pagamento"
      >
        {[
          ["Dinheiro", totalForma("DINHEIRO")],
          ["Pix", totalForma("PIX")],
          ["Débito", totalForma("DEBITO")],
          ["Crédito", totalForma("CREDITO")],
          ["A prazo", totalForma("A_PRAZO")],
        ].map(([name, value]) => (
          <div key={String(name)}>
            <small>{name}</small>
            <strong>{moeda(value)}</strong>
          </div>
        ))}
      </section>
      <Dialog
        open={editarCaixa}
        title="Informar valor do caixa"
        close={() => setEditarCaixa(false)}
      >
        <p className="dialog-description">
          Valor manual de {dataInicio.split("-").reverse().join("/")}. Este
          registro é independente do fechamento diário.
        </p>
        <label className="cash-field">
          Valor em reais
          <input
            type="number"
            min="0"
            step="0.01"
            value={valorCaixa}
            onChange={(event) => {
              setValorCaixa(event.target.value);
              setCaixaSalvo("");
            }}
            placeholder="0,00"
          />
        </label>
        {caixaAtualizadoPor && (
          <p className="dialog-description">
            Último lançamento: {caixaAtualizadoPor}
          </p>
        )}
        {caixaSalvo && <p role="status">{caixaSalvo}</p>}
        {erro && <p className="overview-erro" role="alert">{erro}</p>}
        <button
          type="button"
          className="primary-button"
          disabled={salvandoCaixa}
          onClick={salvarValorCaixa}
        >
          {salvandoCaixa ? "Salvando..." : "Salvar valor do caixa"}
        </button>
      </Dialog>
      <div className="sales-workspace">
        <section className="sales-list-panel">
          <div className="sales-list-heading">
            <h2>Vendas do período</h2>
            <span>{vendas.length} registro(s)</span>
          </div>
          {carregando ? (
            <p>Carregando...</p>
          ) : vendas.length === 0 ? (
            <div className="sales-empty">
              <Icon name="receipt" size={34} />
              <strong>Nenhuma venda neste período</strong>
              <p>As vendas concluídas no PDV aparecem aqui.</p>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="mobile-record-table">
                <thead>
                  <tr>
                    {[
                      "Venda",
                      "Data",
                      "Executor",
                      "Pagamento",
                      "Total",
                      "Status",
                    ].map((x) => (
                      <th
                        key={x}
                        scope="col"
                      >
                        {x}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {vendas.map((v) => (
                    <tr
                      key={v.id}
                      onClick={() => abrir(v.id)}
                      style={{ cursor: "pointer" }}
                    >
                      <td data-label="Venda">
                        <button
                          type="button"
                          className="sale-link"
                          aria-label={`Ver venda ${v.id}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            void abrir(v.id);
                          }}
                        >
                          #{v.id}
                        </button>
                      </td>
                      <td data-label="Data">
                        {dataHora(v.criadoEm)}
                      </td>
                      <td data-label="Executor">
                        {v.executorNome || "-"}
                      </td>
                      <td data-label="Pagamento">
                        {String(v.formasPagamento || "").replaceAll("_", " ")}
                      </td>
                      <td
                        data-label="Total"
                        style={{ fontWeight: 600 }}
                      >
                        {moeda(v.valorTotal)}
                      </td>
                      <td data-label="Status">
                        {v.status}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <Dialog
          open={!!detalhe}
          title="Detalhes da venda"
          close={() => {
            setDetalhe(null);
            setEditando(false);
          }}
        >
          {erro && <div className="overview-erro" role="alert">{erro}</div>}
          {detalhe && (
            <>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  alignItems: "start",
                }}
              >
                <div>
                  <h2 style={{ margin: 0 }}>Venda #{detalhe.venda.id}</h2>
                  <p style={{ marginTop: 5 }}>
                    {dataHora(detalhe.venda.criado_em)} ·{" "}
                    {detalhe.venda.lojaNome}
                  </p>
                </div>
                <strong style={{ fontSize: 22 }}>
                  {moeda(detalhe.venda.valor_total)}
                </strong>
              </div>

              <p>
                <strong>Executor:</strong> {detalhe.venda.executorNome || "-"}
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
                    <div
                      key={i.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 12,
                        padding: "9px 0",
                        borderBottom: "1px solid #eee",
                      }}
                    >
                      <span>
                        {i.descricao}
                        <small style={{ display: "block" }}>
                          {i.quantidade} × {moeda(i.precoUnitario)}
                        </small>
                      </span>
                      <strong>{moeda(i.subtotal)}</strong>
                    </div>
                  ))}

                  <h3>Pagamento</h3>
                  {(detalhe.pagamentos || []).map((p: any) => (
                    <p key={p.id}>
                      {String(p.formaPagamento).replaceAll("_", " ")} —{" "}
                      <strong>{moeda(p.valor)}</strong>
                    </p>
                  ))}

                  {detalhe.venda.status === "CONCLUIDA" && acessoTotal && (
                    <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
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
                        <div
                          key={c.id}
                          style={{
                            padding: "8px 0",
                            borderBottom: "1px solid #eee",
                          }}
                        >
                          <strong>{c.motivo}</strong>
                          <small style={{ display: "block" }}>
                            {dataHora(c.criadoEm)} ·{" "}
                            {c.usuarioNome || "Usuário"}
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
                    <div
                      key={i.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 90px",
                        gap: 10,
                        alignItems: "center",
                        marginBottom: 10,
                      }}
                    >
                      <span>
                        {i.descricao}
                        <small style={{ display: "block" }}>
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
                      style={{
                        display: "block",
                        width: "100%",
                        marginTop: 6,
                        padding: 8,
                      }}
                    >
                      <option value="PIX">PIX</option>
                      <option value="DINHEIRO">Dinheiro</option>
                      <option value="CARTAO_DEBITO">Débito</option>
                      <option value="CARTAO_CREDITO">Crédito</option>
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
                        display: "block",
                        width: "100%",
                        minHeight: 70,
                        marginTop: 6,
                        boxSizing: "border-box",
                      }}
                    />
                  </label>

                  <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                    <button
                      type="button"
                      onClick={salvarCorrecao}
                      disabled={salvando}
                    >
                      {salvando ? "Salvando..." : "Salvar correção"}
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
        </Dialog>
      </div>
    </div>
  );
}
