import bcrypt from 'bcrypt';
import db from '../database/database';

export const PERMISSOES_DISPONIVEIS = [
  { codigo: 'visao', nome: 'Visão geral' },
  { codigo: 'produtos', nome: 'Produtos' },
  { codigo: 'estoque', nome: 'Estoque' },
  { codigo: 'compras', nome: 'Compras' },
  { codigo: 'financeiro', nome: 'Financeiro' },
  { codigo: 'contas', nome: 'Contas e boletos' },
  { codigo: 'clientes', nome: 'Clientes e crediário' },
  { codigo: 'vendas', nome: 'Gestão de vendas' },
  { codigo: 'fiscal', nome: 'Fiscal' },
  { codigo: 'fornecedores', nome: 'Fornecedores' },
  { codigo: 'unidades', nome: 'Mercados e unidades' },
  { codigo: 'fechamento', nome: 'Fechamento diário' },
  { codigo: 'pdv', nome: 'Frente de caixa (PDV)' },
  { codigo: 'usuarios', nome: 'Usuários e papéis' },
  { codigo: 'caixas', nome: 'Histórico de caixas' },
] as const;

export type UsuarioAcesso = {
  id: number;
  nome: string;
  email: string;
  perfil: string;
  papelId: number;
  papelNome: string;
  permissoes: string[];
  lojaIds: number[];
  acessoTodasLojas: boolean;
};
export type LojaAcesso = { id: number; nome: string; codigo: string | null; tipo: string };
export type PapelAcesso = { id: number; nome: string; permissoes: string[]; sistema: boolean; acessoTodasLojas: boolean };
export type UsuarioGerenciado = UsuarioAcesso & { ativo: number; criadoEm: string };

export class ErroAcesso extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

function run(sql: string, params: unknown[] = []): Promise<{ lastID: number; changes: number }> {
  return new Promise((resolve, reject) => db.run(sql, params, function (error) {
    if (error) reject(error); else resolve({ lastID: this.lastID, changes: this.changes });
  }));
}
function all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return new Promise((resolve, reject) => db.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows as T[])));
}
async function one<T>(sql: string, params: unknown[] = []): Promise<T | undefined> { return (await all<T>(sql, params))[0]; }

const todosCodigos = PERMISSOES_DISPONIVEIS.map(p => p.codigo);
let inicializacao: Promise<void> | undefined;

