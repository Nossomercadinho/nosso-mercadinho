import { apiFetch } from '../services/apiClient';
import ResponsiveFilters from '../components/ResponsiveFilters';
import CustoRealCompras from '../components/CustoRealCompras';
import { useLoja } from '../contexts/LojaContext';
import {
    useEffect,
  useMemo,
  useState,
} from 'react';

import type { ChangeEvent } from 'react';

const API =
  '/api';

type UsuarioLogado = {
  id: number;
  nome: string;
  email: string;
  perfil: string;
};

type Loja = {
  id: number;
  nome: string;
  tipo?: string;
};

type FornecedorSistema = {
  id: number;
  razao_social?: string | null;
  nome_fantasia?: string | null;
  cpf_cnpj?: string | null;
  ativo?: number;
};

type LocalEstoque = {
  id: number;
  loja_id: number;
  nome: string;
  tipo: string;
  permite_venda?: number;
};

type Produto = {
  id: number;
  nome: string;
  ean: string;
  marca?: string | null;
  ncm?: string | null;
};

type NotaLista = {
  id: number;

  chave_nfe: string;

  numero_nota?: string | null;
  serie?: string | null;

  data_emissao?: string | null;

  valor_produtos?: number;
  valor_total?: number;

  quantidade_itens?: number;

  status: string;

  fornecedor_id: number;
  fornecedor: string;
  cpf_cnpj?: string | null;

  loja?: string | null;
  local_estoque?: string | null;

  itens_pendentes?: number;

  importado_em?: string | null;
  efetivado_em?: string | null;
};

type ItemImportado = {
  id?: number;

  numeroItem?: number;
  numero_item?: number;

  codigoFornecedor?: string;
  codigo_fornecedor?: string;

  ean?: string;

  descricao: string;

  ncm?: string;
  cest?: string;
  cfop?: string;

  unidade?: string;

  quantidade: number;

  valorUnitario?: number;
  valor_unitario?: number;

  valorTotal?: number;
  valor_total?: number;

  produtoId?: number | null;
  produto_id?: number | null;

  produto_local?: string | null;
  produto_marca?: string | null;

  statusVinculo?: string;
  status_vinculo?: string;
};

type Parcela = {
  id?: number;

  numero_parcela?: string | null;
  numeroParcela?: string;

  vencimento?: string | null;

  valor: number;

  status?: string;
};

type FornecedorImportado = {
  id: number;

  nomeFantasia?: string | null;
  razaoSocial?: string | null;

  cpfCnpj?: string | null;

  cadastradoAutomaticamente?: boolean;
};

type NotaImportadaResumo = {
  chaveNfe: string;

  numeroNota?: string;

  serie?: string;

  dataEmissao?: string;

  valorProdutos?: number;

  valorTotal?: number;

  quantidadeItens?: number;

  status?: string;
};

type ResultadoImportacao = {
  notaEntradaId: number;

  fornecedor:
    FornecedorImportado;

  nota:
    NotaImportadaResumo;

  resumoItens: {
    total: number;
    vinculados: number;
    pendentes: number;
  };

  itens:
    ItemImportado[];

  parcelas:
    Parcela[];
};

function normalizarPesquisa(
  valor: any
) {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(
      /[\u0300-\u036f]/g,
      ''
    )
    .toLocaleLowerCase(
      'pt-BR'
    )
    .trim();
}

function nomeFornecedorSistema(
  fornecedor: FornecedorSistema
) {
  return (
    fornecedor.nome_fantasia ||
    fornecedor.razao_social ||
    'Fornecedor'
  );
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

  return apiFetch(input, {
    ...init,
    headers,
  });
}

