import db from '../database/database';
import { escopoLojaSql, obterLojaAtivaId } from './escopo-lojas.service';
import { garantirPrecosCatalogoLoja, garantirVinculoEstoque } from './catalogo-lojas.service';
import { transacaoCaixa } from './caixas.service';

/*
|--------------------------------------------------------------------------
| TIPOS
|--------------------------------------------------------------------------
*/

type TipoMovimentacao =
  | 'ENTRADA_NF'
  | 'ENTRADA_MANUAL'
  | 'SAIDA_MANUAL'
  | 'VENDA'
  | 'REPOSICAO'
  | 'TRANSFERENCIA'
  | 'DEVOLUCAO'
  | 'PERDA'
  | 'AVARIA'
  | 'VENCIMENTO'
  | 'INVENTARIO'
  | 'AJUSTE'
  | 'NOVA_CONTAGEM';

type DadosMovimentacao = {
  produtoId: number;

  tipo: TipoMovimentacao;

  quantidade: number | string;

  lojaOrigemId?: number | null;
  localOrigemId?: number | null;

  lojaDestinoId?: number | null;
  localDestinoId?: number | null;

  custoUnitario?: number | string;

  referencia?: string;
  observacao?: string;
  justificativa?: string;

  usuarioId?: number | null;
};

type SaldoLocal = {
  produto_id: number;
  loja_id: number;
  local_id: number;
  quantidade: number;
  custo_medio: number;
};

/*
|--------------------------------------------------------------------------
| NORMALIZAR N├ÜMEROS
|--------------------------------------------------------------------------
|
| Aceita:
|
| 4.20
| "4.20"
| "4,20"
|
*/

function normalizarNumero(
  valor:
    | number
    | string
    | null
    | undefined
): number {
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
    return Number.isFinite(valor)
      ? valor
      : 0;
  }

  const texto = String(valor)
    .trim()
    .replace(/\s/g, '')
    .replace(',', '.');

  const numero =
    Number(texto);

  return Number.isFinite(numero)
    ? numero
    : 0;
}

/*
|--------------------------------------------------------------------------
| EXECUTAR RUN
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
            lastID:
              this.lastID,
            changes:
              this.changes,
          });
        }
      );
    }
  );
}

/*
|--------------------------------------------------------------------------
| EXECUTAR GET
|--------------------------------------------------------------------------
*/

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

/*
|--------------------------------------------------------------------------
| EXECUTAR ALL
|--------------------------------------------------------------------------
*/

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
| VALIDAR USU├üRIO
|--------------------------------------------------------------------------
|
| Se receber usuarioId, verificamos se ele existe.
|
*/

async function validarUsuario(
  usuarioId?:
    | number
    | null
) {
  if (!usuarioId) {
    return;
  }

  const usuario =
    await executarGet(
      `
        SELECT
          id,
          nome,
          ativo

        FROM usuarios

        WHERE id = ?

        LIMIT 1
      `,
      [usuarioId]
    );

  if (!usuario) {
    throw new Error(
      'Usu├írio respons├ível n├úo encontrado.'
    );
  }

  if (
    Number(
      (usuario as any)
        .ativo
    ) !== 1
  ) {
    throw new Error(
      'Usu├írio respons├ível est├í inativo.'
    );
  }
}

/*
|--------------------------------------------------------------------------
| OBTER SALDO
|--------------------------------------------------------------------------
*/

async function obterSaldo(
  produtoId: number,
  lojaId: number,
  localId: number
): Promise<
  SaldoLocal | undefined
> {
  return executarGet<SaldoLocal>(
    `
      SELECT
        produto_id,
        loja_id,
        local_id,
        quantidade,
        custo_medio

      FROM estoque_saldos

      WHERE produto_id = ?
        AND loja_id = ?
        AND local_id = ?

      LIMIT 1
    `,
    [
      produtoId,
      lojaId,
      localId,
    ]
  );
}

/*
|--------------------------------------------------------------------------
| DEFINIR SALDO
|--------------------------------------------------------------------------
*/

