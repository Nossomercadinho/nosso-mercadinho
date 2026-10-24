// Synthetic DANFE geometry: no customer document, names, addresses or access key.
const {chave}=require('./custo-real.cjs');
function exemploDanfe(){
 const paginas=[{largura:595.5,altura:842.25,itens:[]},{largura:595.5,altura:842.25,itens:[]}];
 const add=(p,texto,x,y,largura=texto.length*3,altura=6)=>p.itens.push({texto,x,y,largura,altura});
 const cabecalho=(p,y)=>{for(const [texto,x,dy] of [['CÓDIGO DO',24,-3],['PROD. / SERV.',21.75,3],['DESCRIÇÃO DO PRODUTO / SERVIÇO',83.25,0],['NCM / SH',202.5,0],['CST',233.25,-3],['CFOP',249.75,0],['UNID.',268.5,0],['QUANT.',294,0],['UNITÁRIO',327,2.25],['TOTAL',369.75,2.25],['DESCONTO',401.25,-3],['CÁLC. ICMS',438.75,2.25],['I.C.M.S.',480,2.25],['I.P.I.',515.25,2.25],['ICMS',537.75,3],['IPI',559.5,3]])add(p,texto,x,y+dy);};
 cabecalho(paginas[0],506);cabecalho(paginas[1],170);
 const valores=[100,120,80,90,110,200,180,160,84,90,60,100],fatores=[1,1,1,1,1,18,18,18,28,15,12,20];
 let total=0,ipiTotal=0;
 const br=(n,casas=2)=>n.toFixed(casas).replace('.',',');
 valores.forEach((v,k)=>{
  const page=k<7?paginas[0]:paginas[1],n=k<7?k:k-7,y=(k<7?518:182)+n*32,q=k<5?4:1,un=k<5?'PT':'CX',ipi=Math.round(v*0.0325*100)/100;
  total+=Math.round(v*100);ipiTotal+=Math.round(ipi*100);
  add(page,'SKU'+String(k+1).padStart(3,'0'),18,y,25);
  const nome=k<5?`PRODUTO FICTICIO ${k+1} PT 2L`:`PRODUTO FICTICIO ${k+1} CX C/${fatores[k]}`;
  add(page,nome,60.75,y,132);if(k>=5)add(page,'UND.',60.75,y+8,15);
  add(page,'CST:000 cTrib:000001 IBS:R$0,10 CBS:R$0,50',60.75,y+16,130);
  add(page,'IS:R$0,00;Total RT:R$0,60',60.75,y+24,100);
  add(page,'21050010',201,y,26.69);add(page,'051',234,y,10.01);add(page,'5101 '+un,249,y,24.83);
  add(page,br(q)+' '+br(v/q,8),306.75,y,52.61);
  add(page,br(v),378,y,18.35);add(page,'0,00',418.5,y,11.68);add(page,br(v),453.75,y,18.35);add(page,br(v*.12),487.5,y,15.01);
  add(page,br(ipi)+' 19,50',520.5,y,31);add(page,'3,25',557.25,y,11.68);
 });
 const p=paginas[0];add(p,'CÁLCULO DO IMPOSTO',18,360,80);
 for(const [label,x,valor] of [['BASE DE CÁLCULO DO ICMS',20.25,br(total/100)],['VALOR DO ICMS',104.25,'150,00'],['BASE CÁLC. ICMS SUBST.',191.25,'0,00'],['VALOR DO ICMS SUBST.',278.25,'0,00'],['VALOR APROX. DOS TRIBUTOS',365.25,'200,00'],['VALOR TOTAL DOS PRODUTOS',450,br(total/100)]]){add(p,label,x,368,75);add(p,valor,x+45,383,25);}
 for(const [label,x,valor] of [['VALOR DO FRETE',20.25,'9,99'],['VALOR DO SEGURO',104.25,'1,11'],['DESCONTO',191.25,'4,98'],['OUTRAS DESP. ACESS.',278.25,'2,22'],['VALOR DO IPI',365.25,br(ipiTotal/100)],['VALOR TOTAL DA NOTA',450,br((total+ipiTotal+999+111-498+222)/100)]]){add(p,label,x,390,75);add(p,valor,x+45,405,25);}
 add(p,'TRANSPORTADOR / VOLUMES TRANSPORTADOS',18,420,260);add(p,'DADOS ADICIONAIS',18,760,100);
 return {paginas,texto:`RECEBEMOS DE FORNECEDOR FICTICIO OS PRODUTOS / SERVIÇOS\nEMISSÃO: 24/10/2026\nNOTA FISCAL ELETRÔNICA\n0 - ENTRADA\n${chave().match(/.{1,4}/g).join(' ')}\nSÉRIE 001`,valorProdutos:(total/100).toFixed(2),ipi:(ipiTotal/100).toFixed(2),total:((total+ipiTotal+999+111-498+222)/100).toFixed(2),fatores};
}
module.exports={exemploDanfe};
