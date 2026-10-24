import { XMLParser, XMLValidator } from 'fast-xml-parser';
import type { ConferenciaCusto, ItemCusto, Tributo } from './custo-real';
import { decimal, ErroCusto } from './custo-real';

export const imposto = (valor: unknown='0',cobrado=false):Tributo=>({valor:String(valor),cobrado,incluido:false});
export function novoItem(id='1'):ItemCusto{return {id,descricao:'',ean:'',codigoFornecedor:'',unidade:'',quantidadeCompra:'1',unidadesEmbalagem:null,valorProdutos:'0',desconto:'0',frete:'0',seguro:'0',despesas:'0',ipi:imposto(),icmsSt:imposto(),fcpSt:imposto(),icmsProprio:'0',revisado:false};}
export function novaConferencia(origem:ConferenciaCusto['origem']='MANUAL'):ConferenciaCusto{return {origem,fornecedorNome:'',itens:[novoItem()],totais:{frete:null,seguro:null,despesas:null,desconto:null,outros:'0'},totalNota:null,avisos:[]};}
export function validarChaveNfe(chave:unknown){
  const key=String(chave||'').replace(/\s/g,'');
  if(!/^\d{44}$/.test(key))throw new ErroCusto('A chave da NF-e deve conter 44 dígitos.');
  let soma=0,peso=2;for(let i=42;i>=0;i--){soma+=Number(key[i])*peso;peso=peso===9?2:peso+1;}
  const resto=soma%11,digito=resto<2?0:11-resto;
  if(digito!==Number(key[43]))throw new ErroCusto('Dígito verificador da chave da NF-e inválido.');
  return key;
}
function procurar(obj:any,chave:string):unknown{
  if(!obj || typeof obj!=='object')return undefined;
  if(obj[chave]!==undefined)return obj[chave];
  for(const filho of Object.values(obj)){const encontrado=procurar(filho,chave);if(encontrado!==undefined)return encontrado;}
  return undefined;
}
const valor=(obj:any,key:string)=>String(procurar(obj,key)??'0');
export function lerXmlConferencia(xml:string):ConferenciaCusto{
  if(typeof xml!=='string'||Buffer.byteLength(xml)>3*1024*1024||/<!DOCTYPE|<!ENTITY/i.test(xml))throw new ErroCusto('XML ausente, grande demais ou com entidades não permitidas.');
  if(XMLValidator.validate(xml)!==true)throw new ErroCusto('XML malformado.');
  const root=new XMLParser({ignoreAttributes:false,removeNSPrefix:true,parseTagValue:false,parseAttributeValue:false,processEntities:false}).parse(xml);
  const nfe=procurar(root,'infNFe') as any;
  if(!nfe?.prod && !nfe?.det)throw new ErroCusto('O arquivo não contém os itens de uma NF-e.');
  const chave=validarChaveNfe(String(nfe['@_Id']||'').replace(/^NFe/,''));
  const ide=nfe.ide||{},emit=nfe.emit||{},tot=nfe.total?.ICMSTot||{};
  const detalhes=Array.isArray(nfe.det)?nfe.det:[nfe.det];
  const dados=novaConferencia('XML');
  Object.assign(dados,{chave,numero:String(ide.nNF||''),serie:String(ide.serie||''),dataEmissao:String(ide.dhEmi||ide.dEmi||''),fornecedorNome:String(emit.xNome||''),fornecedorCnpj:String(emit.CNPJ||emit.CPF||''),totalNota:tot.vNF===undefined?null:String(tot.vNF)});
  dados.totais={frete:valor(tot,'vFrete'),seguro:valor(tot,'vSeg'),despesas:valor(tot,'vOutro'),desconto:valor(tot,'vDesc'),outros:'0',ipi:imposto(valor(tot,'vIPI'),true),icmsSt:imposto(valor(tot,'vST'),true),fcpSt:imposto(valor(tot,'vFCPST'),true)};
  dados.itens=detalhes.map((det:any,k:number)=>{
    const p=det?.prod||{},i=det?.imposto||{};
    const unidade=String(p.uCom||'').toUpperCase();
    const ean=[p.cEAN,p.cEANTrib].map(String).find(e=>/^\d{8}$|^\d{12,14}$/.test(e))||'';
    return {...novoItem(String(det['@_nItem']||k+1)),descricao:String(p.xProd||''),ean,codigoFornecedor:String(p.cProd||''),unidade,
      quantidadeCompra:String(p.qCom||'0'),unidadesEmbalagem:/^(UN|UND|UNID|UNIDADE|PC)$/.test(unidade)?'1':null,
      valorProdutos:String(p.vProd||'0'),desconto:String(p.vDesc||'0'),frete:String(p.vFrete||'0'),seguro:String(p.vSeg||'0'),despesas:String(p.vOutro||'0'),
      ipi:imposto(valor(i,'vIPI'),true),icmsSt:imposto(valor(i,'vICMSST'),true),fcpSt:imposto(valor(i,'vFCPST'),true),icmsProprio:valor(i,'vICMS')};
  });
  dados.avisos=['XML priorizado. Confirme os tributos efetivamente cobrados. ICMS próprio e valores de ST/FCP retidos anteriormente não são somados.','A chave identifica a nota; este módulo não consulta autorização na SEFAZ sem integração configurada.'];
  if(dados.itens.some(i=>i.unidadesEmbalagem===null))dados.avisos.push('Há embalagens sem fator de conversão. Não foi presumida a quantidade por caixa.');
  return dados;
}

