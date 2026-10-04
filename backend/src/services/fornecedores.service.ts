import db from '../database/database';

/*
|--------------------------------------------------------------------------
| TIPOS
|--------------------------------------------------------------------------
*/

export type FornecedorPayload = {
  empresaId?: number | null;

  tipoPessoa?: 'FISICA' | 'JURIDICA';

  nomeFantasia?: string;
  razaoSocial: string;

  cpfCnpj?: string;

  inscricaoEstadual?: string;
  inscricaoMunicipal?: string;

  telefone?: string;
  whatsapp?: string;

  email?: string;
  site?: string;

  contatoNome?: string;
  contatoCargo?: string;
  contatoTelefone?: string;
  contatoEmail?: string;

  cep?: string;

  endereco?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;

  cidade?: string;
  estado?: string;

  prazoPagamentoDias?: number | string;

  observacao?: string;

  ativo?: number | boolean;
};

export type VinculoFornecedorProdutoPayload = {
  fornecedorId: number;

  produtoId: number;

  codigoProdutoFornecedor?: string;

  custoUnitario?: number | string;

  quantidade?: number | string;

  numeroNota?: string;
  chaveNfe?: string;

  dataCompra?: string;

  observacao?: string;
};

/*
|--------------------------------------------------------------------------
| HELPERS SQLITE
|--------------------------------------------------------------------------
*/

function executarRun(
  sql: string,
  parametros: any[] = []
): Promise<{
  lastID: number;
  changes: number;
}> {
  return new Promise(
    (resolve, reject) => {
      db.run(
        sql,
        parametros,
        function (erro) {
          if (erro) {
            reject(erro);
            return;
          }

          resolve({
            lastID: this.lastID,
            changes: this.changes,
          });
        }
      );
    }
  );
}

function executarGet<T = any>(
  sql: string,
  parametros: any[] = []
): Promise<T | undefined> {
  return new Promise(
    (resolve, reject) => {
      db.get(
        sql,
        parametros,
        (
          erro,
          resultado
        ) => {
          if (erro) {
            reject(erro);
            return;
          }

          resolve(
            resultado as
              | T
              | undefined
          );
        }
      );
    }
  );
}

function executarAll<T = any>(
  sql: string,
  parametros: any[] = []
): Promise<T[]> {
  return new Promise(
    (resolve, reject) => {
      db.all(
        sql,
        parametros,
        (
          erro,
          resultados
        ) => {
          if (erro) {
            reject(erro);
            return;
          }

          resolve(
            resultados as T[]
          );
        }
      );
    }
  );
}

/*
|--------------------------------------------------------------------------
| NORMALIZAÇÕES
|--------------------------------------------------------------------------
*/

function somenteNumeros(
  valor?: string | null
) {
  if (!valor) {
    return '';
  }

  return String(valor).replace(
    /\D/g,
    ''
  );
}

function textoOuNull(
  valor?: string | null
) {
  const texto =
    String(
      valor ?? ''
    ).trim();

  return texto || null;
}

function numero(
  valor:
    | number
    | string
    | null
    | undefined
) {
  if (
    valor === null ||
    valor === undefined ||
    valor === ''
  ) {
    return 0;
  }

  if (
    typeof valor === 'number'
  ) {
    return Number.isFinite(
      valor
    )
      ? valor
      : 0;
  }

  const convertido =
    Number(
      String(valor)
        .trim()
        .replace(
          /\./g,
          ''
        )
        .replace(
          ',',
          '.'
        )
    );

  return Number.isFinite(
    convertido
  )
    ? convertido
    : 0;
}

function normalizarAtivo(
  valor:
    | boolean
    | number
    | undefined
) {
  if (
    valor === undefined
  ) {
    return 1;
  }

  if (
    typeof valor ===
    'boolean'
  ) {
    return valor
      ? 1
      : 0;
  }

  return Number(valor)
    ? 1
    : 0;
}

/*
|--------------------------------------------------------------------------
| VALIDAR FORNECEDOR
|--------------------------------------------------------------------------
*/

async function validarFornecedor(
  fornecedorId: number
) {
  const fornecedor =
    await executarGet(
      `
        SELECT
          id,
          ativo

        FROM fornecedores

        WHERE id = ?

        LIMIT 1
      `,
      [
        fornecedorId,
      ]
    );

  if (!fornecedor) {
    throw new Error(
      'Fornecedor não encontrado.'
    );
  }

  return fornecedor;
}

