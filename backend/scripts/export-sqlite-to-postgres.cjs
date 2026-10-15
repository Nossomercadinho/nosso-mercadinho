#!/usr/bin/env node
'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const sqlite3 = require('sqlite3');

const DEFAULT_CONTRACT = path.resolve(__dirname, '../../supabase/schema-contract.json');
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const DECIMAL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
const INTEGER_LIMITS = {
  SMALLINT: [-32768n, 32767n],
  INTEGER: [-2147483648n, 2147483647n],
  INT: [-2147483648n, 2147483647n],
  BIGINT: [-9223372036854775808n, 9223372036854775807n],
};

function identifier(value) {
  if (!IDENTIFIER.test(value)) throw new Error('Identificador de esquema/tabela/coluna não suportado pelo exportador.');
  return `"${value}"`;
}

function textLiteral(value) {
  const text = String(value);
  if (text.includes('\u0000')) throw new Error('Texto contém caractere NUL, incompatível com PostgreSQL.');
  return `'${text.replaceAll("'", "''")}'`;
}

/** Values are queried as text to avoid truncating SQLite 64-bit integers in JS. */
function valueLiteral(value, sourceType, targetType) {
  if (sourceType === 'null' || value === null) return 'NULL';
  const type = String(targetType || '').toUpperCase().trim();
  const text = String(value);
  if (type === 'BOOLEAN' || type === 'BOOL') {
    if (['1', 'true', 't'].includes(text.toLowerCase())) return 'TRUE';
    if (['0', 'false', 'f'].includes(text.toLowerCase())) return 'FALSE';
    throw new Error('Valor não representa um booleano válido.');
  }
  const integerType = type.match(/^(SMALLINT|INTEGER|INT|BIGINT)\b/)?.[1];
  if (integerType) {
    if (!/^[+-]?\d+$/.test(text)) throw new Error('Valor não representa um inteiro válido.');
    const integer = BigInt(text);
    const [minimum, maximum] = INTEGER_LIMITS[integerType];
    if (integer < minimum || integer > maximum) throw new Error('Inteiro fora da faixa do tipo de destino.');
    return integer.toString();
  }
  if (/^(NUMERIC|DECIMAL|REAL|DOUBLE PRECISION|FLOAT)\b/.test(type)) {
    if (!DECIMAL.test(text)) throw new Error('Valor numérico inválido ou não finito.');
    return text;
  }
  if (sourceType === 'blob') {
    if (type !== 'BYTEA') throw new Error('BLOB exige uma coluna BYTEA no destino.');
    if (!/^(?:[0-9a-f]{2})*$/i.test(text)) throw new Error('BLOB não pôde ser convertido.');
    return `decode('${text}', 'hex')`;
  }
  if (type === 'JSON' || type === 'JSONB') {
    try { JSON.parse(text); } catch { throw new Error('JSON inválido para a coluna de destino.'); }
    return `${textLiteral(text)}::${type.toLowerCase()}`;
  }
  return textLiteral(text);
}

function databaseOpen(filename) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(filename, sqlite3.OPEN_READONLY, (error) => error ? reject(error) : resolve(db));
  });
}
const all = (db, sql, params = []) => new Promise((resolve, reject) => db.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows)));
const exec = (db, sql) => new Promise((resolve, reject) => db.exec(sql, (error) => error ? reject(error) : resolve()));
const close = (db) => new Promise((resolve, reject) => db.close((error) => error ? reject(error) : resolve()));

async function readContract(filename) {
  let contract;
  try { contract = JSON.parse(await fs.readFile(filename, 'utf8')); }
  catch { throw new Error('Não foi possível ler o contrato de esquema. Confira supabase/schema-contract.json ou --contract.'); }
  if (!Array.isArray(contract.tables) || contract.tables.length === 0) throw new Error('O contrato precisa declarar a lista de tabelas do destino.');
  const tableNames = new Set();
  for (const table of contract.tables) {
    identifier(table.name);
    if (tableNames.has(table.name) || !Array.isArray(table.columns) || !table.columns.length) throw new Error('Tabela duplicada ou sem colunas no contrato.');
    tableNames.add(table.name);
    const columnNames = new Set();
    for (const column of table.columns) {
      identifier(column.name);
      if (columnNames.has(column.name) || typeof column.type !== 'string' || !column.type.trim()) throw new Error(`Coluna duplicada ou sem tipo na tabela ${table.name}.`);
      columnNames.add(column.name);
    }
    if (table.identityColumn && !columnNames.has(table.identityColumn)) throw new Error(`Coluna de identidade ausente na tabela ${table.name}.`);
  }
  for (const table of contract.tables) {
    for (const foreignKey of table.foreignKeys || []) {
      identifier(foreignKey.column); identifier(foreignKey.table); identifier(foreignKey.referencedColumn);
      const referenced = contract.tables.find((entry) => entry.name === foreignKey.table);
      if (!table.columns.some((column) => column.name === foreignKey.column) || !referenced?.columns.some((column) => column.name === foreignKey.referencedColumn)) throw new Error(`Chave estrangeira inconsistente no contrato da tabela ${table.name}.`);
    }
  }
  return contract;
}

