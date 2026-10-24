const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const contract = JSON.parse(fs.readFileSync(path.join(root, 'supabase/schema-contract.json'), 'utf8'));
const baseline = fs.readdirSync(path.join(root, 'supabase/migrations')).filter(f=>f.endsWith('.sql')).sort().map(f=>fs.readFileSync(path.join(root,'supabase/migrations',f),'utf8')).join('\n');
const security = baseline;
const seed = fs.readFileSync(path.join(root, 'supabase/seed.sql'), 'utf8');
const config = fs.readFileSync(path.join(root, 'supabase/config.toml'), 'utf8');

function closingParenthesis(source, start) {
  let depth = 0;
  let quote;
  for (let i = start; i < source.length; i++) {
    const c = source[i];
    if (quote) {
      if (c === quote) { if (source[i + 1] === quote) i++; else quote = undefined; }
    } else if (c === "'" || c === '"') quote = c;
    else if (c === '(') depth++;
    else if (c === ')' && --depth === 0) return i;
  }
  throw new Error('SQL table definition is incomplete.');
}

test('contrato PostgreSQL contém as tabelas e colunas criadas pelo runtime SQLite', () => {
  const files = [
    'src/database/sqlite.ts', 'src/services/acessos.service.ts',
    'src/services/caixas.service.ts', 'src/services/catalogo-lojas.service.ts',
    'src/services/cadastros-lojas.service.ts', 'src/services/compras-schema.service.ts', 'src/services/clientes-prazo.service.ts',
    'src/services/fechamento-diario.service.ts', 'src/services/financeiro.service.ts',
    'src/services/vendas.service.ts', 'src/services/nfe.service.ts',
    'src/routes/vendas-gestao.routes.ts',
  ];
  const tables = new Map(contract.tables.map(t => [t.name, t]));
  const discovered = new Set();
  for (const file of files) {
    const source = fs.readFileSync(path.join(root, 'backend', file), 'utf8');
    const re = /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+(\w+)\s*\(/gi;
    let match;
    while ((match = re.exec(source))) {
      const name = match[1];
      const end = closingParenthesis(source, re.lastIndex - 1);
      const definition = source.slice(re.lastIndex, end);
      const table = tables.get(name);
      assert.ok(table, `${file}: tabela ${name} não está na migration PostgreSQL.`);
      discovered.add(name);
      for (const column of definition.matchAll(/\b(\w+)\s+(INTEGER|REAL|TEXT|DATETIME)\b/gi)) {
        assert.ok(table.columns.some(c => c.name === column[1]), `${file}: coluna ${name}.${column[1]} ausente no PostgreSQL.`);
      }
      re.lastIndex = end + 1;
    }
    for (const alter of source.matchAll(/ALTER\s+TABLE\s+(\w+)\s+ADD\s+COLUMN\s+(\w+)\s+(INTEGER|REAL|TEXT|DATETIME)\b/gi)) {
      assert.ok(tables.get(alter[1])?.columns.some(c => c.name === alter[2]), `${file}: ALTER ${alter[1]}.${alter[2]} sem migration PostgreSQL.`);
    }
  }
  assert.equal(discovered.size, contract.tables.length);
});

test('schema preserva identidades, códigos, flags e isolamento da Data API', () => {
  assert.equal(contract.tables.length, 42);
  assert.equal(contract.tables.reduce((n, t) => n + t.columns.length, 0), 474);
  assert.equal(contract.tables.reduce((n, t) => n + t.foreignKeys.length, 0), 104);
  const created = new Set();
  for (const table of contract.tables) {
    assert.ok(baseline.includes(`CREATE TABLE IF NOT EXISTS public."${table.name}"`));
    assert.ok(baseline.includes(`ALTER TABLE public."${table.name}" ENABLE ROW LEVEL SECURITY;`), `Baseline isolado não protege ${table.name}.`);
    assert.ok(security.includes(`'${table.name}'`), `RLS/grants não abrangem ${table.name}.`);
    for (const foreign of table.foreignKeys) assert.ok(created.has(foreign.table) || foreign.table === table.name, `Ordem de importação incorreta: ${table.name} antes de ${foreign.table}.`);
    created.add(table.name);
    if (table.identityColumn) assert.equal(table.columns.find(c => c.name === table.identityColumn).type, 'bigint');
    for (const column of table.columns) {
      if (['ativo', 'sistema', 'acesso_todas_lojas', 'permite_venda', 'precos_personalizados'].includes(column.name)) assert.equal(column.type, 'integer');
      if (/^(ean|cpf|cpf_cnpj|cnpj|cep|ncm|cest|xml)$|_json$|_em$|^data_/.test(column.name)) assert.equal(column.type, 'text', `${table.name}.${column.name} perderia sua representação original.`);
    }
  }
  assert.equal((baseline.match(/DEFERRABLE INITIALLY DEFERRED/g) || []).length, 104);
  assert.match(security, /ENABLE ROW LEVEL SECURITY/);
  assert.match(security, /REVOKE ALL PRIVILEGES ON TABLE public\.%I FROM PUBLIC/);
  assert.match(security, /'anon', 'authenticated', 'service_role'/);
  assert.doesNotMatch(baseline, /REFERENCES\s+auth\.users|auth\.uid\s*\(/i);
  assert.doesNotMatch(seed, /INSERT\s+INTO\s+(?:public\.)?"?usuarios\b/i);
  assert.doesNotMatch(baseline, /INSERT\s+INTO/i, 'A migration estrutural precisa permanecer vazia para importação completa.');
  assert.match(config, /\[api\]\s*enabled\s*=\s*false\b/, 'A configuração local deve manter a aplicação na API Express.');
  assert.match(config, /\[db\.seed\]\s*enabled\s*=\s*false\b/, 'O seed opcional não pode rodar automaticamente antes da importação.');
});
