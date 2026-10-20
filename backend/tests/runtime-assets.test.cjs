const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const ts = require('typescript');

const backend = path.resolve(__dirname, '..');
const contractSource = path.resolve(backend, '../supabase/schema-contract.json');
const ncmSource = path.join(backend, 'src/database/ncm/ncm.json');

function fixture(t) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mercadinho-runtime-assets-'));
  t.after(() => {
    assert.equal(path.dirname(path.resolve(temp)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(temp).startsWith('mercadinho-runtime-assets-'));
    fs.rmSync(temp, { recursive: true, force: true });
  });
  const root = path.join(temp, 'backend');
  for (const directory of ['scripts', 'src/database/ncm', 'dist/services', 'dist/database']) {
    fs.mkdirSync(path.join(root, directory), { recursive: true });
  }
  fs.mkdirSync(path.join(temp, 'supabase'));
  fs.mkdirSync(path.join(temp, 'unrelated-cwd'));
  fs.copyFileSync(contractSource, path.join(temp, 'supabase/schema-contract.json'));
  fs.copyFileSync(ncmSource, path.join(root, 'src/database/ncm/ncm.json'));
  fs.copyFileSync(path.join(backend, 'scripts/copy-schema-contract.cjs'), path.join(root, 'scripts/copy-schema-contract.cjs'));
  const cwd = path.join(temp, 'unrelated-cwd');
  const build = spawnSync(process.execPath, [path.join(root, 'scripts/copy-schema-contract.cjs')], { cwd, encoding: 'utf8', windowsHide: true });
  assert.equal(build.status, 0, build.stderr);
  for (const file of ['services/ncm.service', 'database/postgres', 'database/sql-dialect']) {
    const output = ts.transpileModule(fs.readFileSync(path.join(backend, `src/${file}.ts`), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    fs.writeFileSync(path.join(root, `dist/${file}.js`), output);
  }
  return { root, cwd };
}

function run(cwd, script) {
  return spawnSync(process.execPath, ['-e', script], { cwd, encoding: 'utf8', windowsHide: true });
}

test('build inclui os assets reais do backend sem depender do diretório atual', t => {
  const { root } = fixture(t);
  assert.deepEqual(fs.readFileSync(path.join(root, 'dist/schema-contract.json')), fs.readFileSync(contractSource));
  assert.deepEqual(fs.readFileSync(path.join(root, 'dist/database/ncm/ncm.json')), fs.readFileSync(ncmSource));
});

test('NCM compilado consulta o asset empacotado a partir de outro diretório', t => {
  const { root, cwd } = fixture(t);
  const script = `
    const assert = require('node:assert/strict');
    const { buscarNcm, validarNcm } = require(${JSON.stringify(path.join(root, 'dist/services/ncm.service.js'))});
    (async () => {
      assert.deepEqual(await buscarNcm('0101.21.00'), { codigo: '01012100', descricao: '-- Reprodutores de raça pura' });
      assert.equal(await validarNcm('01012100'), true);
      assert.equal(await buscarNcm('00000000'), null);
      assert.equal(await buscarNcm('invalido'), null);
    })().catch(error => { console.error(error); process.exitCode = 1; });
  `;
  const result = run(cwd, script);
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test('NCM ausente no pacote retorna diagnóstico do build em vez de procurar no cwd', t => {
  const { root, cwd } = fixture(t);
  fs.unlinkSync(path.join(root, 'dist/database/ncm/ncm.json'));
  const script = `
    const assert = require('node:assert/strict');
    const { buscarNcm } = require(${JSON.stringify(path.join(root, 'dist/services/ncm.service.js'))});
    assert.rejects(buscarNcm('01012100'), /ncm.json ausente no pacote da API/)
      .catch(error => { console.error(error); process.exitCode = 1; });
  `;
  const result = run(cwd, script);
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test('PostgreSQL compilado valida o contrato empacotado e exige esse asset no deploy', t => {
  const { root, cwd } = fixture(t);
  const contract = JSON.parse(fs.readFileSync(contractSource, 'utf8'));
  const columns = contract.tables.flatMap(table => table.columns.map((column, index) => ({
    table_name: table.name,
    column_name: column.name,
    data_type: 'text',
    is_nullable: 'YES',
    column_default: null,
    ordinal_position: index + 1,
    is_identity: table.identityColumn === column.name ? 'YES' : 'NO',
  })));
  const prelude = `
    const assert = require('node:assert/strict');
    const Module = require('node:module');
    const load = Module._load;
    const pg = { types: { setTypeParser() {} }, Pool: class {
      on() {}
      async query() { return { rows: ${JSON.stringify(columns)} }; }
      async end() {}
    } };
    Module._load = function(id, ...args) { return id === 'pg' ? pg : load.call(this, id, ...args); };
    process.env.DATABASE_URL = 'postgresql://test:unused@example.test:5432/postgres';
    process.env.PG_SSL = 'require';
    delete process.env.PG_SSL_CA;
    delete process.env.PG_SSL_CA_FILE;
    const { PostgresDatabase } = require(${JSON.stringify(path.join(root, 'dist/database/postgres.js'))});
    const db = new PostgresDatabase();
  `;
  // Do not inline the whole schema in command arguments (Windows command length).
  const harness = path.join(root, 'postgres-asset-harness.cjs');
  fs.writeFileSync(harness, prelude + `
    (async () => { await db.ready; await new Promise(resolve => db.close(resolve)); })()
      .catch(error => { console.error(error); process.exitCode = 1; });
  `);
  const found = spawnSync(process.execPath, [harness], { cwd, encoding: 'utf8', windowsHide: true });
  assert.equal(found.status, 0, found.stdout + found.stderr);
  fs.unlinkSync(path.join(root, 'dist/schema-contract.json'));
  fs.writeFileSync(harness, prelude + `
    (async () => {
      await assert.rejects(db.ready, /schema-contract.json ausente no pacote da API/);
      await new Promise(resolve => db.close(resolve));
    })().catch(error => { console.error(error); process.exitCode = 1; });
  `);
  const missing = spawnSync(process.execPath, [harness], { cwd, encoding: 'utf8', windowsHide: true });
  assert.equal(missing.status, 0, missing.stdout + missing.stderr);
});
