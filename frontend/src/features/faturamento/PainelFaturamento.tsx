import { useState } from 'react';
import type { CSSProperties } from 'react';
import { analisar, meses, nomeNormalizado, reais, soma, variacao } from './modelo';
import type { Registro, Unidade } from './modelo';

export type Grupo = 'todas' | 'fisico' | 'condominios';

const cores: Record<string, string> = {
  MATRIZ: '#2563eb',
  TSC1: '#15803d',
  TSC2: '#c2410c',
  MAISON: '#7e22ce',
};

function chaveUnidade(nome: string) {
  const chave = nomeNormalizado(nome);
  if (['TSCI', 'TSC01', 'TSC1'].includes(chave)) return 'TSC1';
  if (['TSCII', 'TSC02', 'TSC2'].includes(chave)) return 'TSC2';
  if (['MAISON', 'MAISONINFINITY'].includes(chave)) return 'MAISON';
  return chave;
}

export function pertenceAoGrupo(unidade: Unidade, grupo: Grupo) {
  if (grupo === 'todas') return true;
  const fisico = chaveUnidade(unidade.nome) === 'MATRIZ';
  return grupo === 'fisico' ? fisico : !fisico;
}

const paleta = ['#0f766e', '#a21caf', '#475569', '#a16207', '#0369a1'];
const cor = (unidade: Unidade) => cores[chaveUnidade(unidade.nome)] ?? paleta[unidade.id % paleta.length];
const percentual = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 });
const variacaoPercentual = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1, signDisplay: 'exceptZero' });
const compacto = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });
const dinheiro = (v: number | null) => v === null ? '—' : reais(v);
const indiceMes = (ano: number, mes: number) => ano * 12 + mes - 1;
const competencia = (i: number) => ({ ano: Math.floor(i / 12), mes: i % 12 + 1 });
const nomeMes = (i: number) => {
  const { ano, mes } = competencia(i);
  return meses[mes - 1] + ' de ' + ano;
};

export function lerCompetencia(valor: string) {
  const [ano, mes] = valor.split('-').map(Number);
  return /^\d{4}-\d{2}$/.test(valor) && ano >= 1900 && mes >= 1 && mes <= 12 ? indiceMes(ano, mes) : null;
}

function somarSeHouver(valores: (number | undefined)[]) {
  const conhecidos = valores.filter((v): v is number => v !== undefined);
  return conhecidos.length ? soma(conhecidos) : null;
}

type Props = {
  registros: Registro[];
  unidades: Unidade[];
  ano: number;
  mes: number;
  inicio: number;
  fim: number;
  personalizado: boolean;
};

