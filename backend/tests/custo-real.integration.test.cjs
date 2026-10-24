const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),net=require('node:net');
const {spawn}=require('node:child_process'),{once}=require('node:events'),{randomBytes}=require('node:crypto');
const bcrypt=require('bcrypt'),sqlite=require('sqlite3'),{Client,types}=require('pg');
const {exemplo,xml}=require('./helpers/custo-real.cjs');
types.setTypeParser(20,Number);types.setTypeParser(1700,Number);
for(const modo of ['sqlite','postgres'])test(`custo real ${modo}: conferência, entrada atômica, custos, arquivo privado e preservação de venda`,{skip:modo==='postgres'&&!process.env.PG_TEST_DATABASE_URL,timeout:60000},async t=>{
 const root=path.resolve(__dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'mercadinho-nf-test-'));fs.mkdirSync(path.join(temp,'src/database'),{recursive:true});
 let pg,admin,sqliteDb,url,nome,child,logs='';
 const port=await new Promise(ok=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>ok(p));});});
 const sql=async(q,args=[])=>{if(pg){let n=0;return (await pg.query(q.replace(/\?/g,()=>`$${++n}`),args)).rows;}return new Promise((ok,no)=>sqliteDb.all(q,args,(e,r)=>e?no(e):ok(r)));};
 t.after(async()=>{if(child?.exitCode===null){const e=once(child,'exit');child.kill();await e;}if(sqliteDb)await new Promise(ok=>sqliteDb.close(ok));if(pg)await pg.end();if(admin){assert.match(nome,/^mercadinho_nf_[a-f0-9]+_test$/);await admin.query(`DROP DATABASE "${nome}" WITH (FORCE)`);await admin.end();}assert.ok(path.basename(temp).startsWith('mercadinho-nf-test-'));fs.rmSync(temp,{recursive:true,force:true});});
 if(modo==='postgres'){
  const target=new URL(process.env.PG_TEST_DATABASE_URL);assert.ok(['127.0.0.1','localhost','[::1]'].includes(target.hostname));assert.match(target.pathname,/_test$/);target.search='';
  admin=new Client({connectionString:target.toString(),ssl:false});await admin.connect();nome='mercadinho_nf_'+randomBytes(6).toString('hex')+'_test';await admin.query(`CREATE DATABASE "${nome}"`);target.pathname='/'+nome;url=target.toString();pg=new Client({connectionString:url,ssl:false});await pg.connect();
  for(const f of fs.readdirSync(path.join(root,'../supabase/migrations')).filter(f=>f.endsWith('.sql')).sort())await pg.query(fs.readFileSync(path.join(root,'../supabase/migrations',f),'utf8'));
  await sql("INSERT INTO empresas(id,nome) VALUES(1,'Teste de NF')");await sql("INSERT INTO lojas(id,empresa_id,nome,tipo) VALUES(1,1,'Matriz','MATRIZ')");await sql("INSERT INTO locais_estoque(id,loja_id,nome,tipo,permite_venda) VALUES(1,1,'Área de Venda','VENDA',1)");
  for(const table of ['empresas','lojas','locais_estoque'])await pg.query(`SELECT setval(pg_get_serial_sequence('public.${table}','id'),1,true)`);
 }
 child=spawn(process.execPath,[path.join(root,'dist/app.js')],{cwd:temp,env:{...process.env,DB_CLIENT:modo,DATABASE_URL:url||'',PG_SSL:'disable',NODE_ENV:'test',PORT:String(port),JWT_SECRET:randomBytes(32).toString('hex')},stdio:['ignore','pipe','pipe']});child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d);
 const base=`http://127.0.0.1:${port}/api`;
 let ready=false;for(let i=0;i<150;i++){try{if((await fetch(base)).ok){ready=true;break;}}catch{}assert.equal(child.exitCode,null,logs);await new Promise(r=>setTimeout(r,100));}assert.ok(ready,logs);
 if(!pg)sqliteDb=new sqlite.Database(path.join(temp,'src/database/nosso-mercadinho.db'));
 const senha=randomBytes(12).toString('hex');await sql("INSERT INTO usuarios(nome,email,senha,perfil) VALUES('Admin NF','nf@teste.local',?,'ADMINISTRADOR')",[await bcrypt.hash(senha,4)]);
 let token;
 const req=async(route,method='GET',body,status=200,loja=1,auth=token)=>{const r=await fetch(base+route,{method,headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer '+auth}:{}),'X-Loja-Id':String(loja)},...(body===undefined?{}:{body:JSON.stringify(body)})});const d=await r.json();assert.equal(r.status,status,`${modo} ${route}: ${JSON.stringify(d)}\n${logs}`);return d;};
 token=(await req('/auth/login','POST',{email:'nf@teste.local',senha})).token;
 const produto=(await req('/produtos','POST',{ean:'7891234567890',nome:'Arroz fictício',precoVenda:14,precoCusto:3,estoqueInicial:6},201)).id;
 const loja2=(await req('/lojas','POST',{nome:'Filial de teste NF',codigo:'FILIAL-NF'},201)).id;
 const local2=(await req(`/lojas/${loja2}/locais`,'GET',undefined,200,loja2)).locais[0].id;
 await req('/produtos/loja/integrar/'+produto,'POST',{precoVenda:20},200,loja2);
 let draft;
 const doc={nome:'nota-teste.pdf',mime:'application/pdf',base64:Buffer.from('%PDF-1.4\nNF fictícia para integração').toString('base64')};
 await t.test('leitura não grava produtos/fornecedores e documentos irreconhecíveis continuam editáveis',async()=>{
  const l=await req('/nfe/custos/ler','POST',{texto:'Leitura ilegível sem valores seguros',origem:'FOTO'});assert.equal(l.estado.itens[0].revisado,false);assert.equal(l.estado.totalNota,null);
  assert.equal((await sql('SELECT COUNT(*) AS n FROM fornecedores'))[0].n,0);
  const parcial=await req('/nfe/custos/conferir','POST',{estado:{...exemplo(),itens:[{...exemplo().itens[0],quantidadeCompra:'0'}]}});assert.equal(parcial.calculo,null);assert.ok(parcial.erroCalculo);
 });
 await t.test('rascunho é privado, idempotente e não muda custos, preços nem estoque',async()=>{
  const inicial=exemplo();inicial.fornecedorCnpj='12345678000199';inicial.itens[0].codigoFornecedor='A1';inicial.itens[0].salvarEmbalagem=true;
  draft=await req('/nfe/custos/rascunhos','POST',{estado:inicial,documentos:[doc]});assert.ok(draft.id);
  const repeat=await req('/nfe/custos/rascunhos','POST',{estado:exemplo(),documentos:[doc]});assert.equal(repeat.id,draft.id);
  const aberto=await req('/nfe/custos/rascunhos/'+draft.id);assert.equal(aberto.documentos.length,1);assert.equal(aberto.documentos[0].base64,undefined);
  await req('/nfe/custos/rascunhos/'+draft.id,'GET',undefined,404,loja2);
  const id=aberto.documentos[0].id;const download=await fetch(base+'/nfe/custos/documentos/'+id,{headers:{Authorization:'Bearer '+token,'X-Loja-Id':'1'}});assert.equal(download.status,200);assert.equal(download.headers.get('x-content-type-options'),'nosniff');assert.match(download.headers.get('content-disposition'),/attachment/);assert.equal(await download.text(),Buffer.from(doc.base64,'base64').toString());
  await req('/nfe/custos/documentos/'+id,'GET',undefined,404,loja2);
  assert.equal((await sql('SELECT quantidade FROM estoque_saldos WHERE produto_id=? AND local_id=1',[produto]))[0].quantidade,6);
  assert.equal((await sql('SELECT preco_custo FROM produtos_lojas WHERE produto_id=? AND loja_id=1',[produto]))[0].preco_custo,3);
 });
 await t.test('confirmação exige consentimento; grava custo unitário, média ponderada e 12 unidades uma única vez',async()=>{
  await req(`/nfe/custos/rascunhos/${draft.id}/confirmar`,'POST',{versao:draft.versao},400);
  const r=await req(`/nfe/custos/rascunhos/${draft.id}/confirmar`,'POST',{versao:draft.versao,confirmado:true});assert.ok(r.notaId);
  const saldo=(await sql('SELECT quantidade,custo_medio FROM estoque_saldos WHERE produto_id=? AND local_id=1',[produto]))[0];assert.equal(Number(saldo.quantidade),18);assert.ok(Math.abs(Number(saldo.custo_medio)-5.8277777778)<1e-9);
  const atual=(await sql('SELECT preco_custo,preco_venda FROM produtos_lojas WHERE produto_id=? AND loja_id=1',[produto]))[0];assert.ok(Math.abs(Number(atual.preco_custo)-7.2416666667)<1e-9);assert.equal(atual.preco_venda,14);
  assert.equal((await sql('SELECT preco_venda FROM produtos_lojas WHERE produto_id=? AND loja_id=?',[produto,loja2]))[0].preco_venda,20);
  assert.equal((await sql('SELECT quantidade FROM estoque_saldos WHERE produto_id=? AND loja_id=?',[produto,loja2]))[0].quantidade,0);
  assert.equal((await req('/produtos/loja/catalogo')).produtos.find(p=>p.id===produto).preco_custo,Number(atual.preco_custo));
  const repeat=await req(`/nfe/custos/rascunhos/${draft.id}/confirmar`,'POST',{versao:draft.versao,confirmado:true});assert.equal(repeat.jaConfirmada,true);
  assert.equal((await sql('SELECT COUNT(*) AS n FROM notas_entrada'))[0].n,1);assert.equal((await sql('SELECT COUNT(*) AS n FROM financeiro_lancamentos'))[0].n,0);
 });
 await t.test('divergências e versão antiga bloqueiam; correção exige justificativa',async()=>{
  const estado={...exemplo(),numero:'124',totalNota:'86.91'};const r=await req('/nfe/custos/rascunhos','POST',{estado,documentos:[{...doc,base64:Buffer.from('%PDF-1.4 diferente 2').toString('base64')}]});
  await req(`/nfe/custos/rascunhos/${r.id}/confirmar`,'POST',{versao:r.versao,confirmado:true},400);
  estado.totalNota='86.90';await req('/nfe/custos/rascunhos','POST',{id:r.id,versao:r.versao,estado},400);
  const edit=await req('/nfe/custos/rascunhos','POST',{id:r.id,versao:r.versao,estado,justificativa:'Total conferido no original'});assert.equal(edit.versao,2);
  await req('/nfe/custos/rascunhos','POST',{id:r.id,versao:1,estado,justificativa:'Conferência antiga'},409);
 });
 await t.test('falha posterior reverte a nota, os produtos e a primeira movimentação',async()=>{
  const d=exemplo();d.numero='ROLLBACK';d.totalNota='173.80';d.itens.push({...d.itens[0],id:'duplicado'});d.fornecedorNome='Fornecedor que deve reverter';
  const r=await req('/nfe/custos/rascunhos','POST',{estado:d,documentos:[{...doc,base64:Buffer.from('%PDF-1.4 rollback').toString('base64')}]});
  await req(`/nfe/custos/rascunhos/${r.id}/confirmar`,'POST',{versao:r.versao,confirmado:true},400);
  assert.equal((await sql("SELECT COUNT(*) AS n FROM fornecedores WHERE razao_social='Fornecedor que deve reverter'"))[0].n,0);
  assert.equal((await sql('SELECT quantidade FROM estoque_saldos WHERE produto_id=? AND local_id=1',[produto]))[0].quantidade,18);
  assert.equal((await sql('SELECT COUNT(*) AS n FROM notas_entrada'))[0].n,1);
 });
 await t.test('XML priorizado bloqueia a substituição da chave e importação por chave não inventa autorização',async()=>{
  const l=await req('/nfe/custos/ler','POST',{xml:xml()});assert.equal(l.estado.itens[0].produtoId,produto);assert.equal(Number(l.estado.itens[0].unidadesEmbalagem),6);
  const d=await req('/nfe/custos/rascunhos','POST',{estado:l.estado,documentos:[{nome:'nota.xml',mime:'application/xml',base64:Buffer.from(xml()).toString('base64')}]});
  const estado={...d.estado,chave:undefined};await req('/nfe/custos/rascunhos','POST',{id:d.id,versao:d.versao,estado,justificativa:'Tentativa de trocar chave'},400);
  await req('/nfe/custos/chave','POST',{chave:l.estado.chave},501);
 });
 await t.test('código do fornecedor e fator confirmado são reutilizados; descrição aproximada não vincula sozinha',async()=>{
  const fornecedor=(await sql("SELECT id FROM fornecedores WHERE cpf_cnpj='12345678000199'"))[0].id;
  const d=exemplo();d.fornecedorId=fornecedor;d.itens[0].ean='';d.itens[0].codigoFornecedor='A1';d.itens[0].unidadesEmbalagem=null;
  const c=await req('/nfe/custos/conferir','POST',{estado:d});assert.equal(c.estado.itens[0].produtoId,produto);assert.equal(Number(c.estado.itens[0].unidadesEmbalagem),6);assert.equal(c.correspondencias[0].criterio,'CODIGO_FORNECEDOR');
  d.itens[0].codigoFornecedor='';const aproximado=await req('/nfe/custos/conferir','POST',{estado:d});assert.ok(!aproximado.estado.itens[0].produtoId);assert.ok(aproximado.correspondencias[0].sugestoes.some(p=>p.id===produto));
 });
 await t.test('calculadora altera apenas último custo e mantém estoque, custo médio e venda',async()=>{
  const d=exemplo();d.itens=[{...d.itens[0],valorProdutos:'100',frete:'0',icmsSt:{valor:'0',cobrado:false,incluido:false},fcpSt:{valor:'0',cobrado:false,incluido:false},quantidadeCompra:'1',unidadesEmbalagem:'10'}];d.totalNota='100';
  const anterior=(await sql('SELECT preco_custo FROM produtos_lojas WHERE produto_id=? AND loja_id=1',[produto]))[0].preco_custo;
  await req('/nfe/custos/manual/salvar','POST',{produtoId:produto,estado:d,confirmado:true,justificativa:'Simulação manual conferida',custoAnteriorEsperado:anterior});
  const cat=(await req('/produtos/loja/catalogo')).produtos.find(p=>p.id===produto);assert.equal(cat.preco_custo,10);assert.equal(cat.preco_venda,14);assert.equal(cat.estoque,18);assert.ok(Math.abs(Number(cat.custo_medio)-5.8277777778)<1e-9);
  const hist=await req('/nfe/custos/historico');assert.ok(hist.historico.some(h=>h.origem==='CALCULADORA'&&h.usuario_id));
 });
});
