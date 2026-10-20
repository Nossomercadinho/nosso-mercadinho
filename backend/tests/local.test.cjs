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

// Runs against a disposable database and a separate API process.
// The application's local database and credentials are never used.
test('instalação nova e fluxos operacionais', { timeout: 60000 }, async t => {
  const root = path.resolve(__dirname, '..');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'nosso-mercadinho-test-'));
  fs.mkdirSync(path.join(temp, 'src', 'database'), { recursive: true });
  const port = await new Promise(resolve => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const value = server.address().port;
      server.close(() => resolve(value));
    });
  });
  let logs = '';
  let db;
  const child = spawn(process.execPath, ['-r', require.resolve('ts-node/register/transpile-only'), path.join(root, 'src/app.ts')], {
    cwd: temp,
    env: { ...process.env, DB_CLIENT: "sqlite", DATABASE_URL: "", PORT: String(port), JWT_SECRET: randomBytes(32).toString('hex'), TS_NODE_PROJECT: path.join(root, 'tsconfig.json') },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', data => { logs += data; });
  child.stderr.on('data', data => { logs += data; });
  t.after(async () => {
    if (db) await new Promise(resolve => db.close(resolve));
    if (child.exitCode === null) { const exit = once(child, 'exit'); child.kill(); await exit; }
    const resolved = path.resolve(temp);
    assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
    assert.ok(path.basename(resolved).startsWith('nosso-mercadinho-test-'));
    fs.rmSync(resolved, { recursive: true, force: true });
  });

  const base = `http://127.0.0.1:${port}`;
  // A loaded schema alone is insufficient: all startup services must finish
  // before the API can listen, especially with concurrent ts-node test workers.
  const startupDeadline = Date.now() + 30000;
  let ready = false;
  while (Date.now() < startupDeadline) {
    assert.equal(child.exitCode, null, logs);
    try {
      const response = await fetch(base + '/api', { signal: AbortSignal.timeout(1000) });
      await response.text();
      if (response.ok) { ready = true; break; }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(ready, true, `A API não concluiu a inicialização em 30s.\n${logs}`);
  db = new sqlite3.Database(path.join(temp, 'src/database/nosso-mercadinho.db'));
  const get = (sql, args = []) => new Promise((resolve, reject) => db.get(sql, args, (error, row) => error ? reject(error) : resolve(row)));
  const run = (sql, args = []) => new Promise((resolve, reject) => db.run(sql, args, function (error) { error ? reject(error) : resolve(this.lastID); }));
  assert.ok((await get('SELECT COUNT(*) AS total FROM locais_estoque')).total, 'A inicialização deve preparar os locais de estoque.');
  const password = randomBytes(16).toString('hex');
  const hash = await bcrypt.hash(password, 4);
  for (const role of ['ADMINISTRADOR', 'CAIXA', 'OPERADOR']) {
    await run('INSERT INTO usuarios (nome,email,senha,perfil) VALUES (?,?,?,?)', [role, `${role.toLowerCase()}@teste.local`, hash, role]);
  }
  await run('INSERT INTO executores (codigo,nome) VALUES (?,?)', ['TESTE', 'Executor de teste']);
  const request = async (route, token, method = 'GET', body, expected = 200) => {
    const response = await fetch(base + route, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await response.json();
    assert.equal(response.status, expected, `${method} ${route}: ${JSON.stringify(data)}\n${logs}`);
    return data;
  };
  const admin = (await request('/api/auth/login', null, 'POST', { email: 'administrador@teste.local', senha: password })).token;
  const cashier = (await request('/api/auth/login', null, 'POST', { email: 'caixa@teste.local', senha: password })).token;
  const operator = (await request('/api/auth/login', null, 'POST', { email: 'operador@teste.local', senha: password })).token;

  await t.test('cria Matriz e tabelas necessárias sem depender de banco antigo', async () => {
    assert.equal((await get('SELECT nome FROM lojas WHERE id = 1')).nome, 'Matriz');
    assert.equal((await get('SELECT permite_venda FROM locais_estoque WHERE id = 1')).permite_venda, 1);
    for (const table of ['executores', 'produtos_lojas', 'auditoria_operacoes']) {
      assert.equal((await get('SELECT COUNT(*) AS total FROM sqlite_master WHERE type = ? AND name = ?', ['table', table])).total, 1);
    }
  });

  await t.test('todos os módulos conseguem consultar uma instalação nova', async () => {
    for (const route of ['/api/produtos/matriz/catalogo', '/api/estoque', '/api/estoque/movimentacoes', '/api/fornecedores', '/api/financeiro', '/api/financeiro/resumo', '/api/financeiro/categorias', '/api/nfe', '/api/executores', '/api/vendas-gestao', '/api/clientes-prazo', '/api/vendas/pdv/locais', '/api/fechamento-diario', '/api/fechamento-diario/executores', '/api/caixas/contexto', '/api/caixas', '/api/usuarios']) {
      await request(route, admin);
    }
  });

  await t.test('login e permissões de Caixa e Operador', async () => {
    await request('/api/produtos', null, 'GET', null, 401);
    await request('/api/auth/login', null, 'POST', { email: 'caixa@teste.local', senha: 'errada' }, 401);
    await request('/api/financeiro/resumo', cashier, 'GET', null, 403);
    await request('/api/fechamento-diario', cashier);
    await request('/api/fechamento-diario', operator, 'GET', null, 403);
  });

  let productId;
  await t.test('cadastro de produto integra catálogo da Matriz e saldo inicial', async () => {
    const product = await request('/api/produtos', admin, 'POST', { ean: '7890000000001', nome: 'Produto de teste', precoVenda: 10, precoCusto: 5, estoqueInicial: 8, estoqueMinimo: 2, unidadeMedida: 'UN' }, 201);
    productId = product.id;
    const catalog = await request('/api/produtos/matriz/catalogo', admin);
    assert.equal(catalog.produtos[0].quantidade, 8);
    assert.equal(catalog.produtos[0].preco_venda, 10);
  });

  await t.test('venda no PDV reduz saldo e registra auditoria', async () => {
    const payload = { itens: [{ produtoId: productId, quantidade: 2 }], pagamentos: [{ forma: 'PIX', valor: 20 }] };
    await request('/api/vendas', cashier, 'POST', payload, 400);
    const opened = await request('/api/caixas/abrir', cashier, 'POST', { lojaId: 1, localId: 1, saldoInicial: 50 }, 201);
    assert.equal(opened.sessao.usuarioNome, 'CAIXA');
    const sale = await request('/api/vendas', cashier, 'POST', payload, 201);
    assert.ok(sale);
    assert.equal(sale.caixaSessaoId, opened.sessao.id);
    assert.equal(sale.executor.nome, 'CAIXA');
    assert.equal((await get('SELECT quantidade FROM estoque_saldos WHERE produto_id = ? AND local_id = 1', [productId])).quantidade, 6);
    const catalog = await request('/api/produtos', admin);
    assert.equal(catalog.produtos[0].estoque, 6, 'O catálogo deve refletir o saldo após a venda, não o estoque inicial.');
    assert.equal((await get('SELECT COUNT(*) AS total FROM auditoria_operacoes')).total, 1);
    const management = await request('/api/vendas-gestao', admin);
    assert.equal(management.resumo.total, 20);
    const closed = await request(`/api/caixas/${opened.sessao.id}/fechar`, cashier, 'POST', { valorContado: 50 });
    assert.equal(closed.resumo.totalVendas, 20);
    assert.equal(closed.sessao.diferenca, 0, 'Venda em PIX não aumenta o dinheiro esperado no caixa.');
  });

  await t.test('fechamento de Caixa salva e exige motivo para alteração', async () => {
    const closing = { dataReferencia: '2026-10-14', dinheiro: 10, pix: 20, executorId: 1 };
    await request('/api/fechamento-diario', cashier, 'PUT', closing);
    const read = await request('/api/fechamento-diario?data=2026-10-14', cashier);
    assert.equal(read.fechamento.totalInformado, 30);
    await request('/api/fechamento-diario', cashier, 'PUT', { ...closing, dinheiro: 15 }, 400);
    assert.equal((await request('/api/fechamento-diario?data=2026-10-14', cashier)).fechamento.totalInformado, 30);
    await request('/api/fechamento-diario', cashier, 'PUT', { ...closing, dinheiro: 15, motivoAlteracao: 'Conferência corrigida' });
    assert.equal((await request('/api/fechamento-diario?data=2026-10-14', cashier)).fechamento.totalInformado, 35);
    assert.equal((await get('SELECT COUNT(*) AS total FROM fechamentos_diarios_historico')).total, 2);
  });
});
