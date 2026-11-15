export type EntradaPrecificacao = { custo: number; venda: number; margem: number; taxas: number; quantidade: number; fixos?: number };

export function calcularPrecificacao({ custo, venda, margem, taxas, quantidade, fixos = 0 }: EntradaPrecificacao) {
  if (![custo, venda, margem, taxas, quantidade, fixos].every(Number.isFinite) ||
    [custo, venda, margem, taxas, quantidade, fixos].some(v => v < 0) || margem >= 100 || taxas > 100) return null;
  const sugerido = custo / (1 - margem / 100);
  const contribuicaoAtual = venda - custo - venda * taxas / 100;
  const contribuicaoSugerida = sugerido - custo - sugerido * taxas / 100;
  return {
    sugerido,
    margemAtual: venda > 0 ? (venda - custo) / venda * 100 : null,
    markup: custo > 0 ? (venda - custo) / custo * 100 : null,
    contribuicaoAtual, contribuicaoSugerida,
    receita: venda * quantidade,
    mensalAtual: contribuicaoAtual * quantidade - fixos,
    mensalSugerido: contribuicaoSugerida * quantidade - fixos,
    diferenca: sugerido - venda,
    equilibrio: contribuicaoSugerida > 0 ? Math.ceil(fixos / contribuicaoSugerida) : null,
  };
}