async function definirSaldo(
  produtoId: number,
  lojaId: number,
  localId: number,
  quantidade: number,
  custoMedio?: number
) {
  const existente =
    await obterSaldo(
      produtoId,
      lojaId,
      localId
    );

  if (existente) {
    await executarRun(
      `
        UPDATE estoque_saldos

        SET
          quantidade = ?,
          custo_medio = ?,
          atualizado_em =
            CURRENT_TIMESTAMP

        WHERE produto_id = ?
          AND loja_id = ?
          AND local_id = ?
      `,
      [
        quantidade,

        custoMedio ??
          existente
            .custo_medio ??
          0,

        produtoId,
        lojaId,
        localId,
      ]
    );

    return;
  }

  await executarRun(
    `
      INSERT INTO estoque_saldos (
        produto_id,
        loja_id,
        local_id,
        quantidade,
        custo_medio
      )

      VALUES (
        ?, ?, ?, ?, ?
      )
    `,
    [
      produtoId,
      lojaId,
      localId,
      quantidade,
      custoMedio ?? 0,
    ]
  );
}

/*
|--------------------------------------------------------------------------
| REGISTRAR MOVIMENTA├ç├âO
|--------------------------------------------------------------------------
|
| Toda altera├º├úo relevante de estoque deve passar aqui.
|
| O usuario_id ficar├í registrado permanentemente.
|
*/

async function registrarMovimentacao(
  dados: DadosMovimentacao
) {
  const quantidade =
    normalizarNumero(
      dados.quantidade
    );

  const custoUnitario =
    normalizarNumero(
      dados.custoUnitario
    );

  await validarUsuario(
    dados.usuarioId
  );

  const resultado =
    await executarRun(
      `
        INSERT INTO movimentacoes_estoque (
          produto_id,
          tipo,

          quantidade,
          custo_unitario,

          loja_origem_id,
          local_origem_id,

          loja_destino_id,
          local_destino_id,

          usuario_id,

          referencia,
          observacao,
          justificativa
        )

        VALUES (
          ?, ?,

          ?, ?,

          ?, ?,

          ?, ?,

          ?,

          ?, ?, ?
        )
      `,
      [
        dados.produtoId,
        dados.tipo,

        quantidade,
        custoUnitario,

        dados.lojaOrigemId ??
          null,

        dados.localOrigemId ??
          null,

        dados.lojaDestinoId ??
          null,

        dados.localDestinoId ??
          null,

        dados.usuarioId ??
          null,

        dados.referencia ??
          null,

        dados.observacao ??
          null,

        dados.justificativa ??
          null,
      ]
    );

  return resultado.lastID;
}

/*
|--------------------------------------------------------------------------
| ENTRADA DE ESTOQUE
|--------------------------------------------------------------------------
*/

