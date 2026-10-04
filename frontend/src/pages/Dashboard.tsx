import {
  useEffect,
  useMemo,
  useState,
} from 'react';

import logo from '../assets/logo.png';

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

const API =
  '/api';

type UsuarioLogado = {
  id: number;
  nome: string;
  email: string;
  perfil: string;
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

  return fetch(input, {
    ...init,
    headers,
  });
}

export default function Dashboard({
  onLogout,
  modoPdvDireto = false,
}: DashboardProps) {
  const usuario =
    useMemo<UsuarioLogado | null>(
      () => {
        try {
          const salvo =
            localStorage.getItem(
              'usuarioLogado'
            );

          return salvo
            ? JSON.parse(
                salvo
              )
            : null;
        } catch {
          return null;
        }
      },
      []
    );

  const perfil =
    String(
      usuario?.perfil || ''
    ).toUpperCase();

  const acessoTotal =
    perfil ===
      'ADMINISTRADOR' ||
    perfil === 'CEO';

  const operador =
    perfil === 'OPERADOR';

  const caixa =
    perfil === 'CAIXA';

  const [
    paginaAtiva,
    setPaginaAtiva,
  ] = useState(
    modoPdvDireto ? 'PDV' : 'Visão Geral'
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

  const menuItems =
    useMemo(() => {
      if (acessoTotal) {
        return [
          'Visão Geral',
          'Produtos',
          'Estoque',
          'Compras',
          'Financeiro',
          'Contas / Boletos',
          'Clientes / A Prazo',
          'Vendas',
          'Fiscal',
          'Fornecedores',
          'Unidades',
        ];
      }

      if (operador) {
        return [
          'Visão Geral',
          'Produtos',
          'Estoque',
          'Compras',
          'Contas / Boletos',
          'Fornecedores',
          'Unidades',
        ];
      }

      if (caixa) {
        return [
          'Visão Geral',
          'Vendas',
          'Estoque',
          'Transferências',
          'Fechamento Diário',
          'PDV',
        ];
      }

      return [
        'Visão Geral',
      ];
    }, [
      acessoTotal,
      operador,
      caixa,
    ]);

  useEffect(() => {
    if (acessoTotal) {
      carregarResumoFinanceiro();
    }
  }, [acessoTotal]);

  useEffect(() => {
    if (modoPdvDireto) {
      if (paginaAtiva !== 'PDV') {
        setPaginaAtiva('PDV');
      }
      return;
    }

    if (
      !menuItems.includes(
        paginaAtiva
      )
    ) {
      setPaginaAtiva(
        'Visão Geral'
      );
    }
  }, [
    menuItems,
    paginaAtiva,
    modoPdvDireto,
  ]);

  async function carregarResumoFinanceiro() {
    setCarregandoFinanceiro(
      true
    );
    setErroFinanceiro('');

    try {
      const resposta =
        await fetchAutenticado(
          `${API}/financeiro/resumo`
        );

      const dados =
        await resposta.json();

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
      setErroFinanceiro(
        error?.message ||
          'Não foi possível carregar os indicadores financeiros.'
      );
    } finally {
      setCarregandoFinanceiro(
        false
      );
    }
  }

  function fazerLogout() {
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
        descricao: 'Valores recebidos no período',
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
            <h1>Visão Geral</h1>
            <p>Bem-vindo ao painel do Nosso Mercadinho.</p>
          </div>
        </div>

        {acessoTotal && (
          <section className="overview-financeiro">
            <div className="overview-topo">
              <div>
                <span className="overview-eyebrow">RESUMO FINANCEIRO</span>
                <h2>Indicadores do mês</h2>
                <p>Visão consolidada das entradas, saídas e compromissos.</p>
              </div>

              <button
                type="button"
                className="overview-atualizar"
                onClick={carregarResumoFinanceiro}
                disabled={carregandoFinanceiro}
              >
                {carregandoFinanceiro ? 'Atualizando...' : '↻ Atualizar'}
              </button>
            </div>

            {erroFinanceiro && (
              <div className="overview-erro">{erroFinanceiro}</div>
            )}

            <div className="overview-cards-principais">
              {cardsFinanceiros.map((card) => (
                <article
                  key={card.titulo}
                  className={`overview-card-principal ${card.classe}`}
                >
                  <div className="overview-card-icone">{card.icone}</div>
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

        {operador && (
          <section className="overview-operacional">
            <div className="overview-topo">
              <div>
                <span className="overview-eyebrow">ÁREA OPERACIONAL</span>
                <h2>Operação e cadastros</h2>
                <p>Produtos, documentos, compras e estoque.</p>
              </div>
            </div>

            <div className="overview-cards-operacionais">
              {[
                ['Produtos', 'Cadastro', 'Manutenção do catálogo'],
                ['Compras / NF-e', 'Entrada', 'Importação e conferência'],
                ['Contas / Boletos', 'Operacional', 'Rotinas autorizadas'],
                ['Estoque', 'Controle', 'Movimentações e conferências'],
              ].map(([titulo, destaque, detalhe]) => (
                <article key={titulo} className="overview-card-operacional">
                  <span>{titulo}</span>
                  <strong>{destaque}</strong>
                  <small>{detalhe}</small>
                </article>
              ))}
            </div>
          </section>
        )}

        {caixa && (
          <section className="overview-operacional">
            <div className="overview-topo">
              <div>
                <span className="overview-eyebrow">OPERAÇÃO DE LOJA</span>
                <h2>Caixa e movimentação</h2>
                <p>Atalhos operacionais da Matriz.</p>
              </div>
            </div>

            <div className="overview-cards-operacionais">
              {[
                ['Vendas', 'Consultar', 'Vendas do dia e correções'],
                ['Estoque', 'Movimentar', 'Contagens, reposições e ajustes'],
                ['Transferências', 'Produtos', 'Entre unidades e locais'],
                ['Fechamento', 'Matriz', 'Lançamento manual diário'],
                ['PDV', 'Venda', 'Vendas integradas ao estoque'],
              ].map(([titulo, destaque, detalhe]) => (
                <article key={titulo} className="overview-card-operacional">
                  <span>{titulo}</span>
                  <strong>{destaque}</strong>
                  <small>{detalhe}</small>
                </article>
              ))}
            </div>
          </section>
        )}
      </>
    );
  }

  function renderizarPagina() {
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
      'Financeiro' &&
      acessoTotal
    ) {
      return <Financeiro />;
    }

    if (
      paginaAtiva ===
        'Clientes / A Prazo' &&
      acessoTotal
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
        'Contas / Boletos' &&
      (acessoTotal || operador)
    ) {
      return <Financeiro />;
    }

    if (
      paginaAtiva ===
        'Transferências' &&
      caixa
    ) {
      return (
        <Estoque
          abrirInicial="TRANSFERENCIA"
        />
      );
    }

    if (
      paginaAtiva ===
        'Fechamento Diário' &&
      caixa
    ) {
      return <Financeiro />;
    }

    if (
      paginaAtiva ===
        'PDV' &&
      (caixa || modoPdvDireto)
    ) {
      return <PDV />;
    }

    if (
      paginaAtiva ===
        'Fechamento Diário' &&
      (acessoTotal || caixa)
    ) {
      return <FechamentoDiario />;
    }

    if (
      paginaAtiva ===
        'Vendas' &&
      (acessoTotal || caixa)
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

  if (modoPdvDireto) {
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
          <PDV />
        </main>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <aside className="sidebar">
        <img
          src={logo}
          alt="Nosso Mercadinho"
          className="sidebar-logo"
        />

        <div
          style={{
            margin:
              '-30px 8px 28px',
            padding:
              '14px 12px',
            borderRadius: 12,
            background:
              '#fafafa',
          }}
        >
          <strong
            style={{
              display: 'block',
              fontSize: 14,
            }}
          >
            {usuario?.nome ||
              'Usuário'}
          </strong>

          <span
            style={{
              display: 'block',
              marginTop: 4,
              fontSize: 12,
              color:
                '#737373',
            }}
          >
            {nomePerfil(
              perfil
            )}
          </span>
        </div>

        <nav>
          {menuItems.map(
            (item) => (
              <button
                key={item}
                type="button"
                className={
                  paginaAtiva ===
                  item
                    ? 'menu-item menu-item-active active'
                    : 'menu-item'
                }
                onClick={() =>
                  setPaginaAtiva(
                    item
                  )
                }
              >
                {item}
              </button>
            )
          )}
        </nav>

        <button
          type="button"
          className="menu-item"
          onClick={
            fazerLogout
          }
          style={{
            marginTop: 24,
            color:
              '#b42318',
          }}
        >
          Sair
        </button>
      </aside>

      <main className="dashboard-content">
        {renderizarPagina()}
      </main>
    </div>
  );
}
