import { Router } from 'express';
import db from '../database/database';
import { escopoLojaSql, possuiEscopoRestrito } from '../services/escopo-lojas.service';
import catalogoLojasRoutes from './catalogo-lojas.routes';

const router = Router();
router.use(catalogoLojasRoutes);

function somenteNumeros(valor: unknown) {
  return String(valor ?? '').replace(/\D/g, '');
}

/*
|--------------------------------------------------------------------------
| LISTAR PRODUTOS
|--------------------------------------------------------------------------
*/

router.get('/', (_req, res) => {
  db.all(
    `
      SELECT
        id,
        ean,
        nome,
        marca,
        foto,
        categoria,
        fornecedor,
        preco_custo,
        preco_venda,
        COALESCE((
          SELECT SUM(es.quantidade)
          FROM estoque_saldos es
          WHERE es.produto_id = produtos.id
            AND ${escopoLojaSql('es.loja_id')}
        ), ${possuiEscopoRestrito() ? '0' : 'estoque'}, 0) AS estoque,
        estoque_minimo,
        unidade_medida,
        ncm,
        cest,
        descricao_ncm,
        ativo,
        criado_em,
        atualizado_em
      FROM produtos
      WHERE ativo = 1
      ORDER BY nome COLLATE NOCASE ASC
    `,
    [],
    (erro, produtos) => {
      if (erro) {
        console.error('Erro ao listar produtos:', erro);

        return res.status(500).json({
          sucesso: false,
          erro: 'Erro ao listar produtos',
        });
      }

      return res.json({
        sucesso: true,
        produtos,
      });
    }
  );
});

/*
|--------------------------------------------------------------------------
| BUSCAR PRODUTO JÁ CADASTRADO
|--------------------------------------------------------------------------
*/

router.get('/salvo/ean/:ean', (req, res) => {
  const ean = somenteNumeros(req.params.ean);

  db.get(
    `
      SELECT produtos.*, COALESCE((SELECT SUM(es.quantidade) FROM estoque_saldos es
        WHERE es.produto_id = produtos.id AND ${escopoLojaSql('es.loja_id')}), ${possuiEscopoRestrito() ? '0' : 'produtos.estoque'}, 0) AS estoque
      FROM produtos
      WHERE ean = ?
        AND ativo = 1
      LIMIT 1
    `,
    [ean],
    (erro, produto) => {
      if (erro) {
        return res.status(500).json({
          sucesso: false,
          erro: 'Erro ao buscar produto',
        });
      }

      if (!produto) {
        return res.status(404).json({
          sucesso: false,
          erro: 'Produto não cadastrado',
        });
      }

      return res.json({
        sucesso: true,
        produto,
      });
    }
  );
});

/*
|--------------------------------------------------------------------------
| CONSULTA EXTERNA PELO EAN
|--------------------------------------------------------------------------
*/

router.get('/ean/:ean', async (req, res) => {
  try {
    const ean = somenteNumeros(req.params.ean);

    if (!ean) {
      return res.status(400).json({
        sucesso: false,
        erro: 'EAN não informado',
      });
    }

    /*
      Primeiro verifica nosso próprio banco.
    */

    const produtoSalvo = await new Promise<any>(
      (resolve, reject) => {
        db.get(
          `
            SELECT *
            FROM produtos
            WHERE ean = ?
              AND ativo = 1
            LIMIT 1
          `,
          [ean],
          (erro, produto) => {
            if (erro) {
              reject(erro);
              return;
            }

            resolve(produto);
          }
        );
      }
    );

    if (produtoSalvo) {
      return res.json({
        sucesso: true,
        origem: 'banco_local',

        produto: {
          nome: produtoSalvo.nome || '',
          marca: produtoSalvo.marca || '',
          foto: produtoSalvo.foto || '',
          ncm: produtoSalvo.ncm || '',
          cest: produtoSalvo.cest || '',
          descricaoNcm:
            produtoSalvo.descricao_ncm || '',
        },
      });
    }

    /*
      Produto ainda não cadastrado:
      consulta base pública de produtos.
    */

    const response = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${ean}.json`
    );

    if (!response.ok) {
      return res.status(404).json({
        sucesso: false,
        erro: 'Produto não encontrado pelo EAN',
      });
    }

    const data: any = await response.json();

    if (
      !data ||
      data.status !== 1 ||
      !data.product
    ) {
      return res.status(404).json({
        sucesso: false,
        erro: 'Produto não encontrado pelo EAN',
      });
    }

    const produto = data.product;

    return res.json({
      sucesso: true,
      origem: 'consulta_ean',

      produto: {
        nome:
          produto.product_name_pt ||
          produto.product_name ||
          produto.generic_name_pt ||
          produto.generic_name ||
          '',

        marca:
          produto.brands ||
          '',

        foto:
          produto.image_front_url ||
          produto.image_url ||
          '',

        /*
          NCM não será inventado.

          Quando a base consultada não fornece NCM confiável,
          deixamos vazio para validação posterior.
        */
        ncm: '',
        cest: '',
        descricaoNcm: '',
      },
    });
  } catch (erro) {
    console.error(
      'Erro na consulta pelo EAN:',
      erro
    );

    return res.status(500).json({
      sucesso: false,
      erro: 'Erro ao consultar produto pelo EAN',
    });
  }
});


export default router;
