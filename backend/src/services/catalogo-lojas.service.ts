import db from '../database/database';
import { UsuarioAcesso, lojaPermitida } from './acessos.service';
import { comBloqueioBanco, transacaoCaixa } from './caixas.service';

export class ErroCatalogo extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
function run(sql: string, values: any[] = []) {
  return new Promise<{ lastID: number; changes: number }>((resolve, reject) => db.run(sql, values, function (error) { error ? reject(error) : resolve({ lastID: this.lastID, changes: this.changes }); }));
}
function all<T = any>(sql: string, values: any[] = []): Promise<T[]> {
  return new Promise((resolve, reject) => db.all(sql, values, (error, rows) => error ? reject(error) : resolve(rows as T[])));
}
async function get(sql: string, values: any[] = []) { return (await all(sql, values))[0]; }

let estruturaPrecos: Promise<void> | undefined;
export function garantirPrecosCatalogoLoja(): Promise<void> {
  if (!estruturaPrecos) estruturaPrecos = comBloqueioBanco(async () => {
    const colunas = await all<{name:string}>('PRAGMA table_info(produtos_lojas)');
    if (!colunas.some(c => c.name === 'precos_personalizados')) await run('ALTER TABLE produtos_lojas ADD COLUMN precos_personalizados INTEGER NOT NULL DEFAULT 0');
    if (!colunas.some(c => c.name === 'preco_custo')) await run('ALTER TABLE produtos_lojas ADD COLUMN preco_custo REAL');
  }).catch(error => { estruturaPrecos = undefined; throw error; });
  return estruturaPrecos;
}

