import { Router } from 'express';

import {
  permitirPerfis,
  RequestAutenticada,
} from '../middleware/auth.middleware';

import {
  atualizarLimiteCreditoCliente,
  buscarClientePrazoPorId,
  listarClientesPrazo,
  registrarRecebimento,
} from '../services/clientes-prazo.service';

import {
  validarExecutor,
} from '../services/auditoria.service';

const router = Router();

router.get(
  '/',
  permitirPerfis('ADMINISTRADOR', 'CEO', 'CAIXA'),
  async (req, res) => {
    try {
      const clientes = await listarClientesPrazo(
        String(req.query.q || '')
      );

      res.json({
        sucesso: true,
        clientes,
      });
    } catch (error: any) {
      res.status(500).json({
        sucesso: false,
        erro:
          error?.message ||
          'Não foi possível carregar os clientes.',
      });
    }
  }
);

router.get(
  '/:id',
  permitirPerfis('ADMINISTRADOR', 'CEO', 'CAIXA'),
  async (req, res) => {
    try {
      const clienteId = Number(req.params.id);

      if (!clienteId) {
        return res.status(400).json({
          sucesso: false,
          erro: 'Cliente inválido.',
        });
      }

      const dados =
        await buscarClientePrazoPorId(clienteId);

      res.json({
        sucesso: true,
        ...dados,
      });
    } catch (error: any) {
      res.status(400).json({
        sucesso: false,
        erro:
          error?.message ||
          'Não foi possível carregar o cliente.',
      });
    }
  }
);

router.patch(
  '/:id/limite',
  permitirPerfis('ADMINISTRADOR', 'CEO'),
  async (req: RequestAutenticada, res) => {
    try {
      const resultado = await atualizarLimiteCreditoCliente(
        Number(req.params.id),
        req.body?.limiteCredito
      );

      res.json({ sucesso: true, resultado });
    } catch (error: any) {
      res.status(400).json({
        sucesso: false,
        erro: error?.message || 'Não foi possível atualizar o limite de crédito.',
      });
    }
  }
);

router.post(
  '/contas/:contaId/recebimentos',
  permitirPerfis('ADMINISTRADOR', 'CEO'),
  async (req: RequestAutenticada, res) => {
    try {
      const contaReceberId =
        Number(req.params.contaId);

      if (!contaReceberId) {
        return res.status(400).json({
          sucesso: false,
          erro: 'Conta a receber inválida.',
        });
      }

      let executorId: number | undefined;

      if (req.body?.executorCodigo) {
        const executor = await validarExecutor(
          String(req.body.executorCodigo)
        );
        executorId = Number(executor.id);
      }

      const resultado =
        await registrarRecebimento(
          contaReceberId,
          {
            valor: req.body?.valor,
            formaPagamento:
              req.body?.formaPagamento,
            executorId,
            usuarioId:
              Number(req.usuario?.id),
            observacao:
              req.body?.observacao,
          }
        );

      res.status(201).json({
        sucesso: true,
        recebimento: resultado,
      });
    } catch (error: any) {
      res.status(400).json({
        sucesso: false,
        erro:
          error?.message ||
          'Não foi possível registrar o recebimento.',
      });
    }
  }
);

export default router;
