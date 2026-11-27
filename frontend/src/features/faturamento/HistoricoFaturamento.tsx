import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useDadosCompartilhados } from '../../hooks/useDadosCompartilhados';
import PainelFaturamento, { lerCompetencia, pertenceAoGrupo } from './PainelFaturamento';
import type { Grupo } from './PainelFaturamento';
import { useLoja } from '../../contexts/LojaContext';
import { apiFetch } from '../../services/apiClient';
import { analisar, meses, reais, repasses, soma, unidadeEmAtividade, valorEmCentavos, variacao } from './modelo';
import type { Registro } from './modelo';
import { exportarExcel, exportarPDF } from './exportar';
import type { Planilha } from './exportar';
import './historico.css';

const endpoint = '/api/financeiro/faturamento-mensal';
const exibicao = (valor: number | null | undefined) => valor == null ? '—' : reais(valor);
const percentual = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1, signDisplay: 'exceptZero' });
const delta = (valor: number | null) => valor == null ? '—' : percentual.format(valor);
const numerico = (valor: number | null | undefined) => valor == null ? null : valor / 100;
const anoAtual = () => new Date().getFullYear();

export default function HistoricoFaturamento({ voltar }: { voltar: () => void }) {
  const { lojas, lojaAtiva, selecionarLoja } = useLoja();
  const [ano, setAno] = useState(2026);
  const [mes, setMes] = useState(0);
  const [excluidas, setExcluidas] = useState<number[]>([]);
  const [grupo, setGrupo] = useState<Grupo>('todas');
  const [personalizado, setPersonalizado] = useState(false);
  const [inicioPersonalizado, setInicioPersonalizado] = useState('2026-01');
  const [fimPersonalizado, setFimPersonalizado] = useState('2026-12');
  const [dados, setDados] = useState<{ chave: string; registros: Registro[] }>();
  const [versao, setVersao] = useState(0);
  const [erroConsulta, setErroConsulta] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [erro, setErro] = useState('');
  const [edicao, setEdicao] = useState<{ lojaId: number; ano: number; mes: number; texto: string; anterior: number | null }>();
  const [salvando, setSalvando] = useState(false);
  const [exportando, setExportando] = useState(false);
  const inicio = personalizado ? lerCompetencia(inicioPersonalizado) : ano * 12 + (mes ? mes - 1 : 0);
  const fim = personalizado ? lerCompetencia(fimPersonalizado) : ano * 12 + (mes ? mes - 1 : 11);
  const anoMaximo = anoAtual() + 1;
  const periodoValido = inicio !== null && fim !== null && inicio <= fim
    && inicio >= 2020 * 12 && fim < (anoMaximo + 1) * 12;
  const anosConsulta = new Set([ano - 1, ano]);
  if (periodoValido && inicio !== null && fim !== null) {
    for (let a = Math.floor(inicio / 12) - 1; a <= Math.floor(fim / 12); a++) anosConsulta.add(a);
  }
  const chaveConsulta = [...anosConsulta].sort((a, b) => a - b).join(',');
  const registros = dados?.chave === chaveConsulta ? dados.registros : null;
  const lojasDoGrupo = lojas.filter(loja => pertenceAoGrupo(loja, grupo));
  const selecionadas = lojasDoGrupo.filter(loja => !excluidas.includes(loja.id));
  const analise = analisar(registros ?? [], selecionadas, ano);
  const mesesExibidos = analise.porMes.filter(m => !mes || m.mes === mes);
  const repasseEnergia = repasses(registros ?? [], selecionadas, ano, mes);
  const anos = useMemo(() => Array.from({ length: Math.max(anoAtual() + 1, ano) - 2019 }, (_, i) => 2020 + i), [ano]);

  useDadosCompartilhados(() => { if (!salvando) setVersao(v => v + 1); });

  useEffect(() => {
    if (salvando) return;
    const controller = new AbortController();
    void Promise.all(chaveConsulta.split(',').map(async anoConsulta => {
      const resposta = await apiFetch(endpoint + '?ano=' + anoConsulta + '&consolidado=1', { signal: controller.signal });
      const conteudo = await resposta.json();
      if (!resposta.ok || !conteudo.sucesso) throw new Error(conteudo.erro || 'Falha ao consultar o histórico.');
      return conteudo.registros as Registro[];
    })).then(listas => {
      if (controller.signal.aborted) return;
      const unicos = new Map<string, Registro>();
      for (const r of listas.flat()) unicos.set([r.lojaId, r.ano, r.mes].join('/'), r);
      setDados({ chave: chaveConsulta, registros: [...unicos.values()] });
      setErroConsulta('');
    }).catch((falha: Error) => {
      if (!controller.signal.aborted) setErroConsulta(falha.message);
    });
    return () => controller.abort();
  }, [chaveConsulta, versao, salvando]);

  function editar(lojaId: number, mesEdicao: number) {
    if (!registros || salvando) return;
    const atual = registros.find(r => r.ano === ano && r.mes === mesEdicao && r.lojaId === lojaId);
    setEdicao({
      lojaId, ano, mes: mesEdicao,
      texto: atual == null ? '' : (atual.centavos / 100).toFixed(2).replace('.', ','),
      anterior: atual?.centavos ?? null,
    });
    setErro('');
    setMensagem('');
  }

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    if (!edicao || salvando || lojaAtiva?.id !== edicao.lojaId) return;
    const centavos = valorEmCentavos(edicao.texto);
    if (centavos == null) {
      setErro('Informe um valor em reais com até duas casas decimais, como 1234,56.');
      return;
    }

    setErro('');
    setSalvando(true);
    try {
      const resposta = await apiFetch(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lojaId: edicao.lojaId, ano: edicao.ano, mes: edicao.mes, centavos, anterior: edicao.anterior }),
      });
      const retorno = await resposta.json();
      if (!resposta.ok || !retorno.sucesso) {
        if (resposta.status === 409) {
          setEdicao(undefined);
          setVersao(v => v + 1);
        }
        throw new Error(retorno.erro || 'Falha ao salvar o faturamento.');
      }
      const salvo: Registro = retorno.registro;
      setDados(atual => atual?.chave === chaveConsulta ? {
        ...atual,
        registros: [...atual.registros.filter(r => r.lojaId !== salvo.lojaId || r.ano !== salvo.ano || r.mes !== salvo.mes), salvo],
      } : atual);
      setEdicao(undefined);
      setMensagem('Faturamento mensal salvo.');
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Falha ao salvar o faturamento.');
    } finally {
      setSalvando(false);
    }
  }

  const resumoUnidades: Planilha = {
    titulo: 'Resumo anual',
    colunas: ['Unidade', 'Faturamento', 'Meses informados', 'Média mensal', 'Projeção anual'],
    moedas: [1, 3, 4],
    linhas: [
      ...analise.porUnidade.map(u => [u.unidade.nome, numerico(u.total), u.meses, numerico(u.media), numerico(u.projecao)]),
      ['Consolidado', numerico(analise.total), analise.mesesConfirmados, null, numerico(analise.projecao)],
      ['Maior mês', numerico(analise.melhor?.total), analise.melhor?.nome ?? '—', null, null],
      ['Menor mês', numerico(analise.pior?.total), analise.pior?.nome ?? '—', null, null],
    ],
  };
  const consolidado: Planilha = {
    titulo: 'Consolidado mensal',
    colunas: ['Mês', 'Faturamento', 'Mês anterior', 'Variação', 'Unidades informadas'],
    moedas: [1, 2],
    linhas: mesesExibidos.map(m => [m.nome, numerico(m.total), numerico(m.anterior),
      delta(m.total == null ? null : variacao(m.total, m.anterior ?? undefined)), `${m.completos}/${m.ativas}`]),
  };
  const detalhado: Planilha = {
    titulo: 'Faturamento por unidade',
    colunas: ['Mês', 'Unidade', 'Faturamento', 'Variação mensal', 'Situação'],
    moedas: [2],
    linhas: mesesExibidos.flatMap(m => m.linhas.map(l => [
      m.nome, l.unidade.nome, numerico(l.atual?.centavos), delta(l.variacao),
      l.atual ? 'Informado' : unidadeEmAtividade(l.unidade.nome, ano, m.mes) ? 'Sem fechamento' : 'Antes da abertura',
    ])),
  };
  const relatorioEnergia: Planilha = {
    titulo: 'Repasse de energia',
    colunas: ['Mês', 'Unidade', 'Faturamento', 'Repasse de 3%', 'Vencimento'],
    moedas: [2, 3],
    linhas: repasseEnergia.map(r => [meses[r.mes - 1], r.unidade.nome, r.faturamento / 100, r.valor / 100, r.vencimento]),
  };

  async function baixar(formato: 'pdf' | 'xlsx') {
    setExportando(true);
    setErro('');
    try {
      const escopo = `Unidades: ${selecionadas.map(u => u.nome).join(', ')}. Detalhe: ${mes ? meses[mes - 1] : 'todos os meses'}. Projeção: realizado mais a média por mês em aberto das unidades com dados.`;
      await (formato === 'pdf' ? exportarPDF : exportarExcel)(ano, escopo, [
        resumoUnidades, consolidado, detalhado, relatorioEnergia,
      ]);
    } catch {
      setErro('Não foi possível exportar o relatório. Tente novamente.');
    } finally {
      setExportando(false);
    }
  }

  const pronto = registros != null && selecionadas.length > 0 && !erroConsulta;

  return <div className="historico-faturamento">
    <header className="hist-cabecalho">
      <div><button onClick={voltar}>Voltar ao Financeiro</button><h1>Histórico de Faturamento Mensal</h1></div>
      <div className="hist-acoes">
        <button disabled={!pronto || exportando} onClick={() => void baixar('pdf')}>Exportar PDF</button>
        <button disabled={!pronto || exportando} onClick={() => void baixar('xlsx')}>Exportar Excel</button>
        <button className="hist-primario" disabled={!pronto || !lojaAtiva || salvando}
          onClick={() => lojaAtiva && editar(lojaAtiva.id, mes || 1)}>Incluir ou atualizar</button>
      </div>
    </header>

    <section className="hist-painel hist-filtros" aria-label="Filtros de faturamento">
      <label>Ano<select value={ano} onChange={e => { setEdicao(undefined); setErroConsulta(''); setAno(Number(e.target.value)); }} disabled={salvando}>
        {anos.map(a => <option key={a} value={a}>{a}</option>)}
      </select></label>
      <label>Mês<select value={mes} onChange={e => setMes(Number(e.target.value))}>
        <option value={0}>Todos os meses</option>
        {meses.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
      </select></label>
      <label>Tipo de unidade<select value={grupo} onChange={e => setGrupo(e.target.value as Grupo)}>
        <option value="todas">Todas as unidades</option>
        <option value="fisico">Mercado físico</option>
        <option value="condominios">Condomínios</option>
      </select></label>
      <label className="hist-filtro-periodo"><input type="checkbox" checked={personalizado}
        onChange={e => {
          setInicioPersonalizado(ano + '-' + String(mes || 1).padStart(2, '0'));
          setFimPersonalizado(ano + '-' + String(mes || 12).padStart(2, '0'));
          setPersonalizado(e.target.checked);
        }} />Período personalizado</label>
      {personalizado && <>
        <label>Competência inicial<input type="month" min="2020-01" max={anoMaximo + '-12'}
          value={inicioPersonalizado} onChange={e => setInicioPersonalizado(e.target.value)} /></label>
        <label>Competência final<input type="month" min="2020-01" max={anoMaximo + '-12'}
          value={fimPersonalizado} onChange={e => setFimPersonalizado(e.target.value)} /></label>
      </>}
      <fieldset><legend>Unidades na análise</legend>
        <button type="button" disabled={lojasDoGrupo.every(l => !excluidas.includes(l.id))}
          onClick={() => setExcluidas(atuais => atuais.filter(id => !lojasDoGrupo.some(l => l.id === id)))}>Selecionar todas</button>
        {lojasDoGrupo.map(loja => <label key={loja.id}><input type="checkbox" checked={!excluidas.includes(loja.id)}
          onChange={e => setExcluidas(atuais => e.target.checked ? atuais.filter(id => id !== loja.id) : [...atuais, loja.id])} />{loja.nome}</label>)}
      </fieldset>
    </section>

    {!periodoValido && <p role="alert">Selecione um período válido, com início anterior ou igual ao fim.</p>}
    {erroConsulta && <p role="alert">{erroConsulta} <button onClick={() => setVersao(v => v + 1)}>Tentar novamente</button></p>}
    {!registros && !erroConsulta && <p role="status">Carregando faturamento…</p>}
    {registros && !selecionadas.length && <p>Selecione pelo menos uma unidade para analisar.</p>}
    {mensagem && <p role="status">{mensagem}</p>}
    {erro && <p role="alert">{erro}</p>}

    {edicao && <form className="hist-painel hist-edicao" onSubmit={salvar}>
      <h2>Faturamento de {lojas.find(l => l.id === edicao.lojaId)?.nome} em {edicao.ano}</h2>
      <label>Competência<select value={edicao.mes} disabled={salvando} onChange={e => editar(edicao.lojaId, Number(e.target.value))}>
        {meses.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
      </select></label>
      <label>Valor em reais<input required inputMode="decimal" placeholder="0,00" value={edicao.texto} disabled={salvando}
        onChange={e => setEdicao({ ...edicao, texto: e.target.value })} /></label>
      {lojaAtiva?.id !== edicao.lojaId && <button type="button" onClick={() => selecionarLoja(edicao.lojaId)}>Ativar unidade para editar</button>}
      <button className="hist-primario" disabled={salvando || lojaAtiva?.id !== edicao.lojaId}>{salvando ? 'Salvando…' : 'Salvar faturamento'}</button>
      <button type="button" disabled={salvando} onClick={() => setEdicao(undefined)}>Cancelar</button>
    </form>}

    {pronto && <>
      {periodoValido && inicio !== null && fim !== null &&
        <PainelFaturamento key={chaveConsulta + ':' + inicio + ':' + fim} registros={registros ?? []}
          unidades={selecionadas} ano={ano} mes={mes} inicio={inicio} fim={fim} personalizado={personalizado} />}
      {personalizado && <p>As tabelas e exportações abaixo usam o ano e o mês dos filtros de competência.</p>}

      <Tabela tabela={resumoUnidades} detalhe="A projeção soma ao realizado a média de cada unidade por mês ainda sem valor durante sua operação. A Maison iniciou em 15/08/2026." />
      <Tabela tabela={consolidado} detalhe="A variação usa os totais cadastrados em cada mês. Meses com cobertura diferente podem refletir unidades a mais ou a menos." />

      <section className="hist-painel">
        <h2>{detalhado.titulo}</h2>
        <p>Para incluir ou atualizar um valor, selecione a competência na tabela.</p>
        <div className="hist-rolagem"><table><thead><tr>{detalhado.colunas.map(c => <th key={c} scope="col">{c}</th>)}<th scope="col">Ações</th></tr></thead>
          <tbody>{mesesExibidos.flatMap(m => m.linhas.map(l => <tr key={`${m.mes}-${l.unidade.id}`}>
            <td>{m.nome}</td><td>{l.unidade.nome}</td><td>{exibicao(l.atual?.centavos)}</td><td>{delta(l.variacao)}</td>
            <td>{l.atual ? 'Informado' : unidadeEmAtividade(l.unidade.nome, ano, m.mes) ? 'Sem fechamento' : 'Antes da abertura'}</td>
            <td><button disabled={salvando} onClick={() => editar(l.unidade.id, m.mes)}>{l.atual ? 'Editar' : 'Incluir'}</button></td>
          </tr>))}</tbody>
        </table></div>
      </section>
      <Tabela tabela={relatorioEnergia} detalhe={`Vencimento no dia 10 do mês seguinte. Total calculado para os filtros: ${reais(soma(repasseEnergia.map(r => r.valor)))}.`} />
    </>}
  </div>;
}

function Tabela({ tabela, detalhe }: { tabela: Planilha; detalhe?: string }) {
  return <section className="hist-painel">
    <h2>{tabela.titulo}</h2>
    {detalhe && <p>{detalhe}</p>}
    {tabela.linhas.length ? <div className="hist-rolagem">
      <table><thead><tr>{tabela.colunas.map(coluna => <th key={coluna} scope="col">{coluna}</th>)}</tr></thead>
        <tbody>{tabela.linhas.map((linha, i) => <tr key={i}>
          {linha.map((valor, j) => <td key={j}>{typeof valor === 'number' && tabela.moedas.includes(j)
            ? reais(Math.round(valor * 100)) : valor ?? '—'}</td>)}
        </tr>)}</tbody></table>
    </div> : <p>Sem registros para os filtros selecionados.</p>}
  </section>;
}
