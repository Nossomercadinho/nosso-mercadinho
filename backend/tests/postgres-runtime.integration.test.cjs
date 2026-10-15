const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const net=require('node:net');
const {spawn}=require('node:child_process');
const {once}=require('node:events');
const {randomBytes}=require('node:crypto');
const {Client,types}=require('pg');
const bcrypt=require('bcrypt');
types.setTypeParser(20,Number);types.setTypeParser(1700,Number);
const testUrl=process.env.PG_TEST_DATABASE_URL;

test('API real PostgreSQL: autenticação, lojas, cadastros, estoque, PDV, crédito, financeiro e NF-e',{skip:!testUrl,timeout:90000},async t=>{
  const root=path.resolve(__dirname,'..');let url;
  assert.ok(fs.existsSync(path.join(root,'dist/app.js')),'Execute npm run build antes do teste PostgreSQL.');
  try{url=new URL(testUrl);}catch{throw new Error('PG_TEST_DATABASE_URL inválida.');}
  assert.ok(['localhost','127.0.0.1','[::1]'].includes(url.hostname),'Testes aceitam somente PostgreSQL local descartável.');
  assert.match(url.pathname,/\/[^/]+_test$/,'PG_TEST_DATABASE_URL deve apontar para banco de teste com sufixo _test.');
  url.search='';
  const name=`mercadinho_api_${randomBytes(6).toString('hex')}_test`;
  const admin=new Client({connectionString:url.toString(),ssl:false});await admin.connect();
  await admin.query(`CREATE DATABASE "${name}"`);
  const target=new URL(url);target.pathname=`/${name}`;
  const db=new Client({connectionString:target.toString(),ssl:false});await db.connect();
  let child,temp,logs='';
  t.after(async()=>{
    if(child&&child.exitCode===null){const exit=once(child,'exit');child.kill();await exit;}
    await db.end();
    assert.match(name,/^mercadinho_api_[a-f0-9]{12}_test$/);
    await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);await admin.end();
    if(temp){assert.equal(path.dirname(path.resolve(temp)),path.resolve(os.tmpdir()));assert.ok(path.basename(temp).startsWith('mercadinho-pg-test-'));fs.rmSync(temp,{recursive:true,force:true});}
  });
  const migrations=path.resolve(root,'../supabase/migrations');
  for(const file of fs.readdirSync(migrations).filter(f=>f.endsWith('.sql')).sort())await db.query(fs.readFileSync(path.join(migrations,file),'utf8'));
  const fixture=async(sql,args=[])=>{let n=0;return db.query(sql.replace(/\?/g,()=>`$${++n}`),args);};
  await fixture("INSERT INTO empresas(nome) VALUES('Teste PostgreSQL')");
  await fixture("INSERT INTO lojas(empresa_id,nome,codigo,tipo) VALUES(1,'Matriz','MATRIZ','MATRIZ')");
  await fixture("INSERT INTO locais_estoque(loja_id,nome,tipo,permite_venda) VALUES(1,'Área de Venda','VENDA',1)");
  const senha=randomBytes(16).toString('hex');
  await fixture('INSERT INTO usuarios(nome,email,senha,perfil) VALUES(?,?,?,?)',['Administradora','admin@pg.test',await bcrypt.hash(senha,4),'ADMINISTRADOR']);
  await t.test('driver fixa conexão durante transação, preserva rollback e reconecta sem repetir gravações',async()=>{
    const previous={DATABASE_URL:process.env.DATABASE_URL,PG_SSL:process.env.PG_SSL,NODE_ENV:process.env.NODE_ENV,TS_NODE_PROJECT:process.env.TS_NODE_PROJECT};
    process.env.DATABASE_URL=target.toString();process.env.PG_SSL='disable';process.env.NODE_ENV='test';process.env.TS_NODE_PROJECT=path.join(root,'tsconfig.json');
    require('ts-node/register/transpile-only');
    const {PostgresDatabase}=require('../src/database/postgres.ts');
    const driver=new PostgresDatabase();
    const execute=(sql,args=[])=>new Promise((resolve,reject)=>driver.run(sql,args,function(e){e?reject(e):resolve({id:this.lastID,changes:this.changes});}));
    const one=(sql,args=[])=>new Promise((resolve,reject)=>driver.get(sql,args,(e,row)=>e?reject(e):resolve(row)));
    try{
      await driver.ready;await execute('BEGIN IMMEDIATE TRANSACTION');
      const before=(await one('SELECT pg_backend_pid() AS pid')).pid;
      await execute("INSERT INTO empresas(nome) VALUES ('Transação revertida')");
      await new Promise(resolve=>setTimeout(resolve,10500));
      assert.equal((await one('SELECT pg_backend_pid() AS pid')).pid,before,'O timeout de idle do pool não pode substituir uma conexão em transação.');
      await assert.rejects(execute("INSERT INTO empresas(id,nome) VALUES (1,'Duplicada')"),e=>e.code==='SQLITE_CONSTRAINT'&&e.postgresCode==='23505'&&e.message.includes('UNIQUE'));
      await execute('ROLLBACK');assert.equal(await one("SELECT id FROM empresas WHERE nome='Transação revertida'"),undefined);
      await execute('BEGIN');const pid=(await one('SELECT pg_backend_pid() AS pid')).pid;
      await execute("INSERT INTO empresas(nome) VALUES ('Conexão interrompida')");
      await fixture('SELECT pg_terminate_backend(?)',[pid]);
      await new Promise(resolve=>setTimeout(resolve,100));
      await assert.rejects(execute("INSERT INTO empresas(nome) VALUES ('Não pode repetir')"));
      await execute('ROLLBACK').catch(()=>undefined);
      await driver.ping();assert.equal(await one("SELECT id FROM empresas WHERE nome IN ('Conexão interrompida','Não pode repetir')"),undefined);
    }finally{
      await new Promise(resolve=>driver.close(resolve));
      for(const[key,value]of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value;}
    }
  });
  const port=await new Promise(resolve=>{const server=net.createServer();server.listen(0,'127.0.0.1',()=>{const p=server.address().port;server.close(()=>resolve(p));});});
  temp=fs.mkdtempSync(path.join(os.tmpdir(),'mercadinho-pg-test-'));
  child=spawn(process.execPath,[path.join(root,'dist/app.js')],{cwd:temp,windowsHide:true,env:{...process.env,DB_CLIENT:'postgres',DATABASE_URL:target.toString(),PG_SSL:'disable',NODE_ENV:'test',JWT_SECRET:randomBytes(32).toString('hex'),PORT:String(port)},stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',v=>{logs+=v;});child.stderr.on('data',v=>{logs+=v;});
  const base=`http://127.0.0.1:${port}/api`;
  for(let i=0;i<150;i++){try{if((await fetch(base)).ok)break;}catch{}assert.equal(child.exitCode,null,logs);await new Promise(r=>setTimeout(r,100));}
  let token;
  const request=async(route,loja=1,method='GET',body,expected=200,otherToken=token)=>{
    const r=await fetch(base+route,{method,headers:{'Content-Type':'application/json',...(otherToken?{Authorization:`Bearer ${otherToken}`}:{ } ),...(loja?{'X-Loja-Id':String(loja)}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});
    const data=await r.json();assert.equal(r.status,expected,`${method} ${route} loja=${loja}: ${r.status} ${JSON.stringify(data)}\n${logs}`);return data;
  };
  token=(await request('/auth/login',null,'POST',{email:'admin@pg.test',senha})).token;
  await t.test('startup valida schema; login e todos os módulos consultam sem aliases quebrados',async()=>{
    const me=(await request('/auth/me')).usuario;assert.equal(me.nome,'Administradora');assert.equal(me.acessoTodasLojas,true);assert.ok(me.permissoes.includes('usuarios'));
    for(const route of ['/auth/lojas','/usuarios','/usuarios/papeis','/lojas','/produtos','/produtos/matriz/catalogo','/estoque','/estoque/movimentacoes','/fornecedores','/fornecedores/resumo','/financeiro','/financeiro/resumo','/financeiro/categorias','/nfe','/clientes-prazo','/vendas-gestao','/vendas/pdv/locais','/caixas','/caixas/contexto','/fechamento-diario','/fechamento-diario/executores'])await request(route);
    assert.ok(logs.includes('esquema do projeto validado'));
  });
  let loja2,local2,product,customer,supplier,cashier,cashToken,session;
  await t.test('INSERT retorna id; papéis ignoram duplicidade sem apagar cadastros; NOCASE bloqueia nome repetido',async()=>{
    const unit=await request('/lojas',null,'POST',{nome:'Bairro',codigo:'BAIRRO'},201);loja2=unit.id;
    local2=(await request(`/lojas/${loja2}/locais`,null)).locais.find(l=>l.permite_venda===1).id;
    const role=(await request('/usuarios/papeis',null,'POST',{nome:'Atendimento PG',permissoes:['pdv','clientes','vendas','caixas']},201)).papel;
    await request('/usuarios/papeis',null,'POST',{nome:'atendimento pg',permissoes:['pdv']},409);
    cashier=(await request('/usuarios',null,'POST',{nome:'Caixa Bairro',email:'caixa@pg.test',senha,papelId:role.id,lojaIds:[loja2]},201)).usuario;
    cashToken=(await request('/auth/login',null,'POST',{email:'caixa@pg.test',senha})).token;
    await request('/lojas/1/locais',null,'GET',undefined,403,cashToken);
    assert.equal((await request('/auth/me',null,'GET',undefined,200,cashToken)).usuario.lojaIds[0],loja2);
  });
  await t.test('fornecedor/cliente/produto são vinculados somente à loja ativa e CPF/CNPJ reutilizam identidade',async()=>{
    supplier=(await request('/fornecedores',loja2,'POST',{razaoSocial:'Fornecedor Bairro PG',cpfCnpj:'12345678000199',telefone:'41999999999'},201)).fornecedor;
    customer=(await request('/clientes-prazo',loja2,'POST',{nome:'Cliente Bairro PG',cpf:'12345678901',telefone:'41999999999',limiteCredito:500},201)).cliente;
    product=(await request('/produtos',loja2,'POST',{ean:'7899871230001',nome:'Café PostgreSQL',precoVenda:10,precoCusto:4,estoqueInicial:10,unidadeMedida:'UN'},201));
    const second=await request('/produtos',loja2,'POST',{ean:'7899871230002',nome:'Segundo produto PG',precoVenda:4,precoCusto:2},201);
    await request(`/produtos/loja/${second.id}`,loja2,'PATCH',{ean:'7899871230001'},409);
    assert.ok(product.id);assert.equal((await request('/fornecedores',1)).fornecedores.length,0);assert.equal((await request('/clientes-prazo',1)).clientes.length,0);
    assert.equal((await request('/produtos',loja2)).produtos.find(p=>p.id===product.id).estoque,10);
    const reused=(await request('/fornecedores',1,'POST',{razaoSocial:'Fornecedor Matriz PG',cpfCnpj:'12345678000199'},201)).fornecedor;assert.equal(reused.id,supplier.id);
    assert.equal((await request('/fornecedores',loja2)).fornecedores[0].razao_social,'Fornecedor Bairro PG');
  });
  let saleId;
  await t.test('PDV por sessão: sugestões, cartão, baixa de estoque, crédito global e resumo de vendas com data',async()=>{
    await request('/vendas',loja2,'POST',{itens:[{produtoId:product.id,quantidade:1}],pagamentos:[{forma:'PIX',valor:10}]},400,cashToken);
    session=(await request('/caixas/abrir',null,'POST',{lojaId:loja2,localId:local2,saldoInicial:100},201,cashToken)).sessao;
    assert.equal(session.lojaNome,'Bairro');assert.equal(session.usuarioNome,'Caixa Bairro');assert.equal(typeof session.abertoEm,'string');
    const suggestions=(await request('/vendas/pdv/pesquisar?q=7899',null,'GET',undefined,200,cashToken)).produtos;assert.equal(suggestions[0].precoVenda,10);
    saleId=(await request('/vendas',null,'POST',{itens:[{produtoId:product.id,quantidade:2}],pagamentos:[{forma:'CARTAO_DEBITO',valor:20}]},201,cashToken)).vendaId;
    await request('/vendas',null,'POST',{itens:[{produtoId:product.id,quantidade:1}],pagamentos:[{forma:'A_PRAZO',valor:10}],cliente:{id:customer.id,nome:customer.nome,cpf:customer.cpf,telefone:customer.telefone}},201,cashToken);
    const clients=(await request('/clientes-prazo',loja2)).clientes;assert.equal(clients[0].limiteDisponivel,490);assert.equal(clients[0].saldoDevedor,10);
    const vendas=await request('/vendas-gestao?dataInicio=2020-01-01&dataFim=2099-01-01',loja2);assert.equal(vendas.resumo.total,30);assert.equal(vendas.vendas[0].lojaNome,'Bairro');assert.equal(vendas.vendas[0].usuarioNome,'Caixa Bairro');
    assert.equal((await request('/produtos',loja2)).produtos.find(p=>p.id===product.id).estoque,7);
    const closed=await request(`/caixas/${session.id}/fechar`,null,'POST',{valorContado:100},200,cashToken);assert.equal(closed.sessao.status,'FECHADO');assert.equal(closed.sessao.diferenca,0);assert.equal(closed.resumo.valorEsperado,100);
    await request(`/vendas-gestao/${saleId}/cancelar`,loja2,'POST',{motivo:'Tentativa após fechamento'},400);
    assert.equal((await request(`/caixas/${session.id}`,null)).resumo.totalVendas,30);
  });
  await t.test('financeiro cria/baixa e filtra por loja; recebimento a prazo atualiza disponível',async()=>{
    await request('/financeiro',loja2,'POST',{tipo:'SAIDA',fornecedorId:supplier.id,descricao:'Compra PG',valorOriginal:30,dataVencimento:'2026-10-15'},201);
    const lancamento=(await request('/financeiro',loja2)).lancamentos.find(l=>l.descricao==='Compra PG');assert.equal(lancamento.valor_original,30);
    await request(`/financeiro/${lancamento.id}/baixas`,loja2,'POST',{valor:30,dataBaixa:'2026-10-15',formaPagamento:'PIX'});
    assert.equal((await request(`/financeiro/${lancamento.id}`,loja2)).lancamento.status,'PAGO');
    await request(`/financeiro/${lancamento.id}`,1,'GET',undefined,403);
    const detail=await request(`/clientes-prazo/${customer.id}`,loja2);assert.equal(detail.contas[0].saldo,10);
    await request(`/clientes-prazo/contas/${detail.contas[0].id}/recebimentos`,loja2,'POST',{valor:5,formaPagamento:'PIX'},201);
    assert.equal((await request(`/clientes-prazo/${customer.id}`,loja2)).cliente.limiteDisponivel,495);
    await request(`/fornecedores/${supplier.id}/precos`,loja2,'POST',{produtoId:product.id,custoUnitario:4,quantidade:5},201);
    assert.equal((await request(`/fornecedores/${supplier.id}/historico`,loja2)).historico[0].custo_unitario,4);
  });
  await t.test('NF-e importa, efetiva e registra preço no mesmo mercado sem stock global',async()=>{
    const xml=`<NFe><infNFe Id="NFe${'6'.repeat(44)}"><ide><nNF>66</nNF><serie>1</serie><mod>55</mod><dhEmi>2026-10-15T10:00:00-03:00</dhEmi></ide><emit><CNPJ>12345678000199</CNPJ><xNome>Fornecedor Bairro PG</xNome></emit><det nItem="1"><prod><cProd>1</cProd><cEAN>7899871230001</cEAN><xProd>Café PostgreSQL</xProd><NCM>01010101</NCM><uCom>UN</uCom><qCom>2</qCom><vUnCom>4</vUnCom><vProd>8</vProd></prod></det><total><ICMSTot><vProd>8</vProd><vNF>8</vNF></ICMSTot></total></infNFe></NFe>`;
    const imported=(await request('/nfe/importar',loja2,'POST',{xml,localEstoqueId:local2},201)).resultado;
    await request(`/nfe/${imported.notaEntradaId}/efetivar`,loja2,'PATCH',{});
    assert.equal((await request('/produtos',loja2)).produtos.find(p=>p.id===product.id).estoque,9);
    assert.equal((await request('/nfe',1)).notas.length,0);assert.equal((await request('/nfe',loja2)).notas[0].status,'EFETIVADA');
  });
});