export default function Compras() {
  const { lojaAtiva } = useLoja();
  const idLojaAtiva = lojaAtiva ? String(lojaAtiva.id) : '';
  /*
  |--------------------------------------------------------------------------
  | USUÁRIO LOGADO
  |--------------------------------------------------------------------------
  */

  const usuarioLogado =
    useMemo<UsuarioLogado | null>(
      () => {
        try {
          const usuario =
            localStorage.getItem(
              'usuarioLogado'
            );

          return usuario
            ? JSON.parse(
                usuario
              )
            : null;
        } catch {
          return null;
        }
      },
      []
    );

  /*
  |--------------------------------------------------------------------------
  | DADOS
  |--------------------------------------------------------------------------
  */

  const [
    lojas,
    setLojas,
  ] = useState<Loja[]>([]);

  const [
    locais,
    setLocais,
  ] =
    useState<LocalEstoque[]>(
      []
    );

  const [
    produtos,
    setProdutos,
  ] =
    useState<Produto[]>([]);

  const [
    notas,
    setNotas,
  ] =
    useState<NotaLista[]>([]);

  const [
    fornecedores,
    setFornecedores,
  ] =
    useState<FornecedorSistema[]>(
      []
    );

  const [
    buscaEmFoco,
    setBuscaEmFoco,
  ] = useState(false);

  /*
  |--------------------------------------------------------------------------
  | IMPORTAÇÃO
  |--------------------------------------------------------------------------
  */

  const [
    arquivo,
    setArquivo,
  ] =
    useState<File | null>(
      null
    );

  const [
    xml,
    setXml,
  ] = useState('');

  const [
    lojaId,
    setLojaId,
  ] = useState(idLojaAtiva);

  const [
    localId,
    setLocalId,
  ] = useState('');

  const [
    importando,
    setImportando,
  ] = useState(false);

  const [
    mostrandoImportacao,
    setMostrandoImportacao,
  ] = useState(false);

  const [
    resultado,
    setResultado,
  ] =
    useState<ResultadoImportacao | null>(
      null
    );

  /*
  |--------------------------------------------------------------------------
  | NOTA ABERTA
  |--------------------------------------------------------------------------
  */

  const [
    notaAbertaId,
    setNotaAbertaId,
  ] =
    useState<number | null>(
      null
    );

  const [
    notaCompleta,
    setNotaCompleta,
  ] =
    useState<any | null>(
      null
    );

  const [
    carregandoNota,
    setCarregandoNota,
  ] = useState(false);

  /*
  |--------------------------------------------------------------------------
  | TELA
  |--------------------------------------------------------------------------
  */

  const [
    carregando,
    setCarregando,
  ] = useState(true);

  const [
    mensagem,
    setMensagem,
  ] = useState('');

  const [
    erro,
    setErro,
  ] = useState('');

  const [
    busca,
    setBusca,
  ] = useState('');

  const [
    statusFiltro,
    setStatusFiltro,
  ] = useState('');

  /*
  |--------------------------------------------------------------------------
  | CARREGAMENTO INICIAL
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    carregarInicial();
  }, []);

  async function carregarInicial() {
    setCarregando(true);

    try {
      await Promise.all([
        carregarLojas(),
        carregarProdutos(),
        carregarFornecedores(),
        carregarNotas(),
      ]);
    } finally {
      setCarregando(false);
    }
  }

  async function carregarLojas() {
    try {
      const resposta =
        await fetchAutenticado(
          `${API}/lojas`
        );

      const dados =
        await resposta.json();

      if (dados.sucesso) {
        setLojas(
          dados.lojas || []
        );
      }
    } catch (error) {
      console.error(
        'Erro ao carregar unidades:',
        error
      );
    }
  }

  async function carregarProdutos() {
    try {
      const resposta =
        await fetchAutenticado(
          `${API}/produtos/loja/catalogo`
        );

      const dados =
        await resposta.json();

      if (dados.sucesso) {
        setProdutos(
          dados.produtos || []
        );
      }
    } catch (error) {
      console.error(
        'Erro ao carregar produtos:',
        error
      );
    }
  }

  async function carregarFornecedores() {
    try {
      const resposta =
        await fetchAutenticado(
          `${API}/fornecedores`
        );

      const dados =
        await resposta.json();

      if (!resposta.ok) {
        setFornecedores([]);
        return;
      }

      const lista =
        Array.isArray(
          dados.fornecedores
        )
          ? dados.fornecedores
          : Array.isArray(dados)
            ? dados
            : [];

      setFornecedores(
        lista.filter(
          (
            fornecedor:
              FornecedorSistema
          ) =>
            Number(
              fornecedor.ativo ?? 1
            ) === 1
        )
      );
    } catch (error) {
      console.error(
        'Erro ao carregar fornecedores:',
        error
      );

      setFornecedores([]);
    }
  }

  async function carregarNotas() {
    try {
      const resposta =
        await fetchAutenticado(
          `${API}/nfe?limite=500`
        );

      const dados =
        await resposta.json();

      if (dados.sucesso) {
        setNotas(
          dados.notas || []
        );
      } else {
        setErro(
          dados.erro ||
            'Não foi possível carregar as notas.'
        );
      }
    } catch (error) {
      console.error(
        'Erro ao carregar notas:',
        error
      );

      setErro(
        'Não foi possível carregar as notas de entrada.'
      );
    }
  }

  /*
  |--------------------------------------------------------------------------
  | LOCAIS DA UNIDADE
  |--------------------------------------------------------------------------
  */

  async function carregarLocais(
    unidadeId: string
  ) {
    setLocais([]);
    setLocalId('');

    if (!unidadeId) {
      return;
    }

    try {
      const resposta =
        await fetchAutenticado(
          `${API}/lojas/${unidadeId}/locais`
        );

      const dados =
        await resposta.json();

      if (
        dados.sucesso
      ) {
        const listaLocais:
          LocalEstoque[] =
          dados.locais || [];

        setLocais(
          listaLocais
        );

        /*
        |--------------------------------------------------------------------------
        | SE EXISTIR DEPÓSITO, SELECIONAR AUTOMATICAMENTE
        |--------------------------------------------------------------------------
        */

        const deposito =
          listaLocais.find(
            (local) =>
              String(
                local.tipo
              ).toUpperCase() ===
              'DEPOSITO'
          );

        if (deposito) {
          setLocalId(
            String(
              deposito.id
            )
          );
        }
      }
    } catch (error) {
      console.error(
        'Erro ao carregar locais:',
        error
      );

      setErro(
        'Não foi possível carregar os locais da unidade.'
      );
    }
  }

  /*
  |--------------------------------------------------------------------------
  | ABRIR / FECHAR IMPORTAÇÃO
  |--------------------------------------------------------------------------
  */

  function abrirImportacao() {
    setMensagem('');
    setErro('');

    setArquivo(null);
    setXml('');

    setLojaId(idLojaAtiva);
    setLocalId('');

    setLocais([]);

    setResultado(null);

    setNotaCompleta(null);
    setNotaAbertaId(null);

    setMostrandoImportacao(false);
    window.dispatchEvent(new Event('nm:importar-nota'));
    void carregarLocais(idLojaAtiva);
  }

  function fecharImportacao() {
    setMostrandoImportacao(
      false
    );

    setArquivo(null);
    setXml('');

    setLojaId(idLojaAtiva);
    setLocalId('');

    setLocais([]);

    setErro('');
  }

  /*
  |--------------------------------------------------------------------------
  | SELECIONAR XML
  |--------------------------------------------------------------------------
  */

  async function selecionarArquivo(
    event: ChangeEvent<HTMLInputElement>
  ) {
    setErro('');
    setMensagem('');
    setResultado(null);

    const arquivoSelecionado =
      event.target.files?.[0];

    if (
      !arquivoSelecionado
    ) {
      setArquivo(null);
      setXml('');

      return;
    }

    /*
    |--------------------------------------------------------------------------
    | VALIDAR EXTENSÃO
    |--------------------------------------------------------------------------
    */

    if (
      !arquivoSelecionado.name
        .toLowerCase()
        .endsWith('.xml')
    ) {
      setErro(
        'Selecione um arquivo XML de NF-e.'
      );

      setArquivo(null);
      setXml('');

      event.target.value =
        '';

      return;
    }

    try {
      const conteudo =
        await arquivoSelecionado.text();

      if (
        !conteudo ||
        !conteudo.includes(
          '<'
        )
      ) {
        throw new Error(
          'O arquivo selecionado não parece ser um XML válido.'
        );
      }

      setArquivo(
        arquivoSelecionado
      );

      setXml(
        conteudo
      );

      setMensagem(
        'Arquivo XML carregado. Selecione a unidade e o local de entrada.'
      );
    } catch (error: any) {
      setArquivo(null);
      setXml('');

      setErro(
        error?.message ||
          'Não foi possível ler o arquivo XML.'
      );
    }
  }

  /*
  |--------------------------------------------------------------------------
  | IMPORTAR XML
  |--------------------------------------------------------------------------
  */

  async function importarXml() {
    setErro('');
    setMensagem('');

    if (!arquivo) {
      setErro(
        'Selecione o arquivo XML da NF-e.'
      );

      return;
    }

    if (!xml) {
      setErro(
        'O conteúdo do XML não foi carregado.'
      );

      return;
    }

    if (!lojaId) {
      setErro(
        'Selecione a unidade que receberá a mercadoria.'
      );

      return;
    }

    if (!localId) {
      setErro(
        'Selecione o local de entrada do estoque.'
      );

      return;
    }

    setImportando(true);

    try {
      const resposta =
        await fetchAutenticado(
          `${API}/nfe/importar`,
          {
            method:
              'POST',

            headers: {
              'Content-Type':
                'application/json',
            },

            body:
              JSON.stringify({
                xml,

                arquivoNome:
                  arquivo.name,

                lojaId:
                  Number(
                    lojaId
                  ),

                localEstoqueId:
                  Number(
                    localId
                  ),

                usuarioId:
                  usuarioLogado?.id ||
                  null,
              }),
          }
        );

      const dados =
        await resposta.json();

      if (!resposta.ok) {
        throw new Error(
          dados.erro ||
            'Erro ao importar NF-e.'
        );
      }

      setResultado(
        dados.resultado
      );

      setMensagem(
        dados.mensagem ||
          'NF-e importada com sucesso.'
      );

      /*
      |--------------------------------------------------------------------------
      | FECHAR ÁREA DE UPLOAD
      |--------------------------------------------------------------------------
      */

      setMostrandoImportacao(
        false
      );

      /*
      |--------------------------------------------------------------------------
      | ATUALIZAR LISTA
      |--------------------------------------------------------------------------
      */

      await carregarNotas();
    } catch (error: any) {
      console.error(
        'Erro ao importar NF-e:',
        error
      );

      setErro(
        error?.message ||
          'Não foi possível importar a NF-e.'
      );
    } finally {
      setImportando(false);
    }
  }

  /*
  |--------------------------------------------------------------------------
  | ABRIR NOTA
  |--------------------------------------------------------------------------
  */

  async function abrirNota(
    id: number
  ) {
    setErro('');
    setMensagem('');

    setResultado(null);

    setCarregandoNota(
      true
    );

    try {
      const resposta =
        await fetchAutenticado(
          `${API}/nfe/${id}`
        );

      const dados =
        await resposta.json();

      if (!resposta.ok) {
        throw new Error(
          dados.erro ||
            'Erro ao abrir NF-e.'
        );
      }

      setNotaAbertaId(
        id
      );

      setNotaCompleta({
        nota:
          dados.nota,

        itens:
          dados.itens || [],

        parcelas:
          dados.parcelas || [],
      });

      setMostrandoImportacao(
        false
      );

      window.scrollTo({
        top: 0,
        behavior: 'smooth',
      });
    } catch (error: any) {
      setErro(
        error?.message ||
          'Não foi possível abrir a NF-e.'
      );
    } finally {
      setCarregandoNota(
        false
      );
    }
  }

  /*
  |--------------------------------------------------------------------------
  | VINCULAR ITEM DA NF-e
  |--------------------------------------------------------------------------
  */

  async function vincularProduto(
    itemId: number,
    produtoId: string
  ) {
    setErro('');
    setMensagem('');

    if (!produtoId) {
      return;
    }

    try {
      const resposta =
        await fetchAutenticado(
          `${API}/nfe/itens/${itemId}/vincular`,
          {
            method:
              'PATCH',

            headers: {
              'Content-Type':
                'application/json',
            },

            body:
              JSON.stringify({
                produtoId:
                  Number(
                    produtoId
                  ),
              }),
          }
        );

      const dados =
        await resposta.json();

      if (!resposta.ok) {
        throw new Error(
          dados.erro ||
            'Erro ao vincular produto.'
        );
      }

      setMensagem(
        'Produto vinculado ao item da NF-e.'
      );

      if (
        notaAbertaId
      ) {
        await abrirNota(
          notaAbertaId
        );
      } else if (
        resultado?.notaEntradaId
      ) {
        await abrirNota(
          resultado.notaEntradaId
        );
      }

      await carregarNotas();
    } catch (error: any) {
      setErro(
        error?.message ||
          'Não foi possível vincular o produto.'
      );
    }
  }

  /*
  |--------------------------------------------------------------------------
  | FORMATAÇÕES
  |--------------------------------------------------------------------------
  */

  function formatarDinheiro(
    valor?: number | null
  ) {
    return Number(
      valor || 0
    ).toLocaleString(
      'pt-BR',
      {
        style:
          'currency',

        currency:
          'BRL',
      }
    );
  }

  function formatarDocumento(
    documento?: string | null
  ) {
    const numeros =
      String(
        documento || ''
      ).replace(
        /\D/g,
        ''
      );

    if (
      numeros.length === 14
    ) {
      return numeros.replace(
        /(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/,
        '$1.$2.$3/$4-$5'
      );
    }

    if (
      numeros.length === 11
    ) {
      return numeros.replace(
        /(\d{3})(\d{3})(\d{3})(\d{2})/,
        '$1.$2.$3-$4'
      );
    }

    return documento || '-';
  }

  function formatarData(
    valor?: string | null
  ) {
    if (!valor) {
      return '-';
    }

    const data =
      new Date(
        valor
      );

    if (
      Number.isNaN(
        data.getTime()
      )
    ) {
      return valor;
    }

    return data.toLocaleDateString(
      'pt-BR'
    );
  }

  function formatarDataHora(
    valor?: string | null
  ) {
    if (!valor) {
      return '-';
    }

    let textoData =
      valor;

    if (
      textoData.includes(
        ' '
      ) &&
      !textoData.includes(
        'T'
      )
    ) {
      textoData =
        textoData.replace(
          ' ',
          'T'
        );
    }

    const data =
      new Date(
        textoData
      );

    if (
      Number.isNaN(
        data.getTime()
      )
    ) {
      return valor;
    }

    return data.toLocaleString(
      'pt-BR'
    );
  }

  function obterNumeroItem(
    item: ItemImportado
  ) {
    return (
      item.numeroItem ??
      item.numero_item ??
      '-'
    );
  }

  function obterCodigoFornecedor(
    item: ItemImportado
  ) {
    return (
      item.codigoFornecedor ??
      item.codigo_fornecedor ??
      '-'
    );
  }

  function obterValorUnitario(
    item: ItemImportado
  ) {
    return Number(
      item.valorUnitario ??
        item.valor_unitario ??
        0
    );
  }

  function obterValorTotal(
    item: ItemImportado
  ) {
    return Number(
      item.valorTotal ??
        item.valor_total ??
        0
    );
  }

  function obterProdutoId(
    item: ItemImportado
  ) {
    return (
      item.produtoId ??
      item.produto_id ??
      null
    );
  }

  function obterStatusVinculo(
    item: ItemImportado
  ) {
    return (
      item.statusVinculo ??
      item.status_vinculo ??
      (
        obterProdutoId(
          item
        )
          ? 'VINCULADO'
          : 'PENDENTE'
      )
    );
  }

  /*
  |--------------------------------------------------------------------------
  | CONFERÊNCIA ATUAL
  |--------------------------------------------------------------------------
  */

  const conferencia =
    resultado
      ? {
          nota:
            resultado.nota,

          fornecedor:
            resultado.fornecedor,

          itens:
            resultado.itens,

          parcelas:
            resultado.parcelas,

          notaEntradaId:
            resultado.notaEntradaId,

          cadastradoAutomaticamente:
            resultado
              .fornecedor
              .cadastradoAutomaticamente,
        }
      : notaCompleta
      ? {
          nota: {
            chaveNfe:
              notaCompleta.nota
                .chave_nfe,

            numeroNota:
              notaCompleta.nota
                .numero_nota,

            serie:
              notaCompleta.nota
                .serie,

            dataEmissao:
              notaCompleta.nota
                .data_emissao,

            valorProdutos:
              notaCompleta.nota
                .valor_produtos,

            valorTotal:
              notaCompleta.nota
                .valor_total,

            quantidadeItens:
              notaCompleta.nota
                .quantidade_itens,

            status:
              notaCompleta.nota
                .status,
          },

          fornecedor: {
            id:
              notaCompleta.nota
                .fornecedor_id,

            nomeFantasia:
              notaCompleta.nota
                .fornecedor_nome_fantasia,

            razaoSocial:
              notaCompleta.nota
                .fornecedor_razao_social,

            cpfCnpj:
              notaCompleta.nota
                .fornecedor_cpf_cnpj,
          },

          itens:
            notaCompleta.itens ||
            [],

          parcelas:
            notaCompleta.parcelas ||
            [],

          notaEntradaId:
            notaCompleta.nota.id,

          cadastradoAutomaticamente:
            false,
        }
      : null;

  /*
  |--------------------------------------------------------------------------
  | EFETIVAR ENTRADA
  |--------------------------------------------------------------------------
  */

  async function efetivarEntrada() {
    setErro('');
    setMensagem('');

    if (!conferencia) {
      setErro(
        'Nenhuma NF-e está aberta.'
      );

      return;
    }

    const notaId =
      conferencia.notaEntradaId;

    if (!notaId) {
      setErro(
        'Não foi possível identificar a NF-e.'
      );

      return;
    }

    const pendentes =
      conferencia.itens.filter(
        (item: ItemImportado) =>
          !obterProdutoId(
            item
          )
      );

    if (
      pendentes.length > 0
    ) {
      setErro(
        `Existem ${pendentes.length} item(ns) sem produto vinculado.`
      );

      return;
    }

    const status =
      String(
        conferencia.nota
          .status ||
          ''
      ).toUpperCase();

    if (
      status ===
      'EFETIVADA'
    ) {
      setErro(
        'Esta NF-e já foi efetivada.'
      );

      return;
    }

    const confirmou =
      window.confirm(
        `Confirma a entrada da NF-e nº ${
          conferencia.nota
            .numeroNota ||
          '-'
        } no estoque?\n\n` +
        `Fornecedor: ${
          conferencia.fornecedor
            .nomeFantasia ||
          conferencia.fornecedor
            .razaoSocial ||
          '-'
        }\n` +
        `Itens: ${
          conferencia.itens
            .length
        }\n` +
        `Valor: ${formatarDinheiro(
          conferencia.nota
            .valorTotal
        )}`
      );

    if (!confirmou) {
      return;
    }

    setImportando(true);

    try {
      const resposta =
        await fetchAutenticado(
          `${API}/nfe/${notaId}/efetivar`,
          {
            method:
              'PATCH',

            headers: {
              'Content-Type':
                'application/json',
            },

            body:
              JSON.stringify({
                usuarioId:
                  usuarioLogado?.id ||
                  null,
              }),
          }
        );

      const dados =
        await resposta.json();

      if (!resposta.ok) {
        throw new Error(
          dados.erro ||
            'Erro ao efetivar NF-e.'
        );
      }

      setMensagem(
        dados.mensagem ||
          'Entrada efetivada com sucesso.'
      );

      setResultado(null);

      setNotaCompleta({
        nota:
          dados.nota,

        itens:
          dados.itens || [],

        parcelas:
          dados.parcelas || [],
      });

      setNotaAbertaId(
        notaId
      );

      await Promise.all([
        carregarNotas(),
        carregarProdutos(),
      ]);
    } catch (error: any) {
      console.error(
        'Erro ao efetivar NF-e:',
        error
      );

      setErro(
        error?.message ||
          'Não foi possível efetivar a NF-e.'
      );
    } finally {
      setImportando(false);
    }
  }

  /*
  |--------------------------------------------------------------------------
  | FILTROS
  |--------------------------------------------------------------------------
  */

  const notasFiltradas =
    useMemo(() => {
      const termo =
        normalizarPesquisa(
          busca
        );

      return notas.filter(
        (nota) => {
          if (
            statusFiltro &&
            String(
              nota.status
            ).toUpperCase() !==
              statusFiltro
          ) {
            return false;
          }

          if (!termo) {
            return true;
          }

          const pesquisa =
            [
              nota.numero_nota,
              nota.serie,
              nota.chave_nfe,
              nota.fornecedor,
              nota.cpf_cnpj,
              nota.loja,
              nota.local_estoque,
              nota.status,
            ]
              .filter(Boolean)
              .map(
                normalizarPesquisa
              )
              .join(' ');

          return pesquisa.includes(
            termo
          );
        }
      );
    }, [
      notas,
      busca,
      statusFiltro,
    ]);

  const fornecedoresSugeridos =
    useMemo(() => {
      const termo =
        normalizarPesquisa(
          busca
        );

      if (!termo) {
        return [];
      }

      return fornecedores
        .filter(
          (fornecedor) => {
            const pesquisa =
              [
                fornecedor
                  .nome_fantasia,
                fornecedor
                  .razao_social,
                fornecedor
                  .cpf_cnpj,
              ]
                .filter(Boolean)
                .map(
                  normalizarPesquisa
                )
                .join(' ');

            return pesquisa.includes(
              termo
            );
          }
        )
        .sort((a, b) => {
          const nomeA =
            normalizarPesquisa(
              nomeFornecedorSistema(
                a
              )
            );

          const nomeB =
            normalizarPesquisa(
              nomeFornecedorSistema(
                b
              )
            );

          const aComeca =
            nomeA.startsWith(
              termo
            )
              ? 0
              : 1;

          const bComeca =
            nomeB.startsWith(
              termo
            )
              ? 0
              : 1;

          if (
            aComeca !==
            bComeca
          ) {
            return (
              aComeca -
              bComeca
            );
          }

          return nomeA.localeCompare(
            nomeB,
            'pt-BR'
          );
        })
        .slice(
          0,
          8
        );
    }, [
      fornecedores,
      busca,
    ]);

  /*
  |--------------------------------------------------------------------------
  | INDICADORES
  |--------------------------------------------------------------------------
  */

  const indicadores =
    useMemo(() => {
      const pendentes =
        notas.filter(
          (nota) =>
            String(
              nota.status
            ).toUpperCase() ===
            'PENDENTE'
        ).length;

      const efetivadas =
        notas.filter(
          (nota) =>
            String(
              nota.status
            ).toUpperCase() ===
            'EFETIVADA'
        ).length;

      const itensPendentes =
        notas.reduce(
          (
            total,
            nota
          ) =>
            total +
            Number(
              nota.itens_pendentes ||
                0
            ),
          0
        );

      const valorNotas =
        notas.reduce(
          (
            total,
            nota
          ) =>
            total +
            Number(
              nota.valor_total ||
                0
            ),
          0
        );

      return {
        total:
          notas.length,

        pendentes,

        efetivadas,

        itensPendentes,

        valorNotas,
      };
    }, [notas]);

  /*
  |--------------------------------------------------------------------------
  | BOTÃO DE IMPORTAÇÃO
  |--------------------------------------------------------------------------
  */

  const podeImportar =
    Boolean(
      arquivo &&
      xml &&
      lojaId &&
      localId &&
      !importando
    );

  /*
  |--------------------------------------------------------------------------
  | RENDER
  |--------------------------------------------------------------------------
  */

  return (
    <div className="compras-page">
      <div className="page-header">
        <div>
          <h1>Compras</h1>

          <p>
            Importe NF-e,
            confira produtos e
            acompanhe as entradas
            de mercadoria.
          </p>
        </div>

        <button
          type="button"
          className="primary-button"
          onClick={
            abrirImportacao
          }
        >
          IMPORTAR NOTA FISCAL
        </button>
      </div>

      <CustoRealCompras onConfirmada={async (id) => { await Promise.all([carregarNotas(),carregarProdutos()]); await abrirNota(id); }}/>

      {mensagem && (
        <div className="success-message">
          {mensagem}
        </div>
      )}

      {erro && (
        <div className="error-message">
          {erro}
        </div>
      )}

      {/* INDICADORES */}

      <section className="compras-indicadores">
        <div className="compra-indicador-card">
          <div className="compra-indicador-icone">
            NF
          </div>

          <div>
            <span>
              Notas importadas
            </span>

            <strong>
              {indicadores.total}
            </strong>

            <small>
              NF-e registradas
            </small>
          </div>
        </div>

        <div className="compra-indicador-card">
          <div className="compra-indicador-icone alerta">
            !
          </div>

          <div>
            <span>
              Pendentes
            </span>

            <strong>
              {indicadores.pendentes}
            </strong>

            <small>
              aguardando conferência
            </small>
          </div>
        </div>

        <div className="compra-indicador-card">
          <div className="compra-indicador-icone sucesso">
            ✓
          </div>

          <div>
            <span>
              Efetivadas
            </span>

            <strong>
              {indicadores.efetivadas}
            </strong>

            <small>
              entradas concluídas
            </small>
          </div>
        </div>

        <div className="compra-indicador-card">
          <div className="compra-indicador-icone perigo">
            ?
          </div>

          <div>
            <span>
              Itens sem vínculo
            </span>

            <strong>
              {indicadores.itensPendentes}
            </strong>

            <small>
              precisam de conferência
            </small>
          </div>
        </div>

        <div className="compra-indicador-card">
          <div className="compra-indicador-icone">
            R$
          </div>

          <div>
            <span>
              Valor das notas
            </span>

            <strong>
              {formatarDinheiro(
                indicadores.valorNotas
              )}
            </strong>

            <small>
              total importado
            </small>
          </div>
        </div>
      </section>

      {/* IMPORTAÇÃO */}

      {mostrandoImportacao && (
        <section className="compra-importacao-card">
          <div className="compra-importacao-header">
            <div>
              <h2>
                Importar NF-e
              </h2>

              <p>
                Selecione o XML,
                a unidade e o local
                que receberá os produtos.
              </p>
            </div>

            <button
              type="button"
              className="secondary-button"
              onClick={
                fecharImportacao
              }
            >
              Fechar
            </button>
          </div>

          <div className="compra-upload-area">
            <input
              id="arquivo-nfe"
              type="file"
              accept=".xml,text/xml,application/xml"
              onChange={
                selecionarArquivo
              }
            />

            <label
              htmlFor="arquivo-nfe"
              className="compra-upload-label"
            >
              <div className="compra-upload-icone">
                XML
              </div>

              <strong>
                {arquivo
                  ? arquivo.name
                  : 'Selecionar arquivo XML'}
              </strong>

              <span>
                Clique para escolher
                uma NF-e no computador.
              </span>
            </label>
          </div>

          <div className="form-grid compra-destino-grid">
            <div>
              <label>
                Unidade de entrada
              </label>

              <input value={lojaAtiva?.nome || ''} readOnly aria-label="Mercado selecionado" />
            </div>

            <div>
              <label>
                Local de entrada
              </label>

              <select
                value={localId}
                disabled={
                  !lojaId
                }
                onChange={(
                  event
                ) =>
                  setLocalId(
                    event.target
                      .value
                  )
                }
              >
                <option value="">
                  Selecione
                </option>

                {locais.map(
                  (local) => (
                    <option
                      key={
                        local.id
                      }
                      value={
                        local.id
                      }
                    >
                      {local.nome}
                      {' — '}
                      {local.tipo}
                    </option>
                  )
                )}
              </select>
            </div>
          </div>

          {arquivo && (
            <div className="compra-arquivo-resumo">
              <div>
                <span>
                  Arquivo
                </span>

                <strong>
                  {arquivo.name}
                </strong>
              </div>

              <div>
                <span>
                  Tamanho
                </span>

                <strong>
                  {(
                    arquivo.size /
                    1024
                  ).toFixed(
                    1
                  )}{' '}
                  KB
                </strong>
              </div>

              <div>
                <span>
                  Unidade
                </span>

                <strong>
                  {lojaId
                    ? lojas.find(
                        (loja) =>
                          loja.id ===
                          Number(
                            lojaId
                          )
                      )?.nome ||
                      'Selecionada'
                    : 'Pendente'}
                </strong>
              </div>

              <div>
                <span>
                  Local
                </span>

                <strong>
                  {localId
                    ? locais.find(
                        (local) =>
                          local.id ===
                          Number(
                            localId
                          )
                      )?.nome ||
                      'Selecionado'
                    : 'Pendente'}
                </strong>
              </div>
            </div>
          )}

          {!podeImportar && (
            <div className="compra-importacao-aviso">
              {!arquivo
                ? 'Selecione o arquivo XML.'
                : !lojaId
                ? 'Selecione a unidade de entrada.'
                : !localId
                ? 'Selecione o local de entrada.'
                : 'Aguarde.'}
            </div>
          )}

          <div className="form-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={
                fecharImportacao
              }
            >
              Cancelar
            </button>

            <button
              type="button"
              className="primary-button"
              disabled={
                !podeImportar
              }
              onClick={
                importarXml
              }
            >
              {importando
                ? 'Importando XML...'
                : 'Importar e Conferir'}
            </button>
          </div>
        </section>
      )}

      {/* CONFERÊNCIA */}

      {conferencia && (
        <section className="compra-conferencia">
          <div className="compra-conferencia-header">
            <div>
              <span className="compra-etapa">
                {String(conferencia.nota.chaveNfe || '').startsWith('CONFERENCIA:') ? 'Conferência da entrada' : 'Conferência da NF-e'}
              </span>

              <h2>
                {String(conferencia.nota.chaveNfe || '').startsWith('CONFERENCIA:') ? 'Entrada conferida nº ' : 'NF-e nº '}
                {conferencia.nota
                  .numeroNota ||
                  '-'}
              </h2>

              <p>
                Confira os dados antes
                da entrada no estoque.
              </p>
            </div>

            <span
              className={`nota-status ${
                String(
                  conferencia.nota
                    .status ||
                    'PENDENTE'
                ).toLowerCase()
              }`}
            >
              {conferencia.nota
                .status ||
                'PENDENTE'}
            </span>
          </div>

          {/* FORNECEDOR */}

          <div className="compra-fornecedor-card">
            <div className="compra-fornecedor-avatar">
              F
            </div>

            <div className="compra-fornecedor-dados">
              <span>
                Fornecedor
              </span>

              <strong>
                {conferencia
                  .fornecedor
                  .nomeFantasia ||
                  conferencia
                    .fornecedor
                    .razaoSocial ||
                  '-'}
              </strong>

              <small>
                {conferencia
                  .fornecedor
                  .razaoSocial ||
                  ''}
              </small>
            </div>

            <div className="compra-fornecedor-documento">
              <span>
                CPF/CNPJ
              </span>

              <strong>
                {formatarDocumento(
                  conferencia
                    .fornecedor
                    .cpfCnpj
                )}
              </strong>
            </div>

            {conferencia.cadastradoAutomaticamente && (
              <span className="fornecedor-auto-badge">
                Cadastrado automaticamente
              </span>
            )}
          </div>

          {/* RESUMO */}

          <div className="compra-nota-resumo-grid">
            <div>
              <span>
                Emissão
              </span>

              <strong>
                {formatarData(
                  conferencia.nota
                    .dataEmissao
                )}
              </strong>
            </div>

            <div>
              <span>
                Série
              </span>

              <strong>
                {conferencia.nota
                  .serie ||
                  '-'}
              </strong>
            </div>

            <div>
              <span>
                Itens
              </span>

              <strong>
                {conferencia.nota
                  .quantidadeItens ||
                  conferencia.itens
                    .length}
              </strong>
            </div>

            <div>
              <span>
                Valor produtos
              </span>

              <strong>
                {formatarDinheiro(
                  conferencia.nota
                    .valorProdutos
                )}
              </strong>
            </div>

            <div>
              <span>
                Valor total
              </span>

              <strong>
                {formatarDinheiro(
                  conferencia.nota
                    .valorTotal
                )}
              </strong>
            </div>
          </div>

          {/* ITENS */}

          <div className="compra-itens-header">
            <div>
              <h3>
                Produtos da NF-e
              </h3>

              <p>
                Produtos encontrados
                pelo EAN são vinculados
                automaticamente.
              </p>
            </div>
          </div>

          <div className="compra-itens-table-wrap">
            <table className="compra-itens-table mobile-record-table">
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">
                    Produto da NF-e
                  </th>
                  <th scope="col">EAN</th>
                  <th scope="col">NCM</th>
                  <th scope="col">CFOP</th>
                  <th scope="col">Qtd.</th>
                  <th scope="col">
                    Custo unit.
                  </th>
                  <th scope="col">Total</th>
                  <th scope="col">
                    Produto no sistema
                  </th>
                  <th scope="col">Status</th>
                </tr>
              </thead>

              <tbody>
                {conferencia.itens.map(
                  (
                    item: ItemImportado,
                    indice: number
                  ) => {
                    const produtoId =
                      obterProdutoId(
                        item
                      );

                    const status =
                      obterStatusVinculo(
                        item
                      );

                    return (
                      <tr
                        key={
                          item.id ||
                          `${indice}-${item.ean}`
                        }
                      >
                        <td data-label="#">
                          {obterNumeroItem(
                            item
                          )}
                        </td>

                        <td data-label="Produto da NF-e">
                          <div className="compra-item-produto">
                            <strong>
                              {
                                item.descricao
                              }
                            </strong>

                            <span>
                              Código fornecedor:{' '}
                              {obterCodigoFornecedor(
                                item
                              )}
                            </span>
                          </div>
                        </td>

                        <td data-label="EAN">
                          {item.ean ||
                            'Sem GTIN'}
                        </td>

                        <td data-label="NCM">
                          {item.ncm ||
                            '-'}
                        </td>

                        <td data-label="CFOP">
                          {item.cfop ||
                            '-'}
                        </td>

                        <td data-label="Qtd.">
                          <strong>
                            {
                              item.quantidade
                            }
                          </strong>{' '}
                          {item.unidade ||
                            ''}
                        </td>

                        <td data-label="Custo unit.">
                          {formatarDinheiro(
                            obterValorUnitario(
                              item
                            )
                          )}
                        </td>

                        <td data-label="Total">
                          <strong>
                            {formatarDinheiro(
                              obterValorTotal(
                                item
                              )
                            )}
                          </strong>
                        </td>

                        <td data-label="Produto no sistema">
                          {produtoId ? (
                            <div className="produto-vinculado-info">
                              <strong>
                                {item.produto_local ||
                                  produtos.find(
                                    (
                                      produto
                                    ) =>
                                      produto.id ===
                                      produtoId
                                  )?.nome ||
                                  `Produto #${produtoId}`}
                              </strong>

                              <span>
                                Produto vinculado
                              </span>
                            </div>
                          ) : (
                            <select
                              className="compra-vinculo-select"
                              defaultValue=""
                              onChange={(
                                event
                              ) => {
                                if (
                                  !item.id
                                ) {
                                  setErro(
                                    'Abra a NF-e salva para vincular o item.'
                                  );

                                  return;
                                }

                                vincularProduto(
                                  item.id,
                                  event.target
                                    .value
                                );
                              }}
                            >
                              <option value="">
                                Selecionar produto...
                              </option>

                              {produtos.map(
                                (
                                  produto
                                ) => (
                                  <option
                                    key={
                                      produto.id
                                    }
                                    value={
                                      produto.id
                                    }
                                  >
                                    {
                                      produto.nome
                                    }
                                    {' — '}
                                    {
                                      produto.ean
                                    }
                                  </option>
                                )
                              )}
                            </select>
                          )}
                        </td>

                        <td data-label="Status">
                          <span
                            className={`compra-vinculo-status ${
                              status ===
                              'VINCULADO'
                                ? 'vinculado'
                                : 'pendente'
                            }`}
                          >
                            {status ===
                            'VINCULADO'
                              ? 'Vinculado'
                              : 'Pendente'}
                          </span>
                        </td>
                      </tr>
                    );
                  }
                )}
              </tbody>
            </table>
          </div>

          {/* PARCELAS */}

          {conferencia.parcelas
            .length > 0 && (
            <div className="compra-parcelas">
              <h3>
                Parcelas
              </h3>

              <div className="compra-parcelas-grid">
                {conferencia.parcelas.map(
                  (
                    parcela: Parcela,
                    indice: number
                  ) => (
                    <div
                      className="compra-parcela-card"
                      key={
                        parcela.id ||
                        indice
                      }
                    >
                      <span>
                        Parcela{' '}
                        {parcela.numero_parcela ||
                          parcela.numeroParcela ||
                          indice +
                            1}
                      </span>

                      <strong>
                        {formatarDinheiro(
                          parcela.valor
                        )}
                      </strong>

                      <small>
                        Vencimento:{' '}
                        {formatarData(
                          parcela.vencimento
                        )}
                      </small>
                    </div>
                  )
                )}
              </div>
            </div>
          )}

          {/* EFETIVAÇÃO */}

          <div className="compra-conferencia-actions">
            <div
              className={`compra-alerta-estoque ${
                String(
                  conferencia.nota
                    .status ||
                    ''
                ).toUpperCase() ===
                'EFETIVADA'
                  ? 'efetivada'
                  : ''
              }`}
            >
              {String(
                conferencia.nota
                  .status ||
                  ''
              ).toUpperCase() ===
              'EFETIVADA' ? (
                <>
                  <strong>
                    ✓ Entrada efetivada
                  </strong>

                  <span>
                    Os produtos desta
                    NF-e já foram
                    lançados no estoque.
                  </span>
                </>
              ) : conferencia.itens.some(
                  (item: ItemImportado) =>
                    !obterProdutoId(
                      item
                    )
                ) ? (
                <>
                  <strong>
                    Existem produtos
                    pendentes
                  </strong>

                  <span>
                    Vincule todos os
                    produtos antes de
                    efetivar.
                  </span>
                </>
              ) : (
                <>
                  <strong>
                    NF-e pronta para
                    entrada
                  </strong>

                  <span>
                    Todos os produtos
                    estão vinculados.
                  </span>
                </>
              )}
            </div>

            <button
              type="button"
              className="primary-button"
              onClick={
                efetivarEntrada
              }
              disabled={
                importando ||
                String(
                  conferencia.nota
                    .status ||
                    ''
                ).toUpperCase() ===
                  'EFETIVADA' ||
                conferencia.itens.some(
                  (item: ItemImportado) =>
                    !obterProdutoId(
                      item
                    )
                )
              }
            >
              {importando
                ? 'Efetivando...'
                : String(
                    conferencia.nota
                      .status ||
                      ''
                  ).toUpperCase() ===
                  'EFETIVADA'
                ? 'Entrada Efetivada'
                : conferencia.itens.some(
                    (item: ItemImportado) =>
                      !obterProdutoId(
                        item
                      )
                  )
                ? 'Vincule os Produtos'
                : 'Efetivar Entrada'}
            </button>
          </div>
        </section>
      )}

      {/* FILTROS */}

      <ResponsiveFilters activeCount={[busca, statusFiltro].filter(Boolean).length} onClear={() => { setBusca(''); setStatusFiltro(''); }}><section className="compras-filtros-card">
        <div className="compras-filtros-header">
          <div>
            <h3>
              Notas de entrada
            </h3>

            <p>
              Histórico de NF-e
              importadas.
            </p>
          </div>

          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              setBusca('');
              setStatusFiltro('');
            }}
          >
            Limpar filtros
          </button>
        </div>

        <div className="compras-filtros">
          <div
            className="compras-busca"
            style={{
              position:
                'relative',
              zIndex:
                buscaEmFoco
                  ? 50
                  : 'auto',
            }}
          >
            <span>⌕</span>

            <input
              value={busca}
              autoComplete="off"
              onFocus={() =>
                setBuscaEmFoco(
                  true
                )
              }
              onBlur={() => {
                window.setTimeout(
                  () =>
                    setBuscaEmFoco(
                      false
                    ),
                  150
                );
              }}
              onChange={(
                event
              ) =>
                setBusca(
                  event.target
                    .value
                )
              }
              placeholder="Buscar NF-e ou fornecedor cadastrado..."
            />

            {buscaEmFoco &&
              busca.trim() &&
              (
                fornecedoresSugeridos.length >
                  0 ||
                notasFiltradas.length ===
                  0
              ) && (
                <div
                  style={{
                    position:
                      'absolute',
                    top:
                      'calc(100% + 6px)',
                    left: 0,
                    right: 0,
                    zIndex: 99999,
                    background:
                      '#ffffff',
                    border:
                      '1px solid #dedede',
                    borderRadius: 10,
                    boxShadow:
                      '0 12px 30px rgba(0,0,0,.15)',
                    padding: 6,
                    maxHeight: 300,
                    overflowY:
                      'auto',
                  }}
                >
                  {fornecedoresSugeridos.length >
                  0 ? (
                    <>
                      <div
                        style={{
                          padding:
                            '8px 10px 6px',
                          fontSize:
                            11,
                          fontWeight:
                            700,
                          color:
                            '#777',
                          textTransform:
                            'uppercase',
                        }}
                      >
                        Fornecedores cadastrados
                      </div>

                      {fornecedoresSugeridos.map(
                        (
                          fornecedor
                        ) => {
                          const nome =
                            nomeFornecedorSistema(
                              fornecedor
                            );

                          const possuiNota =
                            notas.some(
                              (
                                nota
                              ) =>
                                normalizarPesquisa(
                                  nota.fornecedor
                                ).includes(
                                  normalizarPesquisa(
                                    nome
                                  )
                                ) ||
                                (
                                  fornecedor.cpf_cnpj &&
                                  normalizarPesquisa(
                                    nota.cpf_cnpj
                                  ).includes(
                                    normalizarPesquisa(
                                      fornecedor.cpf_cnpj
                                    )
                                  )
                                )
                            );

                          return (
                            <button
                              type="button"
                              key={
                                fornecedor.id
                              }
                              onMouseDown={(
                                event
                              ) => {
                                event.preventDefault();

                                setBusca(
                                  nome
                                );

                                setBuscaEmFoco(
                                  false
                                );
                              }}
                              style={{
                                width:
                                  '100%',
                                display:
                                  'flex',
                                flexDirection:
                                  'column',
                                alignItems:
                                  'flex-start',
                                gap: 2,
                                padding:
                                  '10px 12px',
                                border: 0,
                                borderRadius: 8,
                                background:
                                  '#fff',
                                cursor:
                                  'pointer',
                                textAlign:
                                  'left',
                              }}
                              onMouseEnter={(
                                event
                              ) => {
                                event.currentTarget.style.background =
                                  '#fff4ea';
                              }}
                              onMouseLeave={(
                                event
                              ) => {
                                event.currentTarget.style.background =
                                  '#fff';
                              }}
                            >
                              <strong>
                                {nome}
                              </strong>

                              {fornecedor.razao_social &&
                                fornecedor.razao_social !==
                                  nome && (
                                  <span>
                                    {
                                      fornecedor.razao_social
                                    }
                                  </span>
                                )}

                              <small
                                style={{
                                  color:
                                    '#777',
                                }}
                              >
                                {fornecedor.cpf_cnpj
                                  ? formatarDocumento(
                                      fornecedor.cpf_cnpj
                                    )
                                  : 'Sem CNPJ informado'}
                                {' • '}
                                {possuiNota
                                  ? 'Com NF-e importada'
                                  : 'Fornecedor cadastrado — ainda sem NF-e importada'}
                              </small>
                            </button>
                          );
                        }
                      )}
                    </>
                  ) : (
                    <div
                      style={{
                        padding:
                          '10px 12px',
                        color:
                          '#777',
                        fontSize:
                          12,
                      }}
                    >
                      Nenhum fornecedor cadastrado encontrado.
                    </div>
                  )}
                </div>
              )}
          </div>

          <div>
            <label>
              Status
            </label>

            <select
              value={
                statusFiltro
              }
              onChange={(
                event
              ) =>
                setStatusFiltro(
                  event.target
                    .value
                )
              }
            >
              <option value="">
                Todos
              </option>

              <option value="PENDENTE">
                Pendente
              </option>

              <option value="EFETIVADA">
                Efetivada
              </option>

              <option value="CANCELADA">
                Cancelada
              </option>
            </select>
          </div>
        </div>
      </section></ResponsiveFilters>

      <div className="compras-lista-info">
        <span>
          <strong>
            {
              notasFiltradas.length
            }
          </strong>{' '}
          nota(s) encontrada(s)
        </span>
      </div>

      {/* TABELA */}

      <div className="compras-table">
        <table className="mobile-record-table">
          <thead>
            <tr>
              <th scope="col">NF-e</th>
              <th scope="col">
                Fornecedor
              </th>
              <th scope="col">Emissão</th>
              <th scope="col">Unidade</th>
              <th scope="col">Itens</th>
              <th scope="col">
                Pendências
              </th>
              <th scope="col">Total</th>
              <th scope="col">Status</th>
              <th scope="col">
                Importada em
              </th>
              <th scope="col">Ações</th>
            </tr>
          </thead>

          <tbody>
            {carregando ? (
              <tr>
                <td
                  colSpan={10}
                  className="empty-table"
                >
                  Carregando notas...
                </td>
              </tr>
            ) : notasFiltradas
                .length === 0 ? (
              <tr>
                <td
                  colSpan={10}
                  className="empty-table"
                >
                  {fornecedoresSugeridos.length > 0
                    ? 'Fornecedor encontrado no cadastro, mas nenhuma NF-e importada corresponde à pesquisa.'
                    : 'Nenhuma NF-e encontrada.'}
                </td>
              </tr>
            ) : (
              notasFiltradas.map(
                (nota) => (
                  <tr
                    key={
                      nota.id
                    }
                  >
                    <td data-label="NF-e">
                      <div className="compra-nota-identificacao">
                        <strong>
                          Nº{' '}
                          {nota.numero_nota ||
                            '-'}
                        </strong>

                        <span>{nota.chave_nfe.startsWith('CONFERENCIA:') ? 'Entrada conferida — sem XML' : `Série ${nota.serie || '-'}`}</span>
                      </div>
                    </td>

                    <td data-label="Fornecedor">
                      <div className="compra-fornecedor-lista">
                        <strong>
                          {
                            nota.fornecedor
                          }
                        </strong>

                        <span>
                          {formatarDocumento(
                            nota.cpf_cnpj
                          )}
                        </span>
                      </div>
                    </td>

                    <td data-label="Emissão">
                      {formatarData(
                        nota.data_emissao
                      )}
                    </td>

                    <td data-label="Unidade">
                      <div className="compra-unidade-lista">
                        <strong>
                          {nota.loja ||
                            '-'}
                        </strong>

                        <span>
                          {nota.local_estoque ||
                            '-'}
                        </span>
                      </div>
                    </td>

                    <td data-label="Itens">
                      {Number(
                        nota.quantidade_itens ||
                          0
                      )}
                    </td>

                    <td data-label="Pendências">
                      {Number(
                        nota.itens_pendentes ||
                          0
                      ) > 0 ? (
                        <span className="nota-pendencias-badge">
                          {
                            nota.itens_pendentes
                          }{' '}
                          pendente(s)
                        </span>
                      ) : (
                        <span className="nota-sem-pendencias">
                          ✓ Conferida
                        </span>
                      )}
                    </td>

                    <td data-label="Total">
                      <strong>
                        {formatarDinheiro(
                          nota.valor_total
                        )}
                      </strong>
                    </td>

                    <td data-label="Status">
                      <span
                        className={`nota-status ${
                          nota.status
                            ?.toLowerCase() ||
                          ''
                        }`}
                      >
                        {
                          nota.status
                        }
                      </span>
                    </td>

                    <td data-label="Importada em">
                      {formatarDataHora(
                        nota.importado_em
                      )}
                    </td>

                    <td data-label="Ações">
                      <button
                        type="button"
                        className="editar-button"
                        disabled={
                          carregandoNota
                        }
                        onClick={() =>
                          abrirNota(
                            nota.id
                          )
                        }
                      >
                        Conferir
                      </button>
                    </td>
                  </tr>
                )
              )
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
