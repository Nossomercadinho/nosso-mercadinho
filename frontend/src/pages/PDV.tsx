import { useLoja } from '../contexts/LojaContext';
import { apiFetch } from '../services/apiClient';
import { AberturaCaixa, FechamentoCaixa, caixaRequest } from '../components/CaixaLifecycle';
import type { MercadoCaixa, SessaoCaixa } from '../components/CaixaLifecycle';
import Brand from "../components/Brand";
import Icon from "../components/Icon";
import Dialog from "../components/Dialog";
import "./PDV.css";
import { useEffect, useMemo, useRef, useState } from "react";

import type { FormEvent } from "react";

const API = "/api";

type LocalPdv = {
  id: number;
  lojaId?: number;
  loja_id?: number;
  lojaNome?: string;
  loja_nome?: string;
  localNome?: string;
  local_nome?: string;
  nome?: string;
};

type ProdutoPdv = {
  id: number;
  ean: string;
  nome: string;
  marca?: string | null;
  precoVenda?: number;
  preco_venda?: number;
  unidadeMedida?: string | null;
  unidade_medida?: string | null;
  quantidadeDisponivel?: number;
  quantidade_disponivel?: number;
};

type ItemCarrinho = {
  produtoId: number;
  ean: string;
  nome: string;
  marca: string;
  unidadeMedida: string;
  precoUnitario: number;
  quantidadeDisponivel: number;
  quantidade: number;
};

type ClientePrazoPdv = {
  id: number;
  nome: string;
  cpf: string;
  telefone: string;
  limiteCredito?: number;
  saldoDevedor?: number;
  limiteDisponivel?: number;
};

type FormaPagamento =
  | "PIX"
  | "DINHEIRO"
  | "CARTAO_DEBITO"
  | "CARTAO_CREDITO"
  | "A_PRAZO";

function moeda(valor: number | null | undefined) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function numero(valor: unknown) {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
}

function fetchAutenticado(input: RequestInfo | URL, init: RequestInit = {}) {
  const token = localStorage.getItem("token");
  const headers = new Headers(init.headers);

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  if (
    init.body &&
    !(init.body instanceof FormData) &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }

  return apiFetch(input, {
    ...init,
    headers,
  });
}

