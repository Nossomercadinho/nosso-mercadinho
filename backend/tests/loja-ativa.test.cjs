const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { randomBytes } = require('node:crypto');
const sqlite3 = require('sqlite3');
const bcrypt = require('bcrypt');

test('mercado ativo isola clientes, fornecedores, financeiro e NF-e mesmo para administrador', { timeout: 60000 }, async t => {
  const root = path.resolve(__dirname, '..'), temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mercado-ativo-test-'));
  fs.mkdirSync(path.join(temp,'src/database'),{recursive:true});
  // Simulate a pre-existing installation before the startup migration runs.
  const databaseSource=fs.readFileSync(path.join(root,'src/database/sqlite.ts'),'utf8');
  const legacyStart=databaseSource.indexOf('CREATE TABLE IF NOT EXISTS fornecedores (');
  const legacySchema=databaseSource.slice(legacyStart,databaseSource.indexOf('`',legacyStart));
  const seed=new sqlite3.Database(path.join(temp,'src/database/nosso-mercadinho.db'));
  await new Promise((resolve,reject)=>seed.exec(`${legacySchema}; INSERT INTO fornecedores(id,razao_social,cpf_cnpj) VALUES(1,'Fornecedor legado','11111111000111')`,e=>e?reject(e):resolve()));
  await new Promise(resolve=>seed.close(resolve));
  const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
  let logs='',db;
  const child=spawn(process.execPath,['-r',require.resolve('ts-node/register/transpile-only'),path.join(root,'src/app.ts')],{cwd:temp,windowsHide:true,env:{...process.env, DB_CLIENT: "sqlite", DATABASE_URL: "",PORT:String(port),JWT_SECRET:randomBytes(32).toString('hex'),TS_NODE_PROJECT:path.join(root,'tsconfig.json')},stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',d=>{logs+=d;});child.stderr.on('data',d=>{logs+=d;});
  t.after(async()=>{if(db)await new Promise(r=>db.close(r));if(child.exitCode===null){const end=once(child,'exit');child.kill();await end;}assert.equal(path.dirname(path.resolve(temp)),path.resolve(os.tmpdir()));assert.ok(path.basename(temp).startsWith('mercado-ativo-test-'));fs.rmSync(temp,{recursive:true,force:true});});
  const base=`http://127.0.0.1:${port}/api`;
  for(let i=0;i<100;i++){try{if((await fetch(base)).ok)break;}catch{}assert.equal(child.exitCode,null,logs);await new Promise(r=>setTimeout(r,60));}
  db=new sqlite3.Database(path.join(temp,'src/database/nosso-mercadinho.db'));
  const run=(sql,args=[])=>new Promise((resolve,reject)=>db.run(sql,args,function(e){e?reject(e):resolve(this.lastID);}));
  const get=(sql,args=[])=>new Promise((resolve,reject)=>db.get(sql,args,(e,row)=>e?reject(e):resolve(row)));
  for(let i=0;i<50;i++){if(await get('SELECT id FROM locais_estoque WHERE id=1'))break;await new Promise(r=>setTimeout(r,30));}
  const password=randomBytes(16).toString('hex');
  await run('INSERT INTO usuarios(nome,email,senha,perfil) VALUES(?,?,?,?)',['Admin','admin@ativa.test',await bcrypt.hash(password,4),'ADMINISTRADOR']);
  const request=async(route,loja,method='GET',body,expected=200)=>{const r=await fetch(base+route,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`} : {}),...(loja?{'X-Loja-Id':String(loja)}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});const data=await r.json();assert.ok((Array.isArray(expected)?expected:[expected]).includes(r.status),`${method} ${route} loja=${loja}: ${r.status} ${JSON.stringify(data)}\n${logs}`);return data;};
  let token;
  token=(await request('/auth/login',null,'POST',{email:'admin@ativa.test',senha:password})).token;
  const store2=await run("INSERT INTO lojas(empresa_id,nome,tipo) VALUES(1,'Bairro','FILIAL')");
  const local2=await run("INSERT INTO locais_estoque(loja_id,nome,tipo,permite_venda) VALUES(?,'Venda','VENDA',1)",[store2]);
  // Seed a legacy supplier before the additive migration; it must stay in Matriz.
  const legacy=1;
  await t.test('migração conserva cadastro legado na Matriz e novos fornecedores só na ativa',async()=>{
    assert.deepEqual((await request('/fornecedores',1)).fornecedores.map(f=>f.id),[legacy]);
    assert.deepEqual((await request('/fornecedores',store2)).fornecedores,[]);
  });
  let supplier,otherSupplier,customer,only2,productCommon;
  await t.test('CNPJ reutiliza identidade com contatos, situação e preços independentes por loja',async()=>{
    supplier=(await request('/fornecedores',1,'POST',{razaoSocial:'Fornecedor Matriz',cpfCnpj:'22222222000122',telefone:'1111111111'},201)).fornecedor;
    assert.equal((await request('/fornecedores',store2)).fornecedores.length,0);
    const reused=(await request('/fornecedores',store2,'POST',{razaoSocial:'Fornecedor Bairro',cpfCnpj:'22222222000122',telefone:'2222222222'},201)).fornecedor;
    assert.equal(reused.id,supplier.id);assert.equal((await get('SELECT COUNT(*) AS total FROM fornecedores WHERE cpf_cnpj=?',['22222222000122'])).total,1);
    assert.equal((await request(`/fornecedores/${supplier.id}`,1)).fornecedor.telefone,'1111111111');
    assert.equal((await request(`/fornecedores/${supplier.id}`,store2)).fornecedor.telefone,'2222222222');
    await request(`/fornecedores/${supplier.id}/desativar`,store2,'PATCH',{});
    assert.equal((await request(`/fornecedores/${supplier.id}`,1)).fornecedor.ativo,1);
    assert.equal((await request(`/fornecedores/${supplier.id}`,store2)).fornecedor.ativo,0);
    await request(`/fornecedores/${supplier.id}/reativar`,store2,'PATCH',{});
    otherSupplier=(await request('/fornecedores',store2,'POST',{razaoSocial:'Somente Bairro',cpfCnpj:'33333333000133'},201)).fornecedor;
    await request(`/fornecedores/${otherSupplier.id}`,1,'GET',undefined,404);
    await request(`/fornecedores/${otherSupplier.id}`,1,'PUT',{razaoSocial:'Tentativa'},404);
    const product=await run("INSERT INTO produtos(ean,nome,preco_venda) VALUES('7899870000001','Produto comum',10)");productCommon=product;
    await run('INSERT INTO produtos_lojas(produto_id,loja_id,preco_venda) VALUES(?,1,10)',[product]);
    await run('INSERT INTO produtos_lojas(produto_id,loja_id,preco_venda) VALUES(?,?,10)',[product,store2]);
    await request(`/fornecedores/${supplier.id}/precos`,1,'POST',{produtoId:product,custoUnitario:3,quantidade:2},201);
    await request(`/fornecedores/${supplier.id}/precos`,store2,'POST',{produtoId:product,custoUnitario:5,quantidade:4},201);
    assert.deepEqual((await request(`/fornecedores/${supplier.id}/historico`,1)).historico.map(h=>h.custo_unitario),[3]);
    assert.deepEqual((await request(`/fornecedores/${supplier.id}/historico`,store2)).historico.map(h=>h.custo_unitario),[5]);
    assert.equal((await request(`/fornecedores/${supplier.id}/produtos`,1)).produtos[0].ultimo_custo,3);
    assert.equal((await request(`/fornecedores/${supplier.id}/produtos`,store2)).produtos[0].ultimo_custo,5);
  });
  await t.test('CPF só é incluído em outro mercado por cadastro explícito, sem duplicar identidade',async()=>{
    customer=(await request('/clientes-prazo',1,'POST',{nome:'Cliente Matriz',cpf:'12345678901',telefone:'41999999999',limiteCredito:500},201)).cliente;
    assert.deepEqual((await request('/clientes-prazo',store2)).clientes,[]);
    await request(`/clientes-prazo/${customer.id}`,store2,'GET',undefined,400);
    const reused=(await request('/clientes-prazo',store2,'POST',{nome:'Cliente Matriz',cpf:'12345678901',telefone:'41999999999'},201)).cliente;
    assert.equal(reused.id,customer.id);assert.equal(reused.limiteCredito,500);
    only2=(await request('/clientes-prazo',store2,'POST',{nome:'Cliente Bairro',cpf:'98765432100',telefone:'41988888888'},201)).cliente;
    assert.deepEqual((await request('/clientes-prazo',1)).clientes.map(c=>c.id),[customer.id]);
    await request(`/clientes-prazo/${only2.id}/limite`,1,'PATCH',{limiteCredito:99},400);
    assert.equal((await get('SELECT COUNT(*) AS total FROM clientes WHERE cpf=?',['12345678901'])).total,1);
  });
  let financial1,financial2;
  await t.test('financeiro deriva loja ativa e bloqueia recurso ou fornecedor de outro mercado',async()=>{
    financial1=await request('/financeiro',1,'POST',{tipo:'SAIDA',fornecedorId:supplier.id,descricao:'Despesa Matriz',valorOriginal:10,dataVencimento:'2026-10-15'},201);
    financial2=await request('/financeiro',store2,'POST',{tipo:'SAIDA',fornecedorId:otherSupplier.id,descricao:'Despesa Bairro',valorOriginal:20,dataVencimento:'2026-10-15'},201);
    assert.deepEqual((await request('/financeiro',1)).lancamentos.map(f=>f.descricao),['Despesa Matriz']);
    assert.deepEqual((await request('/financeiro',store2)).lancamentos.map(f=>f.descricao),['Despesa Bairro']);
    const id1=(await get("SELECT id FROM financeiro_lancamentos WHERE descricao='Despesa Matriz'")).id;
    await request(`/financeiro/${id1}`,store2,'GET',undefined,403);
    await request(`/financeiro/${id1}`,store2,'PATCH',{descricao:'Tentativa'},403);
    await request('/financeiro',1,'POST',{lojaId:store2,tipo:'SAIDA',descricao:'Forjado',valorOriginal:1,dataVencimento:'2026-10-15'},403);
    await request('/financeiro',1,'POST',{fornecedorId:otherSupplier.id,tipo:'SAIDA',descricao:'Fornecedor fora',valorOriginal:1,dataVencimento:'2026-10-15'},400);
    assert.equal((await request('/financeiro/resumo',1)).resumo.aPagar,10);
    assert.equal((await request('/financeiro/resumo',store2)).resumo.aPagar,20);
  });
  await t.test('venda a prazo e estoque seguem a sessão do caixa mesmo com outro mercado no header',async()=>{
    const session=(await request('/caixas/abrir',store2,'POST',{lojaId:1,localId:1,saldoInicial:0},201)).sessao;
    const payload={itens:[{produtoId:productCommon,quantidade:1}],pagamentos:[{forma:'A_PRAZO',valor:10}],cliente:{id:only2.id,nome:only2.nome,cpf:only2.cpf,telefone:only2.telefone}};
    await request('/vendas',store2,'POST',payload,400);
    await request('/vendas',store2,'POST',{...payload,cliente:{id:customer.id,nome:customer.nome,cpf:customer.cpf,telefone:customer.telefone}},201);
    assert.equal((await get('SELECT quantidade FROM estoque_saldos WHERE produto_id=? AND loja_id=1',[productCommon])).quantidade,-1);
    assert.equal((await get('SELECT COUNT(*) AS total FROM estoque_saldos WHERE produto_id=? AND loja_id=?',[productCommon,store2])).total,0);
    const active1=(await request('/clientes-prazo',1)).clientes.find(c=>c.id===customer.id);
    const active2=(await request('/clientes-prazo',store2)).clientes.find(c=>c.id===customer.id);
    assert.equal(active1.saldoDevedor,10);assert.equal(active2.saldoDevedor,0);
    assert.equal(active1.limiteDisponivel,490);assert.equal(active2.limiteDisponivel,490);
    await request(`/caixas/${session.id}/fechar`,store2,'POST',{valorContado:0});
  });
  await t.test('NF-e associa fornecedor somente à ativa e movimentos ficam no destino da nota',async()=>{
    const product=await run("INSERT INTO produtos(ean,nome,preco_venda,preco_custo) VALUES('7899870000002','Produto NF',10,4)");
    await run('INSERT INTO produtos_lojas(produto_id,loja_id,preco_venda) VALUES(?,?,10)',[product,store2]);
    const xml=`<NFe><infNFe Id="NFe${'4'.repeat(44)}"><ide><nNF>100</nNF><serie>1</serie><mod>55</mod><dhEmi>2026-10-15T10:00:00-03:00</dhEmi></ide><emit><CNPJ>44444444000144</CNPJ><xNome>Fornecedor XML Bairro</xNome><enderEmit><xMun>Curitiba</xMun><UF>PR</UF></enderEmit></emit><det nItem="1"><prod><cProd>1</cProd><cEAN>7899870000002</cEAN><xProd>Produto NF</xProd><NCM>01010101</NCM><uCom>UN</uCom><qCom>2</qCom><vUnCom>4</vUnCom><vProd>8</vProd></prod></det><total><ICMSTot><vProd>8</vProd><vNF>8</vNF></ICMSTot></total></infNFe></NFe>`;
    const imported=await request('/nfe/importar',store2,'POST',{xml,localEstoqueId:local2},201);
    const id=imported.resultado.notaEntradaId;
    assert.equal((await request('/nfe',1)).notas.length,0);
    assert.equal((await request('/nfe',store2)).notas[0].loja_id,store2);
    await request(`/nfe/${id}`,1,'GET',undefined,403);
    await request(`/nfe/${id}/efetivar`,1,'PATCH',{},403);
    await request(`/nfe/${id}/efetivar`,store2,'PATCH',{});
    assert.equal((await get('SELECT quantidade FROM estoque_saldos WHERE produto_id=? AND loja_id=?',[product,store2])).quantidade,2);
    assert.equal((await get('SELECT COUNT(*) AS total FROM estoque_saldos WHERE produto_id=? AND loja_id=1',[product])).total,0);
    assert.equal((await request('/fornecedores',1)).fornecedores.some(f=>f.cpf_cnpj==='44444444000144'),false);
    assert.equal((await request('/fornecedores',store2)).fornecedores.some(f=>f.cpf_cnpj==='44444444000144'),true);
  });
});