async function entradaEstoqueImpl(
  dados: {
    produtoId: number;

    lojaId: number;
    localId: number;

    quantidade:
      | number
      | string;

    custoUnitario?:
      | number
      | string;

    tipo?:
      | 'ENTRADA_NF'
      | 'ENTRADA_MANUAL';

    referencia?: string;
    observacao?: string;

    usuarioId?:
      | number
      | null;
  }
) {
  const quantidadeEntrada =
    normalizarNumero(
      dados.quantidade
    );

  const custoNovo =
    normalizarNumero(
      dados.custoUnitario
    );

  if (
    quantidadeEntrada <= 0
  ) {
    throw new Error(
      'A quantidade de entrada deve ser maior que zero.'
    );
  }

  await validarUsuario(
    dados.usuarioId
  );

  const saldoAtual =
    await obterSaldo(
      dados.produtoId,
      dados.lojaId,
      dados.localId
    );

  const quantidadeAtual =
    normalizarNumero(
      saldoAtual?.quantidade
    );

  const custoAtual =
    normalizarNumero(
      saldoAtual?.custo_medio
    );

  /*
  |--------------------------------------------------------------------------
  | CUSTO M├ëDIO PONDERADO
  |--------------------------------------------------------------------------
  */

  let novoCustoMedio =
    custoAtual;

  if (custoNovo > 0) {
    const valorAtual =
      quantidadeAtual *
      custoAtual;

    const valorEntrada =
      quantidadeEntrada *
      custoNovo;

    const novaQuantidade =
      quantidadeAtual +
      quantidadeEntrada;

    novoCustoMedio =
      novaQuantidade > 0
        ? (
            valorAtual +
            valorEntrada
          ) /
          novaQuantidade
        : custoNovo;
  }

  const novoSaldo =
    quantidadeAtual +
    quantidadeEntrada;

  await definirSaldo(
    dados.produtoId,
    dados.lojaId,
    dados.localId,
    novoSaldo,
    novoCustoMedio
  );

  const movimentacaoId =
    await registrarMovimentacao({
      produtoId:
        dados.produtoId,

      tipo:
        dados.tipo ||
        'ENTRADA_MANUAL',

      quantidade:
        quantidadeEntrada,

      custoUnitario:
        custoNovo,

      lojaDestinoId:
        dados.lojaId,

      localDestinoId:
        dados.localId,

      referencia:
        dados.referencia ||
        'Entrada de estoque',

      observacao:
        dados.observacao,

      usuarioId:
        dados.usuarioId,
    });

  return {
    sucesso: true,

    movimentacaoId,

    saldoAnterior:
      quantidadeAtual,

    saldoAtual:
      novoSaldo,

    custoAnterior:
      custoAtual,

    custoEntrada:
      custoNovo,

    custoMedio:
      novoCustoMedio,

    usuarioId:
      dados.usuarioId ??
      null,
  };
}

/*
|--------------------------------------------------------------------------
| SA├ìDA DE ESTOQUE
|--------------------------------------------------------------------------
*/

async function saidaEstoqueImpl(
  dados: {
    produtoId: number;

    lojaId: number;
    localId: number;

    quantidade:
      | number
      | string;

    tipo?:
      | 'SAIDA_MANUAL'
      | 'VENDA'
      | 'PERDA'
      | 'AVARIA'
      | 'VENCIMENTO'
      | 'DEVOLUCAO';

    referencia?: string;
    observacao?: string;
    justificativa?: string;

    usuarioId?:
      | number
      | null;
  }
) {
  const quantidadeSaida =
    normalizarNumero(
      dados.quantidade
    );

  if (
    quantidadeSaida <= 0
  ) {
    throw new Error(
      'A quantidade de sa├¡da deve ser maior que zero.'
    );
  }

  await validarUsuario(
    dados.usuarioId
  );

  const saldoAtual =
    await obterSaldo(
      dados.produtoId,
      dados.lojaId,
      dados.localId
    );

  const quantidadeAtual =
    normalizarNumero(
      saldoAtual?.quantidade
    );

  if (
    quantidadeAtual <
    quantidadeSaida
  ) {
    throw new Error(
      `Saldo insuficiente. Dispon├¡vel: ${quantidadeAtual}.`
    );
  }

  const custoMedio =
    normalizarNumero(
      saldoAtual?.custo_medio
    );

  const novoSaldo =
    quantidadeAtual -
    quantidadeSaida;

  await definirSaldo(
    dados.produtoId,
    dados.lojaId,
    dados.localId,
    novoSaldo,
    custoMedio
  );

  const movimentacaoId =
    await registrarMovimentacao({
      produtoId:
        dados.produtoId,

      tipo:
        dados.tipo ||
        'SAIDA_MANUAL',

      quantidade:
        quantidadeSaida,

      custoUnitario:
        custoMedio,

      lojaOrigemId:
        dados.lojaId,

      localOrigemId:
        dados.localId,

      referencia:
        dados.referencia ||
        'Sa├¡da de estoque',

      observacao:
        dados.observacao,

      justificativa:
        dados.justificativa,

      usuarioId:
        dados.usuarioId,
    });

  return {
    sucesso: true,

    movimentacaoId,

    saldoAnterior:
      quantidadeAtual,

    saldoAtual:
      novoSaldo,

    custoMedio,

    usuarioId:
      dados.usuarioId ??
      null,
  };
}

