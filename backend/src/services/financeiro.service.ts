import { comBloqueioBanco } from './caixas.service';
import { exigirCadastroNaLoja, garantirVinculosCadastros, lojaCadastroAtual } from './cadastros-lojas.service';
import { buscarFornecedorPorId } from './fornecedores.service';
import db from '../database/database';
import { escopoLojaSql } from './escopo-lojas.service';

/*
|--------------------------------------------------------------------------
| TIPOS
|--------------------------------------------------------------------------
*/

export type TipoLancamento = 'ENTRADA' | 'SAIDA';

export type StatusLancamento =
  | 'PENDENTE'
  | 'PAGO'
  | 'RECEBIDO'
  | 'CANCELADO';

export type CriarLancamentoPayload = {
  empresaId?: number;
  tipo: TipoLancamento;

  fornecedorId?: number | null;
  lojaId?: number | null;
  categoriaId?: number | null;

  descricao: string;
  numeroDocumento?: string | null;

  valorOriginal: number;

  dataEmissao?: string | null;
  dataVencimento: string;

  formaPagamento?: string | null;

  observacao?: string | null;

  notaEntradaId?: number | null;
  notaEntradaParcelaId?: number | null;

  usuarioId?: number | null;

  permitirDuplicidade?: boolean;
};

export type AtualizarLancamentoPayload = {
  fornecedorId?: number | null;
  lojaId?: number | null;
  categoriaId?: number | null;

  descricao?: string;
  numeroDocumento?: string | null;

  valorOriginal?: number;

  dataEmissao?: string | null;
  dataVencimento?: string;

  formaPagamento?: string | null;

  observacao?: string | null;

  usuarioId?: number | null;
};

export type RegistrarBaixaPayload = {
  valor: number;
  dataBaixa: string;
  formaPagamento?: string | null;
  observacao?: string | null;
  usuarioId?: number | null;
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
  return new Promise((resolve, reject) => {
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
  });
}

function executarGet<T = any>(
  sql: string,
  parametros: any[] = []
): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    db.get(
      sql,
      parametros,
      (erro, resultado) => {
        if (erro) {
          reject(erro);
          return;
        }

        resolve(
          resultado as T | undefined
        );
      }
    );
  });
}

function executarAll<T = any>(
  sql: string,
  parametros: any[] = []
): Promise<T[]> {
  return new Promise((resolve, reject) => {
    db.all(
      sql,
      parametros,
      (erro, resultados) => {
        if (erro) {
          reject(erro);
          return;
        }

        resolve(
          (resultados || []) as T[]
        );
      }
    );
  });
}

/*
|--------------------------------------------------------------------------
| HELPERS GERAIS
|--------------------------------------------------------------------------
*/

function numeroSeguro(
  valor: any
) {
  const numero =
    Number(valor || 0);

  return Number.isFinite(numero)
    ? numero
    : 0;
}

function limparTexto(
  valor?: string | null
) {
  if (
    valor === undefined ||
    valor === null
  ) {
    return null;
  }

  const texto =
    String(valor).trim();

  return texto || null;
}

function hojeISO() {
  const hoje =
    new Date();

  const ano =
    hoje.getFullYear();

  const mes =
    String(
      hoje.getMonth() + 1
    ).padStart(2, '0');

  const dia =
    String(
      hoje.getDate()
    ).padStart(2, '0');

  return `${ano}-${mes}-${dia}`;
}

function primeiroDiaMes() {
  const hoje =
    new Date();

  const ano =
    hoje.getFullYear();

  const mes =
    String(
      hoje.getMonth() + 1
    ).padStart(2, '0');

  return `${ano}-${mes}-01`;
}

function ultimoDiaMes() {
  const hoje =
    new Date();

  const ano =
    hoje.getFullYear();

  const mes =
    hoje.getMonth();

  const ultimo =
    new Date(
      ano,
      mes + 1,
      0
    );

  const numeroMes =
    String(
      ultimo.getMonth() + 1
    ).padStart(2, '0');

  const dia =
    String(
      ultimo.getDate()
    ).padStart(2, '0');

  return `${ultimo.getFullYear()}-${numeroMes}-${dia}`;
}

function somarDias(
  data: string,
  dias: number
) {
  const partes =
    data.split('-');

  const objeto =
    new Date(
      Number(partes[0]),
      Number(partes[1]) - 1,
      Number(partes[2])
    );

  objeto.setDate(
    objeto.getDate() + dias
  );

  const ano =
    objeto.getFullYear();

  const mes =
    String(
      objeto.getMonth() + 1
    ).padStart(2, '0');

  const dia =
    String(
      objeto.getDate()
    ).padStart(2, '0');

  return `${ano}-${mes}-${dia}`;
}

/*
|--------------------------------------------------------------------------
| HISTÓRICO
|--------------------------------------------------------------------------
*/

