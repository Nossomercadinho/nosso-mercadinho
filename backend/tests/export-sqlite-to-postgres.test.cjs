'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const sqlite3 = require('sqlite3');
const { exportDatabase, valueLiteral, argumentsFrom } = require('../scripts/export-sqlite-to-postgres.cjs');

const scriptPath = path.resolve(__dirname, '../scripts/export-sqlite-to-postgres.cjs');
const runFile = promisify(execFile);
const fakeName = "Mercado d'Oeste\\teste\nLinha dois";
const fakeHash = '$2b$12$HASH_SOMENTE_DE_TESTE_123456789';
const contract = {
  tables: [
    { name: 'empresas', identityColumn: 'id', columns: [
      { name: 'id', type: 'BIGINT', nullable: false },
      { name: 'nome', type: 'TEXT', nullable: false },
      { name: 'criado_em', type: 'TEXT', nullable: true },
      { name: 'config', type: 'TEXT', nullable: true },
      { name: 'saldo', type: 'NUMERIC', nullable: true },
      { name: 'ativo', type: 'INTEGER', nullable: false, default: '1' },
    ] },
    { name: 'usuarios', identityColumn: 'id', foreignKeys: [{ column: 'empresa_id', table: 'empresas', referencedColumn: 'id' }], columns: [
      { name: 'id', type: 'BIGINT', nullable: false },
      { name: 'empresa_id', type: 'BIGINT', nullable: false },
      { name: 'senha', type: 'TEXT', nullable: false },
      { name: 'json_dados', type: 'JSONB', nullable: true },
      { name: 'preferencia', type: 'BOOLEAN', nullable: true },
      { name: 'arquivo', type: 'BYTEA', nullable: true },
    ] },
    { name: 'tabela_nova', identityColumn: 'id', columns: [{ name: 'id', type: 'BIGINT', nullable: false }] },
  ],
};

async function fixture(t) {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'nm-export-pg-'));
  t.after(async () => {
    const target = path.resolve(folder);
    if (!target.startsWith(path.resolve(os.tmpdir()) + path.sep) || !path.basename(target).startsWith('nm-export-pg-')) throw new Error('Diretório de teste fora do escopo esperado.');
    await fs.rm(target, { recursive: true, force: true });
  });
  const source = path.join(folder, 'origem.db');
  const output = path.join(folder, 'dados.sql');
  const schema = path.join(folder, 'contrato.json');
  await fs.writeFile(schema, JSON.stringify(contract));
  const db = await new Promise((resolve, reject) => {
    const instance = new sqlite3.Database(source, (error) => error ? reject(error) : resolve(instance));
  });
  const execute = (sql) => new Promise((resolve, reject) => db.exec(sql, (error) => error ? reject(error) : resolve()));
  const run = (sql, values) => new Promise((resolve, reject) => db.run(sql, values, (error) => error ? reject(error) : resolve()));
  await execute(`CREATE TABLE empresas (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, criado_em TEXT, config TEXT, saldo REAL, ativo INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE usuarios (id INTEGER PRIMARY KEY AUTOINCREMENT, empresa_id INTEGER NOT NULL REFERENCES empresas(id), senha TEXT NOT NULL, json_dados TEXT, preferencia INTEGER, arquivo BLOB);`);
  await run('INSERT INTO empresas (id,nome,criado_em,config,saldo,ativo) VALUES (9007199254740993,?,?,?,?,?)', [fakeName, '2026-10-15 03:02:01', '{"permissoes":["pdv","estoque"],"lojas":[1,2]}', 1.25, 1]);
  await run('INSERT INTO usuarios (id,empresa_id,senha,json_dados,preferencia,arquivo) VALUES (42,9007199254740993,?,?,?,?)', [fakeHash, '{"texto":"d\u0027Oeste","ok":true}', 0, Buffer.from([0, 0xff, 1])]);
  await execute("INSERT INTO empresas (id,nome) VALUES (9007199254740999,'Apagado no teste'); DELETE FROM empresas WHERE id=9007199254740999;");
  await new Promise((resolve, reject) => db.close((error) => error ? reject(error) : resolve()));
  return { folder, source, output, schema, options: { sqlite: source, output, contract: schema, schema: 'nm_import_test', batchSize: 1 } };
}

async function mutate(source, sql, values = []) {
  const db = await new Promise((resolve, reject) => {
    const instance = new sqlite3.Database(source, (error) => error ? reject(error) : resolve(instance));
  });
  try { await new Promise((resolve, reject) => db.run(sql, values, (error) => error ? reject(error) : resolve())); }
  finally { await new Promise((resolve, reject) => db.close((error) => error ? reject(error) : resolve())); }
}