/*
|--------------------------------------------------------------------------
| REPOSI├ç├âO / TRANSFER├èNCIA
|--------------------------------------------------------------------------
|
| Funciona tanto para:
|
| MATRIZ / Dep├│sito
|        Ôåô
| MATRIZ / ├ürea de Venda
|
| quanto:
|
| MATRIZ / Dep├│sito
|        Ôåô
| MAISON / ├ürea de Venda
|
*/

async function transferirEstoqueImpl(
  dados: {
    produtoId: number;

    lojaOrigemId: number;
    localOrigemId: number;

    lojaDestinoId: number;
    localDestinoId: number;

    quantidade:
      | number
      | string;

    tipo?:
      | 'REPOSICAO'
      | 'TRANSFERENCIA';

    referencia?: string;
    observacao?: string;

    usuarioId?:
      | number
      | null;
  }
) {
  const quantidadeTransferir =
    normalizarNumero(
      dados.quantidade
    );

  if (
    quantidadeTransferir <= 0
  ) {
    throw new Error(
      'A quantidade deve ser maior que zero.'
    );
  }

  if (
    dados.lojaOrigemId ===
      dados.lojaDestinoId &&
    dados.localOrigemId ===
      dados.localDestinoId
  ) {
    throw new Error(
      'Origem e destino n├úo podem ser iguais.'
    );
  }

  await validarUsuario(
    dados.usuarioId
  );

  /*
  |--------------------------------------------------------------------------
  | ORIGEM
  |--------------------------------------------------------------------------
  */

  const saldoOrigem =
    await obterSaldo(
      dados.produtoId,
      dados.lojaOrigemId,
      dados.localOrigemId
    );

  const quantidadeOrigem =
    normalizarNumero(
      saldoOrigem?.quantidade
    );

  if (
    quantidadeOrigem <
    quantidadeTransferir
  ) {
    throw new Error(
      `Saldo insuficiente na origem. Dispon├¡vel: ${quantidadeOrigem}.`
    );
  }

  const custoOrigem =
    normalizarNumero(
      saldoOrigem?.custo_medio
    );

  /*
  |--------------------------------------------------------------------------
  | DESTINO
  |--------------------------------------------------------------------------
  */

  const saldoDestino =
    await obterSaldo(
      dados.produtoId,
      dados.lojaDestinoId,
      dados.localDestinoId
    );

  const quantidadeDestino =
    normalizarNumero(
      saldoDestino?.quantidade
    );

  const custoDestino =
    normalizarNumero(
      saldoDestino?.custo_medio
    );

  const novoSaldoOrigem =
    quantidadeOrigem -
    quantidadeTransferir;

  const novoSaldoDestino =
    quantidadeDestino +
    quantidadeTransferir;

  /*
  |--------------------------------------------------------------------------
  | CUSTO M├ëDIO DO DESTINO
  |--------------------------------------------------------------------------
  */

  let novoCustoDestino =
    custoOrigem;

  if (
    quantidadeDestino > 0 &&
    novoSaldoDestino > 0
  ) {
    const valorDestino =
      quantidadeDestino *
      custoDestino;

    const valorTransferencia =
      quantidadeTransferir *
      custoOrigem;

    novoCustoDestino =
      (
        valorDestino +
        valorTransferencia
      ) /
      novoSaldoDestino;
  }

  /*
  |--------------------------------------------------------------------------
  | ATUALIZAR ORIGEM
  |--------------------------------------------------------------------------
  */

  await definirSaldo(
    dados.produtoId,
    dados.lojaOrigemId,
    dados.localOrigemId,
    novoSaldoOrigem,
    custoOrigem
  );

  /*
  |--------------------------------------------------------------------------
  | ATUALIZAR DESTINO
  |--------------------------------------------------------------------------
  */

  await definirSaldo(
    dados.produtoId,
    dados.lojaDestinoId,
    dados.localDestinoId,
    novoSaldoDestino,
    novoCustoDestino
  );

  /*
  |--------------------------------------------------------------------------
  | HIST├ôRICO
  |--------------------------------------------------------------------------
  */

  const movimentacaoId =
    await registrarMovimentacao({
      produtoId:
        dados.produtoId,

      tipo:
        dados.tipo ||
        'TRANSFERENCIA',

      quantidade:
        quantidadeTransferir,

      custoUnitario:
        custoOrigem,

      lojaOrigemId:
        dados.lojaOrigemId,

      localOrigemId:
        dados.localOrigemId,

      lojaDestinoId:
        dados.lojaDestinoId,

      localDestinoId:
        dados.localDestinoId,

      referencia:
        dados.referencia ||
        (
          dados.tipo ===
            'REPOSICAO'
            ? 'Reposi├º├úo interna'
            : 'Transfer├¬ncia entre unidades'
        ),

      observacao:
        dados.observacao,

      usuarioId:
        dados.usuarioId,
    });

  return {
    sucesso: true,

    movimentacaoId,

    origem: {
      saldoAnterior:
        quantidadeOrigem,

      saldoAtual:
        novoSaldoOrigem,

      custoMedio:
        custoOrigem,
    },

    destino: {
      saldoAnterior:
        quantidadeDestino,

      saldoAtual:
        novoSaldoDestino,

      custoAnterior:
        custoDestino,

      custoMedio:
        novoCustoDestino,
    },

    usuarioId:
      dados.usuarioId ??
      null,
  };
}