async function registrarHistorico(
  lancamentoId: number,
  usuarioId: number | null | undefined,
  acao: string,
  descricao?: string | null,
  valorAnterior?: string | null,
  valorNovo?: string | null
) {
  await executarRun(
    `
      INSERT INTO financeiro_historico (
        lancamento_id,
        usuario_id,
        acao,
        descricao,
        valor_anterior,
        valor_novo
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    [
      lancamentoId,
      usuarioId || null,
      acao,
      descricao || null,
      valorAnterior || null,
      valorNovo || null,
    ]
  );
}

/*
|--------------------------------------------------------------------------
| CATEGORIAS
|--------------------------------------------------------------------------
*/

export async function garantirCategoriasFinanceiras(
  empresaId = 1
) {
  const categorias = [
    ['Mercadorias', 'SAIDA'],
    ['Energia elétrica', 'SAIDA'],
    ['Água', 'SAIDA'],
    ['Internet', 'SAIDA'],
    ['Aluguel', 'SAIDA'],
    ['Condomínio', 'SAIDA'],
    ['Funcionários', 'SAIDA'],
    ['Impostos', 'SAIDA'],
    ['Contabilidade', 'SAIDA'],
    ['Manutenção', 'SAIDA'],
    ['Equipamentos', 'SAIDA'],
    ['Sistemas', 'SAIDA'],
    ['Taxas bancárias', 'SAIDA'],
    ['Marketing', 'SAIDA'],
    ['Frete', 'SAIDA'],
    ['Outras despesas', 'SAIDA'],

    ['Venda', 'ENTRADA'],
    ['Condomínios', 'ENTRADA'],
    ['Recebimento', 'ENTRADA'],
    ['Crédito', 'ENTRADA'],
    ['Reembolso', 'ENTRADA'],
    ['Outras receitas', 'ENTRADA'],
  ];

  for (
    const [nome, tipo]
    of categorias
  ) {
    const existe =
      await executarGet<any>(
        `
          SELECT id
          FROM financeiro_categorias
          WHERE empresa_id = ?
            AND LOWER(nome) = LOWER(?)
          LIMIT 1
        `,
        [
          empresaId,
          nome,
        ]
      );

    if (!existe) {
      await executarRun(
        `
          INSERT INTO financeiro_categorias (
            empresa_id,
            nome,
            tipo,
            ativo
          )
          VALUES (?, ?, ?, 1)
        `,
        [
          empresaId,
          nome,
          tipo,
        ]
      );
    }
  }
}

export async function listarCategoriasFinanceiras(
  empresaId = 1,
  tipo?: TipoLancamento
) {
  await garantirCategoriasFinanceiras(
    empresaId
  );

  const parametros: any[] =
    [empresaId];

  let filtroTipo = '';

  if (tipo) {
    filtroTipo = `
      AND (
        tipo = ?
        OR tipo = 'AMBOS'
      )
    `;

    parametros.push(tipo);
  }

  return executarAll(
    `
      SELECT
        id,
        empresa_id,
        nome,
        tipo,
        ativo
      FROM financeiro_categorias
      WHERE empresa_id = ?
        AND ativo = 1
        ${filtroTipo}
      ORDER BY nome ASC
    `,
    parametros
  );
}

/*
|--------------------------------------------------------------------------
| FORNECEDOR - INFORMAÇÕES / SUGESTÕES
|--------------------------------------------------------------------------
*/

export async function buscarResumoFornecedorFinanceiro(
  fornecedorId: number
) {
  await buscarFornecedorPorId(fornecedorId);
  const fornecedor =
    await executarGet<any>(
      `
        SELECT
          id,
          razao_social,
          nome_fantasia,
          cpf_cnpj,
          telefone,
          email
        FROM fornecedores
        WHERE id = ?
        LIMIT 1
      `,
      [fornecedorId]
    );

  if (!fornecedor) {
    throw new Error(
      'Fornecedor não encontrado.'
    );
  }

  const historico =
    await executarAll<any>(
      `
        SELECT
          fl.id,
          fl.descricao,
          fl.valor_original,
          fl.data_vencimento,
          fl.forma_pagamento,
          fl.status,

          fc.id AS categoria_id,
          fc.nome AS categoria,

          l.id AS loja_id,
          l.nome AS loja

        FROM financeiro_lancamentos fl

        LEFT JOIN financeiro_categorias fc
          ON fc.id = fl.categoria_id

        LEFT JOIN lojas l
          ON l.id = fl.loja_id

        WHERE fl.fornecedor_id = ?
          AND ${escopoLojaSql('fl.loja_id')}
          AND fl.status <> 'CANCELADO'

        ORDER BY
          fl.criado_em DESC

        LIMIT 10
      `,
      [fornecedorId]
    );

  const sugestao =
    historico.length
      ? {
          descricao:
            historico[0].descricao || null,

          categoriaId:
            historico[0].categoria_id || null,

          categoria:
            historico[0].categoria || null,

          lojaId:
            historico[0].loja_id || null,

          loja:
            historico[0].loja || null,

          formaPagamento:
            historico[0].forma_pagamento || null,
        }
      : null;

  const totais =
    await executarGet<any>(
      `
        SELECT

          COALESCE(
            SUM(
              CASE
                WHEN tipo = 'SAIDA'
                  AND status <> 'CANCELADO'
                THEN valor_original
                ELSE 0
              END
            ),
            0
          ) AS total_lancado,

          COALESCE(
            SUM(
              CASE
                WHEN tipo = 'SAIDA'
                  AND status = 'PENDENTE'
                THEN valor_original
                ELSE 0
              END
            ),
            0
          ) AS total_pendente

        FROM financeiro_lancamentos

        WHERE fornecedor_id = ?
          AND ${escopoLojaSql('loja_id')}
      `,
      [fornecedorId]
    );

  const pago =
    await executarGet<any>(
      `
        SELECT
          COALESCE(
            SUM(fb.valor),
            0
          ) AS total_pago

        FROM financeiro_baixas fb

        INNER JOIN financeiro_lancamentos fl
          ON fl.id = fb.lancamento_id

        WHERE fl.fornecedor_id = ?
          AND ${escopoLojaSql('fl.loja_id')}
          AND fl.tipo = 'SAIDA'
          AND fl.status <> 'CANCELADO'
      `,
      [fornecedorId]
    );

  return {
    fornecedor,
    sugestao,
    historico,

    totais: {
      totalLancado:
        numeroSeguro(
          totais?.total_lancado
        ),

      totalPago:
        numeroSeguro(
          pago?.total_pago
        ),

      totalPendente:
        numeroSeguro(
          totais?.total_pendente
        ),
    },
  };
}

/*
|--------------------------------------------------------------------------
| POSSÍVEL DUPLICIDADE
|--------------------------------------------------------------------------
*/

export async function verificarPossivelDuplicidade(
  dados: {
    fornecedorId?: number | null;
    lojaId?: number | null;
    numeroDocumento?: string | null;
    valorOriginal: number;
    dataVencimento: string;
    tipo: TipoLancamento;
  }
) {
  const parametros: any[] = [
    dados.tipo,
    numeroSeguro(dados.valorOriginal),
    dados.dataVencimento,
  ];

  const condicoes: string[] = [
    escopoLojaSql('fl.loja_id'),
    `fl.tipo = ?`,
    `ROUND(fl.valor_original, 2) = ROUND(?, 2)`,
    `fl.data_vencimento = ?`,
    `fl.status <> 'CANCELADO'`,
  ];

  /*
  |--------------------------------------------------------------------------
  | FORNECEDOR
  |--------------------------------------------------------------------------
  */

  if (dados.fornecedorId) {
    condicoes.push(
      `fl.fornecedor_id = ?`
    );

    parametros.push(
      dados.fornecedorId
    );
  }

  /*
  |--------------------------------------------------------------------------
  | UNIDADE
  |--------------------------------------------------------------------------
  */

  if (dados.lojaId) {
    condicoes.push(
      `fl.loja_id = ?`
    );

    parametros.push(
      dados.lojaId
    );
  }

  /*
  |--------------------------------------------------------------------------
  | NÚMERO DO DOCUMENTO
  |--------------------------------------------------------------------------
  */

  const numeroDocumento =
    limparTexto(
      dados.numeroDocumento
    );

  if (numeroDocumento) {
    condicoes.push(`
      (
        fl.numero_documento = ?
        OR fl.numero_documento IS NULL
      )
    `);

    parametros.push(
      numeroDocumento
    );
  }

  /*
  |--------------------------------------------------------------------------
  | PESQUISA
  |--------------------------------------------------------------------------
  */

  const encontrados =
    await executarAll<any>(
      `
        SELECT
          fl.id,
          fl.tipo,
          fl.descricao,
          fl.numero_documento,
          fl.valor_original,
          fl.data_vencimento,
          fl.status,

          fl.fornecedor_id,
          fl.loja_id,

          f.razao_social,
          f.nome_fantasia,
          f.cpf_cnpj,

          l.nome AS loja

        FROM financeiro_lancamentos fl

        LEFT JOIN fornecedores f
          ON f.id = fl.fornecedor_id

        LEFT JOIN lojas l
          ON l.id = fl.loja_id

        WHERE
          ${condicoes.join(' AND ')}

        ORDER BY
          fl.id DESC

        LIMIT 5
      `,
      parametros
    );

  return {
    duplicidadePossivel:
      encontrados.length > 0,

    encontrados,
  };
}
/*
|--------------------------------------------------------------------------
| CRIAR LANÇAMENTO
|--------------------------------------------------------------------------
*/

async function criarLancamentoFinanceiroImpl(
  dados: CriarLancamentoPayload
) {
  await garantirVinculosCadastros();
  dados = { ...dados, lojaId: lojaCadastroAtual(Number(dados.lojaId) || undefined) };
  if (dados.fornecedorId) await exigirCadastroNaLoja('fornecedor', Number(dados.fornecedorId), Number(dados.lojaId));
  const empresaId =
    dados.empresaId || 1;

  if (
    dados.tipo !== 'ENTRADA' &&
    dados.tipo !== 'SAIDA'
  ) {
    throw new Error(
      'Tipo de lançamento inválido.'
    );
  }

  const descricao =
    limparTexto(
      dados.descricao
    );

  if (!descricao) {
    throw new Error(
      'Informe a descrição do lançamento.'
    );
  }

  const valorOriginal =
    numeroSeguro(
      dados.valorOriginal
    );

  if (valorOriginal <= 0) {
    throw new Error(
      'O valor do lançamento deve ser maior que zero.'
    );
  }

  if (
    !dados.dataVencimento
  ) {
    throw new Error(
      'Informe a data de vencimento.'
    );
  }

  if (
    dados.fornecedorId
  ) {
    const fornecedor =
      await executarGet<any>(
        `
          SELECT id
          FROM fornecedores
          WHERE id = ?
          LIMIT 1
        `,
        [dados.fornecedorId]
      );

    if (!fornecedor) {
      throw new Error(
        'Fornecedor não encontrado.'
      );
    }
  }

  if (dados.lojaId) {
    const loja =
      await executarGet<any>(
        `
          SELECT id
          FROM lojas
          WHERE id = ?
          LIMIT 1
        `,
        [dados.lojaId]
      );

    if (!loja) {
      throw new Error(
        'Unidade não encontrada.'
      );
    }
  }

  const duplicidade =
    await verificarPossivelDuplicidade({
      fornecedorId:
        dados.fornecedorId,

      lojaId:
        dados.lojaId,

      numeroDocumento:
        dados.numeroDocumento,

      valorOriginal,

      dataVencimento:
        dados.dataVencimento,

      tipo:
        dados.tipo,
    });

  if (
    duplicidade.duplicidadePossivel &&
    !dados.permitirDuplicidade
  ) {
    return {
      sucesso: false,
      requerConfirmacaoDuplicidade:
        true,

      mensagem:
        'Encontramos um lançamento semelhante. Confira antes de salvar.',

      duplicidades:
        duplicidade.encontrados,
    };
  }

  const resultado =
    await executarRun(
      `
        INSERT INTO financeiro_lancamentos (
          empresa_id,
          tipo,
          fornecedor_id,
          loja_id,
          categoria_id,
          descricao,
          numero_documento,
          valor_original,
          data_emissao,
          data_vencimento,
          forma_pagamento,
          status,
          nota_entrada_id,
          nota_entrada_parcela_id,
          observacao,
          usuario_criacao_id
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
          'PENDENTE',
          ?,
          ?,
          ?,
          ?
        )
      `,
      [
        empresaId,
        dados.tipo,

        dados.fornecedorId ||
          null,

        dados.lojaId ||
          null,

        dados.categoriaId ||
          null,

        descricao,

        limparTexto(
          dados.numeroDocumento
        ),

        valorOriginal,

        dados.dataEmissao ||
          null,

        dados.dataVencimento,

        limparTexto(
          dados.formaPagamento
        ),

        dados.notaEntradaId ||
          null,

        dados.notaEntradaParcelaId ||
          null,

        limparTexto(
          dados.observacao
        ),

        dados.usuarioId ||
          null,
      ]
    );

  await registrarHistorico(
    resultado.lastID,

    dados.usuarioId,

    'CRIACAO',

    dados.tipo === 'SAIDA'
      ? 'Conta a pagar criada.'
      : 'Conta a receber criada.'
  );

  const lancamento =
    await buscarLancamentoFinanceiroPorId(
      resultado.lastID
    );

  return {
    sucesso: true,
    requerConfirmacaoDuplicidade:
      false,
    lancamento,
  };
}

/*
|--------------------------------------------------------------------------
| BUSCAR LANÇAMENTO
|--------------------------------------------------------------------------
*/

export async function buscarLancamentoFinanceiroPorId(
  id: number
) {
  const lancamento =
    await executarGet<any>(
      `
        SELECT
          fl.*,

          f.razao_social
            AS fornecedor_razao_social,

          f.nome_fantasia
            AS fornecedor_nome_fantasia,

          f.cpf_cnpj
            AS fornecedor_cpf_cnpj,

          l.nome
            AS loja_nome,

          fc.nome
            AS categoria_nome,

          uc.nome
            AS usuario_criacao_nome,

          ua.nome
            AS usuario_alteracao_nome,

          ub.nome
            AS usuario_baixa_nome,

          COALESCE(
            (
              SELECT SUM(fb.valor)
              FROM financeiro_baixas fb
              WHERE fb.lancamento_id = fl.id
            ),
            0
          ) AS valor_baixado

        FROM financeiro_lancamentos fl

        LEFT JOIN fornecedores f
          ON f.id = fl.fornecedor_id

        LEFT JOIN lojas l
          ON l.id = fl.loja_id

        LEFT JOIN financeiro_categorias fc
          ON fc.id = fl.categoria_id

        LEFT JOIN usuarios uc
          ON uc.id =
            fl.usuario_criacao_id

        LEFT JOIN usuarios ua
          ON ua.id =
            fl.usuario_alteracao_id

        LEFT JOIN usuarios ub
          ON ub.id =
            fl.usuario_baixa_id

        WHERE fl.id = ?
          AND ${escopoLojaSql('fl.loja_id')}

        LIMIT 1
      `,
      [id]
    );

  if (!lancamento) {
    throw new Error(
      'Lançamento financeiro não encontrado.'
    );
  }

  const baixas =
    await executarAll<any>(
      `
        SELECT
          fb.*,
          u.nome AS usuario_nome

        FROM financeiro_baixas fb

        LEFT JOIN usuarios u
          ON u.id = fb.usuario_id

        WHERE fb.lancamento_id = ?

        ORDER BY
          fb.data_baixa DESC,
          fb.id DESC
      `,
      [id]
    );

  const historico =
    await executarAll<any>(
      `
        SELECT
          fh.*,
          u.nome AS usuario_nome

        FROM financeiro_historico fh

        LEFT JOIN usuarios u
          ON u.id = fh.usuario_id

        WHERE fh.lancamento_id = ?

        ORDER BY
          fh.criado_em DESC,
          fh.id DESC
      `,
      [id]
    );

  return {
    ...lancamento,

    valor_original:
      numeroSeguro(
        lancamento.valor_original
      ),

    valor_baixado:
      numeroSeguro(
        lancamento.valor_baixado
      ),

    saldo_aberto:
      Math.max(
        0,

        numeroSeguro(
          lancamento.valor_original
        ) -
        numeroSeguro(
          lancamento.valor_baixado
        )
      ),

    baixas,
    historico,
  };
}

/*
|--------------------------------------------------------------------------
| LISTAR LANÇAMENTOS
|--------------------------------------------------------------------------
*/

export async function listarLancamentosFinanceiros(
  filtros: {
    tipo?: TipoLancamento;
    status?: string;
    lojaId?: number;
    fornecedorId?: number;
    categoriaId?: number;
    dataInicio?: string;
    dataFim?: string;
    busca?: string;
    limite?: number;
  } = {}
) {
  const parametros: any[] = [];

  const condicoes: string[] =
    [escopoLojaSql('fl.loja_id')];

  if (filtros.tipo) {
    condicoes.push(
      'fl.tipo = ?'
    );

    parametros.push(
      filtros.tipo
    );
  }

  if (filtros.status) {
    if (
      filtros.status ===
      'ATRASADO'
    ) {
      condicoes.push(`
        fl.status = 'PENDENTE'
        AND fl.data_vencimento < ?
      `);

      parametros.push(
        hojeISO()
      );
    } else {
      condicoes.push(
        'fl.status = ?'
      );

      parametros.push(
        filtros.status
      );
    }
  }

  if (filtros.lojaId) {
    condicoes.push(
      'fl.loja_id = ?'
    );

    parametros.push(
      filtros.lojaId
    );
  }

  if (filtros.fornecedorId) {
    condicoes.push(
      'fl.fornecedor_id = ?'
    );

    parametros.push(
      filtros.fornecedorId
    );
  }

  if (filtros.categoriaId) {
    condicoes.push(
      'fl.categoria_id = ?'
    );

    parametros.push(
      filtros.categoriaId
    );
  }

  if (filtros.dataInicio) {
    condicoes.push(
      'fl.data_vencimento >= ?'
    );

    parametros.push(
      filtros.dataInicio
    );
  }

  if (filtros.dataFim) {
    condicoes.push(
      'fl.data_vencimento <= ?'
    );

    parametros.push(
      filtros.dataFim
    );
  }

  if (filtros.busca) {
    const busca =
      `%${filtros.busca.trim()}%`;

    condicoes.push(`
      (
        fl.descricao LIKE ?
        OR fl.numero_documento LIKE ?
        OR f.razao_social LIKE ?
        OR f.nome_fantasia LIKE ?
        OR f.cpf_cnpj LIKE ?
      )
    `);

    parametros.push(
      busca,
      busca,
      busca,
      busca,
      busca
    );
  }

  const limite =
    Math.min(
      Math.max(
        Number(
          filtros.limite || 500
        ),
        1
      ),
      2000
    );

  parametros.push(limite);

  const hoje =
    hojeISO();

  return executarAll<any>(
    `
      SELECT
        fl.*,

        f.razao_social
          AS fornecedor_razao_social,

        f.nome_fantasia
          AS fornecedor_nome_fantasia,

        f.cpf_cnpj
          AS fornecedor_cpf_cnpj,

        l.nome
          AS loja_nome,

        fc.nome
          AS categoria_nome,

        u.nome
          AS usuario_nome,

        COALESCE(
          (
            SELECT SUM(fb.valor)
            FROM financeiro_baixas fb
            WHERE fb.lancamento_id = fl.id
          ),
          0
        ) AS valor_baixado,

        CASE

          WHEN fl.status = 'CANCELADO'
            THEN 'CANCELADO'

          WHEN fl.status = 'PAGO'
            THEN 'PAGO'

          WHEN fl.status = 'RECEBIDO'
            THEN 'RECEBIDO'

          WHEN fl.data_vencimento < '${hoje}'
            THEN 'ATRASADO'

          WHEN fl.data_vencimento = '${hoje}'
            THEN 'VENCE_HOJE'

          ELSE 'PENDENTE'

        END AS status_visual

      FROM financeiro_lancamentos fl

      LEFT JOIN fornecedores f
        ON f.id = fl.fornecedor_id

      LEFT JOIN lojas l
        ON l.id = fl.loja_id

      LEFT JOIN financeiro_categorias fc
        ON fc.id = fl.categoria_id

      LEFT JOIN usuarios u
        ON u.id =
          fl.usuario_criacao_id

      WHERE
        ${condicoes.join(' AND ')}

      ORDER BY

        CASE
          WHEN fl.status = 'PENDENTE'
            AND fl.data_vencimento < '${hoje}'
            THEN 1

          WHEN fl.status = 'PENDENTE'
            AND fl.data_vencimento = '${hoje}'
            THEN 2

          WHEN fl.status = 'PENDENTE'
            THEN 3

          ELSE 4
        END,

        fl.data_vencimento ASC,
        fl.id DESC

      LIMIT ?
    `,
    parametros
  );
}

/*
|--------------------------------------------------------------------------
| ATUALIZAR
|--------------------------------------------------------------------------
*/

async function atualizarLancamentoFinanceiroImpl(
  id: number,
  dados: AtualizarLancamentoPayload
) {
  const atual =
    await buscarLancamentoFinanceiroPorId(
      id
    );
  if (dados.lojaId && Number(dados.lojaId) !== Number(atual.loja_id)) throw new Error('O mercado de um lançamento existente não pode ser alterado.');
  if (dados.fornecedorId) await exigirCadastroNaLoja('fornecedor',Number(dados.fornecedorId),Number(atual.loja_id));

  if (
    atual.status === 'CANCELADO'
  ) {
    throw new Error(
      'Não é possível alterar um lançamento cancelado.'
    );
  }

  const campos: string[] = [];
  const parametros: any[] = [];

  function adicionar(
    coluna: string,
    valor: any
  ) {
    campos.push(
      `${coluna} = ?`
    );

    parametros.push(valor);
  }

  if (
    dados.fornecedorId !==
    undefined
  ) {
    adicionar(
      'fornecedor_id',
      dados.fornecedorId || null
    );
  }

  if (
    dados.lojaId !==
    undefined
  ) {
    adicionar(
      'loja_id',
      dados.lojaId || null
    );
  }

  if (
    dados.categoriaId !==
    undefined
  ) {
    adicionar(
      'categoria_id',
      dados.categoriaId || null
    );
  }

  if (
    dados.descricao !==
    undefined
  ) {
    const descricao =
      limparTexto(
        dados.descricao
      );

    if (!descricao) {
      throw new Error(
        'A descrição não pode ficar vazia.'
      );
    }

    adicionar(
      'descricao',
      descricao
    );
  }

  if (
    dados.numeroDocumento !==
    undefined
  ) {
    adicionar(
      'numero_documento',
      limparTexto(
        dados.numeroDocumento
      )
    );
  }

  if (
    dados.valorOriginal !==
    undefined
  ) {
    const valor =
      numeroSeguro(
        dados.valorOriginal
      );

    if (valor <= 0) {
      throw new Error(
        'O valor deve ser maior que zero.'
      );
    }

    adicionar(
      'valor_original',
      valor
    );
  }

  if (
    dados.dataEmissao !==
    undefined
  ) {
    adicionar(
      'data_emissao',
      dados.dataEmissao ||
        null
    );
  }

  if (
    dados.dataVencimento !==
    undefined
  ) {
    if (
      !dados.dataVencimento
    ) {
      throw new Error(
        'Informe a data de vencimento.'
      );
    }

    adicionar(
      'data_vencimento',
      dados.dataVencimento
    );
  }

  if (
    dados.formaPagamento !==
    undefined
  ) {
    adicionar(
      'forma_pagamento',
      limparTexto(
        dados.formaPagamento
      )
    );
  }

  if (
    dados.observacao !==
    undefined
  ) {
    adicionar(
      'observacao',
      limparTexto(
        dados.observacao
      )
    );
  }

  if (!campos.length) {
    return atual;
  }

  campos.push(
    'usuario_alteracao_id = ?'
  );

  parametros.push(
    dados.usuarioId || null
  );

  campos.push(
    'atualizado_em = CURRENT_TIMESTAMP'
  );

  parametros.push(id);

  await executarRun(
    `
      UPDATE financeiro_lancamentos
      SET
        ${campos.join(', ')}
      WHERE id = ?
    `,
    parametros
  );

  await registrarHistorico(
    id,

    dados.usuarioId,

    'ALTERACAO',

    'Lançamento financeiro alterado.'
  );

  return buscarLancamentoFinanceiroPorId(
    id
  );
}

/*
|--------------------------------------------------------------------------
| BAIXA / PAGAMENTO / RECEBIMENTO
|--------------------------------------------------------------------------
*/

async function registrarBaixaFinanceiraImpl(
  lancamentoId: number,
  dados: RegistrarBaixaPayload
) {
  const lancamento =
    await buscarLancamentoFinanceiroPorId(
      lancamentoId
    );

  if (
    lancamento.status ===
    'CANCELADO'
  ) {
    throw new Error(
      'Não é possível baixar um lançamento cancelado.'
    );
  }

  if (
    lancamento.status ===
      'PAGO' ||
    lancamento.status ===
      'RECEBIDO'
  ) {
    throw new Error(
      'Este lançamento já está totalmente baixado.'
    );
  }

  const valor =
    numeroSeguro(
      dados.valor
    );

  if (valor <= 0) {
    throw new Error(
      'Informe um valor de baixa maior que zero.'
    );
  }

  const saldoAtual =
    numeroSeguro(
      lancamento.saldo_aberto
    );

  if (
    valor >
    saldoAtual + 0.009
  ) {
    throw new Error(
      `O valor informado é maior que o saldo em aberto de R$ ${saldoAtual.toFixed(2)}.`
    );
  }

  if (!dados.dataBaixa) {
    throw new Error(
      'Informe a data do pagamento/recebimento.'
    );
  }

  await executarRun(
    'BEGIN TRANSACTION'
  );

  try {
    await executarRun(
      `
        INSERT INTO financeiro_baixas (
          lancamento_id,
          valor,
          data_baixa,
          forma_pagamento,
          observacao,
          usuario_id
        )
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      [
        lancamentoId,
        valor,
        dados.dataBaixa,

        limparTexto(
          dados.formaPagamento
        ),

        limparTexto(
          dados.observacao
        ),

        dados.usuarioId ||
          null,
      ]
    );

    const totais =
      await executarGet<any>(
        `
          SELECT
            COALESCE(
              SUM(valor),
              0
            ) AS total

          FROM financeiro_baixas

          WHERE lancamento_id = ?
        `,
        [lancamentoId]
      );

    const totalBaixado =
      numeroSeguro(
        totais?.total
      );

    const quitado =
      totalBaixado + 0.009 >=
      numeroSeguro(
        lancamento.valor_original
      );

    if (quitado) {
      const novoStatus =
        lancamento.tipo ===
        'SAIDA'
          ? 'PAGO'
          : 'RECEBIDO';

      await executarRun(
        `
          UPDATE financeiro_lancamentos
          SET
            status = ?,
            usuario_baixa_id = ?,
            baixado_em = CURRENT_TIMESTAMP,
            atualizado_em = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
        [
          novoStatus,
          dados.usuarioId ||
            null,
          lancamentoId,
        ]
      );
    } else {
      await executarRun(
        `
          UPDATE financeiro_lancamentos
          SET
            usuario_baixa_id = ?,
            atualizado_em =
              CURRENT_TIMESTAMP
          WHERE id = ?
        `,
        [
          dados.usuarioId ||
            null,

          lancamentoId,
        ]
      );
    }

    await registrarHistorico(
      lancamentoId,

      dados.usuarioId,

      lancamento.tipo ===
      'SAIDA'
        ? 'PAGAMENTO'
        : 'RECEBIMENTO',

      quitado
        ? 'Baixa integral realizada.'
        : 'Baixa parcial realizada.',

      null,

      String(valor)
    );

    await executarRun(
      'COMMIT'
    );
  } catch (error) {
    await executarRun(
      'ROLLBACK'
    );

    throw error;
  }

  return buscarLancamentoFinanceiroPorId(
    lancamentoId
  );
}

/*
|--------------------------------------------------------------------------
| CANCELAR
|--------------------------------------------------------------------------
*/

async function cancelarLancamentoFinanceiroImpl(
  id: number,
  usuarioId?: number | null,
  motivo?: string | null
) {
  const lancamento =
    await buscarLancamentoFinanceiroPorId(
      id
    );

  if (
    lancamento.status ===
    'CANCELADO'
  ) {
    throw new Error(
      'Este lançamento já está cancelado.'
    );
  }

  if (
    numeroSeguro(
      lancamento.valor_baixado
    ) > 0
  ) {
    throw new Error(
      'Este lançamento possui baixa financeira e não pode ser simplesmente cancelado.'
    );
  }

  await executarRun(
    `
      UPDATE financeiro_lancamentos
      SET
        status = 'CANCELADO',
        cancelado_em =
          CURRENT_TIMESTAMP,
        motivo_cancelamento = ?,
        usuario_alteracao_id = ?,
        atualizado_em =
          CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    [
      limparTexto(motivo),
      usuarioId || null,
      id,
    ]
  );

  await registrarHistorico(
    id,
    usuarioId,
    'CANCELAMENTO',
    motivo ||
      'Lançamento cancelado.'
  );

  return buscarLancamentoFinanceiroPorId(
    id
  );
}

/*
|--------------------------------------------------------------------------
| RESUMO DO PAINEL
|--------------------------------------------------------------------------
*/

export async function obterResumoFinanceiro(
  filtros: {
    lojaId?: number;
  } = {}
) {
  const hoje =
    hojeISO();

  const inicioMes =
    primeiroDiaMes();

  const fimMes =
    ultimoDiaMes();

  const proximos7 =
    somarDias(
      hoje,
      7
    );

  const parametrosLoja: any[] =
    [];

  let filtroLoja = `AND ${escopoLojaSql('fl.loja_id')}`;

  if (filtros.lojaId) {
    filtroLoja +=
      ' AND fl.loja_id = ?';

    parametrosLoja.push(
      filtros.lojaId
    );
  }

  const resumo =
    await executarGet<any>(
      `
        SELECT

          COALESCE(
            SUM(
              CASE
                WHEN fl.tipo = 'SAIDA'
                  AND fl.status = 'PENDENTE'
                THEN
                  fl.valor_original -
                  COALESCE(
                    (
                      SELECT SUM(fb.valor)
                      FROM financeiro_baixas fb
                      WHERE fb.lancamento_id = fl.id
                    ),
                    0
                  )
                ELSE 0
              END
            ),
            0
          ) AS a_pagar,

          COALESCE(
            SUM(
              CASE
                WHEN fl.tipo = 'ENTRADA'
                  AND fl.status = 'PENDENTE'
                THEN
                  fl.valor_original -
                  COALESCE(
                    (
                      SELECT SUM(fb.valor)
                      FROM financeiro_baixas fb
                      WHERE fb.lancamento_id = fl.id
                    ),
                    0
                  )
                ELSE 0
              END
            ),
            0
          ) AS a_receber,

          COALESCE(
            SUM(
              CASE
                WHEN fl.status = 'PENDENTE'
                  AND fl.data_vencimento < ?
                THEN
                  fl.valor_original -
                  COALESCE(
                    (
                      SELECT SUM(fb.valor)
                      FROM financeiro_baixas fb
                      WHERE fb.lancamento_id = fl.id
                    ),
                    0
                  )
                ELSE 0
              END
            ),
            0
          ) AS atrasados,

          COALESCE(
            SUM(
              CASE
                WHEN fl.status = 'PENDENTE'
                  AND fl.data_vencimento = ?
                THEN
                  fl.valor_original -
                  COALESCE(
                    (
                      SELECT SUM(fb.valor)
                      FROM financeiro_baixas fb
                      WHERE fb.lancamento_id = fl.id
                    ),
                    0
                  )
                ELSE 0
              END
            ),
            0
          ) AS vence_hoje,

          COALESCE(
            SUM(
              CASE
                WHEN fl.status = 'PENDENTE'
                  AND fl.data_vencimento > ?
                  AND fl.data_vencimento <= ?
                THEN
                  fl.valor_original -
                  COALESCE(
                    (
                      SELECT SUM(fb.valor)
                      FROM financeiro_baixas fb
                      WHERE fb.lancamento_id = fl.id
                    ),
                    0
                  )
                ELSE 0
              END
            ),
            0
          ) AS proximos_7_dias

        FROM financeiro_lancamentos fl

        WHERE fl.status <> 'CANCELADO'

        ${filtroLoja}
      `,
      [
        hoje,
        hoje,
        hoje,
        proximos7,
        ...parametrosLoja,
      ]
    );

  const realizado =
    await executarGet<any>(
      `
        SELECT

          COALESCE(
            SUM(
              CASE
                WHEN fl.tipo = 'ENTRADA'
                THEN fb.valor
                ELSE 0
              END
            ),
            0
          ) AS entradas_mes,

          COALESCE(
            SUM(
              CASE
                WHEN fl.tipo = 'SAIDA'
                THEN fb.valor
                ELSE 0
              END
            ),
            0
          ) AS saidas_mes

        FROM financeiro_baixas fb

        INNER JOIN financeiro_lancamentos fl
          ON fl.id = fb.lancamento_id

        WHERE fb.data_baixa
          BETWEEN ? AND ?

          AND fl.status <> 'CANCELADO'

          ${filtroLoja}
      `,
      [
        inicioMes,
        fimMes,
        ...parametrosLoja,
      ]
    );

  const entradasMes =
    numeroSeguro(
      realizado?.entradas_mes
    );

  const saidasMes =
    numeroSeguro(
      realizado?.saidas_mes
    );

  return {
    periodo: {
      inicio:
        inicioMes,
      fim:
        fimMes,
      hoje,
    },

    saldoMes:
      entradasMes -
      saidasMes,

    entradasMes,

    saidasMes,

    aPagar:
      numeroSeguro(
        resumo?.a_pagar
      ),

    aReceber:
      numeroSeguro(
        resumo?.a_receber
      ),

    atrasados:
      numeroSeguro(
        resumo?.atrasados
      ),

    venceHoje:
      numeroSeguro(
        resumo?.vence_hoje
      ),

    proximos7Dias:
      numeroSeguro(
        resumo?.proximos_7_dias
      ),
  };
}

/*
|--------------------------------------------------------------------------
| FLUXO DE CAIXA
|--------------------------------------------------------------------------
*/

export async function obterFluxoCaixa(
  filtros: {
    dataInicio: string;
    dataFim: string;
    lojaId?: number;
  }
) {
  if (
    !filtros.dataInicio ||
    !filtros.dataFim
  ) {
    throw new Error(
      'Informe o período do fluxo de caixa.'
    );
  }

  const parametros: any[] = [
    filtros.dataInicio,
    filtros.dataFim,
  ];

  let filtroLoja = `AND ${escopoLojaSql('fl.loja_id')}`;

  if (filtros.lojaId) {
    filtroLoja +=
      ' AND fl.loja_id = ?';

    parametros.push(
      filtros.lojaId
    );
  }

  const realizado =
    await executarAll<any>(
      `
        SELECT

          fb.data_baixa AS data,

          fl.tipo,

          SUM(fb.valor)
            AS valor

        FROM financeiro_baixas fb

        INNER JOIN financeiro_lancamentos fl
          ON fl.id = fb.lancamento_id

        WHERE fb.data_baixa
          BETWEEN ? AND ?

          AND fl.status <> 'CANCELADO'

          ${filtroLoja}

        GROUP BY
          fb.data_baixa,
          fl.tipo

        ORDER BY
          fb.data_baixa ASC
      `,
      parametros
    );

  const parametrosPrevisto: any[] = [
    filtros.dataInicio,
    filtros.dataFim,
  ];

  if (filtros.lojaId) {
    parametrosPrevisto.push(
      filtros.lojaId
    );
  }

  const previsto =
    await executarAll<any>(
      `
        SELECT

          fl.data_vencimento AS data,

          fl.tipo,

          SUM(
            fl.valor_original -
            COALESCE(
              (
                SELECT SUM(fb.valor)
                FROM financeiro_baixas fb
                WHERE fb.lancamento_id = fl.id
              ),
              0
            )
          ) AS valor

        FROM financeiro_lancamentos fl

        WHERE fl.data_vencimento
          BETWEEN ? AND ?

          AND fl.status = 'PENDENTE'

          ${filtroLoja}

        GROUP BY
          fl.data_vencimento,
          fl.tipo

        ORDER BY
          fl.data_vencimento ASC
      `,
      parametrosPrevisto
    );

  return {
    dataInicio:
      filtros.dataInicio,

    dataFim:
      filtros.dataFim,

    realizado,
    previsto,
  };
}

/*
|--------------------------------------------------------------------------
| FECHAMENTO DE CAIXA
|--------------------------------------------------------------------------
*/

export type SalvarFechamentoCaixaPayload = {
  empresaId?: number;
  lojaId: number;
  dataFechamento: string;
  valorEspecie: number;
  valorMaquininhas: number;
  usuarioId?: number | null;
};

export type AtualizarFechamentoCaixaPayload = {
  dataFechamento: string;
  valorEspecie: number;
  valorMaquininhas: number;
  usuarioId?: number | null;
};

async function garantirTabelaFechamentosCaixa() {
  await executarRun(`
    CREATE TABLE IF NOT EXISTS financeiro_fechamentos_caixa (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      empresa_id INTEGER NOT NULL,
      loja_id INTEGER NOT NULL,
      data_fechamento TEXT NOT NULL,
      valor_especie REAL NOT NULL DEFAULT 0,
      valor_maquininhas REAL NOT NULL DEFAULT 0,
      valor_total REAL NOT NULL DEFAULT 0,
      lancamento_id INTEGER NOT NULL UNIQUE,
      usuario_id INTEGER,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
      atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (empresa_id) REFERENCES empresas(id),
      FOREIGN KEY (loja_id) REFERENCES lojas(id),
      FOREIGN KEY (lancamento_id) REFERENCES financeiro_lancamentos(id),
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
      UNIQUE (loja_id, data_fechamento)
    )
  `);

  await executarRun(`
    CREATE INDEX IF NOT EXISTS idx_fechamento_caixa_data
    ON financeiro_fechamentos_caixa(data_fechamento)
  `);

  await executarRun(`
    CREATE INDEX IF NOT EXISTS idx_fechamento_caixa_loja
    ON financeiro_fechamentos_caixa(loja_id)
  `);
}

async function salvarFechamentoCaixaImpl(
  dados: SalvarFechamentoCaixaPayload
) {
  await garantirTabelaFechamentosCaixa();

  const empresaId = dados.empresaId || 1;
  const lojaId = Number(dados.lojaId);
  const dataFechamento = limparTexto(dados.dataFechamento);
  const valorEspecie = numeroSeguro(dados.valorEspecie);
  const valorMaquininhas = numeroSeguro(dados.valorMaquininhas);
  const valorTotal = valorEspecie + valorMaquininhas;

  if (!lojaId) {
    throw new Error('Não foi possível identificar a unidade Matriz.');
  }

  if (!dataFechamento) {
    throw new Error('Informe a data do fechamento.');
  }

  if (valorEspecie < 0 || valorMaquininhas < 0) {
    throw new Error('Os valores do fechamento não podem ser negativos.');
  }

  if (valorTotal <= 0) {
    throw new Error('Informe o valor em espécie e/ou o valor das maquininhas.');
  }

  const loja = await executarGet<any>(
    `SELECT id, nome FROM lojas WHERE id = ? LIMIT 1`,
    [lojaId]
  );

  if (!loja) {
    throw new Error('Unidade não encontrada.');
  }

  const existente = await executarGet<any>(
    `
      SELECT id, valor_total
      FROM financeiro_fechamentos_caixa
      WHERE loja_id = ? AND data_fechamento = ?
      LIMIT 1
    `,
    [lojaId, dataFechamento]
  );

  if (existente) {
    throw new Error(
      `Já existe fechamento de caixa para ${loja.nome} nesta data.`
    );
  }

  await garantirCategoriasFinanceiras(empresaId);

  const nomeLojaNormalizado = String(loja.nome || '').trim().toUpperCase();
  const fechamentoCondominio =
    nomeLojaNormalizado.includes('TSC') ||
    nomeLojaNormalizado.includes('MAISON');

  const nomeCategoriaFechamento = fechamentoCondominio
    ? 'Condomínios'
    : 'Venda';

  const categoriaFechamento = await executarGet<any>(
    `
      SELECT id
      FROM financeiro_categorias
      WHERE empresa_id = ?
        AND LOWER(nome) = LOWER(?)
        AND ativo = 1
      LIMIT 1
    `,
    [empresaId, nomeCategoriaFechamento]
  );

  await executarRun('BEGIN TRANSACTION');

  try {
    const lancamento = await executarRun(
      `
        INSERT INTO financeiro_lancamentos (
          empresa_id,
          tipo,
          fornecedor_id,
          loja_id,
          categoria_id,
          descricao,
          numero_documento,
          valor_original,
          data_emissao,
          data_vencimento,
          forma_pagamento,
          status,
          observacao,
          usuario_criacao_id,
          usuario_baixa_id,
          baixado_em
        )
        VALUES (?, 'ENTRADA', NULL, ?, ?, ?, ?, ?, ?, ?, 'Fechamento de caixa', 'RECEBIDO', ?, ?, ?, CURRENT_TIMESTAMP)
      `,
      [
        empresaId,
        lojaId,
        categoriaFechamento?.id || null,
        `FECHAMENTO DE CAIXA - ${String(loja.nome).toUpperCase()}`,
        `FECHAMENTO-${dataFechamento}-${lojaId}`,
        valorTotal,
        dataFechamento,
        dataFechamento,
        fechamentoCondominio
          ? `Maquininhas: ${valorMaquininhas.toFixed(2)}`
          : `Espécie: ${valorEspecie.toFixed(2)} | Maquininhas: ${valorMaquininhas.toFixed(2)}`,
        dados.usuarioId || null,
        dados.usuarioId || null,
      ]
    );

    await executarRun(
      `
        INSERT INTO financeiro_baixas (
          lancamento_id,
          valor,
          data_baixa,
          forma_pagamento,
          observacao,
          usuario_id
        )
        VALUES (?, ?, ?, 'Fechamento de caixa', ?, ?)
      `,
      [
        lancamento.lastID,
        valorTotal,
        dataFechamento,
        fechamentoCondominio
          ? `Maquininhas: ${valorMaquininhas.toFixed(2)}`
          : `Espécie: ${valorEspecie.toFixed(2)} | Maquininhas: ${valorMaquininhas.toFixed(2)}`,
        dados.usuarioId || null,
      ]
    );

    await executarRun(
      `
        INSERT INTO financeiro_fechamentos_caixa (
          empresa_id,
          loja_id,
          data_fechamento,
          valor_especie,
          valor_maquininhas,
          valor_total,
          lancamento_id,
          usuario_id
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        empresaId,
        lojaId,
        dataFechamento,
        valorEspecie,
        valorMaquininhas,
        valorTotal,
        lancamento.lastID,
        dados.usuarioId || null,
      ]
    );

    await registrarHistorico(
      lancamento.lastID,
      dados.usuarioId,
      'FECHAMENTO_CAIXA',
      `Fechamento registrado. Espécie: R$ ${valorEspecie.toFixed(2)} | Maquininhas: R$ ${valorMaquininhas.toFixed(2)} | Total: R$ ${valorTotal.toFixed(2)}`
    );

    await executarRun('COMMIT');

    return {
      sucesso: true,
      fechamento: {
        dataFechamento,
        valorEspecie,
        valorMaquininhas,
        valorTotal,
        lojaId,
        lojaNome: loja.nome,
        lancamentoId: lancamento.lastID,
      },
    };
  } catch (error) {
    await executarRun('ROLLBACK');
    throw error;
  }
}


async function atualizarFechamentoCaixaImpl(
  lancamentoId: number,
  dados: AtualizarFechamentoCaixaPayload
) {
  await garantirTabelaFechamentosCaixa();

  const id = Number(lancamentoId);
  const dataFechamento =
    limparTexto(dados.dataFechamento);
  const valorEspecie =
    numeroSeguro(dados.valorEspecie);
  const valorMaquininhas =
    numeroSeguro(dados.valorMaquininhas);
  const valorTotal =
    valorEspecie + valorMaquininhas;

  if (!id) {
    throw new Error(
      'Fechamento não identificado.'
    );
  }

  if (!dataFechamento) {
    throw new Error(
      'Informe a data do fechamento.'
    );
  }

  if (
    valorEspecie < 0 ||
    valorMaquininhas < 0
  ) {
    throw new Error(
      'Os valores do fechamento não podem ser negativos.'
    );
  }

  if (valorTotal <= 0) {
    throw new Error(
      'Informe o valor em espécie e/ou o valor das maquininhas.'
    );
  }

  const atual =
    await executarGet<any>(
      `
        SELECT
          fc.*,
          l.nome AS loja_nome
        FROM financeiro_fechamentos_caixa fc
        INNER JOIN lojas l
          ON l.id = fc.loja_id
        WHERE fc.lancamento_id = ?
          AND ${escopoLojaSql('fc.loja_id')}
        LIMIT 1
      `,
      [id]
    );

  if (!atual) {
    throw new Error(
      'Este lançamento não é um fechamento de caixa editável.'
    );
  }

  const conflito =
    await executarGet<any>(
      `
        SELECT id
        FROM financeiro_fechamentos_caixa
        WHERE loja_id = ?
          AND data_fechamento = ?
          AND lancamento_id <> ?
        LIMIT 1
      `,
      [
        atual.loja_id,
        dataFechamento,
        id,
      ]
    );

  if (conflito) {
    throw new Error(
      `Já existe fechamento de caixa para ${atual.loja_nome} nesta data.`
    );
  }

  const nomeLojaNormalizado =
    String(atual.loja_nome || '')
      .trim()
      .toUpperCase();

  const fechamentoCondominio =
    nomeLojaNormalizado.includes('TSC') ||
    nomeLojaNormalizado.includes('MAISON');

  const observacao =
    fechamentoCondominio
      ? `Maquininhas: ${valorMaquininhas.toFixed(2)}`
      : `Espécie: ${valorEspecie.toFixed(2)} | Maquininhas: ${valorMaquininhas.toFixed(2)}`;

  const numeroDocumento =
    `FECHAMENTO-${dataFechamento}-${atual.loja_id}`;

  await executarRun('BEGIN TRANSACTION');

  try {
    await executarRun(
      `
        UPDATE financeiro_fechamentos_caixa
        SET
          data_fechamento = ?,
          valor_especie = ?,
          valor_maquininhas = ?,
          valor_total = ?,
          usuario_id = ?,
          atualizado_em = CURRENT_TIMESTAMP
        WHERE lancamento_id = ?
      `,
      [
        dataFechamento,
        valorEspecie,
        valorMaquininhas,
        valorTotal,
        dados.usuarioId ||
          atual.usuario_id ||
          null,
        id,
      ]
    );

    await executarRun(
      `
        UPDATE financeiro_lancamentos
        SET
          valor_original = ?,
          data_emissao = ?,
          data_vencimento = ?,
          numero_documento = ?,
          observacao = ?,
          usuario_alteracao_id = ?,
          usuario_baixa_id = ?,
          atualizado_em = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      [
        valorTotal,
        dataFechamento,
        dataFechamento,
        numeroDocumento,
        observacao,
        dados.usuarioId || null,
        dados.usuarioId || null,
        id,
      ]
    );

    const baixa =
      await executarGet<any>(
        `
          SELECT id
          FROM financeiro_baixas
          WHERE lancamento_id = ?
          ORDER BY id ASC
          LIMIT 1
        `,
        [id]
      );

    if (baixa) {
      await executarRun(
        `
          UPDATE financeiro_baixas
          SET
            valor = ?,
            data_baixa = ?,
            observacao = ?,
            usuario_id = ?
          WHERE id = ?
        `,
        [
          valorTotal,
          dataFechamento,
          observacao,
          dados.usuarioId || null,
          baixa.id,
        ]
      );
    } else {
      await executarRun(
        `
          INSERT INTO financeiro_baixas (
            lancamento_id,
            valor,
            data_baixa,
            forma_pagamento,
            observacao,
            usuario_id
          )
          VALUES (
            ?, ?, ?,
            'Fechamento de caixa',
            ?, ?
          )
        `,
        [
          id,
          valorTotal,
          dataFechamento,
          observacao,
          dados.usuarioId || null,
        ]
      );
    }

    await registrarHistorico(
      id,
      dados.usuarioId,
      'EDICAO_FECHAMENTO_CAIXA',
      `Fechamento corrigido. Antes: Espécie R$ ${numeroSeguro(
        atual.valor_especie
      ).toFixed(2)} | Maquininhas R$ ${numeroSeguro(
        atual.valor_maquininhas
      ).toFixed(2)} | Total R$ ${numeroSeguro(
        atual.valor_total
      ).toFixed(2)} | Data ${atual.data_fechamento}. Depois: Espécie R$ ${valorEspecie.toFixed(
        2
      )} | Maquininhas R$ ${valorMaquininhas.toFixed(
        2
      )} | Total R$ ${valorTotal.toFixed(
        2
      )} | Data ${dataFechamento}.`
    );

    await executarRun('COMMIT');

    return {
      sucesso: true,
      fechamento: {
        lancamentoId: id,
        lojaId: atual.loja_id,
        lojaNome: atual.loja_nome,
        dataFechamento,
        valorEspecie,
        valorMaquininhas,
        valorTotal,
      },
    };
  } catch (error) {
    await executarRun('ROLLBACK');
    throw error;
  }
}

export async function listarFechamentosCaixa(
  filtros: { lojaId?: number; limite?: number } = {}
) {
  await garantirTabelaFechamentosCaixa();

  const condicoes = [escopoLojaSql('fc.loja_id')];
  const parametros: any[] = [];

  if (filtros.lojaId) {
    condicoes.push('fc.loja_id = ?');
    parametros.push(filtros.lojaId);
  }

  const limite = Math.min(Math.max(Number(filtros.limite || 60), 1), 500);
  parametros.push(limite);

  return executarAll<any>(
    `
      SELECT
        fc.*,
        l.nome AS loja_nome,
        u.nome AS usuario_nome
      FROM financeiro_fechamentos_caixa fc
      LEFT JOIN lojas l ON l.id = fc.loja_id
      LEFT JOIN usuarios u ON u.id = fc.usuario_id
      WHERE ${condicoes.join(' AND ')}
      ORDER BY fc.data_fechamento DESC, fc.id DESC
      LIMIT ?
    `,
    parametros
  );
}

/*
|--------------------------------------------------------------------------
| EXCLUIR LANÇAMENTO MANUAL
|--------------------------------------------------------------------------
*/

async function excluirLancamentoFinanceiroImpl(
  id: number,
  usuarioId?: number | null
) {
  await garantirTabelaFechamentosCaixa();

  const lancamento = await buscarLancamentoFinanceiroPorId(id);

  if (lancamento.nota_entrada_id || lancamento.nota_entrada_parcela_id) {
    throw new Error(
      'Este lançamento está vinculado a uma NF-e e não pode ser excluído manualmente.'
    );
  }

  await executarRun('BEGIN TRANSACTION');

  try {
    await executarRun(
      `DELETE FROM financeiro_fechamentos_caixa WHERE lancamento_id = ?`,
      [id]
    );

    await executarRun(
      `DELETE FROM financeiro_historico WHERE lancamento_id = ?`,
      [id]
    );

    await executarRun(
      `DELETE FROM financeiro_baixas WHERE lancamento_id = ?`,
      [id]
    );

    const resultado = await executarRun(
      `DELETE FROM financeiro_lancamentos WHERE id = ?`,
      [id]
    );

    if (!resultado.changes) {
      throw new Error('Lançamento não encontrado.');
    }

    await executarRun('COMMIT');

    return {
      sucesso: true,
      id,
      usuarioId: usuarioId || null,
    };
  } catch (error) {
    await executarRun('ROLLBACK');
    throw error;
  }
}


export function criarLancamentoFinanceiro(...args: Parameters<typeof criarLancamentoFinanceiroImpl>) { return comBloqueioBanco(() => criarLancamentoFinanceiroImpl(...args)); }

export function atualizarLancamentoFinanceiro(...args: Parameters<typeof atualizarLancamentoFinanceiroImpl>) { return comBloqueioBanco(() => atualizarLancamentoFinanceiroImpl(...args)); }

export function registrarBaixaFinanceira(...args: Parameters<typeof registrarBaixaFinanceiraImpl>) { return comBloqueioBanco(() => registrarBaixaFinanceiraImpl(...args)); }

export function cancelarLancamentoFinanceiro(...args: Parameters<typeof cancelarLancamentoFinanceiroImpl>) { return comBloqueioBanco(() => cancelarLancamentoFinanceiroImpl(...args)); }

export function salvarFechamentoCaixa(...args: Parameters<typeof salvarFechamentoCaixaImpl>) { return comBloqueioBanco(() => salvarFechamentoCaixaImpl(...args)); }

export function atualizarFechamentoCaixa(...args: Parameters<typeof atualizarFechamentoCaixaImpl>) { return comBloqueioBanco(() => atualizarFechamentoCaixaImpl(...args)); }

export function excluirLancamentoFinanceiro(...args: Parameters<typeof excluirLancamentoFinanceiroImpl>) { return comBloqueioBanco(() => excluirLancamentoFinanceiroImpl(...args)); }

