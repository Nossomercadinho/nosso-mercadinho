import {salvarCustosSimples} from '../services/custos-simples.service';
import {ErroCusto} from '../domain/custo-real';
import { NextFunction, Response, Router } from 'express';
import { RequestAutenticada } from '../middleware/auth.middleware';
import { atualizarProdutoNaLoja, criarProdutoNaLoja, ErroCatalogo, integrarProdutoNaLoja, listarCatalogoLoja, lojaDoCatalogo, removerProdutoDaLoja } from '../services/catalogo-lojas.service';

const router = Router();
function endpoint(handler: (req: RequestAutenticada, res: Response, lojaId: number) => Promise<unknown>) {
  return async (req: RequestAutenticada, res: Response, next: NextFunction) => {
    try {
      const lojaId = lojaDoCatalogo(req.usuario!, req.lojaAtivaId, req.body?.lojaId ?? req.query.lojaId);
      await handler(req, res, lojaId);
    } catch (error) {
      if (error instanceof ErroCusto) return res.status(400).json({sucesso:false,erro:error.message});
      if (error instanceof ErroCatalogo) return res.status(error.status).json({ sucesso: false, erro: error.message });
      if ((error as any)?.code === 'SQLITE_CONSTRAINT' && (error as Error).message.includes('UNIQUE')) return res.status(409).json({ sucesso: false, erro: 'Este EAN já está cadastrado. Use o catálogo geral para integrar o produto.' });
      next(error);
    }
  };
}
function idProduto(req: RequestAutenticada) {
  const id = Number(req.params.produtoId ?? req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) throw new ErroCatalogo('Produto inválido.');
  return id;
}
router.get(['/loja/catalogo', '/matriz/catalogo'], endpoint(async (_req, res, lojaId) => {
  res.json({ sucesso: true, produtos: await listarCatalogoLoja(lojaId), lojaId });
}));
router.post('/custos/simples',endpoint(async(req,res,lojaId)=>{res.json({sucesso:true,...await salvarCustosSimples(req.body,req.usuario!,lojaId)});}));
router.post('/', endpoint(async (req, res, lojaId) => {
  const produto = await criarProdutoNaLoja(lojaId, req.body || {});
  res.status(produto.reativado ? 200 : 201).json({ sucesso: true, mensagem: 'Produto cadastrado no mercado ativo.', id: produto.id, lojaId });
}));
router.post(['/loja/integrar/:produtoId', '/matriz/integrar/:produtoId'], endpoint(async (req, res, lojaId) => {
  await integrarProdutoNaLoja(lojaId, idProduto(req), req.body || {});
  res.json({ sucesso: true, mensagem: 'Produto adicionado ao mercado ativo.', lojaId });
}));
router.patch(['/loja/:produtoId', '/matriz/:produtoId'], endpoint(async (req, res, lojaId) => {
  await atualizarProdutoNaLoja(lojaId, idProduto(req), req.body || {});
  res.json({ sucesso: true, mensagem: 'Produto atualizado no mercado ativo.', lojaId });
}));
router.put('/:id', endpoint(async (req, res, lojaId) => {
  await atualizarProdutoNaLoja(lojaId, idProduto(req), req.body || {});
  res.json({ sucesso: true, mensagem: 'Produto atualizado no mercado ativo.', lojaId });
}));
router.delete(['/loja/:produtoId', '/matriz/:produtoId', '/:id'], endpoint(async (req, res, lojaId) => {
  await removerProdutoDaLoja(lojaId, idProduto(req));
  res.json({ sucesso: true, mensagem: 'Produto removido apenas do catálogo deste mercado.', lojaId });
}));

export default router;