/*
|--------------------------------------------------------------------------
| NOVA CONTAGEM
|--------------------------------------------------------------------------
*/

async function novaContagemImpl(
  dados: {
    produtoId: number;

    lojaId: number;
    localId: number;

    quantidadeContada:
      | number
      | string;

    observacao?: string;
    justificativa?: string;

    usuarioId?:
      | number
      | null;
  }
) {
  const quantidadeContada =
    normalizarNumero(
      dados.quantidadeContada
    );

  if (
    quantidadeContada < 0
  ) {
    throw new Error(
      'A contagem n├úo pode ser negativa.'
    );
  }

  await validarUsuario(
    dados.usuarioId
  );

  const saldoAtual =
    await obterSaldo(
      dados.produtoId,
      dados.lojaId,
      dados.localId
    );

  const quantidadeSistema =
    normalizarNumero(
      saldoAtual?.quantidade
    );

  const custoMedio =
    normalizarNumero(
      saldoAtual?.custo_medio
    );

  const diferenca =
    quantidadeContada -
    quantidadeSistema;

  /*
  |--------------------------------------------------------------------------
  | SEM DIVERG├èNCIA
  |--------------------------------------------------------------------------
  */

  if (
    diferenca === 0
  ) {
    return {
      sucesso: true,

      alterado: false,

      quantidadeSistema,

      quantidadeContada,

      diferenca: 0,

      usuarioId:
        dados.usuarioId ??
        null,
    };
  }

  /*
  |--------------------------------------------------------------------------
  | ATUALIZAR SALDO
  |--------------------------------------------------------------------------
  */

  await definirSaldo(
    dados.produtoId,
    dados.lojaId,
    dados.localId,
    quantidadeContada,
    custoMedio
  );

  /*
  |--------------------------------------------------------------------------
  | HIST├ôRICO
  |--------------------------------------------------------------------------
  */

  const movimentacaoId =
    await registrarMovimentacao({
      produtoId:
        dados.produtoId,

      tipo:
        'NOVA_CONTAGEM',

      quantidade:
        Math.abs(
          diferenca
        ),

      custoUnitario:
        custoMedio,

      lojaOrigemId:
        diferenca < 0
          ? dados.lojaId
          : null,

      localOrigemId:
        diferenca < 0
          ? dados.localId
          : null,

      lojaDestinoId:
        diferenca > 0
          ? dados.lojaId
          : null,

      localDestinoId:
        diferenca > 0
          ? dados.localId
          : null,

      referencia:
        `Contagem anterior: ${quantidadeSistema}; contagem f├¡sica: ${quantidadeContada}`,

      observacao:
        dados.observacao,

      justificativa:
        dados.justificativa,

      usuarioId:
        dados.usuarioId,
    });

  return {
    sucesso: true,

    alterado: true,

    movimentacaoId,

    quantidadeSistema,

    quantidadeContada,

    diferenca,

    usuarioId:
      dados.usuarioId ??
      null,
  };
}

