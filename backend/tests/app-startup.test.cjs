const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const typescript = require('typescript');
const express = require('express');

// Evaluate the real app with isolated database/service dependencies. Neither
// dotenv, the operational database nor any remote connection is loaded.
const filename = path.resolve(__dirname, '../src/app.ts');
const realRequire = createRequire(filename);
const compiled = typescript.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { target: typescript.ScriptTarget.ES2022, module: typescript.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText;
const serviceNames = ['inicializarAcessos', 'garantirEstruturaCaixas', 'garantirVinculosCadastros', 'garantirPrecosCatalogoLoja'];

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function loadApp({ ready = Promise.resolve(), gates = {}, failAt, direct = false, devWrapper = false, nodeEnv = 'test', routeError, routeResponse } = {}) {
  const events = [], listens = [], routes = [], errors = [];
  const module = { exports: {} };
  const fakeProcess = {
    env: { PORT: '3017', NODE_ENV: nodeEnv, ...(devWrapper ? { TS_NODE_DEV: 'true' } : {}) },
    argv: ['node', devWrapper ? filename : path.join(__dirname, 'app-startup.test.cjs')],
    exitCode: undefined,
  };
  const bancoPronto = ready.then(() => { events.push('bancoPronto'); });
  const services = Object.fromEntries(serviceNames.map(name => [name, async () => {
    events.push(name);
    if (name === failAt) throw new Error('private startup details');
    if (gates[name]) await gates[name].promise;
  }]));
  const fakeExpress = Object.assign(() => {
    const app = express();
    app.listen = (port, callback) => { listens.push(port); callback?.(); };
    return app;
  }, express);
  const isolatedRequire = specifier => {
    if (specifier === 'express') return fakeExpress;
    if (specifier === 'dotenv') return { config() {} };
    if (specifier === './database/database') return { __esModule: true, default: { ping: async () => { events.push('ping'); } }, bancoPronto };
    if (specifier.startsWith('./services/')) return services;
    if (specifier === './middleware/auth.middleware') return Object.fromEntries(['autenticarToken', 'autorizarModuloRota', 'autorizarEscopoLoja'].map(name => [name, (_req, _res, next) => next()]));
    if (specifier.startsWith('./routes/')) {
      const router = express.Router();
      router.use((_req, res, next) => {
        if (routeError) return next(routeError);
        if (routeResponse) return res.status(routeResponse.status).json(routeResponse.body);
        routes.push(specifier);
        res.json({ route: specifier });
      });
      return router;
    }
    return realRequire(specifier);
  };
  isolatedRequire.main = direct ? module : {};
  const evaluate = vm.runInThisContext(`(function(require, exports, module, __filename, __dirname, process, console) {\n${compiled}\n})`, { filename });
  evaluate(isolatedRequire, module.exports, module, filename, path.dirname(filename), fakeProcess,
    { log() {}, error(...args) { errors.push(args); } });
  return { ...module.exports, events, listens, routes, errors, process: fakeProcess };
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

async function until(predicate) {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.fail('A inicialização não atingiu a etapa esperada.');
}

test('importar Express não abre porta nem inicia os serviços', async () => {
  const app = loadApp();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(typeof app.default, 'function');
  assert.equal(typeof app.inicializarAplicacao, 'function');
  assert.deepEqual(app.listens, []);
  assert.deepEqual(app.events, ['bancoPronto']);
});

test('requisições e chamadas concorrentes aguardam toda a inicialização uma única vez', async t => {
  const ready = deferred();
  const gates = Object.fromEntries(serviceNames.map(name => [name, deferred()]));
  const app = loadApp({ ready: ready.promise, gates });
  const first = app.inicializarAplicacao();
  assert.equal(app.inicializarAplicacao(), first);
  assert.deepEqual(app.events, []);
  const base = await serve(t, app.default);
  let completed = 0;
  const requests = ['/api', '/api/auth/login', '/api/produtos'].map(route =>
    fetch(base + route).then(async response => { completed++; return { status: response.status, body: await response.json() }; }));
  ready.resolve();
  for (const [index, name] of serviceNames.entries()) {
    await until(() => app.events.includes(name));
    assert.deepEqual(app.events, ['bancoPronto', ...serviceNames.slice(0, index + 1)]);
    assert.equal(completed, 0, 'Nenhuma resposta pode ser enviada antes da última etapa.');
    assert.deepEqual(app.routes, []);
    gates[name].resolve();
  }
  await first;
  const responses = await Promise.all(requests);
  assert.deepEqual(responses.map(response => response.status), [200, 200, 200]);
  assert.equal(responses[0].body.sucesso, true);
  assert.deepEqual(app.events, ['bancoPronto', ...serviceNames, 'ping']);
  assert.equal(app.routes.length, 2);
  assert.equal(app.inicializarAplicacao(), first, 'O runtime quente reutiliza a mesma inicialização.');
  assert.deepEqual(app.listens, []);
});

test('falhas em qualquer etapa retornam 503 sem executar rotas ou expor o erro', async t => {
  for (const failAt of ['bancoPronto', ...serviceNames]) {
    await t.test(failAt, async t => {
      const app = loadApp({
        ready: failAt === 'bancoPronto' ? Promise.reject(new Error('private startup details')) : Promise.resolve(),
        failAt,
      });
      // A failed connection imported before the first request is also handled.
      await new Promise(resolve => setImmediate(resolve));
      const first = app.inicializarAplicacao();
      const rejection = assert.rejects(first, /private startup details/);
      assert.equal(app.inicializarAplicacao(), first);
      const base = await serve(t, app.default);
      for (const route of ['/', '/api', '/api/auth/login', '/api/produtos']) {
        const response = await fetch(base + route);
        assert.equal(response.status, 503);
        const body = await response.json();
        assert.equal(body.sucesso, false);
        assert.doesNotMatch(JSON.stringify(body), /private startup details/);
      }
      await rejection;
      assert.deepEqual(app.routes, []);
      assert.deepEqual(app.listens, []);
      const failedIndex = serviceNames.indexOf(failAt);
      assert.deepEqual(app.events, failedIndex < 0 ? [] : ['bancoPronto', ...serviceNames.slice(0, failedIndex + 1)]);
    });
  }
});

test('execução direta e wrapper do ts-node-dev abrem a porta só após preparar os serviços', async t => {
  for (const mode of ['node', 'ts-node-dev']) {
    await t.test(mode, async () => {
      const final = deferred();
      const app = loadApp({ direct: mode === 'node', devWrapper: mode === 'ts-node-dev', gates: { garantirPrecosCatalogoLoja: final } });
      await until(() => app.events.includes('garantirPrecosCatalogoLoja'));
      assert.deepEqual(app.listens, []);
      final.resolve();
      await until(() => app.listens.length === 1);
      assert.deepEqual(app.events, ['bancoPronto', ...serviceNames]);
      assert.deepEqual(app.listens, [3017]);
      assert.equal(app.process.exitCode, undefined);
    });
  }
});

test('execução direta falha sem abrir porta quando o preparo não conclui', async () => {
  const app = loadApp({ direct: true, failAt: 'garantirEstruturaCaixas' });
  await until(() => app.process.exitCode === 1);
  assert.deepEqual(app.listens, []);
  assert.equal(app.errors.length, 1);
});

test('produção usa API da mesma origem e devolve erro inesperado sem detalhes internos', async t => {
  const app = loadApp({ nodeEnv: 'production', routeError: new Error('private database connection details') });
  const base = await serve(t, app.default);
  const response = await fetch(base + '/api/produtos', { headers: { Origin: 'https://another-origin.example' } });
  assert.equal(response.status, 500);
  assert.equal(response.headers.get('access-control-allow-origin'), null);
  assert.equal(response.headers.get('x-powered-by'), null);
  assert.deepEqual(await response.json(), { sucesso: false, erro: 'Erro interno do servidor.' });
  assert.equal(app.errors.length, 1);
  assert.deepEqual(app.events, ['bancoPronto', ...serviceNames]);
});

test('produção normaliza JSON 5xx de rotas que capturam erros e mantém mensagens comerciais 4xx', async t => {
  for (const status of [500, 503]) {
    await t.test(`resposta explícita ${status}`, async t => {
      const app = loadApp({ nodeEnv: 'production', routeResponse: {
        status, body: { sucesso: false, erro: 'private connection details', detalhes: { secret: 'private credentials' } },
      } });
      const base = await serve(t, app.default);
      const response = await fetch(base + '/api/produtos');
      assert.equal(response.status, status);
      assert.deepEqual(await response.json(), {
        sucesso: false,
        erro: status === 503 ? 'Serviço temporariamente indisponível. Tente novamente mais tarde.' : 'Erro interno do servidor.',
      });
      assert.equal(response.headers.get('x-powered-by'), null);
    });
  }
  await t.test('validação comercial 400', async t => {
    const body = { sucesso: false, erro: 'O caixa já está aberto.' };
    const app = loadApp({ nodeEnv: 'production', routeResponse: { status: 400, body } });
    const base = await serve(t, app.default);
    const response = await fetch(base + '/api/produtos');
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), body);
  });
  await t.test('falha do preparo 503', async t => {
    const app = loadApp({ nodeEnv: 'production', failAt: 'inicializarAcessos' });
    const base = await serve(t, app.default);
    const response = await fetch(base + '/api');
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { sucesso: false, erro: 'Serviço temporariamente indisponível. Tente novamente mais tarde.' });
  });
});
