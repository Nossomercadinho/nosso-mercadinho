import {
  useEffect,
  useMemo,
  useState,
} from 'react';

type ProdutoBanco = {
  id: number;
  ean: string;
  nome: string;
  marca: string;
  foto: string;
  categoria: string;
  fornecedor: string;
  preco_custo: number;
  preco_venda: number;
  estoque: number;
  estoque_minimo: number;
  unidade_medida: string;
  ncm: string;
  cest: string;
  descricao_ncm: string;
  quantidade?: number;
  vinculadoMatriz?: boolean;
};

const API =
  '/api';

function fetchAutenticado(
  input: RequestInfo | URL,
  init: RequestInit = {}
) {
  const token = localStorage.getItem('token');
  const headers = new Headers(init.headers);

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  return fetch(input, {
    ...init,
    headers,
  });
}

export default function Produtos() {
  const [produtos, setProdutos] =
    useState<ProdutoBanco[]>([]);

  const [produtosMatriz, setProdutosMatriz] =
    useState<ProdutoBanco[]>([]);

  const [integrandoId, setIntegrandoId] =
    useState<number | null>(null);

  const [carregando, setCarregando] =
    useState(true);

  const [mostrarFormulario, setMostrarFormulario] =
    useState(false);

  const [produtoEditandoId, setProdutoEditandoId] =
    useState<number | null>(null);

  const [ean, setEan] = useState('');
  const [nome, setNome] = useState('');
  const [marca, setMarca] = useState('');
  const [foto, setFoto] = useState('');
  const [categoria, setCategoria] =
    useState('');
  const [fornecedor, setFornecedor] =
    useState('');
  const [precoCusto, setPrecoCusto] =
    useState('');
  const [precoVenda, setPrecoVenda] =
    useState('');
  const [estoqueInicial, setEstoqueInicial] =
    useState('');
  const [estoqueMinimo, setEstoqueMinimo] =
    useState('');
  const [unidadeMedida, setUnidadeMedida] =
    useState('');

  const [ncm, setNcm] = useState('');
  const [cest, setCest] = useState('');
  const [descricaoNcm, setDescricaoNcm] =
    useState('');

  const [buscandoEan, setBuscandoEan] =
    useState(false);

  const [validandoNcm, setValidandoNcm] =
    useState(false);

  const [salvando, setSalvando] =
    useState(false);

  const [mensagem, setMensagem] =
    useState('');

  const [busca, setBusca] =
    useState('');

  const [categoriaFiltro, setCategoriaFiltro] =
    useState('');

  useEffect(() => {
    carregarProdutos();
    carregarProdutosMatriz();
  }, []);

  async function carregarProdutos() {
    setCarregando(true);

    try {
      const response = await fetchAutenticado(
        `${API}/produtos`
      );

      const data = await response.json();

      if (!data.sucesso) {
        setMensagem(
          data.erro ||
            'Não foi possível carregar os produtos.'
        );
        return;
      }

      setProdutos(data.produtos || []);
    } catch (error) {
      console.error(error);

      setMensagem(
        'Não foi possível conectar ao servidor.'
      );
    } finally {
      setCarregando(false);
    }
  }

  async function carregarProdutosMatriz() {
    try {
      const response = await fetchAutenticado(
        `${API}/produtos/matriz/catalogo`
      );

      const data = await response.json();

      if (!response.ok || !data.sucesso) {
        setMensagem(
          data.erro ||
            'Não foi possível carregar os produtos da Matriz.'
        );
        return;
      }

      setProdutosMatriz(data.produtos || []);
    } catch (error) {
      console.error(error);
      setMensagem(
        'Não foi possível carregar o catálogo da Matriz.'
      );
    }
  }

  async function integrarNaMatriz(produto: ProdutoBanco) {
    setIntegrandoId(produto.id);
    setMensagem('');

    try {
      const response = await fetchAutenticado(
        `${API}/produtos/matriz/integrar/${produto.id}`,
        { method: 'POST' }
      );

      const data = await response.json();

      if (!response.ok || !data.sucesso) {
        setMensagem(
          data.erro ||
            'Não foi possível adicionar o produto à Matriz.'
        );
        return;
      }

      await carregarProdutosMatriz();
      setMensagem(
        `${produto.nome} adicionado à Matriz.`
      );
    } catch (error) {
      console.error(error);
      setMensagem(
        'Erro ao adicionar produto à Matriz.'
      );
    } finally {
      setIntegrandoId(null);
    }
  }

  function limparFormulario() {
    setProdutoEditandoId(null);

    setEan('');
    setNome('');
    setMarca('');
    setFoto('');
    setCategoria('');
    setFornecedor('');
    setPrecoCusto('');
    setPrecoVenda('');
    setEstoqueInicial('');
    setEstoqueMinimo('');
    setUnidadeMedida('');

    setNcm('');
    setCest('');
    setDescricaoNcm('');

    setMensagem('');
  }

  function abrirNovoProduto() {
    limparFormulario();
    setMostrarFormulario(true);
  }

  function cancelarFormulario() {
    limparFormulario();
    setMostrarFormulario(false);
  }

  async function buscarProdutoPorEan() {
    const codigo =
      ean.replace(/\D/g, '');

    if (!codigo) {
      setMensagem(
        'Digite ou leia o código de barras.'
      );
      return;
    }

    setBuscandoEan(true);
    setMensagem('');

    try {
      const response = await fetchAutenticado(
        `${API}/produtos/ean/${codigo}`
      );

      const data = await response.json();

      if (!response.ok || !data.sucesso) {
        setMensagem(
          data.erro ||
            'Produto não encontrado.'
        );
        return;
      }

      const produto = data.produto;

      setNome(produto.nome || '');
      setMarca(produto.marca || '');
      setFoto(produto.foto || '');

      if (produto.ncm) {
        setNcm(produto.ncm);

        if (produto.descricaoNcm) {
          setDescricaoNcm(
            produto.descricaoNcm
          );
        } else {
          await validarNcm(
            produto.ncm
          );
        }
      }

      if (produto.cest) {
        setCest(produto.cest);
      }

      setMensagem(
        data.origem === 'banco_local'
          ? 'Produto localizado no cadastro.'
          : 'Produto encontrado pelo EAN.'
      );
    } catch (error) {
      console.error(error);

      setMensagem(
        'Erro ao consultar o produto.'
      );
    } finally {
      setBuscandoEan(false);
    }
  }

  async function validarNcm(
    codigoOpcional?: string
  ) {
    const codigo =
      (
        codigoOpcional ||
        ncm
      ).replace(/\D/g, '');

    if (!codigo) {
      setDescricaoNcm('');
      return;
    }

    if (codigo.length !== 8) {
      setDescricaoNcm('');
      setMensagem(
        'O NCM precisa ter 8 números.'
      );
      return;
    }

    setValidandoNcm(true);
    setMensagem('');

    try {
      const response = await fetchAutenticado(
        `${API}/ncm/${codigo}`
      );

      const data = await response.json();

      if (!response.ok || !data.sucesso) {
        setDescricaoNcm('');
        setMensagem(
          data.erro ||
            'NCM não encontrado.'
        );
        return;
      }

      setNcm(
        String(data.ncm).replace(
          /\D/g,
          ''
        )
      );

      setDescricaoNcm(
        data.descricao || ''
      );

      setMensagem(
        'NCM validado com sucesso.'
      );
    } catch (error) {
      console.error(error);

      setMensagem(
        'Erro ao validar o NCM.'
      );
    } finally {
      setValidandoNcm(false);
    }
  }

  function alterarFoto(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const arquivo =
      event.target.files?.[0];

    if (!arquivo) {
      return;
    }

    if (!arquivo.type.startsWith('image/')) {
      setMensagem(
        'Selecione um arquivo de imagem.'
      );
      return;
    }

    const leitor = new FileReader();

    leitor.onload = () => {
      if (
        typeof leitor.result === 'string'
      ) {
        setFoto(leitor.result);
      }
    };

    leitor.readAsDataURL(arquivo);
  }

  async function salvarProduto() {
    if (!ean.trim()) {
      setMensagem(
        'Informe o EAN do produto.'
      );
      return;
    }

    if (!nome.trim()) {
      setMensagem(
        'Informe o nome do produto.'
      );
      return;
    }

    if (
      ncm &&
      ncm.length !== 8
    ) {
      setMensagem(
        'Confira o NCM antes de salvar.'
      );
      return;
    }

    if (
      ncm &&
      !descricaoNcm
    ) {
      setMensagem(
        'Valide o NCM antes de salvar.'
      );
      return;
    }

    setSalvando(true);
    setMensagem('');

    const payload = {
      ean,
      nome,
      marca,
      foto,
      categoria,
      fornecedor,
      precoCusto,
      precoVenda,
      estoqueInicial,
      estoqueMinimo,
      unidadeMedida,
      ncm,
      cest,
      descricaoNcm,
    };

    try {
      const url =
        produtoEditandoId
          ? `${API}/produtos/${produtoEditandoId}`
          : `${API}/produtos`;

      const metodo =
        produtoEditandoId
          ? 'PUT'
          : 'POST';

      const response = await fetchAutenticado(
        url,
        {
          method: metodo,

          headers: {
            'Content-Type':
              'application/json',
          },

          body:
            JSON.stringify(payload),
        }
      );

      const data =
        await response.json();

      if (!response.ok || !data.sucesso) {
        setMensagem(
          data.erro ||
            'Não foi possível salvar.'
        );
        return;
      }

      await carregarProdutos();

      limparFormulario();

      setMostrarFormulario(false);

      setMensagem(
        produtoEditandoId
          ? 'Produto atualizado.'
          : 'Produto cadastrado com sucesso.'
      );
    } catch (error) {
      console.error(error);

      setMensagem(
        'Erro ao salvar produto.'
      );
    } finally {
      setSalvando(false);
    }
  }

  function editarProduto(
    produto: ProdutoBanco
  ) {
    setProdutoEditandoId(
      produto.id
    );

    setEan(produto.ean || '');
    setNome(produto.nome || '');
    setMarca(produto.marca || '');
    setFoto(produto.foto || '');

    setCategoria(
      produto.categoria || ''
    );

    setFornecedor(
      produto.fornecedor || ''
    );

    setPrecoCusto(
      String(
        produto.preco_custo ?? ''
      )
    );

    setPrecoVenda(
      String(
        produto.preco_venda ?? ''
      )
    );

    setEstoqueInicial(
      String(
        produto.estoque ?? ''
      )
    );

    setEstoqueMinimo(
      String(
        produto.estoque_minimo ?? ''
      )
    );

    setUnidadeMedida(
      produto.unidade_medida || ''
    );

    setNcm(produto.ncm || '');
    setCest(produto.cest || '');

    setDescricaoNcm(
      produto.descricao_ncm || ''
    );

    setMensagem('');

    setMostrarFormulario(true);

    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  }

  async function excluirProduto(
    produto: ProdutoBanco
  ) {
    const confirmar =
      window.confirm(
        `Deseja remover o produto "${produto.nome}"?`
      );

    if (!confirmar) {
      return;
    }

    try {
      const response = await fetchAutenticado(
        `${API}/produtos/${produto.id}`,
        {
          method: 'DELETE',
        }
      );

      const data =
        await response.json();

      if (!response.ok || !data.sucesso) {
        setMensagem(
          data.erro ||
            'Não foi possível remover.'
        );
        return;
      }

      await carregarProdutos();

      setMensagem(
        'Produto removido com sucesso.'
      );
    } catch (error) {
      console.error(error);

      setMensagem(
        'Erro ao remover produto.'
      );
    }
  }

  const idsMatriz = useMemo(
    () => new Set(produtosMatriz.map((produto) => produto.id)),
    [produtosMatriz]
  );

  const categorias =
    useMemo(() => {
      return Array.from(
        new Set(
          produtos
            .map(
              (produto) =>
                produto.categoria
            )
            .filter(Boolean)
        )
      ).sort();
    }, [produtos]);

  const produtosFiltrados =
    useMemo(() => {
      const termo =
        busca
          .toLowerCase()
          .trim();

      return produtos.filter(
        (produto) => {
          const combinaBusca =
            !termo ||
            produto.nome
              ?.toLowerCase()
              .includes(termo) ||
            produto.ean
              ?.includes(termo) ||
            produto.ncm
              ?.includes(termo) ||
            produto.marca
              ?.toLowerCase()
              .includes(termo);

          const combinaCategoria =
            !categoriaFiltro ||
            produto.categoria ===
              categoriaFiltro;

          return (
            combinaBusca &&
            combinaCategoria
          );
        }
      );
    }, [
      produtos,
      busca,
      categoriaFiltro,
    ]);


  const indicadoresProdutos = useMemo(() => {
    const totalProdutos = produtos.length;

    const estoqueBaixo = produtos.filter((produto) => {
      const estoqueAtual = Number(produto.estoque || 0);
      const minimo = Number(produto.estoque_minimo || 0);

      return minimo > 0 && estoqueAtual > 0 && estoqueAtual <= minimo;
    }).length;

    const semEstoque = produtos.filter(
      (produto) => Number(produto.estoque || 0) <= 0
    ).length;

    const valorEstoque = produtos.reduce(
      (total, produto) =>
        total +
        Number(produto.estoque || 0) *
          Number(produto.preco_custo || 0),
      0
    );

    return {
      totalProdutos,
      estoqueBaixo,
      semEstoque,
      valorEstoque,
      totalCategorias: categorias.length,
    };
  }, [produtos, categorias]);

  function formatarDinheiro(valor?: number | null) {
    return Number(valor || 0).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });
  }

  function obterSituacaoProduto(produto: ProdutoBanco) {
    const estoqueAtual = Number(produto.estoque || 0);
    const minimo = Number(produto.estoque_minimo || 0);

    if (estoqueAtual <= 0) {
      return {
        classe: 'sem-estoque',
        texto: 'Sem estoque',
      };
    }

    if (minimo > 0 && estoqueAtual <= minimo) {
      return {
        classe: 'estoque-baixo',
        texto: 'Estoque baixo',
      };
    }

    return {
      classe: 'estoque-normal',
      texto: 'Normal',
    };
  }

  function calcularMargem(produto: ProdutoBanco) {
    const custo = Number(produto.preco_custo || 0);
    const venda = Number(produto.preco_venda || 0);

    if (custo <= 0 || venda <= 0) {
      return null;
    }

    return ((venda - custo) / custo) * 100;
  }

  function limparFiltros() {
    setBusca('');
    setCategoriaFiltro('');
  }

  return (
    <div className="produtos-page">
      <div className="page-header">
        <div>
          <h1>Produtos da Matriz</h1>

          <p>
            Catálogo da Matriz e cadastro rápido por código de barras.
          </p>
        </div>

        <button
          type="button"
          className="primary-button"
          onClick={abrirNovoProduto}
        >
          + Cadastrar novo produto na Matriz
        </button>
      </div>

      {mensagem && (
        <div className="produto-mensagem-geral">
          {mensagem}
        </div>
      )}

      {mostrarFormulario && (
        <div className="produto-form">
          <div className="produto-form-header">
            <h2>
              {produtoEditandoId
                ? 'Editar Produto'
                : 'Novo Produto'}
            </h2>

            <p>
              Digite ou leia o EAN
              para buscar os dados
              disponíveis.
            </p>
          </div>

          <div className="ean-area">
            <label>
              Código de barras —
              EAN / GTIN
            </label>

            <div className="ean-search">
              <input
                type="text"
                inputMode="numeric"
                value={ean}
                onChange={(event) =>
                  setEan(
                    event.target.value.replace(
                      /\D/g,
                      ''
                    )
                  )
                }
                onKeyDown={(event) => {
                  if (
                    event.key === 'Enter'
                  ) {
                    event.preventDefault();

                    buscarProdutoPorEan();
                  }
                }}
                placeholder="Digite ou leia o código de barras"
              />

              <button
                type="button"
                className="primary-button"
                disabled={buscandoEan}
                onClick={
                  buscarProdutoPorEan
                }
              >
                {buscandoEan
                  ? 'Buscando...'
                  : 'Buscar Produto'}
              </button>
            </div>
          </div>

          <div className="produto-dados-principais">
            <div>
              <div className="produto-foto-box">
                {foto ? (
                  <img
                    src={foto}
                    alt={nome}
                    className="produto-foto"
                  />
                ) : (
                  <div className="produto-sem-foto">
                    <span>
                      Imagem do produto
                    </span>

                    <small>
                      Busque pelo EAN ou
                      escolha uma imagem
                    </small>
                  </div>
                )}
              </div>

              <div className="foto-actions">
                <label className="secondary-button foto-upload-button">
                  Alterar foto

                  <input
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={
                      alterarFoto
                    }
                  />
                </label>

                {foto && (
                  <button
                    type="button"
                    className="foto-remover-button"
                    onClick={() =>
                      setFoto('')
                    }
                  >
                    Remover foto
                  </button>
                )}
              </div>
            </div>

            <div className="form-grid">
              <div>
                <label>
                  Nome do produto
                </label>

                <input
                  value={nome}
                  onChange={(event) =>
                    setNome(
                      event.target.value
                    )
                  }
                />
              </div>

              <div>
                <label>Marca</label>

                <input
                  value={marca}
                  onChange={(event) =>
                    setMarca(
                      event.target.value
                    )
                  }
                />
              </div>

              <div>
                <label>Categoria</label>

                <input
                  value={categoria}
                  onChange={(event) =>
                    setCategoria(
                      event.target.value
                    )
                  }
                />
              </div>

              <div>
                <label>
                  Fornecedor
                </label>

                <input
                  value={fornecedor}
                  onChange={(event) =>
                    setFornecedor(
                      event.target.value
                    )
                  }
                />
              </div>

              <div>
                <label>
                  Preço de custo
                </label>

                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={precoCusto}
                  onChange={(event) =>
                    setPrecoCusto(
                      event.target.value
                    )
                  }
                />
              </div>

              <div>
                <label>
                  Preço de venda
                </label>

                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={precoVenda}
                  onChange={(event) =>
                    setPrecoVenda(
                      event.target.value
                    )
                  }
                />
              </div>

              <div>
                <label>
                  Estoque inicial
                </label>

                <input
                  type="number"
                  min="0"
                  value={estoqueInicial}
                  onChange={(event) =>
                    setEstoqueInicial(
                      event.target.value
                    )
                  }
                />
              </div>

              <div>
                <label>
                  Estoque mínimo
                </label>

                <input
                  type="number"
                  min="0"
                  value={estoqueMinimo}
                  onChange={(event) =>
                    setEstoqueMinimo(
                      event.target.value
                    )
                  }
                />
              </div>

              <div>
                <label>
                  Unidade de medida
                </label>

                <select
                  value={
                    unidadeMedida
                  }
                  onChange={(event) =>
                    setUnidadeMedida(
                      event.target.value
                    )
                  }
                >
                  <option value="">
                    Selecione
                  </option>

                  <option value="UN">
                    Unidade (UN)
                  </option>

                  <option value="KG">
                    Quilograma (KG)
                  </option>

                  <option value="L">
                    Litro (L)
                  </option>

                  <option value="CX">
                    Caixa (CX)
                  </option>

                  <option value="PCT">
                    Pacote (PCT)
                  </option>
                </select>
              </div>
            </div>
          </div>

          <div className="dados-fiscais">
            <div className="secao-titulo">
              <div>
                <h3>
                  Dados Fiscais
                </h3>

                <p>
                  O NCM é validado na
                  tabela oficial salva
                  no sistema.
                </p>
              </div>

              <span className="status-fiscal">
                {descricaoNcm
                  ? 'NCM validado'
                  : 'Aguardando NCM'}
              </span>
            </div>

            <div className="form-grid">
              <div>
                <label>NCM</label>

                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={8}
                  value={ncm}
                  onChange={(event) => {
                    setNcm(
                      event.target.value.replace(
                        /\D/g,
                        ''
                      )
                    );

                    setDescricaoNcm(
                      ''
                    );
                  }}
                />

                <button
                  type="button"
                  className="secondary-button"
                  disabled={
                    validandoNcm
                  }
                  onClick={() =>
                    validarNcm()
                  }
                >
                  {validandoNcm
                    ? 'Validando...'
                    : 'Validar NCM'}
                </button>
              </div>

              <div>
                <label>CEST</label>

                <input
                  value={cest}
                  onChange={(event) =>
                    setCest(
                      event.target.value
                    )
                  }
                />
              </div>

              <div className="campo-largo">
                <label>
                  Descrição oficial do
                  NCM
                </label>

                <input
                  value={
                    descricaoNcm
                  }
                  readOnly
                />
              </div>
            </div>
          </div>

          <div className="form-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={
                cancelarFormulario
              }
            >
              Cancelar
            </button>

            <button
              type="button"
              className="primary-button"
              disabled={salvando}
              onClick={
                salvarProduto
              }
            >
              {salvando
                ? 'Salvando...'
                : produtoEditandoId
                ? 'Salvar Alterações'
                : 'Salvar Produto'}
            </button>
          </div>
        </div>
      )}

      <section
        className="produtos-filtros-card"
        style={{ marginBottom: 18 }}
      >
        <div className="produtos-filtros-header">
          <div>
            <h3>Catálogo da Matriz</h3>
            <p>
              {produtosMatriz.length} produto(s) integrado(s) à Matriz.
              Produtos novos devem ser cadastrados aqui e não são
              adicionados automaticamente às demais unidades.
            </p>
          </div>
        </div>
      </section>

      <section className="produtos-indicadores">
        <div className="produto-indicador-card">
          <div className="produto-indicador-icone">▦</div>

          <div>
            <span>Produtos cadastrados</span>
            <strong>{indicadoresProdutos.totalProdutos}</strong>
            <small>itens ativos no catálogo</small>
          </div>
        </div>

        <div className="produto-indicador-card">
          <div className="produto-indicador-icone alerta">!</div>

          <div>
            <span>Estoque baixo</span>
            <strong>{indicadoresProdutos.estoqueBaixo}</strong>
            <small>itens próximos do mínimo</small>
          </div>
        </div>

        <div className="produto-indicador-card">
          <div className="produto-indicador-icone perigo">0</div>

          <div>
            <span>Sem estoque</span>
            <strong>{indicadoresProdutos.semEstoque}</strong>
            <small>itens com saldo zerado</small>
          </div>
        </div>

        <div className="produto-indicador-card">
          <div className="produto-indicador-icone">R$</div>

          <div>
            <span>Valor em estoque</span>
            <strong>
              {formatarDinheiro(indicadoresProdutos.valorEstoque)}
            </strong>
            <small>com base no preço de custo</small>
          </div>
        </div>

        <div className="produto-indicador-card">
          <div className="produto-indicador-icone sucesso">✓</div>

          <div>
            <span>Categorias</span>
            <strong>{indicadoresProdutos.totalCategorias}</strong>
            <small>categorias cadastradas</small>
          </div>
        </div>
      </section>

      <section className="produtos-filtros-card">
        <div className="produtos-filtros-header">
          <div>
            <h3>Catálogo geral — adicionar à Matriz</h3>

            <p>
              Pesquise o catálogo já existente e integre à Matriz sem duplicar o EAN.
            </p>
          </div>

          <button
            type="button"
            className="secondary-button"
            onClick={limparFiltros}
          >
            Limpar filtros
          </button>
        </div>

        <div className="produtos-filtros-modernos">
          <div className="produtos-busca">
            <span className="produtos-busca-icone">⌕</span>

            <input
              type="text"
              value={busca}
              onChange={(event) =>
                setBusca(event.target.value)
              }
              placeholder="Buscar por nome, EAN, NCM ou marca..."
            />
          </div>

          <div>
            <label>Categoria</label>

            <select
              value={categoriaFiltro}
              onChange={(event) =>
                setCategoriaFiltro(event.target.value)
              }
            >
              <option value="">
                Todas as categorias
              </option>

              {categorias.map((categoria) => (
                <option
                  key={categoria}
                  value={categoria}
                >
                  {categoria}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <div className="produtos-lista-info">
        <span>
          <strong>{produtosFiltrados.length}</strong>{' '}
          produto(s) encontrado(s)
        </span>

        {(busca || categoriaFiltro) && (
          <span className="produtos-filtro-ativo">
            Filtros ativos
          </span>
        )}
      </div>

      <div className="produtos-table produtos-table-moderna">
        <table>
          <thead>
            <tr>
              <th>Produto</th>
              <th>EAN</th>
              <th>NCM</th>
              <th>Categoria</th>
              <th>Estoque</th>
              <th>Situação</th>
              <th>Custo</th>
              <th>Venda</th>
              <th>Margem</th>
              <th>Ações</th>
            </tr>
          </thead>

          <tbody>
            {carregando ? (
              <tr>
                <td
                  colSpan={10}
                  className="empty-table"
                >
                  Carregando produtos...
                </td>
              </tr>
            ) : produtosFiltrados.length === 0 ? (
              <tr>
                <td
                  colSpan={10}
                  className="empty-table"
                >
                  Nenhum produto encontrado.
                </td>
              </tr>
            ) : (
              produtosFiltrados.map((produto) => {
                const situacao =
                  obterSituacaoProduto(produto);

                const margem =
                  calcularMargem(produto);

                return (
                  <tr key={produto.id}>
                    <td>
                      <div className="produto-tabela-info moderno">
                        <div className="produto-tabela-imagem">
                          {produto.foto ? (
                            <img
                              src={produto.foto}
                              alt={produto.nome}
                            />
                          ) : (
                            <div className="produto-tabela-sem-foto">
                              ▦
                            </div>
                          )}
                        </div>

                        <div className="produto-tabela-textos">
                          <strong>{produto.nome}</strong>

                          <span>
                            {produto.marca || 'Sem marca'}
                          </span>
                        </div>
                      </div>
                    </td>

                    <td>
                      <span className="produto-codigo">
                        {produto.ean}
                      </span>
                    </td>

                    <td>
                      <span className="produto-codigo">
                        {produto.ncm || '-'}
                      </span>
                    </td>

                    <td>
                      {produto.categoria ? (
                        <span className="produto-categoria-badge">
                          {produto.categoria}
                        </span>
                      ) : (
                        <span className="produto-sem-informacao">
                          Sem categoria
                        </span>
                      )}
                    </td>

                    <td>
                      <div className="produto-estoque-valor">
                        <strong>{produto.estoque ?? 0}</strong>

                        <span>
                          {produto.unidade_medida || 'UN'}
                        </span>
                      </div>
                    </td>

                    <td>
                      <span
                        className={`produto-status-badge ${situacao.classe}`}
                      >
                        {situacao.texto}
                      </span>
                    </td>

                    <td>
                      <span className="produto-preco custo">
                        {formatarDinheiro(
                          produto.preco_custo
                        )}
                      </span>
                    </td>

                    <td>
                      <span className="produto-preco venda">
                        {formatarDinheiro(
                          produto.preco_venda
                        )}
                      </span>
                    </td>

                    <td>
                      {margem === null ? (
                        <span className="produto-sem-informacao">
                          -
                        </span>
                      ) : (
                        <span
                          className={
                            margem >= 0
                              ? 'produto-margem positiva'
                              : 'produto-margem negativa'
                          }
                        >
                          {margem.toFixed(1)}%
                        </span>
                      )}
                    </td>

                    <td>
                      <div className="acoes-produto moderno">
                        <button
                          type="button"
                          className="primary-button"
                          disabled={
                            idsMatriz.has(produto.id) ||
                            integrandoId === produto.id
                          }
                          onClick={() =>
                            integrarNaMatriz(produto)
                          }
                        >
                          {idsMatriz.has(produto.id)
                            ? 'Na Matriz'
                            : integrandoId === produto.id
                            ? 'Adicionando...'
                            : 'Adicionar à Matriz'}
                        </button>

                        <button
                          type="button"
                          className="editar-button"
                          onClick={() =>
                            editarProduto(produto)
                          }
                        >
                          Editar
                        </button>

                        <button
                          type="button"
                          className="excluir-button"
                          onClick={() =>
                            excluirProduto(produto)
                          }
                        >
                          Excluir
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}