/*
|--------------------------------------------------------------------------
| VALIDAR PRODUTO
|--------------------------------------------------------------------------
*/

async function validarProduto(
  produtoId: number
) {
  const produto =
    await executarGet(
      `
        SELECT
          id,
          nome,
          ativo

        FROM produtos

        WHERE id = ?

        LIMIT 1
      `,
      [
        produtoId,
      ]
    );

  if (!produto) {
    throw new Error(
      'Produto não encontrado.'
    );
  }

  return produto;
}

/*
|--------------------------------------------------------------------------
| LISTAR FORNECEDORES
|--------------------------------------------------------------------------
*/

export async function listarFornecedores(
  busca?: string,
  somenteAtivos = false
) {
  let sql = `
    SELECT
      f.id,

      f.empresa_id,

      f.tipo_pessoa,

      f.nome_fantasia,
      f.razao_social,

      f.cpf_cnpj,

      f.inscricao_estadual,
      f.inscricao_municipal,

      f.telefone,
      f.whatsapp,

      f.email,
      f.site,

      f.contato_nome,
      f.contato_cargo,
      f.contato_telefone,
      f.contato_email,

      f.cep,

      f.endereco,
      f.numero,
      f.complemento,
      f.bairro,

      f.cidade,
      f.estado,

      f.prazo_pagamento_dias,

      f.observacao,

      f.ativo,

      f.criado_em,
      f.atualizado_em,

      (
        SELECT COUNT(*)

        FROM fornecedor_produtos fp

        WHERE
          fp.fornecedor_id =
          f.id
      )
        AS total_produtos,

      (
        SELECT COUNT(*)

        FROM fornecedor_precos_historico fph

        WHERE
          fph.fornecedor_id =
          f.id
      )
        AS total_compras_registradas

    FROM fornecedores f

    WHERE 1 = 1
  `;

  const parametros:
    any[] = [];

  if (somenteAtivos) {
    sql += `
      AND f.ativo = 1
    `;
  }

  if (
    busca &&
    busca.trim()
  ) {
    const termo =
      `%${busca.trim()}%`;

    sql += `
      AND (
        f.nome_fantasia LIKE ?
        OR
        f.razao_social LIKE ?
        OR
        f.cpf_cnpj LIKE ?
        OR
        f.telefone LIKE ?
        OR
        f.whatsapp LIKE ?
        OR
        f.email LIKE ?
        OR
        f.cidade LIKE ?
      )
    `;

    parametros.push(
      termo,
      termo,
      termo,
      termo,
      termo,
      termo,
      termo
    );
  }

  sql += `
    ORDER BY
      CASE
        WHEN
          f.nome_fantasia IS NOT NULL
          AND
          TRIM(f.nome_fantasia) <> ''
        THEN f.nome_fantasia

        ELSE f.razao_social
      END
      COLLATE NOCASE
  `;

  return executarAll(
    sql,
    parametros
  );
}

/*
|--------------------------------------------------------------------------
| BUSCAR FORNECEDOR POR ID
|--------------------------------------------------------------------------
*/

export async function buscarFornecedorPorId(
  id: number
) {
  const fornecedor =
    await executarGet(
      `
        SELECT
          f.*

        FROM fornecedores f

        WHERE f.id = ?

        LIMIT 1
      `,
      [
        id,
      ]
    );

  if (!fornecedor) {
    throw new Error(
      'Fornecedor não encontrado.'
    );
  }

  return fornecedor;
}

/*
|--------------------------------------------------------------------------
| BUSCAR FORNECEDOR POR CPF / CNPJ
|--------------------------------------------------------------------------
|
| Será especialmente útil na importação do XML.
|
*/

export async function buscarFornecedorPorCpfCnpj(
  cpfCnpj: string
) {
  const documento =
    somenteNumeros(
      cpfCnpj
    );

  if (!documento) {
    return null;
  }

  const fornecedor =
    await executarGet(
      `
        SELECT
          *

        FROM fornecedores

        WHERE cpf_cnpj = ?

        LIMIT 1
      `,
      [
        documento,
      ]
    );

  return fornecedor || null;
}

/*
|--------------------------------------------------------------------------
| CRIAR FORNECEDOR
|--------------------------------------------------------------------------
*/