test('export preserves IDs, dates, hashes, flags, JSON, binary data and SQLite sequence without modifying source', async (t) => {
  const files = await fixture(t);
  const before = crypto.createHash('sha256').update(await fs.readFile(files.source)).digest('hex');
  const result = await exportDatabase(files.options);
  const sql = await fs.readFile(files.output, 'utf8');
  assert.equal(result.rows, 2);
  assert.equal(result.tables.find((table) => table.table === 'tabela_nova').absent, true);
  assert.ok(sql.includes('9007199254740993'));
  assert.ok(sql.includes('9007199254740999'));
  assert.ok(sql.includes("'Mercado d''Oeste\\teste\nLinha dois'"));
  assert.ok(sql.includes("'2026-10-15 03:02:01'"));
  assert.ok(sql.includes(fakeHash));
  assert.ok(sql.includes("'2026-10-15 03:02:01', '{\"permissoes\":[\"pdv\",\"estoque\"],\"lojas\":[1,2]}', 1.25, 1"));
  assert.ok(sql.includes("::jsonb, FALSE, decode('00FF01', 'hex')"));
  assert.match(sql, /LOCK TABLE .*"nm_import_test"\."empresas".*ACCESS EXCLUSIVE MODE/);
  assert.ok(sql.includes("WHERE EXISTS (SELECT 1 FROM \"nm_import_test\".\"tabela_nova\")"));
  assert.ok(sql.includes('SET CONSTRAINTS ALL IMMEDIATE;'));
  assert.match(sql, /pg_get_serial_sequence/);
  assert.match(sql, /COMMIT;\n-- Exportação completa\.\n$/);
  const after = crypto.createHash('sha256').update(await fs.readFile(files.source)).digest('hex');
  assert.equal(after, before);
});

test('CLI never prints private row values and does not overwrite existing output', async (t) => {
  const files = await fixture(t);
  const { stdout } = await runFile(process.execPath, [scriptPath, '--sqlite', files.source, '--output', files.output, '--contract', files.schema]);
  assert.match(stdout, /2 registros/);
  assert.ok(!stdout.includes(fakeName));
  assert.ok(!stdout.includes(fakeHash));
  const original = await fs.readFile(files.output);
  await assert.rejects(exportDatabase(files.options), /saída já existe/);
  assert.deepEqual(await fs.readFile(files.output), original);
});

test('orphan references stop export without changing the source or leaving a partial dump', async (t) => {
  const files = await fixture(t);
  await mutate(files.source, 'UPDATE usuarios SET empresa_id=123');
  await assert.rejects(exportDatabase(files.options), /1 violações de chaves estrangeiras/);
  await assert.rejects(fs.access(files.output), { code: 'ENOENT' });
});

test('unknown source columns and tables are not silently discarded', async (t) => {
  const files = await fixture(t);
  await mutate(files.source, 'ALTER TABLE empresas ADD COLUMN campo_novo TEXT');
  await assert.rejects(exportDatabase(files.options), /Colunas da origem não previstas.*campo_novo/);
  await fs.writeFile(files.schema, JSON.stringify({ tables: [{ ...contract.tables[1], foreignKeys: [] }, contract.tables[2]] }));
  await assert.rejects(exportDatabase(files.options), /Tabelas da origem não previstas.*empresas/);
});

test('foreign keys introduced by the PostgreSQL migration are validated even when absent in SQLite DDL', async (t) => {
  const files = await fixture(t);
  await mutate(files.source, 'DROP TABLE usuarios');
  await mutate(files.source, 'CREATE TABLE usuarios (id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, senha TEXT NOT NULL)');
  await mutate(files.source, "INSERT INTO usuarios VALUES (42,123,'valor_apenas_de_teste')");
  await assert.rejects(exportDatabase(files.options), /1 referências inválidas.*usuarios.empresa_id.*empresas.id/);
  await assert.rejects(fs.access(files.output), { code: 'ENOENT' });
});

test('invalid target values remove partial output and error messages do not include the data', async (t) => {
  const files = await fixture(t);
  await mutate(files.source, 'UPDATE usuarios SET senha=?', ['valor_privado\u0000incompatível']);
  await assert.rejects(exportDatabase(files.options), (error) => {
    assert.match(error.message, /Tabela usuarios, linha 1, coluna senha/);
    assert.match(error.message, /NUL/);
    assert.ok(!error.message.includes('valor_privado'));
    return true;
  });
  await assert.rejects(fs.access(files.output), { code: 'ENOENT' });
});

test('typed conversion rejects invalid values rather than rounding or silently changing them', () => {
  assert.equal(valueLiteral('9223372036854775807', 'integer', 'BIGINT'), '9223372036854775807');
  assert.equal(valueLiteral('0', 'integer', 'INTEGER'), '0');
  assert.equal(valueLiteral('1', 'integer', 'BOOLEAN'), 'TRUE');
  assert.equal(valueLiteral(null, 'null', 'TEXT'), 'NULL');
  assert.throws(() => valueLiteral('9223372036854775808', 'integer', 'BIGINT'), /fora da faixa/);
  assert.throws(() => valueLiteral('12.5', 'real', 'INTEGER'), /inteiro válido/);
  assert.throws(() => valueLiteral('Infinity', 'real', 'NUMERIC'), /não finito/);
  assert.throws(() => valueLiteral('{invalido', 'text', 'JSONB'), /JSON inválido/);
  assert.throws(() => valueLiteral('2', 'integer', 'BOOLEAN'), /booleano válido/);
  assert.throws(() => valueLiteral('00ff', 'blob', 'TEXT'), /BLOB exige/);
  assert.throws(() => argumentsFrom(['--output']), /sem valor/);
  assert.throws(() => argumentsFrom(['--database-url', 'não-usado']), /Opção inválida/);
});
