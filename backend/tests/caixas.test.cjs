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

test('caixas, operadores e isolamento entre mercados', { timeout: 60000 }, async t => {
  const root = path.resolve(__dirname, '..');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mercadinho-caixas-test-'));
  fs.mkdirSync(path.join(temp, 'src', 'database'), { recursive: true });
  const port = await new Promise(resolve => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); });
  });
  let logs = '', db;
  const child = spawn(process.execPath, ['-r', require.resolve('ts-node/register/transpile-only'), path.join(root, 'src/app.ts')], {
    cwd: temp, windowsHide: true,
    env: { ...process.env, DB_CLIENT: "sqlite", DATABASE_URL: "", PORT: String(port), JWT_SECRET: randomBytes(32).toString('hex'), TS_NODE_PROJECT: path.join(root, 'tsconfig.json') },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', d => { logs += d; });
  child.stderr.on('data', d => { logs += d; });
  t.after(async () => {
    if (db) await new Promise(resolve => db.close(resolve));
    if (child.exitCode === null) { const exited = once(child, 'exit'); child.kill(); await exited; }
    assert.equal(path.dirname(path.resolve(temp)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(temp).startsWith('mercadinho-caixas-test-'));
    fs.rmSync(temp, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${port}`;
  // Wait for completed startup rather than continuing after a short polling
  // window while concurrent ts-node workers are still preparing their APIs.
  const startupDeadline = Date.now() + 30000;
  let ready = false;
  while (Date.now() < startupDeadline) {
    assert.equal(child.exitCode, null, logs);
    try {
      const response = await fetch(base + '/api', { signal: AbortSignal.timeout(1000) });
      await response.text();
      if (response.ok) { ready = true; break; }
    } catch {}
    await new Promise(r => setTimeout(r, 100));
  }
  assert.equal(ready, true, `A API não concluiu a inicialização em 30s.\n${logs}`);
  db = new sqlite3.Database(path.join(temp, 'src/database/nosso-mercadinho.db'));
  const run = (sql, args = []) => new Promise((resolve, reject) => db.run(sql, args, function (e) { e ? reject(e) : resolve(this.lastID); }));
  const get = (sql, args = []) => new Promise((resolve, reject) => db.get(sql, args, (e, row) => e ? reject(e) : resolve(row)));
  assert.ok(await get('SELECT id FROM locais_estoque WHERE id = 1'), 'A inicialização deve preparar o local de estoque da Matriz.');
  const request = async (route, token, method = 'GET', body, expected = 200) => {
    const response = await fetch(base + route, { method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const data = await response.json();
    assert.ok((Array.isArray(expected) ? expected : [expected]).includes(response.status), `${method} ${route} -> ${response.status}: ${JSON.stringify(data)}\n${logs}`);
    return data;
  };
  const password = randomBytes(16).toString('hex');
  const hash = await bcrypt.hash(password, 4);
  await run('INSERT INTO usuarios (nome,email,senha,perfil) VALUES (?,?,?,?)', ['Administradora', 'admin@caixas.test', hash, 'ADMINISTRADOR']);
  const admin = (await request('/api/auth/login', null, 'POST', { email: 'admin@caixas.test', senha: password })).token;
  const store2 = await run("INSERT INTO lojas (empresa_id,nome,codigo,tipo) VALUES (1,'Bairro','BAIRRO','FILIAL')");
  const local2 = await run("INSERT INTO locais_estoque (loja_id,nome,tipo,permite_venda) VALUES (?,'Balcão','VENDA',1)", [store2]);
  const role = await run('INSERT INTO papeis_acesso (nome,permissoes,sistema,acesso_todas_lojas) VALUES (?,?,0,0)', ['Atendimento', JSON.stringify(['pdv'])]);
  const roleManager = await run('INSERT INTO papeis_acesso (nome,permissoes,sistema,acesso_todas_lojas) VALUES (?,?,0,0)', ['Supervisão', JSON.stringify(['pdv','caixas','vendas'])]);
  const roleViewer = await run('INSERT INTO papeis_acesso (nome,permissoes,sistema,acesso_todas_lojas) VALUES (?,?,0,0)', ['Gestão de vendas', JSON.stringify(['vendas'])]);
  const makeUser = async (name, papelId, stores) => {
    const id = await run('INSERT INTO usuarios (nome,email,senha,perfil,papel_id) VALUES (?,?,?,?,?)', [name, `${name}@caixas.test`, hash, 'OPERADOR', papelId]);
    for (const store of stores) await run('INSERT INTO usuario_lojas (usuario_id,loja_id) VALUES (?,?)', [id, store]);
    const token = (await request('/api/auth/login', null, 'POST', { email: `${name}@caixas.test`, senha: password })).token;
    return { id, token };
  };
  const cashier = await makeUser('ana', role, [1]);
  const other = await makeUser('bruna', role, [store2]);
  const supervisor = await makeUser('carla', roleManager, [1, store2]);
  const salesManager = await makeUser('daniela', roleViewer, [1]);
  const product = await request('/api/produtos', admin, 'POST', { ean: '7890000000001', nome: 'Café para teste', precoVenda: 10, precoCusto: 5, estoqueInicial: 20, unidadeMedida: 'UN' }, 201);
  const productId = product.id;
  await run('INSERT INTO produtos_lojas (produto_id,loja_id,preco_venda) VALUES (?,?,15)', [productId, store2]);
  await run('INSERT INTO estoque_saldos (produto_id,loja_id,local_id,quantidade,custo_medio) VALUES (?,?,?,7,5)', [productId, store2, local2]);
  const exclusive = await run("INSERT INTO produtos (ean,nome,preco_venda) VALUES ('7890000000099','Exclusivo Bairro',7)");
  await run('INSERT INTO produtos_lojas (produto_id,loja_id,preco_venda) VALUES (?,?,7)', [exclusive, store2]);
  const sale = (quantidade, forma, price = 10) => ({ itens: [{ produtoId: productId, quantidade }], pagamentos: [{ forma, valor: quantidade * price }] });

  await t.test('exige abertura e valida mercado, local e saldo inicial', async () => {
    await request('/api/vendas', cashier.token, 'POST', sale(1, 'PIX'), 400);
    const ctx = await request('/api/caixas/contexto', cashier.token);
    assert.deepEqual(ctx.lojas.map(l => l.id), [1]); assert.equal(ctx.sessao, null);
    await request('/api/caixas/abrir', cashier.token, 'POST', { lojaId: store2, localId: local2, saldoInicial: 50 }, [400,403]);
    await request('/api/caixas/abrir', cashier.token, 'POST', { lojaId: 1, localId: local2, saldoInicial: 50 }, [400,403]);
    for (const value of [-1, '', 'Infinity', true]) await request('/api/caixas/abrir', cashier.token, 'POST', { lojaId: 1, localId: 1, saldoInicial: value }, 400);
  });
  let session, supervisorSession;
  await t.test('abertura identifica operador e impede duas sessões concorrentes', async () => {
    session = (await request('/api/caixas/abrir', cashier.token, 'POST', { lojaId: 1, localId: 1, saldoInicial: 100, observacao: 'Fundo inicial' }, 201)).sessao;
    assert.equal(session.usuarioId, cashier.id); assert.equal(session.usuarioNome, 'ana'); assert.equal(session.lojaNome, 'Matriz');
    const payload = { lojaId: store2, localId: local2, saldoInicial: 50 };
    const responses = await Promise.all([0,1].map(() => fetch(base + '/api/caixas/abrir', { method: 'POST', headers: { Authorization: `Bearer ${supervisor.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })));
    assert.deepEqual(responses.map(r => r.status).sort(), [201,400]);
    supervisorSession = (await request('/api/caixas/contexto', supervisor.token)).sessao;
    assert.equal(supervisorSession.lojaId, store2);
    await request('/api/caixas/abrir', cashier.token, 'POST', { lojaId: 1, localId: 1, saldoInicial: 1 }, 400);
  });
  await t.test('busca progressiva filtra catálogo, preço e saldo por mercado', async () => {
    const list = await request('/api/vendas/pdv/pesquisar?q=7890', cashier.token);
    assert.deepEqual(list.produtos.map(p => p.id), [productId]);
    assert.equal(list.produtos[0].precoVenda, 10); assert.equal(list.produtos[0].quantidadeDisponivel, 20);
    assert.equal((await request('/api/vendas/pdv/pesquisar?q=Caf', cashier.token)).produtos[0].id, productId);
    assert.equal((await request('/api/vendas/pdv/pesquisar?q=7890', supervisor.token)).produtos.length, 2);
    assert.equal((await request('/api/vendas/pdv/produto/7890000000001', supervisor.token)).produto.precoVenda, 15);
    await request('/api/vendas/pdv/produto/789000000000', cashier.token, 'GET', undefined, 400);
    await request(`/api/vendas/pdv/pesquisar?q=7890&lojaId=${store2}&localId=${local2}`, cashier.token, 'GET', undefined, [400,403]);
  });
  let cashSaleId;
  await t.test('venda usa sessão autenticada, permite preço específico e rejeita mercado forjado', async () => {
    await request('/api/vendas', cashier.token, 'POST', { ...sale(1, 'PIX'), lojaId: store2, localId: local2 }, [400,403]);
    await request('/api/vendas', cashier.token, 'POST', { ...sale(1, 'PIX'), itens: [{ produtoId: exclusive, quantidade: 1 }], pagamentos: [{ forma: 'PIX', valor: 7 }] }, 400);
    cashSaleId = (await request('/api/vendas', cashier.token, 'POST', { ...sale(2, 'DINHEIRO'), codigoExecutor: 'FORJADO' }, 201)).vendaId;
    await request('/api/vendas', cashier.token, 'POST', sale(1, 'PIX'), 201);
    await request('/api/vendas', supervisor.token, 'POST', sale(1, 'DINHEIRO', 15), 201);
    const persisted = await get('SELECT v.*,e.usuario_id AS executorUsuario FROM vendas v JOIN executores e ON e.id = v.executor_id WHERE v.id = ?', [cashSaleId]);
    assert.equal(persisted.caixa_sessao_id, session.id); assert.equal(persisted.usuario_id, cashier.id); assert.equal(persisted.executorUsuario, cashier.id);
    assert.equal((await get('SELECT quantidade FROM estoque_saldos WHERE produto_id = ? AND local_id = 1', [productId])).quantidade, 17);
    assert.equal((await get('SELECT quantidade FROM estoque_saldos WHERE produto_id = ? AND local_id = ?', [productId, local2])).quantidade, 6);
  });
  await t.test('cancelamento entra no resumo aberto e vendas antigas não contaminam o turno', async () => {
    const canceled = (await request('/api/vendas', supervisor.token, 'POST', sale(1, 'DINHEIRO', 15), 201)).vendaId;
    await request(`/api/vendas-gestao/${canceled}/cancelar`, supervisor.token, 'POST', { motivo: 'Cancelamento de teste' });
    const old = await run("INSERT INTO vendas (loja_id,local_id,status,valor_total) VALUES (1,1,'CONCLUIDA',999)");
    await run("INSERT INTO venda_pagamentos (venda_id,forma_pagamento,valor) VALUES (?,'DINHEIRO',999)", [old]);
    const resumo = (await request(`/api/caixas/${session.id}`, cashier.token)).resumo;
    assert.equal(resumo.quantidadeVendas, 2); assert.equal(resumo.totalVendas, 30); assert.equal(resumo.dinheiro, 20); assert.equal(resumo.valorEsperado, 120);
    assert.equal((await request(`/api/caixas/${supervisorSession.id}`, supervisor.token)).resumo.valorEsperado, 65);
  });
  await t.test('formas de cartão enviadas pelo PDV e pela correção são aceitas e normalizadas', async () => {
    const cardSaleId = (await request('/api/vendas', supervisor.token, 'POST', sale(1, 'CARTAO_DEBITO', 15), 201)).vendaId;
    assert.equal((await get('SELECT forma_pagamento FROM venda_pagamentos WHERE venda_id = ?', [cardSaleId])).forma_pagamento, 'DEBITO');
    const item = await get('SELECT id FROM venda_itens WHERE venda_id = ?', [cardSaleId]);
    await request(`/api/vendas-gestao/${cardSaleId}/corrigir`, supervisor.token, 'PUT', { motivo: 'Forma corrigida para crédito', formaPagamento: 'CARTAO_CREDITO', itens: [{ id: item.id, quantidade: 1 }] });
    assert.equal((await get('SELECT forma_pagamento FROM venda_pagamentos WHERE venda_id = ?', [cardSaleId])).forma_pagamento, 'CREDITO');
    const live = await request(`/api/caixas/${supervisorSession.id}`, supervisor.token);
    assert.equal(live.resumo.valorEsperado, 65);
    assert.ok(live.resumo.porForma.some(p => p.formaPagamento === 'CREDITO' && p.total === 15));
    await request(`/api/vendas-gestao/${cardSaleId}/cancelar`, supervisor.token, 'POST', { motivo: 'Cancelamento de venda em cartão' });
  });
  await t.test('histórico aplica mercados e distingue operador de supervisão', async () => {
    assert.deepEqual((await request('/api/caixas', cashier.token)).sessoes.map(s => s.id), [session.id]);
    assert.equal((await request('/api/caixas', supervisor.token)).sessoes.length, 2);
    await request(`/api/caixas/${session.id}`, other.token, 'GET', undefined, 404);
    await request(`/api/caixas?lojaId=${store2}`, cashier.token, 'GET', undefined, [400,403]);
    await request(`/api/caixas/${session.id}/fechar`, admin, 'POST', { valorContado: 120 }, 400);
    const store1Sales = await request('/api/vendas-gestao?lojaId=1', supervisor.token);
    assert.ok(store1Sales.vendas.every(v => v.lojaId === 1));
    await request(`/api/vendas/${cashSaleId}`, salesManager.token);
    await request('/api/vendas/pdv/pesquisar?q=7890', salesManager.token, 'GET', undefined, 403);
    await request('/api/vendas', salesManager.token, 'POST', sale(1, 'PIX'), 403);
  });
  await t.test('fechamento guarda contagem, diferença, pagamentos e identidade; bloqueia reuso', async () => {
    for (const valorContado of [-1, '', true]) await request(`/api/caixas/${session.id}/fechar`, cashier.token, 'POST', { valorContado }, 400);
    const closed = await request(`/api/caixas/${session.id}/fechar`, cashier.token, 'POST', { valorContado: 117, observacao: 'Conferência final' });
    assert.equal(closed.sessao.status, 'FECHADO'); assert.equal(closed.sessao.valorEsperado, 120); assert.equal(closed.sessao.diferenca, -3);
    assert.equal(closed.sessao.fechadoPorId, cashier.id); assert.ok(closed.sessao.fechadoEm);
    assert.deepEqual(closed.resumo.porForma, [{ formaPagamento: 'DINHEIRO', total: 20 }, { formaPagamento: 'PIX', total: 10 }]);
    await request(`/api/caixas/${session.id}/fechar`, cashier.token, 'POST', { valorContado: 120 }, 400);
    await request('/api/vendas', cashier.token, 'POST', sale(1, 'PIX'), 400);
    await request(`/api/vendas-gestao/${cashSaleId}/cancelar`, supervisor.token, 'POST', { motivo: 'Tentativa após fechamento' }, 400);
    assert.equal((await get('SELECT status FROM vendas WHERE id = ?', [cashSaleId])).status, 'CONCLUIDA');
    assert.equal((await request('/api/caixas/contexto', cashier.token)).sessao, null);
    await run("UPDATE usuarios SET nome = 'Nome atualizado' WHERE id = ?", [cashier.id]);
    const history = await request(`/api/caixas/${session.id}`, admin);
    assert.equal(history.sessao.usuarioNome, 'ana'); assert.equal(history.resumo.valorEsperado, 120);
    const snapshot = JSON.parse((await get('SELECT resumo_json FROM caixas_sessoes WHERE id = ?', [session.id])).resumo_json);
    assert.deepEqual(snapshot, history.resumo);
  });
  await t.test('venda e fechamento concorrentes não deixam venda registrada depois do saldo final', async () => {
    const [sold, closed] = await Promise.all([
      fetch(base + '/api/vendas', { method: 'POST', headers: { Authorization: `Bearer ${supervisor.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(sale(1, 'DINHEIRO', 15)) }),
      fetch(base + `/api/caixas/${supervisorSession.id}/fechar`, { method: 'POST', headers: { Authorization: `Bearer ${supervisor.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ valorContado: 65 }) }),
    ]);
    assert.ok([201,400].includes(sold.status)); assert.equal(closed.status, 200);
    const final = await request(`/api/caixas/${supervisorSession.id}`, admin);
    const cash = await get("SELECT COALESCE(SUM(vp.valor),0) AS total FROM venda_pagamentos vp JOIN vendas v ON v.id = vp.venda_id WHERE v.caixa_sessao_id = ? AND v.status = 'CONCLUIDA' AND vp.forma_pagamento = 'DINHEIRO'", [supervisorSession.id]);
    assert.equal(final.resumo.valorEsperado, 50 + cash.total);
  });
  await t.test('mercado desativado permite conferir e fechar o caixa e preserva histórico autorizado', async () => {
    const store = await run("INSERT INTO lojas (empresa_id,nome,tipo) VALUES (1,'Mercado histórico','FILIAL')");
    const local = await run("INSERT INTO locais_estoque (loja_id,nome,tipo,permite_venda) VALUES (?,'Área de Venda','VENDA',1)", [store]);
    const owner = await makeUser('eva', role, [store]);
    const opened = (await request('/api/caixas/abrir', owner.token, 'POST', { lojaId: store, localId: local, saldoInicial: 25 }, 201)).sessao;
    await request(`/api/lojas/${store}`, admin, 'DELETE');
    assert.equal((await request(`/api/caixas/${opened.id}`, owner.token)).resumo.valorEsperado, 25);
    await request('/api/vendas', owner.token, 'POST', sale(1, 'PIX'), 400);
    const closed = await request(`/api/caixas/${opened.id}/fechar`, owner.token, 'POST', { valorContado: 25 });
    assert.equal(closed.sessao.status, 'FECHADO');
    assert.equal((await request(`/api/caixas/${opened.id}`, admin)).sessao.lojaNome, 'Mercado histórico');
    assert.equal((await request(`/api/caixas?lojaId=${store}`, admin)).sessoes.length, 1);
    assert.deepEqual((await request(`/api/caixas?lojaId=${store}`, owner.token)).sessoes.map(s => s.id), [opened.id]);
    assert.equal((await request('/api/caixas/contexto', owner.token)).lojas.length, 0);
    await request('/api/caixas/abrir', owner.token, 'POST', { lojaId: store, localId: local, saldoInicial: 0 }, [400,403]);
    await run('DELETE FROM usuario_lojas WHERE usuario_id = ?', [owner.id]);
    assert.deepEqual((await request('/api/caixas', owner.token)).sessoes, []);
    await request(`/api/caixas/${opened.id}`, owner.token, 'GET', undefined, 404);
  });
});
