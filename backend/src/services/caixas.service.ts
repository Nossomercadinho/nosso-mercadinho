import db from '../database/database';
import { randomBytes } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { UsuarioAcesso, lojaPermitida, listarLojasPermitidas, obterUsuarioAcesso } from './acessos.service';

function run(sql: string, params: any[] = []) {
  return new Promise<{ lastID: number; changes: number }>((resolve, reject) => {
    db.run(sql, params, function (err) { err ? reject(err) : resolve({ lastID: this.lastID, changes: this.changes }); });
  });
}
function get<T = any>(sql: string, params: any[] = []) {
  return new Promise<T | undefined>((resolve, reject) => {
    db.get(sql, params, (err, row) => err ? reject(err) : resolve(row as T | undefined));
  });
}
function all<T = any>(sql: string, params: any[] = []) {
  return new Promise<T[]>((resolve, reject) => {
    db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows as T[]));
  });
}
const arredondar = (valor: number) => Math.round((valor + Number.EPSILON) * 100) / 100;

let estrutura: Promise<void> | undefined;
export function garantirEstruturaCaixas() {
  if (!estrutura) estrutura = prepararEstrutura().catch(error => { estrutura = undefined; throw error; });
  return estrutura;
}
async function prepararEstrutura() {
  await run(`CREATE TABLE IF NOT EXISTS caixas_sessoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    loja_id INTEGER NOT NULL REFERENCES lojas(id),
    local_id INTEGER NOT NULL REFERENCES locais_estoque(id),
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
    loja_nome TEXT NOT NULL, local_nome TEXT NOT NULL, usuario_nome TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ABERTO' CHECK(status IN ('ABERTO', 'FECHADO')),
    aberto_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    fechado_em TEXT, fechado_por_id INTEGER REFERENCES usuarios(id), fechado_por_nome TEXT,
    saldo_inicial REAL NOT NULL CHECK(saldo_inicial >= 0),
    valor_contado REAL, valor_esperado REAL, diferenca REAL,
    quantidade_vendas INTEGER, total_vendas REAL, resumo_json TEXT,
    observacao_abertura TEXT, observacao_fechamento TEXT
  )`);
  await run("CREATE UNIQUE INDEX IF NOT EXISTS idx_caixas_usuario_aberto ON caixas_sessoes(usuario_id) WHERE status = 'ABERTO'");
  await run('CREATE INDEX IF NOT EXISTS idx_caixas_loja_abertura ON caixas_sessoes(loja_id, aberto_em)');
  const colunasVendas = await all<any>('PRAGMA table_info(vendas)');
  if (!colunasVendas.some(c => c.name === 'caixa_sessao_id')) {
    await run('ALTER TABLE vendas ADD COLUMN caixa_sessao_id INTEGER REFERENCES caixas_sessoes(id)');
  }
  await run('CREATE INDEX IF NOT EXISTS idx_vendas_caixa_sessao ON vendas(caixa_sessao_id)');
  const colunasFinanceiro = await all<any>('PRAGMA table_info(financeiro_lancamentos)');
  if (!colunasFinanceiro.some(c => c.name === 'caixa_sessao_id')) await run('ALTER TABLE financeiro_lancamentos ADD COLUMN caixa_sessao_id INTEGER REFERENCES caixas_sessoes(id)');
  await run('CREATE UNIQUE INDEX IF NOT EXISTS idx_financeiro_caixa_sessao ON financeiro_lancamentos(caixa_sessao_id) WHERE caixa_sessao_id IS NOT NULL');
  const colunasExecutores = await all<any>('PRAGMA table_info(executores)');
  if (!colunasExecutores.some(c => c.name === 'usuario_id')) {
    await run('ALTER TABLE executores ADD COLUMN usuario_id INTEGER REFERENCES usuarios(id)');
  }
  await run('CREATE UNIQUE INDEX IF NOT EXISTS idx_executor_usuario ON executores(usuario_id) WHERE usuario_id IS NOT NULL');
}

