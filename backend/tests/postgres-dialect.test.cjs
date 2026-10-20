const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
process.env.TS_NODE_PROJECT=path.resolve(__dirname,'../tsconfig.json');
require('ts-node/register/transpile-only');
const {postgresSql}=require('../src/database/sql-dialect.ts');
const {postgresConfig}=require('../src/database/postgres.ts');
const ConnectionParameters=require('pg/lib/connection-parameters');

test('dialeto preserva strings/comentários e numera somente parâmetros reais',()=>{
  const sql="SELECT 'foo COLLATE NOCASE ? sqlite_master BEGIN IMMEDIATE TRANSACTION' AS texto, ? AS nomeUsuario -- ? COLLATE NOCASE sqlite_master\n FROM sqlite_master WHERE name = ?";
  const translated=postgresSql(sql);
  assert.ok(translated.includes("'foo COLLATE NOCASE ? sqlite_master BEGIN IMMEDIATE TRANSACTION'"));
  assert.ok(translated.includes('-- ? COLLATE NOCASE sqlite_master'));
  assert.ok(translated.includes('$1 AS "nomeUsuario"'));assert.ok(translated.includes('name = $2'));
  assert.ok(translated.includes('pg_catalog.pg_tables'));
});
test('dialeto traduz busca, agregação, datas e upserts usados pela aplicação',()=>{
  assert.match(postgresSql('SELECT MAX(0, SUM(valor)) AS limiteDisponivel FROM contas GROUP BY cliente_id'),/GREATEST\(0,SUM\(valor\)\) AS "limiteDisponivel"/);
  assert.match(postgresSql('SELECT GROUP_CONCAT(DISTINCT forma) FROM pagamentos'),/STRING_AGG\(DISTINCT \(forma\)::text,','\)/);
  assert.match(postgresSql('SELECT nome FROM papeis_acesso WHERE nome = ? COLLATE NOCASE ORDER BY nome COLLATE NOCASE'),/LOWER\(nome::text\) = LOWER\(\$1::text\) ORDER BY LOWER\(nome::text\)/);
  assert.match(postgresSql("SELECT date(criado_em,'localtime') >= date(?)"),/America\/Sao_Paulo/);
  assert.equal(postgresSql('BEGIN IMMEDIATE TRANSACTION'),'BEGIN');
  assert.equal(postgresSql('INSERT OR IGNORE INTO vinculo(a,b) VALUES (?,?)'),'INSERT INTO vinculo(a,b) VALUES ($1,$2) ON CONFLICT DO NOTHING');
});
test('configuração PostgreSQL verifica TLS e não permite URI desativar a verificação',()=>{
  const env={DATABASE_URL:process.env.DATABASE_URL,PG_SSL:process.env.PG_SSL,PG_SSL_CA:process.env.PG_SSL_CA,PG_SSL_CA_FILE:process.env.PG_SSL_CA_FILE,NODE_ENV:process.env.NODE_ENV};
  try{
    process.env.DATABASE_URL='postgresql://user:secret@example.supabase.co:5432/postgres?ssl=0&sslmode=no-verify&sslrootcert=ignored&options=bad';process.env.PG_SSL='require';delete process.env.PG_SSL_CA;delete process.env.PG_SSL_CA_FILE;
    const config=postgresConfig();assert.equal(config.ssl.rejectUnauthorized,true);assert.ok(!config.connectionString.includes('sslmode'));assert.ok(!config.connectionString.includes('sslrootcert'));
    assert.equal(new ConnectionParameters(config).ssl.rejectUnauthorized,true);assert.equal(new ConnectionParameters(config).options,'-c timezone=UTC -c search_path=public,pg_catalog');
    process.env.PG_SSL='disable';assert.throws(()=>postgresConfig(),/somente/);
    process.env.DATABASE_URL='postgresql://user:secret@127.0.0.1:5432/mercadinho_test';process.env.NODE_ENV='test';assert.equal(postgresConfig().ssl,false);
    process.env.NODE_ENV='production';assert.throws(()=>postgresConfig(),/somente/);
    process.env.DATABASE_URL='segredo inválido';assert.throws(()=>postgresConfig(),e=>!String(e).includes('segredo')&&!('input' in e));
  }finally{for(const [key,value]of Object.entries(env)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});

test('certificado por variável funciona sem arquivo local e mantém a verificação TLS',()=>{
  const keys=['DATABASE_URL','PG_SSL','PG_SSL_CA','PG_SSL_CA_FILE'];
  const previous=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
  try{
    process.env.DATABASE_URL='postgresql://user:secret@example.supabase.co:5432/postgres';
    process.env.PG_SSL='require';
    process.env.PG_SSL_CA_FILE=path.join(__dirname,'arquivo-ca-inexistente.pem');
    const pem='-----BEGIN CERTIFICATE-----\nTEST-CA\n-----END CERTIFICATE-----\n';
    for(const supplied of [pem,pem.replace(/\n/g,'\\n')]){
      process.env.PG_SSL_CA=supplied;
      const config=postgresConfig();
      assert.equal(config.ssl.ca,pem);
      assert.equal(config.ssl.rejectUnauthorized,true);
      assert.equal(new ConnectionParameters(config).ssl.rejectUnauthorized,true);
    }
  }finally{for(const [key,value]of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});