export async function criarFornecedor(
  dados: FornecedorPayload
) {
  const razaoSocial =
    String(
      dados.razaoSocial ||
      ''
    ).trim();

  if (!razaoSocial) {
    throw new Error(
      'Informe a razão social ou nome do fornecedor.'
    );
  }

  const cpfCnpj =
    somenteNumeros(
      dados.cpfCnpj
    );

  if (cpfCnpj) {
    const existente =
      await buscarFornecedorPorCpfCnpj(
        cpfCnpj
      );

    if (existente) {
      throw new Error(
        'Já existe um fornecedor cadastrado com este CPF/CNPJ.'
      );
    }
  }

  const prazoPagamentoDias =
    Math.max(
      0,
      Math.trunc(
        numero(
          dados.prazoPagamentoDias
        )
      )
    );

  const resultado =
    await executarRun(
      `
        INSERT INTO fornecedores (
          empresa_id,

          tipo_pessoa,

          nome_fantasia,
          razao_social,

          cpf_cnpj,

          inscricao_estadual,
          inscricao_municipal,

          telefone,
          whatsapp,

          email,
          site,

          contato_nome,
          contato_cargo,
          contato_telefone,
          contato_email,

          cep,

          endereco,
          numero,
          complemento,
          bairro,

          cidade,
          estado,

          prazo_pagamento_dias,

          observacao,

          ativo
        )

        VALUES (
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?
        )
      `,
      [
        dados.empresaId ??
          1,

        dados.tipoPessoa ||
          'JURIDICA',

        textoOuNull(
          dados.nomeFantasia
        ),

        razaoSocial,

        cpfCnpj ||
          null,

        textoOuNull(
          dados.inscricaoEstadual
        ),

        textoOuNull(
          dados.inscricaoMunicipal
        ),

        textoOuNull(
          dados.telefone
        ),

        textoOuNull(
          dados.whatsapp
        ),

        textoOuNull(
          dados.email
        ),

        textoOuNull(
          dados.site
        ),

        textoOuNull(
          dados.contatoNome
        ),

        textoOuNull(
          dados.contatoCargo
        ),

        textoOuNull(
          dados.contatoTelefone
        ),

        textoOuNull(
          dados.contatoEmail
        ),

        somenteNumeros(
          dados.cep
        ) ||
          null,

        textoOuNull(
          dados.endereco
        ),

        textoOuNull(
          dados.numero
        ),

        textoOuNull(
          dados.complemento
        ),

        textoOuNull(
          dados.bairro
        ),

        textoOuNull(
          dados.cidade
        ),

        textoOuNull(
          dados.estado
        )
          ?.toUpperCase() ||
          null,

        prazoPagamentoDias,

        textoOuNull(
          dados.observacao
        ),

        normalizarAtivo(
          dados.ativo
        ),
      ]
    );

  return buscarFornecedorPorId(
    resultado.lastID
  );
}

/*
|--------------------------------------------------------------------------
| ATUALIZAR FORNECEDOR
|--------------------------------------------------------------------------
*/