export function lojaDoCatalogo(usuario: UsuarioAcesso, ativa?: number, explicita?: unknown) {
  const id = Number(ativa ?? explicita ?? (usuario.lojaIds.length === 1 ? usuario.lojaIds[0] : usuario.acessoTodasLojas && usuario.lojaIds.includes(1) ? 1 : 0));
  if (!Number.isSafeInteger(id) || id <= 0) throw new ErroCatalogo('Selecione o mercado para administrar os produtos.');
  if (!lojaPermitida(usuario, id)) throw new ErroCatalogo('Você não tem acesso a este mercado.', 403);
  return id;
}
function numero(value: unknown, rotulo: string, padrao = 0) {
  const n = value == null || value === '' ? padrao : Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 999999999.99) throw new ErroCatalogo(`Informe ${rotulo} válido, maior ou igual a zero.`);
  return n;
}
function dadosCentrais(body: any, atual: any = {}) {
  const ean = String(body.ean ?? atual.ean ?? '').replace(/\D/g, '');
  const nome = String(body.nome ?? atual.nome ?? '').trim();
  if (!ean) throw new ErroCatalogo('EAN é obrigatório.');
  if (!nome) throw new ErroCatalogo('Nome do produto é obrigatório.');
  return {
    ean, nome,
    marca: String(body.marca ?? atual.marca ?? ''), foto: String(body.foto ?? atual.foto ?? ''),
    categoria: String(body.categoria ?? atual.categoria ?? ''), fornecedor: String(body.fornecedor ?? atual.fornecedor ?? ''),
    precoCusto: numero(body.precoCusto ?? atual.preco_custo, 'um preço de custo'),
    precoVenda: numero(body.precoVenda ?? atual.preco_venda, 'um preço de venda'),
    estoqueMinimo: numero(body.estoqueMinimo ?? atual.estoque_minimo, 'um estoque mínimo'),
    unidadeMedida: String(body.unidadeMedida ?? atual.unidade_medida ?? ''),
    ncm: String(body.ncm ?? atual.ncm ?? '').replace(/\D/g, ''),
    cest: String(body.cest ?? atual.cest ?? ''), descricaoNcm: String(body.descricaoNcm ?? atual.descricao_ncm ?? ''),
  };
}
async function localDeVenda(lojaId: number) {
  const local = await get(`SELECT le.id FROM locais_estoque le JOIN lojas l ON l.id = le.loja_id
    WHERE le.loja_id = ? AND le.ativo = 1 AND le.permite_venda = 1 AND l.ativo = 1
    ORDER BY CASE WHEN le.tipo = 'VENDA' THEN 0 ELSE 1 END, le.id LIMIT 1`, [lojaId]);
  if (!local) throw new ErroCatalogo('Este mercado não possui local ativo para venda. Cadastre a área de venda antes de adicionar produtos.');
  return Number(local.id);
}
async function vincular(produtoId: number, lojaId: number, localId: number, preco: number, minimo: number, quantidade = 0, custo = 0) {
  await run(`INSERT INTO produtos_lojas (produto_id,loja_id,preco_venda,estoque_minimo,preco_custo,precos_personalizados,ativo) VALUES (?,?,?,?,?,1,1)
    ON CONFLICT(produto_id,loja_id) DO UPDATE SET preco_venda=excluded.preco_venda,estoque_minimo=excluded.estoque_minimo,preco_custo=excluded.preco_custo,precos_personalizados=1,ativo=1,atualizado_em=CURRENT_TIMESTAMP`, [produtoId, lojaId, preco, minimo,custo]);
  await run(`INSERT INTO estoque_saldos (produto_id,loja_id,local_id,quantidade,custo_medio) VALUES (?,?,?,?,?)
    ON CONFLICT(produto_id,loja_id,local_id) DO NOTHING`, [produtoId, lojaId, localId, quantidade, custo]);
}
export async function listarCatalogoLoja(lojaId: number) {
  await garantirPrecosCatalogoLoja();
  return all(`SELECT p.*, CASE WHEN pl.precos_personalizados=1 OR pl.preco_venda<>0 THEN pl.preco_venda ELSE p.preco_venda END AS preco_venda, pl.estoque_minimo AS estoque_minimo,
    COALESCE((SELECT SUM(es.quantidade) FROM estoque_saldos es WHERE es.produto_id=p.id AND es.loja_id=pl.loja_id),0) AS estoque,
    COALESCE((SELECT SUM(es.quantidade) FROM estoque_saldos es WHERE es.produto_id=p.id AND es.loja_id=pl.loja_id),0) AS quantidade,
    COALESCE(NULLIF((SELECT CASE WHEN SUM(es.quantidade)>0 THEN SUM(es.quantidade*es.custo_medio)/SUM(es.quantidade) ELSE AVG(es.custo_medio) END
      FROM estoque_saldos es WHERE es.produto_id=p.id AND es.loja_id=pl.loja_id),0),pl.preco_custo,p.preco_custo,0) AS preco_custo,
    pl.loja_id FROM produtos p JOIN produtos_lojas pl ON pl.produto_id=p.id
    WHERE pl.loja_id=? AND pl.ativo=1 AND p.ativo=1 ORDER BY p.nome COLLATE NOCASE`, [lojaId]);
}
export async function criarProdutoNaLoja(lojaId: number, body: any) {
  await garantirPrecosCatalogoLoja();
  const dados = dadosCentrais(body);
  const quantidade = numero(body.estoqueInicial, 'um estoque inicial');
  return transacaoCaixa(async () => {
    const localId = await localDeVenda(lojaId);
    const atual = await get('SELECT * FROM produtos WHERE ean = ?', [dados.ean]);
    if (atual?.ativo === 1) throw new ErroCatalogo('Este EAN já está cadastrado. Adicione o produto existente pelo catálogo geral.', 409);
    const values = [dados.ean,dados.nome,dados.marca,dados.foto,dados.categoria,dados.fornecedor,dados.precoCusto,dados.precoVenda,0,dados.estoqueMinimo,dados.unidadeMedida,dados.ncm,dados.cest,dados.descricaoNcm];
    let produtoId: number;
    if (atual) {
      await run(`UPDATE produtos SET ean=?,nome=?,marca=?,foto=?,categoria=?,fornecedor=?,preco_custo=?,preco_venda=?,estoque=?,estoque_minimo=?,unidade_medida=?,ncm=?,cest=?,descricao_ncm=?,ativo=1,atualizado_em=CURRENT_TIMESTAMP WHERE id=?`, [...values,atual.id]);
      produtoId = atual.id;
    } else {
      produtoId = (await run('INSERT INTO produtos (ean,nome,marca,foto,categoria,fornecedor,preco_custo,preco_venda,estoque,estoque_minimo,unidade_medida,ncm,cest,descricao_ncm) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)', values)).lastID;
    }
    await vincular(produtoId, lojaId, localId, dados.precoVenda, dados.estoqueMinimo, quantidade, dados.precoCusto);
    return { id: produtoId, reativado: !!atual, lojaId };
  });
}
export async function integrarProdutoNaLoja(lojaId: number, produtoId: number, body: any) {
  await garantirPrecosCatalogoLoja();
  return transacaoCaixa(async () => {
    const produto = await get(`SELECT p.*,pl.preco_venda AS preco_loja,pl.estoque_minimo AS minimo_loja,pl.preco_custo AS custo_loja,pl.precos_personalizados
      FROM produtos p LEFT JOIN produtos_lojas pl ON pl.produto_id=p.id AND pl.loja_id=? WHERE p.id=? AND p.ativo=1`, [lojaId,produtoId]);
    if (!produto) throw new ErroCatalogo('Produto não encontrado.', 404);
    const localId = await localDeVenda(lojaId);
    await vincular(produtoId, lojaId, localId,
      numero(body?.precoVenda, 'um preço de venda', Number(produto.precos_personalizados === 1 || Number(produto.preco_loja) > 0 ? produto.preco_loja : produto.preco_venda) || 0),
      numero(body?.estoqueMinimo, 'um estoque mínimo', Number(produto.minimo_loja ?? produto.estoque_minimo) || 0), 0,
      numero(produto.custo_loja ?? produto.preco_custo, 'um preço de custo'));
  });
}
export async function atualizarProdutoNaLoja(lojaId: number, produtoId: number, body: any) {
  await garantirPrecosCatalogoLoja();
  return transacaoCaixa(async () => {
    const atual = await get(`SELECT p.*,CASE WHEN pl.precos_personalizados=1 OR pl.preco_venda<>0 THEN pl.preco_venda ELSE p.preco_venda END AS preco_venda,
      COALESCE(pl.preco_custo,p.preco_custo,0) AS preco_custo,pl.estoque_minimo AS estoque_minimo FROM produtos p
      JOIN produtos_lojas pl ON pl.produto_id=p.id WHERE p.id=? AND p.ativo=1 AND pl.loja_id=? AND pl.ativo=1`, [produtoId,lojaId]);
    if (!atual) throw new ErroCatalogo('Produto não está vinculado ao mercado ativo.', 404);
    const dados = dadosCentrais(body, atual);
    // EAN metadata is shared. Sale price, minimum and cost belong to this market.
    await run(`UPDATE produtos SET ean=?,nome=?,marca=?,foto=?,categoria=?,fornecedor=?,unidade_medida=?,ncm=?,cest=?,descricao_ncm=?,atualizado_em=CURRENT_TIMESTAMP WHERE id=?`,
      [dados.ean,dados.nome,dados.marca,dados.foto,dados.categoria,dados.fornecedor,dados.unidadeMedida,dados.ncm,dados.cest,dados.descricaoNcm,produtoId]);
    await run('UPDATE produtos_lojas SET preco_venda=?,estoque_minimo=?,precos_personalizados=1,preco_custo=CASE WHEN ? THEN ? ELSE preco_custo END,atualizado_em=CURRENT_TIMESTAMP WHERE produto_id=? AND loja_id=? AND ativo=1', [dados.precoVenda,dados.estoqueMinimo,body.precoCusto !== undefined ? 1 : 0,dados.precoCusto,produtoId,lojaId]);
    if (body.precoCusto !== undefined) await run('UPDATE estoque_saldos SET custo_medio=?,atualizado_em=CURRENT_TIMESTAMP WHERE produto_id=? AND loja_id=?', [dados.precoCusto,produtoId,lojaId]);
  });
}
export async function removerProdutoDaLoja(lojaId: number, produtoId: number) {
  return comBloqueioBanco(async () => {
    const result = await run('UPDATE produtos_lojas SET ativo=0,atualizado_em=CURRENT_TIMESTAMP WHERE produto_id=? AND loja_id=? AND ativo=1', [produtoId,lojaId]);
    if (!result.changes) throw new ErroCatalogo('Produto não está vinculado ao mercado ativo.', 404);
  });
}