function qualified(schema, table) { return `${identifier(schema)}.${identifier(table)}`; }

function targetGuard(tables, schema) {
  const names = tables.map((table) => qualified(schema, table.name));
  const checks = tables.map((table) => `    SELECT ${textLiteral(table.name)} AS tabela WHERE EXISTS (SELECT 1 FROM ${qualified(schema, table.name)})`).join('\n    UNION ALL\n');
  return `-- A importação nunca limpa nem mescla um banco que já contém registros.\nLOCK TABLE ${names.join(', ')} IN ACCESS EXCLUSIVE MODE;\nDO $nm_import_guard$\nDECLARE ocupadas TEXT;\nBEGIN\n  SELECT string_agg(tabela, ', ') INTO ocupadas FROM (\n${checks}\n  ) AS destino;\n  IF ocupadas IS NOT NULL THEN\n    RAISE EXCEPTION 'Importação interrompida: tabelas do destino contêm registros (%). Use um banco vazio; nenhum registro foi importado.', ocupadas;\n  END IF;\nEND\n$nm_import_guard$;\n\n`;
}

function resetSequence(table, schema, originalSequence) {
  if (!table.identityColumn) return '';
  const relation = qualified(schema, table.name);
  const column = identifier(table.identityColumn);
  const highWater = /^\d+$/.test(String(originalSequence || '')) ? String(originalSequence) : '0';
  const maximum = `GREATEST(COALESCE((SELECT MAX(${column}) FROM ${relation}), 0), ${highWater})`;
  return `SELECT pg_catalog.setval(pg_catalog.pg_get_serial_sequence(${textLiteral(relation)}, ${textLiteral(table.identityColumn)}), GREATEST(1, ${maximum}), ${maximum} > 0);\n`;
}

