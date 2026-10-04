import { Router } from 'express';

import {
  atualizarFornecedor,
  buscarFornecedorPorCpfCnpj,
  buscarFornecedorPorId,
  compararPrecosProduto,
  criarFornecedor,
  desativarFornecedor,
  historicoPrecosFornecedor,
  historicoPrecosProduto,
  listarFornecedores,
  listarFornecedoresProduto,
  listarProdutosFornecedor,
  reativarFornecedor,
  registrarPrecoFornecedor,
  resumoFornecedores,
  vincularProdutoFornecedor,
} from '../services/fornecedores.service';

const router = Router();

/*
|--------------------------------------------------------------------------
| RESUMO
|--------------------------------------------------------------------------
|
| GET /api/fornecedores/resumo
|
*/

router.get(
  '/resumo',
  async (_req, res) => {
    try {
      const resumo =
        await resumoFornecedores();

      res.json({
        sucesso: true,
        resumo,
      });
    } catch (error: any) {
      console.error(
        'Erro ao buscar resumo de fornecedores:',
        error
      );

      res.status(500).json({
        sucesso: false,
        erro:
          error?.message ||
          'Erro ao buscar resumo de fornecedores.',
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| BUSCAR POR CPF / CNPJ
|--------------------------------------------------------------------------
|
| GET /api/fornecedores/documento/12345678000199
|
| Esta rota será muito útil quando importarmos XML.
|
*/

router.get(
  '/documento/:cpfCnpj',
  async (req, res) => {
    try {
      const {
        cpfCnpj,
      } = req.params;

      const fornecedor =
        await buscarFornecedorPorCpfCnpj(
          cpfCnpj
        );

      res.json({
        sucesso: true,
        fornecedor,
      });
    } catch (error: any) {
      console.error(
        'Erro ao buscar fornecedor por CPF/CNPJ:',
        error
      );

      res.status(500).json({
        sucesso: false,
        erro:
          error?.message ||
          'Erro ao buscar fornecedor.',
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| COMPARAR FORNECEDORES DE UM PRODUTO
|--------------------------------------------------------------------------
|
| GET /api/fornecedores/produto/10/comparar
|
*/

router.get(
  '/produto/:produtoId/comparar',
  async (req, res) => {
    try {
      const produtoId =
        Number(
          req.params.produtoId
        );

      if (
        !produtoId ||
        produtoId <= 0
      ) {
        res.status(400).json({
          sucesso: false,
          erro:
            'Produto inválido.',
        });

        return;
      }

      const fornecedores =
        await compararPrecosProduto(
          produtoId
        );

      res.json({
        sucesso: true,
        fornecedores,
      });
    } catch (error: any) {
      console.error(
        'Erro ao comparar fornecedores do produto:',
        error
      );

      res.status(500).json({
        sucesso: false,
        erro:
          error?.message ||
          'Erro ao comparar fornecedores.',
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| FORNECEDORES DE UM PRODUTO
|--------------------------------------------------------------------------
|
| GET /api/fornecedores/produto/10
|
*/

router.get(
  '/produto/:produtoId',
  async (req, res) => {
    try {
      const produtoId =
        Number(
          req.params.produtoId
        );

      if (
        !produtoId ||
        produtoId <= 0
      ) {
        res.status(400).json({
          sucesso: false,
          erro:
            'Produto inválido.',
        });

        return;
      }

      const fornecedores =
        await listarFornecedoresProduto(
          produtoId
        );

      res.json({
        sucesso: true,
        fornecedores,
      });
    } catch (error: any) {
      console.error(
        'Erro ao listar fornecedores do produto:',
        error
      );

      res.status(500).json({
        sucesso: false,
        erro:
          error?.message ||
          'Erro ao listar fornecedores do produto.',
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| HISTÓRICO DE PREÇOS DO PRODUTO
|--------------------------------------------------------------------------
|
| GET /api/fornecedores/produto/10/historico
|
| Opcional:
|
| ?limite=500
|
*/

router.get(
  '/produto/:produtoId/historico',
  async (req, res) => {
    try {
      const produtoId =
        Number(
          req.params.produtoId
        );

      const limite =
        Number(
          req.query.limite ||
          200
        );

      if (
        !produtoId ||
        produtoId <= 0
      ) {
        res.status(400).json({
          sucesso: false,
          erro:
            'Produto inválido.',
        });

        return;
      }

      const historico =
        await historicoPrecosProduto(
          produtoId,
          limite
        );

      res.json({
        sucesso: true,
        historico,
      });
    } catch (error: any) {
      console.error(
        'Erro ao buscar histórico de preços do produto:',
        error
      );

      res.status(500).json({
        sucesso: false,
        erro:
          error?.message ||
          'Erro ao buscar histórico de preços do produto.',
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| LISTAR FORNECEDORES
|--------------------------------------------------------------------------
|
| GET /api/fornecedores
|
| Exemplos:
|
| /api/fornecedores
|
| /api/fornecedores?busca=coca
|
| /api/fornecedores?ativos=1
|
| /api/fornecedores?busca=londrina&ativos=1
|
*/

router.get(
  '/',
  async (req, res) => {
    try {
      const busca =
        typeof req.query.busca ===
        'string'
          ? req.query.busca
          : undefined;

      const somenteAtivos =
        req.query.ativos ===
          '1' ||
        req.query.ativos ===
          'true';

      const fornecedores =
        await listarFornecedores(
          busca,
          somenteAtivos
        );

      res.json({
        sucesso: true,
        fornecedores,
      });
    } catch (error: any) {
      console.error(
        'Erro ao listar fornecedores:',
        error
      );

      res.status(500).json({
        sucesso: false,
        erro:
          error?.message ||
          'Erro ao listar fornecedores.',
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| BUSCAR FORNECEDOR POR ID
|--------------------------------------------------------------------------
|
| GET /api/fornecedores/1
|
*/

router.get(
  '/:id',
  async (req, res) => {
    try {
      const id =
        Number(
          req.params.id
        );

      if (
        !id ||
        id <= 0
      ) {
        res.status(400).json({
          sucesso: false,
          erro:
            'Fornecedor inválido.',
        });

        return;
      }

      const fornecedor =
        await buscarFornecedorPorId(
          id
        );

      res.json({
        sucesso: true,
        fornecedor,
      });
    } catch (error: any) {
      console.error(
        'Erro ao buscar fornecedor:',
        error
      );

      const mensagem =
        error?.message ||
        'Erro ao buscar fornecedor.';

      if (
        mensagem ===
        'Fornecedor não encontrado.'
      ) {
        res.status(404).json({
          sucesso: false,
          erro: mensagem,
        });

        return;
      }

      res.status(500).json({
        sucesso: false,
        erro: mensagem,
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| CRIAR FORNECEDOR
|--------------------------------------------------------------------------
|
| POST /api/fornecedores
|
*/

router.post(
  '/',
  async (req, res) => {
    try {
      const fornecedor =
        await criarFornecedor(
          req.body
        );

      res.status(201).json({
        sucesso: true,
        fornecedor,
      });
    } catch (error: any) {
      console.error(
        'Erro ao criar fornecedor:',
        error
      );

      const mensagem =
        error?.message ||
        'Erro ao criar fornecedor.';

      if (
        mensagem.includes(
          'Já existe'
        ) ||
        mensagem.includes(
          'Informe'
        )
      ) {
        res.status(400).json({
          sucesso: false,
          erro: mensagem,
        });

        return;
      }

      res.status(500).json({
        sucesso: false,
        erro: mensagem,
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| ATUALIZAR FORNECEDOR
|--------------------------------------------------------------------------
|
| PUT /api/fornecedores/1
|
*/

router.put(
  '/:id',
  async (req, res) => {
    try {
      const id =
        Number(
          req.params.id
        );

      if (
        !id ||
        id <= 0
      ) {
        res.status(400).json({
          sucesso: false,
          erro:
            'Fornecedor inválido.',
        });

        return;
      }

      const fornecedor =
        await atualizarFornecedor(
          id,
          req.body
        );

      res.json({
        sucesso: true,
        fornecedor,
      });
    } catch (error: any) {
      console.error(
        'Erro ao atualizar fornecedor:',
        error
      );

      const mensagem =
        error?.message ||
        'Erro ao atualizar fornecedor.';

      if (
        mensagem.includes(
          'não encontrado'
        )
      ) {
        res.status(404).json({
          sucesso: false,
          erro: mensagem,
        });

        return;
      }

      if (
        mensagem.includes(
          'Já existe'
        ) ||
        mensagem.includes(
          'Informe'
        )
      ) {
        res.status(400).json({
          sucesso: false,
          erro: mensagem,
        });

        return;
      }

      res.status(500).json({
        sucesso: false,
        erro: mensagem,
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| DESATIVAR FORNECEDOR
|--------------------------------------------------------------------------
|
| PATCH /api/fornecedores/1/desativar
|
| Não apagamos o histórico.
|
*/

router.patch(
  '/:id/desativar',
  async (req, res) => {
    try {
      const id =
        Number(
          req.params.id
        );

      if (
        !id ||
        id <= 0
      ) {
        res.status(400).json({
          sucesso: false,
          erro:
            'Fornecedor inválido.',
        });

        return;
      }

      const resultado =
        await desativarFornecedor(
          id
        );

      res.json({
        sucesso: true,
        resultado,
      });
    } catch (error: any) {
      console.error(
        'Erro ao desativar fornecedor:',
        error
      );

      const mensagem =
        error?.message ||
        'Erro ao desativar fornecedor.';

      res
        .status(
          mensagem.includes(
            'não encontrado'
          )
            ? 404
            : 500
        )
        .json({
          sucesso: false,
          erro: mensagem,
        });
    }
  }
);

/*
|--------------------------------------------------------------------------
| REATIVAR FORNECEDOR
|--------------------------------------------------------------------------
|
| PATCH /api/fornecedores/1/reativar
|
*/

router.patch(
  '/:id/reativar',
  async (req, res) => {
    try {
      const id =
        Number(
          req.params.id
        );

      if (
        !id ||
        id <= 0
      ) {
        res.status(400).json({
          sucesso: false,
          erro:
            'Fornecedor inválido.',
        });

        return;
      }

      const resultado =
        await reativarFornecedor(
          id
        );

      res.json({
        sucesso: true,
        resultado,
      });
    } catch (error: any) {
      console.error(
        'Erro ao reativar fornecedor:',
        error
      );

      const mensagem =
        error?.message ||
        'Erro ao reativar fornecedor.';

      res
        .status(
          mensagem.includes(
            'não encontrado'
          )
            ? 404
            : 500
        )
        .json({
          sucesso: false,
          erro: mensagem,
        });
    }
  }
);

/*
|--------------------------------------------------------------------------
| PRODUTOS VINCULADOS AO FORNECEDOR
|--------------------------------------------------------------------------
|
| GET /api/fornecedores/1/produtos
|
*/

router.get(
  '/:id/produtos',
  async (req, res) => {
    try {
      const fornecedorId =
        Number(
          req.params.id
        );

      if (
        !fornecedorId ||
        fornecedorId <= 0
      ) {
        res.status(400).json({
          sucesso: false,
          erro:
            'Fornecedor inválido.',
        });

        return;
      }

      const produtos =
        await listarProdutosFornecedor(
          fornecedorId
        );

      res.json({
        sucesso: true,
        produtos,
      });
    } catch (error: any) {
      console.error(
        'Erro ao listar produtos do fornecedor:',
        error
      );

      const mensagem =
        error?.message ||
        'Erro ao listar produtos do fornecedor.';

      res
        .status(
          mensagem.includes(
            'não encontrado'
          )
            ? 404
            : 500
        )
        .json({
          sucesso: false,
          erro: mensagem,
        });
    }
  }
);

/*
|--------------------------------------------------------------------------
| VINCULAR PRODUTO AO FORNECEDOR
|--------------------------------------------------------------------------
|
| POST /api/fornecedores/1/produtos
|
| Body:
|
| {
|   "produtoId": 10,
|   "codigoProdutoFornecedor": "COCA350"
| }
|
*/

router.post(
  '/:id/produtos',
  async (req, res) => {
    try {
      const fornecedorId =
        Number(
          req.params.id
        );

      const produtoId =
        Number(
          req.body.produtoId
        );

      if (
        !fornecedorId ||
        fornecedorId <= 0
      ) {
        res.status(400).json({
          sucesso: false,
          erro:
            'Fornecedor inválido.',
        });

        return;
      }

      if (
        !produtoId ||
        produtoId <= 0
      ) {
        res.status(400).json({
          sucesso: false,
          erro:
            'Produto inválido.',
        });

        return;
      }

      const vinculo =
        await vincularProdutoFornecedor(
          fornecedorId,
          produtoId,
          req.body
            .codigoProdutoFornecedor
        );

      res.status(201).json({
        sucesso: true,
        vinculo,
      });
    } catch (error: any) {
      console.error(
        'Erro ao vincular produto ao fornecedor:',
        error
      );

      const mensagem =
        error?.message ||
        'Erro ao vincular produto ao fornecedor.';

      res
        .status(
          mensagem.includes(
            'não encontrado'
          )
            ? 404
            : 500
        )
        .json({
          sucesso: false,
          erro: mensagem,
        });
    }
  }
);

/*
|--------------------------------------------------------------------------
| REGISTRAR PREÇO / COMPRA
|--------------------------------------------------------------------------
|
| POST /api/fornecedores/1/precos
|
| Exemplo:
|
| {
|   "produtoId": 10,
|   "codigoProdutoFornecedor": "1234",
|   "custoUnitario": 3.89,
|   "quantidade": 48,
|   "numeroNota": "12345",
|   "chaveNfe": "...",
|   "dataCompra": "2026-08-25 10:00:00"
| }
|
*/

router.post(
  '/:id/precos',
  async (req, res) => {
    try {
      const fornecedorId =
        Number(
          req.params.id
        );

      const produtoId =
        Number(
          req.body.produtoId
        );

      if (
        !fornecedorId ||
        fornecedorId <= 0
      ) {
        res.status(400).json({
          sucesso: false,
          erro:
            'Fornecedor inválido.',
        });

        return;
      }

      if (
        !produtoId ||
        produtoId <= 0
      ) {
        res.status(400).json({
          sucesso: false,
          erro:
            'Produto inválido.',
        });

        return;
      }

      const resultado =
        await registrarPrecoFornecedor({
          fornecedorId,

          produtoId,

          codigoProdutoFornecedor:
            req.body
              .codigoProdutoFornecedor,

          custoUnitario:
            req.body
              .custoUnitario,

          quantidade:
            req.body
              .quantidade,

          numeroNota:
            req.body
              .numeroNota,

          chaveNfe:
            req.body
              .chaveNfe,

          dataCompra:
            req.body
              .dataCompra,

          observacao:
            req.body
              .observacao,
        });

      res.status(201).json({
        sucesso: true,
        resultado,
      });
    } catch (error: any) {
      console.error(
        'Erro ao registrar preço do fornecedor:',
        error
      );

      const mensagem =
        error?.message ||
        'Erro ao registrar preço do fornecedor.';

      if (
        mensagem.includes(
          'deve ser maior'
        ) ||
        mensagem.includes(
          'não pode'
        )
      ) {
        res.status(400).json({
          sucesso: false,
          erro: mensagem,
        });

        return;
      }

      if (
        mensagem.includes(
          'não encontrado'
        )
      ) {
        res.status(404).json({
          sucesso: false,
          erro: mensagem,
        });

        return;
      }

      res.status(500).json({
        sucesso: false,
        erro: mensagem,
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| HISTÓRICO DO FORNECEDOR
|--------------------------------------------------------------------------
|
| GET /api/fornecedores/1/historico
|
| Opcional:
|
| ?limite=500
|
*/

router.get(
  '/:id/historico',
  async (req, res) => {
    try {
      const fornecedorId =
        Number(
          req.params.id
        );

      const limite =
        Number(
          req.query.limite ||
          200
        );

      if (
        !fornecedorId ||
        fornecedorId <= 0
      ) {
        res.status(400).json({
          sucesso: false,
          erro:
            'Fornecedor inválido.',
        });

        return;
      }

      const historico =
        await historicoPrecosFornecedor(
          fornecedorId,
          limite
        );

      res.json({
        sucesso: true,
        historico,
      });
    } catch (error: any) {
      console.error(
        'Erro ao buscar histórico do fornecedor:',
        error
      );

      const mensagem =
        error?.message ||
        'Erro ao buscar histórico do fornecedor.';

      res
        .status(
          mensagem.includes(
            'não encontrado'
          )
            ? 404
            : 500
        )
        .json({
          sucesso: false,
          erro: mensagem,
        });
    }
  }
);

export default router;