/** Additive migration, shared by login, authorization and the management routes. */
export function inicializarAcessos(): Promise<void> {
  if (!inicializacao) inicializacao = (async () => {
    await run(`CREATE TABLE IF NOT EXISTS papeis_acesso (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL COLLATE NOCASE UNIQUE,
      permissoes TEXT NOT NULL DEFAULT '[]',
      sistema INTEGER NOT NULL DEFAULT 0,
      acesso_todas_lojas INTEGER NOT NULL DEFAULT 0,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
      atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    const colunas = await all<{ name: string }>('PRAGMA table_info(usuarios)');
    if (!colunas.some(c => c.name === 'papel_id')) await run('ALTER TABLE usuarios ADD COLUMN papel_id INTEGER REFERENCES papeis_acesso(id)');
    await run(`CREATE TABLE IF NOT EXISTS usuario_lojas (
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      loja_id INTEGER NOT NULL REFERENCES lojas(id),
      PRIMARY KEY (usuario_id, loja_id)
    )`);
    const padroes = [
      { nome: 'Administrador', permissoes: todosCodigos, todas: 1 },
      { nome: 'Operador', permissoes: ['visao', 'produtos', 'estoque', 'compras', 'contas', 'fornecedores', 'unidades'], todas: 0 },
      { nome: 'Caixa', permissoes: ['visao', 'estoque', 'pdv', 'clientes', 'vendas', 'fechamento', 'caixas'], todas: 0 },
    ];
    for (const papel of padroes) {
      await run(`INSERT OR IGNORE INTO papeis_acesso (nome, permissoes, sistema, acesso_todas_lojas) VALUES (?, ?, 1, ?)`,
        [papel.nome, JSON.stringify(papel.permissoes), papel.todas]);
    }
    // Correct only the exact early defaults, never an administrator's custom role.
    for (const [nome, antigas] of [
      ['Operador', ['produtos', 'estoque', 'compras', 'financeiro', 'contas', 'fiscal', 'fornecedores', 'unidades']],
      ['Caixa', ['pdv', 'clientes', 'vendas', 'fechamento', 'caixas']],
    ] as [string, string[]][]) {
      const novo = padroes.find(p => p.nome === nome)!;
      await run('UPDATE papeis_acesso SET permissoes = ? WHERE nome = ? AND sistema = 1 AND permissoes = ?',
        [JSON.stringify(novo.permissoes), nome, JSON.stringify(antigas)]);
    }
    await migrarUsuariosSemPapel();
  })().catch(error => { inicializacao = undefined; throw error; });
  return inicializacao;
}

async function migrarUsuariosSemPapel() {
  await run(`UPDATE usuarios SET papel_id = (
    SELECT id FROM papeis_acesso WHERE nome = CASE
      WHEN UPPER(usuarios.perfil) IN ('ADMINISTRADOR', 'CEO') THEN 'Administrador'
      WHEN UPPER(usuarios.perfil) = 'CAIXA' THEN 'Caixa' ELSE 'Operador' END
  ) WHERE papel_id IS NULL`);
  // Installations that already had only profiles receive access to Matriz.
  // An explicit assignment is never broadened when the server restarts.
  await run(`INSERT OR IGNORE INTO usuario_lojas (usuario_id, loja_id)
    SELECT u.id, 1 FROM usuarios u JOIN papeis_acesso p ON p.id = u.papel_id
    WHERE p.acesso_todas_lojas = 0 AND EXISTS (SELECT 1 FROM lojas WHERE id = 1 AND ativo = 1)
      AND NOT EXISTS (SELECT 1 FROM usuario_lojas ul WHERE ul.usuario_id = u.id)`);
}

function lerPermissoes(json: string): string[] {
  try { const v = JSON.parse(json); return Array.isArray(v) ? v.filter((p): p is string => typeof p === 'string' && todosCodigos.includes(p as any)) : []; }
  catch { return []; }
}
type PapelBanco = { id: number; nome: string; permissoes: string; sistema: number; acesso_todas_lojas: number };
function papelPublico(p: PapelBanco): PapelAcesso {
  return { id: p.id, nome: p.nome, permissoes: lerPermissoes(p.permissoes), sistema: p.sistema === 1, acessoTodasLojas: p.acesso_todas_lojas === 1 };
}
export async function listarPapeis(): Promise<PapelAcesso[]> {
  await inicializarAcessos();
  return (await all<PapelBanco>('SELECT * FROM papeis_acesso ORDER BY sistema DESC, nome COLLATE NOCASE')).map(papelPublico);
}

type UsuarioBancoAcesso = {
  id: number; nome: string; email: string; perfil: string; ativo: number; criado_em: string;
  papel_id: number; papel_nome: string; permissoes: string; acesso_todas_lojas: number;
};
async function usuarioPublico(u: UsuarioBancoAcesso): Promise<UsuarioGerenciado> {
  const lojas = await all<{ id: number }>(u.acesso_todas_lojas === 1
    ? 'SELECT id FROM lojas WHERE ativo = 1 ORDER BY id'
    : 'SELECT ul.loja_id AS id FROM usuario_lojas ul JOIN lojas l ON l.id = ul.loja_id WHERE ul.usuario_id = ? AND l.ativo = 1 ORDER BY ul.loja_id',
    u.acesso_todas_lojas === 1 ? [] : [u.id]);
  return { id: u.id, nome: u.nome, email: u.email, perfil: u.perfil, ativo: u.ativo,
    criadoEm: u.criado_em, papelId: u.papel_id, papelNome: u.papel_nome,
    permissoes: lerPermissoes(u.permissoes), acessoTodasLojas: u.acesso_todas_lojas === 1,
    lojaIds: lojas.map(l => l.id) };
}
const SELECT_USUARIOS = `SELECT u.*, p.nome AS papel_nome, p.permissoes, p.acesso_todas_lojas
  FROM usuarios u JOIN papeis_acesso p ON p.id = u.papel_id`;

export async function obterUsuarioAcesso(id: number): Promise<UsuarioAcesso | null> {
  await inicializarAcessos();
  if (!Number.isInteger(id) || id <= 0) return null;
  let u = await one<UsuarioBancoAcesso>(`${SELECT_USUARIOS} WHERE u.id = ? AND u.ativo = 1`, [id]);
  if (!u) {
    // Old integrations can still create users using perfil; migrate them once.
    const legado = await one<{ id: number }>('SELECT id FROM usuarios WHERE id = ? AND papel_id IS NULL AND ativo = 1', [id]);
    if (legado) { await migrarUsuariosSemPapel(); u = await one<UsuarioBancoAcesso>(`${SELECT_USUARIOS} WHERE u.id = ? AND u.ativo = 1`, [id]); }
  }
  if (!u) return null;
  const { ativo: _ativo, criadoEm: _criadoEm, ...publico } = await usuarioPublico(u);
  return publico;
}
export function lojaPermitida(usuario: UsuarioAcesso | undefined, lojaId: number): boolean {
  return !!usuario && Number.isInteger(lojaId) && lojaId > 0 && usuario.lojaIds.includes(lojaId);
}
export async function listarLojasPermitidas(usuario: UsuarioAcesso): Promise<LojaAcesso[]> {
  await inicializarAcessos();
  const lojas = await all<LojaAcesso>('SELECT id, nome, codigo, tipo FROM lojas WHERE ativo = 1 ORDER BY CASE WHEN tipo = \'MATRIZ\' THEN 0 ELSE 1 END, nome COLLATE NOCASE');
  return usuario.acessoTodasLojas ? lojas : lojas.filter(l => lojaPermitida(usuario, l.id));
}
export async function listarGestaoAcessos() {
  await inicializarAcessos();
  const usuarios = await Promise.all((await all<UsuarioBancoAcesso>(`${SELECT_USUARIOS} ORDER BY u.ativo DESC, u.nome COLLATE NOCASE`)).map(usuarioPublico));
  const papeis = await listarPapeis();
  const lojas = await all<LojaAcesso>('SELECT id, nome, codigo, tipo FROM lojas WHERE ativo = 1 ORDER BY nome COLLATE NOCASE');
  return { usuarios, papeis, lojas, permissoesDisponiveis: PERMISSOES_DISPONIVEIS };
}

let filaAlteracoes: Promise<unknown> = Promise.resolve();
function alterar<T>(fn: () => Promise<T>): Promise<T> {
  // Access changes and cash opening share the same lock. This keeps a user
  // from opening a cash session between validation and permission revocation.
  const protegida = async () => {
    const { transacaoCaixa } = await import('./caixas.service');
    return transacaoCaixa(fn);
  };
  const proxima = filaAlteracoes.then(protegida, protegida);
  filaAlteracoes = proxima.catch(() => undefined);
  return proxima;
}
function idValido(id: unknown, rotulo: string) {
  if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) throw new ErroAcesso(`${rotulo} inválido.`);
  return id;
}
function nomeValido(value: unknown) {
  const nome = typeof value === 'string' ? value.trim() : '';
  if (nome.length < 2 || nome.length > 120) throw new ErroAcesso('Informe um nome entre 2 e 120 caracteres.');
  return nome;
}
function permissoesValidas(value: unknown): string[] {
  if (!Array.isArray(value) || !value.length || value.some(p => typeof p !== 'string' || !todosCodigos.includes(p as any))) {
    throw new ErroAcesso('Selecione pelo menos uma permissão válida.');
  }
  return [...new Set(value)];
}
function papelAdministrador(p: PapelAcesso) {
  return p.acessoTodasLojas && todosCodigos.every(c => p.permissoes.includes(c));
}
async function quantidadeAdministradores(excetoUsuario?: number, excetoPapel?: number) {
  const usuarios = await all<UsuarioBancoAcesso>(`${SELECT_USUARIOS} WHERE u.ativo = 1`);
  return usuarios.filter(u => u.id !== excetoUsuario && u.papel_id !== excetoPapel && u.acesso_todas_lojas === 1 && todosCodigos.every(c => lerPermissoes(u.permissoes).includes(c))).length;
}
async function caixasAbertos(filtro: string, id: number): Promise<{ loja_id: number }[]> {
  if (!await one("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'caixas_sessoes'")) return [];
  return all<{ loja_id: number }>(`SELECT cs.loja_id FROM caixas_sessoes cs JOIN usuarios u ON u.id = cs.usuario_id WHERE cs.status = 'ABERTO' AND ${filtro} = ?`, [id]);
}

export async function salvarPapel(body: any, solicitanteId: number, id?: number): Promise<PapelAcesso> {
  await inicializarAcessos();
  return alterar(async () => {
    const nome = nomeValido(body?.nome);
    const permissoes = permissoesValidas(body?.permissoes);
    const atual = id === undefined ? undefined : (await listarPapeis()).find(p => p.id === idValido(id, 'Papel'));
    if (id !== undefined && !atual) throw new ErroAcesso('Papel não encontrado.', 404);
    if (atual) {
      const eu = await obterUsuarioAcesso(solicitanteId);
      if (eu?.papelId === id && !permissoes.includes('usuarios')) throw new ErroAcesso('Você não pode remover seu próprio acesso à gestão de usuários.', 409);
      if (papelAdministrador(atual) && !todosCodigos.every(c => permissoes.includes(c)) && await quantidadeAdministradores(undefined, id) === 0) {
        throw new ErroAcesso('Mantenha pelo menos um administrador ativo com acesso completo.', 409);
      }
      if (!permissoes.includes('pdv') && (await caixasAbertos('u.papel_id', id!)).length) throw new ErroAcesso('Há usuários deste papel com caixa aberto. Encerre os caixas antes de remover o acesso ao PDV.', 409);
    }
    const duplicado = await one<{ id: number }>('SELECT id FROM papeis_acesso WHERE nome = ? COLLATE NOCASE', [nome]);
    if (duplicado && duplicado.id !== id) throw new ErroAcesso('Já existe um papel com esse nome.', 409);
    let papelId = id;
    if (id === undefined) papelId = (await run('INSERT INTO papeis_acesso (nome, permissoes) VALUES (?, ?)', [nome, JSON.stringify(permissoes)])).lastID;
    else await run('UPDATE papeis_acesso SET nome = ?, permissoes = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?', [nome, JSON.stringify(permissoes), id]);
    return (await listarPapeis()).find(p => p.id === papelId)!;
  });
}

export async function excluirPapel(id: number) {
  await inicializarAcessos();
  return alterar(async () => {
    idValido(id, 'Papel');
    const atual = (await listarPapeis()).find(p => p.id === id);
    if (!atual) throw new ErroAcesso('Papel não encontrado.', 404);
    if (atual.sistema) throw new ErroAcesso('Os papéis iniciais do sistema não podem ser excluídos.', 409);
    if (await one('SELECT id FROM usuarios WHERE papel_id = ? LIMIT 1', [id])) throw new ErroAcesso('Este papel possui usuários. Altere o papel deles antes de excluir.', 409);
    await run('DELETE FROM papeis_acesso WHERE id = ?', [id]);
  });
}

export async function salvarUsuario(body: any, solicitanteId: number, id?: number): Promise<UsuarioGerenciado> {
  await inicializarAcessos();
  return alterar(async () => {
    const existente = id === undefined ? undefined : await one<UsuarioBancoAcesso>(`${SELECT_USUARIOS} WHERE u.id = ?`, [idValido(id, 'Usuário')]);
    if (id !== undefined && !existente) throw new ErroAcesso('Usuário não encontrado.', 404);
    const nome = nomeValido(body?.nome ?? existente?.nome);
    const email = String(body?.email ?? existente?.email ?? '').trim().toLowerCase();
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ErroAcesso('Informe um e-mail válido.');
    const papelId = idValido(body?.papelId ?? existente?.papel_id, 'Papel');
    const papel = (await listarPapeis()).find(p => p.id === papelId);
    if (!papel) throw new ErroAcesso('Papel não encontrado.', 404);
    if (body?.ativo !== undefined && ![true, false, 0, 1].includes(body.ativo)) throw new ErroAcesso('Situação do usuário inválida.');
    const ativo = body?.ativo === undefined ? existente?.ativo ?? 1 : Number(Boolean(body.ativo));
    if (id === solicitanteId && (!ativo || !papel.permissoes.includes('usuarios'))) throw new ErroAcesso('Você não pode desativar sua conta nem remover seu próprio acesso à gestão de usuários.', 409);
    const atualAdmin = existente && existente.ativo === 1 && existente.acesso_todas_lojas === 1 && todosCodigos.every(c => lerPermissoes(existente.permissoes).includes(c));
    if (atualAdmin && (!ativo || !papelAdministrador(papel)) && await quantidadeAdministradores(id) === 0) throw new ErroAcesso('Mantenha pelo menos um administrador ativo com acesso completo.', 409);
    const lojasEnviadas = body?.lojaIds ?? (existente ? (await usuarioPublico(existente)).lojaIds : []);
    if (!Array.isArray(lojasEnviadas) || lojasEnviadas.some(l => typeof l !== 'number' || !Number.isInteger(l) || l <= 0)) throw new ErroAcesso('Selecione mercados válidos.');
    const lojaIds = [...new Set<number>(lojasEnviadas)];
    if (!papel.acessoTodasLojas && !lojaIds.length) throw new ErroAcesso('Selecione pelo menos um mercado para o usuário.');
    for (const lojaId of lojaIds) if (!await one('SELECT id FROM lojas WHERE id = ? AND ativo = 1', [lojaId])) throw new ErroAcesso('Um dos mercados selecionados está inativo ou não existe.');
    if (id !== undefined) {
      const abertos = await caixasAbertos('cs.usuario_id', id);
      if (abertos.some(c => !ativo || !papel.permissoes.includes('pdv') || (!papel.acessoTodasLojas && !lojaIds.includes(c.loja_id)))) {
        throw new ErroAcesso('Este usuário tem caixa aberto. Encerre o caixa antes de desativar a conta, remover o PDV ou retirar o mercado em uso.', 409);
      }
    }
    const senhaInformada = body?.senha !== undefined && body.senha !== '';
    if ((!existente || senhaInformada) && (typeof body?.senha !== 'string' || body.senha.length < 8 || body.senha.length > 72)) throw new ErroAcesso('A senha deve ter de 8 a 72 caracteres.');
    const duplicado = await one<{ id: number }>('SELECT id FROM usuarios WHERE LOWER(email) = ?', [email]);
    if (duplicado && duplicado.id !== id) throw new ErroAcesso('Já existe um usuário com esse e-mail.', 409);
    const perfil = papel.acessoTodasLojas ? (existente?.perfil === 'CEO' ? 'CEO' : 'ADMINISTRADOR') : papel.nome === 'Caixa' ? 'CAIXA' : 'OPERADOR';
    const hash = (!existente || senhaInformada) ? await bcrypt.hash(body.senha, 12) : undefined;
    let usuarioId = id;
    if (id === undefined) usuarioId = (await run('INSERT INTO usuarios (nome, email, senha, perfil, papel_id, ativo) VALUES (?, ?, ?, ?, ?, ?)', [nome, email, hash, perfil, papelId, ativo])).lastID;
    else {
      await run('UPDATE usuarios SET nome = ?, email = ?, perfil = ?, papel_id = ?, ativo = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?', [nome, email, perfil, papelId, ativo, id]);
      if (hash) await run('UPDATE usuarios SET senha = ? WHERE id = ?', [hash, id]);
    }
    await run('DELETE FROM usuario_lojas WHERE usuario_id = ?', [usuarioId]);
    for (const lojaId of lojaIds) await run('INSERT INTO usuario_lojas (usuario_id, loja_id) VALUES (?, ?)', [usuarioId, lojaId]);
    return usuarioPublico((await one<UsuarioBancoAcesso>(`${SELECT_USUARIOS} WHERE u.id = ?`, [usuarioId]))!);
  });
}
