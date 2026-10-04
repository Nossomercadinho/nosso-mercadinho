import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import db from '../database/database';
import {
  autenticarToken,
  RequestAutenticada,
} from '../middleware/auth.middleware';

const router = Router();

type UsuarioBanco = {
  id: number;
  nome: string;
  email: string;
  senha: string;
  perfil: string;
  ativo: number;
};

function senhaEstaComHash(
  senha: string
) {
  return (
    senha.startsWith('$2a$') ||
    senha.startsWith('$2b$') ||
    senha.startsWith('$2y$')
  );
}

function obterJwtSecret() {
  const secret =
    process.env.JWT_SECRET;

  if (!secret) {
    throw new Error(
      'JWT_SECRET não configurado.'
    );
  }

  return secret;
}

router.post('/login', (req, res) => {
  const email = String(
    req.body?.email || ''
  )
    .trim()
    .toLowerCase();

  const senha = String(
    req.body?.senha || ''
  ).trim();

  if (!email || !senha) {
    return res.status(400).json({
      sucesso: false,
      erro:
        'Informe o e-mail e a senha.',
    });
  }

  db.get(
    `
      SELECT
        id,
        nome,
        email,
        senha,
        perfil,
        ativo
      FROM usuarios
      WHERE LOWER(email) = LOWER(?)
      LIMIT 1
    `,
    [email],
    async (
      erro: Error | null,
      usuario:
        | UsuarioBanco
        | undefined
    ) => {
      if (erro) {
        console.error(
          'Erro ao consultar usuário:',
          erro
        );

        return res.status(500).json({
          sucesso: false,
          erro:
            'Erro ao realizar login.',
        });
      }

      if (!usuario) {
        return res.status(401).json({
          sucesso: false,
          erro:
            'E-mail ou senha inválidos.',
        });
      }

      if (
        Number(usuario.ativo) !== 1
      ) {
        return res.status(403).json({
          sucesso: false,
          erro: 'Usuário inativo.',
        });
      }

      try {
        let senhaValida = false;

        if (
          senhaEstaComHash(
            usuario.senha
          )
        ) {
          senhaValida =
            await bcrypt.compare(
              senha,
              usuario.senha
            );
        } else {
          senhaValida =
            usuario.senha === senha;
        }

        if (!senhaValida) {
          return res
            .status(401)
            .json({
              sucesso: false,
              erro:
                'E-mail ou senha inválidos.',
            });
        }

        const usuarioPublico = {
          id: usuario.id,
          nome: usuario.nome,
          email: usuario.email,
          perfil: usuario.perfil,
        };

        const token = jwt.sign(
          usuarioPublico,
          obterJwtSecret(),
          {
            expiresIn: '8h',
          }
        );

        return res.json({
          sucesso: true,
          token,
          usuario: usuarioPublico,
        });
      } catch (erroLogin) {
        console.error(
          'Erro ao validar login:',
          erroLogin
        );

        return res.status(500).json({
          sucesso: false,
          erro:
            'Erro ao realizar login.',
        });
      }
    }
  );
});

router.get(
  '/me',
  autenticarToken,
  (
    req: RequestAutenticada,
    res
  ) => {
    return res.json({
      sucesso: true,
      usuario: req.usuario,
    });
  }
);

export default router;