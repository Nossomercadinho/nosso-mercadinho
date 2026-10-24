import Decimal from 'decimal.js';

export class ErroCusto extends Error {}

const D = Decimal.clone({precision: 40, rounding: Decimal.ROUND_HALF_UP});
export type Valor = string | number;
export type Tributo = {valor: Valor; cobrado: boolean; incluido: boolean};
export type ItemCusto = {
  id: string; descricao: string; ean?: string; codigoFornecedor?: string; marca?: string; unidade?: string;
  produtoId?: number | null; quantidadeCompra: Valor; unidadesEmbalagem: Valor | null;
  valorProdutos: Valor; desconto: Valor; frete: Valor; seguro: Valor; despesas: Valor;
  ipi: Tributo; icmsSt: Tributo; fcpSt: Tributo; icmsProprio: Valor;
  revisado: boolean; salvarEmbalagem?: boolean;
};
export type ConferenciaCusto = {
  origem: 'XML' | 'FOTO' | 'PDF' | 'MANUAL'; chave?: string; numero?: string; serie?: string; dataEmissao?: string;
  fornecedorId?: number | null; fornecedorNome: string; fornecedorCnpj?: string;
  localEstoqueId?: number | null; itens: ItemCusto[];
  totais: {frete: Valor | null; seguro: Valor | null; despesas: Valor | null; desconto: Valor | null; outros: Valor; ipi?: Tributo|null; icmsSt?: Tributo|null; fcpSt?: Tributo|null};
  totalNota: Valor | null; justificativa?: string; textoLido?: string; avisos?: string[];
};
export function decimal(valor: unknown, rotulo = 'valor', negativo = false): Decimal {
  const text = String(valor ?? '').trim();
  if (!/^-?\d+(?:\.\d{1,12})?$/.test(text) || text.length > 30) throw new ErroCusto(`Confira ${rotulo}. Use número decimal válido.`);
  const result = new D(text);
  if (!result.isFinite() || (!negativo && result.isNegative()) || result.abs().gt('1000000000000')) throw new ErroCusto(`Confira ${rotulo}: valor fora do limite.`);
  return result;
}
const dinheiro = (v: Decimal) => v.toDecimalPlaces(2).toFixed(2);
export function tributoAdicional(t: Tributo, rotulo: string) {
  if (!t || typeof t.cobrado !== 'boolean' || typeof t.incluido !== 'boolean') throw new ErroCusto(`Confira se ${rotulo} foi cobrado e se já está incluído.`);
  const valor = decimal(t.valor,rotulo);
  return t.cobrado && !t.incluido ? valor : new D(0);
}

/** Largest-remainder allocation in integer cents: the sum is always exact. */
export function ratear(valor: Valor, pesos: Valor[]): string[] {
  const centavos = decimal(valor,'total a ratear').times(100).toDecimalPlaces(0);
  const bases = pesos.map(p=>decimal(p,'base do rateio'));
  const total = bases.reduce((a,b)=>a.plus(b),new D(0));
  if (!bases.length) throw new ErroCusto('Nenhum item para rateio.');
  if (total.isZero() && centavos.gt(0)) throw new ErroCusto('Não é possível ratear despesas sem valor líquido de produtos.');
  const partes = bases.map((p,i)=>{const exato=total.isZero()?new D(0):centavos.times(p).div(total);return {i,inteiro:exato.floor(),resto:exato.minus(exato.floor())};});
  let faltam = centavos.minus(partes.reduce((s,p)=>s.plus(p.inteiro),new D(0))).toNumber();
  const ordem=[...partes].sort((a,b)=>b.resto.comparedTo(a.resto)||a.i-b.i);
  for (let i=0;faltam>0;i++,faltam--) ordem[i%ordem.length].inteiro=ordem[i%ordem.length].inteiro.plus(1);
  return partes.map(p=>p.inteiro.div(100).toFixed(2));
}

