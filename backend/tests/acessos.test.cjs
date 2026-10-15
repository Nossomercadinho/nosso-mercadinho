const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('papéis, mercados, desativação imediata e proteção de administradores', { timeout: 30000 }, async t => {
  const root = path.resolve(__dirname, '..');
  const anterior = process.cwd();
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'nosso-acessos-test-'));
  fs.mkdirSync(path.join(temp, 'src/database'), { recursive: true });
  process.env.DB_CLIENT = 'sqlite';
  process.env.DATABASE_URL = '';
  process.env.TS_NODE_PROJECT = path.join(root, 'tsconfig.json');
  require('ts-node/register/transpile-only');
  process.chdir(temp);
  const acessos = require(path.join(root, 'src/services/acessos.service.ts'));
  const db = require(path.join(root, 'src/database/database.ts')).default;
  const run = (sql, args = []) => new Promise((resolve, reject) => db.run(sql, args, function (error) { error ? reject(error) : resolve(this.lastID); }));
  const get = (sql, args = []) => new Promise((resolve, reject) => db.get(sql, args, (error, row) => error ? reject(error) : resolve(row)));
  t.after(async () => {
    await new Promise(resolve => db.close(resolve));
    process.chdir(anterior);
    const resolved = path.resolve(temp);
    assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
    assert.ok(path.basename(resolved).startsWith('nosso-acessos-test-'));
    fs.rmSync(resolved, { recursive: true, force: true });
  });
  await acessos.inicializarAcessos();
  assert.equal((await get('SELECT COUNT(*) AS total FROM usuarios')).total, 0, 'Migrações não criam usuários ou credenciais.');
  for (let i = 0; i < 50 && !await get('SELECT id FROM lojas WHERE id = 1'); i++) await new Promise(resolve => setTimeout(resolve, 20));
  const adminId = await run('INSERT INTO usuarios (nome,email,senha,perfil) VALUES (?,?,?,?)', ['Admin', 'admin@teste.local', 'temporaria', 'ADMINISTRADOR']);
  const legacyId = await run('INSERT INTO usuarios (nome,email,senha,perfil) VALUES (?,?,?,?)', ['Caixa legado', 'legado@teste.local', 'temporaria', 'CAIXA']);
  const admin = await acessos.obterUsuarioAcesso(adminId);
  assert.equal(admin.acessoTodasLojas, true);
  assert.ok(admin.permissoes.includes('usuarios'));
  assert.deepEqual((await acessos.obterUsuarioAcesso(legacyId)).lojaIds, [1]);

  const secondStore = await run('INSERT INTO lojas (nome, codigo, tipo) VALUES (?,?,?)', ['Bairro', 'BAIRRO', 'FILIAL']);
  const papel = await acessos.salvarPapel({ nome: 'Atendente bairro', permissoes: ['pdv', 'vendas'] }, adminId);
  const user = await acessos.salvarUsuario({ nome: 'Atendente', email: 'caixa@teste.local', senha: 'uma-senha-segura', papelId: papel.id, lojaIds: [secondStore] }, adminId);
  assert.equal(user.acessoTodasLojas, false);
  assert.deepEqual(user.lojaIds, [secondStore]);
  assert.equal(acessos.lojaPermitida(user, 1), false);
  assert.equal(acessos.lojaPermitida(user, secondStore), true);
  assert.deepEqual((await acessos.listarLojasPermitidas(user)).map(l => l.id), [secondStore]);
  assert.match((await get('SELECT senha FROM usuarios WHERE id = ?', [user.id])).senha, /^\$2/);

  await acessos.salvarPapel({ nome: papel.nome, permissoes: ['pdv'] }, adminId, papel.id);
  assert.deepEqual((await acessos.obterUsuarioAcesso(user.id)).permissoes, ['pdv']);
  await acessos.salvarUsuario({ ativo: false }, adminId, user.id);
  assert.equal(await acessos.obterUsuarioAcesso(user.id), null);
  await assert.rejects(acessos.salvarUsuario({ ativo: false }, adminId, adminId), /próprio acesso|sua conta/);
  await assert.rejects(acessos.salvarUsuario({ papelId: papel.id, lojaIds: [1] }, legacyId, adminId), /pelo menos um administrador/);
  await assert.rejects(acessos.salvarPapel({ nome: 'Administrador', permissoes: ['usuarios'] }, adminId, admin.papelId), /pelo menos um administrador/);
  await assert.rejects(acessos.salvarUsuario({ nome: 'Inválido', email: 'invalido@teste.local', senha: 'uma-senha-segura', papelId: papel.id, lojaIds: [999999] }, adminId), /mercados selecionados/);
  await assert.rejects(acessos.excluirPapel(papel.id), /possui usuários/);

  const caixas = require(path.join(root, 'src/services/caixas.service.ts'));
  await caixas.garantirEstruturaCaixas();
  const local = await run('INSERT INTO locais_estoque (loja_id,nome,tipo,permite_venda) VALUES (?,?,?,1)', [secondStore, 'Venda Bairro', 'VENDA']);
  await acessos.salvarUsuario({ ativo: true }, adminId, user.id);
  const atualizado = await acessos.obterUsuarioAcesso(user.id);
  const sessao = await caixas.abrirCaixa(atualizado, { lojaId: secondStore, localId: local, saldoInicial: 0 });
  await assert.rejects(acessos.salvarUsuario({ ativo: false, senha: 'uma-outra-senha' }, adminId, user.id), /caixa aberto/);
  await assert.rejects(acessos.salvarPapel({ nome: papel.nome, permissoes: ['vendas'] }, adminId, papel.id), /caixa aberto/);
  await caixas.fecharCaixa(atualizado, sessao.id, { valorContado: 0 });
  const concorrentes = await Promise.allSettled([
    acessos.salvarUsuario({ ativo: false, senha: 'senha-atualizada' }, adminId, user.id),
    caixas.abrirCaixa(atualizado, { lojaId: secondStore, localId: local, saldoInicial: 0 }),
  ]);
  assert.equal(concorrentes.filter(r => r.status === 'fulfilled').length, 1);
  const estado = await get("SELECT u.ativo, COUNT(cs.id) AS abertos FROM usuarios u LEFT JOIN caixas_sessoes cs ON cs.usuario_id=u.id AND cs.status='ABERTO' WHERE u.id=? GROUP BY u.id", [user.id]);
  assert.ok(estado.ativo || !estado.abertos, 'Abertura simultânea não pode deixar caixa aberto para usuário desativado.');

  const auth = require(path.join(root, 'src/middleware/auth.middleware.ts'));
  const jwt = require('jsonwebtoken');
  process.env.JWT_SECRET = 'segredo-exclusivo-deste-teste';
  const falha = new Error('Falha de consulta simulada');
  t.mock.method(acessos, 'obterUsuarioAcesso', async () => { throw falha; });
  let encaminhada;
  await auth.autenticarToken({ headers: { authorization: 'Bearer ' + jwt.sign({ id: adminId }, process.env.JWT_SECRET) } },
    { status: () => { assert.fail('Falha de banco não pode retornar 401.'); } }, error => { encaminhada = error; });
  assert.equal(encaminhada, falha);
});
