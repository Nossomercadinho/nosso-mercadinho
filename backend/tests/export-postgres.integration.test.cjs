'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const sqlite3 = require('sqlite3');
const { Client } = require('pg');
const { exportDatabase } = require('../scripts/export-sqlite-to-postgres.cjs');

const localUrl = process.env.POSTGRES_EXPORT_TEST_URL;

test('PostgreSQL local: migration + import preserve values, resist SQL injection, reset sequences and reject occupied target', { skip: !localUrl && 'Defina POSTGRES_EXPORT_TEST_URL apontando para PostgreSQL local descartável.' }, async (t) => {
  const address = new URL(localUrl);
  assert.ok(['127.0.0.1', 'localhost', '[::1]', '::1'].includes(address.hostname), 'Este teste só aceita PostgreSQL local.');
  const targetName = `mercadinho_import_test_${crypto.randomBytes(5).toString('hex')}`;
  const originalName = decodeURIComponent(address.pathname.slice(1));
  assert.notEqual(targetName, originalName);
  const admin = new Client({ connectionString: address.toString() });
  let target;
  let created = false;
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'nm-export-integration-'));
  t.after(async () => {
    if (target) await target.end();
    if (created) {
      assert.match(targetName, /^mercadinho_import_test_[a-f0-9]{10}$/);
      await admin.query(`DROP DATABASE "${targetName}"`);
    }
    await admin.end();
    const cleanup = path.resolve(folder);
    assert.ok(cleanup.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(cleanup).startsWith('nm-export-integration-'));
    await fs.rm(cleanup, { recursive: true, force: true });
  });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${targetName}"`);
  created = true;
  address.pathname = `/${targetName}`;
  target = new Client({ connectionString: address.toString() });
  await target.connect();
  const migrationFolder = path.resolve(__dirname, '../../supabase/migrations');
  for (const filename of (await fs.readdir(migrationFolder)).filter((name) => name.endsWith('.sql')).sort()) {
    await target.query(await fs.readFile(path.join(migrationFolder, filename), 'utf8'));
  }

  const source = path.join(folder, 'origem-falsa.db');
  const output = path.join(folder, 'importacao.sql');
  const sqlite = await new Promise((resolve, reject) => {
    const db = new sqlite3.Database(source, (error) => error ? reject(error) : resolve(db));
  });
  const execute = (sql) => new Promise((resolve, reject) => sqlite.exec(sql, (error) => error ? reject(error) : resolve()));
  const insert = (sql, values) => new Promise((resolve, reject) => sqlite.run(sql, values, (error) => error ? reject(error) : resolve()));
  const textWithSql = "Mercado d'Oeste \\texto\n'); DROP TABLE public.usuarios; -- $nm_import_guard$ ☕";
  const hash = '$2b$12$HASH_FALSO_PARA_TESTE_DE_PRESERVACAO';
  const timestamp = '2026-10-15 03:02:01';
  const permissions = '["pdv","estoque","vendas"]';
  try {
    await execute(`CREATE TABLE empresas (id INTEGER PRIMARY KEY AUTOINCREMENT,nome TEXT NOT NULL,razao_social TEXT,cnpj TEXT,ativo INTEGER,criado_em TEXT,atualizado_em TEXT);
      CREATE TABLE papeis_acesso (id INTEGER PRIMARY KEY AUTOINCREMENT,nome TEXT NOT NULL,permissoes TEXT NOT NULL,sistema INTEGER,acesso_todas_lojas INTEGER,criado_em TEXT,atualizado_em TEXT);
      CREATE TABLE usuarios (id INTEGER PRIMARY KEY AUTOINCREMENT,nome TEXT NOT NULL,email TEXT NOT NULL,senha TEXT NOT NULL,perfil TEXT NOT NULL,ativo INTEGER,criado_em TEXT,atualizado_em TEXT,papel_id INTEGER REFERENCES papeis_acesso(id));`);
    await insert('INSERT INTO empresas VALUES (9007199254740993,?,?,?,?,?,?)', [textWithSql, '{"texto":"d\u0027Oeste","lista":[1,2]}', null, 1, timestamp, timestamp]);
    await execute("INSERT INTO empresas (id,nome) VALUES (9007199254740999,'Registro removido do teste'); DELETE FROM empresas WHERE id=9007199254740999;");
    await insert('INSERT INTO papeis_acesso VALUES (7,?,?,?,?,?,?)', ['Papel de teste', permissions, 0, 0, timestamp, timestamp]);
    await insert('INSERT INTO usuarios VALUES (42,?,?,?,?,?,?,?,7)', ['Pessoa de teste', 'fixture@example.test', hash, 'OPERADOR', 1, timestamp, timestamp]);
  } finally { await new Promise((resolve, reject) => sqlite.close((error) => error ? reject(error) : resolve())); }
  const before = crypto.createHash('sha256').update(await fs.readFile(source)).digest('hex');
  const exported = await exportDatabase({ sqlite: source, output });
  assert.equal(exported.rows, 3);
  const sql = await fs.readFile(output, 'utf8');
  await target.query(sql);
  const company = (await target.query('SELECT id::text,nome,razao_social,ativo,criado_em,atualizado_em FROM public.empresas')).rows[0];
  assert.equal(company.id, '9007199254740993');
  assert.equal(company.nome, textWithSql);
  assert.equal(company.razao_social, '{"texto":"d\u0027Oeste","lista":[1,2]}');
  assert.equal(company.ativo, 1);
  assert.equal(company.criado_em, timestamp);
  assert.equal(company.atualizado_em, timestamp);
  const user = (await target.query('SELECT senha,papel_id::text FROM public.usuarios')).rows[0];
  assert.equal(user.senha, hash);
  assert.equal(user.papel_id, '7');
  assert.equal((await target.query('SELECT permissoes FROM public.papeis_acesso')).rows[0].permissoes, permissions);
  assert.equal((await target.query("INSERT INTO public.empresas (nome) VALUES ('Novo registro de teste') RETURNING id::text")).rows[0].id, '9007199254741000');
  await assert.rejects(target.query(sql), /destino contêm registros/);
  await target.query('ROLLBACK');
  assert.equal((await target.query('SELECT count(*)::int AS total FROM public.empresas')).rows[0].total, 2);
  assert.equal((await target.query('SELECT count(*)::int AS total FROM public.usuarios')).rows[0].total, 1);
  assert.equal(crypto.createHash('sha256').update(await fs.readFile(source)).digest('hex'), before);
});
