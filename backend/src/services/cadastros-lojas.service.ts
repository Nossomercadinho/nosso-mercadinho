import db from '../database/database';
import { contextoLojas, escopoLojaSql, obterLojaAtivaId } from './escopo-lojas.service';
export const executarCadastro = (sql: string, params: any[] = []) => new Promise<{
    lastID: number;
    changes: number;
}>((resolve, reject) => {
    db.run(sql, params, function (error) { error ? reject(error) : resolve({ lastID: this.lastID, changes: this.changes }); });
});
export const consultarCadastro = <T = any>(sql: string, params: any[] = []) => new Promise<T | undefined>((resolve, reject) => {
    db.get(sql, params, (error, row) => error ? reject(error) : resolve(row as T | undefined));
});
export const listarCadastro = <T = any>(sql: string, params: any[] = []) => new Promise<T[]>((resolve, reject) => {
    db.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows as T[]));
});
let estrutura: Promise<void> | undefined;
export function garantirVinculosCadastros() {
    if (!estrutura)
        estrutura = preparar().catch(error => { estrutura = undefined; throw error; });
    return estrutura;
}
async function preparar() {
    await executarCadastro(`CREATE TABLE IF NOT EXISTS clientes (id INTEGER PRIMARY KEY AUTOINCREMENT,nome TEXT NOT NULL,
    cpf TEXT NOT NULL UNIQUE,telefone TEXT NOT NULL,limite_credito REAL NOT NULL DEFAULT 0,ativo INTEGER NOT NULL DEFAULT 1,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    await executarCadastro(`CREATE TABLE IF NOT EXISTS clientes_lojas (cliente_id INTEGER NOT NULL REFERENCES clientes(id),
    loja_id INTEGER NOT NULL REFERENCES lojas(id), criado_em TEXT DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(cliente_id,loja_id))`);
    await executarCadastro(`CREATE TABLE IF NOT EXISTS fornecedores_lojas (fornecedor_id INTEGER NOT NULL REFERENCES fornecedores(id),
    loja_id INTEGER NOT NULL REFERENCES lojas(id),ativo INTEGER NOT NULL DEFAULT 1,dados_json TEXT,
    criado_em TEXT DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(fornecedor_id,loja_id))`);
    await executarCadastro(`CREATE TABLE IF NOT EXISTS fornecedor_produtos_lojas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,fornecedor_id INTEGER NOT NULL REFERENCES fornecedores(id),
    produto_id INTEGER NOT NULL REFERENCES produtos(id),loja_id INTEGER NOT NULL REFERENCES lojas(id),codigo_produto_fornecedor TEXT,
    ultimo_custo REAL DEFAULT 0,menor_custo REAL DEFAULT 0,maior_custo REAL DEFAULT 0,custo_medio REAL DEFAULT 0,
    quantidade_comprada REAL DEFAULT 0,ultima_compra_em TEXT,criado_em TEXT DEFAULT CURRENT_TIMESTAMP,atualizado_em TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(fornecedor_id,produto_id,loja_id))`);
    const historico = await listarCadastro<any>('PRAGMA table_info(fornecedor_precos_historico)');
    if (!historico.some(c => c.name === 'loja_id'))
        await executarCadastro('ALTER TABLE fornecedor_precos_historico ADD COLUMN loja_id INTEGER REFERENCES lojas(id)');
    await executarCadastro('CREATE TABLE IF NOT EXISTS migracoes_cadastros_lojas (chave TEXT PRIMARY KEY)');
    if (!await consultarCadastro("SELECT chave FROM migracoes_cadastros_lojas WHERE chave = 'v1'")) {
        await executarCadastro(`INSERT OR IGNORE INTO clientes_lojas(cliente_id,loja_id)
      SELECT DISTINCT v.cliente_id,v.loja_id FROM vendas v WHERE v.cliente_id IS NOT NULL`)
            .catch(async (error) => { if (!String(error.message).includes('no such column'))
            throw error; });
        await executarCadastro(`INSERT OR IGNORE INTO clientes_lojas(cliente_id,loja_id)
      SELECT c.id,1 FROM clientes c WHERE EXISTS(SELECT 1 FROM lojas WHERE id=1)
      AND NOT EXISTS(SELECT 1 FROM clientes_lojas cl WHERE cl.cliente_id=c.id)`);
        await executarCadastro(`INSERT OR IGNORE INTO fornecedores_lojas(fornecedor_id,loja_id,ativo)
      SELECT DISTINCT f.id,n.loja_id,COALESCE(f.ativo,1) FROM fornecedores f JOIN notas_entrada n ON n.fornecedor_id=f.id WHERE n.loja_id IS NOT NULL`);
        await executarCadastro(`INSERT OR IGNORE INTO fornecedores_lojas(fornecedor_id,loja_id,ativo)
      SELECT DISTINCT f.id,l.loja_id,COALESCE(f.ativo,1) FROM fornecedores f JOIN financeiro_lancamentos l ON l.fornecedor_id=f.id WHERE l.loja_id IS NOT NULL`);
        await executarCadastro(`INSERT OR IGNORE INTO fornecedores_lojas(fornecedor_id,loja_id,ativo)
      SELECT f.id,1,COALESCE(f.ativo,1) FROM fornecedores f WHERE EXISTS(SELECT 1 FROM lojas WHERE id=1)
      AND NOT EXISTS(SELECT 1 FROM fornecedores_lojas fl WHERE fl.fornecedor_id=f.id)`);
        await executarCadastro('UPDATE fornecedor_precos_historico SET loja_id = 1 WHERE loja_id IS NULL AND EXISTS(SELECT 1 FROM lojas WHERE id=1)');
        await executarCadastro(`INSERT OR IGNORE INTO fornecedor_produtos_lojas(fornecedor_id,produto_id,loja_id,codigo_produto_fornecedor,
      ultimo_custo,menor_custo,maior_custo,custo_medio,quantidade_comprada,ultima_compra_em,criado_em,atualizado_em)
      SELECT fornecedor_id,produto_id,1,codigo_produto_fornecedor,ultimo_custo,menor_custo,maior_custo,custo_medio,
      quantidade_comprada,ultima_compra_em,criado_em,atualizado_em FROM fornecedor_produtos WHERE EXISTS(SELECT 1 FROM lojas WHERE id=1)`);
        await executarCadastro("INSERT OR IGNORE INTO migracoes_cadastros_lojas(chave) VALUES ('v1')");
    }
}
export function lojaCadastroAtual(explicita?: number) {
    const ativa = obterLojaAtivaId();
    const contexto = contextoLojas.getStore();
    if (ativa) {
        if (explicita && explicita !== ativa)
            throw new Error('O cadastro deve pertencer ao mercado ativo.');
        return ativa;
    }
    if (explicita && (!contexto || contexto.lojaIds.includes(explicita)))
        return explicita;
    if (contexto?.lojaIds.length === 1)
        return contexto.lojaIds[0];
    if (!contexto)
        return 1;
    throw new Error('Selecione o mercado ativo antes de cadastrar.');
}
export function cadastroVisivelSql(tipo: 'cliente' | 'fornecedor', colunaId: string) {
    const tabela = tipo === 'cliente' ? 'clientes_lojas' : 'fornecedores_lojas';
    return `EXISTS(SELECT 1 FROM ${tabela} vinculo_ativo WHERE vinculo_ativo.${tipo}_id = ${colunaId} AND ${escopoLojaSql('vinculo_ativo.loja_id')})`;
}
export async function exigirCadastroNaLoja(tipo: 'cliente' | 'fornecedor', id: number, lojaId = lojaCadastroAtual()) {
    await garantirVinculosCadastros();
    const tabela = tipo === 'cliente' ? 'clientes_lojas' : 'fornecedores_lojas';
    const vinculo = await consultarCadastro(`SELECT 1 FROM ${tabela} WHERE ${tipo}_id = ? AND loja_id = ?`, [id, lojaId]);
    if (!vinculo)
        throw new Error(`${tipo === 'cliente' ? 'Cliente' : 'Fornecedor'} não cadastrado neste mercado.`);
}
export async function vincularCadastroNaLoja(tipo: 'cliente' | 'fornecedor', id: number, lojaId = lojaCadastroAtual()) {
    await garantirVinculosCadastros();
    const tabela = tipo === 'cliente' ? 'clientes_lojas' : 'fornecedores_lojas';
    await executarCadastro(`INSERT OR IGNORE INTO ${tabela} (${tipo}_id,loja_id) VALUES (?,?)`, [id, lojaId]);
}
