import db from '../database/database';

export const PDV_MATRIZ_LOJA_ID = 1;
export const PDV_MATRIZ_LOCAL_ID = 1;

type ItemVendaEntrada = {
  produtoId: number;
  quantidade: number | string;
};

type PagamentoVendaEntrada = {
  forma: string;
  valor: number | string;
};

type ClientePrazoEntrada = {
  id?: number;
  nome: string;
  cpf: string;
  telefone: string;
};

type CriarVendaPayload = {
  lojaId: number;
  localId: number;
  executorId: number;
  usuarioId: number;
  itens: ItemVendaEntrada[];
  pagamentos: PagamentoVendaEntrada[];
  observacao?: string;
  cliente?: ClientePrazoEntrada;
};

function run(sql: string, params: any[] = []) {
  return new Promise<{ lastID: number; changes: number }>((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function get<T = any>(sql: string, params: any[] = []) {
  return new Promise<T | undefined>((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row as T | undefined);
    });
  });
}

function all<T = any>(sql: string, params: any[] = []) {
  return new Promise<T[]>((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows as T[]);
    });
  });
}

function numero(valor: number | string | null | undefined) {
  const n = Number(String(valor ?? 0).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function arredondar(valor: number) {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

async function begin() {
  await run('BEGIN IMMEDIATE TRANSACTION');
}

async function commit() {
  await run('COMMIT');
}

async function rollback() {
  try {
    await run('ROLLBACK');
  } catch {}
}

function somenteNumeros(valor: unknown) {
  return String(valor ?? '').replace(/\D/g, '');
}

async function garantirEstruturaAPrazo() {
  await run(`
    CREATE TABLE IF NOT EXISTS clientes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      cpf TEXT NOT NULL UNIQUE,
      telefone TEXT NOT NULL,
      limite_credito REAL NOT NULL DEFAULT 0,
      ativo INTEGER NOT NULL DEFAULT 1,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
      atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const colunasClientes = await all<any>('PRAGMA table_info(clientes)');
  const possuiLimiteCredito = colunasClientes.some(
    (coluna) => String(coluna.name) === 'limite_credito'
  );

  if (!possuiLimiteCredito) {
    await run('ALTER TABLE clientes ADD COLUMN limite_credito REAL NOT NULL DEFAULT 0');
  }

  await run(`
    CREATE TABLE IF NOT EXISTS contas_receber (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venda_id INTEGER NOT NULL UNIQUE,
      cliente_id INTEGER NOT NULL,
      valor_original REAL NOT NULL,
      valor_pago REAL NOT NULL DEFAULT 0,
      saldo REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'ABERTO',
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
      atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (venda_id) REFERENCES vendas(id),
      FOREIGN KEY (cliente_id) REFERENCES clientes(id)
    )
  `);

  const colunas = await all<any>('PRAGMA table_info(vendas)');
  const possuiClienteId = colunas.some(
    (coluna) => String(coluna.name) === 'cliente_id'
  );

  if (!possuiClienteId) {
    await run('ALTER TABLE vendas ADD COLUMN cliente_id INTEGER');
  }

  await run(
    'CREATE INDEX IF NOT EXISTS idx_clientes_cpf ON clientes(cpf)'
  );
  await run(
    'CREATE INDEX IF NOT EXISTS idx_contas_receber_cliente ON contas_receber(cliente_id)'
  );
  await run(
    'CREATE INDEX IF NOT EXISTS idx_contas_receber_status ON contas_receber(status)'
  );
}

async function obterOuCadastrarClientePrazo(cliente: ClientePrazoEntrada) {
  const clienteIdInformado = Number(cliente?.id || 0);

  if (clienteIdInformado) {
    const existentePorId = await get<any>(
      `SELECT id, nome, cpf, telefone, COALESCE(limite_credito, 0) AS limite_credito, ativo
       FROM clientes
       WHERE id = ?
       LIMIT 1`,
      [clienteIdInformado]
    );

    if (!existentePorId || Number(existentePorId.ativo) !== 1) {
      throw new Error('Cliente A PRAZO não encontrado ou inativo.');
    }

    return Number(existentePorId.id);
  }

  const nome = String(cliente?.nome || '').trim();
  const cpf = somenteNumeros(cliente?.cpf);
  const telefone = somenteNumeros(cliente?.telefone);

  if (nome.length < 3) {
    throw new Error('Informe o nome completo do cliente para venda A PRAZO.');
  }
  if (cpf.length !== 11) {
    throw new Error('Informe um CPF válido com 11 dígitos para venda A PRAZO.');
  }
  if (telefone.length < 10 || telefone.length > 11) {
    throw new Error('Informe um telefone válido para venda A PRAZO.');
  }

  const existente = await get<any>(
    'SELECT id FROM clientes WHERE cpf = ? LIMIT 1',
    [cpf]
  );

  if (existente) {
    await run(
      `UPDATE clientes
       SET nome = ?, telefone = ?, ativo = 1, atualizado_em = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [nome, telefone, existente.id]
    );
    return Number(existente.id);
  }

  const novo = await run(
    `INSERT INTO clientes (nome, cpf, telefone, limite_credito, ativo)
     VALUES (?, ?, ?, 0, 1)`,
    [nome, cpf, telefone]
  );

  return novo.lastID;
}

async function obterCreditoClientePrazo(clienteId: number) {
  const cliente = await get<any>(
    `SELECT id, nome, COALESCE(limite_credito, 0) AS limiteCredito
     FROM clientes
     WHERE id = ? AND ativo = 1
     LIMIT 1`,
    [clienteId]
  );

  if (!cliente) throw new Error('Cliente A PRAZO não encontrado ou inativo.');

  const contas = await get<any>(
    `SELECT COALESCE(SUM(saldo), 0) AS saldoDevedor
     FROM contas_receber
     WHERE cliente_id = ? AND status <> 'PAGO'`,
    [clienteId]
  );

  const limiteCredito = arredondar(numero(cliente.limiteCredito));
  const saldoDevedor = arredondar(numero(contas?.saldoDevedor));
  const limiteDisponivel = arredondar(Math.max(0, limiteCredito - saldoDevedor));

  return { cliente, limiteCredito, saldoDevedor, limiteDisponivel };
}

export async function buscarProdutoPdv(termo: string, lojaId: number, localId: number) {
  const busca = String(termo || '').trim();
  if (!busca) throw new Error('Informe o código de barras ou nome do produto.');

  const ehEan = /^\d+$/.test(busca);

  const produto = await get<any>(
    `
      SELECT
        p.id,
        p.ean,
        p.nome,
        p.marca,
        COALESCE(pl.preco_venda, 0) AS preco_venda,
        p.unidade_medida,
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
        AND (
          (? = 1 AND p.ean = ?)
          OR
          (? = 0 AND (
            UPPER(p.nome) LIKE UPPER(?)
            OR UPPER(COALESCE(p.marca, '')) LIKE UPPER(?)
            OR p.ean LIKE ?
          ))
        )
      ORDER BY
        CASE WHEN p.ean = ? THEN 0 ELSE 1 END,
        p.nome COLLATE NOCASE
      LIMIT 1
    `,
    [
      localId,
      lojaId,
      ehEan ? 1 : 0,
      busca,
      ehEan ? 1 : 0,
      `%${busca}%`,
      `%${busca}%`,
      `%${busca}%`,
      busca,
    ]
  );

  if (!produto) {
    throw new Error('Produto não pertence à lista desta unidade.');
  }

  return {
    id: Number(produto.id),
    ean: String(produto.ean || ''),
    nome: String(produto.nome),
    marca: produto.marca || null,
    precoVenda: numero(produto.preco_venda),
    unidadeMedida: produto.unidade_medida || null,
    quantidadeDisponivel: numero(produto.quantidade),
  };
}

export async function pesquisarProdutosPdv(
  termo: string,
  lojaId: number,
  localId: number,
  limite = 20
) {
  const busca = String(termo || '').trim();
  if (busca.length < 2) return [];

  const max = Math.max(1, Math.min(Number(limite) || 20, 50));

  const produtos = await all<any>(
    `
      SELECT
        p.id,
        p.ean,
        p.nome,
        p.marca,
        COALESCE(pl.preco_venda, p.preco_venda, 0) AS preco_venda,
        p.unidade_medida,
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
        AND (
          UPPER(p.nome) LIKE UPPER(?)
          OR UPPER(COALESCE(p.marca, '')) LIKE UPPER(?)
          OR p.ean LIKE ?
        )
      ORDER BY
        CASE WHEN p.ean = ? THEN 0 ELSE 1 END,
        p.nome COLLATE NOCASE
      LIMIT ?
    `,
    [
      localId,
      lojaId,
      `%${busca}%`,
      `%${busca}%`,
      `%${busca}%`,
      busca,
      max,
    ]
  );

  return produtos.map((produto) => ({
    id: Number(produto.id),
    ean: String(produto.ean || ''),
    nome: String(produto.nome),
    marca: produto.marca || null,
    precoVenda: numero(produto.preco_venda),
    unidadeMedida: produto.unidade_medida || null,
    quantidadeDisponivel: numero(produto.quantidade),
  }));
}

export async function listarLocaisPdv() {
  return all(
    `
      SELECT
        le.id,
        le.loja_id,
        le.nome AS local,
        l.nome AS loja
      FROM locais_estoque le
      INNER JOIN lojas l
        ON l.id = le.loja_id
      WHERE le.ativo = 1
        AND l.ativo = 1
        AND le.permite_venda = 1
        AND l.id = ${PDV_MATRIZ_LOJA_ID}
        AND le.id = ${PDV_MATRIZ_LOCAL_ID}
      ORDER BY l.nome COLLATE NOCASE, le.nome COLLATE NOCASE
    `
  );
}

export async function criarVenda(dados: CriarVendaPayload) {
  await garantirEstruturaAPrazo();

  if (!dados.usuarioId) throw new Error('Usuário da sessão não identificado.');
  if (!dados.executorId) throw new Error('Executor não identificado.');
  if (!dados.lojaId || !dados.localId) throw new Error('Loja/local de venda não informado.');
  if (!Array.isArray(dados.itens) || dados.itens.length === 0) {
    throw new Error('A venda precisa ter ao menos um item.');
  }

  const local = await get<any>(
    `
      SELECT le.id, le.loja_id, le.permite_venda
      FROM locais_estoque le
      INNER JOIN lojas l ON l.id = le.loja_id
      WHERE le.id = ?
        AND le.loja_id = ?
        AND le.ativo = 1
        AND l.ativo = 1
      LIMIT 1
    `,
    [dados.localId, dados.lojaId]
  );

  if (!local || Number(local.permite_venda) !== 1) {
    throw new Error('Este local não está habilitado para vendas.');
  }

  const agrupados = new Map<number, number>();
  for (const item of dados.itens) {
    const produtoId = Number(item.produtoId);
    const quantidade = numero(item.quantidade);
    if (!produtoId || quantidade <= 0) throw new Error('Item de venda inválido.');
    agrupados.set(produtoId, (agrupados.get(produtoId) || 0) + quantidade);
  }

  await begin();

  try {
    const itensPreparados: any[] = [];
    let total = 0;

    for (const [produtoId, quantidade] of agrupados.entries()) {
      const produto = await get<any>(
        `
          SELECT
            p.id,
            p.ean,
            p.nome,
            COALESCE(pl.preco_venda, p.preco_venda, 0) AS preco_venda,
            COALESCE((
              SELECT SUM(es.quantidade)
              FROM estoque_saldos es
              WHERE es.produto_id = p.id
                AND es.local_id = ?
            ), 0) AS saldo,
            COALESCE((
              SELECT es.custo_medio
              FROM estoque_saldos es
              WHERE es.produto_id = p.id
                AND es.local_id = ?
              ORDER BY es.id DESC
              LIMIT 1
            ), p.preco_custo, 0) AS custo_medio
          FROM produtos p
          INNER JOIN produtos_lojas pl
            ON pl.produto_id = p.id
           AND pl.loja_id = ?
           AND pl.ativo = 1
          WHERE p.id = ?
            AND p.ativo = 1
          LIMIT 1
        `,
        [dados.localId, dados.localId, dados.lojaId, produtoId]
      );

      if (!produto) throw new Error(`Produto ${produtoId} não encontrado.`);

      const saldo = numero(produto.saldo);

      const preco = numero(produto.preco_venda);
      if (preco < 0) throw new Error(`Preço inválido para ${produto.nome}.`);

      const subtotal = arredondar(preco * quantidade);
      total = arredondar(total + subtotal);

      itensPreparados.push({
        produtoId,
        ean: produto.ean,
        nome: produto.nome,
        quantidade,
        preco,
        subtotal,
        saldo,
        custoMedio: numero(produto.custo_medio),
      });
    }

    if (!Array.isArray(dados.pagamentos) || dados.pagamentos.length === 0) {
      throw new Error('Informe a forma de pagamento.');
    }

    const pagamentos = dados.pagamentos.map((p) => ({
      forma: String(p.forma || '').trim().toUpperCase(),
      valor: arredondar(numero(p.valor)),
    }));

    if (pagamentos.some((p) => !p.forma || p.valor <= 0)) {
      throw new Error('Pagamento inválido.');
    }

    const totalPagamentos = arredondar(
      pagamentos.reduce((soma, p) => soma + p.valor, 0)
    );

    const pagamentosPrazo = pagamentos.filter(
      (p) => p.forma === 'A_PRAZO'
    );

    if (pagamentosPrazo.length > 1) {
      throw new Error('Forma de pagamento A PRAZO inválida.');
    }

    const vendaAPrazo = pagamentosPrazo.length === 1;

    if (vendaAPrazo && pagamentos.length !== 1) {
      throw new Error(
        'Nesta versão, A PRAZO deve ser a única forma de pagamento da venda.'
      );
    }

    let clienteId: number | null = null;

    if (vendaAPrazo) {
      if (!dados.cliente) {
        throw new Error(
          'Informe nome, CPF e telefone do cliente para venda A PRAZO.'
        );
      }

      clienteId = await obterOuCadastrarClientePrazo(dados.cliente);
    }

    if (Math.abs(totalPagamentos - total) > 0.01) {
      throw new Error(
        `Pagamentos (${totalPagamentos.toFixed(2)}) diferentes do total da venda (${total.toFixed(2)}).`
      );
    }

    if (vendaAPrazo && clienteId) {
      const credito = await obterCreditoClientePrazo(clienteId);

      if (credito.limiteCredito <= 0) {
        throw new Error(
          `Cliente ${credito.cliente.nome} está BLOQUEADO para venda A PRAZO: limite de crédito não definido.`
        );
      }

      if (total > credito.limiteDisponivel + 0.009) {
        const falta = arredondar(total - credito.limiteDisponivel);
        throw new Error(
          `Crédito insuficiente. Limite: R$ ${credito.limiteCredito.toFixed(2)} | Em aberto: R$ ${credito.saldoDevedor.toFixed(2)} | Disponível: R$ ${credito.limiteDisponivel.toFixed(2)} | Faltam: R$ ${falta.toFixed(2)}.`
        );
      }
    }

    const venda = await run(
      `
        INSERT INTO vendas (
          loja_id,
          local_id,
          usuario_id,
          executor_id,
          status,
          valor_total,
          observacao,
          cliente_id
        ) VALUES (?, ?, ?, ?, 'CONCLUIDA', ?, ?, ?)
      `,
      [
        dados.lojaId,
        dados.localId,
        dados.usuarioId,
        dados.executorId,
        total,
        dados.observacao || null,
        clienteId,
      ]
    );

    for (const item of itensPreparados) {
      await run(
        `
          INSERT INTO venda_itens (
            venda_id,
            produto_id,
            ean,
            descricao,
            quantidade,
            preco_unitario,
            subtotal
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        [
          venda.lastID,
          item.produtoId,
          item.ean,
          item.nome,
          item.quantidade,
          item.preco,
          item.subtotal,
        ]
      );

      let saldoRegistro = await get<any>(
        `
          SELECT id
          FROM estoque_saldos
          WHERE produto_id = ?
            AND local_id = ?
          ORDER BY id DESC
          LIMIT 1
        `,
        [item.produtoId, dados.localId]
      );

      if (!saldoRegistro) {
        const novoSaldo = await run(
          `
            INSERT INTO estoque_saldos
              (produto_id, loja_id, local_id, quantidade, custo_medio)
            VALUES (?, ?, ?, 0, ?)
          `,
          [item.produtoId, dados.lojaId, dados.localId, item.custoMedio]
        );
        saldoRegistro = { id: novoSaldo.lastID };
      }

      const baixa = await run(
        `
          UPDATE estoque_saldos
          SET quantidade = quantidade - ?,
              atualizado_em = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
        [item.quantidade, saldoRegistro.id]
      );

      if (baixa.changes !== 1) {
        throw new Error(`Não foi possível baixar o estoque de ${item.nome}.`);
      }

      await run(
        `
          INSERT INTO movimentacoes_estoque (
            produto_id,
            tipo,
            quantidade,
            custo_unitario,
            loja_origem_id,
            local_origem_id,
            usuario_id,
            referencia,
            observacao
          ) VALUES (?, 'VENDA', ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          item.produtoId,
          item.quantidade,
          item.custoMedio,
          dados.lojaId,
          dados.localId,
          dados.usuarioId,
          `Venda #${venda.lastID}`,
          dados.observacao || null,
        ]
      );
    }

    for (const pagamento of pagamentos) {
      await run(
        `
          INSERT INTO venda_pagamentos (
            venda_id,
            forma_pagamento,
            valor
          ) VALUES (?, ?, ?)
        `,
        [venda.lastID, pagamento.forma, pagamento.valor]
      );
    }

    if (vendaAPrazo && clienteId) {
      await run(
        `
          INSERT INTO contas_receber (
            venda_id,
            cliente_id,
            valor_original,
            valor_pago,
            saldo,
            status
          ) VALUES (?, ?, ?, 0, ?, 'ABERTO')
        `,
        [venda.lastID, clienteId, total, total]
      );
    }

    await run(
      `
        INSERT INTO auditoria_operacoes (
          executor_id,
          usuario_sessao_id,
          modulo,
          acao,
          entidade,
          entidade_id,
          descricao
        ) VALUES (?, ?, 'PDV', 'VENDA', 'vendas', ?, ?)
      `,
      [
        dados.executorId,
        dados.usuarioId,
        venda.lastID,
        vendaAPrazo
          ? `Venda A PRAZO concluída no PDV. Total: R$ ${total.toFixed(2)}.`
          : `Venda concluída no PDV. Total: R$ ${total.toFixed(2)}.`,
      ]
    );

    await commit();

    return {
      sucesso: true,
      vendaId: venda.lastID,
      valorTotal: total,
      quantidadeItens: itensPreparados.reduce(
        (soma, item) => soma + item.quantidade,
        0
      ),
    };
  } catch (error) {
    await rollback();
    throw error;
  }
}

export async function buscarVendaPorId(id: number) {
  const venda = await get<any>(
    `
      SELECT
        v.id,
        v.loja_id,
        l.nome AS loja,
        v.local_id,
        le.nome AS local,
        v.status,
        v.valor_total,
        v.observacao,
        v.criado_em,
        u.nome AS usuario,
        e.nome AS executor
      FROM vendas v
      INNER JOIN lojas l ON l.id = v.loja_id
      INNER JOIN locais_estoque le ON le.id = v.local_id
      LEFT JOIN usuarios u ON u.id = v.usuario_id
      LEFT JOIN executores e ON e.id = v.executor_id
      WHERE v.id = ?
      LIMIT 1
    `,
    [id]
  );

  if (!venda) throw new Error('Venda não encontrada.');

  const itens = await all(
    `
      SELECT
        vi.produto_id,
        vi.ean,
        vi.descricao,
        vi.quantidade,
        vi.preco_unitario,
        vi.subtotal
      FROM venda_itens vi
      WHERE vi.venda_id = ?
      ORDER BY vi.id
    `,
    [id]
  );

  const pagamentos = await all(
    `
      SELECT forma_pagamento, valor
      FROM venda_pagamentos
      WHERE venda_id = ?
      ORDER BY id
    `,
    [id]
  );

  return { ...venda, itens, pagamentos };
}