export default function PainelFaturamento({ registros, unidades, ano, mes, inicio, fim, personalizado }: Props) {
  const [visualizacao, setVisualizacao] = useState<'mensal' | 'anual'>('mensal');
  const [detalhe, setDetalhe] = useState<number>();
  const valores = new Map(registros.map(r => [r.lojaId + ':' + indiceMes(r.ano, r.mes), r.centavos]));
  const valor = (id: number, indice: number) => valores.get(id + ':' + indice);
  const global = (indice: number) => somarSeHouver(unidades.map(u => valor(u.id, indice)));
  const mesesDoPeriodo = Array.from({ length: fim - inicio + 1 }, (_, i) => inicio + i);
  const mesesInformados = mesesDoPeriodo.flatMap(i => {
    const total = global(i);
    return total === null ? [] : [{ i, total }];
  });
  const total = somarSeHouver(mesesInformados.map(m => m.total));
  const media = total === null ? null : Math.round(total / mesesInformados.length);
  const mesReferencia = personalizado ? fim : mes ? indiceMes(ano, mes) : (mesesInformados.at(-1)?.i ?? fim);
  const atual = global(mesReferencia);
  // Compare only stores reported in both competencies to avoid growth caused by differing coverage.
  const comparaveis = unidades.filter(u => valor(u.id, mesReferencia) !== undefined && valor(u.id, mesReferencia - 1) !== undefined);
  const atualComparavel = soma(comparaveis.map(u => valor(u.id, mesReferencia) ?? 0));
  const anteriorComparavel = soma(comparaveis.map(u => valor(u.id, mesReferencia - 1) ?? 0));
  const crescimento = variacao(atualComparavel, anteriorComparavel);
  const melhores = [...mesesInformados].sort((a, b) => b.total - a.total || a.i - b.i);
  const melhor = melhores[0];
  const pior = melhores.at(-1);
  const anoReferencia = personalizado ? competencia(fim).ano : ano;
  const anual = analisar(registros, unidades, anoReferencia);
  const acumuladoAnual = somarSeHouver(
    Array.from({ length: Math.max(0, Math.min(12, fim - indiceMes(anoReferencia, 1) + 1)) }, (_, i) => global(indiceMes(anoReferencia, i + 1)) ?? undefined),
  );
  const porUnidade = unidades.map(unidade => ({
    unidade,
    valor: somarSeHouver(mesesDoPeriodo.map(i => valor(unidade.id, i))),
  }));
  const maiorUnidade = Math.max(1, ...porUnidade.map(u => u.valor ?? 0));

  const mesesDaLinha = !personalizado && mes
    ? Array.from({ length: mes }, (_, i) => indiceMes(ano, i + 1))
    : mesesDoPeriodo;
  const gruposMensais = mesesDaLinha.map(i => {
    const { ano: anoMes, mes: numero } = competencia(i);
    return { rotulo: meses[numero - 1].slice(0, 3) + (personalizado ? '/' + String(anoMes).slice(-2) : ''),
      titulo: nomeMes(i), indices: [i] };
  });
  const anosNoPeriodo = [...new Set(mesesDoPeriodo.map(i => competencia(i).ano))];
  const gruposAnuais = anosNoPeriodo.length > 1
    ? anosNoPeriodo.map(a => ({ rotulo: String(a), titulo: String(a), indices: mesesDoPeriodo.filter(i => competencia(i).ano === a) }))
    : [
        { rotulo: String(anosNoPeriodo[0] - 1), titulo: String(anosNoPeriodo[0] - 1), indices: mesesDoPeriodo.map(i => i - 12) },
        { rotulo: String(anosNoPeriodo[0]), titulo: String(anosNoPeriodo[0]), indices: mesesDoPeriodo },
      ];
  const grupos = visualizacao === 'mensal' ? gruposMensais : gruposAnuais;
  const serie = unidades.map(unidade => ({
    unidade,
    pontos: grupos.map(g => somarSeHouver(g.indices.map(i => valor(unidade.id, i)))),
  }));
  const maiorPonto = Math.max(1, ...serie.flatMap(s => s.pontos.map(p => p ?? 0)));
  const amplitude = Math.pow(10, Math.floor(Math.log10(maiorPonto)));
  const teto = Math.ceil(maiorPonto / amplitude) * amplitude;
  const largura = Math.max(620, grupos.length * 46 + 75);
  const altura = 260;
  const margem = 73;
  const base = altura - 45;
  const px = (n: number) => grupos.length === 1 ? (largura + margem) / 2 : margem + n * (largura - margem - 24) / (grupos.length - 1);
  const py = (v: number) => base - (base - 24) * v / teto;
  const foco = detalhe != null && detalhe < grupos.length ? detalhe : Math.max(0, grupos.reduce((ultimo, _, i) => serie.some(s => s.pontos[i] !== null) ? i : ultimo, -1));
  const periodo = nomeMes(inicio) + (inicio === fim ? '' : ' a ' + nomeMes(fim));

  return <div className="hist-dashboard">
    <header className="hist-dashboard-titulo">
      <h2>Visão geral do faturamento</h2>
      <p>{periodo} <span aria-hidden="true">·</span> {unidades.length} {unidades.length === 1 ? 'unidade' : 'unidades'}</p>
    </header>

    <div className="hist-indicadores hist-dashboard-indicadores">
      <Indicador destaque titulo="Faturamento do mês" valor={dinheiro(atual)} detalhe={nomeMes(mesReferencia)} />
      <Indicador titulo="Acumulado no ano" valor={dinheiro(acumuladoAnual)} detalhe={String(anoReferencia) + ' até a competência final do recorte'} />
      <Indicador titulo="Média mensal" valor={dinheiro(media)} detalhe={mesesInformados.length + ' competências informadas no recorte'} />
      <Indicador titulo="Variação mensal" valor={crescimento === null ? '—' : variacaoPercentual.format(crescimento)}
        tom={crescimento === null || crescimento === 0 ? undefined : crescimento > 0 ? 'alta' : 'queda'}
        detalhe={crescimento === null ? 'Sem base comparável no mês anterior' : comparaveis.length + ' unidades com dados nos dois meses'} />
      <Indicador titulo="Melhor mês" valor={dinheiro(melhor?.total ?? null)} detalhe={melhor ? nomeMes(melhor.i) : 'Sem fechamento no recorte'} />
      <Indicador titulo="Pior mês" valor={dinheiro(pior?.total ?? null)} detalhe={pior ? nomeMes(pior.i) : 'Sem fechamento no recorte'} />
      <Indicador titulo="Projeção anual" valor={dinheiro(anual.projecao)} detalhe={'Estimativa de ' + anoReferencia + ' pela média de cada unidade'} />
      <Indicador titulo="Meta de lucro de 15%" valor={dinheiro(total === null ? null : Math.round(total * 15 / 100))}
        detalhe="Meta sobre o faturamento do recorte" />
    </div>

    <div className="hist-dashboard-grade">
      <section className="hist-painel hist-dashboard-evolucao" aria-label="Evolução do faturamento">
        <div className="hist-dashboard-acoes">
          <h2>Evolução do faturamento</h2>
          <div role="group" aria-label="Escala do gráfico">
            <button type="button" aria-pressed={visualizacao === 'mensal'}
              onClick={() => { setVisualizacao('mensal'); setDetalhe(undefined); }}>Mensal</button>
            <button type="button" aria-pressed={visualizacao === 'anual'}
              onClick={() => { setVisualizacao('anual'); setDetalhe(undefined); }}>Anual</button>
          </div>
        </div>
        {visualizacao === 'mensal' && !personalizado && mes > 0 && <p>Evolução de janeiro até o mês selecionado.</p>}
        {visualizacao === 'anual' && <p>{anosNoPeriodo.length === 1
          ? 'Comparação entre os mesmos meses de dois anos consecutivos.'
          : 'Soma das competências selecionadas em cada ano.'}</p>}
        {serie.every(s => s.pontos.every(v => v === null)) && <p>Sem fechamentos registrados para este recorte.</p>}
        <div className="hist-dashboard-svg">
          <svg viewBox={'0 0 ' + largura + ' ' + altura} role="img" aria-label="Linhas de faturamento por unidade em reais"
            style={{ minWidth: grupos.length > 12 ? grupos.length * 43 : 480 }}>
            {[0, 1, 2, 3, 4].map(passo => {
              const marca = teto * passo / 4;
              return <g key={passo}><line x1={margem} y1={py(marca)} x2={largura - 18} y2={py(marca)} />
                <text x={margem - 9} y={py(marca) + 4} textAnchor="end">{'R$ ' + compacto.format(marca / 100)}</text></g>;
            })}
            {serie.some(s => s.pontos[foco] !== null) &&
              <line className="hist-dashboard-guia" x1={px(foco)} x2={px(foco)} y1={24} y2={base} />}
            {grupos.map((g, i) => <text className={i === foco ? 'hist-dashboard-mes-ativo' : undefined} key={g.rotulo + i} x={px(i)} y={base + 24} textAnchor="middle">{g.rotulo}</text>)}
            {serie.map(s => {
              const caminho = s.pontos.map((v, i) => v === null ? ''
                : (i > 0 && s.pontos[i - 1] !== null ? 'L' : 'M') + px(i) + ',' + py(v)).join(' ');
              return <g key={s.unidade.id} style={{ color: cor(s.unidade) }}>
                <path d={caminho} fill="none" stroke="currentColor" strokeWidth={2.75} strokeLinecap="round" strokeLinejoin="round" />
                {s.pontos.map((v, i) => v === null ? null
                  : <circle key={i} cx={px(i)} cy={py(v)} r={i === foco ? 5 : 3.5} fill="currentColor" stroke="white" strokeWidth={i === foco ? 2 : 1.25}>
                      <title>{s.unidade.nome + ' · ' + grupos[i].titulo + ' · ' + reais(v)}</title>
                    </circle>)}
              </g>;
            })}
          </svg>
        </div>
        <label className="hist-dashboard-detalhe">Valores por {visualizacao === 'mensal' ? 'mês' : 'ano'}
          <select value={foco} onChange={e => setDetalhe(Number(e.target.value))}>
            {grupos.map((g, i) => <option key={i} value={i}>{g.titulo}</option>)}
          </select>
        </label>
        <ul className="hist-dashboard-legenda">
          {serie.map(s => <li key={s.unidade.id} style={{ '--cor-unidade': cor(s.unidade) } as CSSProperties}>
            <span>{s.unidade.nome}</span><strong>{dinheiro(s.pontos[foco])}</strong>
          </li>)}
        </ul>
      </section>

      <section className="hist-painel hist-dashboard-distribuicao" aria-label="Faturamento acumulado por unidade">
        <h2>Faturamento acumulado por unidade</h2>
        <div className="hist-dashboard-totais">
          <div><span>Total consolidado</span><strong>{dinheiro(total)}</strong></div>
          <div><span>Média mensal</span><strong>{dinheiro(media)}</strong></div>
        </div>
        <ul className="hist-dashboard-barras">
          {porUnidade.map(u => <li key={u.unidade.id} style={{ '--cor-unidade': cor(u.unidade) } as CSSProperties}>
            <div><span>{u.unidade.nome}</span><strong>{dinheiro(u.valor)}</strong>
              <small>{u.valor === null || !total ? '—' : percentual.format(u.valor / total)}</small></div>
            <div className="hist-dashboard-trilho" aria-hidden="true"><i style={{ width: ((u.valor ?? 0) / maiorUnidade * 100) + '%' }} /></div>
          </li>)}
        </ul>
      </section>
    </div>
  </div>;
}

function Indicador({ titulo, valor, detalhe, destaque, tom }: {
  titulo: string;
  valor: string;
  detalhe: string;
  destaque?: boolean;
  tom?: 'alta' | 'queda';
}) {
  return <article className={destaque ? 'hist-indicador-destaque' : undefined}>
    <span>{titulo}</span><strong data-tom={tom}>{valor}</strong><small>{detalhe}</small>
  </article>;
}
