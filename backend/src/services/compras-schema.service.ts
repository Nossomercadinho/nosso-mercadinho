import db from '../database/database';
let preparando: Promise<void> | undefined;
export function prepararCustoReal() {
  if (!preparando) preparando = (async () => {
    await new Promise<void>((resolve,reject)=>db.run(`CREATE TABLE IF NOT EXISTS compras_conferencias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  loja_id INTEGER NOT NULL REFERENCES lojas(id),
  local_estoque_id INTEGER REFERENCES locais_estoque(id),
  usuario_criacao_id INTEGER NOT NULL REFERENCES usuarios(id),
  usuario_confirmacao_id INTEGER REFERENCES usuarios(id),
  nota_entrada_id INTEGER REFERENCES notas_entrada(id),
  identificador TEXT NOT NULL,
  origem TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'RASCUNHO',
  versao INTEGER NOT NULL DEFAULT 1,
  estado_json TEXT NOT NULL,
  original_json TEXT NOT NULL,
  criado_em TEXT DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TEXT,
  confirmado_em TEXT,
  UNIQUE(identificador),
  UNIQUE(nota_entrada_id),
  CHECK(status IN ('RASCUNHO','CONFIRMADA'))
)`,error=>error?reject(error):resolve()));
    await new Promise<void>((resolve,reject)=>db.run(`CREATE TABLE IF NOT EXISTS compras_documentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conferencia_id INTEGER NOT NULL REFERENCES compras_conferencias(id),
  nome TEXT NOT NULL,
  mime TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  conteudo_base64 TEXT NOT NULL,
  criado_em TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(conferencia_id,sha256)
)`,error=>error?reject(error):resolve()));
    await new Promise<void>((resolve,reject)=>db.run(`CREATE TABLE IF NOT EXISTS compras_embalagens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  loja_id INTEGER NOT NULL REFERENCES lojas(id),
  fornecedor_id INTEGER NOT NULL REFERENCES fornecedores(id),
  produto_id INTEGER NOT NULL REFERENCES produtos(id),
  codigo_fornecedor TEXT,
  unidades_embalagem REAL NOT NULL,
  criado_em TEXT DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TEXT,
  UNIQUE(loja_id,fornecedor_id,produto_id),
  CHECK(unidades_embalagem > 0)
)`,error=>error?reject(error):resolve()));
    await new Promise<void>((resolve,reject)=>db.run(`CREATE TABLE IF NOT EXISTS compras_custos_historico (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  loja_id INTEGER NOT NULL REFERENCES lojas(id),
  produto_id INTEGER REFERENCES produtos(id),
  fornecedor_id INTEGER REFERENCES fornecedores(id),
  conferencia_id INTEGER REFERENCES compras_conferencias(id),
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  origem TEXT NOT NULL,
  custo_anterior TEXT,
  custo_novo TEXT,
  quantidade TEXT,
  componentes_json TEXT NOT NULL,
  justificativa TEXT,
  criado_em TEXT DEFAULT CURRENT_TIMESTAMP
)`,error=>error?reject(error):resolve()));
  })().catch(error=>{preparando=undefined;throw error;});
  return preparando;
}