export async function atualizarFornecedor(
  id: number,
  dados: FornecedorPayload
) {
  await validarFornecedor(
    id
  );

  const razaoSocial =
    String(
      dados.razaoSocial ||
      ''
    ).trim();

  if (!razaoSocial) {
    throw new Error(
      'Informe a razão social ou nome do fornecedor.'
    );
  }

  const cpfCnpj =
    somenteNumeros(
      dados.cpfCnpj
    );

  if (cpfCnpj) {
    const outro =
      await executarGet(
        `
          SELECT id

          FROM fornecedores

          WHERE cpf_cnpj = ?
            AND id <> ?

          LIMIT 1
        `,
        [
          cpfCnpj,
          id,
        ]
      );

    if (outro) {
      throw new Error(
        'Já existe outro fornecedor cadastrado com este CPF/CNPJ.'
      );
    }
  }

  const prazoPagamentoDias =
    Math.max(
      0,
      Math.trunc(
        numero(
          dados.prazoPagamentoDias
        )
      )
    );

  await executarRun(
    `
      UPDATE fornecedores

      SET
        empresa_id = ?,

        tipo_pessoa = ?,

        nome_fantasia = ?,
        razao_social = ?,

        cpf_cnpj = ?,

        inscricao_estadual = ?,
        inscricao_municipal = ?,

        telefone = ?,
        whatsapp = ?,

        email = ?,
        site = ?,

        contato_nome = ?,
        contato_cargo = ?,
        contato_telefone = ?,
        contato_email = ?,

        cep = ?,

        endereco = ?,
        numero = ?,
        complemento = ?,
        bairro = ?,

        cidade = ?,
        estado = ?,

        prazo_pagamento_dias = ?,

        observacao = ?,

        ativo = ?,

        atualizado_em =
          CURRENT_TIMESTAMP

      WHERE id = ?
    `,
    [
      dados.empresaId ??
        1,

      dados.tipoPessoa ||
        'JURIDICA',

      textoOuNull(
        dados.nomeFantasia
      ),

      razaoSocial,

      cpfCnpj ||
        null,

      textoOuNull(
        dados.inscricaoEstadual
      ),

      textoOuNull(
        dados.inscricaoMunicipal
      ),

      textoOuNull(
        dados.telefone
      ),

      textoOuNull(
        dados.whatsapp
      ),

      textoOuNull(
        dados.email
      ),

      textoOuNull(
        dados.site
      ),

      textoOuNull(
        dados.contatoNome
      ),

      textoOuNull(
        dados.contatoCargo
      ),

      textoOuNull(
        dados.contatoTelefone
      ),

      textoOuNull(
        dados.contatoEmail
      ),

      somenteNumeros(
        dados.cep
      ) ||
        null,

      textoOuNull(
        dados.endereco
      ),

      textoOuNull(
        dados.numero
      ),

      textoOuNull(
        dados.complemento
      ),

      textoOuNull(
        dados.bairro
      ),

      textoOuNull(
        dados.cidade
      ),

      textoOuNull(
        dados.estado
      )
        ?.toUpperCase() ||
        null,

      prazoPagamentoDias,

      textoOuNull(
        dados.observacao
      ),

      normalizarAtivo(
        dados.ativo
      ),

      id,
    ]
  );

  return buscarFornecedorPorId(
    id
  );
}

/*
|--------------------------------------------------------------------------
| DESATIVAR FORNECEDOR
|--------------------------------------------------------------------------
|
| Evitamos apagar definitivamente fornecedores que já tenham histórico.
|
*/

export async function desativarFornecedor(
  id: number
) {
  await validarFornecedor(
    id
  );

  await executarRun(
    `
      UPDATE fornecedores

      SET
        ativo = 0,
        atualizado_em =
          CURRENT_TIMESTAMP

      WHERE id = ?
    `,
    [
      id,
    ]
  );

  return {
    sucesso: true,
    id,
  };
}

/*
|--------------------------------------------------------------------------
| REATIVAR FORNECEDOR
|--------------------------------------------------------------------------
*/

export async function reativarFornecedor(
  id: number
) {
  await validarFornecedor(
    id
  );

  await executarRun(
    `
      UPDATE fornecedores

      SET
        ativo = 1,
        atualizado_em =
          CURRENT_TIMESTAMP

      WHERE id = ?
    `,
    [
      id,
    ]
  );

  return {
    sucesso: true,
    id,
  };
}

/*
|--------------------------------------------------------------------------
| PRODUTOS DO FORNECEDOR
|--------------------------------------------------------------------------
*/

export async function listarProdutosFornecedor(
  fornecedorId: number
) {
  await validarFornecedor(
    fornecedorId
  );

  return executarAll(
    `
      SELECT
        fp.id,

        fp.fornecedor_id,

        fp.produto_id,

        p.ean,

        p.nome
          AS produto,

        p.marca,

        p.categoria,

        fp.codigo_produto_fornecedor,

        fp.ultimo_custo,
        fp.menor_custo,
        fp.maior_custo,
        fp.custo_medio,

        fp.quantidade_comprada,

        fp.ultima_compra_em,

        fp.criado_em,
        fp.atualizado_em

      FROM fornecedor_produtos fp

      INNER JOIN produtos p
        ON p.id =
          fp.produto_id

      WHERE
        fp.fornecedor_id = ?

      ORDER BY
        p.nome
        COLLATE NOCASE
    `,
    [
      fornecedorId,
    ]
  );
}

/*
|--------------------------------------------------------------------------
| FORNECEDORES DE UM PRODUTO
|--------------------------------------------------------------------------
|
| Importante para comparar preços.
|
*/