// A single SQLite connection must not interleave a sale and its cash closing.
// The queue also protects against double clicks and parallel barcode submissions.
let fila: Promise<unknown> = Promise.resolve();
const contextoBloqueio = new AsyncLocalStorage<{ transacao: boolean }>();
export async function comBloqueioBanco<T>(acao: () => Promise<T>): Promise<T> {
  if (contextoBloqueio.getStore()) return acao();
  const anterior = fila;
  let liberar!: () => void;
  fila = new Promise<void>(resolve => { liberar = resolve; });
  await anterior;
  try { return await contextoBloqueio.run({ transacao: false }, acao); }
  finally { liberar(); }
}
export async function transacaoCaixa<T>(acao: () => Promise<T>): Promise<T> {
  return comBloqueioBanco(async () => {
    const contexto = contextoBloqueio.getStore()!;
    if (contexto.transacao) return acao();
    await run('BEGIN IMMEDIATE TRANSACTION');
    contexto.transacao = true;
    try { const resultado = await acao(); await run('COMMIT'); return resultado; }
    catch (error) { try { await run('ROLLBACK'); } catch {} throw error; }
    finally { contexto.transacao = false; }
  });
}

const selecao = `SELECT cs.id, cs.loja_id AS lojaId, cs.local_id AS localId,
  cs.usuario_id AS usuarioId, cs.loja_nome AS lojaNome, cs.local_nome AS localNome,
  cs.usuario_nome AS usuarioNome, cs.status, cs.aberto_em AS abertoEm,
  cs.fechado_em AS fechadoEm, cs.fechado_por_id AS fechadoPorId,
  cs.fechado_por_nome AS fechadoPorNome, cs.saldo_inicial AS saldoInicial,
  cs.valor_contado AS valorContado, cs.valor_esperado AS valorEsperado,
  cs.diferenca, cs.quantidade_vendas AS quantidadeVendas, cs.total_vendas AS totalVendas,
  (SELECT fl.id FROM financeiro_lancamentos fl WHERE fl.caixa_sessao_id = cs.id LIMIT 1) AS financeiroLancamentoId,
  cs.observacao_abertura AS observacaoAbertura, cs.observacao_fechamento AS observacaoFechamento
  FROM caixas_sessoes cs`;

export async function obterSessaoAberta(usuarioId: number) {
  await garantirEstruturaCaixas();
  return (await get<any>(`${selecao} WHERE cs.usuario_id = ? AND cs.status = 'ABERTO'`, [usuarioId])) || null;
}
export async function exigirSessaoAberta(usuario: UsuarioAcesso) {
  const sessao = await obterSessaoAberta(usuario.id);
  if (!sessao) throw new Error('Abra o caixa e escolha o mercado antes de iniciar uma venda.');
  if (!lojaPermitida(usuario, Number(sessao.lojaId))) throw new Error('Você não tem mais acesso ao mercado deste caixa. Solicite à administração o encerramento do acesso.');
  const local = await get<any>(`SELECT le.id FROM locais_estoque le JOIN lojas l ON l.id = le.loja_id
    WHERE le.id = ? AND le.loja_id = ? AND le.ativo = 1 AND le.permite_venda = 1 AND l.ativo = 1`, [sessao.localId, sessao.lojaId]);
  if (!local) throw new Error('O mercado ou local deste caixa está desativado para vendas.');
  return sessao;
}

