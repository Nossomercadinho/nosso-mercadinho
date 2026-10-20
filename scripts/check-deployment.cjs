'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');

function filesIn(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...filesIn(file));
    else files.push(file);
  }
  return files;
}

function privateFile(file, base) {
  const relative = path.relative(base, file).replaceAll('\\', '/');
  return /(^|\/)(?:\.env(?:\.[^/]*)?|\.local)(?:\/|$)|\.(?:db|db-wal|db-shm|sqlite|sqlite3)$/i.test(relative);
}

function checkStatic(directory) {
  assert.ok(fs.existsSync(path.join(directory, 'index.html')), 'Build do frontend ausente. Execute npm run build.');
  const files = filesIn(directory);
  const privatePaths = files.filter(file => privateFile(file, directory));
  assert.equal(privatePaths.length, 0, 'Arquivo privado encontrado no conteúdo público.');
  const secretPatterns = [/sb_secret_[A-Za-z0-9_-]{12,}/, /sbp_[a-f0-9]{40}/, /postgres(?:ql)?:\/\/[^\s"'<>]+:[^\s"'<>]+@/];
  const values = ['DATABASE_URL', 'JWT_SECRET'].map(key => process.env[key]).filter(value => value && value.length >= 12);
  for (const file of files.filter(file => /\.(?:html|js|css|json|map|svg)$/i.test(file))) {
    const text = fs.readFileSync(file, 'utf8');
    assert.ok(!secretPatterns.some(pattern => pattern.test(text)), 'Credencial detectada no frontend compilado.');
    assert.ok(!values.some(value => text.includes(value)), 'Segredo do ambiente detectado no frontend compilado.');
  }
  return files.length;
}

function checkBundle(directory) {
  const output = JSON.parse(fs.readFileSync(path.join(directory, 'config.json'), 'utf8'));
  assert.equal(output.version, 3, 'Build Output API inesperada.');
  const serviceRoot = path.join(directory, 'services');
  const serviceNames = fs.readdirSync(serviceRoot, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
  assert.deepEqual(serviceNames, ['backend', 'frontend'], 'O bundle deve conter os serviços backend e frontend.');
  const services = Object.fromEntries(serviceNames.map(name => {
    const serviceDirectory = path.join(serviceRoot, name);
    const configuration = JSON.parse(fs.readFileSync(path.join(serviceDirectory, 'config.json'), 'utf8'));
    assert.equal(configuration.version, 3, `Build Output API inesperada no serviço ${name}.`);
    return [name, { directory: serviceDirectory, configuration }];
  }));
  const functionRoot = path.join(services.backend.directory, 'functions');
  const files = filesIn(functionRoot);
  const functionConfigs = files.filter(file => path.basename(file) === '.vc-config.json' && path.dirname(file).endsWith('.func'));
  assert.equal(functionConfigs.length, 1, 'O serviço backend deve conter uma função Express.');
  assert.equal(files.filter(file => privateFile(file, functionRoot)).length, 0, 'Arquivo privado incluído na função.');
  assert.ok(!files.some(file => /\/(?:sqlite3|ts-node-dev|chokidar|braces)\//.test(file.replaceAll('\\', '/'))), 'Dependência local/de desenvolvimento indevida na função.');
  assert.ok(!files.some(file => /\/database\/sqlite\.(?:cjs|js)(?:\.map)?$/.test(file.replaceAll('\\', '/'))), 'Adaptador SQLite incluído na função PostgreSQL.');
  assert.ok(files.some(file => /\/dist\/app\.(?:cjs|js)$/.test(file.replaceAll('\\', '/'))), 'Aplicação compilada ausente na função.');
  for (const suffix of ['dist/schema-contract.json', 'dist/database/ncm/ncm.json']) {
    assert.ok(files.some(file => file.replaceAll('\\', '/').endsWith(suffix)), `Asset ausente na função: ${suffix}`);
  }
  const functionConfig = JSON.parse(fs.readFileSync(functionConfigs[0], 'utf8'));
  assert.equal(functionConfig.runtime, 'nodejs22.x');
  assert.match(functionConfig.handler, /(?:^|\/)vercel\.(?:cjs|js)$/, 'O entrypoint da função deve ser o gateway vercel.js compilado.');
  const functionDirectory = path.dirname(functionConfigs[0]);
  assert.ok(fs.existsSync(path.join(functionDirectory, functionConfig.handler)), 'Entrypoint ausente no pacote da função.');
  assert.ok(!fs.existsSync(path.join(services.frontend.directory, 'functions')), 'O frontend deve ser estático, sem função com acesso ao ambiente privado.');
  const functionPath = '/' + path.relative(functionRoot, functionDirectory).replaceAll('\\', '/').replace(/\.func$/, '');

  function destination(serviceName, target) {
    const pathname = target.split('?')[0];
    if (serviceName === 'backend' && (pathname === functionPath || pathname === `${functionPath}.js` || (functionPath === '/index' && pathname === '/'))) return { service: serviceName, destination: 'function' };
    const file = path.join(services[serviceName].directory, 'static', pathname === '/' ? 'index.html' : pathname.slice(1));
    return fs.existsSync(file) && fs.statSync(file).isFile() ? { service: serviceName, destination: pathname === '/' ? '/index.html' : pathname } : null;
  }

  function routeFor(pathname, serviceName) {
    const routes = serviceName ? services[serviceName].configuration.routes : output.routes;
    for (const route of routes || []) {
      if (route.handle === 'filesystem') {
        const found = serviceName && destination(serviceName, pathname);
        if (found) return found;
        continue;
      }
      if (!route.src || route.continue) continue;
      const match = pathname.match(new RegExp(route.src));
      if (!match) continue;
      const interpolate = target => target.replace(/\$(\d+)/g, (_, index) => match[Number(index)] || '');
      if (route.destination?.service) {
        assert.ok(services[route.destination.service], `Serviço de destino desconhecido: ${route.destination.service}`);
        return routeFor(route.destination.path ? interpolate(route.destination.path) : pathname, route.destination.service);
      }
      if (route.dest) {
        const found = serviceName && destination(serviceName, interpolate(route.dest));
        if (found) return found;
      }
      if (route.status) return route.status;
    }
    return serviceName ? destination(serviceName, pathname) || 404 : 404;
  }
  for (const route of ['/api', '/api/', '/api/auth/login', '/api/produtos', '/api/inexistente']) assert.deepEqual(routeFor(route), { service: 'backend', destination: 'function' }, `API não encaminhada: ${route}`);
  for (const route of ['/', '/pdv', '/apix']) assert.deepEqual(routeFor(route), { service: 'frontend', destination: '/index.html' }, `Interface não encaminhada: ${route}`);
  for (const route of ['/favicon.svg', '/icons.svg', '/manifest.webmanifest']) assert.deepEqual(routeFor(route), { service: 'frontend', destination: route }, `Arquivo público interceptado pela SPA: ${route}`);
  assert.equal(routeFor('/assets/inexistente.js'), 404, 'Asset inexistente virou HTML.');
  const staticRoot = path.join(services.frontend.directory, 'static');
  const visible = checkStatic(staticRoot);
  for (const file of filesIn(staticRoot).filter(file => file.includes(`${path.sep}assets${path.sep}`))) {
    const route = '/' + path.relative(staticRoot, file).replaceAll('\\', '/');
    assert.deepEqual(routeFor(route), { service: 'frontend', destination: route }, `Asset público interceptado pela SPA: ${route}`);
  }
  return { services: serviceNames, functionFiles: files.length, staticFiles: visible, runtime: functionConfig.runtime, routes: output.routes.length };
}

try {
  const result = { staticFiles: checkStatic(path.join(root, 'frontend/dist')) };
  for (const asset of ['backend/dist/schema-contract.json', 'backend/dist/database/ncm/ncm.json']) {
    assert.ok(fs.existsSync(path.join(root, asset)), `Asset de runtime ausente: ${asset}`);
  }
  const option = process.argv.indexOf('--bundle');
  if (option >= 0) {
    assert.ok(process.argv[option + 1], 'Informe o diretório após --bundle.');
    result.bundle = checkBundle(path.resolve(root, process.argv[option + 1]));
  }
  console.log(JSON.stringify({ deploymentCheck: 'passed', ...result }));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
