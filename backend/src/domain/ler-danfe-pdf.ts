import {decimal,ErroCusto} from './custo-real';
import type {ConferenciaCusto,ItemCusto} from './custo-real';
import {imposto,novoItem,lerTextoConferencia} from './ler-nota';

export type TrechoPdf={texto:string;x:number;y:number;largura:number;altura:number};
export type PaginaTextoPdf={largura:number;altura:number;itens:TrechoPdf[]};
const normalizar=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s+/g,' ').trim();
const br=(s:string)=>s.replace(/\./g,'').replace(',','.');
const numerico=(s:string)=>/^\d+(?:\.\d{3})*,\d{2,8}$/.test(s);
function validarPaginas(value:unknown):PaginaTextoPdf[]{
  if(!Array.isArray(value)||value.length>20)throw new ErroCusto('PDF limitado a 20 páginas.');
  let tamanho=0,trechos=0;
  for(const p of value){
    if(!p||!Number.isFinite(p.largura)||!Number.isFinite(p.altura)||p.largura<=0||p.altura<=0||!Array.isArray(p.itens))throw new ErroCusto('Coordenadas de PDF inválidas.');
    for(const i of p.itens){
      if(!i||typeof i.texto!=='string'||![i.x,i.y,i.largura,i.altura].every(Number.isFinite)||i.largura<0||i.altura<0)throw new ErroCusto('Trecho de PDF inválido.');
      tamanho+=i.texto.length;trechos++;
    }
  }
  if(tamanho>300000||trechos>20000)throw new ErroCusto('Texto do PDF acima do limite.');
  return value;
}
/** PDF engines may merge adjacent columns into a text run. Preserve word positions. */
function palavras(t:TrechoPdf):TrechoPdf[]{
  return [...t.texto.matchAll(/\S+/g)].map(m=>({...t,texto:m[0],x:t.x+t.largura*(m.index||0)/Math.max(t.texto.length,1),largura:t.largura*m[0].length/Math.max(t.texto.length,1)}));
}
function linhas(itens:TrechoPdf[],tolerancia=2.5){
  const grupos:{y:number;itens:TrechoPdf[]}[]=[];
  for(const t of [...itens].sort((a,b)=>a.y-b.y||a.x-b.x)){
    let g=grupos.find(g=>Math.abs(g.y-t.y)<=tolerancia);
    if(!g){g={y:t.y,itens:[]};grupos.push(g);}g.itens.push(t);
  }
  return grupos.map(g=>({...g,itens:g.itens.sort((a,b)=>a.x-b.x)}));
}
function fatorDaDescricao(descricao:string,unidade:string):string|null{
  if(/^(UN|UND|UNID|UNIDADE|PC|PT|PT2LT|POTE|LT|L|KG)$/.test(unidade))return '1';
  // Only a literal count of units is a conversion: never mistake "2L" or "105GR" for a count.
  const texto=normalizar(descricao);
  const m=texto.match(/\b(?:CX|CAIXA|FD|FARDO)\s*(?:C\s*[/\\]?\s*)?(\d{1,4})\s*(?:UND\.?|UNID\.?|UN\b)/);
  return m&&Number(m[1])>0?String(Number(m[1])):null;
}
const campos={produtos:/^VALOR TOTAL DOS PRODUTOS$/,frete:/^VALOR DO FRETE$/,seguro:/^VALOR DO SEGURO$/,desconto:/^DESCONTO$/,despesas:/^(?:OUTRAS DESP\.? ACESS\.?|OUTRAS DESPESAS ACESSORIAS)$/,ipi:/^VALOR DO IPI$/,icmsSt:/^VALOR DO ICMS (?:SUBST\.?|ST)$/,fcpSt:/^VALOR DO FCP(?:[ -]ST)?$/,total:/^VALOR TOTAL DA NOTA$/};
function totaisPagina(p:PaginaTextoPdf){
  const resultado:Record<string,string>={};
  const inicio=p.itens.find(t=>normalizar(t.texto)==='CALCULO DO IMPOSTO');if(!inicio)return resultado;
  const fim=p.itens.find(t=>t.y>inicio.y&&/^(?:TRANSPORTADOR|DADOS DO PRODUTO)/.test(normalizar(t.texto)))?.y??p.altura;
  const quadro=p.itens.filter(t=>t.y>inicio.y&&t.y<fim);
  for(const [campo,regex] of Object.entries(campos)){
    const label=quadro.find(t=>regex.test(normalizar(t.texto)));if(!label)continue;
    const limites=p.itens.filter(t=>Math.abs(t.y-label.y)<=3&&t.x>label.x+5&&normalizar(t.texto).length>3).map(t=>t.x);
    const fim=limites.length?Math.min(...limites)-1:p.largura;
    const candidatos=p.itens.flatMap(palavras).filter(t=>numerico(t.texto)&&t.y>label.y+2&&t.y<label.y+25&&t.x>=label.x-3&&t.x<fim).sort((a,b)=>a.y-b.y||a.x-b.x);
    if(candidatos[0])resultado[campo]=br(candidatos[0].texto);
  }
  return resultado;
}
function itensPagina(p:PaginaTextoPdf):ItemCusto[]{
  const descricao=p.itens.find(t=>/^DESCRICAO DO PRODUTO/.test(normalizar(t.texto)));
  if(!descricao)return [];
  const cabecalho=p.itens.filter(t=>t.y>=descricao.y-10&&t.y<=descricao.y+7);
  const achar=(r:RegExp)=>cabecalho.filter(t=>r.test(normalizar(t.texto))).sort((a,b)=>a.x-b.x)[0];
  const ncm=achar(/^NCM\b/),cfop=achar(/^CFOP$/),quant=achar(/^QUANT/),unitario=achar(/^UNITARIO$/),total=achar(/^TOTAL$/),desc=achar(/^DESCONTO$/),base=achar(/^CALC\.? ICMS$/),icms=achar(/^I\.?C\.?M\.?S\.?$/),ipi=achar(/^I\.?P\.?I\.?$/);
  if(!ncm||!cfop||!quant||!unitario||!total)return [];
  const limiteTabela=Math.max(...cabecalho.map(t=>t.y))+1;
  const stop=p.itens.find(t=>t.y>limiteTabela&&/^DADOS ADICIONAIS|^CALCULO DO ISSQN/.test(normalizar(t.texto)))?.y??p.altura;
  const dados=linhas(p.itens.filter(t=>t.y>limiteTabela&&t.y<stop));
  const entradas:{linha:typeof dados[number];codigo:string;descricao:string;quantidade:string;valor:string;ipi:string;icms:string;desconto:string;unidade:string}[]=[];
  for(const linha of dados){
    const w=linha.itens.flatMap(palavras).sort((a,b)=>a.x-b.x);
    const ncmValor=w.find(t=>/^\d{8}$/.test(t.texto)&&t.x>=ncm.x-5&&t.x<cfop.x-5);
    if(!ncmValor)continue;
    const numeros=(inicio:number,fim:number)=>w.filter(t=>t.x>=inicio&&t.x<fim&&numerico(t.texto));
    const compra=numeros(quant.x-4,total.x-4);
    if(compra.length!==2)continue;
    const qtd=compra[0],vu=compra[1],vt=numeros(total.x-4,((desc||base||icms||ipi)?.x??p.largura)-4)[0];
    const cfopValor=w.find(t=>/^\d{4}$/.test(t.texto)&&t.x>=cfop.x-5&&t.x<quant.x-4);
    const un=w.find(t=>t.x>=(cfopValor?cfopValor.x+cfopValor.largura:cfop.x)&&t.x<quant.x-4&&/^[A-Z][A-Z0-9]{0,7}\.?$/.test(t.texto));
    const codigo=w.find(t=>t.x<ncm.x-5&&/^[A-Z0-9][A-Z0-9._/-]*$/.test(t.texto)&&t.x<descricao.x);
    if(!qtd||!vu||!vt||!cfopValor||!un||!codigo)continue;
    try{if(decimal(br(qtd.texto)).lte(0)||decimal(br(qtd.texto)).times(br(vu.texto)).minus(br(vt.texto)).abs().gt('0.03'))continue;}catch{continue;}
    const texto=linha.itens.filter(t=>t.x>codigo.x+codigo.largura+1&&t.x<ncm.x-4).map(t=>t.texto).join(' ').trim();
    const vipi=ipi?numeros(ipi.x-4,(achar(/^ICMS$/)?.x??p.largura)-4)[0]:undefined;
    const vicms=icms?numeros(icms.x-4,(ipi?.x??p.largura)-4)[0]:undefined;
    const vd=desc?numeros(desc.x-4,((base||icms||ipi)?.x??p.largura)-4)[0]:undefined;
    entradas.push({linha,codigo:codigo.texto,descricao:texto,quantidade:br(qtd.texto),valor:br(vt.texto),ipi:vipi?br(vipi.texto):'0',icms:vicms?br(vicms.texto):'0',desconto:vd?br(vd.texto):'0',unidade:un.texto.replace(/\.$/,'')});
  }
  return entradas.map(r=>{
    const fim=dados.find(l=>l.y>r.linha.y+2&&l.itens.flatMap(palavras).some(t=>/^\d{8}$/.test(t.texto)&&t.x>=ncm.x-5&&t.x<cfop.x-5))?.y??stop;
    const continuacoes=dados.filter(l=>l.y>r.linha.y+2&&l.y<fim).filter(l=>! /^(?:CST\s*:|IS\s*:|IBS\s*:|CBS\s*:|CTRIB\s*:|TOTAL RT|TRIB)/i.test(l.itens.map(i=>i.texto).join(' ').trim())).flatMap(l=>l.itens.filter(t=>t.x>r.linha.itens[0].x+25&&t.x<ncm.x-4)).map(t=>t.texto.trim()).filter(t=>t&&!/^(?:CST\s*:|IS\s*:|IBS\s*:|CBS\s*:|CTRIB\s*:|TOTAL RT|TRIB)/i.test(t));
    const nome=[r.descricao,...continuacoes].join(' ').replace(/\s+/g,' ').trim();
    return {...novoItem(),descricao:nome,codigoFornecedor:r.codigo,unidade:r.unidade,quantidadeCompra:r.quantidade,unidadesEmbalagem:fatorDaDescricao(nome,r.unidade),valorProdutos:r.valor,desconto:r.desconto,ipi:imposto(r.ipi,true),icmsProprio:r.icms};
  });
}
/** Uses DANFE labels and column positions, never supplier names or fixed page coordinates. */
export function lerDanfePdf(paginas:unknown,texto:string):ConferenciaCusto{
  const pp=validarPaginas(paginas),dados=lerTextoConferencia(texto,'PDF');
  const itens=pp.flatMap(itensPagina);
  if(!itens.length)return dados;
  dados.itens=itens.map((i,k)=>({...i,id:String(k+1)}));
  const totais=Object.assign({},...pp.map(totaisPagina));
  for(const campo of ['frete','seguro','desconto','despesas'] as const)if(totais[campo]!==undefined)dados.totais[campo]=totais[campo];
  for(const campo of ['ipi','icmsSt','fcpSt'] as const)if(totais[campo]!==undefined)dados.totais[campo]=imposto(totais[campo],true);
  if(totais.total!==undefined)dados.totalNota=totais.total;
  const soma=itens.reduce((v,i)=>v.plus(i.valorProdutos),decimal('0'));
  dados.avisos=[`DANFE lido por colunas: ${itens.length} produto(s) em ${pp.length} página(s). Confira os itens e os fatores de embalagem.`, 'IPI e ICMS-ST do quadro de impostos foram identificados. ICMS próprio e valor aproximado dos tributos são informativos e não são somados novamente.','Códigos de produto do fornecedor não são EANs. Vincule ao cadastro correto; sugestões por nome exigem confirmação.'];
  if(totais.produtos!==undefined&&!soma.eq(totais.produtos))dados.avisos.push(`A soma dos produtos lidos (${soma.toFixed(2)}) difere do total de produtos da nota (${totais.produtos}). Confira linhas ou páginas ausentes.`);
  if(dados.itens.some(i=>i.unidadesEmbalagem===null))dados.avisos.push('Há embalagens sem quantidade de unidades identificada. Confirme o fator antes da entrada.');
  return dados;
}