/*
|--------------------------------------------------------------------------
| CONSULTAR SALDOS DE UM PRODUTO
|--------------------------------------------------------------------------
*/

async function validarLocalEstoque(lojaId: number, localId: number) {
  if (!Number.isSafeInteger(lojaId) || !Number.isSafeInteger(localId) || lojaId <= 0 || localId <= 0) throw new Error('Informe o mercado e o local de estoque.');
  const local = await executarGet(`SELECT le.id FROM locais_estoque le JOIN lojas l ON l.id=le.loja_id
    WHERE le.id=? AND le.loja_id=? AND le.ativo=1 AND l.ativo=1`, [localId,lojaId]);
  if (!local) throw new Error('O local de estoque não está ativo neste mercado.');
}

export async function entradaEstoque(dados: Parameters<typeof entradaEstoqueImpl>[0]) {
  await garantirPrecosCatalogoLoja();
  return transacaoCaixa(async () => {
    await validarLocalEstoque(dados.lojaId,dados.localId);
    const resultado = await entradaEstoqueImpl(dados);
    await garantirVinculoEstoque(dados.produtoId,dados.lojaId);
    return resultado;
  });
}
export async function saidaEstoque(dados: Parameters<typeof saidaEstoqueImpl>[0]) {
  await garantirPrecosCatalogoLoja();
  return transacaoCaixa(async () => {
    await validarLocalEstoque(dados.lojaId,dados.localId);
    return saidaEstoqueImpl(dados);
  });
}
export async function transferirEstoque(dados: Parameters<typeof transferirEstoqueImpl>[0]) {
  await garantirPrecosCatalogoLoja();
  return transacaoCaixa(async () => {
    await validarLocalEstoque(dados.lojaOrigemId,dados.localOrigemId);
    await validarLocalEstoque(dados.lojaDestinoId,dados.localDestinoId);
    const resultado = await transferirEstoqueImpl(dados);
    await garantirVinculoEstoque(dados.produtoId,dados.lojaDestinoId);
    return resultado;
  });
}
export async function novaContagem(dados: Parameters<typeof novaContagemImpl>[0]) {
  await garantirPrecosCatalogoLoja();
  return transacaoCaixa(async () => {
    await validarLocalEstoque(dados.lojaId,dados.localId);
    const resultado = await novaContagemImpl(dados);
    if (normalizarNumero(dados.quantidadeContada) > 0) await garantirVinculoEstoque(dados.produtoId,dados.lojaId);
    return resultado;
  });
}

export async function consultarSaldosProduto(
  produtoId: number
) {
  return executarAll(
    `
      SELECT
        es.produto_id,

        p.nome
          AS produto,

        p.ean,

        es.loja_id,

        l.nome
          AS loja,

        es.local_id,

        le.nome
          AS local,

        le.tipo
          AS tipo_local,

        es.quantidade,

        es.custo_medio,

        (
          es.quantidade *
          es.custo_medio
        )
          AS valor_custo

      FROM estoque_saldos es

      INNER JOIN produtos p
        ON p.id =
          es.produto_id

      INNER JOIN lojas l
        ON l.id =
          es.loja_id

      INNER JOIN locais_estoque le
        ON le.id =
          es.local_id

      WHERE
        es.produto_id = ?

        AND ${escopoLojaSql('es.loja_id')}

        AND p.ativo = 1
        AND l.ativo = 1
        AND le.ativo = 1

      ORDER BY
        l.nome COLLATE NOCASE,

        le.nome COLLATE NOCASE
    `,
    [
      produtoId,
    ]
  );
}

/*
|--------------------------------------------------------------------------
| CONSULTAR ESTOQUE COMPLETO
|--------------------------------------------------------------------------
*/

