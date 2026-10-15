import { NextFunction, Response, Router } from 'express';
import { autorizarModulo, RequestAutenticada } from '../middleware/auth.middleware';
import {
  ErroAcesso,
  excluirPapel,
  listarGestaoAcessos,
  listarPapeis,
  PERMISSOES_DISPONIVEIS,
  salvarPapel,
  salvarUsuario,
} from '../services/acessos.service';

const router = Router();
router.use(autorizarModulo('usuarios'));

function endpoint(handler: (req: RequestAutenticada, res: Response) => Promise<unknown>) {
  return async (req: RequestAutenticada, res: Response, next: NextFunction) => {
    try { await handler(req, res); }
    catch (error) {
      if (error instanceof ErroAcesso) return res.status(error.status).json({ sucesso: false, erro: error.message });
      if ((error as any)?.code === 'SQLITE_CONSTRAINT') return res.status(409).json({ sucesso: false, erro: 'Esses dados já estão em uso. Revise o cadastro.' });
      next(error);
    }
  };
}

router.get('/papeis', endpoint(async (_req, res) => {
  res.json({ sucesso: true, papeis: await listarPapeis(), permissoesDisponiveis: PERMISSOES_DISPONIVEIS });
}));
router.post('/papeis', endpoint(async (req, res) => {
  const papel = await salvarPapel(req.body, req.usuario!.id);
  res.status(201).json({ sucesso: true, papel });
}));
router.put('/papeis/:id', endpoint(async (req, res) => {
  const papel = await salvarPapel(req.body, req.usuario!.id, Number(req.params.id));
  res.json({ sucesso: true, papel });
}));
router.delete('/papeis/:id', endpoint(async (req, res) => {
  await excluirPapel(Number(req.params.id));
  res.json({ sucesso: true });
}));
router.get('/', endpoint(async (_req, res) => {
  res.json({ sucesso: true, ...await listarGestaoAcessos() });
}));
router.post('/', endpoint(async (req, res) => {
  const usuario = await salvarUsuario(req.body, req.usuario!.id);
  res.status(201).json({ sucesso: true, usuario });
}));
router.put('/:id', endpoint(async (req, res) => {
  const usuario = await salvarUsuario(req.body, req.usuario!.id, Number(req.params.id));
  res.json({ sucesso: true, usuario });
}));

export default router;