export async function listarFornecedoresProduto(
  produtoId: number
) {
  await validarProduto(
    produtoId
  );

  return executarAll(
    `
      SELECT
        fp.id,

        fp.fornecedor_id,

        f.nome_fantasia,
        f.razao_social,
        f.cpf_cnpj,

        fp.codigo_produto_fornecedor,

        fp.ultimo_custo,
        fp.menor_custo,
        fp.maior_custo,
        fp.custo_medio,

        fp.quantidade_comprada,

        fp.ultima_compra_em

      FROM fornecedor_produtos fp

      INNER JOIN fornecedores f
        ON f.id =
          fp.fornecedor_id

      WHERE
        fp.produto_id = ?

      ORDER BY
        fp.ultimo_custo ASC
    `,
    [
      produtoId,
    ]
  );
}

/*
|--------------------------------------------------------------------------
| VINCULAR PRODUTO AO FORNECEDOR
|--------------------------------------------------------------------------
*/

export async function vincularProdutoFornecedor(
  fornecedorId: number,
  produtoId: number,
  codigoProdutoFornecedor?: string
) {
  await validarFornecedor(
    fornecedorId
  );

  await validarProduto(
    produtoId
  );

  const existente =
    await executarGet(
      `
        SELECT id

        FROM fornecedor_produtos

        WHERE fornecedor_id = ?
          AND produto_id = ?

        LIMIT 1
      `,
      [
        fornecedorId,
        produtoId,
      ]
    );

  if (existente) {
    await executarRun(
      `
        UPDATE fornecedor_produtos

        SET
          codigo_produto_fornecedor = ?,
          atualizado_em =
            CURRENT_TIMESTAMP

        WHERE fornecedor_id = ?
          AND produto_id = ?
      `,
      [
        textoOuNull(
          codigoProdutoFornecedor
        ),

        fornecedorId,
        produtoId,
      ]
    );
  } else {
    await executarRun(
      `
        INSERT INTO fornecedor_produtos (
          fornecedor_id,
          produto_id,
          codigo_produto_fornecedor
        )

        VALUES (
          ?, ?, ?
        )
      `,
      [
        fornecedorId,
        produtoId,

        textoOuNull(
          codigoProdutoFornecedor
        ),
      ]
    );
  }

  return executarGet(
    `
      SELECT
        *

      FROM fornecedor_produtos

      WHERE fornecedor_id = ?
        AND produto_id = ?

      LIMIT 1
    `,
    [
      fornecedorId,
      produtoId,
    ]
  );
}

/*
|--------------------------------------------------------------------------
| REGISTRAR COMPRA / PREÇO
|--------------------------------------------------------------------------
|
| Este método:
|
| 1. valida fornecedor
| 2. valida produto
| 3. salva a compra no histórico
| 4. atualiza menor custo
| 5. atualiza maior custo
| 6. atualiza último custo
| 7. recalcula custo médio ponderado
|
*/

