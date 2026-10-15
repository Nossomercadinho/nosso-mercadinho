import bcrypt from 'bcrypt';
import db, { bancoCliente, bancoPronto } from '../database/database';
import { inicializarAcessos, listarPapeis, PERMISSOES_DISPONIVEIS } from './acessos.service';
import { transacaoCaixa } from './caixas.service';

export class ErroPrimeiroAdmin extends Error {}

function get<T = any>(sql: string, params: unknown[] = []) {
  return new Promise<T | undefined>((resolve, reject) => {
    db.get(sql, params, (error, row) => error ? reject(error) : resolve(row as T | undefined));
  });
}
function run(sql: string, params: unknown[] = []) {
  return new Promise<{ id: number; changes: number }>((resolve, reject) => {
    db.run(sql, params, function (error) {
      if (error) reject(error);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

/** Only bootstraps an empty installation. This is deliberately not account recovery. */
export async function criarPrimeiroAdministrador(dados: { nome: string; email: string; senha: string }) {
  const nome = dados.nome.trim();
  const email = dados.email.trim().toLowerCase();
  if (nome.length < 2 || nome.length > 120) throw new ErroPrimeiroAdmin('Informe um nome entre 2 e 120 caracteres.');
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ErroPrimeiroAdmin('Informe um e-mail válido.');
  if (dados.senha.length < 12 || Buffer.byteLength(dados.senha, 'utf8') > 72 || /[\r\n\0]/.test(dados.senha)) {
    throw new ErroPrimeiroAdmin('A senha deve ter pelo menos 12 caracteres, até 72 bytes e não pode conter quebras de linha.');
  }
  await bancoPronto;
  if (Number((await get<{ total: number }>('SELECT COUNT(*) AS total FROM usuarios'))?.total)) {
    throw new ErroPrimeiroAdmin('A instalação já possui usuários. Use a gestão de usuários com um administrador existente; este comando não recupera contas.');
  }
  const base = await get('SELECT l.id FROM lojas l JOIN empresas e ON e.id = l.empresa_id WHERE l.ativo = 1 AND e.ativo = 1 LIMIT 1');
  if (!base) throw new ErroPrimeiroAdmin('A instalação não possui empresa e mercado ativos. Para uma instalação nova, aplique supabase/seed.sql antes deste comando.');
  await inicializarAcessos();
  const papel = (await listarPapeis()).find(p => p.acessoTodasLojas && PERMISSOES_DISPONIVEIS.every(permissao => p.permissoes.includes(permissao.codigo)));
  if (!papel) throw new ErroPrimeiroAdmin('Nenhum papel de administrador completo foi preparado. Confira as migrations e o seed técnico.');
  const hash = await bcrypt.hash(dados.senha, 12);
  return transacaoCaixa(async () => {
    // Serializes bootstrap across CLI processes, in addition to the in-process queue.
    if (bancoCliente === 'postgres') await run('LOCK TABLE usuarios, executores IN EXCLUSIVE MODE');
    if (Number((await get<{ total: number }>('SELECT COUNT(*) AS total FROM usuarios'))?.total)) {
      throw new ErroPrimeiroAdmin('A instalação já possui usuários. Nenhum acesso existente foi alterado.');
    }
    const criado = await run('INSERT INTO usuarios (nome,email,senha,perfil,papel_id,ativo) VALUES (?,?,?,?,?,1)', [nome, email, hash, 'ADMINISTRADOR', papel.id]);
    let codigoExecutor = '';
    for (let candidato = 1; candidato <= 9999; candidato++) {
      const codigo = String(candidato).padStart(2, '0');
      if (!await get('SELECT id FROM executores WHERE codigo = ?', [codigo])) { codigoExecutor = codigo; break; }
    }
    if (!codigoExecutor) throw new ErroPrimeiroAdmin('Não há código operacional curto disponível. Nenhum usuário foi criado.');
    await run('INSERT INTO executores (codigo,nome,ativo,usuario_id) VALUES (?,?,1,?)', [codigoExecutor, nome, criado.id]);
    return { id: criado.id, codigoExecutor };
  });
}
