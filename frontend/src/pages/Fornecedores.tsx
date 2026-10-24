import {useDadosCompartilhados} from '../hooks/useDadosCompartilhados';
import {useLoja} from '../contexts/LojaContext';
import { apiFetch } from '../services/apiClient';
import ResponsiveFilters from '../components/ResponsiveFilters';
import {
  useEffect,
  useMemo,
  useState,
} from 'react';

const API_URL =
  '/api';

type Fornecedor = {
  loja_id?:number;loja_nome?:string;
  id: number;

  empresa_id?: number | null;

  tipo_pessoa:
    | 'FISICA'
    | 'JURIDICA';

  nome_fantasia?: string | null;
  razao_social: string;

  cpf_cnpj?: string | null;

  inscricao_estadual?: string | null;
  inscricao_municipal?: string | null;

  telefone?: string | null;
  whatsapp?: string | null;

  email?: string | null;
  site?: string | null;

  contato_nome?: string | null;
  contato_cargo?: string | null;
  contato_telefone?: string | null;
  contato_email?: string | null;

  cep?: string | null;

  endereco?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;

  cidade?: string | null;
  estado?: string | null;

  prazo_pagamento_dias?: number;

  observacao?: string | null;

  ativo: number;

  total_produtos?: number;
  total_compras_registradas?: number;

  criado_em?: string;
  atualizado_em?: string;
};

type ResumoFornecedores = {
  totalFornecedores: number;
  ativos: number;
  inativos: number;
  produtosVinculados: number;
  comprasRegistradas: number;
};

type FormFornecedor = {
  tipoPessoa:
    | 'FISICA'
    | 'JURIDICA';

  nomeFantasia: string;
  razaoSocial: string;

  cpfCnpj: string;

  inscricaoEstadual: string;
  inscricaoMunicipal: string;

  telefone: string;
  whatsapp: string;

  email: string;
  site: string;

  contatoNome: string;
  contatoCargo: string;
  contatoTelefone: string;
  contatoEmail: string;

  cep: string;

  endereco: string;
  numero: string;
  complemento: string;
  bairro: string;

  cidade: string;
  estado: string;

  prazoPagamentoDias: string;

  observacao: string;

  ativo: boolean;
};

const formularioInicial:
  FormFornecedor = {
    tipoPessoa: 'JURIDICA',

    nomeFantasia: '',
    razaoSocial: '',

    cpfCnpj: '',

    inscricaoEstadual: '',
    inscricaoMunicipal: '',

    telefone: '',
    whatsapp: '',

    email: '',
    site: '',

    contatoNome: '',
    contatoCargo: '',
    contatoTelefone: '',
    contatoEmail: '',

    cep: '',

    endereco: '',
    numero: '',
    complemento: '',
    bairro: '',

    cidade: '',
    estado: '',

    prazoPagamentoDias: '0',

    observacao: '',

    ativo: true,
  };

function somenteNumeros(
  valor: string
) {
  return valor.replace(
    /\D/g,
    ''
  );
}

