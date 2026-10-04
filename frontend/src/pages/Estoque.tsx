import { useEffect, useMemo, useState } from 'react';

type EstoqueItem = {
  produto_id: number;
  ean: string;
  produto: string;
  marca?: string;
  loja_id: number;
  loja: string;
  local_id: number;
  local: string;
  tipo_local: string;
  quantidade: number;
  custo_medio: number;
};

type Loja = {
  id: number;
  nome: string;
  tipo: string;
};

type Produto = {
  id: number;
  nome: string;
  ean: string;
  marca?: string;
  estoque_minimo?: number;
};

type LocalEstoque = {
  id: number;
  loja_id: number;
  nome: string;
  tipo: string;
  permite_venda: number;
};

type UsuarioLogado = {
  id: number;
  nome: string;
  email: string;
  perfil: string;
};

type ExecutorIdentificado = {
  id: number;
  codigo: string;
  nome: string;
};

type TipoSaidaTela =
  | 'VENDA'
  | 'PERDA'
  | 'AVARIA'
  | 'VENCIMENTO'
  | 'DEVOLUCAO'
  | 'CONSUMO_INTERNO'
  | 'AJUSTE_MANUAL';

type Movimentacao = {
  id: number;
  criado_em: string;
  produto_id: number;
  produto: string;
  ean: string;
  tipo: string;
  quantidade: number;
  custo_unitario: number;
  valor_custo?: number;
  loja_origem_id?: number | null;
  loja_origem?: string | null;
  local_origem_id?: number | null;
  local_origem?: string | null;
  loja_destino_id?: number | null;
  loja_destino?: string | null;
  local_destino_id?: number | null;
  local_destino?: string | null;
  usuario_id?: number | null;
  usuario_nome?: string | null;
  usuario_email?: string | null;
  usuario_perfil?: string | null;
  referencia?: string | null;
  observacao?: string | null;
  justificativa?: string | null;
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

type EstoqueProps = {
  abrirInicial?: 'TRANSFERENCIA' | 'REPOSICAO' | 'NOVA_CONTAGEM';
};

export default function Estoque({
  abrirInicial,
}: EstoqueProps = {}) {
  const usuarioLogado = useMemo<UsuarioLogado | null>(() => {
    try {
      const usuarioSalvo = localStorage.getItem('usuarioLogado');
      return usuarioSalvo ? JSON.parse(usuarioSalvo) : null;
    } catch {
      return null;
    }
  }, []);

  const perfilUsuario = String(
    usuarioLogado?.perfil || ''
  ).toUpperCase();

  const ehCaixa =
    perfilUsuario === 'CAIXA';

  const [estoque, setEstoque] = useState<EstoqueItem[]>([]);
  const [lojas, setLojas] = useState<Loja[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState('');

  const [codigoExecutorEntrada, setCodigoExecutorEntrada] = useState('');
  const [executorEntrada, setExecutorEntrada] =
    useState<ExecutorIdentificado | null>(null);
  const [validandoExecutorEntrada, setValidandoExecutorEntrada] =
    useState(false);

  const [codigoExecutorSaida, setCodigoExecutorSaida] = useState('');
  const [executorSaida, setExecutorSaida] =
    useState<ExecutorIdentificado | null>(null);
  const [validandoExecutorSaida, setValidandoExecutorSaida] =
    useState(false);

  const [codigoExecutorReposicao, setCodigoExecutorReposicao] = useState('');
  const [executorReposicao, setExecutorReposicao] =
    useState<ExecutorIdentificado | null>(null);
  const [validandoExecutorReposicao, setValidandoExecutorReposicao] =
    useState(false);

  const [codigoExecutorTransferencia, setCodigoExecutorTransferencia] = useState('');
  const [executorTransferencia, setExecutorTransferencia] =
    useState<ExecutorIdentificado | null>(null);
  const [validandoExecutorTransferencia, setValidandoExecutorTransferencia] =
    useState(false);

  const [busca, setBusca] = useState('');
  const [lojaFiltro, setLojaFiltro] = useState('');
  const [localFiltro, setLocalFiltro] = useState('');
  const [tipoLocalFiltro, setTipoLocalFiltro] = useState('');
  const [situacaoFiltro, setSituacaoFiltro] = useState('');

  const [mostrarEntrada, setMostrarEntrada] = useState(false);
  const [mostrarSaida, setMostrarSaida] = useState(false);
  const [mostrarReposicao, setMostrarReposicao] = useState(false);
  const [mostrarTransferencia, setMostrarTransferencia] = useState(false);
  const [mostrarNovaContagem, setMostrarNovaContagem] = useState(false);
  const [mostrarHistorico, setMostrarHistorico] = useState(false);

  const [produtoId, setProdutoId] = useState('');
  const [lojaId, setLojaId] = useState('');
  const [localId, setLocalId] = useState('');
  const [locais, setLocais] = useState<LocalEstoque[]>([]);
  const [quantidade, setQuantidade] = useState('');
  const [custoUnitario, setCustoUnitario] = useState('');
  const [observacao, setObservacao] = useState('');

  const [produtoSaidaId, setProdutoSaidaId] = useState('');
  const [lojaSaidaId, setLojaSaidaId] = useState('');
  const [localSaidaId, setLocalSaidaId] = useState('');
  const [locaisSaida, setLocaisSaida] = useState<LocalEstoque[]>([]);
  const [tipoSaida, setTipoSaida] = useState<TipoSaidaTela>('PERDA');
  const [quantidadeSaida, setQuantidadeSaida] = useState('');
  const [observacaoSaida, setObservacaoSaida] = useState('');
  const [justificativaSaida, setJustificativaSaida] = useState('');

  const [produtoReposicaoId, setProdutoReposicaoId] = useState('');
  const [lojaReposicaoId, setLojaReposicaoId] = useState('');
  const [locaisReposicao, setLocaisReposicao] = useState<LocalEstoque[]>([]);
  const [localOrigemId, setLocalOrigemId] = useState('');
  const [localDestinoId, setLocalDestinoId] = useState('');
  const [quantidadeReposicao, setQuantidadeReposicao] = useState('');
  const [observacaoReposicao, setObservacaoReposicao] = useState('');

  const [produtoTransferenciaId, setProdutoTransferenciaId] = useState('');
  const [lojaOrigemTransferenciaId, setLojaOrigemTransferenciaId] = useState('');
  const [localOrigemTransferenciaId, setLocalOrigemTransferenciaId] = useState('');
  const [locaisOrigemTransferencia, setLocaisOrigemTransferencia] = useState<LocalEstoque[]>([]);
  const [lojaDestinoTransferenciaId, setLojaDestinoTransferenciaId] = useState('');
  const [localDestinoTransferenciaId, setLocalDestinoTransferenciaId] = useState('');
  const [locaisDestinoTransferencia, setLocaisDestinoTransferencia] = useState<LocalEstoque[]>([]);
  const [quantidadeTransferencia, setQuantidadeTransferencia] = useState('');
  const [observacaoTransferencia, setObservacaoTransferencia] = useState('');

  const [produtoContagemId, setProdutoContagemId] = useState('');
  const [lojaContagemId, setLojaContagemId] = useState('');
  const [localContagemId, setLocalContagemId] = useState('');
  const [locaisContagem, setLocaisContagem] = useState<LocalEstoque[]>([]);
  const [quantidadeContada, setQuantidadeContada] = useState('');
  const [observacaoContagem, setObservacaoContagem] = useState('');
  const [justificativaContagem, setJustificativaContagem] = useState('');

  const [codigoExecutorContagem, setCodigoExecutorContagem] = useState('');
  const [executorContagem, setExecutorContagem] =
    useState<ExecutorIdentificado | null>(null);
  const [validandoExecutorContagem, setValidandoExecutorContagem] =
    useState(false);

  const [movimentacoes, setMovimentacoes] = useState<Movimentacao[]>([]);
  const [carregandoHistorico, setCarregandoHistorico] = useState(false);
  const [buscaHistorico, setBuscaHistorico] = useState('');
  const [tipoHistorico, setTipoHistorico] = useState('');
  const [usuarioHistorico, setUsuarioHistorico] = useState('');

  useEffect(() => {
    carregarLojas();
    carregarProdutos();
    carregarEstoque();
  }, []);

  async function carregarLojas() {
    try {
      const response = await fetchAutenticado(`${API}/lojas`);
      const data = await response.json();
      if (data.sucesso) setLojas(data.lojas || []);
    } catch (error) {
      console.error('Erro ao carregar unidades:', error);
    }
  }

  async function carregarProdutos() {
    if (ehCaixa) return;

    try {
      const response = await fetchAutenticado(`${API}/produtos`);
      const data = await response.json();
      if (data.sucesso) setProdutos(data.produtos || []);
    } catch (error) {
      console.error('Erro ao carregar produtos:', error);
    }
  }

  async function carregarEstoque() {
    setCarregando(true);
    try {
      const response = await fetchAutenticado(`${API}/estoque`);
      const data = await response.json();

      if (data.sucesso) {
        const estoqueCarregado: EstoqueItem[] =
          data.estoque || [];

        setEstoque(estoqueCarregado);

        if (ehCaixa) {
          const mapaProdutos =
            new Map<number, Produto>();

          estoqueCarregado.forEach((item) => {
            if (!mapaProdutos.has(item.produto_id)) {
              mapaProdutos.set(item.produto_id, {
                id: item.produto_id,
                nome: item.produto,
                ean: item.ean,
                marca: item.marca,
                estoque_minimo: 0,
              });
            }
          });

          setProdutos(
            Array.from(mapaProdutos.values())
          );
        }
      }
    } catch (error) {
      console.error('Erro ao carregar estoque:', error);
    } finally {
      setCarregando(false);
    }
  }

  async function carregarHistorico() {
    setCarregandoHistorico(true);
    try {
      const response = await fetchAutenticado(`${API}/estoque/movimentacoes?limite=500`);
      const data = await response.json();
      if (data.sucesso) setMovimentacoes(data.movimentacoes || []);
      else setMensagem(data.erro || 'Não foi possível carregar o histórico.');
    } catch (error) {
      console.error('Erro ao carregar histórico:', error);
      setMensagem('Não foi possível carregar o histórico.');
    } finally {
      setCarregandoHistorico(false);
    }
  }

  async function buscarLocais(idLoja: string): Promise<LocalEstoque[]> {
    if (!idLoja) return [];
    try {
      const response = await fetchAutenticado(`${API}/lojas/${idLoja}/locais`);
      const data = await response.json();
      return data.sucesso ? data.locais || [] : [];
    } catch (error) {
      console.error('Erro ao carregar locais:', error);
      return [];
    }
  }

  function fecharFormularios() {
    setMostrarEntrada(false);
    setMostrarSaida(false);
    setMostrarReposicao(false);
    setMostrarTransferencia(false);
    setMostrarNovaContagem(false);
    setMensagem('');
  }

  function fecharTudo() {
    fecharFormularios();
    setMostrarHistorico(false);
  }

  async function carregarLocaisEntrada(idLoja: string) {
    setLocalId('');
    setLocais(await buscarLocais(idLoja));
  }

  function abrirEntrada() {
    fecharTudo();
    setProdutoId('');
    setLojaId('');
    setLocalId('');
    setLocais([]);
    setQuantidade('');
    setCustoUnitario('');
    setObservacao('');
    setCodigoExecutorEntrada('');
    setExecutorEntrada(null);
    setMostrarEntrada(true);
  }

  async function identificarExecutorEntrada() {
    const codigo = codigoExecutorEntrada.trim();

    if (!codigo) {
      setExecutorEntrada(null);
      setMensagem('Informe o ID do executor.');
      return null;
    }

    setValidandoExecutorEntrada(true);
    setMensagem('');

    try {
      const response = await fetchAutenticado(
        `${API}/executores/codigo/${encodeURIComponent(codigo)}`
      );

      const data = await response.json();

      if (!response.ok || !data.sucesso) {
        setExecutorEntrada(null);
        setMensagem(
          data.erro || 'Não foi possível identificar o executor.'
        );
        return null;
      }

      const executor = data.executor as ExecutorIdentificado;
      setExecutorEntrada(executor);
      return executor;
    } catch (error) {
      console.error(error);
      setExecutorEntrada(null);
      setMensagem('Erro ao identificar executor.');
      return null;
    } finally {
      setValidandoExecutorEntrada(false);
    }
  }

  async function registrarEntrada() {
    setMensagem('');
    if (!produtoId) return setMensagem('Selecione o produto.');
    if (!lojaId) return setMensagem('Selecione a unidade.');
    if (!localId) return setMensagem('Selecione o local.');

    const qtd = Number(String(quantidade).replace(',', '.'));
    const custo = Number(String(custoUnitario).replace(',', '.'));

    if (!qtd || qtd <= 0) return setMensagem('Informe uma quantidade válida.');
    if (Number.isNaN(custo) || custo < 0) return setMensagem('Informe um custo válido.');

    const executor =
      executorEntrada || (await identificarExecutorEntrada());

    if (!executor) return;

    setSalvando(true);
    try {
      const response = await fetchAutenticado(`${API}/estoque/entrada`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          produtoId: Number(produtoId),
          lojaId: Number(lojaId),
          localId: Number(localId),
          quantidade: qtd,
          custoUnitario: custo || 0,
          tipo: 'ENTRADA_MANUAL',
          observacao: observacao || 'Entrada manual de estoque',
          codigoExecutor: executor.codigo,
          usuarioId: usuarioLogado?.id,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.sucesso) return setMensagem(data.erro || 'Erro ao registrar entrada.');

      setMensagem('Entrada registrada com sucesso!');
      await carregarEstoque();
      setTimeout(fecharFormularios, 800);
    } catch (error) {
      console.error(error);
      setMensagem('Não foi possível registrar a entrada.');
    } finally {
      setSalvando(false);
    }
  }

  async function carregarLocaisSaida(idLoja: string) {
    setLocalSaidaId('');
    const resultado = await buscarLocais(idLoja);
    setLocaisSaida(resultado);
    const venda = resultado.find(
      (local) => String(local.tipo).toUpperCase() === 'VENDA' || Number(local.permite_venda) === 1
    );
    if (venda) setLocalSaidaId(String(venda.id));
  }

  function abrirSaida() {
    fecharTudo();
    setProdutoSaidaId('');
    setLojaSaidaId('');
    setLocalSaidaId('');
    setLocaisSaida([]);
    setTipoSaida('PERDA');
    setQuantidadeSaida('');
    setObservacaoSaida('');
    setJustificativaSaida('');
    setCodigoExecutorSaida('');
    setExecutorSaida(null);
    setMostrarSaida(true);
  }

  async function identificarExecutorSaida() {
    const codigo = codigoExecutorSaida.trim();

    if (!codigo) {
      setExecutorSaida(null);
      setMensagem('Informe o ID do executor.');
      return null;
    }

    setValidandoExecutorSaida(true);
    setMensagem('');

    try {
      const response = await fetchAutenticado(
        `${API}/executores/codigo/${encodeURIComponent(codigo)}`
      );

      const data = await response.json();

      if (!response.ok || !data.sucesso) {
        setExecutorSaida(null);
        setMensagem(
          data.erro || 'Não foi possível identificar o executor.'
        );
        return null;
      }

      const executor = data.executor as ExecutorIdentificado;
      setExecutorSaida(executor);
      return executor;
    } catch (error) {
      console.error(error);
      setExecutorSaida(null);
      setMensagem('Erro ao identificar executor.');
      return null;
    } finally {
      setValidandoExecutorSaida(false);
    }
  }

  const saldoSaida = useMemo(() => {
    if (!produtoSaidaId || !lojaSaidaId || !localSaidaId) return null;
    return (
      estoque.find(
        (item) =>
          item.produto_id === Number(produtoSaidaId) &&
          item.loja_id === Number(lojaSaidaId) &&
          item.local_id === Number(localSaidaId)
      ) || null
    );
  }, [estoque, produtoSaidaId, lojaSaidaId, localSaidaId]);

  function converterTipoSaida(
    tipo: TipoSaidaTela
  ): 'SAIDA_MANUAL' | 'VENDA' | 'PERDA' | 'AVARIA' | 'VENCIMENTO' | 'DEVOLUCAO' {
    if (tipo === 'CONSUMO_INTERNO' || tipo === 'AJUSTE_MANUAL') return 'SAIDA_MANUAL';
    return tipo;
  }

  async function registrarSaida() {
    setMensagem('');
    if (!produtoSaidaId || !lojaSaidaId || !localSaidaId) {
      return setMensagem('Preencha produto, unidade e local.');
    }

    const qtd = Number(String(quantidadeSaida).replace(',', '.'));
    if (!qtd || qtd <= 0) return setMensagem('Informe uma quantidade válida.');

    if (!saldoSaida || Number(saldoSaida.quantidade) < qtd) {
      return setMensagem(`Saldo insuficiente. Disponível: ${saldoSaida ? saldoSaida.quantidade : 0}.`);
    }

    if (
      ['PERDA', 'AVARIA', 'VENCIMENTO', 'AJUSTE_MANUAL'].includes(tipoSaida) &&
      !justificativaSaida.trim()
    ) {
      return setMensagem('Informe a justificativa da saída.');
    }

    const executor =
      executorSaida || (await identificarExecutorSaida());

    if (!executor) return;

    setSalvando(true);
    try {
      const response = await fetchAutenticado(`${API}/estoque/saida`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          produtoId: Number(produtoSaidaId),
          lojaId: Number(lojaSaidaId),
          localId: Number(localSaidaId),
          quantidade: qtd,
          tipo: converterTipoSaida(tipoSaida),
          referencia: tipoSaida,
          observacao: observacaoSaida,
          justificativa: justificativaSaida || null,
          codigoExecutor: executor.codigo,
          usuarioId: usuarioLogado?.id,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.sucesso) return setMensagem(data.erro || 'Erro ao registrar saída.');

      setMensagem('Saída registrada com sucesso!');
      await carregarEstoque();
      setTimeout(fecharFormularios, 800);
    } catch (error) {
      console.error(error);
      setMensagem('Não foi possível registrar a saída.');
    } finally {
      setSalvando(false);
    }
  }

  async function carregarLocaisReposicao(idLoja: string) {
    setLocalOrigemId('');
    setLocalDestinoId('');
    const resultado = await buscarLocais(idLoja);
    setLocaisReposicao(resultado);

    const deposito = resultado.find((local) => String(local.tipo).toUpperCase() === 'DEPOSITO');
    const venda = resultado.find(
      (local) => String(local.tipo).toUpperCase() === 'VENDA' || Number(local.permite_venda) === 1
    );

    if (deposito) setLocalOrigemId(String(deposito.id));
    if (venda) setLocalDestinoId(String(venda.id));
  }

  function abrirReposicao() {
    fecharTudo();
    setProdutoReposicaoId('');
    setLojaReposicaoId('');
    setLocalOrigemId('');
    setLocalDestinoId('');
    setLocaisReposicao([]);
    setQuantidadeReposicao('');
    setObservacaoReposicao('');
    setCodigoExecutorReposicao('');
    setExecutorReposicao(null);
    setMostrarReposicao(true);
  }

  async function identificarExecutorReposicao() {
    const codigo = codigoExecutorReposicao.trim();

    if (!codigo) {
      setExecutorReposicao(null);
      setMensagem('Informe o ID do executor.');
      return null;
    }

    setValidandoExecutorReposicao(true);
    setMensagem('');

    try {
      const response = await fetchAutenticado(
        `${API}/executores/codigo/${encodeURIComponent(codigo)}`
      );
      const data = await response.json();

      if (!response.ok || !data.sucesso) {
        setExecutorReposicao(null);
        setMensagem(data.erro || 'Não foi possível identificar o executor.');
        return null;
      }

      const executor = data.executor as ExecutorIdentificado;
      setExecutorReposicao(executor);
      return executor;
    } catch (error) {
      console.error(error);
      setExecutorReposicao(null);
      setMensagem('Erro ao identificar executor.');
      return null;
    } finally {
      setValidandoExecutorReposicao(false);
    }
  }

  const saldoOrigemReposicao = useMemo(() => {
    if (!produtoReposicaoId || !lojaReposicaoId || !localOrigemId) return null;
    return (
      estoque.find(
        (item) =>
          item.produto_id === Number(produtoReposicaoId) &&
          item.loja_id === Number(lojaReposicaoId) &&
          item.local_id === Number(localOrigemId)
      ) || null
    );
  }, [estoque, produtoReposicaoId, lojaReposicaoId, localOrigemId]);

  async function registrarReposicao() {
    setMensagem('');
    if (!produtoReposicaoId || !lojaReposicaoId || !localOrigemId || !localDestinoId) {
      return setMensagem('Preencha produto, unidade, origem e destino.');
    }
    if (localOrigemId === localDestinoId) return setMensagem('Origem e destino precisam ser diferentes.');

    const qtd = Number(String(quantidadeReposicao).replace(',', '.'));
    if (!qtd || qtd <= 0) return setMensagem('Informe uma quantidade válida.');

    if (!saldoOrigemReposicao || Number(saldoOrigemReposicao.quantidade) < qtd) {
      return setMensagem(
        `Saldo insuficiente. Disponível: ${saldoOrigemReposicao ? saldoOrigemReposicao.quantidade : 0}.`
      );
    }

    const executor =
      executorReposicao || (await identificarExecutorReposicao());

    if (!executor) return;

    setSalvando(true);
    try {
      const response = await fetchAutenticado(`${API}/estoque/transferir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          produtoId: Number(produtoReposicaoId),
          lojaOrigemId: Number(lojaReposicaoId),
          localOrigemId: Number(localOrigemId),
          lojaDestinoId: Number(lojaReposicaoId),
          localDestinoId: Number(localDestinoId),
          quantidade: qtd,
          tipo: 'REPOSICAO',
          referencia: 'Reposição interna',
          observacao: observacaoReposicao || 'Reposição interna de estoque',
          codigoExecutor: executor.codigo,
          usuarioId: usuarioLogado?.id,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.sucesso) return setMensagem(data.erro || 'Erro ao registrar reposição.');

      setMensagem('Reposição registrada com sucesso!');
      await carregarEstoque();
      setTimeout(fecharFormularios, 800);
    } catch (error) {
      console.error(error);
      setMensagem('Não foi possível registrar a reposição.');
    } finally {
      setSalvando(false);
    }
  }

  async function carregarLocaisOrigemTransferencia(idLoja: string) {
    setLocalOrigemTransferenciaId('');
    const resultado = await buscarLocais(idLoja);
    setLocaisOrigemTransferencia(resultado);
    const deposito = resultado.find((local) => String(local.tipo).toUpperCase() === 'DEPOSITO');
    if (deposito) setLocalOrigemTransferenciaId(String(deposito.id));
  }

  async function carregarLocaisDestinoTransferencia(idLoja: string) {
    setLocalDestinoTransferenciaId('');
    const resultado = await buscarLocais(idLoja);
    setLocaisDestinoTransferencia(resultado);
    const venda = resultado.find(
      (local) => String(local.tipo).toUpperCase() === 'VENDA' || Number(local.permite_venda) === 1
    );
    if (venda) setLocalDestinoTransferenciaId(String(venda.id));
  }

  function abrirTransferencia() {
    fecharTudo();
    setProdutoTransferenciaId('');
    setLojaOrigemTransferenciaId('');
    setLocalOrigemTransferenciaId('');
    setLocaisOrigemTransferencia([]);
    setLojaDestinoTransferenciaId('');
    setLocalDestinoTransferenciaId('');
    setLocaisDestinoTransferencia([]);
    setQuantidadeTransferencia('');
    setObservacaoTransferencia('');
    setCodigoExecutorTransferencia('');
    setExecutorTransferencia(null);
    setMostrarTransferencia(true);
  }

  async function identificarExecutorTransferencia() {
    const codigo = codigoExecutorTransferencia.trim();

    if (!codigo) {
      setExecutorTransferencia(null);
      setMensagem('Informe o ID do executor.');
      return null;
    }

    setValidandoExecutorTransferencia(true);
    setMensagem('');

    try {
      const response = await fetchAutenticado(
        `${API}/executores/codigo/${encodeURIComponent(codigo)}`
      );
      const data = await response.json();

      if (!response.ok || !data.sucesso) {
        setExecutorTransferencia(null);
        setMensagem(data.erro || 'Não foi possível identificar o executor.');
        return null;
      }

      const executor = data.executor as ExecutorIdentificado;
      setExecutorTransferencia(executor);
      return executor;
    } catch (error) {
      console.error(error);
      setExecutorTransferencia(null);
      setMensagem('Erro ao identificar executor.');
      return null;
    } finally {
      setValidandoExecutorTransferencia(false);
    }
  }

  const saldoOrigemTransferencia = useMemo(() => {
    if (!produtoTransferenciaId || !lojaOrigemTransferenciaId || !localOrigemTransferenciaId) return null;
    return (
      estoque.find(
        (item) =>
          item.produto_id === Number(produtoTransferenciaId) &&
          item.loja_id === Number(lojaOrigemTransferenciaId) &&
          item.local_id === Number(localOrigemTransferenciaId)
      ) || null
    );
  }, [estoque, produtoTransferenciaId, lojaOrigemTransferenciaId, localOrigemTransferenciaId]);

  async function registrarTransferencia() {
    setMensagem('');
    if (!produtoTransferenciaId) return setMensagem('Selecione o produto.');
    if (!lojaOrigemTransferenciaId || !localOrigemTransferenciaId) {
      return setMensagem('Selecione a unidade e o local de origem.');
    }
    if (!lojaDestinoTransferenciaId || !localDestinoTransferenciaId) {
      return setMensagem('Selecione a unidade e o local de destino.');
    }
    if (lojaOrigemTransferenciaId === lojaDestinoTransferenciaId) {
      return setMensagem('Para movimentação dentro da mesma unidade use Reposição.');
    }

    const qtd = Number(String(quantidadeTransferencia).replace(',', '.'));
    if (!qtd || qtd <= 0) return setMensagem('Informe uma quantidade válida.');

    if (!saldoOrigemTransferencia || Number(saldoOrigemTransferencia.quantidade) < qtd) {
      return setMensagem(
        `Saldo insuficiente na origem. Disponível: ${
          saldoOrigemTransferencia ? saldoOrigemTransferencia.quantidade : 0
        }.`
      );
    }

    const executor =
      executorTransferencia || (await identificarExecutorTransferencia());

    if (!executor) return;

    setSalvando(true);
    try {
      const response = await fetchAutenticado(`${API}/estoque/transferir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          produtoId: Number(produtoTransferenciaId),
          lojaOrigemId: Number(lojaOrigemTransferenciaId),
          localOrigemId: Number(localOrigemTransferenciaId),
          lojaDestinoId: Number(lojaDestinoTransferenciaId),
          localDestinoId: Number(localDestinoTransferenciaId),
          quantidade: qtd,
          tipo: 'TRANSFERENCIA',
          referencia: 'Transferência entre unidades',
          observacao: observacaoTransferencia || 'Transferência entre unidades',
          codigoExecutor: executor.codigo,
          usuarioId: usuarioLogado?.id,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.sucesso) return setMensagem(data.erro || 'Erro ao registrar transferência.');

      setMensagem('Transferência registrada com sucesso!');
      await carregarEstoque();
      setTimeout(fecharFormularios, 800);
    } catch (error) {
      console.error(error);
      setMensagem('Não foi possível registrar a transferência.');
    } finally {
      setSalvando(false);
    }
  }

  async function carregarLocaisContagem(idLoja: string) {
    setLocalContagemId('');
    setLocaisContagem(await buscarLocais(idLoja));
  }

  function abrirNovaContagem() {
    fecharTudo();
    setProdutoContagemId('');
    setLojaContagemId('');
    setLocalContagemId('');
    setLocaisContagem([]);
    setQuantidadeContada('');
    setObservacaoContagem('');
    setJustificativaContagem('');
    setCodigoExecutorContagem('');
    setExecutorContagem(null);
    setMostrarNovaContagem(true);
  }

  async function abrirCorrecaoQuantidade(item: EstoqueItem) {
    fecharTudo();

    setProdutoContagemId(String(item.produto_id));
    setLojaContagemId(String(item.loja_id));
    setLocaisContagem(await buscarLocais(String(item.loja_id)));
    setLocalContagemId(String(item.local_id));

    // Mostra o saldo atual para facilitar a conferência.
    // O usuário altera este valor para a quantidade física correta.
    setQuantidadeContada(String(item.quantidade ?? 0));
    setObservacaoContagem('Correção de quantidade pelo estoque da unidade');
    setJustificativaContagem('');
    setCodigoExecutorContagem('');
    setExecutorContagem(null);
    setMostrarNovaContagem(true);

    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  }

  async function identificarExecutorContagem() {
    const codigo = codigoExecutorContagem.trim();

    if (!codigo) {
      setExecutorContagem(null);
      setMensagem('Informe o ID do executor.');
      return null;
    }

    setValidandoExecutorContagem(true);
    setMensagem('');

    try {
      const response = await fetchAutenticado(
        `${API}/executores/codigo/${encodeURIComponent(codigo)}`
      );

      const data = await response.json();

      if (!response.ok || !data.sucesso) {
        setExecutorContagem(null);
        setMensagem(
          data.erro || 'Não foi possível identificar o executor.'
        );
        return null;
      }

      const executor = data.executor as ExecutorIdentificado;
      setExecutorContagem(executor);
      return executor;
    } catch (error) {
      console.error(error);
      setExecutorContagem(null);
      setMensagem('Erro ao identificar executor.');
      return null;
    } finally {
      setValidandoExecutorContagem(false);
    }
  }

  const saldoAtualContagem = useMemo(() => {
    if (!produtoContagemId || !lojaContagemId || !localContagemId) return null;
    return (
      estoque.find(
        (item) =>
          item.produto_id === Number(produtoContagemId) &&
          item.loja_id === Number(lojaContagemId) &&
          item.local_id === Number(localContagemId)
      ) || null
    );
  }, [estoque, produtoContagemId, lojaContagemId, localContagemId]);

  async function registrarNovaContagem() {
    setMensagem('');
    if (!produtoContagemId) return setMensagem('Selecione o produto.');
    if (!lojaContagemId) return setMensagem('Selecione a unidade.');
    if (!localContagemId) return setMensagem('Selecione o local.');

    const qtd = Number(String(quantidadeContada).replace(',', '.'));
    if (Number.isNaN(qtd) || qtd < 0) return setMensagem('Informe uma quantidade válida.');

    const quantidadeSistema = Number(saldoAtualContagem?.quantidade || 0);
    const diferenca = qtd - quantidadeSistema;

    if (diferenca !== 0 && !justificativaContagem.trim()) {
      return setMensagem('Existe divergência. Informe uma justificativa.');
    }

    const executor =
      executorContagem || (await identificarExecutorContagem());

    if (!executor) return;

    setSalvando(true);
    try {
      const response = await fetchAutenticado(`${API}/estoque/nova-contagem`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          produtoId: Number(produtoContagemId),
          lojaId: Number(lojaContagemId),
          localId: Number(localContagemId),
          quantidadeContada: qtd,
          observacao: observacaoContagem || 'Nova contagem física',
          justificativa: justificativaContagem || null,
          codigoExecutor: executor.codigo,
          usuarioId: usuarioLogado?.id,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.sucesso) return setMensagem(data.erro || 'Erro ao registrar contagem.');

      setMensagem('Contagem registrada com sucesso!');
      await carregarEstoque();
      setTimeout(fecharFormularios, 900);
    } catch (error) {
      console.error(error);
      setMensagem('Não foi possível registrar a contagem.');
    } finally {
      setSalvando(false);
    }
  }

  async function abrirHistorico() {
    fecharFormularios();
    setBuscaHistorico('');
    setTipoHistorico('');
    setUsuarioHistorico('');
    setMensagem('');
    setMostrarHistorico(true);
    await carregarHistorico();
  }

  function formatarTipo(tipo: string) {
    const tipos: Record<string, string> = {
      ENTRADA_NF: 'Entrada por NF-e',
      ENTRADA_MANUAL: 'Entrada manual',
      SAIDA_MANUAL: 'Saída manual',
      VENDA: 'Venda',
      REPOSICAO: 'Reposição',
      TRANSFERENCIA: 'Transferência',
      DEVOLUCAO: 'Devolução',
      PERDA: 'Perda',
      AVARIA: 'Avaria',
      VENCIMENTO: 'Vencimento',
      INVENTARIO: 'Inventário',
      AJUSTE: 'Ajuste',
      NOVA_CONTAGEM: 'Nova contagem',
    };
    return tipos[tipo] || tipo;
  }

  function formatarDataHora(valor?: string | null) {
    if (!valor) return '-';
    try {
      let texto = valor.trim();
      if (texto.includes(' ') && !texto.includes('T')) texto = texto.replace(' ', 'T');
      if (!texto.endsWith('Z') && !texto.match(/[+-]\d{2}:\d{2}$/)) texto += 'Z';

      const data = new Date(texto);
      if (Number.isNaN(data.getTime())) return valor;

      return data.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return valor;
    }
  }

  function formatarDinheiro(valor?: number | null) {
    return Number(valor || 0).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });
  }

  function descricaoOrigem(movimentacao: Movimentacao) {
    if (!movimentacao.loja_origem && !movimentacao.local_origem) return '-';
    return `${movimentacao.loja_origem || ''}${
      movimentacao.local_origem ? ` / ${movimentacao.local_origem}` : ''
    }`;
  }

  function descricaoDestino(movimentacao: Movimentacao) {
    if (!movimentacao.loja_destino && !movimentacao.local_destino) return '-';
    return `${movimentacao.loja_destino || ''}${
      movimentacao.local_destino ? ` / ${movimentacao.local_destino}` : ''
    }`;
  }

  function obterEstoqueMinimo(produtoId: number) {
    const produto = produtos.find((item) => item.id === produtoId);
    return Number(produto?.estoque_minimo || 0);
  }

  function obterSituacao(item: EstoqueItem) {
    const quantidadeAtual = Number(item.quantidade || 0);
    const minimo = obterEstoqueMinimo(item.produto_id);

    if (quantidadeAtual <= 0) return 'ZERADO';
    if (minimo > 0 && quantidadeAtual <= minimo) return 'BAIXO';
    return 'NORMAL';
  }

  const locaisDisponiveisFiltro = useMemo(() => {
    const mapa = new Map<number, { id: number; nome: string; loja: string }>();

    estoque.forEach((item) => {
      if (lojaFiltro && item.loja_id !== Number(lojaFiltro)) return;
      mapa.set(item.local_id, { id: item.local_id, nome: item.local, loja: item.loja });
    });

    return Array.from(mapa.values()).sort((a, b) =>
      `${a.loja} ${a.nome}`.localeCompare(`${b.loja} ${b.nome}`, 'pt-BR')
    );
  }, [estoque, lojaFiltro]);

  const estoqueFiltrado = useMemo(() => {
    const termo = busca.toLowerCase().trim();

    return estoque.filter((item) => {
      const atendeBusca =
        !termo ||
        item.produto?.toLowerCase().includes(termo) ||
        item.ean?.includes(termo) ||
        item.marca?.toLowerCase().includes(termo) ||
        item.loja?.toLowerCase().includes(termo) ||
        item.local?.toLowerCase().includes(termo);

      const atendeLoja = !lojaFiltro || item.loja_id === Number(lojaFiltro);
      const atendeLocal = !localFiltro || item.local_id === Number(localFiltro);
      const atendeTipo =
        !tipoLocalFiltro || String(item.tipo_local).toUpperCase() === tipoLocalFiltro;

      const situacao = obterSituacao(item);
      const atendeSituacao = !situacaoFiltro || situacao === situacaoFiltro;

      return atendeBusca && atendeLoja && atendeLocal && atendeTipo && atendeSituacao;
    });
  }, [estoque, produtos, busca, lojaFiltro, localFiltro, tipoLocalFiltro, situacaoFiltro]);

  const indicadores = useMemo(() => {
    const quantidadeTotal = estoqueFiltrado.reduce(
      (total, item) => total + Number(item.quantidade || 0),
      0
    );

    const valorEstoque = estoqueFiltrado.reduce(
      (total, item) =>
        total + Number(item.quantidade || 0) * Number(item.custo_medio || 0),
      0
    );

    const baixos = estoqueFiltrado.filter((item) => obterSituacao(item) === 'BAIXO').length;
    const zerados = estoqueFiltrado.filter((item) => obterSituacao(item) === 'ZERADO').length;
    const locaisComSaldo = new Set(
      estoqueFiltrado
        .filter((item) => Number(item.quantidade || 0) > 0)
        .map((item) => item.local_id)
    ).size;

    return { quantidadeTotal, valorEstoque, baixos, zerados, locaisComSaldo };
  }, [estoqueFiltrado, produtos]);

  const usuariosHistorico = useMemo(() => {
    const nomes = movimentacoes.map(
      (movimentacao) => movimentacao.usuario_nome || 'Não identificado'
    );
    return Array.from(new Set(nomes)).sort();
  }, [movimentacoes]);

  const tiposHistorico = useMemo(
    () => Array.from(new Set(movimentacoes.map((movimentacao) => movimentacao.tipo))).sort(),
    [movimentacoes]
  );

  const movimentacoesFiltradas = useMemo(() => {
    const termo = buscaHistorico.toLowerCase().trim();

    return movimentacoes.filter((movimentacao) => {
      const usuario = movimentacao.usuario_nome || 'Não identificado';

      const textoGeral = [
        movimentacao.produto,
        movimentacao.ean,
        movimentacao.tipo,
        formatarTipo(movimentacao.tipo),
        movimentacao.loja_origem,
        movimentacao.local_origem,
        movimentacao.loja_destino,
        movimentacao.local_destino,
        usuario,
        movimentacao.referencia,
        movimentacao.observacao,
        movimentacao.justificativa,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      const atendeBusca = !termo || textoGeral.includes(termo);
      const atendeTipo = !tipoHistorico || movimentacao.tipo === tipoHistorico;
      const atendeUsuario = !usuarioHistorico || usuario === usuarioHistorico;

      return atendeBusca && atendeTipo && atendeUsuario;
    });
  }, [movimentacoes, buscaHistorico, tipoHistorico, usuarioHistorico]);

  function limparFiltrosEstoque() {
    setBusca('');
    setLojaFiltro('');
    setLocalFiltro('');
    setTipoLocalFiltro('');
    setSituacaoFiltro('');
  }

  useEffect(() => {
    if (abrirInicial === 'TRANSFERENCIA') {
      abrirTransferencia();
      return;
    }

    if (abrirInicial === 'REPOSICAO') {
      abrirReposicao();
      return;
    }

    if (abrirInicial === 'NOVA_CONTAGEM') {
      abrirNovaContagem();
    }
  }, [abrirInicial]);

  return (
    <div className="estoque-page">
      <div className="page-header">
        <div>
          <h1>Estoque</h1>
          <p>Controle por unidade, depósito e área de venda.</p>

          {usuarioLogado && (
            <div className="usuario-logado-info">
              Usuário: <strong>{usuarioLogado.nome}</strong>
            </div>
          )}
        </div>

        <div className="estoque-acoes-topo">
          <button type="button" className="secondary-button" onClick={abrirNovaContagem}>
            Nova Contagem
          </button>

          {!ehCaixa && (
            <button type="button" className="primary-button" onClick={abrirEntrada}>
              + Entrada
            </button>
          )}

          {!ehCaixa && (
            <button type="button" className="secondary-button" onClick={abrirSaida}>
              Saída
            </button>
          )}

          <button type="button" className="secondary-button" onClick={abrirReposicao}>
            Reposição
          </button>

          <button type="button" className="secondary-button" onClick={abrirTransferencia}>
            Transferência
          </button>

          {!ehCaixa && (
            <button type="button" className="secondary-button historico-button" onClick={abrirHistorico}>
              Histórico
            </button>
          )}
        </div>
      </div>

      {mensagem && <div className="produto-mensagem-geral">{mensagem}</div>}

      {!ehCaixa && mostrarEntrada && (
        <div className="estoque-form-box">
          <div className="produto-form-header">
            <h2>Nova Entrada</h2>
            <p>Registre uma entrada de mercadoria.</p>
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
              <label>Executor da entrada</label>
              <input
                value={codigoExecutorEntrada}
                onChange={(e) => {
                  setCodigoExecutorEntrada(e.target.value);
                  setExecutorEntrada(null);
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
              onClick={identificarExecutorEntrada}
              disabled={
                validandoExecutorEntrada ||
                !codigoExecutorEntrada.trim()
              }
            >
              {validandoExecutorEntrada ? 'Validando...' : 'Identificar'}
            </button>

            <div
              style={{
                minHeight: 42,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              {executorEntrada ? (
                <strong>
                  Executor identificado: {executorEntrada.nome}
                </strong>
              ) : (
                <span style={{ color: '#777' }}>
                  Informe o ID de quem está realizando a entrada.
                </span>
              )}
            </div>
          </div>

          <div className="form-grid">
            <div>
              <label>Produto</label>
              <select value={produtoId} onChange={(e) => setProdutoId(e.target.value)}>
                <option value="">Selecione o produto</option>
                {produtos.map((produto) => (
                  <option key={produto.id} value={produto.id}>
                    {produto.nome} — {produto.ean}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label>Unidade</label>
              <select
                value={lojaId}
                onChange={(e) => {
                  setLojaId(e.target.value);
                  carregarLocaisEntrada(e.target.value);
                }}
              >
                <option value="">Selecione a unidade</option>
                {lojas.map((loja) => (
                  <option key={loja.id} value={loja.id}>
                    {loja.nome}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label>Local</label>
              <select
                value={localId}
                disabled={!lojaId}
                onChange={(e) => setLocalId(e.target.value)}
              >
                <option value="">Selecione o local</option>
                {locais.map((local) => (
                  <option key={local.id} value={local.id}>
                    {local.nome} — {local.tipo}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label>Quantidade</label>
              <input
                type="number"
                min="0"
                step="0.001"
                value={quantidade}
                onChange={(e) => setQuantidade(e.target.value)}
              />
            </div>

            <div>
              <label>Custo unitário</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={custoUnitario}
                onChange={(e) => setCustoUnitario(e.target.value)}
              />
            </div>

            <div>
              <label>Observação</label>
              <input value={observacao} onChange={(e) => setObservacao(e.target.value)} />
            </div>
          </div>

          <div className="form-actions">
            <button type="button" className="secondary-button" onClick={fecharFormularios}>
              Cancelar
            </button>
            <button type="button" className="primary-button" onClick={registrarEntrada} disabled={salvando}>
              {salvando ? 'Registrando...' : 'Confirmar Entrada'}
            </button>
          </div>
        </div>
      )}

      {!ehCaixa && mostrarSaida && (
        <div className="estoque-form-box">
          <div className="produto-form-header">
            <h2>Nova Saída</h2>
            <p>Registre perdas, avarias, vencimentos e outras saídas.</p>
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
              <label>Executor da saída</label>
              <input
                value={codigoExecutorSaida}
                onChange={(e) => {
                  setCodigoExecutorSaida(e.target.value);
                  setExecutorSaida(null);
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
              onClick={identificarExecutorSaida}
              disabled={
                validandoExecutorSaida ||
                !codigoExecutorSaida.trim()
              }
            >
              {validandoExecutorSaida ? 'Validando...' : 'Identificar'}
            </button>

            <div
              style={{
                minHeight: 42,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              {executorSaida ? (
                <strong>
                  Executor identificado: {executorSaida.nome}
                </strong>
              ) : (
                <span style={{ color: '#777' }}>
                  Informe o ID de quem está realizando a saída.
                </span>
              )}
            </div>
          </div>

          <div className="form-grid">
            <div>
              <label>Produto</label>
              <select value={produtoSaidaId} onChange={(e) => setProdutoSaidaId(e.target.value)}>
                <option value="">Selecione o produto</option>
                {produtos.map((produto) => (
                  <option key={produto.id} value={produto.id}>
                    {produto.nome} — {produto.ean}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label>Unidade</label>
              <select
                value={lojaSaidaId}
                onChange={(e) => {
                  setLojaSaidaId(e.target.value);
                  carregarLocaisSaida(e.target.value);
                }}
              >
                <option value="">Selecione</option>
                {lojas.map((loja) => (
                  <option key={loja.id} value={loja.id}>
                    {loja.nome}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label>Local</label>
              <select
                value={localSaidaId}
                disabled={!lojaSaidaId}
                onChange={(e) => setLocalSaidaId(e.target.value)}
              >
                <option value="">Selecione</option>
                {locaisSaida.map((local) => (
                  <option key={local.id} value={local.id}>
                    {local.nome} — {local.tipo}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label>Motivo</label>
              <select value={tipoSaida} onChange={(e) => setTipoSaida(e.target.value as TipoSaidaTela)}>
                <option value="VENDA">Venda</option>
                <option value="PERDA">Perda</option>
                <option value="AVARIA">Avaria</option>
                <option value="VENCIMENTO">Vencimento</option>
                <option value="DEVOLUCAO">Devolução</option>
                <option value="CONSUMO_INTERNO">Consumo interno</option>
                <option value="AJUSTE_MANUAL">Ajuste manual</option>
              </select>
            </div>

            <div>
              <label>Quantidade</label>
              <input
                type="number"
                min="0"
                value={quantidadeSaida}
                onChange={(e) => setQuantidadeSaida(e.target.value)}
              />
            </div>

            <div>
              <label>Justificativa</label>
              <input value={justificativaSaida} onChange={(e) => setJustificativaSaida(e.target.value)} />
            </div>

            <div>
              <label>Observação</label>
              <input value={observacaoSaida} onChange={(e) => setObservacaoSaida(e.target.value)} />
            </div>
          </div>

          {saldoSaida && (
            <div className="estoque-info-box">
              <strong>Saldo disponível: {saldoSaida.quantidade}</strong>
              <span>
                {saldoSaida.loja} → {saldoSaida.local}
              </span>
            </div>
          )}

          <div className="form-actions">
            <button type="button" className="secondary-button" onClick={fecharFormularios}>
              Cancelar
            </button>
            <button type="button" className="primary-button" onClick={registrarSaida} disabled={salvando}>
              {salvando ? 'Registrando...' : 'Confirmar Saída'}
            </button>
          </div>
        </div>
      )}

      {mostrarReposicao && (
        <div className="estoque-form-box">
          <div className="produto-form-header">
            <h2>Nova Reposição</h2>
            <p>Movimentação dentro da mesma unidade.</p>
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
              <label>Executor da reposição</label>
              <input
                value={codigoExecutorReposicao}
                onChange={(e) => {
                  setCodigoExecutorReposicao(e.target.value);
                  setExecutorReposicao(null);
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
              onClick={identificarExecutorReposicao}
              disabled={validandoExecutorReposicao || !codigoExecutorReposicao.trim()}
            >
              {validandoExecutorReposicao ? 'Validando...' : 'Identificar'}
            </button>
            <div style={{ minHeight: 42, display: 'flex', alignItems: 'center' }}>
              {executorReposicao ? (
                <strong>Executor identificado: {executorReposicao.nome}</strong>
              ) : (
                <span style={{ color: '#777' }}>
                  Informe o ID de quem está realizando a reposição.
                </span>
              )}
            </div>
          </div>

          <div className="form-grid">
            <div>
              <label>Produto</label>
              <select value={produtoReposicaoId} onChange={(e) => setProdutoReposicaoId(e.target.value)}>
                <option value="">Selecione</option>
                {produtos.map((produto) => (
                  <option key={produto.id} value={produto.id}>
                    {produto.nome} — {produto.ean}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label>Unidade</label>
              <select
                value={lojaReposicaoId}
                onChange={(e) => {
                  setLojaReposicaoId(e.target.value);
                  carregarLocaisReposicao(e.target.value);
                }}
              >
                <option value="">Selecione</option>
                {lojas.map((loja) => (
                  <option key={loja.id} value={loja.id}>
                    {loja.nome}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label>Origem</label>
              <select value={localOrigemId} onChange={(e) => setLocalOrigemId(e.target.value)}>
                <option value="">Selecione</option>
                {locaisReposicao.map((local) => (
                  <option key={local.id} value={local.id}>
                    {local.nome}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label>Destino</label>
              <select value={localDestinoId} onChange={(e) => setLocalDestinoId(e.target.value)}>
                <option value="">Selecione</option>
                {locaisReposicao.map((local) => (
                  <option key={local.id} value={local.id}>
                    {local.nome}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label>Quantidade</label>
              <input
                type="number"
                min="0"
                value={quantidadeReposicao}
                onChange={(e) => setQuantidadeReposicao(e.target.value)}
              />
            </div>

            <div>
              <label>Observação</label>
              <input value={observacaoReposicao} onChange={(e) => setObservacaoReposicao(e.target.value)} />
            </div>
          </div>

          {saldoOrigemReposicao && (
            <div className="estoque-info-box">
              <strong>Saldo disponível: {saldoOrigemReposicao.quantidade}</strong>
            </div>
          )}

          <div className="form-actions">
            <button type="button" className="secondary-button" onClick={fecharFormularios}>
              Cancelar
            </button>
            <button type="button" className="primary-button" onClick={registrarReposicao} disabled={salvando}>
              {salvando ? 'Movimentando...' : 'Confirmar Reposição'}
            </button>
          </div>
        </div>
      )}

      {mostrarTransferencia && (
        <div className="estoque-form-box">
          <div className="produto-form-header">
            <h2>Transferência entre Unidades</h2>
            <p>Transfira produtos diretamente entre Matriz e filiais.</p>
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
              <label>Executor da transferência</label>
              <input
                value={codigoExecutorTransferencia}
                onChange={(e) => {
                  setCodigoExecutorTransferencia(e.target.value);
                  setExecutorTransferencia(null);
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
              onClick={identificarExecutorTransferencia}
              disabled={
                validandoExecutorTransferencia ||
                !codigoExecutorTransferencia.trim()
              }
            >
              {validandoExecutorTransferencia ? 'Validando...' : 'Identificar'}
            </button>
            <div style={{ minHeight: 42, display: 'flex', alignItems: 'center' }}>
              {executorTransferencia ? (
                <strong>Executor identificado: {executorTransferencia.nome}</strong>
              ) : (
                <span style={{ color: '#777' }}>
                  Informe o ID de quem está realizando a transferência.
                </span>
              )}
            </div>
          </div>

          <div className="form-grid">
            <div>
              <label>Produto</label>
              <select
                value={produtoTransferenciaId}
                onChange={(e) => setProdutoTransferenciaId(e.target.value)}
              >
                <option value="">Selecione</option>
                {produtos.map((produto) => (
                  <option key={produto.id} value={produto.id}>
                    {produto.nome} — {produto.ean}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label>Unidade de origem</label>
              <select
                value={lojaOrigemTransferenciaId}
                onChange={(e) => {
                  setLojaOrigemTransferenciaId(e.target.value);
                  carregarLocaisOrigemTransferencia(e.target.value);
                }}
              >
                <option value="">Selecione</option>
                {lojas.map((loja) => (
                  <option key={loja.id} value={loja.id}>
                    {loja.nome}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label>Local de origem</label>
              <select
                value={localOrigemTransferenciaId}
                onChange={(e) => setLocalOrigemTransferenciaId(e.target.value)}
              >
                <option value="">Selecione</option>
                {locaisOrigemTransferencia.map((local) => (
                  <option key={local.id} value={local.id}>
                    {local.nome}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label>Unidade de destino</label>
              <select
                value={lojaDestinoTransferenciaId}
                onChange={(e) => {
                  setLojaDestinoTransferenciaId(e.target.value);
                  carregarLocaisDestinoTransferencia(e.target.value);
                }}
              >
                <option value="">Selecione</option>
                {lojas
                  .filter((loja) => String(loja.id) !== lojaOrigemTransferenciaId)
                  .map((loja) => (
                    <option key={loja.id} value={loja.id}>
                      {loja.nome}
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label>Local de destino</label>
              <select
                value={localDestinoTransferenciaId}
                onChange={(e) => setLocalDestinoTransferenciaId(e.target.value)}
              >
                <option value="">Selecione</option>
                {locaisDestinoTransferencia.map((local) => (
                  <option key={local.id} value={local.id}>
                    {local.nome}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label>Quantidade</label>
              <input
                type="number"
                min="0"
                value={quantidadeTransferencia}
                onChange={(e) => setQuantidadeTransferencia(e.target.value)}
              />
            </div>

            <div>
              <label>Observação</label>
              <input
                value={observacaoTransferencia}
                onChange={(e) => setObservacaoTransferencia(e.target.value)}
              />
            </div>
          </div>

          {saldoOrigemTransferencia && (
            <div className="estoque-info-box">
              <strong>Saldo disponível na origem: {saldoOrigemTransferencia.quantidade}</strong>
              <span>
                {saldoOrigemTransferencia.loja} → {saldoOrigemTransferencia.local}
              </span>
              <span>Custo médio: {formatarDinheiro(saldoOrigemTransferencia.custo_medio)}</span>
            </div>
          )}

          <div className="form-actions">
            <button type="button" className="secondary-button" onClick={fecharFormularios}>
              Cancelar
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={registrarTransferencia}
              disabled={salvando}
            >
              {salvando ? 'Transferindo...' : 'Confirmar Transferência'}
            </button>
          </div>
        </div>
      )}

      {mostrarNovaContagem && (
        <div className="estoque-form-box">
          <div className="produto-form-header">
            <h2>Contagem / Correção de Estoque</h2>
            <p>Informe a quantidade física correta. O sistema registrará somente a diferença como ajuste.</p>
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
                value={codigoExecutorContagem}
                onChange={(e) => {
                  setCodigoExecutorContagem(e.target.value);
                  setExecutorContagem(null);
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
              onClick={identificarExecutorContagem}
              disabled={
                validandoExecutorContagem ||
                !codigoExecutorContagem.trim()
              }
            >
              {validandoExecutorContagem ? 'Validando...' : 'Identificar'}
            </button>

            <div
              style={{
                minHeight: 42,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              {executorContagem ? (
                <strong>
                  Executor identificado: {executorContagem.nome}
                </strong>
              ) : (
                <span style={{ color: '#777' }}>
                  Informe o ID de quem está realizando a contagem.
                </span>
              )}
            </div>
          </div>

          <div className="form-grid">
            <div>
              <label>Produto</label>
              <select value={produtoContagemId} onChange={(e) => setProdutoContagemId(e.target.value)}>
                <option value="">Selecione</option>
                {produtos.map((produto) => (
                  <option key={produto.id} value={produto.id}>
                    {produto.nome} — {produto.ean}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label>Unidade</label>
              <select
                value={lojaContagemId}
                onChange={(e) => {
                  setLojaContagemId(e.target.value);
                  carregarLocaisContagem(e.target.value);
                }}
              >
                <option value="">Selecione</option>
                {lojas.map((loja) => (
                  <option key={loja.id} value={loja.id}>
                    {loja.nome}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label>Local</label>
              <select
                value={localContagemId}
                disabled={!lojaContagemId}
                onChange={(e) => setLocalContagemId(e.target.value)}
              >
                <option value="">Selecione</option>
                {locaisContagem.map((local) => (
                  <option key={local.id} value={local.id}>
                    {local.nome}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label>Quantidade física</label>
              <input
                type="number"
                min="0"
                value={quantidadeContada}
                onChange={(e) => setQuantidadeContada(e.target.value)}
              />
            </div>

            <div>
              <label>Justificativa</label>
              <input
                value={justificativaContagem}
                onChange={(e) => setJustificativaContagem(e.target.value)}
              />
            </div>

            <div>
              <label>Observação</label>
              <input
                value={observacaoContagem}
                onChange={(e) => setObservacaoContagem(e.target.value)}
              />
            </div>
          </div>

          {produtoContagemId && lojaContagemId && localContagemId && (
            <div className="estoque-info-box">
              <strong>
                Quantidade no sistema: {saldoAtualContagem ? saldoAtualContagem.quantidade : 0}
              </strong>

              {quantidadeContada !== '' && (
                <span>
                  Diferença prevista:{' '}
                  {Number(String(quantidadeContada).replace(',', '.')) -
                    Number(saldoAtualContagem?.quantidade || 0)}
                </span>
              )}
            </div>
          )}

          <div className="form-actions">
            <button type="button" className="secondary-button" onClick={fecharFormularios}>
              Cancelar
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={registrarNovaContagem}
              disabled={salvando}
            >
              {salvando ? 'Registrando...' : 'Confirmar Contagem'}
            </button>
          </div>
        </div>
      )}

      {!ehCaixa && mostrarHistorico && (
        <div className="historico-card">
          <div className="historico-header">
            <div>
              <h2>Histórico de Movimentações</h2>
              <p>Acompanhe todas as alterações realizadas no estoque.</p>
            </div>

            <button
              type="button"
              className="secondary-button"
              onClick={carregarHistorico}
              disabled={carregandoHistorico}
            >
              {carregandoHistorico ? 'Atualizando...' : 'Atualizar'}
            </button>
          </div>

          <div className="historico-filtros">
            <div className="historico-busca">
              <span className="historico-busca-icone">⌕</span>
              <input
                type="text"
                value={buscaHistorico}
                onChange={(e) => setBuscaHistorico(e.target.value)}
                placeholder="Buscar produto, EAN, loja, local..."
              />
            </div>

            <div>
              <label>Tipo de movimentação</label>
              <select value={tipoHistorico} onChange={(e) => setTipoHistorico(e.target.value)}>
                <option value="">Todos os tipos</option>
                {tiposHistorico.map((tipo) => (
                  <option key={tipo} value={tipo}>
                    {formatarTipo(tipo)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label>Usuário responsável</label>
              <select value={usuarioHistorico} onChange={(e) => setUsuarioHistorico(e.target.value)}>
                <option value="">Todos os usuários</option>
                {usuariosHistorico.map((usuario) => (
                  <option key={usuario} value={usuario}>
                    {usuario}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              className="secondary-button historico-limpar"
              onClick={() => {
                setBuscaHistorico('');
                setTipoHistorico('');
                setUsuarioHistorico('');
              }}
            >
              Limpar filtros
            </button>
          </div>

          <div className="historico-resumo">
            <div className="historico-resumo-icone">↻</div>
            <div>
              <strong>Total de movimentações: {movimentacoesFiltradas.length}</strong>
              <span>Exibindo as movimentações mais recentes primeiro</span>
            </div>
          </div>

          <div className="historico-table-wrap">
            <table className="historico-table">
              <thead>
                <tr>
                  <th>Data / Hora</th>
                  <th>Usuário</th>
                  <th>Produto / EAN</th>
                  <th>Tipo</th>
                  <th>Origem</th>
                  <th>Destino</th>
                  <th>Quantidade</th>
                  <th>Custo Unit.</th>
                  <th>Observação</th>
                  <th>Justificativa</th>
                </tr>
              </thead>

              <tbody>
                {carregandoHistorico ? (
                  <tr>
                    <td colSpan={10} className="historico-vazio">
                      Carregando histórico...
                    </td>
                  </tr>
                ) : movimentacoesFiltradas.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="historico-vazio">
                      Nenhuma movimentação encontrada.
                    </td>
                  </tr>
                ) : (
                  movimentacoesFiltradas.map((movimentacao) => {
                    const dataHora = formatarDataHora(movimentacao.criado_em);
                    const partes = dataHora.split(',');

                    return (
                      <tr key={movimentacao.id}>
                        <td>
                          <div className="historico-data">
                            <span className="historico-calendario">▣</span>
                            <div>
                              <strong>{partes[0]}</strong>
                              <span>{partes[1] || ''}</span>
                            </div>
                          </div>
                        </td>

                        <td>
                          <div className="historico-usuario">
                            <div className="historico-avatar">👤</div>
                            <div>
                              <strong>{movimentacao.usuario_nome || 'Não identificado'}</strong>
                              <span>{movimentacao.usuario_perfil || '-'}</span>
                            </div>
                          </div>
                        </td>

                        <td>
                          <div className="historico-produto">
                            <strong>{movimentacao.produto}</strong>
                            <span>EAN: {movimentacao.ean}</span>
                          </div>
                        </td>

                        <td>
                          <span className={`historico-badge tipo-${movimentacao.tipo.toLowerCase()}`}>
                            {formatarTipo(movimentacao.tipo)}
                          </span>
                        </td>

                        <td>{descricaoOrigem(movimentacao)}</td>
                        <td>{descricaoDestino(movimentacao)}</td>

                        <td>
                          <div className="historico-quantidade">
                            <strong>{movimentacao.quantidade}</strong>
                            <span>un</span>
                          </div>
                        </td>

                        <td>{formatarDinheiro(movimentacao.custo_unitario)}</td>
                        <td>{movimentacao.observacao || movimentacao.referencia || '-'}</td>
                        <td>{movimentacao.justificativa || '-'}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="historico-footer">
            <span>Mostrando {movimentacoesFiltradas.length} movimentação(ões)</span>

            <button
              type="button"
              className="secondary-button"
              onClick={() => setMostrarHistorico(false)}
            >
              Voltar ao Estoque
            </button>
          </div>
        </div>
      )}

      {!mostrarHistorico && (
        <>
          <section className="estoque-indicadores">
            <div className="estoque-indicador-card">
              <div className="estoque-indicador-icone">▦</div>
              <div>
                <span>Quantidade total</span>
                <strong>{indicadores.quantidadeTotal.toLocaleString('pt-BR')}</strong>
                <small>unidades nos filtros atuais</small>
              </div>
            </div>

            <div className="estoque-indicador-card">
              <div className="estoque-indicador-icone">R$</div>
              <div>
                <span>Valor em custo</span>
                <strong>{formatarDinheiro(indicadores.valorEstoque)}</strong>
                <small>custo do estoque exibido</small>
              </div>
            </div>

            <div className="estoque-indicador-card">
              <div className="estoque-indicador-icone alerta">!</div>
              <div>
                <span>Estoque baixo</span>
                <strong>{indicadores.baixos}</strong>
                <small>posição(ões) abaixo do mínimo</small>
              </div>
            </div>

            <div className="estoque-indicador-card">
              <div className="estoque-indicador-icone perigo">0</div>
              <div>
                <span>Estoque zerado</span>
                <strong>{indicadores.zerados}</strong>
                <small>posição(ões) sem saldo</small>
              </div>
            </div>

            <div className="estoque-indicador-card">
              <div className="estoque-indicador-icone sucesso">✓</div>
              <div>
                <span>Locais com saldo</span>
                <strong>{indicadores.locaisComSaldo}</strong>
                <small>depósitos / áreas de venda</small>
              </div>
            </div>
          </section>

          <section className="estoque-filtros-card">
            <div className="estoque-filtros-header">
              <div>
                <h3>Consultar estoque</h3>
                <p>Filtre a posição de estoque por unidade e local.</p>
              </div>

              <button type="button" className="secondary-button" onClick={limparFiltrosEstoque}>
                Limpar filtros
              </button>
            </div>

            <div className="estoque-filtros-avancados">
              <div className="estoque-filtro-busca">
                <label>Buscar</label>
                <input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Produto, EAN, marca, unidade..."
                />
              </div>

              <div>
                <label>Unidade</label>
                <select
                  value={lojaFiltro}
                  onChange={(e) => {
                    setLojaFiltro(e.target.value);
                    setLocalFiltro('');
                  }}
                >
                  <option value="">Todas</option>
                  {lojas.map((loja) => (
                    <option key={loja.id} value={loja.id}>
                      {loja.nome}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label>Local</label>
                <select value={localFiltro} onChange={(e) => setLocalFiltro(e.target.value)}>
                  <option value="">Todos</option>
                  {locaisDisponiveisFiltro.map((local) => (
                    <option key={local.id} value={local.id}>
                      {lojaFiltro ? local.nome : `${local.loja} — ${local.nome}`}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label>Tipo de local</label>
                <select value={tipoLocalFiltro} onChange={(e) => setTipoLocalFiltro(e.target.value)}>
                  <option value="">Todos</option>
                  <option value="DEPOSITO">Depósito</option>
                  <option value="VENDA">Área de Venda</option>
                </select>
              </div>

              <div>
                <label>Situação</label>
                <select value={situacaoFiltro} onChange={(e) => setSituacaoFiltro(e.target.value)}>
                  <option value="">Todas</option>
                  <option value="NORMAL">Normal</option>
                  <option value="BAIXO">Estoque baixo</option>
                  <option value="ZERADO">Zerado</option>
                </select>
              </div>
            </div>
          </section>

          <div className="estoque-lista-info">
            <span>
              <strong>{estoqueFiltrado.length}</strong> posição(ões) de estoque
            </span>

            {(lojaFiltro || localFiltro || tipoLocalFiltro || situacaoFiltro || busca) && (
              <span className="estoque-filtro-ativo">Filtros ativos</span>
            )}
          </div>

          <div className="produtos-table estoque-table-card">
            <table>
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>EAN</th>
                  <th>Unidade</th>
                  <th>Local</th>
                  <th>Tipo</th>
                  <th>Quantidade</th>
                  <th>Situação</th>
                  <th>Custo médio</th>
                  <th>Valor em custo</th>
                  <th>Ações</th>
                </tr>
              </thead>

              <tbody>
                {carregando ? (
                  <tr>
                    <td colSpan={10} className="empty-table">
                      Carregando estoque...
                    </td>
                  </tr>
                ) : estoqueFiltrado.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="empty-table">
                      Nenhum estoque encontrado para os filtros selecionados.
                    </td>
                  </tr>
                ) : (
                  estoqueFiltrado.map((item) => {
                    const situacao = obterSituacao(item);

                    return (
                      <tr key={`${item.produto_id}-${item.loja_id}-${item.local_id}`}>
                        <td>
                          <strong>{item.produto}</strong>
                          {item.marca && <div className="table-secondary-text">{item.marca}</div>}
                        </td>

                        <td>{item.ean}</td>
                        <td>{item.loja}</td>
                        <td>{item.local}</td>

                        <td>
                          <span className="local-badge">{item.tipo_local}</span>
                        </td>

                        <td>
                          <strong>{item.quantidade}</strong>
                        </td>

                        <td>
                          <span className={`estoque-situacao-badge situacao-${situacao.toLowerCase()}`}>
                            {situacao === 'ZERADO'
                              ? 'Zerado'
                              : situacao === 'BAIXO'
                              ? 'Baixo'
                              : 'Normal'}
                          </span>
                        </td>

                        <td>{formatarDinheiro(item.custo_medio)}</td>

                        <td>
                          <strong>
                            {formatarDinheiro(
                              Number(item.quantidade || 0) * Number(item.custo_medio || 0)
                            )}
                          </strong>
                        </td>

                        <td>
                          <button
                            type="button"
                            className="editar-button"
                            onClick={() => abrirCorrecaoQuantidade(item)}
                            title="Corrigir a quantidade física deste produto"
                          >
                            Corrigir quantidade
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}