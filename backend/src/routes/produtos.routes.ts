import { Router } from 'express';
import db from '../database/database';

const router = Router();

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
        estoque,
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
      SELECT *
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


/*
|--------------------------------------------------------------------------
| VINCULAR PRODUTO NOVO SOMENTE À MATRIZ
|--------------------------------------------------------------------------
*/

function vincularProdutoNovoNaMatriz(
  produtoId: number,
  precoVenda: unknown,
  estoqueMinimo: unknown,
  estoqueInicial: unknown,
  callback: (erro?: Error | null) => void
) {
  const preco = Number(precoVenda) || 0;
  const minimo = Number(estoqueMinimo) || 0;
  const quantidade = Number(estoqueInicial) || 0;

  db.run(
    `
      INSERT INTO produtos_lojas (
        produto_id,
        loja_id,
        estoque_minimo,
        preco_venda,
        ativo
      )
      VALUES (?, ?, ?, ?, 1)
    `,
    [
      produtoId,
      MATRIZ_LOJA_ID,
      minimo,
      preco,
    ],
    function (erroVinculo) {
      if (erroVinculo) {
        callback(erroVinculo);
        return;
      }

      db.run(
        `
          INSERT INTO estoque_saldos (
            produto_id,
            loja_id,
            local_id,
            quantidade,
            custo_medio
          )
          VALUES (?, ?, ?, ?, ?)
        `,
        [
          produtoId,
          MATRIZ_LOJA_ID,
          MATRIZ_LOCAL_VENDA_ID,
          quantidade,
          Number(precoCustoSeguro(produtoId)) || 0,
        ],
        function (erroSaldo) {
          if (erroSaldo) {
            callback(erroSaldo);
            return;
          }

          callback(null);
        }
      );
    }
  );
}

/*
 * Busca o custo já gravado no produto não é síncrono no sqlite3.
 * Para o saldo inicial, o custo médio será iniciado em zero e será
 * atualizado normalmente pelas entradas de estoque.
 */
function precoCustoSeguro(_produtoId: number) {
  return 0;
}

/*
|--------------------------------------------------------------------------
| CADASTRAR PRODUTO
|--------------------------------------------------------------------------
*/

