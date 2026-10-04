import { Router } from 'express';

import {
  permitirPerfis,
  RequestAutenticada,
} from '../middleware/auth.middleware';

import {
  buscarProdutoPdv,
  pesquisarProdutosPdv,
  buscarVendaPorId,
  criarVenda,
  listarLocaisPdv,
  PDV_MATRIZ_LOJA_ID,
  PDV_MATRIZ_LOCAL_ID,
} from '../services/vendas.service';

import {
  validarExecutor,
} from '../services/auditoria.service';

const router = Router();

function perfilDaRequisicao(req: RequestAutenticada) {
  return String(req.usuario?.perfil || '').toUpperCase();
}

function destinoPdv(req: RequestAutenticada) {
  if (perfilDaRequisicao(req) === 'CAIXA') {
    return {
      lojaId: PDV_MATRIZ_LOJA_ID,
      localId: PDV_MATRIZ_LOCAL_ID,
    };
  }

  return {
    lojaId: Number(req.query.lojaId ?? req.body?.lojaId),
    localId: Number(req.query.localId ?? req.body?.localId),
  };
}

router.get(
  '/pdv/locais',
  permitirPerfis('ADMINISTRADOR', 'CEO', 'CAIXA'),
  async (_req, res) => {
    try {
      const locais = await listarLocaisPdv();
      res.json({ sucesso: true, locais });
    } catch (error: any) {
      res.status(500).json({
        sucesso: false,
        erro: error?.message || 'Não foi possível carregar os locais de venda.',
      });
    }
  }
);

router.get(
  '/pdv/pesquisar',
  permitirPerfis('ADMINISTRADOR', 'CEO', 'CAIXA'),
  async (req: RequestAutenticada, res) => {
    try {
      const { lojaId, localId } = destinoPdv(req);
      const termo = String(req.query.q || '').trim();

      if (!lojaId || !localId) {
        return res.status(400).json({
          sucesso: false,
          erro: 'Informe loja e local do PDV.',
        });
      }

      const produtos = await pesquisarProdutosPdv(termo, lojaId, localId, 20);
      res.json({ sucesso: true, produtos });
    } catch (error: any) {
      res.status(400).json({
        sucesso: false,
        erro: error?.message || 'Não foi possível pesquisar os produtos.',
      });
    }
  }
);

router.get(
  '/pdv/produto/:ean',
  permitirPerfis('ADMINISTRADOR', 'CEO', 'CAIXA'),
  async (req: RequestAutenticada, res) => {
    try {
      const { lojaId, localId } = destinoPdv(req);

      if (!lojaId || !localId) {
        return res.status(400).json({
          sucesso: false,
          erro: 'Informe loja e local do PDV.',
        });
      }

      const produto = await buscarProdutoPdv(
        String(req.params.ean || ''),
        lojaId,
        localId
      );

      res.json({ sucesso: true, produto });
    } catch (error: any) {
      res.status(400).json({
        sucesso: false,
        erro: error?.message || 'Não foi possível localizar o produto.',
      });
    }
  }
);

router.post(
  '/',
  permitirPerfis('ADMINISTRADOR', 'CEO', 'CAIXA'),
  async (req: RequestAutenticada, res) => {
    try {
      const executor = await validarExecutor(req.body?.codigoExecutor);
      const { lojaId, localId } = destinoPdv(req);

      const resultado = await criarVenda({
        lojaId,
        localId,
        executorId: executor.id,
        usuarioId: Number(req.usuario?.id),
        itens: Array.isArray(req.body?.itens) ? req.body.itens : [],
        pagamentos: Array.isArray(req.body?.pagamentos) ? req.body.pagamentos : [],
        observacao: req.body?.observacao,
        cliente: req.body?.cliente
          ? {
              id: Number(req.body.cliente.id || 0) || undefined,
              nome: String(req.body.cliente.nome || ''),
              cpf: String(req.body.cliente.cpf || ''),
              telefone: String(req.body.cliente.telefone || ''),
            }
          : undefined,
      });

      res.status(201).json({ ...resultado, executor });
    } catch (error: any) {
      res.status(400).json({
        sucesso: false,
        erro: error?.message || 'Não foi possível concluir a venda.',
      });
    }
  }
);

router.get(
  '/:id',
  permitirPerfis('ADMINISTRADOR', 'CEO'),
  async (req, res) => {
    try {
      const venda = await buscarVendaPorId(Number(req.params.id));
      res.json({ sucesso: true, venda });
    } catch (error: any) {
      res.status(404).json({
        sucesso: false,
        erro: error?.message || 'Venda não encontrada.',
      });
    }
  }
);

export default router;
