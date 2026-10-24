import {useDadosCompartilhados} from '../hooks/useDadosCompartilhados';
import { apiFetch, sincronizarFechamentosFinanceiro } from '../services/apiClient';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import AppShell from '../components/AppShell';
import Icon from '../components/Icon';

import Produtos from './Produtos';
import Unidades from './Unidades';
import Estoque from './Estoque';
import Fornecedores from './Fornecedores';
import Compras from './Compras';
import Financeiro from './Financeiro';
import PDV from './PDV';
import ClientesPrazo from './ClientesPrazo';
import Vendas from './Vendas';
import FechamentoDiario from './FechamentoDiario';
import Usuarios from './Usuarios';
import { useLoja } from '../contexts/LojaContext';
import HistoricoCaixas from './HistoricoCaixas';

function decodePageHash() {
  try { return decodeURIComponent(window.location.hash.slice(1)) || 'Visão Geral'; }
  catch { return 'Visão Geral'; }
}

const API =
  '/api';

type UsuarioLogado = {
  id: number;
  nome: string;
  email: string;
  perfil: string;
  papelNome?: string;
  permissoes?: string[];
};

type ResumoFinanceiro = {
  saldoMes: number;
  entradasMes: number;
  saidasMes: number;
  aPagar: number;
  aReceber: number;
  atrasados: number;
  venceHoje: number;
  proximos7Dias: number;
};

type DashboardProps = {
  onLogout?: () => void;
  modoPdvDireto?: boolean;
};

const resumoVazio: ResumoFinanceiro = {
  saldoMes: 0,
  entradasMes: 0,
  saidasMes: 0,
  aPagar: 0,
  aReceber: 0,
  atrasados: 0,
  venceHoje: 0,
  proximos7Dias: 0,
};

function moeda(
  valor: number | null | undefined
) {
  return Number(
    valor || 0
  ).toLocaleString(
    'pt-BR',
    {
      style: 'currency',
      currency: 'BRL',
    }
  );
}

