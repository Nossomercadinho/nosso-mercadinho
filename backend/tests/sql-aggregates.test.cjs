const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

test('consultas portáveis preservam fornecedor por mercado e agregados de venda', { timeout: 20000 }, async t => {
  const root = path.resolve(__dirname, '..');
  const previous = process.cwd();
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mercadinho-aggregates-'));
  fs.mkdirSync(path.join(temp, 'src/database'), { recursive: true });
  process.env.DB_CLIENT = 'sqlite';
  process.env.DATABASE_URL = '';
  process.env.TS_NODE_PROJECT = path.join(root, 'tsconfig.json');
  require('ts-node/register/transpile-only');
  process.chdir(temp);
  const database = require(path.join(root, 'src/database/database.ts'));
  const db = database.default;
  const run = (sql, args = []) => new Promise((resolve, reject) => db.run(sql, args, function (error) { error ? reject(error) : resolve(this.lastID); }));
  const all = (sql, args = []) => new Promise((resolve, reject) => db.all(sql, args, (error, rows) => error ? reject(error) : resolve(rows)));
  t.after(async () => {
    await new Promise(resolve => db.close(resolve));
    process.chdir(previous);
    assert.equal(path.dirname(path.resolve(temp)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(temp).startsWith('mercadinho-aggregates-'));
    fs.rmSync(temp, { recursive: true, force: true });
  });
  await database.bancoPronto;
  const cadastros = require(path.join(root, 'src/services/cadastros-lojas.service.ts'));
  const fornecedores = require(path.join(root, 'src/services/fornecedores.service.ts'));
  const { contextoLojas } = require(path.join(root, 'src/services/escopo-lojas.service.ts'));
  await cadastros.garantirVinculosCadastros();
  const store = await run("INSERT INTO lojas (empresa_id,nome,tipo) VALUES (1,'Bairro','FILIAL')");
  const supplier = await run("INSERT INTO fornecedores (empresa_id,razao_social,cpf_cnpj) VALUES (1,'Fornecedor compartilhado','00000000000100')");
  await run('INSERT INTO fornecedores_lojas (fornecedor_id,loja_id,ativo,dados_json) VALUES (?,1,1,?)', [supplier, JSON.stringify({ telefone: '1111111111' })]);
  await run('INSERT INTO fornecedores_lojas (fornecedor_id,loja_id,ativo,dados_json) VALUES (?,?,0,?)', [supplier, store, JSON.stringify({ telefone: '2222222222' })]);
  const product = await run("INSERT INTO produtos (ean,nome,preco_venda) VALUES ('7890000099999','Produto compartilhado',5)");
  await run('INSERT INTO fornecedor_produtos_lojas (fornecedor_id,produto_id,loja_id) VALUES (?,?,1)', [supplier, product]);
  await run('INSERT INTO fornecedor_produtos_lojas (fornecedor_id,produto_id,loja_id) VALUES (?,?,?)', [supplier, product, store]);
  await run('INSERT INTO fornecedor_precos_historico (fornecedor_id,produto_id,loja_id,custo_unitario) VALUES (?,?,1,2)', [supplier, product]);
  await run('INSERT INTO fornecedor_precos_historico (fornecedor_id,produto_id,loja_id,custo_unitario) VALUES (?,?,?,3)', [supplier, product, store]);

  const general = await fornecedores.listarFornecedores();
  assert.equal(general.length, 1, 'Diferentes dados locais não podem duplicar o fornecedor na visão permitida.');
  assert.equal(general[0].telefone, '1111111111');
  assert.equal(general[0].total_produtos, 2);
  assert.equal(general[0].total_compras_registradas, 2);
  const context = { id: 1, nome: 'Teste', email: 'teste@teste.local', perfil: 'ADMINISTRADOR', papelId: 1, papelNome: 'Administrador', permissoes: ['fornecedores'], lojaIds: [store], acessoTodasLojas: false, lojaAtivaId: store };
  const local = await contextoLojas.run(context, () => fornecedores.listarFornecedores());
  assert.equal(local.length, 1);
  assert.equal(local[0].telefone, '2222222222');
  assert.equal(local[0].ativo, 0);
  assert.equal(local[0].total_produtos, 1);
  assert.equal(local[0].total_compras_registradas, 1);
  assert.deepEqual(await contextoLojas.run(context, () => fornecedores.listarFornecedores('', true)), []);

  const operator = await run("INSERT INTO usuarios (nome,email,senha) VALUES ('Operadora de teste','operadora@teste.local','hash apenas para fixture')");
  const executor = await run("INSERT INTO executores (codigo,nome) VALUES ('AGREGADO','Executor de teste')");
  const sale = await run('INSERT INTO vendas (loja_id,local_id,usuario_id,executor_id,valor_total) VALUES (1,1,?,?,13)', [operator, executor]);
  await run("INSERT INTO venda_itens (venda_id,produto_id,descricao,quantidade,preco_unitario,subtotal) VALUES (?,?,'Item 1',1,3,3)", [sale, product]);
  await run("INSERT INTO venda_itens (venda_id,produto_id,descricao,quantidade,preco_unitario,subtotal) VALUES (?,?,'Item 2',2,5,10)", [sale, product]);
  await run("INSERT INTO venda_pagamentos (venda_id,forma_pagamento,valor) VALUES (?,'PIX',5)", [sale]);
  await run("INSERT INTO venda_pagamentos (venda_id,forma_pagamento,valor) VALUES (?,'DINHEIRO',8)", [sale]);
  // Exercise the actual listing statement, including both joins that multiply
  // item/payment rows. Its endpoint-specific filters are irrelevant here.
  const source = fs.readFileSync(path.join(root, 'src/routes/vendas-gestao.routes.ts'), 'utf8');
  const sql = source.match(/SELECT\s+v\.id,[\s\S]*?LIMIT 1000/)[0].replace("${where.join(' AND ')}", '1 = 1');
  const sales = await all(sql);
  assert.equal(sales.length, 1);
  assert.equal(sales[0].lojaNome, 'Matriz');
  assert.equal(sales[0].usuarioNome, 'Operadora de teste');
  assert.equal(sales[0].executorNome, 'Executor de teste');
  assert.equal(sales[0].quantidadeItens, 2);
  assert.equal(sales[0].valorTotal, 13);
  assert.deepEqual(new Set(sales[0].formasPagamento.split(',')), new Set(['PIX', 'DINHEIRO']));
});