function formatarDocumento(
  documento?: string | null
) {
  const numeros =
    somenteNumeros(
      documento || ''
    );

  if (
    numeros.length === 11
  ) {
    return numeros.replace(
      /(\d{3})(\d{3})(\d{3})(\d{2})/,
      '$1.$2.$3-$4'
    );
  }

  if (
    numeros.length === 14
  ) {
    return numeros.replace(
      /(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/,
      '$1.$2.$3/$4-$5'
    );
  }

  return documento || '-';
}

function formatarTelefone(
  telefone?: string | null
) {
  const numeros =
    somenteNumeros(
      telefone || ''
    );

  if (
    numeros.length === 11
  ) {
    return numeros.replace(
      /(\d{2})(\d{5})(\d{4})/,
      '($1) $2-$3'
    );
  }

  if (
    numeros.length === 10
  ) {
    return numeros.replace(
      /(\d{2})(\d{4})(\d{4})/,
      '($1) $2-$3'
    );
  }

  return telefone || '-';
}

function formatarCep(
  cep?: string | null
) {
  const numeros =
    somenteNumeros(
      cep || ''
    );

  if (
    numeros.length === 8
  ) {
    return numeros.replace(
      /(\d{5})(\d{3})/,
      '$1-$2'
    );
  }

  return cep || '';
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

export default function Fornecedores() {
  const {lojaAtiva,selecionarLoja}=useLoja();
  const [consolidado,setConsolidado]=useState(true);
  useDadosCompartilhados(()=>atualizarTela(true));
  const [
    fornecedores,
    setFornecedores,
  ] = useState<Fornecedor[]>([]);

  const [
    resumo,
    setResumo,
  ] =
    useState<ResumoFornecedores>({
      totalFornecedores: 0,
      ativos: 0,
      inativos: 0,
      produtosVinculados: 0,
      comprasRegistradas: 0,
    });

  const [
    formulario,
    setFormulario,
  ] =
    useState<FormFornecedor>(
      formularioInicial
    );

  const [
    fornecedorEditando,
    setFornecedorEditando,
  ] =
    useState<number | null>(
      null
    );

  const [
    mostrarFormulario,
    setMostrarFormulario,
  ] =
    useState(false);

  const [
    busca,
    setBusca,
  ] = useState('');

  const [
    filtroStatus,
    setFiltroStatus,
  ] = useState<
    'TODOS' | 'ATIVOS' | 'INATIVOS'
  >('TODOS');

  const [
    carregando,
    setCarregando,
  ] = useState(false);

  const [
    salvando,
    setSalvando,
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
  | CARREGAMENTO
  |--------------------------------------------------------------------------
  */

  async function carregarFornecedores(silencioso=false) {
    try {
      if(!silencioso)setCarregando(true);
      setErro('');

      const resposta =
        await fetchAutenticado(
          `${API_URL}/fornecedores${consolidado?'?consolidado=1':''}`
        );

      const dados =
        await resposta.json();

      if (!resposta.ok) {
        throw new Error(
          dados.erro ||
            'Erro ao carregar fornecedores.'
        );
      }

      setFornecedores(
        dados.fornecedores ||
          []
      );
    } catch (error: any) {
      setErro(
        error?.message ||
          'Erro ao carregar fornecedores.'
      );
    } finally {
      setCarregando(false);
    }
  }

  async function carregarResumo() {
    try {
      const resposta =
        await fetchAutenticado(
          `${API_URL}/fornecedores/resumo${consolidado?'?consolidado=1':''}`
        );

      const dados =
        await resposta.json();

      if (!resposta.ok) {
        throw new Error(
          dados.erro ||
            'Erro ao carregar resumo.'
        );
      }

      setResumo(
        dados.resumo
      );
    } catch (error) {
      console.error(
        'Erro ao carregar resumo:',
        error
      );
    }
  }

  async function atualizarTela(silencioso=false) {
    await Promise.all([
      carregarFornecedores(silencioso),
      carregarResumo(),
    ]);
  }

  useEffect(() => {
    atualizarTela();
  }, [consolidado,lojaAtiva?.id]);

  /*
  |--------------------------------------------------------------------------
  | FORMULÁRIO
  |--------------------------------------------------------------------------
  */

  function alterarCampo(
    campo: keyof FormFornecedor,
    valor:
      | string
      | boolean
  ) {
    setFormulario(
      (anterior) => ({
        ...anterior,
        [campo]: valor,
      })
    );
  }

  function abrirNovoFornecedor() {
    setFormulario(
      formularioInicial
    );

    setFornecedorEditando(
      null
    );

    setMensagem('');
    setErro('');

    setMostrarFormulario(
      true
    );

    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  }

  function editarFornecedor(
    fornecedor: Fornecedor
  ) {
    if(fornecedor.loja_id&&fornecedor.loja_id!==lojaAtiva?.id){selecionarLoja(fornecedor.loja_id);return;}
    setFornecedorEditando(
      fornecedor.id
    );

    setFormulario({
      tipoPessoa:
        fornecedor.tipo_pessoa ||
        'JURIDICA',

      nomeFantasia:
        fornecedor.nome_fantasia ||
        '',

      razaoSocial:
        fornecedor.razao_social ||
        '',

      cpfCnpj:
        fornecedor.cpf_cnpj ||
        '',

      inscricaoEstadual:
        fornecedor.inscricao_estadual ||
        '',

      inscricaoMunicipal:
        fornecedor.inscricao_municipal ||
        '',

      telefone:
        fornecedor.telefone ||
        '',

      whatsapp:
        fornecedor.whatsapp ||
        '',

      email:
        fornecedor.email ||
        '',

      site:
        fornecedor.site ||
        '',

      contatoNome:
        fornecedor.contato_nome ||
        '',

      contatoCargo:
        fornecedor.contato_cargo ||
        '',

      contatoTelefone:
        fornecedor.contato_telefone ||
        '',

      contatoEmail:
        fornecedor.contato_email ||
        '',

      cep:
        fornecedor.cep ||
        '',

      endereco:
        fornecedor.endereco ||
        '',

      numero:
        fornecedor.numero ||
        '',

      complemento:
        fornecedor.complemento ||
        '',

      bairro:
        fornecedor.bairro ||
        '',

      cidade:
        fornecedor.cidade ||
        '',

      estado:
        fornecedor.estado ||
        '',

      prazoPagamentoDias:
        String(
          fornecedor
            .prazo_pagamento_dias ||
            0
        ),

      observacao:
        fornecedor.observacao ||
        '',

      ativo:
        fornecedor.ativo ===
        1,
    });

    setMensagem('');
    setErro('');

    setMostrarFormulario(
      true
    );

    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  }

  function cancelarFormulario() {
    setFormulario(
      formularioInicial
    );

    setFornecedorEditando(
      null
    );

    setMostrarFormulario(
      false
    );

    setErro('');
  }

  /*
  |--------------------------------------------------------------------------
  | SALVAR
  |--------------------------------------------------------------------------
  */

  async function salvarFornecedor(
    event: React.FormEvent
  ) {
    event.preventDefault();

    if (
      !formulario.razaoSocial.trim()
    ) {
      setErro(
        formulario.tipoPessoa ===
          'JURIDICA'
          ? 'Informe a razão social.'
          : 'Informe o nome do fornecedor.'
      );

      return;
    }

    try {
      setSalvando(true);
      setErro('');
      setMensagem('');

      const payload = {
        tipoPessoa:
          formulario.tipoPessoa,

        nomeFantasia:
          formulario.nomeFantasia,

        razaoSocial:
          formulario.razaoSocial,

        cpfCnpj:
          formulario.cpfCnpj,

        inscricaoEstadual:
          formulario.inscricaoEstadual,

        inscricaoMunicipal:
          formulario.inscricaoMunicipal,

        telefone:
          formulario.telefone,

        whatsapp:
          formulario.whatsapp,

        email:
          formulario.email,

        site:
          formulario.site,

        contatoNome:
          formulario.contatoNome,

        contatoCargo:
          formulario.contatoCargo,

        contatoTelefone:
          formulario.contatoTelefone,

        contatoEmail:
          formulario.contatoEmail,

        cep:
          formulario.cep,

        endereco:
          formulario.endereco,

        numero:
          formulario.numero,

        complemento:
          formulario.complemento,

        bairro:
          formulario.bairro,

        cidade:
          formulario.cidade,

        estado:
          formulario.estado,

        prazoPagamentoDias:
          formulario
            .prazoPagamentoDias,

        observacao:
          formulario.observacao,

        ativo:
          formulario.ativo,
      };

      const url =
        fornecedorEditando
          ? `${API_URL}/fornecedores/${fornecedorEditando}`
          : `${API_URL}/fornecedores`;

      const resposta =
        await fetchAutenticado(
          url,
          {
            method:
              fornecedorEditando
                ? 'PUT'
                : 'POST',

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
            'Erro ao salvar fornecedor.'
        );
      }

      setMensagem(
        fornecedorEditando
          ? 'Fornecedor atualizado com sucesso.'
          : 'Fornecedor cadastrado com sucesso.'
      );

      setFormulario(
        formularioInicial
      );

      setFornecedorEditando(
        null
      );

      setMostrarFormulario(
        false
      );

      await atualizarTela();
    } catch (error: any) {
      setErro(
        error?.message ||
          'Erro ao salvar fornecedor.'
      );
    } finally {
      setSalvando(false);
    }
  }

  /*
  |--------------------------------------------------------------------------
  | ATIVAR / DESATIVAR
  |--------------------------------------------------------------------------
  */

  async function alterarStatus(
    fornecedor: Fornecedor
  ) {
    if(fornecedor.loja_id&&fornecedor.loja_id!==lojaAtiva?.id){selecionarLoja(fornecedor.loja_id);return;}
    const estaAtivo =
      fornecedor.ativo === 1;

    const acao =
      estaAtivo
        ? 'desativar'
        : 'reativar';

    const confirmar =
      window.confirm(
        estaAtivo
          ? `Deseja desativar ${fornecedor.nome_fantasia || fornecedor.razao_social}?`
          : `Deseja reativar ${fornecedor.nome_fantasia || fornecedor.razao_social}?`
      );

    if (!confirmar) {
      return;
    }

    try {
      setErro('');
      setMensagem('');

      const resposta =
        await fetchAutenticado(
          `${API_URL}/fornecedores/${fornecedor.id}/${acao}`,
          {
            method: 'PATCH',
          }
        );

      const dados =
        await resposta.json();

      if (!resposta.ok) {
        throw new Error(
          dados.erro ||
            'Erro ao alterar fornecedor.'
        );
      }

      setMensagem(
        estaAtivo
          ? 'Fornecedor desativado.'
          : 'Fornecedor reativado.'
      );

      await atualizarTela();
    } catch (error: any) {
      setErro(
        error?.message ||
          'Erro ao alterar fornecedor.'
      );
    }
  }

  /*
  |--------------------------------------------------------------------------
  | FILTROS
  |--------------------------------------------------------------------------
  */

  const fornecedoresFiltrados =
    useMemo(() => {
      const termo =
        busca
          .trim()
          .toLowerCase();

      return fornecedores.filter(
        (fornecedor) => {
          if (
            filtroStatus ===
              'ATIVOS' &&
            fornecedor.ativo !== 1
          ) {
            return false;
          }

          if (
            filtroStatus ===
              'INATIVOS' &&
            fornecedor.ativo === 1
          ) {
            return false;
          }

          if (!termo) {
            return true;
          }

          const texto = [
            fornecedor.nome_fantasia,
            fornecedor.razao_social,
            fornecedor.cpf_cnpj,
            fornecedor.telefone,
            fornecedor.whatsapp,
            fornecedor.email,
            fornecedor.contato_nome,
            fornecedor.cidade,
            fornecedor.estado,
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();

          return texto.includes(
            termo
          );
        }
      );
    }, [
      fornecedores,
      busca,
      filtroStatus,
    ]);

  function limparFiltros() {
    setBusca('');
    setFiltroStatus('TODOS');
  }

  /*
  |--------------------------------------------------------------------------
  | RENDER
  |--------------------------------------------------------------------------
  */

  return (
    <div className="fornecedores-page">
      <div className="fornecedores-compartilhados" style={{padding:'12px 0'}}><strong>Cadastros compartilhados entre usuários</strong><p>{consolidado?'Exibindo as unidades autorizadas.':'Exibindo somente '+(lojaAtiva?.nome||'a unidade ativa')+'.'} Novos cadastros serão salvos em {lojaAtiva?.nome}. As listas se atualizam ao voltar à tela e a cada 30 segundos enquanto abertas.</p><label style={{display:'flex',alignItems:'center',gap:8}}><input style={{width:16,height:16}} type="checkbox" checked={consolidado} onChange={e=>setConsolidado(e.target.checked)}/>Ver fornecedores de todas as minhas unidades</label><button type="button" className="secondary-button" disabled={carregando} onClick={()=>void atualizarTela()}>Atualizar fornecedores</button></div>
      <div className="page-header">
        <div>
          <h1>Fornecedores</h1>

          <p>
            Cadastre fornecedores,
            acompanhe produtos e prepare
            seu histórico de compras.
          </p>
        </div>

        <button
          type="button"
          className="primary-button"
          onClick={
            abrirNovoFornecedor
          }
        >
          + Novo Fornecedor
        </button>
      </div>

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

      <section className="fornecedores-indicadores">
        <div className="fornecedor-indicador-card">
          <div className="fornecedor-indicador-icone">
            F
          </div>

          <div>
            <span>
              Fornecedores
            </span>

            <strong>
              {
                resumo.totalFornecedores
              }
            </strong>

            <small>
              cadastrados
            </small>
          </div>
        </div>

        <div className="fornecedor-indicador-card">
          <div className="fornecedor-indicador-icone sucesso">
            ✓
          </div>

          <div>
            <span>Ativos</span>

            <strong>
              {resumo.ativos}
            </strong>

            <small>
              disponíveis para compras
            </small>
          </div>
        </div>

        <div className="fornecedor-indicador-card">
          <div className="fornecedor-indicador-icone inativo">
            –
          </div>

          <div>
            <span>Inativos</span>

            <strong>
              {resumo.inativos}
            </strong>

            <small>
              cadastros desativados
            </small>
          </div>
        </div>

        <div className="fornecedor-indicador-card">
          <div className="fornecedor-indicador-icone produto">
            ▦
          </div>

          <div>
            <span>
              Produtos vinculados
            </span>

            <strong>
              {
                resumo.produtosVinculados
              }
            </strong>

            <small>
              relações comerciais
            </small>
          </div>
        </div>

        <div className="fornecedor-indicador-card">
          <div className="fornecedor-indicador-icone compra">
            R$
          </div>

          <div>
            <span>
              Compras registradas
            </span>

            <strong>
              {
                resumo.comprasRegistradas
              }
            </strong>

            <small>
              preços no histórico
            </small>
          </div>
        </div>
      </section>

      {mostrarFormulario && (
        <form
          className="fornecedor-form"
          onSubmit={
            salvarFornecedor
          }
        >
          <div className="fornecedor-form-header">
            <div>
              <h2>
                {fornecedorEditando
                  ? 'Editar fornecedor'
                  : 'Novo fornecedor'}
              </h2>

              <p>
                Preencha os dados
                comerciais e de contato.
              </p>
            </div>

            <button
              type="button"
              className="secondary-button"
              onClick={
                cancelarFormulario
              }
            >
              Fechar
            </button>
          </div>

          <div className="fornecedor-secao">
            <div className="fornecedor-secao-titulo">
              <h3>
                Dados principais
              </h3>

              <p>
                Identificação do
                fornecedor.
              </p>
            </div>

            <div className="form-grid">
              <div className="form-group">
                <label>
                  Tipo de pessoa
                </label>

                <select
                  value={
                    formulario.tipoPessoa
                  }
                  onChange={(event) =>
                    alterarCampo(
                      'tipoPessoa',
                      event.target
                        .value as
                        | 'FISICA'
                        | 'JURIDICA'
                    )
                  }
                >
                  <option value="JURIDICA">
                    Pessoa Jurídica
                  </option>

                  <option value="FISICA">
                    Pessoa Física
                  </option>
                </select>
              </div>

              <div className="form-group">
                <label>
                  {formulario.tipoPessoa ===
                  'JURIDICA'
                    ? 'Razão Social *'
                    : 'Nome *'}
                </label>

                <input
                  value={
                    formulario.razaoSocial
                  }
                  onChange={(event) =>
                    alterarCampo(
                      'razaoSocial',
                      event.target.value
                    )
                  }
                  placeholder={
                    formulario.tipoPessoa ===
                    'JURIDICA'
                      ? 'Razão social'
                      : 'Nome completo'
                  }
                  required
                />
              </div>

              <div className="form-group">
                <label>
                  Nome Fantasia
                </label>

                <input
                  value={
                    formulario.nomeFantasia
                  }
                  onChange={(event) =>
                    alterarCampo(
                      'nomeFantasia',
                      event.target.value
                    )
                  }
                  placeholder="Nome comercial"
                />
              </div>

              <div className="form-group">
                <label>
                  {formulario.tipoPessoa ===
                  'JURIDICA'
                    ? 'CNPJ'
                    : 'CPF'}
                </label>

                <input
                  value={
                    formulario.cpfCnpj
                  }
                  onChange={(event) =>
                    alterarCampo(
                      'cpfCnpj',
                      somenteNumeros(
                        event.target.value
                      )
                    )
                  }
                  placeholder={
                    formulario.tipoPessoa ===
                    'JURIDICA'
                      ? '00.000.000/0000-00'
                      : '000.000.000-00'
                  }
                />
              </div>

              <div className="form-group">
                <label>
                  Inscrição Estadual
                </label>

                <input
                  value={
                    formulario
                      .inscricaoEstadual
                  }
                  onChange={(event) =>
                    alterarCampo(
                      'inscricaoEstadual',
                      event.target.value
                    )
                  }
                />
              </div>

              <div className="form-group">
                <label>
                  Inscrição Municipal
                </label>

                <input
                  value={
                    formulario
                      .inscricaoMunicipal
                  }
                  onChange={(event) =>
                    alterarCampo(
                      'inscricaoMunicipal',
                      event.target.value
                    )
                  }
                />
              </div>
            </div>
          </div>

          <div className="fornecedor-secao">
            <div className="fornecedor-secao-titulo">
              <h3>
                Contato comercial
              </h3>

              <p>
                Telefones e canais de
                atendimento.
              </p>
            </div>

            <div className="form-grid">
              <div className="form-group">
                <label>Telefone</label>

                <input
                  value={
                    formulario.telefone
                  }
                  onChange={(event) =>
                    alterarCampo(
                      'telefone',
                      event.target.value
                    )
                  }
                />
              </div>

              <div className="form-group">
                <label>WhatsApp</label>

                <input
                  value={
                    formulario.whatsapp
                  }
                  onChange={(event) =>
                    alterarCampo(
                      'whatsapp',
                      event.target.value
                    )
                  }
                />
              </div>

              <div className="form-group">
                <label>E-mail</label>

                <input
                  type="email"
                  value={
                    formulario.email
                  }
                  onChange={(event) =>
                    alterarCampo(
                      'email',
                      event.target.value
                    )
                  }
                />
              </div>

              <div className="form-group">
                <label>Site</label>

                <input
                  value={
                    formulario.site
                  }
                  onChange={(event) =>
                    alterarCampo(
                      'site',
                      event.target.value
                    )
                  }
                  placeholder="www.fornecedor.com.br"
                />
              </div>
            </div>
          </div>

          <div className="fornecedor-secao">
            <div className="fornecedor-secao-titulo">
              <h3>
                Pessoa de contato
              </h3>

              <p>
                Representante ou vendedor
                responsável.
              </p>
            </div>

            <div className="form-grid">
              <div className="form-group">
                <label>
                  Nome do contato
                </label>

                <input
                  value={
                    formulario.contatoNome
                  }
                  onChange={(event) =>
                    alterarCampo(
                      'contatoNome',
                      event.target.value
                    )
                  }
                />
              </div>

              <div className="form-group">
                <label>Cargo</label>

                <input
                  value={
                    formulario.contatoCargo
                  }
                  onChange={(event) =>
                    alterarCampo(
                      'contatoCargo',
                      event.target.value
                    )
                  }
                  placeholder="Ex.: Vendedor"
                />
              </div>

              <div className="form-group">
                <label>
                  Telefone do contato
                </label>

                <input
                  value={
                    formulario
                      .contatoTelefone
                  }
                  onChange={(event) =>
                    alterarCampo(
                      'contatoTelefone',
                      event.target.value
                    )
                  }
                />
              </div>

              <div className="form-group">
                <label>
                  E-mail do contato
                </label>

                <input
                  type="email"
                  value={
                    formulario
                      .contatoEmail
                  }
                  onChange={(event) =>
                    alterarCampo(
                      'contatoEmail',
                      event.target.value
                    )
                  }
                />
              </div>
            </div>
          </div>

          <div className="fornecedor-secao">
            <div className="fornecedor-secao-titulo">
              <h3>Endereço</h3>

              <p>
                Endereço comercial ou
                fiscal.
              </p>
            </div>

            <div className="form-grid">
              <div className="form-group">
                <label>CEP</label>

                <input
                  value={
                    formulario.cep
                  }
                  onChange={(event) =>
                    alterarCampo(
                      'cep',
                      somenteNumeros(
                        event.target.value
                      )
                    )
                  }
                  placeholder="00000-000"
                />
              </div>

              <div className="form-group">
                <label>Endereço</label>

                <input
                  value={
                    formulario.endereco
                  }
                  onChange={(event) =>
                    alterarCampo(
                      'endereco',
                      event.target.value
                    )
                  }
                />
              </div>

              <div className="form-group">
                <label>Número</label>

                <input
                  value={
                    formulario.numero
                  }
                  onChange={(event) =>
                    alterarCampo(
                      'numero',
                      event.target.value
                    )
                  }
                />
              </div>

              <div className="form-group">
                <label>
                  Complemento
                </label>

                <input
                  value={
                    formulario.complemento
                  }
                  onChange={(event) =>
                    alterarCampo(
                      'complemento',
                      event.target.value
                    )
                  }
                />
              </div>

              <div className="form-group">
                <label>Bairro</label>

                <input
                  value={
                    formulario.bairro
                  }
                  onChange={(event) =>
                    alterarCampo(
                      'bairro',
                      event.target.value
                    )
                  }
                />
              </div>

              <div className="form-group">
                <label>Cidade</label>

                <input
                  value={
                    formulario.cidade
                  }
                  onChange={(event) =>
                    alterarCampo(
                      'cidade',
                      event.target.value
                    )
                  }
                />
              </div>

              <div className="form-group">
                <label>Estado</label>

                <input
                  maxLength={2}
                  value={
                    formulario.estado
                  }
                  onChange={(event) =>
                    alterarCampo(
                      'estado',
                      event.target.value
                        .toUpperCase()
                    )
                  }
                  placeholder="PR"
                />
              </div>
            </div>
          </div>

          <div className="fornecedor-secao">
            <div className="fornecedor-secao-titulo">
              <h3>
                Condições comerciais
              </h3>

              <p>
                Informações para futuras
                compras.
              </p>
            </div>

            <div className="form-grid">
              <div className="form-group">
                <label>
                  Prazo de pagamento
                </label>

                <input
                  type="number"
                  min="0"
                  value={
                    formulario
                      .prazoPagamentoDias
                  }
                  onChange={(event) =>
                    alterarCampo(
                      'prazoPagamentoDias',
                      event.target.value
                    )
                  }
                />

                <small>
                  Informe o prazo médio
                  em dias.
                </small>
              </div>

              <div className="form-group">
                <label>Status</label>

                <select
                  value={
                    formulario.ativo
                      ? '1'
                      : '0'
                  }
                  onChange={(event) =>
                    alterarCampo(
                      'ativo',
                      event.target.value ===
                        '1'
                    )
                  }
                >
                  <option value="1">
                    Ativo
                  </option>

                  <option value="0">
                    Inativo
                  </option>
                </select>
              </div>

              <div className="form-group campo-largo">
                <label>
                  Observações
                </label>

                <textarea
                  value={
                    formulario.observacao
                  }
                  onChange={(event) =>
                    alterarCampo(
                      'observacao',
                      event.target.value
                    )
                  }
                  rows={4}
                  placeholder="Condições especiais, dias de entrega, vendedor, pedido mínimo..."
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
              type="submit"
              className="primary-button"
              disabled={salvando}
            >
              {salvando
                ? 'Salvando...'
                : fornecedorEditando
                ? 'Salvar Alterações'
                : 'Cadastrar Fornecedor'}
            </button>
          </div>
        </form>
      )}

      <ResponsiveFilters activeCount={[busca, filtroStatus !== 'TODOS' ? filtroStatus : ''].filter(Boolean).length} onClear={limparFiltros}><section className="fornecedores-filtros-card">
        <div className="fornecedores-filtros-header">
          <div>
            <h3>
              Lista de fornecedores
            </h3>

            <p>
              Pesquise por nome,
              documento, telefone,
              contato ou cidade.
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

        <div className="fornecedores-filtros">
          <div className="fornecedor-busca">
            <span>⌕</span>

            <input
              value={busca}
              onChange={(event) =>
                setBusca(
                  event.target.value
                )
              }
              placeholder="Buscar fornecedor..."
            />
          </div>

          <div>
            <label>Status</label>

            <select
              value={filtroStatus}
              onChange={(event) =>
                setFiltroStatus(
                  event.target
                    .value as
                    | 'TODOS'
                    | 'ATIVOS'
                    | 'INATIVOS'
                )
              }
            >
              <option value="TODOS">
                Todos
              </option>

              <option value="ATIVOS">
                Ativos
              </option>

              <option value="INATIVOS">
                Inativos
              </option>
            </select>
          </div>
        </div>
      </section></ResponsiveFilters>

      <div className="fornecedores-lista-info">
        <span>
          <strong>
            {
              fornecedoresFiltrados.length
            }
          </strong>{' '}
          fornecedor(es) encontrado(s)
        </span>
      </div>

      <div className="fornecedores-table">
        <table className="mobile-record-table">
          <thead>
            <tr>
              <th scope="col">Fornecedor</th>
              <th scope="col">CPF/CNPJ</th>
              <th scope="col">Contato</th>
              <th scope="col">Localização</th>
              <th scope="col">Produtos</th>
              <th scope="col">Compras</th>
              <th scope="col">Prazo</th>
              <th scope="col">Status</th>
              <th scope="col">Ações</th>
            </tr>
          </thead>

          <tbody>
            {carregando ? (
              <tr>
                <td
                  colSpan={9}
                  className="empty-table"
                >
                  Carregando
                  fornecedores...
                </td>
              </tr>
            ) : fornecedoresFiltrados
                .length === 0 ? (
              <tr>
                <td
                  colSpan={9}
                  className="empty-table"
                >
                  Nenhum fornecedor
                  encontrado.
                </td>
              </tr>
            ) : (
              fornecedoresFiltrados.map(
                (fornecedor) => (
                  <tr
                    key={
                      fornecedor.id
                    }
                  >
                    <td data-label="Fornecedor">
                      <div className="fornecedor-identificacao">
                        <div className="fornecedor-avatar">
                          {(
                            fornecedor
                              .nome_fantasia ||
                            fornecedor
                              .razao_social ||
                            'F'
                          )
                            .charAt(0)
                            .toUpperCase()}
                        </div>

                        <div>
                          <strong>
                            {fornecedor
                              .nome_fantasia ||
                              fornecedor
                                .razao_social}
                          </strong>
                          {fornecedor.loja_nome&&<small style={{display:'block',marginTop:5}}>Unidade: {fornecedor.loja_nome}</small>}

                          {fornecedor
                            .nome_fantasia && (
                            <span>
                              {
                                fornecedor.razao_social
                              }
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    <td data-label="CPF/CNPJ">
                      <span className="fornecedor-documento">
                        {formatarDocumento(
                          fornecedor.cpf_cnpj
                        )}
                      </span>
                    </td>

                    <td data-label="Contato">
                      <div className="fornecedor-contato">
                        <strong>
                          {formatarTelefone(
                            fornecedor.whatsapp ||
                              fornecedor.telefone
                          )}
                        </strong>

                        <span>
                          {fornecedor.email ||
                            fornecedor
                              .contato_nome ||
                            '-'}
                        </span>
                      </div>
                    </td>

                    <td data-label="Localização">
                      <div className="fornecedor-localizacao">
                        <strong>
                          {fornecedor.cidade ||
                            '-'}
                          {fornecedor.estado
                            ? `/${fornecedor.estado}`
                            : ''}
                        </strong>

                        {fornecedor.cep && (
                          <span>
                            CEP{' '}
                            {formatarCep(
                              fornecedor.cep
                            )}
                          </span>
                        )}
                      </div>
                    </td>

                    <td data-label="Produtos">
                      <span className="fornecedor-numero-badge">
                        {Number(
                          fornecedor
                            .total_produtos ||
                            0
                        )}
                      </span>
                    </td>

                    <td data-label="Compras">
                      <span className="fornecedor-numero-badge">
                        {Number(
                          fornecedor
                            .total_compras_registradas ||
                            0
                        )}
                      </span>
                    </td>

                    <td data-label="Prazo">
                      <span className="fornecedor-prazo">
                        {Number(
                          fornecedor
                            .prazo_pagamento_dias ||
                            0
                        )}{' '}
                        dias
                      </span>
                    </td>

                    <td data-label="Status">
                      <span
                        className={`fornecedor-status ${
                          fornecedor.ativo ===
                          1
                            ? 'ativo'
                            : 'inativo'
                        }`}
                      >
                        {fornecedor.ativo ===
                        1
                          ? 'Ativo'
                          : 'Inativo'}
                      </span>
                    </td>

                    <td data-label="Ações">
                      <div className="fornecedor-acoes">
                        <button
                          type="button"
                          className="editar-button"
                          onClick={() =>
                            editarFornecedor(
                              fornecedor
                            )
                          }
                        >
                          {fornecedor.loja_id&&fornecedor.loja_id!==lojaAtiva?.id?`Selecionar ${fornecedor.loja_nome||'unidade'}`:'Editar'}
                        </button>

                        <button
                          type="button"
                          className={
                            fornecedor.ativo ===
                            1
                              ? 'desativar-button'
                              : 'reativar-button'
                          }
                          onClick={() =>
                            alterarStatus(
                              fornecedor
                            )
                          }
                        >
                          {fornecedor.ativo ===
                          1
                            ? 'Desativar'
                            : 'Reativar'}
                        </button>
                      </div>
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