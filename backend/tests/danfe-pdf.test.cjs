const {test}=require('node:test'),assert=require('node:assert/strict');
const {lerDanfePdf}=require('../dist/domain/ler-danfe-pdf');
const {calcularCustoReal}=require('../dist/domain/custo-real');
const {exemploDanfe}=require('./helpers/danfe-pdf.cjs');
const {chave}=require('./helpers/custo-real.cjs');
test('DANFE em duas páginas lê todos os itens, colunas fundidas e descrições quebradas',()=>{
 const f=exemploDanfe(),d=lerDanfePdf(f.paginas,f.texto);
 assert.equal(d.itens.length,12);assert.equal(d.itens[0].codigoFornecedor,'SKU001');assert.equal(d.itens[11].codigoFornecedor,'SKU012');
 assert.deepEqual(d.itens.map(i=>Number(i.unidadesEmbalagem)),f.fatores);
 assert.ok(d.itens.every(i=>!i.revisado&&!i.ean));assert.ok(d.itens.every(i=>!i.descricao.includes('IBS:')&&!i.descricao.includes('CBS:')));
 assert.ok(d.itens[6].descricao.endsWith('18 UND.'));assert.ok(!d.itens[4].descricao.includes('CX'));
 const c=calcularCustoReal(d);assert.equal(c.totais.valorProdutos,f.valorProdutos);assert.equal(c.totais.ipi,f.ipi);assert.equal(c.totais.calculado,f.total);assert.equal(c.totais.diferenca,'0.00');assert.equal(c.podeConfirmar,false);assert.equal(c.totais.icmsSt,'0.00');
});
test('chave define emitente, número e série sem confundir o zero de entrada do DANFE',()=>{
 const f=exemploDanfe(),d=lerDanfePdf(f.paginas,f.texto);assert.equal(d.numero,String(Number(chave().slice(25,34))));assert.notEqual(d.numero,'0');assert.equal(d.fornecedorNome,'FORNECEDOR FICTICIO');assert.equal(d.fornecedorCnpj,chave().slice(6,20));assert.equal(d.dataEmissao,'2026-10-24');assert.equal(d.serie,chave().slice(22,25));
});
test('página de continuação sem quadro de totais não substitui os impostos da primeira página',()=>{
 const f=exemploDanfe(),d=lerDanfePdf(f.paginas,f.texto);assert.equal(d.totais.frete,'9.99');assert.equal(d.totais.desconto,'4.98');assert.equal(d.totais.seguro,'1.11');assert.equal(d.totais.despesas,'2.22');assert.equal(d.totais.ipi.valor,f.ipi);
});
test('página faltante gera aviso e impede conciliação em vez de fabricar produtos',()=>{
 const f=exemploDanfe(),d=lerDanfePdf([f.paginas[0]],f.texto);assert.equal(d.itens.length,7);assert.equal(calcularCustoReal(d).conciliado,false);assert.ok(d.avisos.some(a=>a.includes('difere do total')));
});
test('caixa sem quantidade explícita não presume fator e uma medida em litros não vira contagem',()=>{
 const f=exemploDanfe();const t=f.paginas[1].itens.find(t=>t.texto.includes('PRODUTO FICTICIO 12'));t.texto='PRODUTO FICTICIO 12 CX 2L';
 const d=lerDanfePdf(f.paginas,f.texto);assert.equal(d.itens[11].unidadesEmbalagem,null);assert.equal(d.itens[0].unidadesEmbalagem,'1');
});
test('PDF sem tabela DANFE preserva leitura simples; coordenadas inválidas são recusadas',()=>{
 const d=lerDanfePdf([], 'FORNECEDOR: Fictício\nArroz 2 UN 10,00 20,00\nTOTAL: 20,00');assert.equal(d.itens[0].valorProdutos,'20.00');assert.throws(()=>lerDanfePdf([{largura:500,altura:800,itens:[{texto:'x',x:NaN,y:0,largura:2,altura:2}]}],''));
});
test('DANFE sem chave não confunde 0 - ENTRADA com o número e aceita número impresso pontuado',()=>{
 const {lerTextoConferencia}=require('../dist/domain/ler-nota');
 const d=lerTextoConferencia('NF-e\nNOTA FISCAL ELETRÔNICA\n0 - ENTRADA\n1 - SAÍDA\nNº 000.123.456\nSÉRIE 001','PDF');assert.equal(d.numero,'123456');
});
