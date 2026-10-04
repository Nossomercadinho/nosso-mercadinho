import { Router } from 'express';

import {
  permitirPerfis,
} from '../middleware/auth.middleware';

import {
  atualizarFechamentoCaixa,
  atualizarLancamentoFinanceiro,
  buscarLancamentoFinanceiroPorId,
  buscarResumoFornecedorFinanceiro,
  cancelarLancamentoFinanceiro,
  criarLancamentoFinanceiro,
  excluirLancamentoFinanceiro,
  listarCategoriasFinanceiras,
  listarFechamentosCaixa,
  listarLancamentosFinanceiros,
  obterFluxoCaixa,
  obterResumoFinanceiro,
  registrarBaixaFinanceira,
  salvarFechamentoCaixa,
} from '../services/financeiro.service';

import {
  lerCodigoBoleto,
} from '../services/boleto.service';

const router = Router();

/*
|--------------------------------------------------------------------------
| LER BOLETO
|--------------------------------------------------------------------------
*/

router.post(
  '/ler-boleto',
  permitirPerfis(
    'ADMINISTRADOR',
    'CEO',
    'OPERADOR'
  ),
  async (req, res) => {
  try {
    const codigo = String(req.body?.codigo || '');
    const resultado = lerCodigoBoleto(codigo);

    res.json({
      sucesso: true,
      resultado,
    });
  } catch (error: any) {
    res.status(400).json({
      sucesso: false,
      erro:
        error?.message ||
        'Não foi possível ler o boleto.',
    });
  }
});

/*
|--------------------------------------------------------------------------
| CATEGORIAS
|--------------------------------------------------------------------------
*/

router.get(
  '/categorias',
  permitirPerfis(
    'ADMINISTRADOR',
    'CEO',
    'OPERADOR'
  ),
  async (req, res) => {
  try {
    const tipo = req.query.tipo
      ? String(req.query.tipo)
      : undefined;

    const categorias =
      await listarCategoriasFinanceiras(
        1,
        tipo as any
      );

    res.json({
      sucesso: true,
      categorias,
    });
  } catch (error: any) {
    res.status(500).json({
      sucesso: false,
      erro:
        error?.message ||
        'Erro ao listar categorias.',
    });
  }
});

/*
|--------------------------------------------------------------------------
| RESUMO
|--------------------------------------------------------------------------
*/

router.get(
  '/resumo',
  permitirPerfis('ADMINISTRADOR', 'CEO'),
  async (req, res) => {
  try {
    const lojaId = req.query.lojaId
      ? Number(req.query.lojaId)
      : undefined;

    const resumo =
      await obterResumoFinanceiro({
        lojaId,
      });

    res.json({
      sucesso: true,
      resumo,
    });
  } catch (error: any) {
    res.status(500).json({
      sucesso: false,
      erro:
        error?.message ||
        'Erro ao carregar resumo financeiro.',
    });
  }
});

/*
|--------------------------------------------------------------------------
| FLUXO DE CAIXA
|--------------------------------------------------------------------------
*/

router.get(
  '/fluxo-caixa',
  permitirPerfis('ADMINISTRADOR', 'CEO'),
  async (req, res) => {
  try {
    const dataInicio =
      String(req.query.dataInicio || '');

    const dataFim =
      String(req.query.dataFim || '');

    const lojaId = req.query.lojaId
      ? Number(req.query.lojaId)
      : undefined;

    const fluxo =
      await obterFluxoCaixa({
        dataInicio,
        dataFim,
        lojaId,
      });

    res.json({
      sucesso: true,
      fluxo,
    });
  } catch (error: any) {
    res.status(400).json({
      sucesso: false,
      erro:
        error?.message ||
        'Erro ao carregar fluxo de caixa.',
    });
  }
});

/*
|--------------------------------------------------------------------------
| FECHAMENTOS DE CAIXA
|--------------------------------------------------------------------------
*/

