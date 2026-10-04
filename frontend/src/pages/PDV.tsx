import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import type {
  FormEvent,
} from 'react';

const API = '/api';

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
  | 'PIX'
  | 'DINHEIRO'
  | 'CARTAO_DEBITO'
  | 'CARTAO_CREDITO'
  | 'A_PRAZO';

function moeda(valor: number | null | undefined) {
  return Number(valor || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

function numero(valor: unknown) {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
}

function fetchAutenticado(
  input: RequestInfo | URL,
  init: RequestInit = {}
) {
  const token = localStorage.getItem('token');
  const headers = new Headers(init.headers);

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  if (
    init.body &&
    !(init.body instanceof FormData) &&
    !headers.has('Content-Type')
  ) {
    headers.set('Content-Type', 'application/json');
  }

  return fetch(input, {
    ...init,
    headers,
  });
}

export default function PDV() {
  const [locais, setLocais] = useState<LocalPdv[]>([]);
  const [localId, setLocalId] = useState('');
  const [ean, setEan] = useState('');
  const [codigoExecutor, setCodigoExecutor] = useState('');
  const [formaPagamento, setFormaPagamento] =
    useState<FormaPagamento>('PIX');
  const [itens, setItens] = useState<ItemCarrinho[]>([]);
  const [clienteBusca, setClienteBusca] = useState('');
  const [clientesPrazo, setClientesPrazo] = useState<ClientePrazoPdv[]>([]);
  const [clienteSelecionado, setClienteSelecionado] = useState<ClientePrazoPdv | null>(null);
  const [buscandoClientes, setBuscandoClientes] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [finalizando, setFinalizando] = useState(false);
  const [erro, setErro] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [resultadosBusca, setResultadosBusca] = useState<ProdutoPdv[]>([]);
  const [pesquisandoNome, setPesquisandoNome] = useState(false);
  const inputEan = useRef<HTMLInputElement | null>(null);
  const [mobile, setMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth <= 760 : false
  );

  useEffect(() => {
    const atualizarMobile = () => setMobile(window.innerWidth <= 760);
    atualizarMobile();
    window.addEventListener('resize', atualizarMobile);
    return () => window.removeEventListener('resize', atualizarMobile);
  }, []);

  const localSelecionado = useMemo(
    () =>
      locais.find(
        (local) => String(local.id) === String(localId)
      ) || null,
    [locais, localId]
  );

  const lojaId = useMemo(
    () =>
      numero(
        localSelecionado?.lojaId ??
          localSelecionado?.loja_id
      ),
    [localSelecionado]
  );

  const total = useMemo(
    () =>
      itens.reduce(
        (soma, item) =>
          soma + item.precoUnitario * item.quantidade,
        0
      ),
    [itens]
  );

  const quantidadeTotal = useMemo(
    () =>
      itens.reduce(
        (soma, item) => soma + item.quantidade,
        0
      ),
    [itens]
  );

  useEffect(() => {
    carregarLocais();
  }, []);

  useEffect(() => {
    if (localId) {
      inputEan.current?.focus();
    }
  }, [localId]);

  async function carregarLocais() {
    setCarregando(true);
    setErro('');

    try {
      const resposta = await fetchAutenticado(
        `${API}/vendas/pdv/locais`
      );
      const dados = await resposta.json();

      if (!resposta.ok || !dados.sucesso) {
        throw new Error(
          dados.erro ||
            'Não foi possível carregar os locais do PDV.'
        );
      }

      const lista = Array.isArray(dados.locais)
        ? dados.locais
        : [];

      setLocais(lista);

      if (lista.length === 1) {
        setLocalId(String(lista[0].id));
      }
    } catch (error: any) {
      setErro(
        error?.message ||
          'Não foi possível carregar os locais do PDV.'
      );
    } finally {
      setCarregando(false);
    }
  }

  function adicionarProdutoAoCarrinho(produto: ProdutoPdv) {
    const disponivel = numero(
      produto.quantidadeDisponivel ?? produto.quantidade_disponivel
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
            : item
        );
      }

      return [
        ...atuais,
        {
          produtoId: produto.id,
          ean: produto.ean,
          nome: produto.nome,
          marca: produto.marca || '',
          unidadeMedida:
            produto.unidadeMedida ?? produto.unidade_medida ?? '',
          precoUnitario: preco,
          quantidadeDisponivel: disponivel,
          quantidade: 1,
        },
      ];
    });

    setEan('');
    setResultadosBusca([]);
    setErro('');
    window.setTimeout(() => inputEan.current?.focus(), 0);
  }

  async function pesquisarPorNome(termo: string) {
    if (!localSelecionado || !lojaId || termo.trim().length < 2) {
      setResultadosBusca([]);
      return;
    }

    setPesquisandoNome(true);
    setErro('');

    try {
      const resposta = await fetchAutenticado(
        `${API}/vendas/pdv/pesquisar?q=${encodeURIComponent(
          termo.trim()
        )}&lojaId=${lojaId}&localId=${localSelecionado.id}`
      );
      const dados = await resposta.json();

      if (!resposta.ok || !dados.sucesso) {
        throw new Error(dados.erro || 'Não foi possível pesquisar os produtos.');
      }

      setResultadosBusca(
        Array.isArray(dados.produtos) ? dados.produtos : []
      );
    } catch (error: any) {
      setResultadosBusca([]);
      setErro(error?.message || 'Não foi possível pesquisar os produtos.');
    } finally {
      setPesquisandoNome(false);
    }
  }

  function alterarPesquisa(valor: string) {
    setEan(valor);
    setMensagem('');

    const texto = valor.trim();

    if (!texto) {
      setResultadosBusca([]);
      return;
    }

    // Leitor/EAN: não abre a lista; Enter faz a inclusão direta.
    if (/^\d+$/.test(texto)) {
      setResultadosBusca([]);
      return;
    }

    if (texto.length >= 2) {
      pesquisarPorNome(texto);
    } else {
      setResultadosBusca([]);
    }
  }

  async function buscarProduto(event?: FormEvent) {
    event?.preventDefault();

    const codigo = ean.trim();

    if (!localSelecionado || !lojaId) {
      setErro('Selecione a unidade/local do PDV.');
      return;
    }

    if (!codigo) {
      inputEan.current?.focus();
      return;
    }

    // Se for texto e houver uma lista, Enter adiciona o primeiro resultado.
    if (!/^\d+$/.test(codigo) && resultadosBusca.length > 0) {
      adicionarProdutoAoCarrinho(resultadosBusca[0]);
      return;
    }

    setCarregando(true);
    setErro('');
    setMensagem('');

    try {
      const resposta = await fetchAutenticado(
        `${API}/vendas/pdv/produto/${encodeURIComponent(
          codigo
        )}?lojaId=${lojaId}&localId=${localSelecionado.id}`
      );
      const dados = await resposta.json();

      if (!resposta.ok || !dados.sucesso) {
        throw new Error(dados.erro || 'Produto não encontrado.');
      }

      adicionarProdutoAoCarrinho(dados.produto as ProdutoPdv);
    } catch (error: any) {
      setErro(error?.message || 'Não foi possível localizar o produto.');
      window.setTimeout(() => inputEan.current?.select(), 0);
    } finally {
      setCarregando(false);
    }
  }

  async function pesquisarClientesPrazo(termo: string) {
    const q = termo.trim();
    setClienteBusca(termo);
    setClienteSelecionado(null);
    if (q.length < 2) { setClientesPrazo([]); return; }
    setBuscandoClientes(true);
    try {
      const resposta = await fetchAutenticado(`${API}/clientes-prazo?q=${encodeURIComponent(q)}`);
      const dados = await resposta.json();
      if (!resposta.ok || !dados.sucesso) throw new Error(dados.erro || 'Não foi possível buscar os clientes.');
      setClientesPrazo(Array.isArray(dados.clientes) ? dados.clientes : []);
    } catch (error: any) {
      setClientesPrazo([]);
      setErro(error?.message || 'Não foi possível buscar os clientes.');
    } finally { setBuscandoClientes(false); }
  }

  function selecionarClientePrazo(cliente: ClientePrazoPdv) {
    setClienteSelecionado(cliente);
    setClienteBusca(cliente.nome);
    setClientesPrazo([]);
    setErro('');
  }

  function alterarQuantidade(
    produtoId: number,
    novaQuantidade: number
  ) {
    setErro('');

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
      })
    );

    window.setTimeout(() => inputEan.current?.focus(), 0);
  }

  function removerItem(produtoId: number) {
    setItens((atuais) =>
      atuais.filter((item) => item.produtoId !== produtoId)
    );
    setErro('');
    window.setTimeout(() => inputEan.current?.focus(), 0);
  }

  function limparVenda() {
    setItens([]);
    setEan('');
    setCodigoExecutor('');
    setFormaPagamento('PIX');
    setClienteBusca('');
    setClientesPrazo([]);
    setClienteSelecionado(null);
    setErro('');
    setMensagem('');
    setResultadosBusca([]);
    window.setTimeout(() => inputEan.current?.focus(), 0);
  }

  async function finalizarVenda() {
    if (!localSelecionado || !lojaId) {
      setErro('Selecione a unidade/local do PDV.');
      return;
    }

    if (itens.length === 0) {
      setErro('Adicione pelo menos um produto à venda.');
      return;
    }

    if (!codigoExecutor.trim()) {
      setErro('Informe o código do executor.');
      return;
    }

    if (formaPagamento === 'A_PRAZO') {
      if (!clienteSelecionado) { setErro('Selecione um cliente cadastrado para a venda A PRAZO.'); return; }
      const limite = numero(clienteSelecionado.limiteCredito);
      const saldo = numero(clienteSelecionado.saldoDevedor);
      const disponivel = Math.max(0, limite - saldo);
      if (limite <= 0) { setErro('Cliente BLOQUEADO: limite de crédito não definido.'); return; }
      if (total > disponivel + 0.009) { setErro(`Crédito insuficiente. Disponível: ${moeda(disponivel)}.`); return; }
    }

    setFinalizando(true);
    setErro('');
    setMensagem('');

    try {
      const resposta = await fetchAutenticado(
        `${API}/vendas`,
        {
          method: 'POST',
          body: JSON.stringify({
            codigoExecutor: codigoExecutor.trim(),
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
              formaPagamento === 'A_PRAZO' && clienteSelecionado
                ? { id: clienteSelecionado.id, nome: clienteSelecionado.nome, cpf: clienteSelecionado.cpf, telefone: clienteSelecionado.telefone }
                : undefined,
          }),
        }
      );

      const dados = await resposta.json();

      if (!resposta.ok || !dados.sucesso) {
        throw new Error(
          dados.erro || 'Não foi possível finalizar a venda.'
        );
      }

      setMensagem(
        `Venda #${dados.vendaId} concluída com sucesso — ${moeda(
          numero(dados.valorTotal ?? total)
        )}.`
      );
      setItens([]);
      setEan('');
      setCodigoExecutor('');
      setFormaPagamento('PIX');
      setClienteBusca('');
      setClientesPrazo([]);
      setClienteSelecionado(null);

      window.setTimeout(() => inputEan.current?.focus(), 0);
    } catch (error: any) {
      setErro(
        error?.message || 'Não foi possível finalizar a venda.'
      );
    } finally {
      setFinalizando(false);
    }
  }


  return (
    <div
      className="pdv-page"
      style={{
        minHeight: 'calc(100vh - 90px)',
        background: '#f5f6f8',
        margin: mobile ? 0 : '-8px',
        padding: mobile ? 8 : 18,
        width: mobile ? '100%' : undefined,
        maxWidth: '100%',
        boxSizing: 'border-box',
        overflowX: 'hidden',
      }}
    >
      <div
        className="pdv-header"
        style={{
          background: '#f97316',
          color: '#fff',
          borderRadius: 12,
          padding: mobile ? '12px' : '14px 18px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: mobile ? 'flex-start' : 'center',
          gap: mobile ? 8 : 16,
          flexDirection: mobile ? 'column' : 'row',
          boxShadow: '0 2px 8px rgba(0,0,0,.08)',
        }}
      >
        <div>
          <div style={{ fontSize: 22, fontWeight: 900 }}>PDV — MATRIZ</div>
          <div style={{ fontSize: 12, opacity: 0.9 }}>
            Nosso Mercadinho • Frente de Caixa • Área de Venda
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 13,
            fontWeight: 800,
          }}
        >
          <span
            style={{
              width: 9,
              height: 9,
              borderRadius: '50%',
              background: localId ? '#22c55e' : '#facc15',
              display: 'inline-block',
            }}
          />
          {carregando
            ? 'Conectando...'
            : localId
              ? 'CAIXA PRONTO'
              : 'AGUARDANDO CONEXÃO'}
        </div>
      </div>

      {erro && (
        <div
          style={{
            marginTop: 12,
            padding: '10px 13px',
            borderRadius: 8,
            background: '#fff1f2',
            border: '1px solid #fecdd3',
            color: '#b42318',
            fontWeight: 700,
            fontSize: 13,
          }}
        >
          {erro}
        </div>
      )}

      {mensagem && (
        <div
          style={{
            marginTop: 12,
            padding: '10px 13px',
            borderRadius: 8,
            background: '#f0fdf4',
            border: '1px solid #bbf7d0',
            color: '#166534',
            fontWeight: 800,
            fontSize: 13,
          }}
        >
          {mensagem}
        </div>
      )}

      <div
        className="pdv-layout"
        style={{
          display: 'grid',
          gridTemplateColumns: mobile ? 'minmax(0, 1fr)' : 'minmax(0, 1fr) 340px',
          gap: mobile ? 10 : 16,
          marginTop: mobile ? 10 : 16,
          width: '100%',
          maxWidth: '100%',
          alignItems: 'start',
        }}
      >
        <main className="pdv-main" style={{ minWidth: 0 }}>
          <section
            style={{
              background: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: 12,
              padding: 16,
              boxShadow: '0 1px 3px rgba(0,0,0,.04)',
            }}
          >
            <form onSubmit={buscarProduto}>
              <label
                htmlFor="pdv-ean"
                style={{
                  display: 'block',
                  marginBottom: 7,
                  fontSize: 13,
                  fontWeight: 800,
                  color: '#374151',
                }}
              >
                Código de barras ou produto
              </label>

              <div
                className="pdv-search-row"
                style={{
                  display: 'flex',
                  flexDirection: mobile ? 'column' : 'row',
                  gap: 8,
                  width: '100%',
                  minWidth: 0,
                }}
              >
                <input
                  id="pdv-ean"
                  ref={inputEan}
                  value={ean}
                  onChange={(event) => alterarPesquisa(event.target.value)}
                  placeholder="Leia o código ou pesquise por nome, marca ou EAN"
                  autoComplete="off"
                  disabled={!localId || carregando}
                  style={{
                    flex: mobile ? '0 0 auto' : 1,
                    width: mobile ? '100%' : undefined,
                    minWidth: 0,
                    boxSizing: 'border-box',
                    height: 46,
                    borderRadius: 8,
                    border: '2px solid #fed7aa',
                    outlineColor: '#f97316',
                    padding: '0 13px',
                    fontSize: 16,
                    fontWeight: 600,
                  }}
                />

                <button
                  type="submit"
                  disabled={!localId || carregando}
                  style={{
                    height: 46,
                    minWidth: mobile ? 0 : 112,
                    width: mobile ? '100%' : undefined,
                    border: 0,
                    borderRadius: 8,
                    background: '#f97316',
                    color: '#fff',
                    fontWeight: 900,
                    cursor: !localId || carregando ? 'not-allowed' : 'pointer',
                  }}
                >
                  Adicionar
                </button>
              </div>

              {(pesquisandoNome || resultadosBusca.length > 0) && (
                <div
                  style={{
                    marginTop: 8,
                    border: '1px solid #e5e7eb',
                    borderRadius: 8,
                    overflow: 'hidden',
                    background: '#fff',
                    boxShadow: '0 8px 20px rgba(0,0,0,.08)',
                  }}
                >
                  {pesquisandoNome ? (
                    <div style={{ padding: 12, color: '#6b7280', fontSize: 12 }}>
                      Pesquisando produtos...
                    </div>
                  ) : (
                    resultadosBusca.map((produto) => {
                      const saldo = numero(
                        produto.quantidadeDisponivel ??
                          produto.quantidade_disponivel
                      );
                      const preco = numero(
                        produto.precoVenda ?? produto.preco_venda
                      );

                      return (
                        <button
                          key={produto.id}
                          type="button"
                          onClick={() => adicionarProdutoAoCarrinho(produto)}
                          style={{
                            width: '100%',
                            border: 0,
                            borderTop: '1px solid #f3f4f6',
                            background: '#fff',
                            padding: '10px 12px',
                            textAlign: 'left',
                            cursor: 'pointer',
                            display: 'grid',
                            gridTemplateColumns: '1fr auto',
                            gap: 12,
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: 800, color: '#111827' }}>
                              {produto.nome}
                            </div>
                            <div
                              style={{
                                marginTop: 2,
                                fontSize: 11,
                                color: '#6b7280',
                              }}
                            >
                              {produto.marca ? `${produto.marca} • ` : ''}
                              EAN: {produto.ean || 'sem EAN'} • Estoque: {saldo}
                            </div>
                          </div>
                          <strong style={{ whiteSpace: 'nowrap' }}>
                            {moeda(preco)}
                          </strong>
                        </button>
                      );
                    })
                  )}
                </div>
              )}

              <div
                style={{
                  marginTop: 7,
                  color: '#6b7280',
                  fontSize: 11,
                }}
              >
                Use o leitor normalmente ou digite parte do nome/marca. Produtos sem estoque também podem ser adicionados e vendidos.
              </div>
            </form>
          </section>

          <section
            style={{
              marginTop: 12,
              background: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: 12,
              overflow: 'hidden',
              boxShadow: '0 1px 3px rgba(0,0,0,.04)',
            }}
          >
            <div
              style={{
                padding: '13px 16px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: '1px solid #e5e7eb',
              }}
            >
              <div>
                <strong style={{ fontSize: 17 }}>Itens da venda</strong>
                <span
                  style={{
                    marginLeft: 10,
                    color: '#6b7280',
                    fontSize: 12,
                  }}
                >
                  {quantidadeTotal} item(ns)
                </span>
              </div>

              {itens.length > 0 && (
                <button
                  type="button"
                  onClick={limparVenda}
                  style={{
                    border: '1px solid #d1d5db',
                    background: '#fff',
                    color: '#4b5563',
                    borderRadius: 7,
                    padding: '7px 10px',
                    cursor: 'pointer',
                    fontWeight: 700,
                    fontSize: 12,
                  }}
                >
                  Limpar venda
                </button>
              )}
            </div>

            {itens.length === 0 ? (
              <div
                style={{
                  minHeight: mobile ? 190 : 330,
                  display: 'grid',
                  placeItems: 'center',
                  color: '#9ca3af',
                  textAlign: 'center',
                  padding: 30,
                }}
              >
                <div>
                  <div style={{ fontSize: 38, marginBottom: 8 }}>▦</div>
                  <strong style={{ color: '#6b7280' }}>
                    Nenhum produto na venda
                  </strong>
                  <div style={{ fontSize: 12, marginTop: 5 }}>
                    Leia o primeiro código de barras para começar.
                  </div>
                </div>
              </div>
            ) : (
              <div className="pdv-table-wrap" style={{ overflowX: 'auto' }}>
                <table
                  className="pdv-items-table"
                  style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    minWidth: 700,
                  }}
                >
                  <thead>
                    <tr
                      style={{
                        background: '#f9fafb',
                        textAlign: 'left',
                        color: '#6b7280',
                        fontSize: 11,
                        textTransform: 'uppercase',
                      }}
                    >
                      <th style={{ padding: '10px 14px' }}>Produto</th>
                      <th style={{ padding: '10px 8px' }}>EAN</th>
                      <th style={{ padding: '10px 8px', textAlign: 'right' }}>
                        Unitário
                      </th>
                      <th style={{ padding: '10px 8px', textAlign: 'center' }}>
                        Qtd.
                      </th>
                      <th style={{ padding: '10px 8px', textAlign: 'right' }}>
                        Subtotal
                      </th>
                      <th style={{ width: 60 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {itens.map((item) => (
                      <tr
                        key={item.produtoId}
                        style={{ borderTop: '1px solid #f0f0f0' }}
                      >
                        <td style={{ padding: '11px 14px' }}>
                          <div style={{ fontWeight: 800 }}>{item.nome}</div>
                          {item.marca && (
                            <div
                              style={{
                                marginTop: 2,
                                color: '#6b7280',
                                fontSize: 11,
                              }}
                            >
                              {item.marca}
                            </div>
                          )}
                        </td>

                        <td
                          style={{
                            padding: '11px 8px',
                            fontSize: 12,
                            color: '#6b7280',
                          }}
                        >
                          {item.ean}
                        </td>

                        <td
                          style={{
                            padding: '11px 8px',
                            textAlign: 'right',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {moeda(item.precoUnitario)}
                        </td>

                        <td style={{ padding: '11px 8px' }}>
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'center',
                              alignItems: 'center',
                              gap: 5,
                            }}
                          >
                            <button
                              type="button"
                              onClick={() =>
                                alterarQuantidade(
                                  item.produtoId,
                                  item.quantidade - 1
                                )
                              }
                              style={{
                                width: 27,
                                height: 27,
                                border: '1px solid #d1d5db',
                                borderRadius: 6,
                                background: '#fff',
                                cursor: 'pointer',
                              }}
                            >
                              −
                            </button>

                            <strong
                              style={{
                                minWidth: 28,
                                textAlign: 'center',
                              }}
                            >
                              {item.quantidade}
                            </strong>

                            <button
                              type="button"
                              onClick={() =>
                                alterarQuantidade(
                                  item.produtoId,
                                  item.quantidade + 1
                                )
                              }
                              style={{
                                width: 27,
                                height: 27,
                                border: '1px solid #d1d5db',
                                borderRadius: 6,
                                background: '#fff',
                                cursor: 'pointer',
                              }}
                            >
                              +
                            </button>
                          </div>
                        </td>

                        <td
                          style={{
                            padding: '11px 8px',
                            textAlign: 'right',
                            whiteSpace: 'nowrap',
                            fontWeight: 900,
                          }}
                        >
                          {moeda(item.precoUnitario * item.quantidade)}
                        </td>

                        <td style={{ padding: '11px 10px', textAlign: 'right' }}>
                          <button
                            type="button"
                            title="Remover item"
                            onClick={() => removerItem(item.produtoId)}
                            style={{
                              border: 0,
                              background: 'transparent',
                              color: '#dc2626',
                              cursor: 'pointer',
                              fontSize: 17,
                            }}
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </main>

        <aside
          className="pdv-checkout"
          style={{
            background: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: 12,
            overflow: 'hidden',
            boxShadow: '0 1px 3px rgba(0,0,0,.04)',
            position: mobile ? 'static' : 'sticky',
            top: mobile ? 'auto' : 12,
            width: '100%',
            maxWidth: '100%',
            minWidth: 0,
            boxSizing: 'border-box',
          }}
        >
          <div
            style={{
              padding: '14px 16px',
              borderBottom: '1px solid #e5e7eb',
              background: '#fff7ed',
            }}
          >
            <div
              style={{
                fontSize: 11,
                color: '#9a3412',
                fontWeight: 900,
                textTransform: 'uppercase',
              }}
            >
              Total da venda
            </div>
            <div
              style={{
                marginTop: 2,
                fontSize: mobile ? 32 : 36,
                lineHeight: 1.1,
                fontWeight: 950,
                color: '#111827',
              }}
            >
              {moeda(total)}
            </div>
            <div style={{ marginTop: 5, color: '#6b7280', fontSize: 12 }}>
              {quantidadeTotal} item(ns) no carrinho
            </div>
          </div>

          <div style={{ padding: 16 }}>
            <label
              style={{
                display: 'grid',
                gap: 6,
                fontSize: 12,
                fontWeight: 800,
                color: '#374151',
              }}
            >
              Forma de pagamento
              <select
                value={formaPagamento}
                onChange={(event) =>
                  setFormaPagamento(event.target.value as FormaPagamento)
                }
                style={{
                  height: 42,
                  padding: '0 10px',
                  borderRadius: 7,
                  border: '1px solid #d1d5db',
                  background: '#fff',
                  fontSize: 14,
                }}
              >
                <option value="PIX">PIX</option>
                <option value="DINHEIRO">Dinheiro</option>
                <option value="CARTAO_DEBITO">Cartão de débito</option>
                <option value="CARTAO_CREDITO">Cartão de crédito</option>
                <option value="A_PRAZO">A PRAZO</option>
              </select>
            </label>

            {formaPagamento === 'A_PRAZO' && (
              <div style={{ marginTop: 14, padding: 12, border: '1px solid #fed7aa', borderRadius: 8, background: '#fff7ed' }}>
                <div style={{ fontWeight: 900, fontSize: 12, marginBottom: 9 }}>Cliente A Prazo — selecione o cadastro</div>
                <input value={clienteBusca} onChange={(e) => pesquisarClientesPrazo(e.target.value)} placeholder="Buscar por nome, CPF ou telefone" autoComplete="off" style={{ width: '100%', boxSizing: 'border-box', height: 38, padding: '0 10px', borderRadius: 7, border: '1px solid #d1d5db' }} />
                {buscandoClientes && <div style={{ fontSize: 11, marginTop: 6, color: '#6b7280' }}>Buscando...</div>}
                {clientesPrazo.length > 0 && (
                  <div style={{ marginTop: 6, border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
                    {clientesPrazo.slice(0, 8).map((cliente) => (
                      <button key={cliente.id} type="button" onClick={() => selecionarClientePrazo(cliente)} style={{ width: '100%', border: 0, borderBottom: '1px solid #f3f4f6', background: '#fff', padding: '9px 10px', textAlign: 'left', cursor: 'pointer' }}>
                        <strong>{cliente.nome}</strong>
                        <div style={{ fontSize: 11, color: '#6b7280' }}>Saldo {moeda(cliente.saldoDevedor)} · Limite {moeda(cliente.limiteCredito)} · Disponível {moeda(cliente.limiteDisponivel)}</div>
                      </button>
                    ))}
                  </div>
                )}
                {clienteSelecionado && (
                  <div style={{ marginTop: 10, padding: 10, background: '#fff', borderRadius: 8, border: '1px solid #fdba74' }}>
                    <strong>{clienteSelecionado.nome}</strong>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginTop: 7, fontSize: 11 }}>
                      <span>Limite<br/><b>{moeda(clienteSelecionado.limiteCredito)}</b></span>
                      <span>Em aberto<br/><b>{moeda(clienteSelecionado.saldoDevedor)}</b></span>
                      <span>Disponível<br/><b>{moeda(clienteSelecionado.limiteDisponivel)}</b></span>
                    </div>
                    {numero(clienteSelecionado.limiteDisponivel) <= 0 && <div style={{ marginTop: 8, color: '#b91c1c', fontWeight: 900 }}>BLOQUEADO PARA VENDA A PRAZO</div>}
                  </div>
                )}
              </div>
            )}

            <label
              style={{
                display: 'grid',
                gap: 6,
                marginTop: 14,
                fontSize: 12,
                fontWeight: 800,
                color: '#374151',
              }}
            >
              Código do executor
              <input
                type="password"
                value={codigoExecutor}
                onChange={(event) => setCodigoExecutor(event.target.value)}
                placeholder="Informe seu código"
                autoComplete="off"
                style={{
                  height: 42,
                  padding: '0 11px',
                  borderRadius: 7,
                  border: '1px solid #d1d5db',
                  fontSize: 14,
                }}
              />
            </label>

            <div
              style={{
                marginTop: 16,
                padding: '10px 11px',
                borderRadius: 8,
                background: '#f9fafb',
                border: '1px solid #e5e7eb',
                fontSize: 11,
                color: '#6b7280',
                lineHeight: 1.5,
              }}
            >
              <strong style={{ color: '#374151' }}>MATRIZ</strong>
              <br />
              Estoque: Área de Venda
            </div>

            <button
              type="button"
              onClick={finalizarVenda}
              disabled={finalizando || itens.length === 0 || !localId}
              style={{
                width: '100%',
                height: 50,
                marginTop: 16,
                border: 0,
                borderRadius: 8,
                background:
                  finalizando || itens.length === 0 || !localId
                    ? '#d1d5db'
                    : '#16a34a',
                color: '#fff',
                fontSize: 15,
                fontWeight: 950,
                cursor:
                  finalizando || itens.length === 0 || !localId
                    ? 'not-allowed'
                    : 'pointer',
              }}
            >
              {finalizando ? 'FINALIZANDO...' : 'FINALIZAR VENDA'}
            </button>

            <button
              type="button"
              onClick={limparVenda}
              disabled={itens.length === 0}
              style={{
                width: '100%',
                height: 38,
                marginTop: 8,
                border: '1px solid #d1d5db',
                borderRadius: 7,
                background: '#fff',
                color: '#4b5563',
                fontWeight: 800,
                cursor: itens.length === 0 ? 'not-allowed' : 'pointer',
              }}
            >
              Cancelar / limpar venda
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