export async function registrarPrecoFornecedor(
  dados:
    VinculoFornecedorProdutoPayload
) {
  await validarFornecedor(
    dados.fornecedorId
  );

  await validarProduto(
    dados.produtoId
  );

  const custo =
    numero(
      dados.custoUnitario
    );

  const quantidade =
    numero(
      dados.quantidade
    );

  if (custo <= 0) {
    throw new Error(
      'O custo unitário deve ser maior que zero.'
    );
  }

  if (quantidade < 0) {
    throw new Error(
      'A quantidade não pode ser negativa.'
    );
  }

  /*
  |--------------------------------------------------------------------------
  | VÍNCULO ATUAL
  |--------------------------------------------------------------------------
  */

  const atual:
    any =
    await executarGet(
      `
        SELECT
          *

        FROM fornecedor_produtos

        WHERE fornecedor_id = ?
          AND produto_id = ?

        LIMIT 1
      `,
      [
        dados.fornecedorId,
        dados.produtoId,
      ]
    );

  const quantidadeAnterior =
    numero(
      atual
        ?.quantidade_comprada
    );

  const custoMedioAnterior =
    numero(
      atual
        ?.custo_medio
    );

  const quantidadeNova =
    quantidadeAnterior +
    quantidade;

  /*
  |--------------------------------------------------------------------------
  | CUSTO MÉDIO PONDERADO
  |--------------------------------------------------------------------------
  */

  let novoCustoMedio =
    custo;

  if (
    quantidadeNova > 0
  ) {
    const valorAnterior =
      quantidadeAnterior *
      custoMedioAnterior;

    const valorCompra =
      quantidade *
      custo;

    novoCustoMedio =
      (
        valorAnterior +
        valorCompra
      ) /
      quantidadeNova;
  }

  let menorCusto =
    atual
      ? numero(
          atual.menor_custo
        )
      : 0;

  let maiorCusto =
    atual
      ? numero(
          atual.maior_custo
        )
      : 0;

  if (
    menorCusto <= 0 ||
    custo <
      menorCusto
  ) {
    menorCusto =
      custo;
  }

  if (
    custo >
      maiorCusto
  ) {
    maiorCusto =
      custo;
  }

  /*
  |--------------------------------------------------------------------------
  | INSERIR / ATUALIZAR VÍNCULO
  |--------------------------------------------------------------------------
  */

  if (atual) {
    await executarRun(
      `
        UPDATE fornecedor_produtos

        SET
          codigo_produto_fornecedor =
            COALESCE(
              ?,
              codigo_produto_fornecedor
            ),

          ultimo_custo = ?,

          menor_custo = ?,

          maior_custo = ?,

          custo_medio = ?,

          quantidade_comprada = ?,

          ultima_compra_em =
            COALESCE(
              ?,
              CURRENT_TIMESTAMP
            ),

          atualizado_em =
            CURRENT_TIMESTAMP

        WHERE fornecedor_id = ?
          AND produto_id = ?
      `,
      [
        textoOuNull(
          dados.codigoProdutoFornecedor
        ),

        custo,

        menorCusto,

        maiorCusto,

        novoCustoMedio,

        quantidadeNova,

        textoOuNull(
          dados.dataCompra
        ),

        dados.fornecedorId,

        dados.produtoId,
      ]
    );
  } else {
    await executarRun(
      `
        INSERT INTO fornecedor_produtos (
          fornecedor_id,

          produto_id,

          codigo_produto_fornecedor,

          ultimo_custo,

          menor_custo,

          maior_custo,

          custo_medio,

          quantidade_comprada,

          ultima_compra_em
        )

        VALUES (
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          COALESCE(
            ?,
            CURRENT_TIMESTAMP
          )
        )
      `,
      [
        dados.fornecedorId,

        dados.produtoId,

        textoOuNull(
          dados.codigoProdutoFornecedor
        ),

        custo,

        custo,

        custo,

        custo,

        quantidade,

        textoOuNull(
          dados.dataCompra
        ),
      ]
    );
  }

  /*
  |--------------------------------------------------------------------------
  | SALVAR HISTÓRICO
  |--------------------------------------------------------------------------
  */

  const historico =
    await executarRun(
      `
        INSERT INTO fornecedor_precos_historico (
          fornecedor_id,

          produto_id,

          custo_unitario,

          quantidade,

          numero_nota,

          chave_nfe,

          data_compra,

          observacao
        )

        VALUES (
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          COALESCE(
            ?,
            CURRENT_TIMESTAMP
          ),
          ?
        )
      `,
      [
        dados.fornecedorId,

        dados.produtoId,

        custo,

        quantidade,

        textoOuNull(
          dados.numeroNota
        ),

        textoOuNull(
          dados.chaveNfe
        ),

        textoOuNull(
          dados.dataCompra
        ),

        textoOuNull(
          dados.observacao
        ),
      ]
    );

  const vinculo =
    await executarGet(
      `
        SELECT
          *

        FROM fornecedor_produtos

        WHERE fornecedor_id = ?
          AND produto_id = ?

        LIMIT 1
      `,
      [
        dados.fornecedorId,
        dados.produtoId,
      ]
    );

  return {
    sucesso: true,

    historicoId:
      historico.lastID,

    fornecedorProduto:
      vinculo,
  };
}

/*
|--------------------------------------------------------------------------
| HISTÓRICO DE PREÇOS DO FORNECEDOR
|--------------------------------------------------------------------------
*/

export async function historicoPrecosFornecedor(
  fornecedorId: number,
  limite = 200
) {
  await validarFornecedor(
    fornecedorId
  );

  return executarAll(
    `
      SELECT
        h.id,

        h.fornecedor_id,

        f.nome_fantasia,
        f.razao_social,

        h.produto_id,

        p.nome
          AS produto,

        p.ean,

        p.marca,

        h.custo_unitario,

        h.quantidade,

        h.numero_nota,

        h.chave_nfe,

        h.data_compra,

        h.observacao,

        h.criado_em

      FROM fornecedor_precos_historico h

      INNER JOIN fornecedores f
        ON f.id =
          h.fornecedor_id

      INNER JOIN produtos p
        ON p.id =
          h.produto_id

      WHERE
        h.fornecedor_id = ?

      ORDER BY
        h.data_compra DESC,
        h.id DESC

      LIMIT ?
    `,
    [
      fornecedorId,

      Math.max(
        1,
        Math.min(
          limite,
          1000
        )
      ),
    ]
  );
}

