export type LinhaCusto = { ean: string; nome: string; valorTotal: string; quantidade: string; ncm: string; cest: string; unidade: string; fornecedor: string; marca: string; categoria: string };
export const chaveEan = (ean: string) => ean.replace(/\D/g, '').padStart(14, '0');
export function lerTabelaCustos(texto: string): LinhaCusto[] {
  const linhas = texto.trim().split(/\r?\n/).filter(l => l.trim());
  if (linhas[0]?.toLowerCase().startsWith('ean\t')) linhas.shift();
  if (!linhas.length || linhas.length > 300) throw new Error('Cole entre 1 e 300 produtos.');
  const vistos = new Set<string>();
  return linhas.map((linha, i) => {
    const [ean = '', nome = '', total = '', quantidade = '', ncm = '', cest = '', unidade = 'UN', fornecedor = '', marca = '', categoria = ''] = linha.split('\t').map(s => s.trim());
    const decimal = (s: string) => s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s;
    const valorTotal = decimal(total), qtd = decimal(quantidade);
    if (!/^\d{8,14}$/.test(ean) || !nome || !/^\d+(\.\d+)?$/.test(valorTotal) || !/^\d+(\.\d+)?$/.test(qtd) || Number(qtd) <= 0 || !Number.isFinite(Number(valorTotal)) || !Number.isFinite(Number(qtd))) throw new Error(`Linha ${i + 1}: confira EAN, nome, valor total e quantidade.`);
    if (ncm && !/^\d{8}$/.test(ncm)) throw new Error(`Linha ${i + 1}: NCM deve ter oito dígitos.`);
    if (cest && !/^\d{7}$/.test(cest)) throw new Error(`Linha ${i + 1}: CEST deve ter sete dígitos.`);
    if (!['UN', 'KG', 'L', 'CX', 'PCT'].includes(unidade)) throw new Error(`Linha ${i + 1}: unidade inválida.`);
    const chave = chaveEan(ean);
    if (vistos.has(chave)) throw new Error(`EAN repetido na tabela: ${ean}. Consolide a quantidade e o valor antes de importar.`);
    vistos.add(chave);
    return { ean, nome, valorTotal, quantidade: qtd, ncm, cest: cest === '0000000' ? '' : cest, unidade, fornecedor, marca, categoria };
  });
}
