import { useEffect, useMemo, useState } from 'react';

type Loja = {
  id: number;
  empresa_id: number;
  nome: string;
  codigo: string;
  tipo: 'MATRIZ' | 'FILIAL';
  cnpj: string;
  endereco: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  estado: string;
  cep: string;
  telefone: string;
  quantidade_locais: number;
};

type LocalEstoque = {
  id: number;
  loja_id: number;
  nome: string;
  tipo: string;
  permite_venda: number;
};

type ProdutoLocal = {
  produto_id: number;
  produto: string;
  codigo_interno: string;
  codigo_barras: string;
  loja_id: number;
  loja: string;
  local_id: number;
  local: string;
  quantidade: number;
  custo_medio: number;
};

type ExecutorIdentificado = {
  id: number;
  codigo: string;
  nome: string;
};

const API = '/api';

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

export default function Unidades() {
  const [lojas, setLojas] = useState<Loja[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [lojaEditandoId, setLojaEditandoId] = useState<number | null>(null);

  const [nome, setNome] = useState('');
  const [codigo, setCodigo] = useState('');
  const [tipo, setTipo] = useState<'MATRIZ' | 'FILIAL'>('FILIAL');
  const [cnpj, setCnpj] = useState('');
  const [endereco, setEndereco] = useState('');
  const [numero, setNumero] = useState('');
  const [complemento, setComplemento] = useState('');
  const [bairro, setBairro] = useState('');
  const [cidade, setCidade] = useState('');
  const [estado, setEstado] = useState('');
  const [cep, setCep] = useState('');
  const [telefone, setTelefone] = useState('');
  const [possuiDeposito, setPossuiDeposito] = useState(true);

  const [mensagem, setMensagem] = useState('');
  const [salvando, setSalvando] = useState(false);

  const [busca, setBusca] = useState('');
  const [filtroTipo, setFiltroTipo] = useState<'TODAS' | 'MATRIZ' | 'FILIAL'>('TODAS');

  const [lojaSelecionada, setLojaSelecionada] = useState<Loja | null>(null);
  const [locais, setLocais] = useState<LocalEstoque[]>([]);
  const [carregandoLocais, setCarregandoLocais] = useState(false);

  const [mostrarNovoLocal, setMostrarNovoLocal] = useState(false);
  const [nomeLocal, setNomeLocal] = useState('');
  const [tipoLocal, setTipoLocal] = useState('OUTRO');
  const [permiteVenda, setPermiteVenda] = useState(false);

  const [localEditandoId, setLocalEditandoId] = useState<number | null>(null);
  const [nomeLocalEdicao, setNomeLocalEdicao] = useState('');
  const [tipoLocalEdicao, setTipoLocalEdicao] = useState('OUTRO');
  const [permiteVendaEdicao, setPermiteVendaEdicao] = useState(false);
  const [salvandoLocal, setSalvandoLocal] = useState(false);

  const [localProdutos, setLocalProdutos] = useState<LocalEstoque | null>(null);
  const [produtosLocal, setProdutosLocal] = useState<ProdutoLocal[]>([]);
  const [carregandoProdutosLocal, setCarregandoProdutosLocal] = useState(false);
  const [buscaProdutoLocal, setBuscaProdutoLocal] = useState('');
  const [produtoCorrigindo, setProdutoCorrigindo] = useState<ProdutoLocal | null>(null);
  const [quantidadeCorreta, setQuantidadeCorreta] = useState('');
  const [justificativaCorrecao, setJustificativaCorrecao] = useState('');
  const [salvandoCorrecao, setSalvandoCorrecao] = useState(false);

  const [contagensRapidas, setContagensRapidas] = useState<Record<number, string>>({});
  const [justificativasRapidas, setJustificativasRapidas] = useState<Record<number, string>>({});
  const [salvandoProdutoId, setSalvandoProdutoId] = useState<number | null>(null);

  const [codigoExecutor, setCodigoExecutor] = useState('');
  const [executorIdentificado, setExecutorIdentificado] =
    useState<ExecutorIdentificado | null>(null);
  const [validandoExecutor, setValidandoExecutor] = useState(false);

  useEffect(() => {
    carregarLojas();
  }, []);

  async function carregarLojas() {
    setCarregando(true);

    try {
      const response = await fetchAutenticado(`${API}/lojas`);
      const data = await response.json();

      if (!response.ok || !data.sucesso) {
        setMensagem(data.erro || 'Erro ao carregar unidades.');
        return;
      }

      setLojas(data.lojas || []);
    } catch (error) {
      console.error(error);
      setMensagem('Não foi possível conectar ao servidor.');
    } finally {
      setCarregando(false);
    }
  }

  function limparFormulario() {
    setLojaEditandoId(null);
    setNome('');
    setCodigo('');
    setTipo('FILIAL');
    setCnpj('');
    setEndereco('');
    setNumero('');
    setComplemento('');
    setBairro('');
    setCidade('');
    setEstado('');
    setCep('');
    setTelefone('');
    setPossuiDeposito(true);
  }

  function abrirNovaUnidade() {
    limparFormulario();
    setMensagem('');
    setMostrarFormulario(true);
  }

  function cancelarFormulario() {
    limparFormulario();
    setMostrarFormulario(false);
  }

  function editarLoja(loja: Loja) {
    setLojaEditandoId(loja.id);
    setNome(loja.nome || '');
    setCodigo(loja.codigo || '');
    setTipo(loja.tipo || 'FILIAL');
    setCnpj(loja.cnpj || '');
    setEndereco(loja.endereco || '');
    setNumero(loja.numero || '');
    setComplemento(loja.complemento || '');
    setBairro(loja.bairro || '');
    setCidade(loja.cidade || '');
    setEstado(loja.estado || '');
    setCep(loja.cep || '');
    setTelefone(loja.telefone || '');
    setPossuiDeposito(loja.quantidade_locais > 1);

    setMensagem('');
    setMostrarFormulario(true);

    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  }

  async function salvarUnidade() {
    if (!nome.trim()) {
      setMensagem('Informe o nome da unidade.');
      return;
    }

    setSalvando(true);
    setMensagem('');

    const payload = {
      empresaId: 1,
      nome,
      codigo,
      tipo,
      cnpj,
      endereco,
      numero,
      complemento,
      bairro,
      cidade,
      estado,
      cep,
      telefone,
      possuiDeposito,
    };

    try {
      const url = lojaEditandoId
        ? `${API}/lojas/${lojaEditandoId}`
        : `${API}/lojas`;

      const method = lojaEditandoId
        ? 'PUT'
        : 'POST';

      const response = await fetchAutenticado(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok || !data.sucesso) {
        setMensagem(
          data.erro || 'Não foi possível salvar a unidade.'
        );
        return;
      }

      await carregarLojas();

      limparFormulario();
      setMostrarFormulario(false);

      setMensagem(
        lojaEditandoId
          ? 'Unidade atualizada com sucesso.'
          : 'Unidade cadastrada com sucesso.'
      );
    } catch (error) {
      console.error(error);
      setMensagem('Erro ao salvar unidade.');
    } finally {
      setSalvando(false);
    }
  }

  async function excluirLoja(loja: Loja) {
    const confirmar = window.confirm(
      `Deseja desativar a unidade "${loja.nome}"?`
    );

    if (!confirmar) return;

    try {
      const response = await fetchAutenticado(
        `${API}/lojas/${loja.id}`,
        {
          method: 'DELETE',
        }
      );

      const data = await response.json();

      if (!response.ok || !data.sucesso) {
        setMensagem(
          data.erro || 'Não foi possível desativar a unidade.'
        );
        return;
      }

      if (lojaSelecionada?.id === loja.id) {
        setLojaSelecionada(null);
        setLocais([]);
      }

      await carregarLojas();

      setMensagem('Unidade desativada com sucesso.');
    } catch (error) {
      console.error(error);
      setMensagem('Erro ao desativar unidade.');
    }
  }

  async function abrirLocais(loja: Loja) {
    setLojaSelecionada(loja);
    setCarregandoLocais(true);
    setMostrarNovoLocal(false);

    try {
      const response = await fetchAutenticado(
        `${API}/lojas/${loja.id}/locais`
      );

      const data = await response.json();

      if (!response.ok || !data.sucesso) {
        setMensagem(
          data.erro || 'Erro ao carregar locais.'
        );
        return;
      }

      setLocais(data.locais || []);
    } catch (error) {
      console.error(error);
      setMensagem('Erro ao carregar locais de estoque.');
    } finally {
      setCarregandoLocais(false);
    }
  }

  async function criarLocal() {
    if (!lojaSelecionada) return;

    if (!nomeLocal.trim()) {
      setMensagem('Informe o nome do local.');
      return;
    }

    try {
      const response = await fetchAutenticado(
        `${API}/lojas/${lojaSelecionada.id}/locais`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            nome: nomeLocal,
            tipo: tipoLocal,
            permiteVenda,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.sucesso) {
        setMensagem(
          data.erro || 'Erro ao criar local de estoque.'
        );
        return;
      }

      setNomeLocal('');
      setTipoLocal('OUTRO');
      setPermiteVenda(false);
      setMostrarNovoLocal(false);

      await abrirLocais(lojaSelecionada);
      await carregarLojas();

      setMensagem('Local de estoque criado.');
    } catch (error) {
      console.error(error);
      setMensagem('Erro ao criar local.');
    }
  }

  function iniciarEdicaoLocal(local: LocalEstoque) {
    setLocalEditandoId(local.id);
    setNomeLocalEdicao(local.nome || '');
    setTipoLocalEdicao(local.tipo || 'OUTRO');
    setPermiteVendaEdicao(Boolean(local.permite_venda));
    setMensagem('');
  }

  function cancelarEdicaoLocal() {
    setLocalEditandoId(null);
    setNomeLocalEdicao('');
    setTipoLocalEdicao('OUTRO');
    setPermiteVendaEdicao(false);
  }

  async function salvarEdicaoLocal() {
    if (!lojaSelecionada || !localEditandoId) return;

    if (!nomeLocalEdicao.trim()) {
      setMensagem('Informe o nome do local.');
      return;
    }

    setSalvandoLocal(true);
    setMensagem('');

    try {
      const response = await fetchAutenticado(
        `${API}/lojas/${lojaSelecionada.id}/locais/${localEditandoId}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            nome: nomeLocalEdicao,
            tipo: tipoLocalEdicao,
            permiteVenda: permiteVendaEdicao,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.sucesso) {
        setMensagem(data.erro || 'Erro ao atualizar local de estoque.');
        return;
      }

      cancelarEdicaoLocal();
      await abrirLocais(lojaSelecionada);
      await carregarLojas();
      setMensagem('Local de estoque atualizado com sucesso.');
    } catch (error) {
      console.error(error);
      setMensagem('Erro ao atualizar local de estoque.');
    } finally {
      setSalvandoLocal(false);
    }
  }

  async function carregarProdutosDoLocal(local: LocalEstoque) {
    if (!lojaSelecionada) return;

    setCarregandoProdutosLocal(true);

    try {
      const response = await fetchAutenticado(
        `${API}/estoque?lojaId=${lojaSelecionada.id}`
      );
      const data = await response.json();

      if (!response.ok || !data.sucesso) {
        setMensagem(data.erro || 'Erro ao carregar produtos do estoque.');
        return;
      }

      const itens = (data.estoque || []).filter(
        (item: ProdutoLocal) =>
          Number(item.local_id) === Number(local.id)
      );

      setProdutosLocal(itens);
    } catch (error) {
      console.error(error);
      setMensagem('Erro ao carregar produtos deste local.');
    } finally {
      setCarregandoProdutosLocal(false);
    }
  }

  async function abrirProdutosLocal(local: LocalEstoque) {
    if (!lojaSelecionada) return;

    setLocalProdutos(local);
    setProdutoCorrigindo(null);
    setBuscaProdutoLocal('');
    setContagensRapidas({});
    setJustificativasRapidas({});
    setCodigoExecutor('');
    setExecutorIdentificado(null);
    setMensagem('');

    await carregarProdutosDoLocal(local);
  }

  function iniciarCorrecaoProduto(item: ProdutoLocal) {
    setProdutoCorrigindo(item);
    setQuantidadeCorreta(String(Number(item.quantidade || 0)));
    setJustificativaCorrecao('');
  }

  async function salvarCorrecaoProduto() {
    if (!produtoCorrigindo) return;

    const quantidade = Number(
      String(quantidadeCorreta).replace(',', '.')
    );

    if (!Number.isFinite(quantidade) || quantidade < 0) {
      setMensagem('Informe uma quantidade válida.');
      return;
    }

    if (
      quantidade !== Number(produtoCorrigindo.quantidade || 0) &&
      !justificativaCorrecao.trim()
    ) {
      setMensagem('Informe a justificativa da correção.');
      return;
    }

    const executor =
      executorIdentificado || (await identificarExecutor());

    if (!executor) return;

    setSalvandoCorrecao(true);
    setMensagem('');

    try {
      const usuarioSalvo = localStorage.getItem('usuarioLogado');
      const usuario = usuarioSalvo ? JSON.parse(usuarioSalvo) : null;

      const response = await fetchAutenticado(`${API}/estoque/nova-contagem`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          produtoId: produtoCorrigindo.produto_id,
          lojaId: produtoCorrigindo.loja_id,
          localId: produtoCorrigindo.local_id,
          quantidadeContada: quantidade,
          observacao: 'Correção de quantidade pela unidade',
          justificativa: justificativaCorrecao,
          codigoExecutor: executor.codigo,
          usuarioId: usuario?.id || null,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.sucesso) {
        setMensagem(data.erro || 'Erro ao corrigir quantidade.');
        return;
      }

      setProdutoCorrigindo(null);
      setQuantidadeCorreta('');
      setJustificativaCorrecao('');

      if (localProdutos) {
        await carregarProdutosDoLocal(localProdutos);
      }

      setMensagem(
        data.mensagem || 'Quantidade corrigida com sucesso.'
      );
    } catch (error) {
      console.error(error);
      setMensagem('Erro ao corrigir quantidade.');
    } finally {
      setSalvandoCorrecao(false);
    }
  }

  async function identificarExecutor() {
    const codigo = codigoExecutor.trim();

    if (!codigo) {
      setExecutorIdentificado(null);
      setMensagem('Informe o ID do executor.');
      return null;
    }

    setValidandoExecutor(true);
    setMensagem('');

    try {
      const response = await fetchAutenticado(
        `${API}/executores/codigo/${encodeURIComponent(codigo)}`
      );

      const data = await response.json();

      if (!response.ok || !data.sucesso) {
        setExecutorIdentificado(null);
        setMensagem(
          data.erro || 'Não foi possível identificar o executor.'
        );
        return null;
      }

      const executor = data.executor as ExecutorIdentificado;
      setExecutorIdentificado(executor);
      return executor;
    } catch (error) {
      console.error(error);
      setExecutorIdentificado(null);
      setMensagem('Erro ao identificar executor.');
      return null;
    } finally {
      setValidandoExecutor(false);
    }
  }

  function valorContagemRapida(item: ProdutoLocal) {
    return contagensRapidas[item.produto_id] ?? '';
  }

  function diferencaContagemRapida(item: ProdutoLocal) {
    const valor = valorContagemRapida(item);

    if (valor === '') return null;

    const contado = Number(String(valor).replace(',', '.'));

    if (!Number.isFinite(contado)) return null;

    return contado - Number(item.quantidade || 0);
  }

  async function salvarContagemRapida(item: ProdutoLocal) {
    const valor = valorContagemRapida(item);

    if (valor === '') {
      setMensagem('Informe a quantidade física contada.');
      return;
    }

    const quantidade = Number(String(valor).replace(',', '.'));

    if (!Number.isFinite(quantidade) || quantidade < 0) {
      setMensagem('Informe uma quantidade válida.');
      return;
    }

    const diferenca = quantidade - Number(item.quantidade || 0);
    const justificativa = justificativasRapidas[item.produto_id] || '';

    if (diferenca !== 0 && !justificativa.trim()) {
      setMensagem('Informe a justificativa da divergência.');
      return;
    }

    const executor =
      executorIdentificado || (await identificarExecutor());

    if (!executor) return;

    setSalvandoProdutoId(item.produto_id);
    setMensagem('');

    try {
      const usuarioSalvo = localStorage.getItem('usuarioLogado');
      const usuario = usuarioSalvo ? JSON.parse(usuarioSalvo) : null;

      const response = await fetchAutenticado(`${API}/estoque/nova-contagem`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          produtoId: item.produto_id,
          lojaId: item.loja_id,
          localId: item.local_id,
          quantidadeContada: quantidade,
          observacao: 'Inventário rápido pela unidade',
          justificativa:
            diferenca === 0
              ? 'Contagem física sem divergência'
              : justificativa,
          codigoExecutor: executor.codigo,
          usuarioId: usuario?.id || null,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.sucesso) {
        setMensagem(data.erro || 'Erro ao registrar contagem.');
        return;
      }

      setContagensRapidas((anterior) => {
        const novo = { ...anterior };
        delete novo[item.produto_id];
        return novo;
      });

      setJustificativasRapidas((anterior) => {
        const novo = { ...anterior };
        delete novo[item.produto_id];
        return novo;
      });

      if (localProdutos) {
        await carregarProdutosDoLocal(localProdutos);
      }

      setMensagem(
        diferenca === 0
          ? 'Contagem registrada sem divergência.'
          : `Estoque ajustado com sucesso (${diferenca > 0 ? '+' : ''}${diferenca}).`
      );
    } catch (error) {
      console.error(error);
      setMensagem('Erro ao registrar contagem.');
    } finally {
      setSalvandoProdutoId(null);
    }
  }

  const produtosLocalFiltrados = useMemo(() => {
    const termo = buscaProdutoLocal
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();

    if (!termo) return produtosLocal;

    return produtosLocal.filter((item) => {
      const texto = [
        item.produto,
        item.codigo_interno,
        item.codigo_barras,
      ]
        .filter(Boolean)
        .join(' ')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();

      return texto.includes(termo);
    });
  }, [produtosLocal, buscaProdutoLocal]);

  const lojasFiltradas = useMemo(() => {
    const termo = busca
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();

    return lojas.filter((loja) => {
      if (
        filtroTipo !== 'TODAS' &&
        loja.tipo !== filtroTipo
      ) {
        return false;
      }

      if (!termo) {
        return true;
      }

      const pesquisa = [
        loja.nome,
        loja.codigo,
        loja.tipo,
        loja.cnpj,
        loja.endereco,
        loja.bairro,
        loja.cidade,
        loja.estado,
        loja.telefone,
      ]
        .filter(Boolean)
        .join(' ')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();

      return pesquisa.includes(termo);
    });
  }, [lojas, busca, filtroTipo]);

  const indicadores = useMemo(() => {
    const matriz = lojas.filter(
      (loja) => loja.tipo === 'MATRIZ'
    ).length;

    const filiais = lojas.filter(
      (loja) => loja.tipo === 'FILIAL'
    ).length;

    const locais = lojas.reduce(
      (total, loja) =>
        total +
        Number(
          loja.quantidade_locais || 0
        ),
      0
    );

    return {
      total: lojas.length,
      matriz,
      filiais,
      locais,
    };
  }, [lojas]);

  return (
    <div className="unidades-page">
      <div className="page-header">
        <div>
          <h1>Unidades</h1>
          <p>
            Gerenciamento da Matriz, filiais e locais de estoque.
          </p>
        </div>

        <button
          type="button"
          className="primary-button"
          onClick={abrirNovaUnidade}
        >
          + Nova Unidade
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
              {lojaEditandoId
                ? 'Editar Unidade'
                : 'Nova Unidade'}
            </h2>

            <p>
              Cadastre a Matriz e cada filial do Nosso Mercadinho.
            </p>
          </div>

          <div className="form-grid">
            <div>
              <label>Nome da unidade</label>
              <input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex.: Matriz"
              />
            </div>

            <div>
              <label>Código interno</label>
              <input
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                placeholder="Ex.: MAT, TSC01..."
              />
            </div>

            <div>
              <label>Tipo</label>

              <select
                value={tipo}
                onChange={(e) =>
                  setTipo(
                    e.target.value as 'MATRIZ' | 'FILIAL'
                  )
                }
              >
                <option value="MATRIZ">
                  Matriz
                </option>

                <option value="FILIAL">
                  Filial
                </option>
              </select>
            </div>

            <div>
              <label>CNPJ</label>
              <input
                value={cnpj}
                onChange={(e) => setCnpj(e.target.value)}
                placeholder="CNPJ da unidade"
              />
            </div>

            <div>
              <label>Endereço</label>
              <input
                value={endereco}
                onChange={(e) => setEndereco(e.target.value)}
              />
            </div>

            <div>
              <label>Número</label>
              <input
                value={numero}
                onChange={(e) => setNumero(e.target.value)}
              />
            </div>

            <div>
              <label>Complemento</label>
              <input
                value={complemento}
                onChange={(e) =>
                  setComplemento(e.target.value)
                }
              />
            </div>

            <div>
              <label>Bairro</label>
              <input
                value={bairro}
                onChange={(e) => setBairro(e.target.value)}
              />
            </div>

            <div>
              <label>Cidade</label>
              <input
                value={cidade}
                onChange={(e) => setCidade(e.target.value)}
              />
            </div>

            <div>
              <label>Estado</label>
              <input
                value={estado}
                onChange={(e) => setEstado(e.target.value)}
                maxLength={2}
                placeholder="PR"
              />
            </div>

            <div>
              <label>CEP</label>
              <input
                value={cep}
                onChange={(e) => setCep(e.target.value)}
              />
            </div>

            <div>
              <label>Telefone</label>
              <input
                value={telefone}
                onChange={(e) =>
                  setTelefone(e.target.value)
                }
              />
            </div>
          </div>

          {!lojaEditandoId && tipo === 'FILIAL' && (
            <div className="unidade-checkbox">
              <label>
                <input
                  type="checkbox"
                  checked={possuiDeposito}
                  onChange={(e) =>
                    setPossuiDeposito(
                      e.target.checked
                    )
                  }
                />

                Esta filial possui depósito/reserva para reposição
              </label>
            </div>
          )}

          {tipo === 'MATRIZ' && (
            <div className="aviso-fiscal">
              A Matriz terá automaticamente um
              <strong> Depósito </strong>
              e uma
              <strong> Área de Venda</strong>.
            </div>
          )}

          <div className="form-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={cancelarFormulario}
            >
              Cancelar
            </button>

            <button
              type="button"
              className="primary-button"
              disabled={salvando}
              onClick={salvarUnidade}
            >
              {salvando
                ? 'Salvando...'
                : lojaEditandoId
                ? 'Salvar Alterações'
                : 'Cadastrar Unidade'}
            </button>
          </div>
        </div>
      )}

      <section
        style={{
          marginTop: 24,
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns:
              'repeat(4, minmax(0, 1fr))',
            gap: 16,
            marginBottom: 20,
          }}
        >
          {[
            ['Unidades', indicadores.total],
            ['Matriz', indicadores.matriz],
            ['Filiais', indicadores.filiais],
            ['Locais de estoque', indicadores.locais],
          ].map(([titulo, valor]) => (
            <div
              key={String(titulo)}
              style={{
                background: '#fff',
                border: '1px solid #ececec',
                borderRadius: 16,
                padding: 18,
                boxShadow:
                  '0 8px 24px rgba(0,0,0,.05)',
              }}
            >
              <span
                style={{
                  display: 'block',
                  color: '#777',
                  fontSize: 12,
                  marginBottom: 8,
                }}
              >
                {titulo}
              </span>

              <strong
                style={{
                  fontSize: 28,
                }}
              >
                {valor}
              </strong>
            </div>
          ))}
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns:
              'minmax(0, 1fr) 220px',
            gap: 12,
            alignItems: 'center',
            marginBottom: 20,
            background: '#fff',
            border: '1px solid #ececec',
            borderRadius: 16,
            padding: 14,
          }}
        >
          <input
            type="text"
            value={busca}
            onChange={(e) =>
              setBusca(e.target.value)
            }
            placeholder="Pesquisar unidade, código, cidade, CNPJ..."
            style={{
              width: '100%',
              height: 46,
              padding: '0 14px',
              border:
                '1px solid #dedede',
              borderRadius: 10,
            }}
          />

          <select
            value={filtroTipo}
            onChange={(e) =>
              setFiltroTipo(
                e.target.value as
                  | 'TODAS'
                  | 'MATRIZ'
                  | 'FILIAL'
              )
            }
            style={{
              width: '100%',
              height: 46,
              padding: '0 12px',
              border:
                '1px solid #dedede',
              borderRadius: 10,
              background: '#fff',
            }}
          >
            <option value="TODAS">
              Todas as unidades
            </option>

            <option value="MATRIZ">
              Matriz
            </option>

            <option value="FILIAL">
              Filiais
            </option>
          </select>
        </div>

        {carregando ? (
          <div className="unidade-vazia">
            Carregando unidades...
          </div>
        ) : lojasFiltradas.length === 0 ? (
          <div className="unidade-vazia">
            Nenhuma unidade encontrada.
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns:
                'repeat(2, minmax(0, 1fr))',
              gap: 18,
            }}
          >
            {lojasFiltradas.map((loja) => (
              <article
                key={loja.id}
                style={{
                  background: '#fff',
                  border:
                    '1px solid #ececec',
                  borderRadius: 18,
                  padding: 20,
                  boxShadow:
                    '0 10px 28px rgba(0,0,0,.06)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 16,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent:
                      'space-between',
                    gap: 16,
                    alignItems:
                      'flex-start',
                  }}
                >
                  <div>
                    <span
                      style={{
                        display:
                          'inline-block',
                        fontSize: 11,
                        fontWeight: 700,
                        textTransform:
                          'uppercase',
                        padding:
                          '5px 8px',
                        borderRadius: 999,
                        background:
                          loja.tipo ===
                          'MATRIZ'
                            ? '#fff0e5'
                            : '#f3f4f6',
                        color:
                          loja.tipo ===
                          'MATRIZ'
                            ? '#e86f00'
                            : '#555',
                        marginBottom: 10,
                      }}
                    >
                      {loja.tipo ===
                      'MATRIZ'
                        ? 'Matriz'
                        : 'Filial'}
                    </span>

                    <h3
                      style={{
                        margin:
                          '0 0 6px',
                        fontSize: 22,
                      }}
                    >
                      {loja.nome}
                    </h3>

                    <small
                      style={{
                        color: '#777',
                      }}
                    >
                      Código:{' '}
                      {loja.codigo ||
                        'Não informado'}
                    </small>
                  </div>

                  <div
                    style={{
                      minWidth: 96,
                      textAlign: 'center',
                      background:
                        '#fff7ed',
                      borderRadius: 12,
                      padding:
                        '10px 12px',
                    }}
                  >
                    <strong
                      style={{
                        display: 'block',
                        fontSize: 22,
                      }}
                    >
                      {Number(
                        loja.quantidade_locais ||
                          0
                      )}
                    </strong>

                    <small>
                      local(is)
                    </small>
                  </div>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gap: 7,
                    fontSize: 14,
                  }}
                >
                  {(loja.cidade ||
                    loja.estado) && (
                    <div>
                      <strong>
                        Localização:
                      </strong>{' '}
                      {[
                        loja.cidade,
                        loja.estado,
                      ]
                        .filter(Boolean)
                        .join(' / ')}
                    </div>
                  )}

                  {loja.cnpj && (
                    <div>
                      <strong>
                        CNPJ:
                      </strong>{' '}
                      {loja.cnpj}
                    </div>
                  )}

                  {loja.telefone && (
                    <div>
                      <strong>
                        Telefone:
                      </strong>{' '}
                      {loja.telefone}
                    </div>
                  )}

                  {(loja.endereco ||
                    loja.bairro) && (
                    <div
                      style={{
                        color: '#666',
                      }}
                    >
                      {[
                        loja.endereco,
                        loja.numero,
                        loja.bairro,
                      ]
                        .filter(Boolean)
                        .join(', ')}
                    </div>
                  )}
                </div>

                <div
                  style={{
                    display: 'flex',
                    gap: 8,
                    flexWrap: 'wrap',
                    marginTop: 'auto',
                  }}
                >
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() =>
                      abrirLocais(loja)
                    }
                  >
                    Ver estoques
                  </button>

                  <button
                    type="button"
                    className="editar-button"
                    onClick={() =>
                      editarLoja(loja)
                    }
                  >
                    Editar
                  </button>

                  <button
                    type="button"
                    className="excluir-button"
                    onClick={() =>
                      excluirLoja(loja)
                    }
                  >
                    Desativar
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {lojaSelecionada && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(0,0,0,.38)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
          }}
          onMouseDown={(evento) => {
            if (
              evento.target ===
              evento.currentTarget
            ) {
              setLojaSelecionada(null);
              setLocais([]);
              setMostrarNovoLocal(false);
            }
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 900,
              maxHeight: '90vh',
              overflowY: 'auto',
              background: '#fff',
              borderRadius: 18,
              padding: 24,
              boxShadow:
                '0 24px 70px rgba(0,0,0,.22)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent:
                  'space-between',
                gap: 16,
                alignItems:
                  'flex-start',
                marginBottom: 18,
              }}
            >
              <div>
                <h2
                  style={{
                    margin: '0 0 6px',
                  }}
                >
                  Estoques — {lojaSelecionada.nome}
                </h2>

                <p
                  style={{
                    margin: 0,
                    color: '#737373',
                  }}
                >
                  Locais físicos onde os produtos podem permanecer.
                </p>
              </div>

              <div
                style={{
                  display: 'flex',
                  gap: 8,
                }}
              >
                <button
                  type="button"
                  className="primary-button"
                  onClick={() =>
                    setMostrarNovoLocal(true)
                  }
                >
                  + Novo Local
                </button>

                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    setLojaSelecionada(null);
                    setLocais([]);
                    setMostrarNovoLocal(false);
                  }}
                >
                  Fechar
                </button>
              </div>
            </div>

            {mostrarNovoLocal && (
              <div
                className="novo-local-box"
                style={{
                  marginBottom: 20,
                }}
              >
                <div className="form-grid">
                  <div>
                    <label>
                      Nome do local
                    </label>

                    <input
                      value={nomeLocal}
                      onChange={(e) =>
                        setNomeLocal(
                          e.target.value
                        )
                      }
                      placeholder="Ex.: Câmara Fria"
                    />
                  </div>

                  <div>
                    <label>
                      Tipo
                    </label>

                    <select
                      value={tipoLocal}
                      onChange={(e) =>
                        setTipoLocal(
                          e.target.value
                        )
                      }
                    >
                      <option value="DEPOSITO">
                        Depósito
                      </option>

                      <option value="VENDA">
                        Área de Venda
                      </option>

                      <option value="CAMARA_FRIA">
                        Câmara Fria
                      </option>

                      <option value="FREEZER">
                        Freezer
                      </option>

                      <option value="RESERVA">
                        Reserva
                      </option>

                      <option value="OUTRO">
                        Outro
                      </option>
                    </select>
                  </div>
                </div>

                <div className="unidade-checkbox">
                  <label>
                    <input
                      type="checkbox"
                      checked={permiteVenda}
                      onChange={(e) =>
                        setPermiteVenda(
                          e.target.checked
                        )
                      }
                    />

                    Produtos deste local podem ser vendidos diretamente
                  </label>
                </div>

                <div className="form-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() =>
                      setMostrarNovoLocal(false)
                    }
                  >
                    Cancelar
                  </button>

                  <button
                    type="button"
                    className="primary-button"
                    onClick={criarLocal}
                  >
                    Criar Local
                  </button>
                </div>
              </div>
            )}

            {carregandoLocais ? (
              <div
                style={{
                  padding: 24,
                  textAlign: 'center',
                }}
              >
                Carregando locais...
              </div>
            ) : locais.length === 0 ? (
              <div
                style={{
                  padding: 24,
                  textAlign: 'center',
                  color: '#777',
                  background: '#fafafa',
                  borderRadius: 12,
                }}
              >
                Nenhum local cadastrado.
              </div>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns:
                    'repeat(2, minmax(0, 1fr))',
                  gap: 14,
                }}
              >
                {locais.map((local) => (
                  <div
                    key={local.id}
                    className="local-card"
                    style={{
                      border:
                        '1px solid #ececec',
                      borderRadius: 14,
                      padding: 16,
                      background: '#fff',
                    }}
                  >
                    {localEditandoId === local.id ? (
                      <div style={{ display: 'grid', gap: 12 }}>
                        <div>
                          <label>Nome do local</label>
                          <input
                            value={nomeLocalEdicao}
                            onChange={(e) => setNomeLocalEdicao(e.target.value)}
                            style={{ width: '100%', marginTop: 6 }}
                          />
                        </div>

                        <div>
                          <label>Tipo</label>
                          <select
                            value={tipoLocalEdicao}
                            onChange={(e) => setTipoLocalEdicao(e.target.value)}
                            style={{ width: '100%', marginTop: 6 }}
                          >
                            <option value="DEPOSITO">Depósito</option>
                            <option value="VENDA">Área de Venda</option>
                            <option value="CAMARA_FRIA">Câmara Fria</option>
                            <option value="FREEZER">Freezer</option>
                            <option value="RESERVA">Reserva</option>
                            <option value="OUTRO">Outro</option>
                          </select>
                        </div>

                        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <input
                            type="checkbox"
                            checked={permiteVendaEdicao}
                            onChange={(e) => setPermiteVendaEdicao(e.target.checked)}
                          />
                          Permite venda direta
                        </label>

                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            className="secondary-button"
                            onClick={cancelarEdicaoLocal}
                            disabled={salvandoLocal}
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            className="primary-button"
                            onClick={salvarEdicaoLocal}
                            disabled={salvandoLocal}
                          >
                            {salvandoLocal ? 'Salvando...' : 'Salvar'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <span
                          style={{
                            display: 'block',
                            fontSize: 11,
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            color: '#777',
                            marginBottom: 6,
                          }}
                        >
                          {local.tipo}
                        </span>

                        <strong
                          style={{
                            display: 'block',
                            fontSize: 17,
                            marginBottom: 4,
                          }}
                        >
                          {local.nome}
                        </strong>

                        <small style={{ display: 'block', marginBottom: 12 }}>
                          {local.permite_venda
                            ? 'Permite venda'
                            : 'Reserva / armazenamento'}
                        </small>

                        <div
                          style={{
                            display: 'flex',
                            gap: 8,
                            flexWrap: 'wrap',
                          }}
                        >
                          <button
                            type="button"
                            className="secondary-button"
                            onClick={() => abrirProdutosLocal(local)}
                          >
                            Ver produtos
                          </button>

                          <button
                            type="button"
                            className="editar-button"
                            onClick={() => iniciarEdicaoLocal(local)}
                          >
                            Editar local
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {localProdutos && lojaSelecionada && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10050,
            background: 'rgba(0,0,0,.46)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
          }}
          onMouseDown={(evento) => {
            if (evento.target === evento.currentTarget) {
              setLocalProdutos(null);
              setProdutoCorrigindo(null);
            }
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 1050,
              maxHeight: '90vh',
              overflowY: 'auto',
              background: '#fff',
              borderRadius: 18,
              padding: 24,
              boxShadow: '0 24px 70px rgba(0,0,0,.25)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 16,
                alignItems: 'flex-start',
                marginBottom: 18,
              }}
            >
              <div>
                <h2 style={{ margin: '0 0 6px' }}>
                  Produtos — {localProdutos.nome}
                </h2>
                <p style={{ margin: 0, color: '#737373' }}>
                  {lojaSelecionada.nome} · {produtosLocal.length} produto(s) · Inventário rápido
                </p>
              </div>

              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setLocalProdutos(null);
                  setProdutoCorrigindo(null);
                }}
              >
                Fechar
              </button>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '180px auto minmax(0, 1fr)',
                gap: 10,
                alignItems: 'end',
                padding: 14,
                marginBottom: 16,
                background: '#f8fafc',
                border: '1px solid #e5e7eb',
                borderRadius: 12,
              }}
            >
              <div>
                <label>Executor da contagem</label>
                <input
                  value={codigoExecutor}
                  onChange={(e) => {
                    setCodigoExecutor(e.target.value);
                    setExecutorIdentificado(null);
                  }}
                  placeholder="Ex.: 01"
                  style={{
                    width: '100%',
                    height: 42,
                    marginTop: 6,
                    padding: '0 10px',
                    border: '1px solid #dedede',
                    borderRadius: 8,
                  }}
                />
              </div>

              <button
                type="button"
                className="secondary-button"
                onClick={identificarExecutor}
                disabled={validandoExecutor || !codigoExecutor.trim()}
              >
                {validandoExecutor ? 'Validando...' : 'Identificar'}
              </button>

              <div style={{ minHeight: 42, display: 'flex', alignItems: 'center' }}>
                {executorIdentificado ? (
                  <strong>
                    Executor identificado: {executorIdentificado.nome}
                  </strong>
                ) : (
                  <span style={{ color: '#777' }}>
                    Informe o ID de quem está realizando a contagem.
                  </span>
                )}
              </div>
            </div>

            <input
              type="text"
              value={buscaProdutoLocal}
              onChange={(e) => setBuscaProdutoLocal(e.target.value)}
              placeholder="Pesquisar produto, código interno ou código de barras..."
              style={{
                width: '100%',
                height: 46,
                padding: '0 14px',
                border: '1px solid #dedede',
                borderRadius: 10,
                marginBottom: 18,
              }}
            />

            {produtoCorrigindo && (
              <div
                style={{
                  background: '#fff7ed',
                  border: '1px solid #fed7aa',
                  borderRadius: 14,
                  padding: 18,
                  marginBottom: 18,
                }}
              >
                <h3 style={{ margin: '0 0 6px' }}>
                  Corrigir quantidade — {produtoCorrigindo.produto}
                </h3>
                <p style={{ margin: '0 0 16px', color: '#666' }}>
                  Quantidade atual: <strong>{Number(produtoCorrigindo.quantidade || 0)}</strong>
                </p>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '180px minmax(0, 1fr)',
                    gap: 12,
                  }}
                >
                  <div>
                    <label>Quantidade correta</label>
                    <input
                      type="number"
                      min="0"
                      step="0.001"
                      value={quantidadeCorreta}
                      onChange={(e) => setQuantidadeCorreta(e.target.value)}
                      style={{ width: '100%', marginTop: 6 }}
                    />
                  </div>

                  <div>
                    <label>Justificativa</label>
                    <input
                      value={justificativaCorrecao}
                      onChange={(e) => setJustificativaCorrecao(e.target.value)}
                      placeholder="Ex.: contagem física, perda, divergência..."
                      style={{ width: '100%', marginTop: 6 }}
                    />
                  </div>
                </div>

                <div
                  style={{
                    display: 'flex',
                    gap: 8,
                    justifyContent: 'flex-end',
                    marginTop: 14,
                  }}
                >
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setProdutoCorrigindo(null)}
                    disabled={salvandoCorrecao}
                  >
                    Cancelar
                  </button>

                  <button
                    type="button"
                    className="primary-button"
                    onClick={salvarCorrecaoProduto}
                    disabled={salvandoCorrecao}
                  >
                    {salvandoCorrecao ? 'Salvando...' : 'Salvar correção'}
                  </button>
                </div>
              </div>
            )}

            {carregandoProdutosLocal ? (
              <div style={{ padding: 28, textAlign: 'center' }}>
                Carregando produtos...
              </div>
            ) : produtosLocalFiltrados.length === 0 ? (
              <div
                style={{
                  padding: 28,
                  textAlign: 'center',
                  color: '#777',
                  background: '#fafafa',
                  borderRadius: 12,
                }}
              >
                Nenhum produto encontrado neste local.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table
                  style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                  }}
                >
                  <thead>
                    <tr style={{ textAlign: 'left' }}>
                      <th style={{ padding: 10 }}>Produto</th>
                      <th style={{ padding: 10 }}>Código</th>
                      <th style={{ padding: 10 }}>Código de barras</th>
                      <th style={{ padding: 10 }}>Estoque atual</th>
                      <th style={{ padding: 10 }}>Contagem física</th>
                      <th style={{ padding: 10 }}>Diferença</th>
                      <th style={{ padding: 10 }}>Justificativa</th>
                      <th style={{ padding: 10 }}>Ação</th>
                    </tr>
                  </thead>

                  <tbody>
                    {produtosLocalFiltrados.map((item) => (
                      <tr
                        key={`${item.produto_id}-${item.local_id}`}
                        style={{ borderTop: '1px solid #eee' }}
                      >
                        <td style={{ padding: 10 }}>
                          <strong>{item.produto}</strong>
                        </td>
                        <td style={{ padding: 10 }}>
                          {item.codigo_interno || '-'}
                        </td>
                        <td style={{ padding: 10 }}>
                          {item.codigo_barras || '-'}
                        </td>
                        <td style={{ padding: 10 }}>
                          <strong>{Number(item.quantidade || 0)}</strong>
                        </td>

                        <td style={{ padding: 10, minWidth: 135 }}>
                          <input
                            type="number"
                            min="0"
                            step="0.001"
                            value={valorContagemRapida(item)}
                            onChange={(e) =>
                              setContagensRapidas((anterior) => ({
                                ...anterior,
                                [item.produto_id]: e.target.value,
                              }))
                            }
                            placeholder="Contado"
                            style={{
                              width: 110,
                              height: 38,
                              padding: '0 9px',
                              border: '1px solid #dedede',
                              borderRadius: 8,
                            }}
                          />
                        </td>

                        <td style={{ padding: 10, minWidth: 105 }}>
                          {(() => {
                            const diferenca = diferencaContagemRapida(item);

                            if (diferenca === null) {
                              return <span style={{ color: '#999' }}>—</span>;
                            }

                            if (diferenca === 0) {
                              return (
                                <strong style={{ color: '#16803a' }}>
                                  Sem divergência
                                </strong>
                              );
                            }

                            return (
                              <strong
                                style={{
                                  color: diferenca > 0 ? '#16803a' : '#b42318',
                                  fontSize: 16,
                                }}
                              >
                                {diferenca > 0 ? '+' : ''}
                                {diferenca}
                              </strong>
                            );
                          })()}
                        </td>

                        <td style={{ padding: 10, minWidth: 210 }}>
                          <input
                            value={justificativasRapidas[item.produto_id] || ''}
                            onChange={(e) =>
                              setJustificativasRapidas((anterior) => ({
                                ...anterior,
                                [item.produto_id]: e.target.value,
                              }))
                            }
                            placeholder={
                              diferencaContagemRapida(item) === 0
                                ? 'Sem divergência'
                                : 'Motivo da divergência'
                            }
                            disabled={
                              diferencaContagemRapida(item) === null ||
                              diferencaContagemRapida(item) === 0
                            }
                            style={{
                              width: '100%',
                              minWidth: 190,
                              height: 38,
                              padding: '0 9px',
                              border: '1px solid #dedede',
                              borderRadius: 8,
                            }}
                          />
                        </td>

                        <td style={{ padding: 10, minWidth: 210 }}>
                          <div
                            style={{
                              display: 'flex',
                              gap: 7,
                              flexWrap: 'wrap',
                            }}
                          >
                            <button
                              type="button"
                              className="primary-button"
                              onClick={() => salvarContagemRapida(item)}
                              disabled={
                                salvandoProdutoId === item.produto_id ||
                                valorContagemRapida(item) === ''
                              }
                            >
                              {salvandoProdutoId === item.produto_id
                                ? 'Salvando...'
                                : 'Salvar ajuste'}
                            </button>

                            <button
                              type="button"
                              className="editar-button"
                              onClick={() => iniciarCorrecaoProduto(item)}
                            >
                              Abrir correção
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}