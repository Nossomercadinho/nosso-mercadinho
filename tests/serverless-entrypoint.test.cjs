const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { createHandler } = require('../backend/serverless/handler.cjs');

const filename = path.resolve(__dirname, '../backend/vercel.js');
const realRequire = createRequire(filename);
const configuration = {
  DB_CLIENT: 'postgres',
  DATABASE_URL: 'postgresql://test:fixture@localhost/test',
  JWT_SECRET: 'fixture-only-secret',
};

// Execute the real entrypoint with isolated application/configuration modules.
// No dotenv, SQLite file or operational database is read by these checks.
function loadEntrypoint({ env = configuration, application } = {}) {
  const module = { exports: {} };
  let loads = 0;
  const isolatedRequire = specifier => {
    if (specifier === 'node:module') {
      return { createRequire: source => {
        assert.equal(source, filename);
        return isolatedRequire;
      } };
    }
    if (specifier === './serverless/handler.cjs') {
      return { createHandler: options => createHandler({ ...options, env }) };
    }
    if (specifier === './dist/app.js') {
      loads++;
      return application;
    }
    return realRequire(specifier);
  };
  const evaluate = vm.runInThisContext(
    `(function(require, exports, module, __filename) {\n${fs.readFileSync(filename, 'utf8')}\n})`,
    { filename },
  );
  evaluate(isolatedRequire, module.exports, module, filename);
  return { app: module.exports, loads: () => loads };
}

async function serve(t, app) {
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => {
    server.close(resolve);
    server.closeAllConnections();
  }));
  return `http://127.0.0.1:${server.address().port}`;
}

test('entrypoint Express carrega o backend compilado sob demanda e preserva a rota pública', async t => {
  let initialized = 0;
  const entrypoint = loadEntrypoint({ application: {
    inicializarAplicacao: async () => { initialized++; },
    default: (req, res) => res.end(JSON.stringify({ method: req.method, url: req.url })),
  } });
  assert.equal(typeof entrypoint.app, 'function');
  assert.equal(typeof entrypoint.app.use, 'function');
  assert.equal(entrypoint.app.disabled('x-powered-by'), true);
  assert.equal(entrypoint.loads(), 0);
  assert.equal(initialized, 0);

  const base = await serve(t, entrypoint.app);
  const response = await fetch(base + '/api/auth/login?origem=pdv', { method: 'POST' });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-powered-by'), null);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(await response.json(), { method: 'POST', url: '/api/auth/login?origem=pdv' });
  assert.equal(entrypoint.loads(), 1);
  assert.equal(initialized, 1);

  const health = await fetch(base + '/api');
  assert.deepEqual(await health.json(), { method: 'GET', url: '/api' });
  assert.equal(entrypoint.loads(), 1);
  assert.equal(initialized, 1);
});

test('entrypoint sem configuração PostgreSQL devolve 503 antes de importar a aplicação', async t => {
  const entrypoint = loadEntrypoint({ env: {} });
  const base = await serve(t, entrypoint.app);
  const response = await fetch(base + '/api');
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(await response.json(), { sucesso: false, erro: 'API temporariamente indisponível.' });
  assert.equal(entrypoint.loads(), 0);
});