router.get(
  '/fechamentos-caixa',
  permitirPerfis('ADMINISTRADOR', 'CEO', 'CAIXA'),
  async (req, res) => {
  try {
    const lojaId = req.query.lojaId
      ? Number(req.query.lojaId)
      : undefined;

    const limite = req.query.limite
      ? Number(req.query.limite)
      : 60;

    const fechamentos =
      await listarFechamentosCaixa({
        lojaId,
        limite,
      });

    res.json({
      sucesso: true,
      fechamentos,
    });
  } catch (error: any) {
    res.status(500).json({
      sucesso: false,
      erro:
        error?.message ||
        'Erro ao listar fechamentos de caixa.',
    });
  }
});

router.post(
  '/fechamentos-caixa',
  permitirPerfis('ADMINISTRADOR', 'CEO', 'CAIXA'),
  async (req, res) => {
  try {
    const resultado =
      await salvarFechamentoCaixa(req.body);

    res.status(201).json(resultado);
  } catch (error: any) {
    res.status(400).json({
      sucesso: false,
      erro:
        error?.message ||
        'Erro ao registrar fechamento de caixa.',
    });
  }
});


router.patch(
  '/fechamentos-caixa/:lancamentoId',
  permitirPerfis('ADMINISTRADOR', 'CEO'),
  async (req, res) => {
    try {
      const lancamentoId =
        Number(req.params.lancamentoId);

      const resultado =
        await atualizarFechamentoCaixa(
          lancamentoId,
          req.body
        );

      res.json(resultado);
    } catch (error: any) {
      res.status(400).json({
        sucesso: false,
        erro:
          error?.message ||
          'Erro ao corrigir fechamento de caixa.',
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| RESUMO DO FORNECEDOR
|--------------------------------------------------------------------------
*/

router.get(
  '/fornecedor/:fornecedorId',
  permitirPerfis(
    'ADMINISTRADOR',
    'CEO',
    'OPERADOR'
  ),
  async (req, res) => {
    try {
      const fornecedorId =
        Number(req.params.fornecedorId);

      const resultado =
        await buscarResumoFornecedorFinanceiro(
          fornecedorId
        );

      res.json({
        sucesso: true,
        resultado,
      });
    } catch (error: any) {
      res.status(400).json({
        sucesso: false,
        erro:
          error?.message ||
          'Erro ao consultar fornecedor.',
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| LISTAR
|--------------------------------------------------------------------------
*/

router.get(
  '/',
  permitirPerfis(
    'ADMINISTRADOR',
    'CEO',
    'OPERADOR'
  ),
  async (req, res) => {
  try {
    const lancamentos =
      await listarLancamentosFinanceiros({
        tipo:
          req.query.tipo as any,

        status:
          req.query.status
            ? String(req.query.status)
            : undefined,

        lojaId:
          req.query.lojaId
            ? Number(req.query.lojaId)
            : undefined,

        fornecedorId:
          req.query.fornecedorId
            ? Number(req.query.fornecedorId)
            : undefined,

        categoriaId:
          req.query.categoriaId
            ? Number(req.query.categoriaId)
            : undefined,

        dataInicio:
          req.query.dataInicio
            ? String(req.query.dataInicio)
            : undefined,

        dataFim:
          req.query.dataFim
            ? String(req.query.dataFim)
            : undefined,

        busca:
          req.query.busca
            ? String(req.query.busca)
            : undefined,

        limite:
          req.query.limite
            ? Number(req.query.limite)
            : 500,
      });

    res.json({
      sucesso: true,
      lancamentos,
    });
  } catch (error: any) {
    res.status(500).json({
      sucesso: false,
      erro:
        error?.message ||
        'Erro ao listar lançamentos financeiros.',
    });
  }
});

/*
|--------------------------------------------------------------------------
| CRIAR
|--------------------------------------------------------------------------
*/

router.post(
  '/',
  permitirPerfis(
    'ADMINISTRADOR',
    'CEO',
    'OPERADOR'
  ),
  async (req, res) => {
  try {
    const resultado =
      await criarLancamentoFinanceiro(req.body);

    if (
      !resultado.sucesso &&
      resultado.requerConfirmacaoDuplicidade
    ) {
      res.status(409).json(resultado);
      return;
    }

    res.status(201).json(resultado);
  } catch (error: any) {
    res.status(400).json({
      sucesso: false,
      erro:
        error?.message ||
        'Erro ao criar lançamento financeiro.',
    });
  }
});

/*
|--------------------------------------------------------------------------
| BAIXA
|--------------------------------------------------------------------------
*/

router.post(
  '/:id/baixas',
  permitirPerfis(
    'ADMINISTRADOR',
    'CEO',
    'OPERADOR'
  ),
  async (req, res) => {
  try {
    const id = Number(req.params.id);

    const lancamento =
      await registrarBaixaFinanceira(
        id,
        req.body
      );

    res.json({
      sucesso: true,
      lancamento,
    });
  } catch (error: any) {
    res.status(400).json({
      sucesso: false,
      erro:
        error?.message ||
        'Erro ao realizar baixa financeira.',
    });
  }
});

/*
|--------------------------------------------------------------------------
| CANCELAR
|--------------------------------------------------------------------------
*/

router.post(
  '/:id/cancelar',
  permitirPerfis(
    'ADMINISTRADOR',
    'CEO',
    'OPERADOR'
  ),
  async (req, res) => {
  try {
    const id = Number(req.params.id);

    const lancamento =
      await cancelarLancamentoFinanceiro(
        id,
        req.body?.usuarioId,
        req.body?.motivo
      );

    res.json({
      sucesso: true,
      lancamento,
    });
  } catch (error: any) {
    res.status(400).json({
      sucesso: false,
      erro:
        error?.message ||
        'Erro ao cancelar lançamento.',
    });
  }
});

/*
|--------------------------------------------------------------------------
| EXCLUIR LANÇAMENTO ERRADO
|--------------------------------------------------------------------------
*/

router.delete(
  '/:id',
  permitirPerfis(
    'ADMINISTRADOR',
    'CEO',
    'OPERADOR'
  ),
  async (req, res) => {
  try {
    const id = Number(req.params.id);

    const resultado =
      await excluirLancamentoFinanceiro(
        id,
        req.body?.usuarioId
      );

    res.json(resultado);
  } catch (error: any) {
    res.status(400).json({
      sucesso: false,
      erro:
        error?.message ||
        'Erro ao excluir lançamento.',
    });
  }
});

/*
|--------------------------------------------------------------------------
| ATUALIZAR
|--------------------------------------------------------------------------
*/

router.patch(
  '/:id',
  permitirPerfis(
    'ADMINISTRADOR',
    'CEO',
    'OPERADOR'
  ),
  async (req, res) => {
  try {
    const id = Number(req.params.id);

    const lancamento =
      await atualizarLancamentoFinanceiro(
        id,
        req.body
      );

    res.json({
      sucesso: true,
      lancamento,
    });
  } catch (error: any) {
    res.status(400).json({
      sucesso: false,
      erro:
        error?.message ||
        'Erro ao atualizar lançamento.',
    });
  }
});

/*
|--------------------------------------------------------------------------
| BUSCAR UM LANÇAMENTO
|--------------------------------------------------------------------------
*/

router.get(
  '/:id',
  permitirPerfis(
    'ADMINISTRADOR',
    'CEO',
    'OPERADOR'
  ),
  async (req, res) => {
  try {
    const id = Number(req.params.id);

    const lancamento =
      await buscarLancamentoFinanceiroPorId(id);

    res.json({
      sucesso: true,
      lancamento,
    });
  } catch (error: any) {
    res.status(404).json({
      sucesso: false,
      erro:
        error?.message ||
        'Lançamento não encontrado.',
    });
  }
});

export default router;