function nomePerfil(
  perfil: string
) {
  const p =
    String(
      perfil || ''
    ).toUpperCase();

  if (
    p === 'ADMINISTRADOR'
  ) {
    return 'Sócio-Proprietário';
  }

  if (p === 'CEO') {
    return 'CEO';
  }

  if (p === 'OPERADOR') {
    return 'Operador';
  }

  if (p === 'CAIXA') {
    return 'Caixa';
  }

  return perfil || 'Usuário';
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

export default function Dashboard({
  onLogout,
  modoPdvDireto = false,
}: DashboardProps) {
  const { lojaAtiva, lojas, carregando: carregandoLoja, erro: erroLoja, atualizarLojas } = useLoja();
  const [usuario, setUsuario] = useState<UsuarioLogado | null>(() => {
    try { return JSON.parse(localStorage.getItem('usuarioLogado') || 'null'); } catch { return null; }
  });
  const perfil = String(usuario?.perfil || '').toUpperCase();
  const permissoes = usuario?.permissoes || [];
  const podeFinanceiro = permissoes.includes('financeiro');
  const somentePdv = permissoes.length === 1 && permissoes.includes('pdv');
  const podeConsultarHistorico = permissoes.includes('caixas');
  const resumoVersion = useRef(0);
  const [unidadeResumoId, setUnidadeResumoId] = useState('');
  const lojasResumoIds = lojas.map(loja => loja.id).join(',');

  useDadosCompartilhados(()=>{if(paginaAtiva==='Visão Geral')return carregarResumoFinanceiro();});

  useEffect(() => {
    let disposed = false;
    async function refresh() {
      try {
        const response = await fetchAutenticado('/api/auth/me');
        const data = await response.json();
        if (disposed) return;
        if (!response.ok || !data.usuario) { fazerLogout(); return; }
        localStorage.setItem('usuarioLogado', JSON.stringify(data.usuario));
        setUsuario(data.usuario);
      } catch { /* A próxima requisição permite tentar novamente após falha de conexão. */ }
    }
    window.addEventListener('focus', refresh);
    window.addEventListener('nm:access-updated', refresh);
    return () => { disposed = true; window.removeEventListener('focus', refresh); window.removeEventListener('nm:access-updated', refresh); };
  }, []);

  const [
    paginaAtiva,
    setPaginaAtiva,
  ] = useState(() =>
    modoPdvDireto || somentePdv ? 'PDV' : decodePageHash()
  );

  const [
    resumoFinanceiro,
    setResumoFinanceiro,
  ] =
    useState<ResumoFinanceiro>(
      resumoVazio
    );

  const [
    carregandoFinanceiro,
    setCarregandoFinanceiro,
  ] = useState(false);

  const [
    erroFinanceiro,
    setErroFinanceiro,
  ] = useState('');

  const menuItems = useMemo(() => {
    const modules: [string, string[]][] = [
      ['Visão Geral', ['visao']], ['Produtos', ['produtos']], ['Estoque', ['estoque']],
      ['Compras', ['compras']], ['Financeiro', ['financeiro']], ['Contas / Boletos', ['contas']],
      ['Clientes / A Prazo', ['clientes']], ['Vendas', ['vendas']], ['Fiscal', ['fiscal']],
      ['Fornecedores', ['fornecedores']], ['Unidades', ['unidades']], ['Fechamento Diário', ['fechamento']],
      ['Histórico do caixa', ['caixas']], ['Usuários e papéis', ['usuarios']], ['PDV', ['pdv']],
    ];
    return modules.filter(([, codes]) => codes.some(code => usuario?.permissoes?.includes(code))).map(([label]) => label);
  }, [usuario]);

  useEffect(() => { if (!podeFinanceiro) setResumoFinanceiro(resumoVazio); else if (!carregandoLoja && paginaAtiva === 'Visão Geral') void carregarResumoFinanceiro(); }, [podeFinanceiro, carregandoLoja, lojasResumoIds, unidadeResumoId, paginaAtiva]);

  useEffect(() => {
    if (modoPdvDireto || somentePdv) {
      if (paginaAtiva !== 'PDV') {
        setPaginaAtiva('PDV');
      }
      if (somentePdv && window.location.hash !== '#PDV') {
        window.history.replaceState(null, '', '#PDV');
      }
      return;
    }

    if (
      !menuItems.includes(
        paginaAtiva
      )
    ) {
      setPaginaAtiva(menuItems[0] || 'Sem acesso');
    }
  }, [
    menuItems,
    paginaAtiva,
    modoPdvDireto,
    somentePdv,
  ]);

  function navegar(page: string) {
    setPaginaAtiva(page);
    window.location.hash = encodeURIComponent(page);
  }

  useEffect(() => {
    const update = () => setPaginaAtiva(decodePageHash());
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);

  async function carregarResumoFinanceiro() {
    const version = ++resumoVersion.current;
    setCarregandoFinanceiro(
      true
    );
    setErroFinanceiro('');

    try {
      const selecionada = unidadeResumoId && lojas.some(loja => String(loja.id) === unidadeResumoId) ? unidadeResumoId : '';
      const unidades = selecionada ? lojas.filter(loja => String(loja.id) === selecionada) : lojas;
      for (const unidade of unidades) {
        if (version !== resumoVersion.current) return;
        await sincronizarFechamentosFinanceiro(unidade.id);
      }
      const parametros = new URLSearchParams({ consolidado: '1' });
      if (selecionada) parametros.set('lojaId', selecionada);
      const resposta =
        await fetchAutenticado(
          `${API}/financeiro/resumo?${parametros}`
        );

      const dados =
        await resposta.json();
      if (version !== resumoVersion.current) return;

      if (
        !resposta.ok ||
        !dados.sucesso
      ) {
        throw new Error(
          dados.erro ||
            'Não foi possível carregar os indicadores financeiros.'
        );
      }

      setResumoFinanceiro({
        ...resumoVazio,
        ...(dados.resumo ||
          {}),
      });
    } catch (error: any) {
      if (version !== resumoVersion.current) return;
      setErroFinanceiro(
        error?.message ||
          'Não foi possível carregar os indicadores financeiros.'
      );
    } finally {
      if (version === resumoVersion.current) setCarregandoFinanceiro(
        false
      );
    }
  }

  function fazerLogout() {
    if (somentePdv) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
    localStorage.removeItem(
      'usuarioLogado'
    );

    localStorage.removeItem(
      'token'
    );

    if (onLogout) {
      onLogout();
      return;
    }

    window.location.reload();
  }

  function paginaEmDesenvolvimento(
    titulo: string,
    descricao: string
  ) {
    return (
      <>
        <div className="page-header">
          <div>
            <h1>{titulo}</h1>
            <p>{descricao}</p>
          </div>
        </div>

        <section
          className="dashboard-card"
          style={{
            marginTop: 24,
            maxWidth: 720,
          }}
        >
          <span>
            Módulo em preparação
          </span>

          <strong
            style={{
              fontSize: 22,
            }}
          >
            {titulo}
          </strong>

          <small>
            As permissões deste
            módulo já foram
            definidas para o seu
            perfil.
          </small>
        </section>
      </>
    );
  }

  function renderizarVisaoGeral() {
    const saldoPositivo = resumoFinanceiro.saldoMes >= 0;

    const cardsFinanceiros = [
      {
        titulo: 'Entradas do mês',
        valor: resumoFinanceiro.entradasMes,
        descricao: 'Recebimentos e fechamentos diários do período',
        icone: '↑',
        classe: 'entrada',
      },
      {
        titulo: 'Saídas do mês',
        valor: resumoFinanceiro.saidasMes,
        descricao: 'Pagamentos registrados',
        icone: '↓',
        classe: 'saida',
      },
      {
        titulo: 'Saldo do mês',
        valor: resumoFinanceiro.saldoMes,
        descricao: 'Entradas menos saídas',
        icone: 'R$',
        classe: saldoPositivo ? 'saldo-positivo' : 'saldo-negativo',
      },
      {
        titulo: 'Contas a pagar',
        valor: resumoFinanceiro.aPagar,
        descricao: 'Compromissos pendentes',
        icone: '↗',
        classe: 'pagar',
      },
    ];

    const compromissos = [
      {
        titulo: 'Contas a receber',
        valor: resumoFinanceiro.aReceber,
        detalhe: 'Recebimentos pendentes',
        classe: 'receber',
      },
      {
        titulo: 'Atrasados',
        valor: resumoFinanceiro.atrasados,
        detalhe: 'Valores vencidos',
        classe: 'atrasado',
      },
      {
        titulo: 'Vence hoje',
        valor: resumoFinanceiro.venceHoje,
        detalhe: 'Compromissos de hoje',
        classe: 'hoje',
      },
      {
        titulo: 'Próximos 7 dias',
        valor: resumoFinanceiro.proximos7Dias,
        detalhe: 'Vencimentos próximos',
        classe: 'proximos',
      },
    ];

    return (
      <>
        <div className="page-header">
          <div>
            <span className="page-kicker">PAINEL DO NEGÓCIO</span>
            <h1>Visão geral</h1>
            <p>Seu mercadinho, acompanhado de perto.</p>
          </div>
          <span className="overview-date"><Icon name="calendar" size={17} />{new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
        </div>

        {podeFinanceiro && (
          <section className="overview-financeiro">
            <div className="overview-topo">
              <div>
                <span className="overview-eyebrow">RESUMO FINANCEIRO</span>
                <h2>Indicadores do mês</h2>
                <p>{unidadeResumoId ? `Entradas, saídas e compromissos de ${lojas.find(loja => String(loja.id) === unidadeResumoId)?.nome || 'unidade selecionada'}.` : 'Entradas, saídas e compromissos de todas as unidades autorizadas.'}</p>
              </div>

              <label style={{display:'grid',gap:5,minWidth:200,fontSize:13}}>
                Unidades no resumo
                <select aria-label="Unidades no resumo" value={unidadeResumoId} onChange={e => setUnidadeResumoId(e.target.value)}
                  style={{padding:'9px 12px',minHeight:40,border:'1px solid #d1d5db',borderRadius:8,background:'#fff'}}>
                  <option value="">Todas as unidades</option>
                  {lojas.map(loja => <option key={loja.id} value={loja.id}>{loja.nome}</option>)}
                </select>
              </label>
              <button
                type="button"
                className="overview-atualizar"
                onClick={carregarResumoFinanceiro}
                disabled={carregandoFinanceiro}
              >
                <Icon name="refresh" size={16} />{carregandoFinanceiro ? 'Atualizando...' : 'Atualizar'}
              </button>
            </div>

            {erroFinanceiro && (
              <div className="overview-erro" role="alert">{erroFinanceiro}</div>
            )}

            <div className="overview-cards-principais">
              {cardsFinanceiros.map((card) => (
                <article
                  key={card.titulo}
                  className={`overview-card-principal ${card.classe}`}
                >
                  <div className="overview-card-icone"><Icon name={card.classe === 'entrada' ? 'down' : card.classe === 'saida' ? 'up' : card.classe === 'pagar' ? 'receipt' : 'wallet'} size={22} /></div>
                  <div className="overview-card-conteudo">
                    <span>{card.titulo}</span>
                    <strong>
                      {carregandoFinanceiro ? '...' : moeda(card.valor)}
                    </strong>
                    <small>{card.descricao}</small>
                  </div>
                </article>
              ))}
            </div>

            <div className="overview-grid-inferior">
              <section className="overview-painel">
                <div className="overview-painel-titulo">
                  <div>
                    <span className="overview-eyebrow">COMPROMISSOS</span>
                    <h3>Contas e vencimentos</h3>
                  </div>
                </div>

                <div className="overview-compromissos">
                  {compromissos.map((item) => (
                    <div
                      key={item.titulo}
                      className={`overview-compromisso ${item.classe}`}
                    >
                      <span>{item.titulo}</span>
                      <strong>
                        {carregandoFinanceiro ? '...' : moeda(item.valor)}
                      </strong>
                      <small>{item.detalhe}</small>
                    </div>
                  ))}
                </div>
              </section>

              <aside className="overview-painel overview-resumo">
                <span className="overview-eyebrow">RESULTADO DO MÊS</span>
                <h3>Resumo</h3>

                <div className="overview-resumo-linha">
                  <span>Entradas</span>
                  <strong className="valor-entrada">
                    {carregandoFinanceiro
                      ? '...'
                      : moeda(resumoFinanceiro.entradasMes)}
                  </strong>
                </div>

                <div className="overview-resumo-linha">
                  <span>Saídas</span>
                  <strong className="valor-saida">
                    {carregandoFinanceiro
                      ? '...'
                      : moeda(resumoFinanceiro.saidasMes)}
                  </strong>
                </div>

                <div className="overview-resumo-divisor" />

                <div className="overview-resumo-linha total">
                  <span>Saldo</span>
                  <strong
                    className={
                      saldoPositivo ? 'valor-entrada' : 'valor-saida'
                    }
                  >
                    {carregandoFinanceiro
                      ? '...'
                      : moeda(resumoFinanceiro.saldoMes)}
                  </strong>
                </div>
              </aside>
            </div>
          </section>
        )}

        <section className="quick-access">
          <div className="section-heading"><div><span className="page-kicker">SUA ROTINA</span><h2>Acesso rápido</h2></div><span>Continue por aqui</span></div>
          <div className="quick-access-list">{[
            ['PDV', 'Abrir caixa e atender', 'cart'], ['Produtos', 'Catálogo e preços', 'box'],
            ['Vendas', 'Vendas e recebimentos', 'chart'], ['Estoque', 'Saldos e movimentações', 'stock'],
            ['Compras', 'Notas e fornecedores', 'cart'], ['Histórico do caixa', 'Aberturas e fechamentos', 'clock'],
            ['Usuários e papéis', 'Equipe e permissões', 'users'],
          ].filter(([title]) => menuItems.includes(title)).slice(0,4).map(([title, detail, icon]) => <button type="button" key={title} onClick={() => navegar(title)}><span className="quick-icon"><Icon name={icon} /></span><span><strong>{title}</strong><small>{detail}</small></span><Icon name="arrow" size={18} /></button>)}</div>
        </section>


      </>
    );
  }

  function renderizarPagina() {
    if (!menuItems.includes(paginaAtiva)) return <div className="page-header"><div><h1>Acesso não disponível</h1><p>Seu papel não tem acesso a este módulo. Solicite a liberação ao responsável.</p></div></div>;
    if (paginaAtiva === 'Usuários e papéis') return <Usuarios />;
    if (paginaAtiva === 'Histórico do caixa') return <HistoricoCaixas />;
    if (
      paginaAtiva ===
      'Visão Geral'
    ) {
      return renderizarVisaoGeral();
    }

    if (
      paginaAtiva ===
      'Produtos'
    ) {
      return <Produtos />;
    }

    if (
      paginaAtiva ===
      'Estoque'
    ) {
      return <Estoque />;
    }

    if (
      paginaAtiva ===
      'Compras'
    ) {
      return <Compras />;
    }

    if (
      paginaAtiva ===
      'Fornecedores'
    ) {
      return <Fornecedores />;
    }

    if (
      paginaAtiva ===
      'Financeiro'
    ) {
      return <Financeiro />;
    }

    if (
      paginaAtiva ===
        'Clientes / A Prazo'
    ) {
      return <ClientesPrazo />;
    }

    if (
      paginaAtiva ===
      'Unidades'
    ) {
      return <Unidades />;
    }

    if (
      paginaAtiva ===
        'Contas / Boletos'
    ) {
      return <Financeiro />;
    }

    if (
      paginaAtiva ===
        'Transferências'
    ) {
      return (
        <Estoque
          abrirInicial="TRANSFERENCIA"
        />
      );
    }



    if (
      paginaAtiva ===
        'PDV'
    ) {
      return <PDV podeConsultarHistorico={podeConsultarHistorico} onLogout={somentePdv ? fazerLogout : undefined} />;
    }

    if (
      paginaAtiva ===
        'Fechamento Diário'
    ) {
      return <FechamentoDiario />;
    }

    if (
      paginaAtiva ===
        'Vendas'
    ) {
      return <Vendas />;
    }

    if (
      paginaAtiva ===
      'Fiscal'
    ) {
      return paginaEmDesenvolvimento(
        'Fiscal',
        'Módulo fiscal do sistema.'
      );
    }

    return (
      <>
        <div className="page-header">
          <div>
            <h1>
              Acesso não
              disponível
            </h1>
            <p>
              Este módulo não está
              liberado para o seu
              perfil.
            </p>
          </div>
        </div>
      </>
    );
  }

  if (carregandoLoja) return <div className="store-context-loading">Carregando seus mercados...</div>;
  if (erroLoja) return <div className="store-context-loading" role="alert"><p>{erroLoja}</p><button type="button" className="secondary-button" onClick={() => void atualizarLojas()}>Tentar novamente</button></div>;

  if ((modoPdvDireto || somentePdv) && menuItems.includes('PDV')) {
    return (
      <div
        style={{
          minHeight: '100vh',
          width: '100%',
          background: '#f5f5f5',
        }}
      >
        <main
          style={{
            minHeight: '100vh',
            width: '100%',
          }}
        >
          <PDV podeConsultarHistorico={podeConsultarHistorico} onLogout={somentePdv ? fazerLogout : undefined} />
        </main>
      </div>
    );
  }

  return <AppShell items={menuItems} active={paginaAtiva} navigate={navegar} logout={fazerLogout} name={usuario?.nome || 'Usuário'} role={usuario?.papelNome || nomePerfil(perfil)}><div key={paginaAtiva === 'PDV' ? 'pdv' : String(lojaAtiva?.id || 'sem-loja')}>{renderizarPagina()}</div></AppShell>;
}
