import { Router } from 'express';

import {
  permitirPerfis,
  RequestAutenticada,
} from '../middleware/auth.middleware';

import {
  entradaEstoque,
  saidaEstoque,
  transferirEstoque,
  novaContagem,
  consultarSaldosProduto,
  consultarEstoque,
  consultarMovimentacoes,
} from '../services/estoque.service';

import {
  validarExecutor,
  registrarAuditoria,
} from '../services/auditoria.service';

const router = Router();

/*
|--------------------------------------------------------------------------
| CONSULTAR ESTOQUE
|--------------------------------------------------------------------------
*/

router.get(
  '/',
  permitirPerfis(
    'ADMINISTRADOR',
    'CEO',
    'OPERADOR',
    'CAIXA'
  ),
  async (req, res) => {
    try {
      const lojaId = req.query.lojaId
        ? Number(req.query.lojaId)
        : undefined;

      const estoque =
        await consultarEstoque(lojaId);

      return res.json({
        sucesso: true,
        estoque,
      });
    } catch (error) {
      console.error('Erro ao consultar estoque:', error);

      return res.status(500).json({
        sucesso: false,
        erro: 'Erro ao consultar estoque',
      });
    }
  }
);

router.get(
  '/produto/:produtoId',
  permitirPerfis(
    'ADMINISTRADOR',
    'CEO',
    'OPERADOR',
    'CAIXA'
  ),
  async (req, res) => {
    try {
      const produtoId =
        Number(req.params.produtoId);

      if (!produtoId) {
        return res.status(400).json({
          sucesso: false,
          erro: 'Produto inválido',
        });
      }

      const saldos =
        await consultarSaldosProduto(
          produtoId
        );

      return res.json({
        sucesso: true,
        saldos,
      });
    } catch (error) {
      console.error(
        'Erro ao consultar saldo:',
        error
      );

      return res.status(500).json({
        sucesso: false,
        erro:
          'Erro ao consultar saldo do produto',
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| HISTÓRICO DE MOVIMENTAÇÕES
|--------------------------------------------------------------------------
|
| Mantido fora do perfil CAIXA.
|
*/

router.get(
  '/movimentacoes',
  permitirPerfis(
    'ADMINISTRADOR',
    'CEO',
    'OPERADOR'
  ),
  async (req, res) => {
    try {
      const produtoId = req.query.produtoId
        ? Number(req.query.produtoId)
        : undefined;

      const limite = req.query.limite
        ? Number(req.query.limite)
        : 100;

      const movimentacoes =
        await consultarMovimentacoes(
          produtoId,
          limite
        );

      return res.json({
        sucesso: true,
        movimentacoes,
      });
    } catch (error) {
      console.error(
        'Erro ao consultar movimentações:',
        error
      );

      return res.status(500).json({
        sucesso: false,
        erro:
          'Erro ao consultar movimentações',
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| ENTRADA DE ESTOQUE
|--------------------------------------------------------------------------
|
| Entrada administrativa/NF permanece restrita.
|
*/

router.post(
  '/entrada',
  permitirPerfis(
    'ADMINISTRADOR',
    'CEO',
    'OPERADOR'
  ),
  async (
    req: RequestAutenticada,
    res
  ) => {
    try {
      const codigoExecutor =
        String(
          req.body?.codigoExecutor || ''
        ).trim();

      const executor =
        await validarExecutor(
          codigoExecutor
        );

      const resultado =
        await entradaEstoque({
          ...req.body,
          usuarioId:
            req.usuario?.id || null,
        });

      await registrarAuditoria({
        executorId: executor.id,
        usuarioSessaoId:
          req.usuario?.id || null,
        modulo: 'ESTOQUE',
        acao: 'ENTRADA_ESTOQUE',
        entidade:
          'movimentacoes_estoque',
        entidadeId:
          resultado.movimentacaoId ||
          null,
        descricao:
          `Entrada de estoque realizada por ${executor.nome}.`,
      });

      return res.status(201).json({
        sucesso: true,
        mensagem:
          'Entrada registrada com sucesso',
        resultado,
        executor: {
          id: executor.id,
          codigo: executor.codigo,
          nome: executor.nome,
        },
      });
    } catch (error: any) {
      console.error(
        'Erro na entrada:',
        error
      );

      return res.status(400).json({
        sucesso: false,
        erro:
          error?.message ||
          'Erro ao registrar entrada',
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| SAÍDA DE ESTOQUE
|--------------------------------------------------------------------------
|
| Saída manual permanece restrita.
|
*/

router.post(
  '/saida',
  permitirPerfis(
    'ADMINISTRADOR',
    'CEO',
    'OPERADOR'
  ),
  async (
    req: RequestAutenticada,
    res
  ) => {
    try {
      const codigoExecutor =
        String(
          req.body?.codigoExecutor || ''
        ).trim();

      const executor =
        await validarExecutor(
          codigoExecutor
        );

      const resultado =
        await saidaEstoque({
          ...req.body,
          usuarioId:
            req.usuario?.id || null,
        });

      await registrarAuditoria({
        executorId: executor.id,
        usuarioSessaoId:
          req.usuario?.id || null,
        modulo: 'ESTOQUE',
        acao: 'SAIDA_ESTOQUE',
        entidade:
          'movimentacoes_estoque',
        entidadeId:
          resultado.movimentacaoId ||
          null,
        descricao:
          `Saída de estoque realizada por ${executor.nome}.`,
      });

      return res.json({
        sucesso: true,
        mensagem:
          'Saída registrada com sucesso',
        resultado,
        executor: {
          id: executor.id,
          codigo: executor.codigo,
          nome: executor.nome,
        },
      });
    } catch (error: any) {
      console.error(
        'Erro na saída:',
        error
      );

      return res.status(400).json({
        sucesso: false,
        erro:
          error?.message ||
          'Erro ao registrar saída',
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| REPOSIÇÃO / TRANSFERÊNCIA
|--------------------------------------------------------------------------
|
| CAIXA pode realizar a operação, mas o executor é obrigatório
| e a movimentação fica registrada na auditoria.
|
*/

router.post(
  '/transferir',
  permitirPerfis(
    'ADMINISTRADOR',
    'CEO',
    'OPERADOR',
    'CAIXA'
  ),
  async (
    req: RequestAutenticada,
    res
  ) => {
    try {
      const codigoExecutor =
        String(
          req.body?.codigoExecutor || ''
        ).trim();

      const executor =
        await validarExecutor(
          codigoExecutor
        );

      const resultado =
        await transferirEstoque({
          ...req.body,
          usuarioId:
            req.usuario?.id || null,
        });

      const tipo =
        String(
          req.body?.tipo || ''
        ).toUpperCase();

      const reposicao =
        tipo === 'REPOSICAO';

      await registrarAuditoria({
        executorId: executor.id,
        usuarioSessaoId:
          req.usuario?.id || null,
        modulo: 'ESTOQUE',
        acao: reposicao
          ? 'REPOSICAO_ESTOQUE'
          : 'TRANSFERENCIA_ESTOQUE',
        entidade:
          'movimentacoes_estoque',
        entidadeId:
          resultado.movimentacaoId ||
          null,
        descricao: reposicao
          ? `Reposição de estoque realizada por ${executor.nome}.`
          : `Transferência de estoque realizada por ${executor.nome}.`,
      });

      return res.json({
        sucesso: true,
        mensagem: reposicao
          ? 'Reposição registrada com sucesso'
          : 'Transferência registrada com sucesso',
        resultado,
        executor: {
          id: executor.id,
          codigo: executor.codigo,
          nome: executor.nome,
        },
      });
    } catch (error: any) {
      console.error(
        'Erro na transferência:',
        error
      );

      return res.status(400).json({
        sucesso: false,
        erro:
          error?.message ||
          'Erro ao transferir estoque',
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| NOVA CONTAGEM / INVENTÁRIO
|--------------------------------------------------------------------------
|
| Permitido ao CAIXA com identificação obrigatória do executor.
|
*/

router.post(
  '/nova-contagem',
  permitirPerfis(
    'ADMINISTRADOR',
    'CEO',
    'OPERADOR',
    'CAIXA'
  ),
  async (
    req: RequestAutenticada,
    res
  ) => {
    try {
      const codigoExecutor =
        String(
          req.body?.codigoExecutor || ''
        ).trim();

      const executor =
        await validarExecutor(
          codigoExecutor
        );

      const resultado =
        await novaContagem({
          ...req.body,
          usuarioId:
            req.usuario?.id || null,
        });

      await registrarAuditoria({
        executorId: executor.id,
        usuarioSessaoId:
          req.usuario?.id || null,
        modulo: 'ESTOQUE',
        acao: 'NOVA_CONTAGEM',
        entidade: 'produto',
        entidadeId:
          req.body?.produtoId
            ? Number(
                req.body.produtoId
              )
            : null,
        descricao:
          resultado.alterado
            ? `Contagem realizada por ${executor.nome} com ajuste de saldo.`
            : `Contagem realizada por ${executor.nome} sem divergência.`,
      });

      return res.json({
        sucesso: true,
        mensagem:
          resultado.alterado
            ? 'Contagem registrada e saldo ajustado'
            : 'Contagem registrada sem divergência',
        resultado,
        executor: {
          id: executor.id,
          codigo: executor.codigo,
          nome: executor.nome,
        },
      });
    } catch (error: any) {
      console.error(
        'Erro na nova contagem:',
        error
      );

      return res.status(400).json({
        sucesso: false,
        erro:
          error?.message ||
          'Erro ao registrar nova contagem',
      });
    }
  }
);

export default router;