export async function consultarEstoque(
  lojaId?: number
) {
  let sql = `
    SELECT
      p.id
        AS produto_id,

      p.ean,

      p.nome
        AS produto,

      p.marca,

      l.id
        AS loja_id,

      l.nome
        AS loja,

      le.id
        AS local_id,

      le.nome
        AS local,

      le.tipo
        AS tipo_local,

      COALESCE(
        es.quantidade,
        0
      )
        AS quantidade,

      COALESCE(
        es.custo_medio,
        0
      )
        AS custo_medio,

      (
        COALESCE(
          es.quantidade,
          0
        )
        *
        COALESCE(
          es.custo_medio,
          0
        )
      )
        AS valor_custo

    FROM estoque_saldos es

    INNER JOIN produtos p
      ON p.id =
        es.produto_id

    INNER JOIN lojas l
      ON l.id =
        es.loja_id

    INNER JOIN locais_estoque le
      ON le.id =
        es.local_id

    WHERE
      p.ativo = 1

      AND l.ativo = 1

      AND le.ativo = 1
      AND ${escopoLojaSql('es.loja_id')}
  `;

  const parametros:
    any[] = [];

  if (lojaId) {
    sql += `
      AND l.id = ?
    `;

    parametros.push(
      lojaId
    );
  }

  sql += `
    ORDER BY
      p.nome COLLATE NOCASE,

      l.nome COLLATE NOCASE,

      CASE
        WHEN le.tipo =
          'DEPOSITO'
          THEN 0

        WHEN le.tipo =
          'VENDA'
          THEN 1

        ELSE 2
      END,

      le.nome COLLATE NOCASE
  `;

  return executarAll(
    sql,
    parametros
  );
}

/*
|--------------------------------------------------------------------------
| HIST├ôRICO DE MOVIMENTA├ç├òES
|--------------------------------------------------------------------------
|
| Agora retorna tamb├®m:
|
| usuario_id
| usuario_nome
| usuario_email
| usuario_perfil
|
*/

export async function consultarMovimentacoes(
  produtoId?: number,
  limite = 100
) {
  const lojaAtivaId = obterLojaAtivaId();
  let sql = `
    SELECT
      me.id,

      me.criado_em,

      me.produto_id,

      p.nome
        AS produto,

      p.ean,

      me.tipo,

      me.quantidade,

      me.custo_unitario,

      (
        me.quantidade *
        me.custo_unitario
      )
        AS valor_custo,

      me.loja_origem_id,

      lo.nome
        AS loja_origem,

      me.local_origem_id,

      leo.nome
        AS local_origem,

      me.loja_destino_id,

      ld.nome
        AS loja_destino,

      me.local_destino_id,

      led.nome
        AS local_destino,

      me.usuario_id,

      u.nome
        AS usuario_nome,

      u.email
        AS usuario_email,

      u.perfil
        AS usuario_perfil,

      me.referencia,

      me.observacao,

      me.justificativa

    FROM movimentacoes_estoque me

    INNER JOIN produtos p
      ON p.id =
        me.produto_id

    LEFT JOIN lojas lo
      ON lo.id =
        me.loja_origem_id

    LEFT JOIN locais_estoque leo
      ON leo.id =
        me.local_origem_id

    LEFT JOIN lojas ld
      ON ld.id =
        me.loja_destino_id

    LEFT JOIN locais_estoque led
      ON led.id =
        me.local_destino_id

    LEFT JOIN usuarios u
      ON u.id =
        me.usuario_id

    WHERE 1 = 1
      AND ${lojaAtivaId
        ? `(me.loja_origem_id = ${lojaAtivaId} OR me.loja_destino_id = ${lojaAtivaId})`
        : `(me.loja_origem_id IS NULL OR ${escopoLojaSql('me.loja_origem_id')}) AND (me.loja_destino_id IS NULL OR ${escopoLojaSql('me.loja_destino_id')})`}
  `;

  const parametros:
    any[] = [];

  if (produtoId) {
    sql += `
      AND me.produto_id = ?
    `;

    parametros.push(
      produtoId
    );
  }

  sql += `
    ORDER BY
      me.criado_em DESC,
      me.id DESC

    LIMIT ?
  `;

  parametros.push(
    limite
  );

  return executarAll(
    sql,
    parametros
  );
}