export type ResumoCaixa = {
  quantidadeVendas: number; totalVendas: number;
  porForma: { formaPagamento: string; total: number }[];
  dinheiro: number; valorEsperado: number;
};
export async function resumoSessao(sessao: any): Promise<ResumoCaixa> {
  if (sessao.status === 'FECHADO') {
    const salvo = await get<any>('SELECT resumo_json FROM caixas_sessoes WHERE id = ?', [sessao.id]);
    if (salvo?.resumo_json) return JSON.parse(salvo.resumo_json);
  }
  const vendas = await get<any>(`SELECT COUNT(*) AS quantidade, COALESCE(SUM(valor_total),0) AS total
    FROM vendas WHERE caixa_sessao_id = ? AND status = 'CONCLUIDA'`, [sessao.id]);
  const formas = await all<any>(`SELECT vp.forma_pagamento AS formaPagamento, COALESCE(SUM(vp.valor),0) AS total
    FROM venda_pagamentos vp JOIN vendas v ON v.id = vp.venda_id
    WHERE v.caixa_sessao_id = ? AND v.status = 'CONCLUIDA'
    GROUP BY vp.forma_pagamento ORDER BY vp.forma_pagamento`, [sessao.id]);
  const porForma = formas.map(p => ({ formaPagamento: String(p.formaPagamento), total: arredondar(Number(p.total)) }));
  const dinheiro = porForma.filter(p => p.formaPagamento === 'DINHEIRO').reduce((s, p) => s + p.total, 0);
  return { quantidadeVendas: Number(vendas?.quantidade || 0), totalVendas: arredondar(Number(vendas?.total || 0)),
    porForma, dinheiro: arredondar(dinheiro), valorEsperado: arredondar(Number(sessao.saldoInicial) + dinheiro) };
}
async function comResumo(sessao: any) {
  const resumo = await resumoSessao(sessao);
  return { ...sessao, quantidadeVendas: resumo.quantidadeVendas, totalVendas: resumo.totalVendas, valorEsperado: resumo.valorEsperado };
}
function permiteHistoricoCompleto(usuario: UsuarioAcesso) { return usuario.permissoes.includes('caixas'); }
async function idsLojasHistorico(usuario: UsuarioAcesso) {
  const lojas = await all<{ id: number }>(usuario.acessoTodasLojas
    ? 'SELECT id FROM lojas'
    : 'SELECT l.id FROM lojas l JOIN usuario_lojas ul ON ul.loja_id = l.id WHERE ul.usuario_id = ?',
    usuario.acessoTodasLojas ? [] : [usuario.id]);
  return lojas.map(loja => Number(loja.id));
}
async function podeLerSessao(usuario: UsuarioAcesso, sessao: any) {
  // An owner must still be able to count and close a cash drawer if the store
  // was deactivated while they were working. Other history stays store-scoped.
  if (sessao.status === 'ABERTO' && Number(sessao.usuarioId) === usuario.id) return true;
  return (await idsLojasHistorico(usuario)).includes(Number(sessao.lojaId))
    && (Number(sessao.usuarioId) === usuario.id || permiteHistoricoCompleto(usuario));
}
export async function contextoCaixas(usuario: UsuarioAcesso) {
  await garantirEstruturaCaixas();
  const lojasPermitidas = await listarLojasPermitidas(usuario);
  const lojas = [];
  for (const loja of lojasPermitidas) {
    const locais = await all<any>(`SELECT id,nome FROM locais_estoque WHERE loja_id = ? AND ativo = 1 AND permite_venda = 1 ORDER BY nome COLLATE NOCASE`, [loja.id]);
    if (locais.length) lojas.push({ id: loja.id, nome: loja.nome, locais });
  }
  const aberta = await obterSessaoAberta(usuario.id);
  // Keep one's own open session visible if access was removed, so it can be closed.
  return { lojas, sessao: aberta ? await comResumo(aberta) : null };
}
export async function listarSessoesCaixa(usuario: UsuarioAcesso, lojaId?: number) {
  await garantirEstruturaCaixas();
  const ids = await idsLojasHistorico(usuario);
  if (lojaId && !ids.includes(lojaId)) throw new Error('Você não tem acesso a este mercado.');
  if (!ids.length) return [];
  const where = [`cs.loja_id IN (${ids.map(() => '?').join(',')})`];
  const params: any[] = [...ids];
  if (lojaId) { where.push('cs.loja_id = ?'); params.push(lojaId); }
  if (!permiteHistoricoCompleto(usuario)) { where.push('cs.usuario_id = ?'); params.push(usuario.id); }
  const sessoes = await all<any>(`${selecao} WHERE ${where.join(' AND ')} ORDER BY cs.aberto_em DESC, cs.id DESC LIMIT 500`, params);
  return Promise.all(sessoes.map(comResumo));
}
export async function detalheSessaoCaixa(usuario: UsuarioAcesso, id: number) {
  await garantirEstruturaCaixas();
  const sessao = await get<any>(`${selecao} WHERE cs.id = ?`, [id]);
  if (!sessao || !await podeLerSessao(usuario, sessao)) throw new Error('Caixa não encontrado ou sem permissão para consulta.');
  const resumo = await resumoSessao(sessao);
  return { sessao: { ...sessao, quantidadeVendas: resumo.quantidadeVendas, totalVendas: resumo.totalVendas, valorEsperado: resumo.valorEsperado }, resumo };
}
function moedaValida(valor: unknown, nome: string) {
  if ((typeof valor !== 'number' && typeof valor !== 'string') || String(valor).trim() === '') throw new Error(`Informe ${nome}.`);
  const n = Number(String(valor).replace(',', '.'));
  if (!Number.isFinite(n) || n < 0 || n > 999999999.99) throw new Error(`Informe ${nome} válido, maior ou igual a zero.`);
  return arredondar(n);
}
function observacao(valor: unknown) { return String(valor || '').trim().slice(0, 1000) || null; }
export async function abrirCaixa(usuario: UsuarioAcesso, dados: any) {
  await garantirEstruturaCaixas();
  const lojaId = Number(dados.lojaId), localId = Number(dados.localId);
  const saldoInicial = moedaValida(dados.saldoInicial, 'um saldo inicial');
  if (!Number.isSafeInteger(lojaId) || lojaId < 1 || !lojaPermitida(usuario, lojaId)) throw new Error('Você não tem acesso a este mercado.');
  return transacaoCaixa(async () => {
    const atual = await obterUsuarioAcesso(usuario.id);
    if (!atual || !atual.permissoes.includes('pdv') || !lojaPermitida(atual, lojaId)) throw new Error('Seu acesso ao PDV ou a este mercado foi alterado. Entre novamente para atualizar suas permissões.');
    if (await obterSessaoAberta(usuario.id)) throw new Error('Você já possui um caixa aberto. Encerre-o antes de trocar de mercado.');
    const local = await get<any>(`SELECT le.id, le.nome AS localNome, l.nome AS lojaNome
      FROM locais_estoque le JOIN lojas l ON l.id = le.loja_id
      WHERE le.id = ? AND le.loja_id = ? AND le.ativo = 1 AND le.permite_venda = 1 AND l.ativo = 1`, [localId, lojaId]);
    if (!local) throw new Error('Local de venda não disponível neste mercado.');
    const inserido = await run(`INSERT INTO caixas_sessoes (loja_id,local_id,usuario_id,loja_nome,local_nome,usuario_nome,saldo_inicial,observacao_abertura)
      VALUES (?,?,?,?,?,?,?,?)`, [lojaId, localId, atual.id, local.lojaNome, local.localNome, atual.nome, saldoInicial, observacao(dados.observacao)]);
    return comResumo(await get<any>(`${selecao} WHERE cs.id = ?`, [inserido.lastID]));
  });
}
export async function fecharCaixa(usuario: UsuarioAcesso, id: number, dados: any) {
  await garantirEstruturaCaixas();
  const valorContado = moedaValida(dados.valorContado, 'o valor em dinheiro contado');
  return transacaoCaixa(async () => {
    const sessao = await get<any>(`${selecao} WHERE cs.id = ?`, [id]);
    if (!sessao || Number(sessao.usuarioId) !== usuario.id) throw new Error('Somente o responsável pela abertura pode encerrar este caixa.');
    if (sessao.status !== 'ABERTO') throw new Error('Este caixa já foi encerrado.');
    const resumo = await resumoSessao(sessao);

    const diferenca = arredondar(valorContado - resumo.valorEsperado);
    await run(`UPDATE caixas_sessoes SET status = 'FECHADO', fechado_em = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
      fechado_por_id = ?, fechado_por_nome = ?, valor_contado = ?, valor_esperado = ?, diferenca = ?,
      quantidade_vendas = ?, total_vendas = ?, resumo_json = ?, observacao_fechamento = ? WHERE id = ? AND status = 'ABERTO'`,
      [usuario.id, usuario.nome, valorContado, resumo.valorEsperado, diferenca, resumo.quantidadeVendas, resumo.totalVendas,
        JSON.stringify(resumo), observacao(dados.observacao), id]);
    const fechado = await get<any>(`${selecao} WHERE cs.id = ?`, [id]);
    return { sessao: fechado, resumo };
  });
}

export async function obterExecutorUsuario(usuario: UsuarioAcesso) {
  await garantirEstruturaCaixas();
  return transacaoCaixa(async () => {
  let executor = await get<any>('SELECT id,nome FROM executores WHERE usuario_id = ?', [usuario.id]);
  if (!executor) {
    await run(`INSERT OR IGNORE INTO executores (codigo,nome,ativo,usuario_id) VALUES (?,?,1,?)`, [`OPERADOR_${usuario.id}_${randomBytes(8).toString('hex')}`, usuario.nome, usuario.id]);
    executor = await get<any>('SELECT id,nome FROM executores WHERE usuario_id = ?', [usuario.id]);
  }
  if (!executor) throw new Error('Não foi possível identificar o operador autenticado.');
  await run('UPDATE executores SET nome = ?, ativo = 1 WHERE id = ?', [usuario.nome, executor.id]);
  return { id: Number(executor.id), nome: usuario.nome };
  });
}
