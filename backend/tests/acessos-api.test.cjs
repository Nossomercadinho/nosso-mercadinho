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

test('API aplica papéis e isolamento de mercados durante sessões já autenticadas', { timeout: 45000 }, async t => {
  const root = path.resolve(__dirname, '..');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'nosso-acessos-api-'));
  fs.mkdirSync(path.join(temp, 'src/database'), { recursive: true });
  const port = await new Promise(resolve => {
    const server = net.createServer(); server.listen(0, '127.0.0.1', () => { const n = server.address().port; server.close(() => resolve(n)); });
  });
  let logs = '';
  let db;
  const child = spawn(process.execPath, ['-r', require.resolve('ts-node/register/transpile-only'), path.join(root, 'src/app.ts')], {
    cwd: temp, env: { ...process.env, DB_CLIENT: 'sqlite', DATABASE_URL: '', PORT: String(port), JWT_SECRET: randomBytes(32).toString('hex'), TS_NODE_PROJECT: path.join(root, 'tsconfig.json') },
    windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', data => { logs += data; }); child.stderr.on('data', data => { logs += data; });
  t.after(async () => {
    if (db) await new Promise(resolve => db.close(resolve));
    if (child.exitCode === null) { const exit = once(child, 'exit'); child.kill(); await exit; }
    const resolved = path.resolve(temp);
    assert.equal(path.dirname(resolved), path.resolve(os.tmpdir())); assert.ok(path.basename(resolved).startsWith('nosso-acessos-api-'));
    fs.rmSync(resolved, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${port}/api`;
  let ready = false;
  for (let i = 0; i < 150; i++) {
    try { if ((await fetch(base)).ok) { ready = true; break; } } catch {}
    assert.equal(child.exitCode, null, logs); await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(ready, true, `A API não ficou pronta dentro do tempo de inicialização.\n${logs}`);
  db = new sqlite3.Database(path.join(temp, 'src/database/nosso-mercadinho.db'));
  const run = (sql, args = []) => new Promise((resolve, reject) => db.run(sql, args, function (error) { error ? reject(error) : resolve(this.lastID); }));
  const get = (sql, args = []) => new Promise((resolve, reject) => db.get(sql, args, (error, row) => error ? reject(error) : resolve(row)));
  for (let i = 0; i < 50 && !await get('SELECT id FROM lojas WHERE id = 1'); i++) await new Promise(resolve => setTimeout(resolve, 20));
  const password = randomBytes(16).toString('hex');
  const adminId = await run('INSERT INTO usuarios (nome,email,senha,perfil) VALUES (?,?,?,?)', ['Administrador', 'admin@teste.local', await bcrypt.hash(password, 4), 'ADMINISTRADOR']);
  const request = async (route, token, method = 'GET', body, expected = 200, lojaAtiva) => {
    const r = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(lojaAtiva !== undefined ? { 'X-Loja-Id': String(lojaAtiva) } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = await r.json(); assert.equal(r.status, expected, `${method} ${route}: ${JSON.stringify(data)}\n${logs}`); return data;
  };
  const admin = (await request('/auth/login', null, 'POST', { email: 'admin@teste.local', senha: password })).token;
  const loja2 = await run('INSERT INTO lojas (empresa_id,nome,tipo) VALUES (1,?,?)', ['Bairro', 'FILIAL']);
  const local2 = await run('INSERT INTO locais_estoque (loja_id,nome,tipo,permite_venda) VALUES (?,?,?,1)', [loja2, 'Área de Venda', 'VENDA']);
  const papel = (await request('/usuarios/papeis', admin, 'POST', { nome: 'Gestão Bairro', permissoes: ['estoque', 'produtos', 'financeiro', 'compras', 'clientes', 'fechamento', 'pdv'] }, 201)).papel;
  const usuario = (await request('/usuarios', admin, 'POST', { nome: 'Gestora Bairro', email: 'bairro@teste.local', senha: password, papelId: papel.id, lojaIds: [loja2] }, 201)).usuario;
  const login = await request('/auth/login', null, 'POST', { email: usuario.email, senha: password });
  const token = login.token;
  assert.deepEqual(login.usuario.lojaIds, [loja2]);
  await request('/usuarios', token, 'GET', null, 403);
  assert.deepEqual((await request('/lojas', token)).lojas.map(l => l.id), [loja2]);
  await request('/lojas/1/locais', token, 'GET', null, 403);
  await request('/estoque?lojaId=1', token, 'GET', null, 403);
  await request('/estoque/entrada', token, 'POST', { lojaId: loja2, localId: 1 }, 403);

  const produto = await run('INSERT INTO produtos (ean,nome,preco_custo,preco_venda,estoque) VALUES (?,?,2,5,999)', ['7890000000099', 'Produto compartilhado']);
  await run('INSERT INTO estoque_saldos (produto_id,loja_id,local_id,quantidade,custo_medio) VALUES (?,1,1,100,2)', [produto]);
  await run('INSERT INTO estoque_saldos (produto_id,loja_id,local_id,quantidade,custo_medio) VALUES (?,?,?,?,2)', [produto, loja2, local2, 7]);
  assert.equal((await request('/produtos', token)).produtos[0].estoque, 7);
  assert.equal((await request('/produtos/salvo/ean/7890000000099', token)).produto.estoque, 7);
  assert.deepEqual((await request('/estoque', token)).estoque.map(e => e.loja_id), [loja2]);
  assert.deepEqual((await request(`/estoque/produto/${produto}`, token)).saldos.map(e => e.loja_id), [loja2]);

  const financeiro1 = await run("INSERT INTO financeiro_lancamentos (empresa_id,tipo,loja_id,descricao,valor_original,data_vencimento) VALUES (1,'SAIDA',1,'Conta Matriz',100,'2026-10-15')");
  const financeiro2 = await run("INSERT INTO financeiro_lancamentos (empresa_id,tipo,loja_id,descricao,valor_original,data_vencimento) VALUES (1,'SAIDA',?,'Conta Bairro',20,'2026-10-15')", [loja2]);
  await run("INSERT INTO financeiro_lancamentos (empresa_id,tipo,descricao,valor_original,data_vencimento) VALUES (1,'SAIDA','Conta global',1000,'2026-10-15')");
  assert.deepEqual((await request('/financeiro', token)).lancamentos.map(l => l.id), [financeiro2]);
  assert.equal((await request('/financeiro/resumo', token)).resumo.aPagar, 20);
  await request(`/financeiro/${financeiro1}`, token, 'GET', null, 403);
  await request(`/financeiro/${financeiro1}`, token, 'PATCH', { descricao: 'Tentativa' }, 403);
  await request(`/financeiro/${financeiro2}`, token, 'PATCH', { descricao: 'Conta editada', lojaId: 1 }, 403);
  const criado = await request('/financeiro', token, 'POST', { tipo: 'SAIDA', descricao: 'Conta do bairro', valorOriginal: 8, dataVencimento: '2026-10-16', usuarioId: adminId }, 201);
  assert.equal((await get("SELECT loja_id,usuario_criacao_id FROM financeiro_lancamentos WHERE descricao = 'Conta do bairro'")).loja_id, loja2);
  assert.equal((await get("SELECT usuario_criacao_id FROM financeiro_lancamentos WHERE descricao = 'Conta do bairro'")).usuario_criacao_id, usuario.id);
  assert.ok(criado.sucesso);

  const fornecedor = await run('INSERT INTO fornecedores (razao_social,cpf_cnpj) VALUES (?,?)', ['Fornecedor', '00000000000100']);
  const nota1 = await run('INSERT INTO notas_entrada (empresa_id,fornecedor_id,loja_id,local_estoque_id,chave_nfe) VALUES (1,?,1,1,?)', [fornecedor, '1'.repeat(44)]);
  const nota2 = await run('INSERT INTO notas_entrada (empresa_id,fornecedor_id,loja_id,local_estoque_id,chave_nfe) VALUES (1,?,?,?,?)', [fornecedor, loja2, local2, '2'.repeat(44)]);
  assert.deepEqual((await request('/nfe', token)).notas.map(n => n.id), [nota2]);
  await request(`/nfe/${nota1}`, token, 'GET', null, 403);
  await request(`/nfe/${nota1}/efetivar`, token, 'PATCH', {}, 403);
  const itemNota1 = await run('INSERT INTO notas_entrada_itens (nota_entrada_id,descricao) VALUES (?,?)', [nota1, 'Item Matriz']);
  await request(`/nfe/itens/${itemNota1}/vincular`, token, 'PATCH', { produtoId: produto }, 403);
  await request('/fechamento-diario', token, 'PUT', { dataReferencia: '2026-10-15', dinheiro: 5 });
  assert.equal((await get('SELECT loja_id FROM fechamentos_diarios')).loja_id, loja2);

  await request('/clientes-prazo', token);
  const cliente = await run('INSERT INTO clientes (nome,cpf,telefone,limite_credito) VALUES (?,?,?,500)', ['Cliente', '00000000000', '11999999999']);
  await run('INSERT INTO clientes_lojas (cliente_id,loja_id) VALUES (?,?)', [cliente,loja2]);
  const venda1 = await run('INSERT INTO vendas (loja_id,local_id,valor_total) VALUES (1,1,100)');
  const venda2 = await run('INSERT INTO vendas (loja_id,local_id,valor_total) VALUES (?,?,25)', [loja2, local2]);
  const conta1 = await run("INSERT INTO contas_receber (venda_id,cliente_id,valor_original,saldo) VALUES (?,?,100,100)", [venda1, cliente]);
  await run('INSERT INTO contas_receber (venda_id,cliente_id,valor_original,saldo) VALUES (?,?,25,25)', [venda2, cliente]);
  assert.equal((await request('/clientes-prazo', token)).clientes[0].saldoDevedor, 25);
  const detalhes = await request('/clientes-prazo/' + cliente, token);
  assert.equal(detalhes.cliente.saldoDevedor, 25);
  assert.equal(detalhes.cliente.limiteDisponivel, 375, 'Disponibilidade de crédito considera o limite global sem revelar contas de outras lojas.');
  assert.deepEqual(detalhes.contas.map(c => c.lojaId), [loja2]);
  await request(`/clientes-prazo/contas/${conta1}/recebimentos`, token, 'POST', { valor: 10, formaPagamento: 'PIX' }, 403);

  // Selected-store context narrows administrators too, while the selector can
  // still discover every allowed active market and POS keeps its own session.
  assert.deepEqual((await request('/auth/lojas', admin, 'GET', null, 200, loja2)).lojas.map(l => l.id), [1, loja2]);
  await request('/produtos', admin, 'GET', null, 400, 'abc');
  await request('/produtos', admin, 'GET', null, 403, 999999);
  await request('/produtos', token, 'GET', null, 403, 1);
  assert.equal((await request('/produtos', admin, 'GET', null, 200, loja2)).produtos[0].estoque, 7);
  assert.deepEqual((await request('/lojas', admin, 'GET', null, 200, loja2)).lojas.map(l => l.id), [1, loja2]);
  await request(`/financeiro/${financeiro1}`, admin, 'GET', null, 403, loja2);
  await request('/financeiro', admin, 'POST', { tipo: 'SAIDA', descricao: 'Loja divergente', valorOriginal: 9, dataVencimento: '2026-10-18', lojaId: 1 }, 403, loja2);
  assert.ok((await request('/financeiro', admin, 'GET', null, 200, loja2)).lancamentos.every(l => l.loja_id === loja2));

  const novo = await request('/produtos', token, 'POST', { ean: '7890000000088', nome: 'Produto só no bairro', precoVenda: 12, precoCusto: 6, estoqueInicial: 4 }, 201, loja2);
  assert.equal((await get('SELECT COUNT(*) AS total FROM produtos_lojas WHERE produto_id=?', [novo.id])).total, 1);
  assert.equal((await get('SELECT loja_id FROM produtos_lojas WHERE produto_id=?', [novo.id])).loja_id, loja2);
  assert.deepEqual(await get('SELECT loja_id,local_id,quantidade,custo_medio FROM estoque_saldos WHERE produto_id=?', [novo.id]), { loja_id: loja2, local_id: local2, quantidade: 4, custo_medio: 6 });
  assert.ok((await request('/produtos/loja/catalogo', token, 'GET', null, 200, loja2)).produtos.some(p => p.id === novo.id));
  assert.ok(!(await request('/produtos/loja/catalogo', admin, 'GET', null, 200, 1)).produtos.some(p => p.id === novo.id));
  await run('INSERT INTO produtos_lojas (produto_id,loja_id,preco_venda,estoque_minimo) VALUES (?,1,0,0)', [produto]);
  await run('UPDATE estoque_saldos SET custo_medio=0 WHERE produto_id=? AND loja_id=1', [produto]);
  const legado = (await request('/produtos/loja/catalogo', admin, 'GET', null, 200, 1)).produtos.find(p => p.id === produto);
  assert.equal(legado.preco_venda, 5, 'Preço legado local0 não configurado preserva preço global.');
  assert.equal(legado.preco_custo, 2, 'Custo legado0 não configurado preserva custo global.');
  await request(`/produtos/loja/integrar/${produto}`, admin, 'POST', { precoVenda: 5 }, 200, 1);
  await request(`/produtos/loja/integrar/${produto}`, token, 'POST', { precoVenda: 9 }, 200, loja2);
  await request(`/produtos/loja/${produto}`, token, 'PATCH', { precoVenda: 0, precoCusto: 0 }, 200, loja2);
  const zeros = (await request('/produtos/loja/catalogo', token, 'GET', null, 200, loja2)).produtos.find(p => p.id === produto);
  assert.equal(zeros.preco_venda, 0, 'Preço zero explicitamente configurado não recebe fallback.');
  assert.equal(zeros.preco_custo, 0, 'Custo zero explicitamente configurado não recebe fallback.');
  await request(`/produtos/loja/${produto}`, token, 'PATCH', { precoVenda: 11, precoCusto: 2, estoqueMinimo: 3, estoqueInicial: 999 }, 200, loja2);
  assert.equal((await get('SELECT preco_venda FROM produtos_lojas WHERE produto_id=? AND loja_id=1', [produto])).preco_venda, 5);
  assert.equal((await get('SELECT preco_venda FROM produtos_lojas WHERE produto_id=? AND loja_id=?', [produto,loja2])).preco_venda, 11);
  assert.equal((await get('SELECT quantidade FROM estoque_saldos WHERE produto_id=? AND loja_id=?', [produto,loja2])).quantidade, 7);

  const globalEstoque = await run('INSERT INTO produtos (ean,nome,preco_custo,preco_venda) VALUES (?,?,2,9)', ['7890000000077', 'Produto recebido pelo estoque']);
  await run('INSERT INTO executores (codigo,nome,ativo) VALUES (?,?,1)', ['TESTE_ESTOQUE','Executor de estoque']);
  await request('/estoque/entrada', token, 'POST', { produtoId: globalEstoque, localId: local2, quantidade: 6, custoUnitario: 3, codigoExecutor: 'TESTE_ESTOQUE' }, 201, loja2);
  assert.equal((await get('SELECT COUNT(*) AS total FROM produtos_lojas WHERE produto_id=?', [globalEstoque])).total, 1);
  assert.ok((await request('/produtos/loja/catalogo', token, 'GET', null, 200, loja2)).produtos.some(p => p.id === globalEstoque));
  await request(`/produtos/loja/${globalEstoque}`, token, 'PATCH', { precoVenda: 17 }, 200, loja2);
  await request('/estoque/transferir', admin, 'POST', { produtoId: globalEstoque, lojaOrigemId: loja2, localOrigemId: local2, lojaDestinoId: 1, localDestinoId: 1, quantidade: 2, codigoExecutor: 'TESTE_ESTOQUE' }, 200, loja2);
  assert.equal((await get('SELECT preco_venda FROM produtos_lojas WHERE produto_id=? AND loja_id=?', [globalEstoque,loja2])).preco_venda, 17);
  assert.equal((await get('SELECT ativo FROM produtos_lojas WHERE produto_id=? AND loja_id=1', [globalEstoque])).ativo, 1);
  assert.equal((await get('SELECT quantidade FROM estoque_saldos WHERE produto_id=? AND loja_id=1', [globalEstoque])).quantidade, 2);
  assert.ok((await request('/produtos/loja/catalogo', admin, 'GET', null, 200, 1)).produtos.some(p => p.id === globalEstoque));
  assert.ok((await request(`/estoque/movimentacoes?produtoId=${globalEstoque}`, admin, 'GET', null, 200, loja2)).movimentacoes.some(m => m.tipo === 'TRANSFERENCIA'));
  const caixaEstoque = (await request('/caixas/abrir', token, 'POST', { lojaId: loja2, localId: local2, saldoInicial: 0 }, 201)).sessao;
  assert.ok((await request('/vendas/pdv/pesquisar?q=7890000000077', token)).produtos.some(p => p.id === globalEstoque));
  await request(`/caixas/${caixaEstoque.id}/fechar`, token, 'POST', { valorContado: 0 });
  await request(`/produtos/loja/${produto}`, token, 'DELETE', null, 200, loja2);
  assert.equal((await get('SELECT ativo FROM produtos_lojas WHERE produto_id=? AND loja_id=1', [produto])).ativo, 1);
  assert.equal((await get('SELECT ativo FROM produtos WHERE id=?', [produto])).ativo, 1);
  assert.equal((await get('SELECT quantidade FROM estoque_saldos WHERE produto_id=? AND loja_id=?', [produto,loja2])).quantidade, 7);

  await request('/usuarios/papeis/' + papel.id, admin, 'PUT', { nome: papel.nome, permissoes: ['pdv'] });
  await request('/financeiro', token, 'GET', null, 403);
  await request('/clientes-prazo', token);
  await request('/clientes-prazo/1/limite', token, 'PATCH', { limiteCredito: 10 }, 403);
  await request('/usuarios/' + usuario.id, admin, 'PUT', { ativo: false });
  await request('/auth/me', token, 'GET', null, 401);
  await request('/usuarios/' + adminId, admin, 'PUT', { ativo: false }, 409);
});
