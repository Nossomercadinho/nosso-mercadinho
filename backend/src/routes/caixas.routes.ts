import { Router } from 'express';
import { autorizarModulo, RequestAutenticada } from '../middleware/auth.middleware';
import { obterUsuarioAcesso } from '../services/acessos.service';
import { abrirCaixa, fecharCaixa, contextoCaixas, listarSessoesCaixa, detalheSessaoCaixa } from '../services/caixas.service';

const router = Router();
router.use(autorizarModulo('pdv', 'caixas'));
async function usuario(req: RequestAutenticada) {
  const acesso = await obterUsuarioAcesso(Number(req.usuario?.id));
  if (!acesso) throw new Error('Usuário não encontrado ou inativo.');
  return acesso;
}
router.get('/contexto', async (req: RequestAutenticada, res) => {
  try { res.json({ sucesso: true, ...await contextoCaixas(await usuario(req)) }); }
  catch (e: any) { res.status(400).json({ sucesso: false, erro: e.message }); }
});
router.get('/', async (req: RequestAutenticada, res) => {
  try {
    const lojaId = req.query.lojaId ? Number(req.query.lojaId) : undefined;
    if (lojaId !== undefined && (!Number.isSafeInteger(lojaId) || lojaId < 1)) throw new Error('Mercado inválido.');
    res.json({ sucesso: true, sessoes: await listarSessoesCaixa(await usuario(req), lojaId) });
  } catch (e: any) { res.status(400).json({ sucesso: false, erro: e.message }); }
});
router.post('/abrir', autorizarModulo('pdv'), async (req: RequestAutenticada, res) => {
  try { res.status(201).json({ sucesso: true, sessao: await abrirCaixa(await usuario(req), req.body || {}) }); }
  catch (e: any) { res.status(400).json({ sucesso: false, erro: e.message }); }
});
router.post('/:id/fechar', async (req: RequestAutenticada, res) => {
  try { res.json({ sucesso: true, ...await fecharCaixa(await usuario(req), Number(req.params.id), req.body || {}) }); }
  catch (e: any) { res.status(400).json({ sucesso: false, erro: e.message }); }
});
router.get('/:id', async (req: RequestAutenticada, res) => {
  try { res.json({ sucesso: true, ...await detalheSessaoCaixa(await usuario(req), Number(req.params.id)) }); }
  catch (e: any) { res.status(404).json({ sucesso: false, erro: e.message }); }
});
export default router;
