import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import db from '../database/database';
import { autenticarToken, RequestAutenticada } from '../middleware/auth.middleware';
import { inicializarAcessos, listarLojasPermitidas, obterUsuarioAcesso } from '../services/acessos.service';

const router = Router();
type UsuarioBanco = { id: number; senha: string; ativo: number };

router.post('/login', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const senha = typeof req.body?.senha === 'string' ? req.body.senha : '';
  if (!email || !senha) return res.status(400).json({ sucesso: false, erro: 'Informe o e-mail e a senha.' });
  try {
    await inicializarAcessos();
    const usuario = await new Promise<UsuarioBanco | undefined>((resolve, reject) => {
      db.get('SELECT id, senha, ativo FROM usuarios WHERE LOWER(email) = ? LIMIT 1', [email],
        (error, row: UsuarioBanco | undefined) => error ? reject(error) : resolve(row));
    });
    if (!usuario) return res.status(401).json({ sucesso: false, erro: 'E-mail ou senha inválidos.' });
    const comHash = /^\$2[aby]\$/.test(usuario.senha);
    const valida = comHash ? await bcrypt.compare(senha, usuario.senha) : usuario.senha === senha;
    if (!valida) return res.status(401).json({ sucesso: false, erro: 'E-mail ou senha inválidos.' });
    if (Number(usuario.ativo) !== 1) return res.status(403).json({ sucesso: false, erro: 'Usuário inativo. Entre em contato com a administração.' });
    const usuarioPublico = await obterUsuarioAcesso(usuario.id);
    if (!usuarioPublico) return res.status(403).json({ sucesso: false, erro: 'Usuário sem papel de acesso válido.' });
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('JWT_SECRET não configurado.');
    const token = jwt.sign({ id: usuario.id }, secret, { expiresIn: '8h' });
    if (!comHash) {
      const hash = await bcrypt.hash(senha, 12);
      await new Promise<void>((resolve, reject) => db.run('UPDATE usuarios SET senha = ? WHERE id = ?', [hash, usuario.id], error => error ? reject(error) : resolve()));
    }
    return res.json({ sucesso: true, token, usuario: usuarioPublico });
  } catch (error) {
    console.error('Erro ao realizar login:', error);
    return res.status(500).json({ sucesso: false, erro: 'Erro ao realizar login.' });
  }
});

router.get('/me', autenticarToken, (req: RequestAutenticada, res) => {
  return res.json({ sucesso: true, usuario: req.usuario });
});

router.get('/lojas', autenticarToken, async (req: RequestAutenticada, res, next) => {
  try { res.json({ sucesso: true, lojas: await listarLojasPermitidas(req.usuario!) }); }
  catch (error) { next(error); }
});

export default router;
