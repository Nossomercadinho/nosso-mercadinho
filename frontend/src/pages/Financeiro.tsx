import {useDadosCompartilhados} from '../hooks/useDadosCompartilhados';
import { apiFetch, sincronizarFechamentosFinanceiro } from '../services/apiClient';
import ResponsiveFilters from '../components/ResponsiveFilters';
import { useLoja } from '../contexts/LojaContext';
import {
  useEffect,
  useMemo,
  useState,
} from 'react';

import type { FormEvent } from 'react';

import './Financeiro.css';
import CampoPesquisa from '../components/CampoPesquisa';

const API = '/api';

/*
|--------------------------------------------------------------------------
| TIPOS
|--------------------------------------------------------------------------
*/

type Usuario = {
  id: number;
  nome: string;
  perfil?: string;
  permissoes?: string[];
};

type Loja = {
  id: number;
  nome: string;
};

type Fornecedor = {
  id: number;
  razao_social?: string;
  nome_fantasia?: string;
  cpf_cnpj?: string;
  telefone?: string;
  email?: string;
};

type Categoria = {
  id: number;
  nome: string;
  tipo: string;
};

type Resumo = {
  saldoMes: number;
  entradasMes: number;
  saidasMes: number;
  aPagar: number;
  aReceber: number;
  atrasados: number;
  venceHoje: number;
  proximos7Dias: number;
};

type Lancamento = {
  id: number;

  tipo: 'ENTRADA' | 'SAIDA';

  descricao: string;

  numero_documento?: string | null;

  valor_original: number;

  data_vencimento: string;

  status: string;

  status_visual?: string;

  fornecedor_id?: number | null;

  fornecedor_razao_social?: string | null;

  fornecedor_nome_fantasia?: string | null;

  fornecedor_cpf_cnpj?: string | null;

  loja_nome?: string | null;

  categoria_nome?: string | null;

  usuario_nome?: string | null;

  observacao?: string | null;

  valor_baixado?: number;

  data_emissao?: string | null;
  forma_pagamento?: string | null;
};

type VencimentoProgramado = {
  id: number;
  data: string;
  valor: string;
  numeroDocumento: string;
};

type ResultadoBoleto = {
  tipo: string;

  codigoOriginal: string;

  codigoNumerico: string;

  bancoCodigo?: string | null;

  valor?: number | null;

  vencimento?: string | null;

  codigoBarras?: string | null;

  mensagem?: string;
};

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

function moeda(valor: any) {
  return Number(valor || 0).toLocaleString(
    'pt-BR',
    {
      style: 'currency',
      currency: 'BRL',
    }
  );
}