router.post('/', (req, res) => {
  const {
    ean,
    nome,
    marca,
    foto,
    categoria,
    fornecedor,
    precoCusto,
    precoVenda,
    estoqueInicial,
    estoqueMinimo,
    unidadeMedida,
    ncm,
    cest,
    descricaoNcm,
  } = req.body;

  const eanLimpo = somenteNumeros(ean);
  const ncmLimpo = somenteNumeros(ncm);

  if (!eanLimpo) {
    return res.status(400).json({
      sucesso: false,
      erro: 'EAN é obrigatório',
    });
  }

  if (!String(nome || '').trim()) {
    return res.status(400).json({
      sucesso: false,
      erro: 'Nome do produto é obrigatório',
    });
  }

  /*
   * Primeiro verificamos se este EAN já existe,
   * inclusive entre produtos excluídos logicamente.
   */
  db.get(
    `
      SELECT *
      FROM produtos
      WHERE ean = ?
      LIMIT 1
    `,
    [eanLimpo],
    (erroBusca, produtoExistente: any) => {
      if (erroBusca) {
        console.error(
          'Erro ao verificar EAN existente:',
          erroBusca
        );

        return res.status(500).json({
          sucesso: false,
          erro: 'Erro ao verificar produto',
        });
      }

      /*
       * Produto já existe e está ativo.
       */
      if (
        produtoExistente &&
        produtoExistente.ativo === 1
      ) {
        return res.status(409).json({
          sucesso: false,
          erro: 'Este EAN já está cadastrado',
        });
      }

      /*
       * Produto existia, mas estava excluído.
       * Reativamos e atualizamos os dados.
       */
      if (
        produtoExistente &&
        produtoExistente.ativo === 0
      ) {
        db.run(
          `
            UPDATE produtos
            SET
              nome = ?,
              marca = ?,
              foto = ?,
              categoria = ?,
              fornecedor = ?,
              preco_custo = ?,
              preco_venda = ?,
              estoque = ?,
              estoque_minimo = ?,
              unidade_medida = ?,
              ncm = ?,
              cest = ?,
              descricao_ncm = ?,
              ativo = 1,
              atualizado_em = CURRENT_TIMESTAMP
            WHERE id = ?
          `,
          [
            String(nome).trim(),
            marca || '',
            foto || '',
            categoria || '',
            fornecedor || '',
            Number(precoCusto) || 0,
            Number(precoVenda) || 0,
            Number(estoqueInicial) || 0,
            Number(estoqueMinimo) || 0,
            unidadeMedida || '',
            ncmLimpo,
            cest || '',
            descricaoNcm || '',
            produtoExistente.id,
          ],
          function (erroReativacao) {
            if (erroReativacao) {
              console.error(
                'Erro ao reativar produto:',
                erroReativacao
              );

              return res.status(500).json({
                sucesso: false,
                erro: 'Erro ao reativar produto',
              });
            }

            vincularProdutoNovoNaMatriz(
              produtoExistente.id,
              precoVenda,
              estoqueMinimo,
              estoqueInicial,
              (erroMatriz) => {
                if (erroMatriz) {
                  console.error(
                    'Produto reativado, mas houve erro ao vinculá-lo à Matriz:',
                    erroMatriz
                  );

                  return res.status(500).json({
                    sucesso: false,
                    erro: 'Produto reativado, mas não foi possível vinculá-lo à Matriz',
                  });
                }

                return res.status(200).json({
                  sucesso: true,
                  mensagem:
                    'Produto reativado e adicionado somente à Matriz',
                  id: produtoExistente.id,
                });
              }
            );
          }
        );

        return;
      }

      /*
       * EAN nunca existiu:
       * cadastra produto normalmente.
       */
      db.run(
        `
          INSERT INTO produtos (
            ean,
            nome,
            marca,
            foto,
            categoria,
            fornecedor,
            preco_custo,
            preco_venda,
            estoque,
            estoque_minimo,
            unidade_medida,
            ncm,
            cest,
            descricao_ncm
          )
          VALUES (
            ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?, ?
          )
        `,
        [
          eanLimpo,
          String(nome).trim(),
          marca || '',
          foto || '',
          categoria || '',
          fornecedor || '',
          Number(precoCusto) || 0,
          Number(precoVenda) || 0,
          Number(estoqueInicial) || 0,
          Number(estoqueMinimo) || 0,
          unidadeMedida || '',
          ncmLimpo,
          cest || '',
          descricaoNcm || '',
        ],
        function (erroCadastro) {
          if (erroCadastro) {
            console.error(
              'Erro ao salvar produto:',
              erroCadastro
            );

            return res.status(500).json({
              sucesso: false,
              erro: 'Erro ao salvar produto',
            });
          }

          const produtoId = this.lastID;

          vincularProdutoNovoNaMatriz(
            produtoId,
            precoVenda,
            estoqueMinimo,
            estoqueInicial,
            (erroMatriz) => {
              if (erroMatriz) {
                console.error(
                  'Produto criado, mas houve erro ao vinculá-lo à Matriz:',
                  erroMatriz
                );

                return res.status(500).json({
                  sucesso: false,
                  erro: 'Produto criado, mas não foi possível vinculá-lo à Matriz',
                });
              }

              return res.status(201).json({
                sucesso: true,
                mensagem:
                  'Produto cadastrado e adicionado somente à Matriz',
                id: produtoId,
              });
            }
          );
        }
      );
    }
  );
});

/*
|--------------------------------------------------------------------------
| CATÁLOGO DA MATRIZ
|--------------------------------------------------------------------------
|
| Loja 1 = MATRIZ
| Local 1 = Área de Venda
|
| O catálogo da Matriz é formado por produtos vinculados à loja 1
| em produtos_lojas e/ou com saldo registrado na Matriz.
|
*/

const MATRIZ_LOJA_ID = 1;
const MATRIZ_LOCAL_VENDA_ID = 1;

router.get('/matriz/catalogo', (_req, res) => {
  db.all(
    `
      SELECT
        p.id,
        p.ean,
        p.nome,
        p.marca,
        p.foto,
        p.categoria,
        COALESCE(pl.preco_venda, 0) AS preco_venda,
        COALESCE(pl.estoque_minimo, 0) AS estoque_minimo,
        p.unidade_medida,
        p.ncm,
        p.cest,
        p.descricao_ncm,
        COALESCE((
          SELECT SUM(es.quantidade)
          FROM estoque_saldos es
          WHERE es.produto_id = p.id
            AND es.local_id = ?
        ), 0) AS quantidade
      FROM produtos p
      INNER JOIN produtos_lojas pl
        ON pl.produto_id = p.id
       AND pl.loja_id = ?
       AND pl.ativo = 1
      WHERE p.ativo = 1
      ORDER BY p.nome COLLATE NOCASE ASC
    `,
    [
      MATRIZ_LOCAL_VENDA_ID,
      MATRIZ_LOJA_ID,
    ],
    (erro, produtos) => {
      if (erro) {
        console.error('Erro ao listar catálogo da Matriz:', erro);

        return res.status(500).json({
          sucesso: false,
          erro: 'Erro ao listar catálogo da Matriz',
        });
      }

      return res.json({
        sucesso: true,
        produtos,
      });
    }
  );
});