async function exportDatabase({ sqlite, output, contract: contractFilename = DEFAULT_CONTRACT, schema = 'public', batchSize = 100 }) {
  if (!sqlite || !output) throw new Error('Informe --sqlite e --output. A exportação não envia dados para stdout.');
  identifier(schema);
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 1000) throw new Error('--batch-size deve estar entre 1 e 1000.');
  const sqlitePath = await fs.realpath(path.resolve(sqlite)).catch(() => { throw new Error('O arquivo SQLite informado não existe.'); });
  if (!(await fs.stat(sqlitePath)).isFile()) throw new Error('A origem precisa ser um arquivo SQLite.');
  const outputPath = path.resolve(output);
  if (sqlitePath.toLowerCase() === outputPath.toLowerCase()) throw new Error('O arquivo de saída deve ser diferente da origem.');
  const contract = await readContract(path.resolve(contractFilename));
  let db;
  let file;
  let outputCreated = false;
  const counts = [];
  try {
    db = await databaseOpen(sqlitePath);
    await exec(db, 'PRAGMA query_only = ON; PRAGMA busy_timeout = 5000; BEGIN;');
    const check = await all(db, 'PRAGMA quick_check');
    if (check.length !== 1 || Object.values(check[0])[0] !== 'ok') throw new Error('A integridade do SQLite não passou em PRAGMA quick_check. Restaure uma cópia consistente antes de exportar.');
    const violations = await all(db, 'PRAGMA foreign_key_check');
    if (violations.length) throw new Error(`A origem contém ${violations.length} violações de chaves estrangeiras. Corrija as referências antes de exportar; nenhum dado foi alterado.`);
    const sourceTables = await all(db, "SELECT name FROM sqlite_master WHERE type = 'table' AND substr(name, 1, 7) <> 'sqlite_' ORDER BY name");
    const sourceNames = new Set(sourceTables.map((table) => table.name));
    const targetNames = new Set(contract.tables.map((table) => table.name));
    const unknown = [...sourceNames].filter((name) => !targetNames.has(name));
    if (unknown.length) throw new Error(`Tabelas da origem não previstas no contrato: ${unknown.join(', ')}. Atualize a migration e o contrato antes de continuar.`);

    const plan = [];
    for (const table of contract.tables) {
      if (!sourceNames.has(table.name)) { counts.push({ table: table.name, rows: 0, absent: true }); continue; }
      const columns = await all(db, `PRAGMA table_info(${identifier(table.name)})`);
      const sourceColumns = new Set(columns.map((column) => column.name));
      const targetColumns = new Map(table.columns.map((column) => [column.name, column]));
      const extraColumns = columns.filter((column) => !targetColumns.has(column.name));
      if (extraColumns.length) throw new Error(`Colunas da origem não previstas no contrato em ${table.name}: ${extraColumns.map((column) => column.name).join(', ')}.`);
      const requiredMissing = table.columns.filter((column) => !sourceColumns.has(column.name) && column.name !== table.identityColumn && column.nullable === false && column.default == null);
      if (requiredMissing.length) throw new Error(`Colunas obrigatórias ausentes na origem em ${table.name}: ${requiredMissing.map((column) => column.name).join(', ')}. Atualize a estrutura SQLite antes de exportar.`);
      const count = (await all(db, `SELECT COUNT(*) AS total FROM ${identifier(table.name)}`))[0].total;
      if (!Number.isSafeInteger(count)) throw new Error(`Quantidade de registros não suportada na tabela ${table.name}.`);
      const primaryKey = columns.filter((column) => column.pk > 0).sort((a, b) => a.pk - b.pk).map((column) => identifier(column.name));
      plan.push({ table, columns, targetColumns, count, primaryKey });
    }
    // Some legacy SQLite columns were added without REFERENCES. Validate the
    // destination contract as well as PRAGMA foreign_key_check before exporting.
    const sourceColumnByTable = new Map(plan.map((entry) => [entry.table.name, new Set(entry.columns.map((column) => column.name))]));
    for (const { table } of plan) {
      for (const foreignKey of table.foreignKeys || []) {
        if (!sourceColumnByTable.get(table.name).has(foreignKey.column)) continue;
        const child = identifier(foreignKey.column);
        const parentExists = sourceColumnByTable.get(foreignKey.table)?.has(foreignKey.referencedColumn);
        const missing = parentExists ? ` AND NOT EXISTS (SELECT 1 FROM ${identifier(foreignKey.table)} AS p WHERE p.${identifier(foreignKey.referencedColumn)} = c.${child})` : '';
        const invalid = (await all(db, `SELECT COUNT(*) AS total FROM ${identifier(table.name)} AS c WHERE c.${child} IS NOT NULL${missing}`))[0].total;
        if (invalid) throw new Error(`A origem contém ${invalid} referências inválidas para a chave da migration ${table.name}.${foreignKey.column} → ${foreignKey.table}.${foreignKey.referencedColumn}. Corrija as referências antes de exportar.`);
      }
    }
    const sequenceTable = await all(db, "SELECT name FROM sqlite_master WHERE name = 'sqlite_sequence'");
    const sequences = sequenceTable.length ? await all(db, 'SELECT name, CAST(seq AS TEXT) AS seq FROM sqlite_sequence') : [];
    const sequenceByTable = new Map(sequences.map((row) => [row.name, row.seq]));
    await fs.mkdir(path.dirname(outputPath), { recursive: true, mode: 0o700 });
    try { file = await fs.open(outputPath, 'wx', 0o600); outputCreated = true; }
    catch (error) { if (error.code === 'EEXIST') throw new Error('O arquivo de saída já existe. Escolha outro nome; o exportador não sobrescreve arquivos.'); throw error; }
    const write = (content) => file.writeFile(content, 'utf8');
    await write(`-- Nosso Mercadinho: dados SQLite para PostgreSQL.\n-- Arquivo privado: contém cadastros, histórico e hashes de senha.\n-- Aplique somente após as migrations, em destino vazio, com ON_ERROR_STOP.\nBEGIN;\nSET LOCAL standard_conforming_strings = on;\nSET LOCAL client_encoding = 'UTF8';\nSET LOCAL TIME ZONE 'UTC';\nSET LOCAL lock_timeout = '10s';\nSET CONSTRAINTS ALL DEFERRED;\n\n${targetGuard(contract.tables, schema)}`);
    for (const entry of plan) {
      const { table, columns, targetColumns, count, primaryKey } = entry;
      const columnList = columns.map((column) => identifier(column.name)).join(', ');
      const expressions = columns.flatMap((column, index) => {
        const name = identifier(column.name);
        return [`CASE typeof(${name}) WHEN 'integer' THEN CAST(${name} AS TEXT) WHEN 'real' THEN printf('%!.17g', ${name}) WHEN 'blob' THEN hex(${name}) ELSE ${name} END AS "nm_value_${index}"`, `typeof(${name}) AS "nm_type_${index}"`];
      }).join(', ');
      const ordering = primaryKey.length ? ` ORDER BY ${primaryKey.join(', ')}` : '';
      await write(`-- Tabela ${table.name}: ${count} registro(s).\n`);
      for (let offset = 0; offset < count; offset += batchSize) {
        const rows = await all(db, `SELECT ${expressions} FROM ${identifier(table.name)}${ordering} LIMIT ? OFFSET ?`, [batchSize, offset]);
        for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
          const row = rows[rowIndex];
          const values = columns.map((column, index) => {
            try { return valueLiteral(row[`nm_value_${index}`], row[`nm_type_${index}`], targetColumns.get(column.name).type); }
            catch (error) { throw new Error(`Tabela ${table.name}, linha ${offset + rowIndex + 1}, coluna ${column.name}: ${error.message}`); }
          });
          await write(`INSERT INTO ${qualified(schema, table.name)} (${columnList}) VALUES (${values.join(', ')});\n`);
        }
      }
      counts.push({ table: table.name, rows: count, absent: false });
      await write('\n');
    }
    await write('-- Valida referências antes de ajustar identidades.\nSET CONSTRAINTS ALL IMMEDIATE;\n\n');
    for (const table of contract.tables) await write(resetSequence(table, schema, sequenceByTable.get(table.name)));
    await write('\nCOMMIT;\n-- Exportação completa.\n');
    await file.sync();
    await file.close(); file = null;
    await exec(db, 'ROLLBACK;');
    await close(db); db = null;
    return { output: outputPath, tables: counts, rows: counts.reduce((total, table) => total + table.rows, 0) };
  } catch (error) {
    if (file) await file.close().catch(() => {});
    if (db) { await exec(db, 'ROLLBACK;').catch(() => {}); await close(db).catch(() => {}); }
    if (outputCreated) await fs.unlink(outputPath).catch(() => {});
    throw error;
  }
}