/** Stock received in a market must be discoverable in its catalogue and POS. */
export async function garantirVinculoEstoque(produtoId: number, lojaId: number) {
  await garantirPrecosCatalogoLoja();
  const produto = await get('SELECT id FROM produtos WHERE id=? AND ativo=1', [produtoId]);
  if (!produto) throw new ErroCatalogo('Produto não encontrado ou inativo.', 404);
  await run(`INSERT INTO produtos_lojas (produto_id,loja_id,preco_venda,estoque_minimo,preco_custo,precos_personalizados,ativo)
    SELECT p.id,?,COALESCE(p.preco_venda,0),COALESCE(p.estoque_minimo,0),
      COALESCE(NULLIF((SELECT CASE WHEN SUM(es.quantidade)>0 THEN SUM(es.quantidade*es.custo_medio)/SUM(es.quantidade) ELSE AVG(es.custo_medio) END
        FROM estoque_saldos es WHERE es.produto_id=p.id AND es.loja_id=?),0),p.preco_custo,0),1,1
    FROM produtos p WHERE p.id=? AND p.ativo=1
    ON CONFLICT(produto_id,loja_id) DO UPDATE SET ativo=1,atualizado_em=CURRENT_TIMESTAMP`, [lojaId,lojaId,produtoId]);
}
