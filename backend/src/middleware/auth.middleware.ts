import {
  NextFunction,
  Request,
  Response,
} from 'express';
import jwt from 'jsonwebtoken';

export type PerfilUsuario =
  | 'ADMINISTRADOR'
  | 'CEO'
  | 'OPERADOR'
  | 'CAIXA';

export type UsuarioToken = {
  id: number;
  nome: string;
  email: string;
  perfil: PerfilUsuario | string;
};

export interface RequestAutenticada
  extends Request {
  usuario?: UsuarioToken;
}

function obterJwtSecret() {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error(
      'JWT_SECRET não configurado.'
    );
  }

  return secret;
}

export function autenticarToken(
  req: RequestAutenticada,
  res: Response,
  next: NextFunction
) {
  const authorization =
    req.headers.authorization;

  if (
    !authorization ||
    !authorization.startsWith('Bearer ')
  ) {
    return res.status(401).json({
      sucesso: false,
      erro: 'Não autenticado.',
    });
  }

  const token =
    authorization.substring(7);

  try {
    const payload = jwt.verify(
      token,
      obterJwtSecret()
    ) as UsuarioToken;

    req.usuario = {
      id: Number(payload.id),
      nome: payload.nome,
      email: payload.email,
      perfil: payload.perfil,
    };

    next();
  } catch {
    return res.status(401).json({
      sucesso: false,
      erro: 'Sessão inválida ou expirada.',
    });
  }
}

export function permitirPerfis(
  ...perfisPermitidos: PerfilUsuario[]
) {
  return (
    req: RequestAutenticada,
    res: Response,
    next: NextFunction
  ) => {
    if (!req.usuario) {
      return res.status(401).json({
        sucesso: false,
        erro: 'Não autenticado.',
      });
    }

    if (
      !perfisPermitidos.includes(
        req.usuario.perfil as PerfilUsuario
      )
    ) {
      return res.status(403).json({
        sucesso: false,
        erro:
          'Você não possui permissão para esta operação.',
      });
    }

    next();
  };
}