function argumentsFrom(argv) {
  const options = {};
  const names = { '--sqlite': 'sqlite', '--output': 'output', '--contract': 'contract', '--schema': 'schema', '--batch-size': 'batchSize' };
  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index];
    if (flag === '--help' || flag === '-h') return { help: true };
    if (!names[flag] || !argv[index + 1] || argv[index + 1].startsWith('--')) throw new Error('Opção inválida ou sem valor. Use --help.');
    if (Object.hasOwn(options, names[flag])) throw new Error(`Opção repetida: ${flag}.`);
    options[names[flag]] = flag === '--batch-size' ? Number(argv[++index]) : argv[++index];
  }
  return options;
}

async function main() {
  const options = argumentsFrom(process.argv.slice(2));
  if (options.help) {
    console.log('Uso: node scripts/export-sqlite-to-postgres.cjs --sqlite <origem.db> --output <dados.sql> [--schema public] [--contract <contrato.json>] [--batch-size 100]\nLê uma transação SQLite em modo somente leitura. Não conecta ao PostgreSQL, não aplica migrations e não sobrescreve a saída.');
    return;
  }
  const result = await exportDatabase(options);
  console.log(`Exportação concluída: ${result.tables.filter((table) => !table.absent).length} tabelas, ${result.rows} registros.\nSQL privado salvo em: ${result.output}\nA origem não foi alterada. Nenhuma conexão remota foi realizada.`);
}

if (require.main === module) main().catch((error) => { console.error(`Exportação interrompida: ${error.message}`); process.exitCode = 1; });
module.exports = { exportDatabase, valueLiteral, textLiteral, resetSequence, argumentsFrom };