router.post('/matriz/integrar/:produtoId', (req, res) => {
  const produtoId = Number(req.params.produtoId);
  const precoVenda = Number(req.body?.precoVenda);
  const estoqueMinimo = Number(req.body?.estoqueMinimo ?? 0);

  if (!produtoId) {
    return res.status(400).json({
      sucesso: false,
      erro: 'Produto inválido',
    });
  }

  if (!Number.isFinite(precoVenda) || precoVenda < 0) {
    return res.status(400).json({
      sucesso: false,
      erro: 'Informe o preço de venda da Matriz',
    });
  }

  db.get(
    `
      SELECT id
      FROM produtos
      WHERE id = ?
        AND ativo = 1
      LIMIT 1
    `,
    [produtoId],
    (erroProduto, produto: any) => {
      if (erroProduto) {
        return res.status(500).json({
          sucesso: false,
          erro: 'Erro ao verificar produto',
        });
      }

      if (!produto) {
        return res.status(404).json({
          sucesso: false,
          erro: 'Produto não encontrado',
        });
      }

      db.get(
        `
          SELECT id
          FROM produtos_lojas
          WHERE produto_id = ?
            AND loja_id = ?
          LIMIT 1
        `,
        [produtoId, MATRIZ_LOJA_ID],
        (erroVinculo, vinculo: any) => {
          if (erroVinculo) {
            return res.status(500).json({
              sucesso: false,
              erro: 'Erro ao verificar vínculo com a Matriz',
            });
          }

          const garantirSaldo = () => {
            db.get(
              `
                SELECT id
                FROM estoque_saldos
                WHERE produto_id = ?
                  AND local_id = ?
                ORDER BY id DESC
                LIMIT 1
              `,
              [produtoId, MATRIZ_LOCAL_VENDA_ID],
              (erroSaldo, saldo: any) => {
                if (erroSaldo) {
                  return res.status(500).json({
                    sucesso: false,
                    erro: 'Erro ao verificar estoque da Matriz',
                  });
                }

                if (saldo) {
                  return res.json({
                    sucesso: true,
                    mensagem: 'Produto integrado à Matriz com preço próprio',
                  });
                }

                db.run(
                  `
                    INSERT INTO estoque_saldos (
                      produto_id,
                      local_id,
                      quantidade,
                      custo_medio
                    ) VALUES (?, ?, 0, 0)
                  `,
                  [produtoId, MATRIZ_LOCAL_VENDA_ID],
                  function (erroInsertSaldo) {
                    if (erroInsertSaldo) {
                      return res.status(500).json({
                        sucesso: false,
                        erro: 'Erro ao criar estoque do produto na Matriz',
                      });
                    }

                    return res.json({
                      sucesso: true,
                      mensagem: 'Produto integrado à Matriz com preço próprio',
                    });
                  }
                );
              }
            );
          };

          if (vinculo) {
            db.run(
              `
                UPDATE produtos_lojas
                SET preco_venda = ?,
                    estoque_minimo = ?,
                    ativo = 1,
                    atualizado_em = CURRENT_TIMESTAMP
                WHERE id = ?
              `,
              [precoVenda, estoqueMinimo, vinculo.id],
              function (erroUpdate) {
                if (erroUpdate) {
                  return res.status(500).json({
                    sucesso: false,
                    erro: 'Erro ao atualizar produto da Matriz',
                  });
                }
                garantirSaldo();
              }
            );
            return;
          }

          db.run(
            `
              INSERT INTO produtos_lojas (
                produto_id,
                loja_id,
                estoque_minimo,
                preco_venda,
                ativo
              ) VALUES (?, ?, ?, ?, 1)
            `,
            [produtoId, MATRIZ_LOJA_ID, estoqueMinimo, precoVenda],
            function (erroInsertVinculo) {
              if (erroInsertVinculo) {
                return res.status(500).json({
                  sucesso: false,
                  erro: 'Erro ao integrar produto à Matriz',
                });
              }

              garantirSaldo();
            }
          );
        }
      );
    }
  );
});


router.patch('/matriz/:produtoId', (req, res) => {
  const produtoId = Number(req.params.produtoId);
  const precoVenda = Number(req.body?.precoVenda);
  const estoqueMinimo = Number(req.body?.estoqueMinimo ?? 0);

  if (!produtoId) {
    return res.status(400).json({ sucesso: false, erro: 'Produto inválido' });
  }

  if (!Number.isFinite(precoVenda) || precoVenda < 0) {
    return res.status(400).json({
      sucesso: false,
      erro: 'Informe o preço de venda da Matriz',
    });
  }

  db.run(
    `
      UPDATE produtos_lojas
      SET preco_venda = ?,
          estoque_minimo = ?,
          atualizado_em = CURRENT_TIMESTAMP
      WHERE produto_id = ?
        AND loja_id = ?
        AND ativo = 1
    `,
    [precoVenda, estoqueMinimo, produtoId, MATRIZ_LOJA_ID],
    function (erro) {
      if (erro) {
        return res.status(500).json({
          sucesso: false,
          erro: 'Erro ao atualizar preço da Matriz',
        });
      }

      if (this.changes === 0) {
        return res.status(404).json({
          sucesso: false,
          erro: 'Produto não está vinculado à Matriz',
        });
      }

      return res.json({
        sucesso: true,
        mensagem: 'Preço da Matriz atualizado com sucesso',
      });
    }
  );
});

