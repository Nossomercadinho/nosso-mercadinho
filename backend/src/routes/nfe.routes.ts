import { Router } from 'express';

import {
  permitirPerfis,
} from '../middleware/auth.middleware';
import custoRealRoutes from './custo-real.routes';
import {
  buscarNotaEntradaPorId,
  efetivarNotaEntrada,
  importarNfeXml,
  listarNotasEntrada,
  vincularItemNotaProduto,
} from '../services/nfe.service';

const router = Router();
router.use('/custos',custoRealRoutes);

/*
|--------------------------------------------------------------------------
| LISTAR NOTAS DE ENTRADA
|--------------------------------------------------------------------------
|
| GET /api/nfe
|
| Opcional:
| GET /api/nfe?limite=500
|
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
      const limite =
        Number(
          req.query.limite ||
            200
        );

      const notas =
        await listarNotasEntrada(
          limite
        );

      res.json({
        sucesso: true,
        notas,
      });
    } catch (error: any) {
      console.error(
        'Erro ao listar NF-e:',
        error
      );

      res.status(500).json({
        sucesso: false,
        erro:
          error?.message ||
          'Erro ao listar notas de entrada.',
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| IMPORTAR XML DA NF-E
|--------------------------------------------------------------------------
|
| POST /api/nfe/importar
|
| Body:
|
| {
|   "xml": "<nfeProc>...</nfeProc>",
|   "arquivoNome": "nota.xml",
|   "lojaId": 1,
|   "localEstoqueId": 1,
|   "usuarioId": 1
| }
|
| IMPORTANTE:
|
| Esta rota apenas importa e confere.
| NÃO movimenta o estoque.
|
*/