export function calcularCustoReal(dados: ConferenciaCusto) {
  if (!dados || !Array.isArray(dados.itens) || !dados.itens.length || dados.itens.length>200) throw new ErroCusto('Informe entre 1 e 200 produtos.');
  if (!dados.totais) throw new ErroCusto('Confira os totais da nota.');
  const itens = dados.itens.map((i,index)=>{
    const base=decimal(i.valorProdutos,`valor dos produtos no item ${index+1}`);
    const desconto=decimal(i.desconto,'desconto');
    if(desconto.gt(base))throw new ErroCusto('Desconto do item maior que o valor dos produtos.');
    const qtd=decimal(i.quantidadeCompra,'quantidade de embalagens');
    if(qtd.lte(0))throw new ErroCusto('Quantidade de compra deve ser maior que zero.');
    let fator:Decimal|null=null;
    if(i.unidadesEmbalagem!==null && i.unidadesEmbalagem!==''){
      fator=decimal(i.unidadesEmbalagem,'unidades por embalagem');
      if(fator.lte(0))throw new ErroCusto('Informe o fator de conversão confirmado.');
    }
    return {original:i,base,desconto,qtd,fator,liquido:base.minus(desconto)};
  });
  const rateios:Record<string,string[]>={};
  for(const campo of ['desconto','frete','seguro','despesas'] as const){
    const individuais=itens.map(i=>decimal(i.original[campo],campo));
    const atribuida=individuais.reduce((s,n)=>s.plus(n),new D(0));
    const informado=dados.totais[campo];
    const total=informado===null?atribuida:decimal(informado,`total de ${campo}`);
    if(total.lt(atribuida))throw new ErroCusto(`O total de ${campo} é menor que a soma já atribuída aos itens.`);
    const restante=total.minus(atribuida);
    rateios[campo]=ratear(restante.toString(),itens.map(i=>i.liquido.toString())).map((v,k)=>dinheiro(decimal(v).plus(individuais[k])));
  }
  const outros=ratear(dados.totais.outros??'0',itens.map(i=>i.liquido.toString()));
  for(const campo of ['ipi','icmsSt','fcpSt'] as const){
    const atribuicoes=itens.map(i=>tributoAdicional(i.original[campo],campo));
    const soma=atribuicoes.reduce((a,b)=>a.plus(b),new D(0));
    const total=dados.totais[campo]?tributoAdicional(dados.totais[campo]!,campo):soma;
    if(total.lt(soma))throw new ErroCusto(`O total adicional de ${campo} é menor que os valores cobrados já atribuídos. Confira se já estão incluídos.`);
    rateios[campo]=ratear(total.minus(soma).toString(),itens.map(i=>i.liquido.toString())).map((v,k)=>dinheiro(decimal(v).plus(atribuicoes[k])));
  }
  const resultados=itens.map((i,k)=>{
    // ICMS próprio is informational. It is never added to acquisition cost.
    decimal(i.original.icmsProprio,'ICMS próprio');
    const componentes={valorProdutos:dinheiro(i.base),desconto:rateios.desconto[k],frete:rateios.frete[k],seguro:rateios.seguro[k],despesas:rateios.despesas[k],outros:outros[k],ipi:rateios.ipi[k],icmsSt:rateios.icmsSt[k],fcpSt:rateios.fcpSt[k]};
    const total=i.base.minus(componentes.desconto).plus(componentes.frete).plus(componentes.seguro).plus(componentes.despesas).plus(componentes.outros).plus(componentes.ipi).plus(componentes.icmsSt).plus(componentes.fcpSt).toDecimalPlaces(2);
    if(total.isNegative())throw new ErroCusto('O custo total não pode ser negativo.');
    const unidades=i.fator?i.qtd.times(i.fator):null;
    if(unidades?.gt('1000000000000'))throw new ErroCusto('Quantidade convertida acima do limite.');
    return {id:i.original.id,componentes,custoTotal:dinheiro(total),custoCaixa:total.div(i.qtd).toFixed(10),quantidadeUnidades:unidades?.toString()??null,
      custoUnitario:unidades?total.div(unidades).toFixed(10):null,custoUnitarioExibicao:unidades?dinheiro(total.div(unidades)):null,
      precisaRevisao:!i.original.revisado || !i.fator || !i.original.descricao?.trim()};
  });
  const soma=(campo:keyof typeof resultados[number]['componentes'])=>dinheiro(resultados.reduce((s,i)=>s.plus(i.componentes[campo]),new D(0)));
  const calculado=resultados.reduce((s,i)=>s.plus(i.custoTotal),new D(0));
  const declarado=dados.totalNota===null?null:decimal(dados.totalNota,'total da nota').toDecimalPlaces(2);
  const diferenca=declarado?calculado.minus(declarado):null;
  return {itens:resultados,totais:{valorProdutos:soma('valorProdutos'),desconto:soma('desconto'),frete:soma('frete'),seguro:soma('seguro'),despesas:soma('despesas'),outros:soma('outros'),ipi:soma('ipi'),icmsSt:soma('icmsSt'),fcpSt:soma('fcpSt'),calculado:dinheiro(calculado),declarado:declarado?dinheiro(declarado):null,diferenca:diferenca?dinheiro(diferenca):null},
    conciliado:!!diferenca && diferenca.isZero(),podeConfirmar:!!diferenca && diferenca.isZero() && resultados.every(i=>!i.precisaRevisao),
    alerta:!diferenca?'Informe o total cobrado da nota.':!diferenca.isZero()?'Os valores calculados não correspondem ao total da nota. Confira os impostos, descontos e despesas antes de confirmar.':''};
}

export function compararCusto(anterior:Valor,novo:Valor,venda:Valor){
  const a=decimal(anterior),n=decimal(novo),v=decimal(venda);
  return {anterior:a.toFixed(10),novo:n.toFixed(10),diferenca:dinheiro(n.minus(a)),variacao:a.gt(0)?n.minus(a).div(a).times(100).toFixed(2):null,
    precoVenda:dinheiro(v),margem:v.gt(0)?v.minus(n).div(v).times(100).toFixed(2):null,
    alertaMargem:v.gt(0) && (n.gte(v) || a.gt(0) && v.minus(a).div(v).minus(v.minus(n).div(v)).gte('0.05'))};
}

/** Manual cost entry: total already includes all costs the operator wishes to allocate. */
export function calcularCustoSimples(valorTotal:Valor,quantidade:Valor){
  const total=decimal(valorTotal,'valor total'),qtd=decimal(quantidade,'quantidade');
  if(total.lte(0))throw new ErroCusto('Informe um valor total maior que zero.');
  if(total.decimalPlaces()>2)throw new ErroCusto('O valor total deve ter no máximo duas casas decimais.');
  if(qtd.lte(0))throw new ErroCusto('Informe uma quantidade maior que zero.');
  const custo=total.div(qtd).toFixed(10);
  if(decimal(custo).lte(0))throw new ErroCusto('Custo por unidade abaixo do limite de precisão.');
  return {valorTotal:total.toFixed(2),quantidade:qtd.toString(),custoUnitario:custo};
}
