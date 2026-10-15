const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { randomBytes } = require('node:crypto');
const { Client } = require('pg');
const bcrypt = require('bcrypt');
const testUrl = process.env.PG_TEST_DATABASE_URL;

test('instalação PostgreSQL nova cria primeiro administrador sem senha padrão ou exposição do segredo', { skip: !testUrl, timeout: 60000 }, async t => {
  const root = path.resolve(__dirname, '..');
  const cli = path.join(root, 'dist/cli/primeiro-admin.js');
  assert.ok(fs.existsSync(cli), 'Execute npm run build antes do teste PostgreSQL.');
  let url;
  try { url = new URL(testUrl); } catch { throw new Error('PG_TEST_DATABASE_URL inválida.'); }
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
  assert.match(url.pathname, /\/[^/]+_test$/);
  url.search = '';
  const name = `mercadinho_admin_${randomBytes(6).toString('hex')}_test`;
  const admin = new Client({ connectionString: url.toString(), ssl: false });
  await admin.connect(); await admin.query(`CREATE DATABASE "${name}"`);
  const target = new URL(url); target.pathname = `/${name}`;
  const db = new Client({ connectionString: target.toString(), ssl: false }); await db.connect();
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mercadinho-admin-test-'));
  let server;
  t.after(async () => {
    if (server && server.exitCode === null) { const exited = once(server, 'exit'); server.kill(); await exited; }
    await db.end();
    assert.match(name, /^mercadinho_admin_[a-f0-9]{12}_test$/);
    await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`); await admin.end();
    assert.equal(path.dirname(path.resolve(temp)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(temp).startsWith('mercadinho-admin-test-'));
    fs.rmSync(temp, { recursive: true, force: true });
  });
  const env = { ...process.env, DB_CLIENT: 'postgres', DATABASE_URL: target.toString(), PG_SSL: 'disable', NODE_ENV: 'test' };
  const execute = (args, secret, customEnv = {}) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], { cwd: temp, env: { ...env, ...customEnv }, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { output += chunk; });
    child.on('error', reject); child.on('exit', code => resolve({ code, output }));
    child.stdin.on('error', () => {});
    if (secret === undefined) child.stdin.end();
    else {
      const bytes = Buffer.from(`${secret}\n`, 'utf8');
      const accent = bytes.indexOf(0xc3);
      if (accent >= 0) {
        child.stdin.write(bytes.subarray(0, accent + 1));
        setTimeout(() => child.stdin.end(bytes.subarray(accent + 1)), 150);
      } else child.stdin.end(bytes);
    }
  });
  const flags = ['--nome', 'Primeira Administradora', '--email', 'primeira@bootstrap.test', '--password-stdin'];
  const password = `Inicial-ação-${randomBytes(12).toString('hex')}`;
  const migrations = path.resolve(root, '../supabase/migrations');
  for (const file of fs.readdirSync(migrations).filter(f => f.endsWith('.sql')).sort()) await db.query(fs.readFileSync(path.join(migrations, file), 'utf8'));

  await t.test('CLI não abre SQLite por engano e não aceita senha em argumento', async () => {
    const wrongDatabase = await execute(flags, password, { DB_CLIENT: 'sqlite' });
    assert.equal(wrongDatabase.code, 1); assert.match(wrongDatabase.output, /SQLite local não será aberto/);
    assert.equal(fs.existsSync(path.join(temp, 'src/database/nosso-mercadinho.db')), false);
    const unsafe = await execute(['--senha', password]);
    assert.equal(unsafe.code, 1); assert.ok(!unsafe.output.includes(password));
  });
  await t.test('banco sem seed técnico e senha fraca recusam sem criar usuário', async () => {
    const noSeed = await execute(flags, password); assert.equal(noSeed.code, 1); assert.match(noSeed.output, /seed.sql/);
    assert.equal(Number((await db.query('SELECT COUNT(*) AS total FROM usuarios')).rows[0].total), 0);
    await db.query(fs.readFileSync(path.resolve(root, '../supabase/seed.sql'), 'utf8'));
    const weak = await execute(flags, 'curta'); assert.equal(weak.code, 1); assert.match(weak.output, /12 caracteres/);
    assert.ok(!weak.output.includes('curta'));
  });
  await t.test('dois bootstraps concorrentes criam somente um administrador e executor com hash bcrypt', async () => {
    const results = await Promise.all([execute(flags, password), execute(flags, password)]);
    assert.deepEqual(results.map(r => r.code).sort(), [0, 1]);
    for (const result of results) assert.ok(!result.output.includes(password));
    assert.ok(results.some(r => r.output.includes('já possui usuários')));
    const users = (await db.query('SELECT * FROM usuarios')).rows;
    assert.equal(users.length, 1); assert.equal(users[0].perfil, 'ADMINISTRADOR'); assert.match(users[0].senha, /^\$2/);
    assert.equal(await bcrypt.compare(password, users[0].senha), true);
    const executors = (await db.query('SELECT * FROM executores')).rows;
    assert.equal(executors.length, 1); assert.equal(executors[0].usuario_id, users[0].id); assert.match(executors[0].codigo, /^\d{2,4}$/);
    assert.ok(results.find(r => r.code === 0).output.includes(executors[0].codigo));
    const repeated = await execute(flags, password); assert.equal(repeated.code, 1); assert.match(repeated.output, /já possui usuários/);
    assert.equal((await db.query('SELECT senha FROM usuarios')).rows[0].senha, users[0].senha);
  });
  await t.test('API compilada aceita o acesso criado e expõe responsável operacional sem SQL manual', async () => {
    const port = await new Promise(resolve => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
    let logs = '';
    server = spawn(process.execPath, [path.join(root, 'dist/app.js')], { cwd: temp, env: { ...env, PORT: String(port), JWT_SECRET: randomBytes(32).toString('hex') }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    server.stdout.on('data', chunk => { logs += chunk; }); server.stderr.on('data', chunk => { logs += chunk; });
    const base = `http://127.0.0.1:${port}/api`; let ready = false;
    for (let i = 0; i < 150; i++) { try { if ((await fetch(base)).ok) { ready = true; break; } } catch {} assert.equal(server.exitCode, null, logs); await new Promise(r => setTimeout(r, 100)); }
    assert.equal(ready, true, logs);
    const response = await fetch(base + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'primeira@bootstrap.test', senha: password }) });
    assert.equal(response.status, 200); const auth = await response.json(); assert.ok(auth.usuario.permissoes.includes('usuarios')); assert.deepEqual(auth.usuario.lojaIds, [1]);
    const executors = await fetch(base + '/executores', { headers: { Authorization: `Bearer ${auth.token}` } });
    assert.equal(executors.status, 200); assert.equal((await executors.json()).executores[0].nome, 'Primeira Administradora');
    assert.ok(!logs.includes(password));
  });
});