router.post(
  '/importar',
  permitirPerfis(
    'ADMINISTRADOR',
    'CEO',
    'OPERADOR'
  ),
  async (req, res) => {
    try {
      const {
        xml,

        arquivoNome,

        lojaId,

        localEstoqueId,

        usuarioId,
      } = req.body;

      /*
      |--------------------------------------------------------------------------
      | VALIDAR XML
      |--------------------------------------------------------------------------
      */

      if (
        !xml ||
        typeof xml !==
          'string' ||
        !xml.trim()
      ) {
        res.status(400).json({
          sucesso: false,

          erro:
            'O XML da NF-e não foi informado.',
        });

        return;
      }

      /*
      |--------------------------------------------------------------------------
      | IMPORTAR
      |--------------------------------------------------------------------------
      */

      const resultado =
        await importarNfeXml({
          xml,

          arquivoNome:
            arquivoNome ||
            undefined,

          lojaId:
            lojaId
              ? Number(
                  lojaId
                )
              : null,

          localEstoqueId:
            localEstoqueId
              ? Number(
                  localEstoqueId
                )
              : null,

          usuarioId:
            usuarioId
              ? Number(
                  usuarioId
                )
              : null,
        });

      res.status(201).json({
        sucesso: true,

        mensagem:
          resultado.fornecedor
            .cadastradoAutomaticamente
            ? 'NF-e importada. O fornecedor foi cadastrado automaticamente.'
            : 'NF-e importada com sucesso.',

        resultado,
      });
    } catch (error: any) {
      console.error(
        'Erro ao importar NF-e:',
        error
      );

      const mensagem =
        error?.message ||
        'Erro ao importar NF-e.';

      /*
      |--------------------------------------------------------------------------
      | ERROS DE VALIDAÇÃO
      |--------------------------------------------------------------------------
      */

      if (
        mensagem.includes(
          'já foi importada'
        ) ||
        mensagem.includes(
          'XML não'
        ) ||
        mensagem.includes(
          'não informado'
        ) ||
        mensagem.includes(
          'não encontrada'
        ) ||
        mensagem.includes(
          'não encontrado'
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
| BUSCAR UMA NOTA COMPLETA
|--------------------------------------------------------------------------
|
| GET /api/nfe/1
|
| Retorna:
|
| - dados da nota
| - fornecedor
| - loja
| - itens
| - produtos vinculados
| - parcelas
|
*/
/*
|--------------------------------------------------------------------------
| EFETIVAR ENTRADA
|--------------------------------------------------------------------------
|
| PATCH /api/nfe/1/efetivar
|
*/

router.patch(
  '/:id/efetivar',
  permitirPerfis(
    'ADMINISTRADOR',
    'CEO',
    'OPERADOR'
  ),
  async (req, res) => {
    try {
      const id =
        Number(
          req.params.id
        );

      const usuarioId =
        req.body?.usuarioId
          ? Number(
              req.body.usuarioId
            )
          : null;

      if (
        !Number.isFinite(id) ||
        id <= 0
      ) {
        res.status(400).json({
          sucesso: false,
          erro:
            'Nota de entrada inválida.',
        });

        return;
      }

      const resultado =
        await efetivarNotaEntrada(
          id,
          usuarioId
        );

      res.json({
        sucesso: true,

        mensagem:
          'Entrada da NF-e efetivada com sucesso.',

        nota:
          resultado.nota,

        itens:
          resultado.itens,

        parcelas:
          resultado.parcelas,
      });
    } catch (error: any) {
      console.error(
        'Erro ao efetivar NF-e:',
        error
      );

      const mensagem =
        error?.message ||
        'Erro ao efetivar entrada da NF-e.';

      if (
        mensagem.includes(
          'já foi efetivada'
        )
      ) {
        res.status(409).json({
          sucesso: false,
          erro: mensagem,
        });

        return;
      }

      if (
        mensagem.includes(
          'não encontrada'
        ) ||
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
          'sem produto vinculado'
        ) ||
        mensagem.includes(
          'unidade'
        ) ||
        mensagem.includes(
          'local de estoque'
        ) ||
        mensagem.includes(
          'não pode ser efetivada'
        ) ||
        mensagem.includes(
          'Quantidade inválida'
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

router.get(
  '/:id',
  permitirPerfis(
    'ADMINISTRADOR',
    'CEO',
    'OPERADOR'
  ),
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
            'Nota de entrada inválida.',
        });

        return;
      }

      const resultado =
        await buscarNotaEntradaPorId(
          id
        );

      res.json({
        sucesso: true,
        ...resultado,
      });
    } catch (error: any) {
      console.error(
        'Erro ao consultar NF-e:',
        error
      );

      const mensagem =
        error?.message ||
        'Erro ao consultar NF-e.';

      if (
        mensagem.includes(
          'não encontrada'
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
| VINCULAR ITEM DA NF-E A PRODUTO EXISTENTE
|--------------------------------------------------------------------------
|
| PATCH /api/nfe/itens/15/vincular
|
| Body:
|
| {
|   "produtoId": 10
| }
|
| Exemplo:
|
| Produto do XML:
| Coca Cola Original Lata 350ml
|
| Produto do sistema:
| Coca Cola LT 350ml
|
| Esta rota vincula os dois registros.
|
*/

router.patch(
  '/itens/:itemId/vincular',
  permitirPerfis(
    'ADMINISTRADOR',
    'CEO',
    'OPERADOR'
  ),
  async (req, res) => {
    try {
      const itemId =
        Number(
          req.params.itemId
        );

      const produtoId =
        Number(
          req.body.produtoId
        );

      if (
        !itemId ||
        itemId <= 0
      ) {
        res.status(400).json({
          sucesso: false,
          erro:
            'Item da NF-e inválido.',
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

      const item =
        await vincularItemNotaProduto(
          itemId,
          produtoId
        );

      res.json({
        sucesso: true,

        mensagem:
          'Produto vinculado ao item da NF-e.',

        item,
      });
    } catch (error: any) {
      console.error(
        'Erro ao vincular produto à NF-e:',
        error
      );

      const mensagem =
        error?.message ||
        'Erro ao vincular produto à NF-e.';

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

export default router;
