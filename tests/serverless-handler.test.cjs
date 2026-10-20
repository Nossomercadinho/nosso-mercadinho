const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createHandler } = require('../backend/serverless/handler.cjs');

const configuration = { DB_CLIENT: 'postgres', DATABASE_URL: 'postgresql://test:fixture@localhost/test', JWT_SECRET: 'fixture-only-secret' };
async function serve(t, options) {
  const handler = createHandler({ env: configuration, ...options });
  const server = http.createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

test('gateway espera inicialização, preserva URL e reutiliza a aplicação', async t => {
  let ready;
  const gate = new Promise(resolve => { ready = resolve; });
  let loaded = 0, initialized = 0, handled = 0;
  const base = await serve(t, { loadApplication: () => {
    loaded++;
    return {
      inicializarAplicacao: async () => { initialized++; await gate; },
      default: (req, res) => { handled++; res.end(req.url); },
    };
  } });
  const first = fetch(base + '/api/produtos?busca=arroz');
  while (!initialized) await new Promise(resolve => setImmediate(resolve));
  assert.equal(handled, 0);
  ready();
  const response = await first;
  assert.equal(await response.text(), '/api/produtos?busca=arroz');
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  await (await fetch(base + '/api')).text();
  assert.equal(loaded, 1); assert.equal(initialized, 1); assert.equal(handled, 2);
});

test('gateway não intercala requisições durante respostas assíncronas', async t => {
  let active = 0, maximum = 0;
  const base = await serve(t, { loadApplication: () => ({
    inicializarAplicacao: async () => {},
    default: (_req, res) => {
      active++; maximum = Math.max(maximum, active);
      setTimeout(() => { active--; res.end('ok'); }, 15);
    },
  }) });
  const responses = await Promise.all(Array.from({ length: 4 }, () => fetch(base + '/api').then(r => r.text())));
  assert.deepEqual(responses, ['ok', 'ok', 'ok', 'ok']);
  assert.equal(maximum, 1);
});

test('configuração ausente recusa antes de carregar SQLite ou qualquer aplicação', async t => {
  let loads = 0;
  const base = await serve(t, { env: {}, loadApplication: () => { loads++; throw new Error('não carregar'); } });
  const response = await fetch(base + '/api');
  assert.equal(response.status, 503);
  assert.equal(loads, 0);
});

test('falhas de inicialização não expõem conexão e não repetem bootstrap', async t => {
  let calls = 0;
  const privateDetail = 'postgresql://private:do-not-return@database/internal';
  const base = await serve(t, { loadApplication: () => ({
    inicializarAplicacao: async () => { calls++; throw new Error(privateDetail); },
    default: () => assert.fail('não pode atender antes da inicialização'),
  }) });
  for (let i = 0; i < 2; i++) {
    const response = await fetch(base + '/api');
    assert.equal(response.status, 503);
    assert.ok(!(await response.text()).includes(privateDetail));
  }
  assert.equal(calls, 1);
});

test('resposta interrompida impede reutilização de contexto transacional pendente', async t => {
  let handled = 0;
  const base = await serve(t, { loadApplication: () => ({
    inicializarAplicacao: async () => {},
    default: (_req, res) => { handled++; res.destroy(); },
  }) });
  await fetch(base + '/api').then(r => r.text()).catch(() => {});
  const next = await fetch(base + '/api');
  assert.equal(next.status, 503);
  assert.equal(handled, 1);
});

test('erro síncrono do adaptador responde genericamente e libera a fila', async t => {
  const base = await serve(t, { loadApplication: () => ({
    inicializarAplicacao: async () => {},
    default: () => { throw new Error('internal database detail'); },
  }) });
  const response = await fetch(base + '/api');
  assert.equal(response.status, 503);
  assert.ok(!(await response.text()).includes('internal database detail'));
  assert.equal((await fetch(base + '/api')).status, 503);
});