/*
|--------------------------------------------------------------------------
| HISTÓRICO DE PREÇOS DE UM PRODUTO
|--------------------------------------------------------------------------
*/

export async function historicoPrecosProduto(
  produtoId: number,
  limite = 200
) {
  await validarProduto(
    produtoId
  );

  return executarAll(
    `
      SELECT
        h.id,

        h.produto_id,

        p.nome
          AS produto,

        p.ean,

        h.fornecedor_id,

        f.nome_fantasia,
        f.razao_social,
        f.cpf_cnpj,

        h.custo_unitario,

        h.quantidade,

        h.numero_nota,

        h.chave_nfe,

        h.data_compra,

        h.observacao

      FROM fornecedor_precos_historico h

      INNER JOIN produtos p
        ON p.id =
          h.produto_id

      INNER JOIN fornecedores f
        ON f.id =
          h.fornecedor_id

      WHERE
        h.produto_id = ?

      ORDER BY
        h.data_compra DESC,
        h.id DESC

      LIMIT ?
    `,
    [
      produtoId,

      Math.max(
        1,
        Math.min(
          limite,
          1000
        )
      ),
    ]
  );
}

/*
|--------------------------------------------------------------------------
| COMPARAR PREÇOS DO PRODUTO
|--------------------------------------------------------------------------
|
| Esta será uma das funções mais úteis do sistema.
|
| Retorna todos os fornecedores ordenados
| pelo último custo.
|
*/

export async function compararPrecosProduto(
  produtoId: number
) {
  await validarProduto(
    produtoId
  );

  return executarAll(
    `
      SELECT
        fp.fornecedor_id,

        COALESCE(
          NULLIF(
            f.nome_fantasia,
            ''
          ),
          f.razao_social
        )
          AS fornecedor,

        f.cpf_cnpj,

        fp.codigo_produto_fornecedor,

        fp.ultimo_custo,

        fp.menor_custo,

        fp.maior_custo,

        fp.custo_medio,

        fp.quantidade_comprada,

        fp.ultima_compra_em,

        CASE
          WHEN
            fp.ultimo_custo > 0

          THEN
            fp.ultimo_custo

          ELSE
            999999999
        END
          AS ordem_preco

      FROM fornecedor_produtos fp

      INNER JOIN fornecedores f
        ON f.id =
          fp.fornecedor_id

      WHERE
        fp.produto_id = ?

        AND f.ativo = 1

      ORDER BY
        ordem_preco ASC,

        fornecedor
        COLLATE NOCASE
    `,
    [
      produtoId,
    ]
  );
}

/*
|--------------------------------------------------------------------------
| RESUMO DOS FORNECEDORES
|--------------------------------------------------------------------------
|
| Cards da futura tela Fornecedores.
|
*/

export async function resumoFornecedores() {
  const resumo =
    await executarGet<{
      total_fornecedores: number;
      ativos: number;
      inativos: number;
      produtos_vinculados: number;
      compras_registradas: number;
    }>(
      `
        SELECT
          (
            SELECT COUNT(*)
            FROM fornecedores
          )
            AS total_fornecedores,

          (
            SELECT COUNT(*)
            FROM fornecedores
            WHERE ativo = 1
          )
            AS ativos,

          (
            SELECT COUNT(*)
            FROM fornecedores
            WHERE ativo = 0
          )
            AS inativos,

          (
            SELECT COUNT(*)
            FROM fornecedor_produtos
          )
            AS produtos_vinculados,

          (
            SELECT COUNT(*)
            FROM fornecedor_precos_historico
          )
            AS compras_registradas
      `
    );

  return {
    totalFornecedores:
      Number(
        resumo
          ?.total_fornecedores ||
        0
      ),

    ativos:
      Number(
        resumo?.ativos ||
        0
      ),

    inativos:
      Number(
        resumo?.inativos ||
        0
      ),

    produtosVinculados:
      Number(
        resumo
          ?.produtos_vinculados ||
        0
      ),

    comprasRegistradas:
      Number(
        resumo
          ?.compras_registradas ||
        0
      ),
  };
}