function formatarCampoMoeda(valor: string | number) {
  const numeros = String(valor ?? '').replace(/\D/g, '');

  if (!numeros) {
    return '';
  }

  const numero = Number(numeros) / 100;

  return numero.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function valorCampoParaNumero(valor: string) {
  const texto = String(valor || '')
    .replace(/\./g, '')
    .replace(',', '.');

  const numero = Number(texto);

  return Number.isFinite(numero)
    ? numero
    : 0;
}

function dataBR(data?: string | null) {
  if (!data) {
    return '-';
  }

  const partes =
    String(data).split('-');

  if (partes.length !== 3) {
    return data;
  }

  return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

function hojeISO() {
  const hoje =
    new Date();

  const ano =
    hoje.getFullYear();

  const mes =
    String(
      hoje.getMonth() + 1
    ).padStart(2, '0');

  const dia =
    String(
      hoje.getDate()
    ).padStart(2, '0');

  return `${ano}-${mes}-${dia}`;
}

function nomeFornecedor(
  fornecedor?: Fornecedor | null
) {
  if (!fornecedor) {
    return 'Fornecedor';
  }

  return (
    fornecedor.razao_social ||
    fornecedor.nome_fantasia ||
    'Fornecedor'
  );
}

function normalizarPesquisa(valor: any) {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .trim();
}

function ehFechamentoCaixa(lancamento: Lancamento) {
  return String(lancamento.descricao || '')
    .trim()
    .toUpperCase()
    .startsWith('FECHAMENTO DE CAIXA');
}

function tipoVisualLancamento(lancamento: Lancamento): 'ENTRADA' | 'SAIDA' {
  return ehFechamentoCaixa(lancamento) || lancamento.tipo === 'ENTRADA' ? 'ENTRADA' : 'SAIDA';
}

/*
|--------------------------------------------------------------------------
| COMPONENTE
|--------------------------------------------------------------------------
*/

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

export default function Financeiro() {
  const { lojaAtiva } = useLoja();
  const idLojaAtiva = lojaAtiva ? String(lojaAtiva.id) : '';
  const usuario =
    useMemo<Usuario | null>(() => {
      try {
        const salvo =
          localStorage.getItem(
            'usuarioLogado'
          );

        return salvo
          ? JSON.parse(salvo)
          : null;
      } catch {
        return null;
      }
    }, []);

  const acessoGerencial =
    Boolean(usuario?.permissoes?.includes('financeiro'));

  const acessoOperacional =
    acessoGerencial ||
    Boolean(usuario?.permissoes?.includes('contas'));

  const ehCaixa =
    !acessoOperacional && Boolean(usuario?.permissoes?.includes('fechamento'));

  const podeEditarFechamento =
    acessoGerencial || Boolean(usuario?.permissoes?.includes('fechamento'));

  const [
    fechamentoEditando,
    setFechamentoEditando,
  ] = useState<Lancamento | null>(
    null
  );

  const [
    edicaoDataFechamento,
    setEdicaoDataFechamento,
  ] = useState('');

  const [
    edicaoValorEspecie,
    setEdicaoValorEspecie,
  ] = useState('');

  const [
    edicaoValorMaquininhas,
    setEdicaoValorMaquininhas,
  ] = useState('');

  const [
    salvandoEdicaoFechamento,
    setSalvandoEdicaoFechamento,
  ] = useState(false);

  const [
    lancamentoSaidaEditando,
    setLancamentoSaidaEditando,
  ] = useState<Lancamento | null>(
    null
  );

  const [
    edicaoFornecedorId,
    setEdicaoFornecedorId,
  ] = useState('');

  const [
    edicaoLojaId,
    setEdicaoLojaId,
  ] = useState('');

  const [
    edicaoCategoriaId,
    setEdicaoCategoriaId,
  ] = useState('');

  const [
    edicaoDescricao,
    setEdicaoDescricao,
  ] = useState('');

  const [
    edicaoNumeroDocumento,
    setEdicaoNumeroDocumento,
  ] = useState('');

  const [
    edicaoValorOriginal,
    setEdicaoValorOriginal,
  ] = useState('');

  const [
    edicaoDataEmissao,
    setEdicaoDataEmissao,
  ] = useState('');

  const [
    edicaoDataVencimento,
    setEdicaoDataVencimento,
  ] = useState('');

  const [
    edicaoFormaPagamento,
    setEdicaoFormaPagamento,
  ] = useState('');

  const [
    edicaoObservacao,
    setEdicaoObservacao,
  ] = useState('');

  const [
    salvandoEdicaoSaida,
    setSalvandoEdicaoSaida,
  ] = useState(false);

  /*
  |--------------------------------------------------------------------------
  | DADOS GERAIS
  |--------------------------------------------------------------------------
  */

  const [
    lojas,
    setLojas,
  ] = useState<Loja[]>([]);

  const [
    fornecedores,
    setFornecedores,
  ] = useState<Fornecedor[]>([]);

  const [
    categorias,
    setCategorias,
  ] = useState<Categoria[]>([]);

  const [
    lancamentos,
    setLancamentos,
  ] = useState<Lancamento[]>([]);

  const [
    _resumo,
    setResumo,
  ] = useState<Resumo>({
    saldoMes: 0,
    entradasMes: 0,
    saidasMes: 0,
    aPagar: 0,
    aReceber: 0,
    atrasados: 0,
    venceHoje: 0,
    proximos7Dias: 0,
  });

  /*
  |--------------------------------------------------------------------------
  | INTERFACE
  |--------------------------------------------------------------------------
  */

  const [
    mostrarNovo,
    setMostrarNovo,
  ] = useState(false);

  const [
    carregando,
    setCarregando,
  ] = useState(true);

  const [
    salvando,
    setSalvando,
  ] = useState(false);

  const [
    lendoBoleto,
    setLendoBoleto,
  ] = useState(false);

  const [
    mensagem,
    setMensagem,
  ] = useState('');

  const [
    erro,
    setErro,
  ] = useState('');

  /*
  |--------------------------------------------------------------------------
  | FILTROS
  |--------------------------------------------------------------------------
  */

  const [
    busca,
    setBusca,
  ] = useState('');

  const [
    filtroStatus,
    setFiltroStatus,
  ] = useState('');

  const [
    filtroTipo,
    setFiltroTipo,
  ] = useState('');


  const lancamentosFiltrados =
    useMemo(() => {
      const texto =
        normalizarPesquisa(busca);

      return lancamentos.filter(
        (lancamento) => {
          const conteudoPesquisavel =
            [
              lancamento.fornecedor_nome_fantasia,
              lancamento.fornecedor_razao_social,
              lancamento.fornecedor_cpf_cnpj,
              lancamento.descricao,
              lancamento.numero_documento,
              lancamento.loja_nome,
              lancamento.categoria_nome,
              lancamento.status_visual,
              lancamento.status,
              lancamento.usuario_nome,
              lancamento.observacao,
              lancamento.valor_original,
              dataBR(
                lancamento.data_vencimento
              ),
            ]
              .filter(
                (valor) =>
                  valor !== null &&
                  valor !== undefined
              )
              .map(normalizarPesquisa)
              .join(' ');

          const correspondeBusca =
            !texto ||
            conteudoPesquisavel.includes(
              texto
            );

          const correspondeTipo =
            !filtroTipo ||
            tipoVisualLancamento(lancamento) ===
              filtroTipo;

          const statusAtual =
            String(
              lancamento.status_visual ||
              lancamento.status ||
              ''
            ).toUpperCase();

          const correspondeStatus =
            !filtroStatus ||
            statusAtual ===
              filtroStatus;

          return (
            correspondeBusca &&
            correspondeTipo &&
            correspondeStatus
          );
        }
      );
    }, [
      lancamentos,
      busca,
      filtroTipo,
      filtroStatus,
    ]);

  const resumoVisual = useMemo(() => {
    const entradas = lancamentosFiltrados
      .filter((item) => tipoVisualLancamento(item) === 'ENTRADA')
      .reduce((total, item) => total + Number(item.valor_original || 0), 0);

    const saidas = lancamentosFiltrados
      .filter((item) => tipoVisualLancamento(item) === 'SAIDA')
      .reduce((total, item) => total + Number(item.valor_original || 0), 0);

    return {
      entradas,
      saidas,
      saldo: entradas - saidas,
      quantidadeEntradas: lancamentosFiltrados.filter(
        (item) => tipoVisualLancamento(item) === 'ENTRADA'
      ).length,
      quantidadeSaidas: lancamentosFiltrados.filter(
        (item) => tipoVisualLancamento(item) === 'SAIDA'
      ).length,
      quantidade: lancamentosFiltrados.length,
    };
  }, [lancamentosFiltrados]);

  /*
  |--------------------------------------------------------------------------
  | FECHAMENTO DIÁRIO DO MERCADO ATIVO
  |--------------------------------------------------------------------------
  */

  const [
    mostrarFechamento,
    setMostrarFechamento,
  ] = useState(false);

  const [
    dataFechamento,
    setDataFechamento,
  ] = useState(hojeISO());

  const [
    valorEspecie,
    setValorEspecie,
  ] = useState('');

  const [
    valorMaquininhas,
    setValorMaquininhas,
  ] = useState('');

  const [
    salvandoFechamento,
    setSalvandoFechamento,
  ] = useState(false);

  const lojaSelecionadaFechamento = useMemo(() => lojas.find((loja) => loja.id === lojaAtiva?.id) || lojaAtiva, [lojas, lojaAtiva]);
  const lojaFechamento = lojaSelecionadaFechamento;
  const fechamentoCondominio = false;

  const totalFechamento =
    (fechamentoCondominio ? 0 : Number(valorEspecie || 0)) +
    Number(valorMaquininhas || 0);

  /*
  |--------------------------------------------------------------------------
  | FORMULÁRIO
  |--------------------------------------------------------------------------
  */

  const [
    tipo,
    setTipo,
  ] = useState<'ENTRADA' | 'SAIDA'>(
    'SAIDA'
  );

  const [
    fornecedorId,
    setFornecedorId,
  ] = useState('');

  const [
    fornecedorBusca,
    setFornecedorBusca,
  ] = useState('');

  const [
    mostrarSugestoes,
    setMostrarSugestoes,
  ] = useState(false);

  const [
    categoriaId,
    setCategoriaId,
  ] = useState('');

  const [
    lojaId,
    setLojaId,
  ] = useState(idLojaAtiva);

  const [
    descricao,
    setDescricao,
  ] = useState('');

  const [
    numeroDocumento,
    setNumeroDocumento,
  ] = useState('');

  const [
    valorOriginal,
    setValorOriginal,
  ] = useState('');

  const [
    dataEmissao,
    setDataEmissao,
  ] = useState(
    hojeISO()
  );

  const [
    dataVencimento,
    setDataVencimento,
  ] = useState('');

  const [
    vencimentosAdicionais,
    setVencimentosAdicionais,
  ] = useState<VencimentoProgramado[]>([]);

  const [
    formaPagamento,
    setFormaPagamento,
  ] = useState('Boleto');

  const [
    observacao,
    setObservacao,
  ] = useState('');

  /*
  |--------------------------------------------------------------------------
  | BOLETO
  |--------------------------------------------------------------------------
  */

  const [
    codigoBoleto,
    setCodigoBoleto,
  ] = useState('');

  const [
    boletoLido,
    setBoletoLido,
  ] = useState<ResultadoBoleto | null>(
    null
  );

  /*
  |--------------------------------------------------------------------------
  | INICIALIZAÇÃO
  |--------------------------------------------------------------------------
  */

  useDadosCompartilhados(()=>recarregarDadosFinanceiros());

  useEffect(() => {
    carregarTudo();
  }, []);

  useEffect(() => {
    if (acessoOperacional) {
      carregarCategorias();
    }
  }, [tipo, acessoOperacional]);

  /*
  |--------------------------------------------------------------------------
  | CARREGAMENTOS
  |--------------------------------------------------------------------------
  */

  async function carregarTudo() {
    if (!acessoOperacional && !ehCaixa) {
      setCarregando(false);
      return;
    }
    setCarregando(true);

    try {
      if (ehCaixa) {
        await carregarLojas();
        return;
      }

      if (lojaAtiva) {
        const sincronizacao = await sincronizarFechamentosFinanceiro(lojaAtiva.id);
        if (sincronizacao.conflitos.length) setErro('Há fechamentos com valores diferentes já lançados no Financeiro. Confira as datas antes de alterar.');
      }

      const tarefas = [
        carregarLojas(),
        carregarFornecedores(),
        carregarLancamentos(),
      ];

      if (acessoGerencial) {
        tarefas.push(carregarResumo());
      }

      await Promise.all(tarefas);
    } catch (error: any) {
      setErro(error?.message || 'Não foi possível atualizar o Financeiro.');
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
      console.error(error);
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
        console.error(
          'Erro ao carregar fornecedores:',
          dados
        );
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
        lista
      );
    } catch (error) {
      console.error(
        'Erro ao carregar fornecedores:',
        error
      );
      setFornecedores([]);
    }
  }

  async function carregarCategorias() {
    try {
      const resposta =
        await fetchAutenticado(
          `${API}/financeiro/categorias?tipo=${tipo}`
        );

      const dados =
        await resposta.json();

      if (dados.sucesso) {
        setCategorias(
          dados.categorias || []
        );

        setCategoriaId('');
      }
    } catch (error) {
      console.error(error);
    }
  }

  async function carregarResumo() {
    if (!acessoGerencial) return;
    try {
      const resposta =
        await fetchAutenticado(
          `${API}/financeiro/resumo`
        );

      const dados =
        await resposta.json();

      if (dados.sucesso) {
        setResumo(
          dados.resumo
        );
      }
    } catch (error) {
      console.error(error);
    }
  }

  async function carregarLancamentos() {
    try {
      const parametros =
      new URLSearchParams();

      const resposta =
        await fetchAutenticado(
          `${API}/financeiro?${parametros.toString()}`
        );

      const dados =
        await resposta.json();

      if (dados.sucesso) {
        setLancamentos(
          dados.lancamentos || []
        );
      } else {
        setErro(
          dados.erro ||
          'Erro ao carregar Financeiro.'
        );
      }
    } catch (error) {
      console.error(error);

      setErro(
        'Não foi possível acessar o Financeiro.'
      );
    }
  }

  /*
  |--------------------------------------------------------------------------
  | LEITURA DO BOLETO
  |--------------------------------------------------------------------------
  */

  async function lerBoleto() {
    setMensagem('');
    setErro('');
    setBoletoLido(null);

    const codigo =
      codigoBoleto.replace(
        /\D/g,
        ''
      );

    if (!codigo) {
      setErro(
        'Cole ou escaneie o código do boleto.'
      );
      return;
    }

    setLendoBoleto(true);

    try {
      const resposta =
        await fetchAutenticado(
          `${API}/financeiro/ler-boleto`,
          {
            method: 'POST',

            headers: {
              'Content-Type':
                'application/json',
            },

            body: JSON.stringify({
              codigo,
            }),
          }
        );

      const dados =
        await resposta.json();

      if (!resposta.ok) {
        throw new Error(
          dados.erro ||
          'Não foi possível ler o boleto.'
        );
      }

      const resultado:
        ResultadoBoleto =
        dados.resultado;

      setBoletoLido(
        resultado
      );

      setNumeroDocumento(
        resultado.codigoNumerico ||
        codigo
      );

      setFormaPagamento(
        'Boleto'
      );

      if (
        resultado.valor !== null &&
        resultado.valor !== undefined
      ) {
        setValorOriginal(
          formatarCampoMoeda(
            Math.round(
              Number(resultado.valor) * 100
            )
          )
        );
      }

      if (
        resultado.vencimento
      ) {
        setDataVencimento(
          resultado.vencimento
        );
      }

      if (
        resultado.valor &&
        resultado.vencimento
      ) {
        setMensagem(
          'Boleto lido. Valor e vencimento preenchidos automaticamente. Confira os dados antes de salvar.'
        );
      } else {
        setMensagem(
          'Código reconhecido. Confira e complete os dados que não puderam ser obtidos automaticamente.'
        );
      }
    } catch (error: any) {
      setErro(
        error?.message ||
        'Erro ao ler boleto.'
      );
    } finally {
      setLendoBoleto(false);
    }
  }

  const descricoesPesquisaveis =
    useMemo(() => {
      const mapa =
        new Map<string, string>();

      lancamentos.forEach(
        (lancamento) => {
          const descricaoBase =
            String(
              lancamento.descricao ||
              ''
            )
              .replace(
                /\s+-\s+Parcela\s+\d+\/\d+$/i,
                ''
              )
              .trim();

          if (!descricaoBase) {
            return;
          }

          const chave =
            descricaoBase
              .toLocaleLowerCase(
                'pt-BR'
              );

          if (!mapa.has(chave)) {
            mapa.set(
              chave,
              descricaoBase
            );
          }
        }
      );

      return Array.from(
        mapa.values()
      )
        .sort((a, b) =>
          a.localeCompare(
            b,
            'pt-BR'
          )
        )
        .map((descricao) => ({
          value: descricao,
          label: descricao,
        }));
    }, [lancamentos]);

  /*
  |--------------------------------------------------------------------------
  | FORNECEDOR
  |--------------------------------------------------------------------------
  */

  const fornecedoresFiltrados =
    useMemo(() => {
      const texto =
        fornecedorBusca
          .toLowerCase()
          .trim();

      if (!texto) {
        return fornecedores.slice(
          0,
          10
        );
      }

      const numeros =
        texto.replace(
          /\D/g,
          ''
        );

      return fornecedores
        .filter(
          (fornecedor) => {
            const razao =
              String(
                fornecedor.razao_social ||
                ''
              ).toLowerCase();

            const fantasia =
              String(
                fornecedor.nome_fantasia ||
                ''
              ).toLowerCase();

            const documento =
              String(
                fornecedor.cpf_cnpj ||
                ''
              ).replace(
                /\D/g,
                ''
              );

            return (
              razao.includes(texto) ||
              fantasia.includes(texto) ||
              (
                numeros &&
                documento.includes(
                  numeros
                )
              )
            );
          }
        )
        .sort((a, b) => {
          const nomeA =
            String(
              a.nome_fantasia ||
              a.razao_social ||
              ''
            ).toLowerCase();

          const nomeB =
            String(
              b.nome_fantasia ||
              b.razao_social ||
              ''
            ).toLowerCase();

          const aComeca =
            nomeA.startsWith(texto)
              ? 0
              : 1;

          const bComeca =
            nomeB.startsWith(texto)
              ? 0
              : 1;

          if (aComeca !== bComeca) {
            return aComeca - bComeca;
          }

          return nomeA.localeCompare(
            nomeB,
            'pt-BR'
          );
        })
        .slice(
          0,
          10
        );
    }, [
      fornecedores,
      fornecedorBusca,
    ]);

  async function selecionarFornecedor(
    fornecedor: Fornecedor
  ) {
    setFornecedorId(
      String(
        fornecedor.id
      )
    );

    setFornecedorBusca(
      nomeFornecedor(
        fornecedor
      )
    );

    setMostrarSugestoes(
      false
    );

    try {
      const resposta =
        await fetchAutenticado(
          `${API}/financeiro/fornecedor/${fornecedor.id}`
        );

      const dados =
        await resposta.json();

      if (
        !resposta.ok ||
        !dados.sucesso
      ) {
        return;
      }

      const sugestao =
        dados.resultado?.sugestao;

      if (!sugestao) {
        return;
      }

      if (!descricao) {
        setDescricao(
          fornecedor.nome_fantasia ||
          sugestao.descricao ||
          ''
        );
      }

      if (
        sugestao.categoriaId
      ) {
        setCategoriaId(
          String(
            sugestao.categoriaId
          )
        );
      }

      setLojaId(idLojaAtiva);

      if (
        sugestao.formaPagamento
      ) {
        setFormaPagamento(
          sugestao.formaPagamento
        );
      }
    } catch (error) {
      console.error(error);
    }
  }

  /*
  |--------------------------------------------------------------------------
  | NOVO LANÇAMENTO
  |--------------------------------------------------------------------------
  */

  function abrirNovo() {
    limparFormulario();

    setMostrarNovo(
      true
    );

    setErro('');
    setMensagem('');
  }

  function limparFormulario() {
    setTipo(
      'SAIDA'
    );

    setFornecedorId('');
    setFornecedorBusca('');
    setCategoriaId('');
    setLojaId(idLojaAtiva);
    setDescricao('');
    setNumeroDocumento('');
    setValorOriginal('');
    setDataEmissao(
      hojeISO()
    );
    setDataVencimento('');
    setVencimentosAdicionais([]);
    setFormaPagamento(
      'Boleto'
    );
    setObservacao('');
    setCodigoBoleto('');
    setBoletoLido(null);
  }

  function adicionarVencimento() {
    setVencimentosAdicionais(
      (atuais) => [
        ...atuais,
        {
          id:
            Date.now() +
            Math.floor(
              Math.random() * 1000
            ),
          data: '',
          valor: valorOriginal,
          numeroDocumento: '',
        },
      ]
    );
  }

  function atualizarVencimento(
    id: number,
    campo:
      | 'data'
      | 'valor'
      | 'numeroDocumento',
    valor: string
  ) {
    setVencimentosAdicionais(
      (atuais) =>
        atuais.map((item) =>
          item.id === id
            ? {
                ...item,
                [campo]:
                  campo === 'valor'
                    ? formatarCampoMoeda(
                        valor
                      )
                    : valor,
              }
            : item
        )
    );
  }

  function removerVencimento(
    id: number
  ) {
    setVencimentosAdicionais(
      (atuais) =>
        atuais.filter(
          (item) =>
            item.id !== id
        )
    );
  }

  async function recarregarDadosFinanceiros() {
    if (!acessoOperacional) {
      return;
    }

    const tarefas: Promise<any>[] = [
      carregarLancamentos(),
    ];

    if (acessoGerencial) {
      tarefas.push(
        carregarResumo()
      );
    }

    await Promise.all(tarefas);
  }

  /*
  |--------------------------------------------------------------------------
  | SALVAR
  |--------------------------------------------------------------------------
  */

  async function enviarVencimento(
    parcela: {
      data: string;
      valor: string;
      numeroDocumento: string;
    },
    indice: number,
    total: number,
    permitirDuplicidade = false
  ) {
    const descricaoParcela =
      total > 1
        ? `${descricao.trim()} - Parcela ${indice + 1}/${total}`
        : descricao.trim();

    const resposta =
      await fetchAutenticado(
        `${API}/financeiro`,
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json',
          },

          body:
            JSON.stringify({
              empresaId: 1,

              tipo,

              fornecedorId:
                fornecedorId
                  ? Number(
                      fornecedorId
                    )
                  : null,

              lojaId:
                lojaId
                  ? Number(
                      lojaId
                    )
                  : null,

              categoriaId:
                categoriaId
                  ? Number(
                      categoriaId
                    )
                  : null,

              descricao:
                descricaoParcela,

              numeroDocumento:
                parcela.numeroDocumento ||
                null,

              valorOriginal:
                valorCampoParaNumero(
                  parcela.valor
                ),

              dataEmissao:
                dataEmissao ||
                null,

              dataVencimento:
                parcela.data,

              formaPagamento:
                formaPagamento ||
                null,

              observacao:
                total > 1
                  ? [
                      observacao,
                      `Vencimento programado ${indice + 1} de ${total}.`,
                    ]
                      .filter(Boolean)
                      .join(' ')
                  : (
                      observacao ||
                      null
                    ),

              usuarioId:
                usuario?.id ||
                null,

              permitirDuplicidade,
            }),
        }
      );

    const dados =
      await resposta.json();

    if (
      resposta.status === 409 &&
      dados.requerConfirmacaoDuplicidade
    ) {
      const primeiro =
        dados.duplicidades?.[0];

      const texto =
        primeiro
          ? `Já existe um lançamento semelhante para este vencimento:\n\n${primeiro.descricao}\n${moeda(firstValue(primeiro.valor_original))}\nVencimento: ${dataBR(primeiro.data_vencimento)}\n\nDeseja salvar esta parcela mesmo assim?`
          : 'Encontramos um lançamento semelhante. Deseja salvar esta parcela mesmo assim?';

      const confirmar =
        window.confirm(
          texto
        );

      if (!confirmar) {
        throw new Error(
          `O vencimento ${indice + 1}/${total} não foi salvo porque a duplicidade não foi confirmada.`
        );
      }

      return enviarVencimento(
        parcela,
        indice,
        total,
        true
      );
    }

    if (!resposta.ok) {
      throw new Error(
        dados.erro ||
        dados.mensagem ||
        `Erro ao salvar o vencimento ${indice + 1}/${total}.`
      );
    }

    return dados;
  }

  async function salvarLancamento(
    evento: FormEvent
  ) {
    evento.preventDefault();

    setErro('');
    setMensagem('');

    if (!descricao.trim()) {
      setErro(
        'Informe a descrição.'
      );
      return;
    }

    const vencimentos = [
      {
        data:
          dataVencimento,
        valor:
          valorOriginal,
        numeroDocumento:
          numeroDocumento,
      },
      ...vencimentosAdicionais.map(
        (item) => ({
          data:
            item.data,
          valor:
            item.valor,
          numeroDocumento:
            item.numeroDocumento,
        })
      ),
    ];

    const algumSemData =
      vencimentos.some(
        (item) =>
          !item.data
      );

    if (algumSemData) {
      setErro(
        'Informe a data de todos os vencimentos.'
      );
      return;
    }

    const algumValorInvalido =
      vencimentos.some(
        (item) =>
          valorCampoParaNumero(
            item.valor
          ) <= 0
      );

    if (algumValorInvalido) {
      setErro(
        'Informe um valor válido em todos os vencimentos.'
      );
      return;
    }

    setSalvando(true);

    try {
      for (
        let indice = 0;
        indice <
        vencimentos.length;
        indice += 1
      ) {
        await enviarVencimento(
          vencimentos[indice],
          indice,
          vencimentos.length
        );
      }

      setMostrarNovo(
        false
      );

      limparFormulario();

      setMensagem(
        vencimentos.length > 1
          ? `${vencimentos.length} vencimentos cadastrados com sucesso.`
          : (
              tipo === 'SAIDA'
                ? 'Conta a pagar cadastrada com sucesso.'
                : 'Conta a receber cadastrada com sucesso.'
            )
      );

      await recarregarDadosFinanceiros();
    } catch (error: any) {
      setErro(
        error?.message ||
        'Erro ao salvar lançamento.'
      );
    } finally {
      setSalvando(false);
    }
  }

  /*
  |--------------------------------------------------------------------------
  | BAIXA RÁPIDA
  |--------------------------------------------------------------------------
  */

  async function darBaixa(
    lancamento: Lancamento
  ) {
    const saldo =
      Number(
        lancamento.valor_original
      ) -
      Number(
        lancamento.valor_baixado ||
        0
      );

    const valorInformado =
      window.prompt(
        lancamento.tipo ===
        'SAIDA'
          ? 'Valor pago:'
          : 'Valor recebido:',
        saldo.toFixed(2)
      );

    if (
      valorInformado ===
      null
    ) {
      return;
    }

    const valor =
      Number(
        valorInformado.replace(
          ',',
          '.'
        )
      );

    if (
      !Number.isFinite(valor) ||
      valor <= 0
    ) {
      setErro(
        'Valor de baixa inválido.'
      );
      return;
    }

    const confirmar =
      window.confirm(
        `${lancamento.tipo === 'SAIDA'
          ? 'Confirmar pagamento'
          : 'Confirmar recebimento'
        } de ${moeda(valor)}?`
      );

    if (!confirmar) {
      return;
    }

    try {
      const resposta =
        await fetchAutenticado(
          `${API}/financeiro/${lancamento.id}/baixas`,
          {
            method: 'POST',

            headers: {
              'Content-Type':
                'application/json',
            },

            body:
              JSON.stringify({
                valor,

                dataBaixa:
                  hojeISO(),

                formaPagamento:
                  lancamento.numero_documento
                    ? 'Boleto'
                    : null,

                usuarioId:
                  usuario?.id ||
                  null,
              }),
          }
        );

      const dados =
        await resposta.json();

      if (!resposta.ok) {
        throw new Error(
          dados.erro ||
          'Erro ao realizar baixa.'
        );
      }

      setMensagem(
        lancamento.tipo ===
        'SAIDA'
          ? 'Pagamento registrado.'
          : 'Recebimento registrado.'
      );

      await recarregarDadosFinanceiros();
    } catch (error: any) {
      setErro(
        error?.message ||
        'Erro ao realizar baixa.'
      );
    }
  }


  /*
  |--------------------------------------------------------------------------
  | FECHAMENTO DE CAIXA
  |--------------------------------------------------------------------------
  */

  async function salvarFechamentoCaixa(
    evento: FormEvent
  ) {
    evento.preventDefault();

    setErro('');
    setMensagem('');

    const lojaDestinoFechamento =
    lojaFechamento;

    if (!lojaDestinoFechamento) {
      setErro(
        'Selecione um mercado no topo do sistema antes de registrar o fechamento.'
      );
      return;
    }

    if (!dataFechamento) {
      setErro('Informe a data do fechamento.');
      return;
    }

    if (totalFechamento <= 0) {
      setErro(
        fechamentoCondominio
          ? 'Informe o valor das maquininhas.'
          : 'Informe o valor em espécie e/ou o valor das maquininhas.'
      );
      return;
    }

    setSalvandoFechamento(true);

    try {
      const resposta = await fetchAutenticado(
        `${API}/financeiro/fechamentos-caixa`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            empresaId: 1,
            lojaId: lojaDestinoFechamento.id,
            dataFechamento,
            valorEspecie: ehCaixa
              ? Number(valorEspecie || 0)
              : (fechamentoCondominio ? 0 : Number(valorEspecie || 0)),
            valorMaquininhas: Number(valorMaquininhas || 0),
            usuarioId: usuario?.id || null,
          }),
        }
      );

      const dados = await resposta.json();

      if (!resposta.ok) {
        throw new Error(
          dados.erro ||
          'Erro ao salvar fechamento de caixa.'
        );
      }

      setMensagem(
        `Fechamento de ${lojaDestinoFechamento.nome} registrado: ${moeda(totalFechamento)}.`
      );

      setValorEspecie('');
      setValorMaquininhas('');
      setDataFechamento(hojeISO());

      await recarregarDadosFinanceiros();
    } catch (error: any) {
      setErro(
        error?.message ||
        'Erro ao salvar fechamento de caixa.'
      );
    } finally {
      setSalvandoFechamento(false);
    }
  }


  /*
  |--------------------------------------------------------------------------
  | EDITAR FECHAMENTO
  |--------------------------------------------------------------------------
  */

  function valorObservacaoFechamento(
    observacao: string | null | undefined,
    campo: 'ESPECIE' | 'MAQUININHAS'
  ) {
    const texto = String(observacao || '');

    const regex =
      campo === 'ESPECIE'
        ? /Esp[eé]cie:\s*([\d.,]+)/i
        : /Maquininhas:\s*([\d.,]+)/i;

    const encontrado = texto.match(regex);

    if (!encontrado?.[1]) {
      return 0;
    }

    return (
      Number(
        encontrado[1]
          .replace(/\./g, '')
          .replace(',', '.')
      ) || 0
    );
  }

  function abrirEdicaoFechamento(
    lancamento: Lancamento
  ) {
    if (!podeEditarFechamento) {
      setErro(
        'Somente Ana Flávia e Marcos Roberto podem editar fechamentos.'
      );
      return;
    }

    const especie =
      valorObservacaoFechamento(
        lancamento.observacao,
        'ESPECIE'
      );

    let maquininhas =
      valorObservacaoFechamento(
        lancamento.observacao,
        'MAQUININHAS'
      );

    if (especie === 0 && maquininhas === 0) {
      maquininhas =
        Number(lancamento.valor_original || 0);
    }

    setFechamentoEditando(lancamento);
    setEdicaoDataFechamento(
      lancamento.data_vencimento || hojeISO()
    );
    setEdicaoValorEspecie(
      especie ? String(especie) : ''
    );
    setEdicaoValorMaquininhas(
      maquininhas ? String(maquininhas) : ''
    );

    setErro('');
    setMensagem('');
  }

  function fecharEdicaoFechamento() {
    if (salvandoEdicaoFechamento) {
      return;
    }

    setFechamentoEditando(null);
  }

  async function salvarEdicaoFechamento(
    evento: FormEvent
  ) {
    evento.preventDefault();

    if (!fechamentoEditando) {
      return;
    }

    const valorEspecie =
      Number(
        String(edicaoValorEspecie || '0')
          .replace(',', '.')
      );

    const valorMaquininhas =
      Number(
        String(edicaoValorMaquininhas || '0')
          .replace(',', '.')
      );

    const total =
      valorEspecie + valorMaquininhas;

    if (!edicaoDataFechamento) {
      setErro('Informe a data do fechamento.');
      return;
    }

    if (
      !Number.isFinite(valorEspecie) ||
      !Number.isFinite(valorMaquininhas) ||
      valorEspecie < 0 ||
      valorMaquininhas < 0
    ) {
      setErro('Informe valores válidos.');
      return;
    }

    if (total <= 0) {
      setErro(
        'O total do fechamento deve ser maior que zero.'
      );
      return;
    }

    const confirmar =
      window.confirm(
        `Confirmar correção do fechamento?

${fechamentoEditando.descricao}

Valor anterior: ${moeda(
          fechamentoEditando.valor_original
        )}
Novo valor: ${moeda(total)}

Data: ${dataBR(
          fechamentoEditando.data_vencimento
        )} → ${dataBR(edicaoDataFechamento)}`
      );

    if (!confirmar) {
      return;
    }

    setSalvandoEdicaoFechamento(true);
    setErro('');
    setMensagem('');

    try {
      const resposta =
        await fetchAutenticado(
          `${API}/financeiro/fechamentos-caixa/${fechamentoEditando.id}`,
          {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              dataFechamento:
                edicaoDataFechamento,
              valorEspecie,
              valorMaquininhas,
              usuarioId:
                usuario?.id || null,
            }),
          }
        );

      const dados =
        await resposta.json();

      if (!resposta.ok) {
        throw new Error(
          dados.erro ||
            'Erro ao corrigir fechamento.'
        );
      }

      setFechamentoEditando(null);

      setMensagem(
        `Fechamento corrigido com sucesso. Novo total: ${moeda(total)}.`
      );

      await recarregarDadosFinanceiros();
    } catch (error: any) {
      setErro(
        error?.message ||
          'Erro ao corrigir fechamento.'
      );
    } finally {
      setSalvandoEdicaoFechamento(false);
    }
  }

  /*
  |--------------------------------------------------------------------------
  | EDITAR LANÇAMENTO DE SAÍDA
  |--------------------------------------------------------------------------
  */

  function abrirEdicaoSaida(
    lancamento: Lancamento
  ) {
    const ehFechamento =
      String(
        lancamento.descricao || ''
      )
        .toUpperCase()
        .startsWith(
          'FECHAMENTO DE CAIXA -'
        );

    if (
      lancamento.tipo !== 'SAIDA' ||
      ehFechamento
    ) {
      return;
    }

    setLancamentoSaidaEditando(
      lancamento
    );

    setEdicaoFornecedorId(
      lancamento.fornecedor_id
        ? String(
            lancamento.fornecedor_id
          )
        : ''
    );

    setEdicaoLojaId(idLojaAtiva);

    setEdicaoCategoriaId(
      categorias.find(
        (categoria) =>
          categoria.nome ===
          lancamento.categoria_nome
      )?.id
        ? String(
            categorias.find(
              (categoria) =>
                categoria.nome ===
                lancamento.categoria_nome
            )?.id
          )
        : ''
    );

    setEdicaoDescricao(
      lancamento.descricao || ''
    );

    setEdicaoNumeroDocumento(
      lancamento.numero_documento ||
      ''
    );

    setEdicaoValorOriginal(
      Number(
        lancamento.valor_original ||
        0
      ).toLocaleString(
        'pt-BR',
        {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }
      )
    );

    setEdicaoDataEmissao(
      lancamento.data_emissao ||
      ''
    );

    setEdicaoDataVencimento(
      lancamento.data_vencimento ||
      ''
    );

    setEdicaoFormaPagamento(
      lancamento.forma_pagamento ||
      (
        lancamento.numero_documento
          ? 'Boleto'
          : ''
      )
    );

    setEdicaoObservacao(
      lancamento.observacao || ''
    );

    setErro('');
    setMensagem('');
  }

  function fecharEdicaoSaida() {
    if (salvandoEdicaoSaida) {
      return;
    }

    setLancamentoSaidaEditando(
      null
    );
  }

  async function salvarEdicaoSaida(
    evento: FormEvent
  ) {
    evento.preventDefault();

    if (!lancamentoSaidaEditando) {
      return;
    }

    const descricaoNova =
      edicaoDescricao.trim();

    if (!descricaoNova) {
      setErro(
        'Informe a descrição.'
      );
      return;
    }

    if (!edicaoDataVencimento) {
      setErro(
        'Informe a data de vencimento.'
      );
      return;
    }

    const valorJaBaixado =
      Number(
        lancamentoSaidaEditando.valor_baixado ||
        0
      );

    const novoValor =
      valorCampoParaNumero(
        edicaoValorOriginal
      );

    if (
      valorJaBaixado <= 0 &&
      novoValor <= 0
    ) {
      setErro(
        'Informe um valor válido.'
      );
      return;
    }

    setSalvandoEdicaoSaida(
      true
    );
    setErro('');
    setMensagem('');

    try {
      const payload: any = {
        fornecedorId:
          edicaoFornecedorId
            ? Number(
                edicaoFornecedorId
              )
            : null,

        lojaId:
          edicaoLojaId
            ? Number(
                edicaoLojaId
              )
            : null,

        categoriaId:
          edicaoCategoriaId
            ? Number(
                edicaoCategoriaId
              )
            : null,

        descricao:
          descricaoNova,

        numeroDocumento:
          edicaoNumeroDocumento ||
          null,

        dataEmissao:
          edicaoDataEmissao ||
          null,

        dataVencimento:
          edicaoDataVencimento,

        formaPagamento:
          edicaoFormaPagamento ||
          null,

        observacao:
          edicaoObservacao ||
          null,

        usuarioId:
          usuario?.id ||
          null,
      };

      if (
        valorJaBaixado <= 0
      ) {
        payload.valorOriginal =
          novoValor;
      }

      const resposta =
        await fetchAutenticado(
          `${API}/financeiro/${lancamentoSaidaEditando.id}`,
          {
            method: 'PATCH',

            headers: {
              'Content-Type':
                'application/json',
            },

            body:
              JSON.stringify(
                payload
              ),
          }
        );

      const dados =
        await resposta.json();

      if (!resposta.ok) {
        throw new Error(
          dados.erro ||
          'Erro ao atualizar lançamento.'
        );
      }

      setLancamentoSaidaEditando(
        null
      );

      setMensagem(
        'Lançamento de saída atualizado com sucesso.'
      );

      await recarregarDadosFinanceiros();
    } catch (error: any) {
      setErro(
        error?.message ||
        'Erro ao atualizar lançamento.'
      );
    } finally {
      setSalvandoEdicaoSaida(
        false
      );
    }
  }


  /*
  |--------------------------------------------------------------------------
  | EXCLUIR LANÇAMENTO
  |--------------------------------------------------------------------------
  */

  async function excluirLancamento(
    lancamento: Lancamento
  ) {
    const confirmar = window.confirm(
      `Excluir definitivamente este lançamento?

${lancamento.descricao}
${moeda(lancamento.valor_original)}

Os totais do Financeiro serão recalculados.`
    );

    if (!confirmar) {
      return;
    }

    setErro('');
    setMensagem('');

    try {
      const resposta = await fetchAutenticado(
        `${API}/financeiro/${lancamento.id}`,
        {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            usuarioId: usuario?.id || null,
          }),
        }
      );

      const dados = await resposta.json();

      if (!resposta.ok) {
        throw new Error(
          dados.erro ||
          'Erro ao excluir lançamento.'
        );
      }

      setMensagem('Lançamento excluído com sucesso.');

      await recarregarDadosFinanceiros();
    } catch (error: any) {
      setErro(
        error?.message ||
        'Erro ao excluir lançamento.'
      );
    }
  }

  /*
  |--------------------------------------------------------------------------
  | AUXILIAR
  |--------------------------------------------------------------------------
  */

  function firstValue(
    valor: any
  ) {
    return valor ?? 0;
  }

  /*
  |--------------------------------------------------------------------------
  | RENDER
  |--------------------------------------------------------------------------
  */

  if (ehCaixa) {
    const totalCaixa =
      Number(valorEspecie || 0) +
      Number(valorMaquininhas || 0);

    return (
      <div className="financeiro-page financeiro-redesign">
        <div className="financeiro-header">
          <div>
            <h1>Fechamento Diário</h1>
            <p>
              Registre o fechamento diário de {lojaAtiva?.nome}.
            </p>
          </div>
        </div>

        {mensagem && (
          <div className="financeiro-mensagem sucesso">
            {mensagem}
          </div>
        )}

        {erro && (
          <div className="financeiro-mensagem erro">
            {erro}
          </div>
        )}

        <div className="financeiro-fechamento-card">
          <div className="financeiro-novo-header">
            <div>
              <h2>{lojaAtiva?.nome}</h2>
              <p>
                Informe os valores recebidos no fechamento do dia.
              </p>
            </div>
          </div>

          <form onSubmit={salvarFechamentoCaixa}>
            <div className="financeiro-fechamento-grid">
              <div className="financeiro-campo">
                <label>Data do fechamento</label>
                <input
                  type="date"
                  value={dataFechamento}
                  onChange={(evento) =>
                    setDataFechamento(evento.target.value)
                  }
                />
              </div>

              <div className="financeiro-campo">
                <label>Valor em espécie</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={valorEspecie}
                  placeholder="0,00"
                  onChange={(evento) =>
                    setValorEspecie(evento.target.value)
                  }
                />
              </div>

              <div className="financeiro-campo">
                <label>Valor das maquininhas</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={valorMaquininhas}
                  placeholder="0,00"
                  onChange={(evento) =>
                    setValorMaquininhas(evento.target.value)
                  }
                />
              </div>

              <div className="financeiro-fechamento-total">
                <span>Total do fechamento</span>
                <strong>{moeda(totalCaixa)}</strong>
              </div>
            </div>

            <div className="financeiro-fechamento-info">
              <span>Unidade</span>
              <strong>
                {lojaSelecionadaFechamento?.nome || 'Selecione um mercado'}
              </strong>
              <small>
                O fechamento será registrado no mercado selecionado.
              </small>
            </div>

            <div className="financeiro-form-acoes">
              <button
                type="submit"
                className="financeiro-btn-primary"
                disabled={
                  salvandoFechamento ||
                  totalCaixa <= 0 ||
                  !lojaSelecionadaFechamento
                }
              >
                {salvandoFechamento
                  ? 'Salvando...'
                  : 'Salvar fechamento'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  if (!acessoOperacional) {
    return (
      <div className="financeiro-page financeiro-redesign">
        <div className="financeiro-header">
          <div>
            <h1>Acesso não disponível</h1>
            <p>Seu papel não permite acessar este módulo.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="financeiro-page financeiro-redesign">

      <div className="financeiro-header">
        <div>
          <h1>
            {acessoGerencial ? 'Financeiro' : 'Contas / Boletos'}
          </h1>

          <p>
            {acessoGerencial
              ? 'Controle de entradas e saídas da empresa.'
              : 'Cadastro, consulta e baixa de contas e boletos.'}
          </p>
        </div>

        <div className="financeiro-header-acoes">
          {acessoGerencial && (
            <button
              type="button"
              className="financeiro-btn-fechamento"
              onClick={() => {
                if (usuario?.permissoes?.includes('fechamento')) {
                  window.location.hash = encodeURIComponent('Fechamento Diário');
                  return;
                }
                setMostrarFechamento(
                  (atual) => !atual
                );
                setMostrarNovo(false);
                setErro('');
                setMensagem('');
              }}
            >
              Fechamento Diário
            </button>
          )}

          <button
            className="financeiro-btn-primary"
            onClick={abrirNovo}
          >
            + Nova Movimentação
          </button>
        </div>
      </div>

      {mensagem && (
        <div className="financeiro-mensagem sucesso">
          {mensagem}
        </div>
      )}

      {erro && (
        <div className="financeiro-mensagem erro">
          {erro}
        </div>
      )}


      {lancamentoSaidaEditando && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background:
              'rgba(0, 0, 0, 0.38)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            zIndex: 9999,
            overflowY: 'auto',
          }}
          onMouseDown={(evento) => {
            if (
              evento.target ===
              evento.currentTarget
            ) {
              fecharEdicaoSaida();
            }
          }}
        >
          <form
            onSubmit={
              salvarEdicaoSaida
            }
            style={{
              width: '100%',
              maxWidth: 860,
              maxHeight:
                '90vh',
              overflowY: 'auto',
              background: '#fff',
              borderRadius: 18,
              padding: 28,
              boxShadow:
                '0 24px 70px rgba(0,0,0,.20)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent:
                  'space-between',
                gap: 20,
                alignItems:
                  'flex-start',
              }}
            >
              <div>
                <h2
                  style={{
                    margin:
                      '0 0 6px',
                  }}
                >
                  Editar saída
                </h2>

                <p
                  style={{
                    margin: 0,
                    color:
                      '#737373',
                  }}
                >
                  Corrija os dados da conta ou boleto.
                </p>
              </div>

              <button
                type="button"
                onClick={
                  fecharEdicaoSaida
                }
                disabled={
                  salvandoEdicaoSaida
                }
                style={{
                  border: 0,
                  background:
                    'transparent',
                  fontSize: 26,
                  cursor:
                    'pointer',
                }}
              >
                ×
              </button>
            </div>

            {Number(
              lancamentoSaidaEditando.valor_baixado ||
              0
            ) > 0 && (
              <div
                className="financeiro-mensagem"
                style={{
                  marginTop: 18,
                  background:
                    '#fff7ed',
                  border:
                    '1px solid #fed7aa',
                }}
              >
                Este lançamento já possui pagamento/baixa. O valor fica bloqueado para evitar diferença entre o lançamento e o pagamento já registrado.
              </div>
            )}

            <div
              style={{
                marginTop: 24,
                display: 'grid',
                gridTemplateColumns:
                  'repeat(2, minmax(0, 1fr))',
                gap: 16,
              }}
            >
              <div className="financeiro-campo financeiro-campo-modal">
                <label>Fornecedor — Razão Social</label>

                <CampoPesquisa
                  value={edicaoFornecedorId}
                  placeholder="Pesquisar razão social"
                  options={fornecedores.map((fornecedor) => ({
                    value: String(fornecedor.id),
                    label:
                      fornecedor.razao_social ||
                      fornecedor.nome_fantasia ||
                      'Fornecedor',
                  }))}
                  onSelect={(valor) => {
                    setEdicaoFornecedorId(valor);

                    const selecionado = fornecedores.find(
                      (fornecedor) => String(fornecedor.id) === String(valor)
                    );

                    if (
                      selecionado?.nome_fantasia &&
                      !edicaoDescricao.trim()
                    ) {
                      setEdicaoDescricao(selecionado.nome_fantasia);
                    }
                  }}
                  mensagemVazia="Nenhum fornecedor encontrado."
                />
              </div>

              <div className="financeiro-campo financeiro-campo-modal">
                <label>Unidade</label>

                <input value={lojaAtiva?.nome || ''} readOnly aria-label="Mercado selecionado" />
              </div>

              <div className="financeiro-campo financeiro-campo-modal">
                <label>Categoria</label>

                <CampoPesquisa
                  value={edicaoCategoriaId}
                  placeholder="Pesquisar categoria"
                  options={categorias.map((categoria) => ({
                    value: String(categoria.id),
                    label: categoria.nome,
                  }))}
                  onSelect={(valor) => setEdicaoCategoriaId(valor)}
                  mensagemVazia="Nenhuma categoria encontrada."
                />
              </div>

              <div>
                <label>
                  Forma de pagamento
                </label>

                <input
                  type="text"
                  value={
                    edicaoFormaPagamento
                  }
                  onChange={(evento) =>
                    setEdicaoFormaPagamento(
                      evento.target.value
                    )
                  }
                  style={{
                    width: '100%',
                    height: 46,
                    marginTop: 7,
                  }}
                />
              </div>

              <div
                style={{
                  gridColumn:
                    '1 / -1',
                }}
              >
                <label>
                  Descrição *
                </label>

                <CampoPesquisa
                  value={edicaoDescricao}
                  placeholder="Nome fantasia ou descrição manual"
                  options={descricoesPesquisaveis}
                  permitirTextoLivre
                  onTextChange={(valor) => setEdicaoDescricao(valor)}
                  onSelect={(valor) => setEdicaoDescricao(valor)}
                  mensagemVazia="Nenhuma descrição anterior encontrada. Você pode continuar digitando."
                />
              </div>

              <div>
                <label>
                  Valor *
                </label>

                <input
                  type="text"
                  inputMode="numeric"
                  value={
                    edicaoValorOriginal
                  }
                  disabled={
                    Number(
                      lancamentoSaidaEditando.valor_baixado ||
                      0
                    ) > 0
                  }
                  onChange={(evento) =>
                    setEdicaoValorOriginal(
                      formatarCampoMoeda(
                        evento.target.value
                      )
                    )
                  }
                  style={{
                    width: '100%',
                    height: 46,
                    marginTop: 7,
                  }}
                />
              </div>

              <div>
                <label>
                  Vencimento *
                </label>

                <input
                  type="date"
                  value={
                    edicaoDataVencimento
                  }
                  onChange={(evento) =>
                    setEdicaoDataVencimento(
                      evento.target.value
                    )
                  }
                  required
                  style={{
                    width: '100%',
                    height: 46,
                    marginTop: 7,
                  }}
                />
              </div>

              <div>
                <label>
                  Data de emissão
                </label>

                <input
                  type="date"
                  value={
                    edicaoDataEmissao
                  }
                  onChange={(evento) =>
                    setEdicaoDataEmissao(
                      evento.target.value
                    )
                  }
                  style={{
                    width: '100%',
                    height: 46,
                    marginTop: 7,
                  }}
                />
              </div>

              <div>
                <label>
                  Documento / Linha digitável
                </label>

                <input
                  type="text"
                  value={
                    edicaoNumeroDocumento
                  }
                  onChange={(evento) =>
                    setEdicaoNumeroDocumento(
                      evento.target.value
                    )
                  }
                  style={{
                    width: '100%',
                    height: 46,
                    marginTop: 7,
                  }}
                />
              </div>

              <div
                style={{
                  gridColumn:
                    '1 / -1',
                }}
              >
                <label>
                  Observação
                </label>

                <textarea
                  value={
                    edicaoObservacao
                  }
                  onChange={(evento) =>
                    setEdicaoObservacao(
                      evento.target.value
                    )
                  }
                  rows={3}
                  style={{
                    width: '100%',
                    marginTop: 7,
                    padding: 12,
                    border:
                      '1px solid #ddd',
                    borderRadius: 9,
                    resize:
                      'vertical',
                  }}
                />
              </div>
            </div>

            <div
              style={{
                marginTop: 24,
                display: 'flex',
                justifyContent:
                  'flex-end',
                gap: 10,
              }}
            >
              <button
                type="button"
                className="financeiro-btn-secundario"
                onClick={
                  fecharEdicaoSaida
                }
                disabled={
                  salvandoEdicaoSaida
                }
              >
                Cancelar
              </button>

              <button
                type="submit"
                className="financeiro-btn-primary"
                disabled={
                  salvandoEdicaoSaida
                }
              >
                {salvandoEdicaoSaida
                  ? 'Salvando...'
                  : 'Salvar alterações'}
              </button>
            </div>
          </form>
        </div>
      )}

      {fechamentoEditando && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.38)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            zIndex: 9999,
          }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              fecharEdicaoFechamento();
            }
          }}
        >
          <form
            onSubmit={salvarEdicaoFechamento}
            style={{
              width: '100%',
              maxWidth: 620,
              background: '#fff',
              borderRadius: 18,
              padding: 28,
              boxShadow:
                '0 24px 70px rgba(0,0,0,.20)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 20,
                alignItems: 'flex-start',
              }}
            >
              <div>
                <h2 style={{ margin: '0 0 6px' }}>
                  Editar fechamento
                </h2>
                <p
                  style={{
                    margin: 0,
                    color: '#737373',
                  }}
                >
                  {fechamentoEditando.descricao}
                </p>
              </div>

              <button
                type="button"
                onClick={fecharEdicaoFechamento}
                disabled={salvandoEdicaoFechamento}
                style={{
                  border: 0,
                  background: 'transparent',
                  fontSize: 26,
                }}
              >
                ×
              </button>
            </div>

            <div
              style={{
                marginTop: 24,
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 16,
              }}
            >
              <div style={{ gridColumn: '1 / -1' }}>
                <label>Data do fechamento</label>
                <input
                  type="date"
                  value={edicaoDataFechamento}
                  onChange={(e) =>
                    setEdicaoDataFechamento(
                      e.target.value
                    )
                  }
                  required
                  style={{
                    width: '100%',
                    height: 46,
                    marginTop: 7,
                    padding: '0 12px',
                    border: '1px solid #ddd',
                    borderRadius: 9,
                  }}
                />
              </div>

              <div>
                <label>Espécie</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={edicaoValorEspecie}
                  onChange={(e) =>
                    setEdicaoValorEspecie(
                      e.target.value
                    )
                  }
                  style={{
                    width: '100%',
                    height: 46,
                    marginTop: 7,
                    padding: '0 12px',
                    border: '1px solid #ddd',
                    borderRadius: 9,
                  }}
                />
              </div>

              <div>
                <label>Maquininhas</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={edicaoValorMaquininhas}
                  onChange={(e) =>
                    setEdicaoValorMaquininhas(
                      e.target.value
                    )
                  }
                  style={{
                    width: '100%',
                    height: 46,
                    marginTop: 7,
                    padding: '0 12px',
                    border: '1px solid #ddd',
                    borderRadius: 9,
                  }}
                />
              </div>
            </div>

            <div
              style={{
                marginTop: 20,
                padding: 16,
                borderRadius: 10,
                background: '#fff7ed',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span>Novo total</span>
              <strong style={{ fontSize: 22 }}>
                {moeda(
                  Number(edicaoValorEspecie || 0) +
                    Number(
                      edicaoValorMaquininhas || 0
                    )
                )}
              </strong>
            </div>

            <div
              style={{
                marginTop: 24,
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 10,
              }}
            >
              <button
                type="button"
                className="financeiro-btn-secundario"
                onClick={fecharEdicaoFechamento}
                disabled={salvandoEdicaoFechamento}
              >
                Cancelar
              </button>

              <button
                type="submit"
                className="financeiro-btn-primary"
                disabled={salvandoEdicaoFechamento}
              >
                {salvandoEdicaoFechamento
                  ? 'Salvando...'
                  : 'Salvar correção'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* =====================================================
          CARDS
      ====================================================== */}

      {acessoGerencial && (
        <div className="financeiro-cards financeiro-cards-modelo">
          <div className="financeiro-card entrada financeiro-card-modelo">
            <div className="financeiro-card-icone entrada">↑</div>
            <div>
              <span>Total de Entradas</span>
              <strong>{moeda(resumoVisual.entradas)}</strong>
              <small>{resumoVisual.quantidadeEntradas} lançamentos</small>
              <small>Fechamento de Caixa</small>
            </div>
          </div>

          <div className="financeiro-card saida financeiro-card-modelo">
            <div className="financeiro-card-icone saida">↓</div>
            <div>
              <span>Total de Saídas</span>
              <strong>{moeda(resumoVisual.saidas)}</strong>
              <small>{resumoVisual.quantidadeSaidas} lançamentos</small>
              <small>Compras, pagamentos, despesas, etc.</small>
            </div>
          </div>

          <div className="financeiro-card financeiro-card-modelo saldo">
            <div className="financeiro-card-icone saldo">▥</div>
            <div>
              <span>Saldo do Período</span>
              <strong className={resumoVisual.saldo >= 0 ? 'positivo' : 'negativo'}>
                {moeda(resumoVisual.saldo)}
              </strong>
              <small>Entradas − Saídas</small>
            </div>
          </div>

          <div className="financeiro-card financeiro-card-modelo">
            <div className="financeiro-card-icone total">☷</div>
            <div>
              <span>Total de Lançamentos</span>
              <strong>{resumoVisual.quantidade}</strong>
              <small>no período exibido</small>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================
          FECHAMENTO DIÁRIO DO MERCADO ATIVO
      ====================================================== */}

      {mostrarFechamento && (
        <div className="financeiro-fechamento-card">
          <div className="financeiro-novo-header">
            <div>
              <h2>Fechamento Diário</h2>
              <p>
                Registre as entradas diárias de {lojaAtiva?.nome}.
              </p>
            </div>

            <button
              type="button"
              className="financeiro-fechar"
              onClick={() => setMostrarFechamento(false)}
            >
              ×
            </button>
          </div>

          <form onSubmit={salvarFechamentoCaixa}>
            <div className={`financeiro-fechamento-grid ${fechamentoCondominio ? 'condominio' : ''}`}>
              <div className="financeiro-campo">
                <label>Data do fechamento</label>
                <input
                  type="date"
                  value={dataFechamento}
                  onChange={(evento) => setDataFechamento(evento.target.value)}
                />
              </div>

              {!fechamentoCondominio && (
                <div className="financeiro-campo">
                  <label>Valor em espécie</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={valorEspecie}
                    placeholder="0,00"
                    onChange={(evento) => setValorEspecie(evento.target.value)}
                  />
                </div>
              )}

              <div className="financeiro-campo">
                <label>Valor das maquininhas</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={valorMaquininhas}
                  placeholder="0,00"
                  onChange={(evento) => setValorMaquininhas(evento.target.value)}
                />
              </div>

              <div className="financeiro-fechamento-total">
                <span>Total do fechamento</span>
                <strong>{moeda(totalFechamento)}</strong>
              </div>
            </div>

            <div className="financeiro-fechamento-info">
              <span>Unidade</span>
              <strong>{lojaFechamento?.nome || 'Unidade não localizada'}</strong>
              <small>
                {fechamentoCondominio
                  ? 'Será lançado automaticamente como ENTRADA na categoria Condomínios.'
                  : 'Será registrado como entrada recebida deste mercado.'}
              </small>
            </div>

            <div className="financeiro-form-acoes">
              <button
                type="button"
                className="financeiro-btn-secundario"
                onClick={() => setMostrarFechamento(false)}
              >
                Cancelar
              </button>

              <button
                type="submit"
                className="financeiro-btn-primary"
                disabled={salvandoFechamento || totalFechamento <= 0 || !lojaFechamento}
              >
                {salvandoFechamento ? 'Salvando...' : 'Salvar fechamento'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* =====================================================
          NOVO LANÇAMENTO
      ====================================================== */}

      {mostrarNovo && (
        <div className="financeiro-novo-card">

          <div className="financeiro-novo-header">
            <div>
              <h2>
                Novo lançamento
              </h2>

              <p>
                Lance manualmente ou leia o código do boleto.
              </p>
            </div>

            <button
              type="button"
              className="financeiro-fechar"
              onClick={() =>
                setMostrarNovo(
                  false
                )
              }
            >
              ×
            </button>
          </div>

          {/* BOLETO */}

          {tipo === 'SAIDA' && (
            <div className="boleto-leitor">

              <div className="boleto-leitor-titulo">
                <div>
                  <strong>
                    Ler boleto
                  </strong>

                  <span>
                    Cole a linha digitável ou use um leitor de código de barras.
                  </span>
                </div>

                <span className="boleto-badge">
                  Automático
                </span>
              </div>

              <div className="boleto-input-linha">

                <input
                  type="text"
                  value={codigoBoleto}
                  placeholder="Digite ou escaneie 44, 47 ou 48 dígitos"
                  onChange={(evento) =>
                    setCodigoBoleto(
                      evento.target.value
                    )
                  }
                />

                <button
                  type="button"
                  onClick={lerBoleto}
                  disabled={
                    lendoBoleto ||
                    !codigoBoleto.trim()
                  }
                >
                  {lendoBoleto
                    ? 'Lendo...'
                    : 'Ler boleto'
                  }
                </button>

              </div>

              {boletoLido && (
                <div className="boleto-resultado">

                  <div>
                    <span>
                      Tipo
                    </span>

                    <strong>
                      {boletoLido.tipo ===
                      'BOLETO_BANCARIO'
                        ? 'Boleto bancário'
                        : 'Arrecadação / concessionária'
                      }
                    </strong>
                  </div>

                  <div>
                    <span>
                      Banco
                    </span>

                    <strong>
                      {boletoLido.bancoCodigo ||
                        '-'}
                    </strong>
                  </div>

                  <div>
                    <span>
                      Valor
                    </span>

                    <strong>
                      {boletoLido.valor !==
                      null &&
                      boletoLido.valor !==
                      undefined
                        ? moeda(
                            boletoLido.valor
                          )
                        : 'Conferir'
                      }
                    </strong>
                  </div>

                  <div>
                    <span>
                      Vencimento
                    </span>

                    <strong>
                      {boletoLido.vencimento
                        ? dataBR(
                            boletoLido.vencimento
                          )
                        : 'Conferir'
                      }
                    </strong>
                  </div>

                </div>
              )}

            </div>
          )}

          <form
            onSubmit={
              salvarLancamento
            }
          >

            {/* TIPO */}

            <div className="financeiro-tipo">

              <button
                type="button"
                className={
                  tipo === 'SAIDA'
                    ? 'ativo saida'
                    : ''
                }
                onClick={() =>
                  setTipo(
                    'SAIDA'
                  )
                }
              >
                Saída
              </button>

              <button
                type="button"
                className={
                  tipo === 'ENTRADA'
                    ? 'ativo entrada'
                    : ''
                }
                onClick={() =>
                  setTipo(
                    'ENTRADA'
                  )
                }
              >
                Entrada
              </button>

            </div>

            <div className="financeiro-form-grid">

              {/* FORNECEDOR */}

              <div
                className="financeiro-campo fornecedor-campo"
                style={{
                  position: 'relative',
                  zIndex: 50,
                }}
              >
                <label>
                  Fornecedor / Favorecido
                </label>

                <input
                  type="text"
                  placeholder="Digite nome, razão social ou CNPJ"
                  value={fornecedorBusca}
                  onFocus={() => {
                    setMostrarSugestoes(
                      true
                    );

                    if (
                      fornecedores.length ===
                      0
                    ) {
                      carregarFornecedores();
                    }
                  }}
                  onChange={(evento) => {
                    setFornecedorBusca(
                      evento.target.value
                    );

                    setFornecedorId('');

                    setMostrarSugestoes(
                      true
                    );
                  }}
                />

                {mostrarSugestoes &&
                  fornecedorBusca.trim() &&
                  fornecedoresFiltrados.length ===
                    0 && (
                    <div
                      style={{
                        position: 'absolute',
                        top: 'calc(100% + 6px)',
                        left: 0,
                        right: 0,
                        zIndex: 99999,
                        background: '#fff',
                        border: '1px solid #d9d9d9',
                        borderRadius: 10,
                        boxShadow:
                          '0 12px 32px rgba(0,0,0,.16)',
                        padding: '12px 14px',
                        color: '#666',
                      }}
                    >
                      Nenhum fornecedor encontrado.
                    </div>
                  )}

                {mostrarSugestoes &&
                  fornecedoresFiltrados.length >
                    0 && (
                    <div
                      className="fornecedor-sugestoes"
                      style={{
                        position: 'absolute',
                        top: 'calc(100% + 6px)',
                        left: 0,
                        right: 0,
                        zIndex: 99999,
                        maxHeight: 280,
                        overflowY: 'auto',
                        background: '#fff',
                        border: '1px solid #d9d9d9',
                        borderRadius: 10,
                        boxShadow:
                          '0 12px 32px rgba(0,0,0,.16)',
                        padding: 6,
                      }}
                    >

                      {fornecedoresFiltrados.map(
                        (
                          fornecedor
                        ) => (
                          <button
                            type="button"
                            key={
                              fornecedor.id
                            }
                            onClick={() =>
                              selecionarFornecedor(
                                fornecedor
                              )
                            }
                            style={{
                              width: '100%',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'flex-start',
                              gap: 2,
                              padding: '10px 12px',
                              margin: 0,
                              border: 0,
                              borderRadius: 8,
                              background: '#fff',
                              cursor: 'pointer',
                              textAlign: 'left',
                            }}
                            onMouseEnter={(evento) => {
                              evento.currentTarget.style.background =
                                '#fff4ea';
                            }}
                            onMouseLeave={(evento) => {
                              evento.currentTarget.style.background =
                                '#fff';
                            }}
                          >
                            <strong>
                              {fornecedor.razao_social ||
                                fornecedor.nome_fantasia ||
                                'Fornecedor'}
                            </strong>

                            {fornecedor.nome_fantasia && (
                              <span>
                                Nome fantasia: {fornecedor.nome_fantasia}
                              </span>
                            )}

                            <small>
                              {fornecedor.cpf_cnpj ||
                                ''}
                            </small>
                          </button>
                        )
                      )}

                    </div>
                  )}

              </div>

              <div className="financeiro-campo">
                <label>
                  Unidade
                </label>

                <input value={lojaAtiva?.nome || ''} readOnly aria-label="Mercado selecionado" />
              </div>

              <div className="financeiro-campo">
                <label>
                  Categoria
                </label>

                <CampoPesquisa
                  value={categoriaId}
                  placeholder="Digite para pesquisar a categoria"
                  options={categorias.map(
                    (categoria) => ({
                      value: String(
                        categoria.id
                      ),
                      label:
                        categoria.nome,
                    })
                  )}
                  onSelect={(valor) =>
                    setCategoriaId(
                      valor
                    )
                  }
                  mensagemVazia="Nenhuma categoria encontrada."
                />
              </div>

              <div className="financeiro-campo financeiro-campo-grande">
                <label>
                  Descrição *
                </label>

                <CampoPesquisa
                  value={descricao}
                  placeholder="Digite ou pesquise um lançamento anterior"
                  options={
                    descricoesPesquisaveis
                  }
                  permitirTextoLivre
                  onTextChange={(valor) =>
                    setDescricao(
                      valor
                    )
                  }
                  onSelect={(valor) =>
                    setDescricao(
                      valor
                    )
                  }
                  mensagemVazia="Nenhum lançamento anterior encontrado. Você pode continuar digitando uma nova descrição."
                />
              </div>

              <div
                className="financeiro-campo financeiro-campo-total"
                style={{
                  border:
                    '1px solid #e4e4e4',
                  borderRadius: 12,
                  padding: 16,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems:
                      'center',
                    justifyContent:
                      'space-between',
                    gap: 12,
                    marginBottom: 12,
                  }}
                >
                  <div>
                    <label>
                      Vencimentos / Parcelas *
                    </label>
                    <div
                      style={{
                        marginTop: 4,
                        fontSize: 12,
                        color: '#737373',
                      }}
                    >
                      Você pode programar qualquer quantidade de datas e valores.
                    </div>
                  </div>

                  <button
                    type="button"
                    className="financeiro-btn-primary"
                    onClick={
                      adicionarVencimento
                    }
                    style={{
                      whiteSpace:
                        'nowrap',
                    }}
                  >
                    + Adicionar vencimento
                  </button>
                </div>

                <div className="responsive-layout"
                  style={{
                    display: 'grid',
                    gridTemplateColumns:
                      '90px minmax(130px, 1fr) minmax(140px, 1fr) minmax(220px, 2fr)',
                    gap: 10,
                    alignItems:
                      'end',
                  }}
                >
                  <div>
                    <label>
                      Parcela
                    </label>
                    <div
                      style={{
                        height: 42,
                        display:
                          'flex',
                        alignItems:
                          'center',
                        fontWeight: 700,
                      }}
                    >
                      1/
                      {vencimentosAdicionais.length + 1}
                    </div>
                  </div>

                  <div>
                    <label>
                      Vencimento
                    </label>
                    <input
                      type="date"
                      value={
                        dataVencimento
                      }
                      onChange={(evento) =>
                        setDataVencimento(
                          evento.target.value
                        )
                      }
                    />
                  </div>

                  <div>
                    <label>
                      Valor
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={
                        valorOriginal
                      }
                      placeholder="0,00"
                      onChange={(evento) =>
                        setValorOriginal(
                          formatarCampoMoeda(
                            evento.target.value
                          )
                        )
                      }
                    />
                  </div>

                  <div>
                    <label>
                      Linha digitável / Documento
                    </label>
                    <input
                      type="text"
                      value={
                        numeroDocumento
                      }
                      onChange={(evento) =>
                        setNumeroDocumento(
                          evento.target.value
                        )
                      }
                    />
                  </div>
                </div>

                {vencimentosAdicionais.map(
                  (
                    item,
                    indice
                  ) => (
                    <div className="responsive-layout"
                      key={
                        item.id
                      }
                      style={{
                        display:
                          'grid',
                        gridTemplateColumns:
                          '90px minmax(130px, 1fr) minmax(140px, 1fr) minmax(220px, 2fr) auto',
                        gap: 10,
                        alignItems:
                          'end',
                        marginTop: 10,
                        paddingTop: 10,
                        borderTop:
                          '1px dashed #ddd',
                      }}
                    >
                      <div>
                        <label>
                          Parcela
                        </label>
                        <div
                          style={{
                            height: 42,
                            display:
                              'flex',
                            alignItems:
                              'center',
                            fontWeight:
                              700,
                          }}
                        >
                          {indice + 2}/
                          {vencimentosAdicionais.length + 1}
                        </div>
                      </div>

                      <div>
                        <label>
                          Vencimento
                        </label>
                        <input
                          type="date"
                          value={
                            item.data
                          }
                          onChange={(evento) =>
                            atualizarVencimento(
                              item.id,
                              'data',
                              evento.target.value
                            )
                          }
                        />
                      </div>

                      <div>
                        <label>
                          Valor
                        </label>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={
                            item.valor
                          }
                          placeholder="0,00"
                          onChange={(evento) =>
                            atualizarVencimento(
                              item.id,
                              'valor',
                              evento.target.value
                            )
                          }
                        />
                      </div>

                      <div>
                        <label>
                          Linha digitável / Documento
                        </label>
                        <input
                          type="text"
                          value={
                            item.numeroDocumento
                          }
                          onChange={(evento) =>
                            atualizarVencimento(
                              item.id,
                              'numeroDocumento',
                              evento.target.value
                            )
                          }
                        />
                      </div>

                      <button
                        type="button"
                        className="financeiro-btn-excluir"
                        onClick={() =>
                          removerVencimento(
                            item.id
                          )
                        }
                        style={{
                          height: 42,
                        }}
                      >
                        Remover
                      </button>
                    </div>
                  )
                )}

                <div
                  style={{
                    marginTop: 12,
                    fontSize: 12,
                    color: '#737373',
                  }}
                >
                  As datas não precisam ser mensais. Você pode usar qualquer vencimento.
                </div>
              </div>

              <div className="financeiro-campo">
                <label>
                  Data de emissão
                </label>

                <input
                  type="date"
                  value={
                    dataEmissao
                  }
                  onChange={(evento) =>
                    setDataEmissao(
                      evento.target.value
                    )
                  }
                />
              </div>

              <div className="financeiro-campo">
                <label>
                  Forma de pagamento
                </label>

                <select
                  value={
                    formaPagamento
                  }
                  onChange={(evento) =>
                    setFormaPagamento(
                      evento.target.value
                    )
                  }
                >
                  <option>
                    Boleto
                  </option>

                  <option>
                    PIX
                  </option>

                  <option>
                    Transferência
                  </option>

                  <option>
                    Débito
                  </option>

                  <option>
                    Crédito
                  </option>

                  <option>
                    Dinheiro
                  </option>

                  <option>
                    Outro
                  </option>
                </select>
              </div>

              <div className="financeiro-campo financeiro-campo-total">
                <label>
                  Observação
                </label>

                <textarea
                  rows={3}
                  value={
                    observacao
                  }
                  onChange={(evento) =>
                    setObservacao(
                      evento.target.value
                    )
                  }
                  placeholder="Informações adicionais..."
                />
              </div>

            </div>

            <div className="financeiro-form-acoes">

              <button
                type="button"
                className="financeiro-btn-secundario"
                onClick={() =>
                  setMostrarNovo(
                    false
                  )
                }
              >
                Cancelar
              </button>

              <button
                type="submit"
                className="financeiro-btn-primary"
                disabled={
                  salvando
                }
              >
                {salvando
                  ? 'Salvando...'
                  : 'Salvar lançamento'
                }
              </button>

            </div>

          </form>

        </div>
      )}

      {/* =====================================================
          FILTROS
      ====================================================== */}

      <ResponsiveFilters activeCount={[busca, filtroTipo, filtroStatus].filter(Boolean).length} onClear={() => { setBusca(''); setFiltroTipo(''); setFiltroStatus(''); }}><div className="financeiro-filtros">

        <input
          type="text"
          placeholder="Pesquisar fornecedor, descrição, documento, unidade, categoria..."
          value={busca}
          onChange={(evento) =>
            setBusca(
              evento.target.value
            )
          }
        />

        <select
          value={filtroTipo}
          onChange={(evento) =>
            setFiltroTipo(
              evento.target.value
            )
          }
        >
          <option value="">
            Todos os tipos
          </option>

          <option value="SAIDA">
            Saídas
          </option>

          <option value="ENTRADA">
            Entradas
          </option>
        </select>

        <select
          value={filtroStatus}
          onChange={(evento) =>
            setFiltroStatus(
              evento.target.value
            )
          }
        >
          <option value="">
            Todos os status
          </option>

          <option value="PENDENTE">
            Pendentes
          </option>

          <option value="ATRASADO">
            Atrasados
          </option>

          <option value="PAGO">
            Pagos
          </option>

          <option value="RECEBIDO">
            Recebidos
          </option>

          <option value="CANCELADO">
            Cancelados
          </option>
        </select>

      </div></ResponsiveFilters>

      {/* =====================================================
          TABELA
      ====================================================== */}

      <div className="financeiro-tabela">

        <table className="mobile-record-table">

          <thead>
            <tr>
              <th scope="col">
                Vencimento
              </th>

              <th scope="col">
                Tipo
              </th>

              <th scope="col">
                Fornecedor
              </th>

              <th scope="col">
                Descrição
              </th>

              <th scope="col">
                Unidade
              </th>

              <th scope="col">
                Categoria
              </th>

              <th scope="col">
                Valor
              </th>

              <th scope="col">
                Status
              </th>

              <th scope="col">
                Usuário
              </th>

              <th scope="col">
                Ações
              </th>
            </tr>
          </thead>

          <tbody>

            {!carregando &&
              lancamentosFiltrados.length ===
                0 && (
                <tr>
                  <td
                    colSpan={10}
                    className="financeiro-vazio"
                  >
                    Nenhum lançamento financeiro encontrado.
                  </td>
                </tr>
              )}

            {lancamentosFiltrados.map(
              (lancamento) => {
                const fornecedor =
                  lancamento
                    .fornecedor_razao_social ||
                  lancamento
                    .fornecedor_nome_fantasia ||
                  '-';

                const status =
                  lancamento.status_visual ||
                  lancamento.status;

                return (
                  <tr
                    key={
                      lancamento.id
                    }
                    className={
                      tipoVisualLancamento(lancamento) === 'ENTRADA'
                        ? 'financeiro-linha-entrada'
                        : 'financeiro-linha-saida'
                    }
                  >
                    <td data-label="Vencimento">
                      <strong>
                        {dataBR(
                          lancamento.data_vencimento
                        )}
                      </strong>
                    </td>

                    <td data-label="Tipo">
                      <span
                        className={`financeiro-tipo-badge ${
                          tipoVisualLancamento(lancamento) === 'ENTRADA'
                            ? 'entrada'
                            : 'saida'
                        }`}
                      >
                        <span className="financeiro-tipo-seta">
                          {tipoVisualLancamento(lancamento) === 'ENTRADA' ? '↑' : '↓'}
                        </span>
                        {tipoVisualLancamento(lancamento) === 'ENTRADA'
                          ? 'ENTRADA'
                          : 'SAÍDA'}
                      </span>
                    </td>

                    <td data-label="Fornecedor">
                      <strong>
                        {fornecedor}
                      </strong>

                      {lancamento
                        .fornecedor_cpf_cnpj && (
                        <small>
                          {lancamento
                            .fornecedor_cpf_cnpj}
                        </small>
                      )}
                    </td>

                    <td data-label="Descrição">
                      {lancamento.descricao}
                    </td>

                    <td data-label="Unidade">
                      {lancamento.loja_nome ||
                        '-'}
                    </td>

                    <td data-label="Categoria">
                      {lancamento.categoria_nome ||
                        '-'}
                    </td>

                    <td data-label="Valor">
                      <strong
                        style={{
                          color:
                            tipoVisualLancamento(lancamento) === 'ENTRADA'
                              ? '#15803d'
                              : '#b91c1c',
                        }}
                      >
                        {tipoVisualLancamento(lancamento) === 'ENTRADA'
                          ? '+ '
                          : '- '}
                        {moeda(
                          lancamento.valor_original
                        )}
                      </strong>
                    </td>

                    <td data-label="Status">
                      <span
                        className={`financeiro-status ${String(
                          status
                        ).toLowerCase()}`}
                      >
                        {String(
                          status
                        )
                          .replace(
                            '_',
                            ' '
                          )}
                      </span>
                    </td>

                    <td data-label="Usuário">
                      {lancamento.usuario_nome ||
                        'Não identificado'}
                    </td>

                    <td data-label="Ações">
                      <div className="financeiro-acoes-linha">
                        {lancamento.status ===
                          'PENDENTE' && (
                          <button
                            className="financeiro-btn-baixa"
                            onClick={() =>
                              darBaixa(
                                lancamento
                              )
                            }
                          >
                            {lancamento.tipo ===
                            'SAIDA'
                              ? 'Pagar'
                              : 'Receber'
                            }
                          </button>
                        )}

                        {lancamento.tipo ===
                          'SAIDA' &&
                          lancamento.status !==
                            'CANCELADO' &&
                          !String(
                            lancamento.descricao || ''
                          )
                            .toUpperCase()
                            .startsWith(
                              'FECHAMENTO DE CAIXA -'
                            ) && (
                            <button
                              type="button"
                              className="financeiro-btn-baixa"
                              onClick={() =>
                                abrirEdicaoSaida(
                                  lancamento
                                )
                              }
                              title="Editar saída"
                            >
                              Editar
                            </button>
                          )}

                        {podeEditarFechamento &&
                          String(
                            lancamento.descricao || ''
                          )
                            .toUpperCase()
                            .startsWith(
                              'FECHAMENTO DE CAIXA -'
                            ) && (
                            <button
                              type="button"
                              className="financeiro-btn-baixa"
                              onClick={() =>
                                abrirEdicaoFechamento(
                                  lancamento
                                )
                              }
                              title="Editar fechamento"
                            >
                              Editar
                            </button>
                          )}

                        {String(lancamento.numero_documento || '').startsWith('FECHAMENTO-DIARIO-') ? (
                          usuario?.permissoes?.includes('fechamento') ? <button type="button" className="financeiro-btn-baixa" onClick={() => {
                            sessionStorage.setItem('nm-fechamento-data', `${lojaAtiva?.id}:${String(lancamento.data_vencimento).slice(0, 10)}`);
                            window.location.hash = encodeURIComponent('Fechamento Diário');
                          }}>Ver fechamento</button> : <small>Integrado do fechamento diário</small>
                        ) : <button
                          type="button"
                          className="financeiro-btn-excluir"
                          onClick={() =>
                            excluirLancamento(
                              lancamento
                            )
                          }
                          title="Excluir lançamento"
                        >
                          Excluir
                        </button>}
                      </div>
                    </td>
                  </tr>
                );
              }
            )}

          </tbody>

        </table>

      </div>

    </div>
  );
}
