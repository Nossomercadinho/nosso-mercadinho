const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

process.env.TS_NODE_PROJECT = path.resolve(__dirname, '../tsconfig.json');
require('ts-node/register/transpile-only');
const contract = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../supabase/schema-contract.json'), 'utf8'));
const columns = contract.tables.flatMap(table => table.columns.map((column, index) => ({
  table_name: table.name, column_name: column.name, data_type: 'text',
  is_nullable: 'YES', column_default: null, ordinal_position: index + 1,
  is_identity: table.identityColumn === column.name ? 'YES' : 'NO',
})));
let active;
class FakePool {
  constructor() { this.state = active; }
  on() {}
  async query(sql) {
    if (sql.includes('information_schema.columns')) return { rows: columns };
    this.state.queries.push({ target: 'pool', sql });
    return { rows: [], rowCount: 0 };
  }
  async connect() {
    const state = this.state;
    return {
      on() {}, removeListener() {},
      async query(sql, params) {
        state.queries.push({ target: 'transaction', sql, params });
        if (sql.includes('pg_advisory_xact_lock')) {
          state.lockRequested = true;
          if (state.failLock) throw new Error('lock indisponível');
          if (state.holdLock) await new Promise(resolve => { state.releaseLock = resolve; });
        }
        return { rows: [], rowCount: 0 };
      },
      release(discard) { state.released.push(discard); },
    };
  }
  async end() {}
}
const originalLoad = Module._load;
let PostgresDatabase;
try {
  Module._load = function(id, ...args) {
    return id === 'pg' ? { Pool: FakePool, types: { setTypeParser() {} } } : originalLoad.call(this, id, ...args);
  };
  ({ PostgresDatabase } = require('../src/database/postgres.ts'));
} finally { Module._load = originalLoad; }

async function database(t, options = {}) {
  const keys = ['DATABASE_URL', 'PG_SSL', 'PG_SSL_CA', 'PG_SSL_CA_FILE'];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  process.env.DATABASE_URL = 'postgresql://test:unused@example.test:5432/postgres';
  process.env.PG_SSL = 'require';
  delete process.env.PG_SSL_CA;
  delete process.env.PG_SSL_CA_FILE;
  const state = { queries: [], released: [], ...options };
  active = state;
  const db = new PostgresDatabase();
  t.after(async () => {
    state.releaseLock?.();
    await new Promise(resolve => db.close(resolve));
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
  await db.ready;
  const execute = sql => new Promise((resolve, reject) => db.run(sql, error => error ? reject(error) : resolve()));
  return { db, state, execute };
}

test('BEGIN aguarda o lock PostgreSQL compartilhado antes de aceitar a transação', async t => {
  const { state, execute } = await database(t, { holdLock: true });
  let begun = false;
  const starting = execute('BEGIN IMMEDIATE TRANSACTION').then(() => { begun = true; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(state.lockRequested, true);
  assert.equal(begun, false, 'BEGIN deve aguardar o banco liberar o lock entre instâncias.');
  state.releaseLock();
  await starting;
  await execute('UPDATE produtos SET nome = nome');
  await execute('COMMIT');
  assert.equal(state.queries[0].sql, 'BEGIN');
  assert.match(state.queries[1].sql, /^SELECT pg_advisory_xact_lock\(\$1, \$2\)$/);
  assert.equal(state.queries[1].params.length, 2);
  assert.ok(state.queries.every(query => query.target === 'transaction'));
  assert.deepEqual(state.released, [false]);
});

test('falha ao adquirir lock reverte e descarta a conexão antes de novas consultas', async t => {
  const { state, execute } = await database(t, { failLock: true });
  await assert.rejects(execute('BEGIN'), /lock indisponível/);
  assert.equal(state.queries.at(-1).sql, 'ROLLBACK');
  assert.deepEqual(state.released, [true]);
  await execute('SELECT 1');
  assert.equal(state.queries.at(-1).target, 'pool');
});