export default function PDV() {
  const {lojaAtiva, selecionarLoja} = useLoja();
  const [locais, setLocais] = useState<LocalPdv[]>([]);
  const [mercados, setMercados] = useState<MercadoCaixa[]>([]);
  const [sessao, setSessao] = useState<SessaoCaixa | null>(null);
  const [contextoCarregado, setContextoCarregado] = useState(false);
  const [fecharAberto, setFecharAberto] = useState(false);
  const [ultimoFechamento, setUltimoFechamento] = useState<SessaoCaixa | null>(null);
  const [localId, setLocalId] = useState("");
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [recebido, setRecebido] = useState("");
  const [activeResult, setActiveResult] = useState(0);
  const paymentFieldset = useRef<HTMLFieldSetElement>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchVersion = useRef(0);
  const [ean, setEan] = useState("");
  const [formaPagamento, setFormaPagamento] = useState<FormaPagamento>("PIX");
  const [itens, setItens] = useState<ItemCarrinho[]>([]);
  const [clienteBusca, setClienteBusca] = useState("");
  const [clientesPrazo, setClientesPrazo] = useState<ClientePrazoPdv[]>([]);
  const [clienteSelecionado, setClienteSelecionado] =
    useState<ClientePrazoPdv | null>(null);
  const [buscandoClientes, setBuscandoClientes] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [finalizando, setFinalizando] = useState(false);
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [resultadosBusca, setResultadosBusca] = useState<ProdutoPdv[]>([]);
  const [pesquisandoNome, setPesquisandoNome] = useState(false);
  const inputEan = useRef<HTMLInputElement | null>(null);
  const scanner = useRef<HTMLFormElement>(null);
  const [mobile, setMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth <= 900 : false,
  );

  useEffect(() => {
    const atualizarMobile = () => setMobile(window.innerWidth <= 900);
    atualizarMobile();
    window.addEventListener("resize", atualizarMobile);
    return () => window.removeEventListener("resize", atualizarMobile);
  }, []);

  const localSelecionado = useMemo(
    () => locais.find((local) => String(local.id) === String(localId)) || null,
    [locais, localId],
  );

  const lojaId = useMemo(
    () => numero(localSelecionado?.lojaId ?? localSelecionado?.loja_id),
    [localSelecionado],
  );

  const total = useMemo(
    () =>
      itens.reduce(
        (soma, item) => soma + item.precoUnitario * item.quantidade,
        0,
      ),
    [itens],
  );

  const quantidadeTotal = useMemo(
    () => itens.reduce((soma, item) => soma + item.quantidade, 0),
    [itens],
  );

  useEffect(() => {
    carregarLocais();
  }, []);

  useEffect(() => {
    if (localId) {
      inputEan.current?.focus();
    }
  }, [localId]);

  useEffect(() => {
    const dismiss = (event: PointerEvent) => { if (!scanner.current?.contains(event.target as Node)) fecharSugestoes(); };
    document.addEventListener('pointerdown', dismiss);
    return () => { document.removeEventListener('pointerdown', dismiss); searchVersion.current++; if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, []);
  function fecharSugestoes() { searchVersion.current++; if (searchTimer.current) clearTimeout(searchTimer.current); setResultadosBusca([]); setPesquisandoNome(false); }

  async function carregarLocais() {
    setCarregando(true); setErro('');
    try {
      const dados = await caixaRequest('/contexto');
      const lojas: MercadoCaixa[] = Array.isArray(dados.lojas) ? dados.lojas : [];
      setMercados(lojas);
      aplicarSessao(dados.sessao || null, lojas);
    } catch (error) { setErro(error instanceof Error ? error.message : 'Não foi possível consultar seu caixa.'); }
    finally { setCarregando(false); setContextoCarregado(true); }
  }
  function aplicarSessao(session: SessaoCaixa | null, lojas = mercados) {
    setSessao(session);
    if (!session) { setLocais([]); setLocalId(''); return; }
    const loja = lojas.find(item => item.id === session.lojaId);
    setLocais((loja?.locais || [{id: session.localId, nome: session.localNome}]).map(local => ({id: local.id, lojaId: session.lojaId, lojaNome: session.lojaNome, localNome: local.nome})));
    setLocalId(String(session.localId));
    setErro(''); setMensagem('');
  }
  function verHistorico() {
    if (window.location.pathname.toLowerCase().startsWith('/pdv')) window.location.assign('/#Hist%C3%B3rico%20do%20caixa');
    else window.location.hash = encodeURIComponent('Histórico do caixa');
  }

  function adicionarProdutoAoCarrinho(produto: ProdutoPdv) {
    searchVersion.current++;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    setPesquisandoNome(false);
    const disponivel = numero(
      produto.quantidadeDisponivel ?? produto.quantidade_disponivel,
    );
    const preco = numero(produto.precoVenda ?? produto.preco_venda);

    setItens((atuais) => {
      const existente = atuais.find((item) => item.produtoId === produto.id);

      if (existente) {
        return atuais.map((item) =>
          item.produtoId === produto.id
            ? {
                ...item,
                quantidade: item.quantidade + 1,
                quantidadeDisponivel: disponivel,
                precoUnitario: preco,
              }
            : item,
        );
      }

      return [
        ...atuais,
        {
          produtoId: produto.id,
          ean: produto.ean,
          nome: produto.nome,
          marca: produto.marca || "",
          unidadeMedida: produto.unidadeMedida ?? produto.unidade_medida ?? "",
          precoUnitario: preco,
          quantidadeDisponivel: disponivel,
          quantidade: 1,
        },
      ];
    });

    setEan("");
    setResultadosBusca([]);
    setErro("");
    window.setTimeout(() => inputEan.current?.focus(), 0);
  }

  async function pesquisarPorNome(termo: string) {
    const version = searchVersion.current;
    if (!localSelecionado || !lojaId || termo.trim().length < 2) {
      setResultadosBusca([]);
      return;
    }

    setPesquisandoNome(true);
    setErro("");

    try {
      const resposta = await fetchAutenticado(
        `${API}/vendas/pdv/pesquisar?q=${encodeURIComponent(
          termo.trim(),
        )}&lojaId=${lojaId}&localId=${localSelecionado.id}`,
      );
      const dados = await resposta.json();

      if (!resposta.ok || !dados.sucesso) {
        throw new Error(
          dados.erro || "Não foi possível pesquisar os produtos.",
        );
      }

      if (version !== searchVersion.current) return;
      setResultadosBusca(Array.isArray(dados.produtos) ? dados.produtos : []);
    } catch (error: any) {
      if (version !== searchVersion.current) return;
      setResultadosBusca([]);
      setErro(error?.message || "Não foi possível pesquisar os produtos.");
    } finally {
      if (version === searchVersion.current) setPesquisandoNome(false);
    }
  }

  function alterarPesquisa(valor: string) {
    setEan(valor);
    setResultadosBusca([]);
    searchVersion.current++;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    setPesquisandoNome(false);
    setActiveResult(0);
    setMensagem("");

    const texto = valor.trim();

    if (!texto) {
      setResultadosBusca([]);
      return;
    }

    // Sugestões discretas para nomes e prefixos de código; o leitor continua usando Enter.
    if (texto.length >= 2) {
      searchTimer.current = setTimeout(() => void pesquisarPorNome(texto), 250);
    } else {
      setResultadosBusca([]);
    }
  }

  async function buscarProduto(event?: FormEvent) {
    event?.preventDefault();

    const codigo = ean.trim();

    if (!localSelecionado || !lojaId) {
      setErro("Selecione a unidade/local do PDV.");
      return;
    }

    if (!codigo) {
      inputEan.current?.focus();
      return;
    }

    // Prefixos curtos e nomes selecionam a sugestão; EAN completo usa a busca exata.
    if ((!/^\d+$/.test(codigo) || codigo.length < 8) && resultadosBusca.length > 0) {
      adicionarProdutoAoCarrinho(
        resultadosBusca[activeResult] || resultadosBusca[0],
      );
      return;
    }

    setCarregando(true);
    setErro("");
    setMensagem("");

    try {
      const resposta = await fetchAutenticado(
        `${API}/vendas/pdv/produto/${encodeURIComponent(
          codigo,
        )}?lojaId=${lojaId}&localId=${localSelecionado.id}`,
      );
      const dados = await resposta.json();

      if (!resposta.ok || !dados.sucesso) {
        throw new Error(dados.erro || "Produto não encontrado.");
      }

      adicionarProdutoAoCarrinho(dados.produto as ProdutoPdv);
    } catch (error: any) {
      setErro(error?.message || "Não foi possível localizar o produto.");
      window.setTimeout(() => inputEan.current?.select(), 0);
    } finally {
      setCarregando(false);
    }
  }

  async function pesquisarClientesPrazo(termo: string) {
    const q = termo.trim();
    setClienteBusca(termo);
    setClienteSelecionado(null);
    if (q.length < 2) {
      setClientesPrazo([]);
      return;
    }
    setBuscandoClientes(true);
    try {
      const resposta = await fetchAutenticado(
        `${API}/clientes-prazo?q=${encodeURIComponent(q)}`,
        { headers: {"X-Loja-Id": String(sessao?.lojaId || lojaId)} },
      );
      const dados = await resposta.json();
      if (!resposta.ok || !dados.sucesso)
        throw new Error(dados.erro || "Não foi possível buscar os clientes.");
      setClientesPrazo(Array.isArray(dados.clientes) ? dados.clientes : []);
    } catch (error: any) {
      setClientesPrazo([]);
      setErro(error?.message || "Não foi possível buscar os clientes.");
    } finally {
      setBuscandoClientes(false);
    }
  }

  function selecionarClientePrazo(cliente: ClientePrazoPdv) {
    setClienteSelecionado(cliente);
    setClienteBusca(cliente.nome);
    setClientesPrazo([]);
    setErro("");
  }

  function alterarQuantidade(produtoId: number, novaQuantidade: number) {
    setErro("");

    setItens((atuais) =>
      atuais.flatMap((item) => {
        if (item.produtoId !== produtoId) {
          return [item];
        }

        if (novaQuantidade <= 0) {
          return [];
        }

        return [
          {
            ...item,
            quantidade: novaQuantidade,
          },
        ];
      }),
    );

    window.setTimeout(() => inputEan.current?.focus(), 0);
  }

  function removerItem(produtoId: number) {
    setItens((atuais) => atuais.filter((item) => item.produtoId !== produtoId));
    setErro("");
    window.setTimeout(() => inputEan.current?.focus(), 0);
  }

  function limparVenda() {
    searchVersion.current++;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    setRecebido("");
    setItens([]);
    setEan("");
    setFormaPagamento("PIX");
    setClienteBusca("");
    setClientesPrazo([]);
    setClienteSelecionado(null);
    setErro("");
    setMensagem("");
    setResultadosBusca([]);
    window.setTimeout(() => inputEan.current?.focus(), 0);
  }

  async function finalizarVenda() {
    if (finalizando) return;
    if (!sessao) { setErro('Abra seu caixa antes de registrar a venda.'); return; }
    if (
      formaPagamento === "DINHEIRO" &&
      recebido !== "" &&
      numero(recebido) < total
    ) {
      setErro("O valor recebido é menor que o total da venda.");
      return;
    }
    if (!localSelecionado || !lojaId) {
      setErro("Selecione a unidade/local do PDV.");
      return;
    }

    if (itens.length === 0) {
      setErro("Adicione pelo menos um produto à venda.");
      return;
    }


    if (formaPagamento === "A_PRAZO") {
      if (!clienteSelecionado) {
        setErro("Selecione um cliente cadastrado para a venda A PRAZO.");
        return;
      }
      const limite = numero(clienteSelecionado.limiteCredito);
      const saldo = numero(clienteSelecionado.saldoDevedor);
      const disponivel = clienteSelecionado.limiteDisponivel != null ? numero(clienteSelecionado.limiteDisponivel) : Math.max(0, limite - saldo);
      if (limite <= 0) {
        setErro("Cliente BLOQUEADO: limite de crédito não definido.");
        return;
      }
      if (total > disponivel + 0.009) {
        setErro(`Crédito insuficiente. Disponível: ${moeda(disponivel)}.`);
        return;
      }
    }

    setFinalizando(true);
    setErro("");
    setMensagem("");

    try {
      const resposta = await fetchAutenticado(`${API}/vendas`, {
        method: "POST",
        body: JSON.stringify({
          lojaId,
          localId: localSelecionado.id,
          itens: itens.map((item) => ({
            produtoId: item.produtoId,
            quantidade: item.quantidade,
          })),
          pagamentos: [
            {
              forma: formaPagamento,
              valor: Number(total.toFixed(2)),
            },
          ],
          cliente:
            formaPagamento === "A_PRAZO" && clienteSelecionado
              ? {
                  id: clienteSelecionado.id,
                  nome: clienteSelecionado.nome,
                  cpf: clienteSelecionado.cpf,
                  telefone: clienteSelecionado.telefone,
                }
              : undefined,
        }),
      });

      const dados = await resposta.json();

      if (!resposta.ok || !dados.sucesso) {
        throw new Error(dados.erro || "Não foi possível finalizar a venda.");
      }

      setMensagem(
        `Venda #${dados.vendaId} concluída com sucesso — ${moeda(
          numero(dados.valorTotal ?? total),
        )}.`,
      );
      setItens([]);
      setCheckoutOpen(false);
      setRecebido("");
      setEan("");
      setFormaPagamento("PIX");
      setClienteBusca("");
      setClientesPrazo([]);
      setClienteSelecionado(null);

      window.setTimeout(() => inputEan.current?.focus(), 0);
    } catch (error: any) {
      setErro(error?.message || "Não foi possível finalizar a venda.");
    } finally {
      setFinalizando(false);
    }
  }

  useEffect(
    () => () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
      searchVersion.current++;
    },
    [],
  );

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === "F2") {
        event.preventDefault();
        inputEan.current?.focus();
        inputEan.current?.select();
      }
      if (event.key === "F4") {
        event.preventDefault();
        if (itens.length) {
          setCheckoutOpen(true);
          if (!mobile) paymentFieldset.current?.querySelector<HTMLButtonElement>('button')?.focus();
        }
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [itens.length, mobile]);

  function sairDoPdv() {
    if (finalizando) return;
    if (
      itens.length &&
      !window.confirm(
        "Há uma venda em andamento. Sair do PDV e descartar os itens?",
      )
    )
      return;
    if (window.location.pathname.toLowerCase().startsWith("/pdv"))
      window.location.assign("/");
    else window.location.hash = encodeURIComponent("Visão Geral");
  }

  const checkout = (
    <>
      <div className="pos-total">
        <span>Total a cobrar</span>
        <strong>{moeda(total)}</strong>
        <small>
          {quantidadeTotal} unidade(s) · {itens.length} produto(s)
        </small>
      </div>
      <div className="pos-checkout-body">
        <fieldset className="pos-payment-methods" ref={paymentFieldset}>
          <legend>Forma de pagamento</legend>
          {(
            [
              ["PIX", "Pix", "transfer"],
              ["DINHEIRO", "Dinheiro", "wallet"],
              ["CARTAO_DEBITO", "Débito", "receipt"],
              ["CARTAO_CREDITO", "Crédito", "receipt"],
              ["A_PRAZO", "A prazo", "users"],
            ] as const
          ).map(([value, label, icon]) => (
            <button
              key={value}
              type="button"
              className={formaPagamento === value ? "selected" : ""}
              aria-pressed={formaPagamento === value}
              onClick={() => {
                setFormaPagamento(value);
                setErro("");
              }}
            >
              <Icon name={icon} size={18} />
              {label}
              {formaPagamento === value && <Icon name="check" size={14} />}
            </button>
          ))}
        </fieldset>
        {formaPagamento === "DINHEIRO" && (
          <div className="pos-cash">
            <label>
              Valor recebido
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={recebido}
                onChange={(event) => setRecebido(event.target.value)}
                placeholder={total.toFixed(2)}
              />
            </label>
            <div>
              <span>Troco</span>
              <strong>{moeda(Math.max(0, numero(recebido) - total))}</strong>
            </div>
          </div>
        )}
        {formaPagamento === "A_PRAZO" && (
          <div className="pos-credit">
            <label>
              Cliente cadastrado
              <input
                value={clienteBusca}
                onChange={(event) =>
                  void pesquisarClientesPrazo(event.target.value)
                }
                placeholder="Nome, CPF ou telefone"
                autoComplete="off"
              />
            </label>
            {buscandoClientes && <small>Buscando clientes...</small>}
            {clientesPrazo.length > 0 && (
              <div className="pos-client-results">
                {clientesPrazo.slice(0, 8).map((cliente) => (
                  <button
                    key={cliente.id}
                    type="button"
                    onClick={() => selecionarClientePrazo(cliente)}
                  >
                    <strong>{cliente.nome}</strong>
                    <small>Disponível: {moeda(cliente.limiteDisponivel)}</small>
                  </button>
                ))}
              </div>
            )}
            {clienteSelecionado && (
              <div className="pos-credit-selected">
                <strong>{clienteSelecionado.nome}</strong>
                <small>
                  Crédito disponível:{" "}
                  {moeda(clienteSelecionado.limiteDisponivel)}
                </small>
              </div>
            )}
          </div>
        )}
<div className="pos-session-badge"><Icon name="shield" size={16} /><span>Atendimento por <strong>{sessao?.usuarioNome}</strong><br />Caixa #{sessao?.id} · {sessao?.lojaNome}</span></div>
        {erro && mobile && (
          <div className="pos-alert" role="alert">
            {erro}
          </div>
        )}
        <button
          type="button"
          className="pos-charge"
          onClick={() => void finalizarVenda()}
          disabled={
            finalizando ||
            !itens.length ||
            !localId ||
            (formaPagamento === "A_PRAZO" && !clienteSelecionado)
          }
        >
          <Icon name="check" size={20} />
          {finalizando ? "Registrando venda..." : "Concluir venda"}
          <span>{moeda(total)}</span>
        </button>
        <p className="pos-checkout-note">
          Confira o recebimento antes de concluir.
        </p>
      </div>
    </>
  );

  return (
    <div className="pos">
      <header className="pos-topbar">
        <div className="pos-brand">
          <Brand compact />
          <div>
            <strong>Frente de caixa</strong>
            <small>{sessao ? `${sessao.lojaNome} · ${sessao.localNome}` : 'Nosso Mercadinho · Abertura de caixa'}</small>
          </div>
        </div>
        <div className="pos-topbar-actions">
          {sessao && <button type="button" className="pos-session-close" disabled={finalizando || itens.length > 0} title={itens.length ? 'Conclua ou limpe a venda antes de fechar o caixa' : 'Conferir e encerrar o expediente'} onClick={() => setFecharAberto(true)}><Icon name="calendar" size={16} />Fechar caixa</button>}
          <span className={sessao ? "pos-status ready" : "pos-status"}>
            <Icon name={sessao ? "check" : "clock"} size={15} />
            {carregando
              ? "Carregando"
              : sessao
                ? `Caixa #${sessao.id} aberto`
                : "Caixa fechado"}
          </span>
          <button
            type="button"
            className="pos-management"
            aria-label="Voltar à gestão"
            onClick={sairDoPdv}
          >
            <Icon name="collapse" size={17} />
            <span>Voltar à gestão</span>
          </button>
        </div>
      </header>
      {!contextoCarregado ? <div className="pos-session-loading">Carregando seus mercados e seu expediente...</div> : !sessao ? <><AberturaCaixa lojaInicialId={lojaAtiva?.id} lojas={mercados} onOpened={session => { selecionarLoja(session.lojaId); aplicarSessao(session); setUltimoFechamento(null); }} onHistory={verHistorico} ultimoFechamento={ultimoFechamento} />{erro && <div className="pos-alert" role="alert">{erro}<button type="button" onClick={() => void carregarLocais()}>Tentar novamente</button></div>}</> : <>
      <div className="pos-body">
        <section className="pos-operation" aria-label="Venda em andamento">
          <div className="pos-operation-heading">
            <div>
              <span>ATENDIMENTO</span>
              <h1>Nova venda</h1>
            </div>
            <span className="pos-location">
              <Icon name="store" size={16} />
              {sessao.localNome}
            </span>
          </div>

          <form ref={scanner} className="pos-scanner" onSubmit={buscarProduto}>
            <label htmlFor="pos-search">
              Adicionar produto <kbd>F2</kbd>
            </label>
            <div className="pos-scanner-field">
              <Icon name="barcode" size={25} />
              <input
                id="pos-search"
                ref={inputEan}
                value={ean}
                onChange={(event) => alterarPesquisa(event.target.value)}
                placeholder="Leia o código ou busque um produto"
                autoComplete="off"
                disabled={finalizando || !localId}
                role="combobox"
                aria-autocomplete="list"
                aria-label="Código de barras ou nome do produto"
                aria-controls="pos-search-results"
                aria-expanded={resultadosBusca.length > 0}
                aria-activedescendant={resultadosBusca.length ? `pos-result-${activeResult}` : undefined}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown" && resultadosBusca.length) {
                    event.preventDefault();
                    setActiveResult(
                      (value) => (value + 1) % resultadosBusca.length,
                    );
                  }
                  if (event.key === "ArrowUp" && resultadosBusca.length) {
                    event.preventDefault();
                    setActiveResult(
                      (value) =>
                        (value - 1 + resultadosBusca.length) %
                        resultadosBusca.length,
                    );
                  }
                  if (event.key === "Escape") fecharSugestoes();
                }}
              />
              <button
                type="submit"
                aria-label="Adicionar produto"
                disabled={carregando || finalizando || !localId}
              >
                <Icon name="plus" size={20} />
                <span>Adicionar</span>
              </button>
            </div>
            <small>
              Leitor de código de barras ou pesquisa por nome, marca e EAN.
            </small>
            {(pesquisandoNome || resultadosBusca.length > 0) && (
              <div className="pos-search-results" id="pos-search-results" role="listbox" aria-label="Sugestões de produtos"><div className="pos-suggestions-heading"><span>{pesquisandoNome ? 'Buscando produtos' : 'Produtos encontrados'}</span><button type="button" aria-label="Fechar sugestões" onClick={fecharSugestoes}><Icon name="close" size={14} /></button></div>
                {pesquisandoNome ? (
                  <p>Pesquisando...</p>
                ) : (
                  resultadosBusca.map((produto, index) => (
                    <button
                      key={produto.id}
                      id={`pos-result-${index}`}
                      role="option"
                      aria-selected={index === activeResult}
                      type="button"
                      className={index === activeResult ? "is-selected" : ""}
                      onClick={() => adicionarProdutoAoCarrinho(produto)}
                    >
                      <span className="pos-result-symbol">
                        <Icon name="box" size={18} />
                      </span>
                      <span>
                        <strong>{produto.nome}</strong>
                        <small>
                          {produto.ean} · Saldo:{" "}
                          {numero(
                            produto.quantidadeDisponivel ??
                              produto.quantidade_disponivel,
                          )}
                        </small>
                      </span>
                      <b>{moeda(produto.precoVenda ?? produto.preco_venda)}</b>
                      <Icon name="plus" size={16} />
                    </button>
                  ))
                )}
              </div>
            )}
          </form>
          {erro && (!mobile || !checkoutOpen) && (
            <div className="pos-alert" role="alert">
              {erro}
            </div>
          )}
          {mensagem && (
            <div className="pos-success" role="status">
              <Icon name="check" size={18} />
              {mensagem}
            </div>
          )}
          <section className="pos-cart">
            <div className="pos-cart-heading">
              <h2>
                Itens da venda <span>{itens.length}</span>
              </h2>
              <button
                type="button"
                className="pos-clear"
                disabled={!itens.length || finalizando}
                onClick={() => {
                  if (window.confirm("Limpar todos os itens desta venda?")) {
                    limparVenda();
                    setRecebido("");
                  }
                }}
              >
                <Icon name="trash" size={15} />
                Limpar
              </button>
            </div>
            {!itens.length ? (
              <div className="pos-empty">
                <span>
                  <Icon name="barcode" size={42} />
                </span>
                <h3>Pronto para o próximo cliente</h3>
                <p>Leia o primeiro produto para iniciar a venda.</p>
                <span className="pos-empty-hint">
                  <kbd>F2</kbd> Buscar produto <kbd>Enter</kbd> Adicionar
                </span>
              </div>
            ) : (
              <div className="pos-cart-items">
                {itens.map((item, index) => (
                  <article className="pos-cart-item" key={item.produtoId}>
                    <span className="pos-item-number">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div className="pos-item-description">
                      <strong>{item.nome}</strong>
                      <small>
                        {item.ean} · {moeda(item.precoUnitario)} /{" "}
                        {item.unidadeMedida || "un."}
                      </small>
                    </div>
                    <div className="pos-quantity">
                      <button
                        type="button"
                        aria-label={"Diminuir quantidade de " + item.nome}
                        disabled={finalizando}
                        onClick={() =>
                          alterarQuantidade(item.produtoId, item.quantidade - 1)
                        }
                      >
                        −
                      </button>
                      <span>{item.quantidade}</span>
                      <button
                        type="button"
                        aria-label={"Aumentar quantidade de " + item.nome}
                        disabled={finalizando}
                        onClick={() =>
                          alterarQuantidade(item.produtoId, item.quantidade + 1)
                        }
                      >
                        +
                      </button>
                    </div>
                    <strong className="pos-line-total">
                      {moeda(item.precoUnitario * item.quantidade)}
                    </strong>
                    <button
                      type="button"
                      className="pos-remove"
                      aria-label={"Remover " + item.nome}
                      disabled={finalizando}
                      onClick={() => removerItem(item.produtoId)}
                    >
                      <Icon name="close" size={16} />
                    </button>
                  </article>
                ))}
              </div>
            )}
            <div className="pos-cart-footer">
              <span>{quantidadeTotal} unidade(s)</span>
              <span>
                Subtotal <strong>{moeda(total)}</strong>
              </span>
            </div>
          </section>
          <div className="pos-shortcuts">
            <span>
              <kbd>F2</kbd> Buscar produto
            </span>
            <span>
              <kbd>F4</kbd> Pagamento
            </span>
            <span>
              <kbd>Enter</kbd> Adicionar item
            </span>
          </div>
        </section>
        {!mobile && (
          <aside className="pos-checkout" aria-label="Pagamento">
            {checkout}
          </aside>
        )}
      </div>
      {mobile && (
        <>
          <div className="pos-mobile-charge">
            <div>
              <small>Total da venda</small>
              <strong>{moeda(total)}</strong>
            </div>
            <button
              type="button"
              disabled={!itens.length || finalizando}
              onClick={() => setCheckoutOpen(true)}
            >
              Cobrar <Icon name="arrow" size={19} />
            </button>
          </div>
          <Dialog
            open={checkoutOpen}
            title="Pagamento"
            close={() => {
              if (!finalizando) setCheckoutOpen(false);
            }}
          >
            {checkout}
          </Dialog>
        </>
      )}
      </>}
      {sessao && <FechamentoCaixa open={fecharAberto} session={sessao} close={() => setFecharAberto(false)} onClosed={closed => { setFecharAberto(false); setUltimoFechamento(closed); limparVenda(); aplicarSessao(null); }} />}
    </div>
  );
}
