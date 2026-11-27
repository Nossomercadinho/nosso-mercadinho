export type Unidade = { id: number; nome: string };
export type Registro = { lojaId: number; ano: number; mes: number; centavos: number };

export const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

const formatoReais = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const reais = (centavos: number) => formatoReais.format(centavos / 100);
export const soma = (valores: number[]) => valores.reduce((total, valor) => total + valor, 0);

export function nomeNormalizado(nome: string) {
  return nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function temRepasse(nome: string) {
  return ['TSCI', 'TSCII', 'TSC01', 'TSC02', 'TSC1', 'TSC2'].includes(nomeNormalizado(nome));
}

export function unidadeEmAtividade(nome: string, ano: number, mes: number) {
  const maison = ['MAISON', 'MAISONINFINITY'].includes(nomeNormalizado(nome));
  return !maison || ano > 2026 || (ano === 2026 && mes >= 8);
}

export function variacao(atual: number, anterior: number | undefined) {
  return anterior != null && anterior > 0 ? (atual - anterior) / anterior : null;
}

export function vencimentoRepasse(ano: number, mes: number) {
  return `10/${String(mes === 12 ? 1 : mes + 1).padStart(2, '0')}/${ano + (mes === 12 ? 1 : 0)}`;
}

export function valorEmCentavos(texto: string) {
  const valor = texto.trim();
  if (!/^(?:\d{1,10}|\d{1,3}(?:\.\d{3}){1,3})(?:,\d{1,2})?$/.test(valor)) return null;
  const [inteiro, decimal = ''] = valor.replace(/\./g, '').split(',');
  const centavos = Number(inteiro) * 100 + Number(decimal.padEnd(2, '0'));
  return Number.isSafeInteger(centavos) && centavos <= 999_999_999_999 ? centavos : null;
}

export function analisar(registros: Registro[], unidades: Unidade[], ano: number) {
  const porChave = new Map(registros.map(r => [`${r.lojaId}/${r.ano}/${r.mes}`, r]));
  const buscar = (id: number, mes: number) => porChave.get(`${id}/${mes === 0 ? ano - 1 : ano}/${mes || 12}`);
  const porMes = meses.map((nome, indice) => {
    const mes = indice + 1;
    const linhas = unidades.map(unidade => {
      const atual = buscar(unidade.id, mes);
      const anterior = buscar(unidade.id, mes - 1);
      return { unidade, atual, anterior, variacao: atual ? variacao(atual.centavos, anterior?.centavos) : null };
    });
    const registrados = linhas.filter(l => l.atual != null);
    const ativas = unidades.filter(u => unidadeEmAtividade(u.nome, ano, mes)).length;
    return {
      mes, nome, linhas,
      total: registradoTotal(registrados.map(l => l.atual)),
      anterior: registradoTotal(linhas.map(l => l.anterior)),
      completos: registrados.length,
      ativas,
    };
  });

  const porUnidade = unidades.map(unidade => {
    const confirmados = meses.flatMap((_, i) => buscar(unidade.id, i + 1) ?? []);
    const total = registradoTotal(confirmados);
    const media = total == null ? null : Math.round(total / confirmados.length);
    const faltantes = meses.filter((_, i) => unidadeEmAtividade(unidade.nome, ano, i + 1) && !buscar(unidade.id, i + 1)).length;
    return {
      unidade, total, media, meses: confirmados.length,
      projecao: total == null ? null : total + Math.round(total * faltantes / confirmados.length),
    };
  });
  const mesesConfirmados = porMes.filter(m => m.total != null);
  const melhor = mesesConfirmados.reduce<(typeof porMes)[number] | undefined>(
    (melhorMes, mes) => !melhorMes || mes.total! > melhorMes.total! ? mes : melhorMes, undefined);
  const pior = mesesConfirmados.reduce<(typeof porMes)[number] | undefined>(
    (piorMes, mes) => !piorMes || mes.total! < piorMes.total! ? mes : piorMes, undefined);

  return {
    porMes, porUnidade, melhor, pior, mesesConfirmados: mesesConfirmados.length,
    total: registradoTotal(porMes.flatMap(m => m.total == null ? [] : [{ centavos: m.total }])),
    projecao: registradoTotal(porUnidade.flatMap(u => u.projecao == null ? [] : [{ centavos: u.projecao }])),
    unidadesProjetadas: porUnidade.filter(u => u.projecao != null).length,
  };
}

function registradoTotal(registros: ({ centavos: number } | undefined)[]) {
  const valores = registros.flatMap(r => r ? [r.centavos] : []);
  return valores.length ? soma(valores) : null;
}

export function repasses(registros: Registro[], unidades: Unidade[], ano: number, mes: number) {
  return unidades.filter(u => temRepasse(u.nome)).flatMap(unidade =>
    registros.filter(r => r.lojaId === unidade.id && r.ano === ano && (!mes || r.mes === mes)).map(r => ({
      unidade, mes: r.mes, faturamento: r.centavos, valor: Math.round(r.centavos * 3 / 100),
      vencimento: vencimentoRepasse(ano, r.mes),
    })),
  ).sort((a, b) => a.mes - b.mes || a.unidade.nome.localeCompare(b.unidade.nome, 'pt-BR'));
}