const numeroBR=(n:string)=>n.includes(',')?n.replace(/\./g,'').replace(',','.'):n;
export function lerTextoConferencia(texto:string,origem:'FOTO'|'PDF'):ConferenciaCusto{
  if(typeof texto!=='string'||texto.length>300000)throw new ErroCusto('Texto de leitura ausente ou grande demais.');
  const dados=novaConferencia(origem);dados.textoLido=texto;
  const capturar=(regex:RegExp)=>{const m=texto.match(regex);return m?numeroBR(m[1]):null;};
  dados.fornecedorCnpj=(texto.match(/CNPJ\s*[:\s]*([\d./-]{14,18})/i)?.[1]||'').replace(/\D/g,'');
  dados.fornecedorNome=texto.match(/(?:RAZ[AÃ]O SOCIAL|FORNECEDOR|EMITENTE)\s*[:\-]\s*([^\n]+)/i)?.[1]?.trim()||'';
  dados.numero=(texto.match(/(?:NOTA|NF-?E)[ \t]*(?:N[ºO°.]*)?[ \t]*[: \t]+([\d.]+)/i)?.[1]||texto.match(/N[º°][ \t]*[:.]?[ \t]*([\d.]+)/i)?.[1]||'').replace(/\./g,'').replace(/^0+(?=\d)/,'');
  dados.serie=texto.match(/S[EÉ]RIE\s*[:\s]+(\d+)/i)?.[1]||'';
  const chave=texto.match(/(?:\d{4}\s*){11}/)?.[0];if(chave){try{dados.chave=validarChaveNfe(chave);}catch{/* Mark unclear instead of inventing a key. */}}
  if(dados.chave){dados.fornecedorCnpj=dados.chave.slice(6,20);dados.numero=String(Number(dados.chave.slice(25,34)));dados.serie=dados.chave.slice(22,25);}
  const emitente=texto.match(/RECEBEMOS D[EO]\s+(.+?)\s+OS?\s+(?:PRODUTOS|SERVI[ÇC]OS)/i)?.[1];
  if(!dados.fornecedorNome&&emitente)dados.fornecedorNome=emitente.replace(/\s+/g,' ').trim();
  const emissao=texto.match(/EMISS[ÃA]O\s*:\s*(\d{2})\/(\d{2})\/(\d{4})/i);
  if(emissao)dados.dataEmissao=`${emissao[3]}-${emissao[2]}-${emissao[1]}`;
  dados.totalNota=capturar(/(?:VALOR TOTAL DA NOTA|TOTAL DA NOTA|TOTAL A PAGAR|TOTAL)\s*[:=]?\s*R?\$?\s*([\d.]+,\d{2})/i);
  dados.totais={frete:capturar(/(?:VALOR DO )?FRETE\s*[:=]\s*R?\$?\s*([\d.]+,\d{2})/i),seguro:capturar(/SEGURO\s*[:=]\s*R?\$?\s*([\d.]+,\d{2})/i),despesas:capturar(/(?:DESPESAS(?: ACESS[OÓ]RIAS)?|OUTRAS DESPESAS)\s*[:=]\s*R?\$?\s*([\d.]+,\d{2})/i),desconto:capturar(/DESCONTO\s*[:=]\s*R?\$?\s*([\d.]+,\d{2})/i),outros:'0'};
  for(const [campo,label] of [['ipi','IPI'],['icmsSt','ICMS[ -]?ST'],['fcpSt','FCP[ -]?ST']] as const){
    const value=capturar(new RegExp('(?:VALOR (?:DO )?)?'+label+'\\s*[:=]\\s*R?\\$?\\s*([\\d.]+,\\d{2})','i'));
    if(value!==null)dados.totais[campo]=imposto(value,false);
  }
  dados.itens=[];
  for(const linhaOriginal of texto.split(/\r?\n/)){
    const linha=linhaOriginal.replace(/R\$/g,' ').replace(/\s+/g,' ').trim();
    if(/^(TOTAL|VALOR|BASE|ICMS|IPI|FRETE|DESCONTO|SEGURO|CNPJ|FCP|TRIBUTO)\b/i.test(linha))continue;
    const m=linha.match(/^(.+?)\s+(\d+(?:[.,]\d+)?)\s+(?:(UN|UND|KG|L|LT|CX|FD|PCT|PC)\s+)?([\d.]+[,.]\d{2,6})\s+([\d.]+[,.]\d{2})$/i);
    if(!m)continue;
    const qtd=numeroBR(m[2]),unit=numeroBR(m[4]),total=numeroBR(m[5]);
    try{if(decimal(qtd).times(decimal(unit)).minus(decimal(total)).abs().gt('0.03'))continue;}catch{continue;}
    const ean=m[1].match(/\b\d{12,14}\b/)?.[0]||'',unidade=(m[3]||'').toUpperCase();
    dados.itens.push({...novoItem(String(dados.itens.length+1)),ean,descricao:m[1].replace(ean||/$^/,'').trim(),unidade,quantidadeCompra:qtd,valorProdutos:total,unidadesEmbalagem:/^(UN|UND|PC)$/.test(unidade)?'1':null});
  }
  dados.avisos=['Leitura assistida: descrições, impostos e totais ilegíveis ou ausentes exigem correção.','Impostos encontrados na foto/PDF não foram presumidos como adicionais: confirme “cobrado à parte” e “já incluído”.','A leitura pode omitir linhas. Compare todas as páginas com a conferência.'];
  if(!dados.itens.length){dados.itens=[novoItem()];dados.avisos.push('Nenhum produto foi identificado com segurança. Preencha pela nota.');}
  return dados;
}