router.delete('/matriz/:produtoId', (req, res) => {
  const produtoId = Number(req.params.produtoId);

  if (!produtoId) {
    return res.status(400).json({ sucesso: false, erro: 'Produto inválido' });
  }

  db.run(
    `
      UPDATE produtos_lojas
      SET ativo = 0,
          atualizado_em = CURRENT_TIMESTAMP
      WHERE produto_id = ?
        AND loja_id = ?
    `,
    [produtoId, MATRIZ_LOJA_ID],
    function (erro) {
      if (erro) {
        return res.status(500).json({
          sucesso: false,
          erro: 'Erro ao remover produto da lista da Matriz',
        });
      }

      return res.json({
        sucesso: true,
        mensagem: 'Produto removido somente da lista da Matriz',
      });
    }
  );
});



/*
|--------------------------------------------------------------------------
| EDITAR PRODUTO
|--------------------------------------------------------------------------
*/

router.put('/:id', (req, res) => {
  const id = Number(req.params.id);

  if (!id) {
    return res.status(400).json({
      sucesso: false,
      erro: 'ID inválido',
    });
  }

  const {
    ean,
    nome,
    marca,
    foto,
    categoria,
    fornecedor,
    precoCusto,
    precoVenda,
    estoqueInicial,
    estoqueMinimo,
    unidadeMedida,
    ncm,
    cest,
    descricaoNcm,
  } = req.body;

  const eanLimpo = somenteNumeros(ean);
  const ncmLimpo = somenteNumeros(ncm);

  if (!eanLimpo) {
    return res.status(400).json({
      sucesso: false,
      erro: 'EAN é obrigatório',
    });
  }

  if (!String(nome || '').trim()) {
    return res.status(400).json({
      sucesso: false,
      erro: 'Nome é obrigatório',
    });
  }

  db.run(
    `
      UPDATE produtos
      SET
        ean = ?,
        nome = ?,
        marca = ?,
        foto = ?,
        categoria = ?,
        fornecedor = ?,
        preco_custo = ?,
        preco_venda = ?,
        estoque = ?,
        estoque_minimo = ?,
        unidade_medida = ?,
        ncm = ?,
        cest = ?,
        descricao_ncm = ?,
        atualizado_em = CURRENT_TIMESTAMP
      WHERE id = ?
        AND ativo = 1
    `,
    [
      eanLimpo,
      String(nome).trim(),
      marca || '',
      foto || '',
      categoria || '',
      fornecedor || '',
      Number(precoCusto) || 0,
      Number(precoVenda) || 0,
      Number(estoqueInicial) || 0,
      Number(estoqueMinimo) || 0,
      unidadeMedida || '',
      ncmLimpo,
      cest || '',
      descricaoNcm || '',
      id,
    ],
    function (erro) {
      if (erro) {
        console.error(
          'Erro ao editar produto:',
          erro
        );

        if (
          erro.message?.includes('UNIQUE')
        ) {
          return res.status(409).json({
            sucesso: false,
            erro:
              'Já existe outro produto com este EAN',
          });
        }

        return res.status(500).json({
          sucesso: false,
          erro: 'Erro ao editar produto',
        });
      }

      if (this.changes === 0) {
        return res.status(404).json({
          sucesso: false,
          erro: 'Produto não encontrado',
        });
      }

      return res.json({
        sucesso: true,
        mensagem:
          'Produto atualizado com sucesso',
      });
    }
  );
});

/*
|--------------------------------------------------------------------------
| EXCLUSÃO LÓGICA
|--------------------------------------------------------------------------
*/

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);

  if (!id) {
    return res.status(400).json({
      sucesso: false,
      erro: 'ID inválido',
    });
  }

  db.run(
    `
      UPDATE produtos
      SET
        ativo = 0,
        atualizado_em = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    [id],
    function (erro) {
      if (erro) {
        return res.status(500).json({
          sucesso: false,
          erro: 'Erro ao excluir produto',
        });
      }

      if (this.changes === 0) {
        return res.status(404).json({
          sucesso: false,
          erro: 'Produto não encontrado',
        });
      }

      return res.json({
        sucesso: true,
        mensagem:
          'Produto removido com sucesso',
      });
    }
  );
});

export default router;