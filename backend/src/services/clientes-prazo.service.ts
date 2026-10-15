import db from '../database/database';
import { escopoLojaSql } from './escopo-lojas.service';
import { garantirVinculosCadastros, cadastroVisivelSql, lojaCadastroAtual, vincularCadastroNaLoja } from './cadastros-lojas.service';
import { comBloqueioBanco } from './caixas.service';

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

function numero(valor: unknown) {
  const n = Number(String(valor ?? 0).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function arredondar(valor: number) {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

function somenteNumeros(valor: unknown) {
  return String(valor ?? '').replace(/\D/g, '');
}

async function garantirEstrutura() {
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

  await run(`
    CREATE TABLE IF NOT EXISTS contas_receber_recebimentos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conta_receber_id INTEGER NOT NULL,
      cliente_id INTEGER NOT NULL,
      venda_id INTEGER NOT NULL,
      valor REAL NOT NULL,
      forma_pagamento TEXT NOT NULL,
      executor_id INTEGER,
      usuario_id INTEGER,
      observacao TEXT,
      recebido_em DATETIME DEFAULT CURRENT_TIMESTAMP,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (conta_receber_id) REFERENCES contas_receber(id),
      FOREIGN KEY (cliente_id) REFERENCES clientes(id),
      FOREIGN KEY (venda_id) REFERENCES vendas(id),
      FOREIGN KEY (executor_id) REFERENCES executores(id),
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
    )
  `);

  await run(
    'CREATE INDEX IF NOT EXISTS idx_clientes_nome ON clientes(nome)'
  );
  await run(
    'CREATE INDEX IF NOT EXISTS idx_clientes_telefone ON clientes(telefone)'
  );
  await run(
    'CREATE INDEX IF NOT EXISTS idx_contas_receber_cliente ON contas_receber(cliente_id)'
  );
  await run(
    'CREATE INDEX IF NOT EXISTS idx_recebimentos_conta ON contas_receber_recebimentos(conta_receber_id)'
  );
  await garantirVinculosCadastros();
}

export async function listarClientesPrazo(termo = '') {
  await garantirEstrutura();

  const q = String(termo || '').trim();
  const like = `%${q}%`;
  const digitos = somenteNumeros(q);
  const likeDigitos = `%${digitos}%`;

  return all<any>(
    `
      SELECT
        c.id,
        c.nome,
        c.cpf,
        c.telefone,
        COALESCE(c.limite_credito, 0) AS limiteCredito,
        c.ativo,
        c.criado_em AS criadoEm,
        COUNT(DISTINCT cr.id) AS quantidadeCompras,
        COALESCE(SUM(cr.valor_original), 0) AS totalComprado,
        COALESCE(SUM(cr.valor_pago), 0) AS totalPago,
        COALESCE(SUM(cr.saldo), 0) AS saldoDevedor,
        MAX(0, COALESCE(c.limite_credito, 0) - COALESCE((SELECT SUM(cr_global.saldo) FROM contas_receber cr_global WHERE cr_global.cliente_id = c.id), 0)) AS limiteDisponivel,
        SUM(CASE WHEN cr.status = 'ABERTO' THEN 1 ELSE 0 END) AS contasAbertas,
        SUM(CASE WHEN cr.status = 'PARCIAL' THEN 1 ELSE 0 END) AS contasParciais
      FROM clientes c
      LEFT JOIN contas_receber cr
        ON cr.cliente_id = c.id
        AND EXISTS (SELECT 1 FROM vendas v_escopo WHERE v_escopo.id = cr.venda_id AND ${escopoLojaSql('v_escopo.loja_id')})
      WHERE c.ativo = 1
        AND ${cadastroVisivelSql('cliente','c.id')}
        AND (
          ? = ''
          OR UPPER(c.nome) LIKE UPPER(?)
          OR (? <> '' AND (c.cpf LIKE ? OR c.telefone LIKE ?))
        )
      GROUP BY c.id
      ORDER BY
        CASE WHEN COALESCE(SUM(cr.saldo), 0) > 0 THEN 0 ELSE 1 END,
        c.nome
      LIMIT 300
    `,
    [q, like, digitos, likeDigitos, likeDigitos]
  );
}

export async function buscarClientePrazoPorId(clienteId: number) {
  await garantirEstrutura();

  const cliente = await get<any>(
    `
      SELECT
        c.id,
        c.nome,
        c.cpf,
        c.telefone,
        COALESCE(c.limite_credito, 0) AS limiteCredito,
        c.ativo,
        c.criado_em AS criadoEm,
        COALESCE(SUM(cr.valor_original), 0) AS totalComprado,
        COALESCE(SUM(cr.valor_pago), 0) AS totalPago,
        COALESCE(SUM(cr.saldo), 0) AS saldoDevedor,
        MAX(0, COALESCE(c.limite_credito, 0) - COALESCE((SELECT SUM(cr_global.saldo) FROM contas_receber cr_global WHERE cr_global.cliente_id = c.id), 0)) AS limiteDisponivel
      FROM clientes c
      LEFT JOIN contas_receber cr
        ON cr.cliente_id = c.id
        AND EXISTS (SELECT 1 FROM vendas v_escopo WHERE v_escopo.id = cr.venda_id AND ${escopoLojaSql('v_escopo.loja_id')})
      WHERE c.id = ?
        AND ${cadastroVisivelSql('cliente','c.id')}
      GROUP BY c.id
    `,
    [clienteId]
  );

  if (!cliente) {
    throw new Error('Cliente não encontrado.');
  }

  const contas = await all<any>(
    `
      SELECT
        cr.id,
        cr.venda_id AS vendaId,
        cr.valor_original AS valorOriginal,
        cr.valor_pago AS valorPago,
        cr.saldo,
        cr.status,
        cr.criado_em AS criadoEm,
        v.valor_total AS valorVenda,
        v.loja_id AS lojaId,
        l.nome AS lojaNome,
        v.executor_id AS executorId,
        e.nome AS executorNome
      FROM contas_receber cr
      INNER JOIN vendas v
        ON v.id = cr.venda_id
      LEFT JOIN lojas l
        ON l.id = v.loja_id
      LEFT JOIN executores e
        ON e.id = v.executor_id
      WHERE cr.cliente_id = ?
        AND ${escopoLojaSql('v.loja_id')}
      ORDER BY cr.criado_em DESC, cr.id DESC
    `,
    [clienteId]
  );

  const recebimentos = await all<any>(
    `
      SELECT
        r.id,
        r.conta_receber_id AS contaReceberId,
        r.venda_id AS vendaId,
        r.valor,
        r.forma_pagamento AS formaPagamento,
        r.observacao,
        r.recebido_em AS recebidoEm,
        e.nome AS executorNome,
        u.nome AS usuarioNome
      FROM contas_receber_recebimentos r
      LEFT JOIN executores e
        ON e.id = r.executor_id
      LEFT JOIN usuarios u
        ON u.id = r.usuario_id
      WHERE r.cliente_id = ?
        AND EXISTS (SELECT 1 FROM vendas v_escopo WHERE v_escopo.id = r.venda_id AND ${escopoLojaSql('v_escopo.loja_id')})
      ORDER BY r.recebido_em DESC, r.id DESC
    `,
    [clienteId]
  );

  return {
    cliente,
    contas,
    recebimentos,
  };
}

export async function atualizarLimiteCreditoCliente(
  clienteId: number,
  limiteCredito: number | string
) {
  await garantirEstrutura();

  const id = Number(clienteId);
  const limite = arredondar(numero(limiteCredito));

  if (!id) throw new Error('Cliente inválido.');
  if (limite < 0) throw new Error('O limite de crédito não pode ser negativo.');

  const cliente = await get<any>(
    `SELECT id FROM clientes WHERE id = ? AND ${cadastroVisivelSql('cliente','clientes.id')} LIMIT 1`,
    [id]
  );

  if (!cliente) throw new Error('Cliente não encontrado.');

  await run(
    `UPDATE clientes
     SET limite_credito = ?, atualizado_em = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [limite, id]
  );

  const saldo = await get<any>(
    `SELECT COALESCE(SUM(saldo), 0) AS saldoDevedor
     FROM contas_receber
     WHERE cliente_id = ? AND status <> 'PAGO'
       AND EXISTS (SELECT 1 FROM vendas v_escopo WHERE v_escopo.id = contas_receber.venda_id AND ${escopoLojaSql('v_escopo.loja_id')})`,
    [id]
  );

  const saldoDevedor = arredondar(numero(saldo?.saldoDevedor));
  // The credit limit belongs to the customer across all markets. Expose only
  // the remaining allowance; debt details stay restricted to permitted stores.
  const credito = await get<any>('SELECT COALESCE(SUM(saldo), 0) AS comprometido FROM contas_receber WHERE cliente_id = ?', [id]);
  const comprometido = arredondar(numero(credito?.comprometido));

  return {
    clienteId: id,
    limiteCredito: limite,
    saldoDevedor,
    limiteDisponivel: arredondar(Math.max(0, limite - comprometido)),
    bloqueado: comprometido >= limite,
  };
}

type RecebimentoEntrada = {
  valor: number | string;
  formaPagamento: string;
  executorId?: number;
  usuarioId: number;
  observacao?: string;
};

async function registrarRecebimentoImpl(
  contaReceberId: number,
  dados: RecebimentoEntrada
) {
  await garantirEstrutura();

  const valor = arredondar(numero(dados.valor));
  const formaPagamento = String(dados.formaPagamento || '')
    .trim()
    .toUpperCase();

  if (valor <= 0) {
    throw new Error('Informe um valor de recebimento maior que zero.');
  }

  if (!formaPagamento) {
    throw new Error('Informe a forma de pagamento.');
  }

  const conta = await get<any>(
    `
      SELECT
        cr.id,
        cr.venda_id AS vendaId,
        cr.cliente_id AS clienteId,
        cr.valor_original AS valorOriginal,
        cr.valor_pago AS valorPago,
        cr.saldo,
        cr.status
      FROM contas_receber cr
      WHERE cr.id = ?
        AND EXISTS (SELECT 1 FROM vendas v_escopo WHERE v_escopo.id = cr.venda_id AND ${escopoLojaSql('v_escopo.loja_id')})
      LIMIT 1
    `,
    [contaReceberId]
  );

  if (!conta) {
    throw new Error('Conta a receber não encontrada.');
  }

  const saldoAtual = arredondar(numero(conta.saldo));

  if (saldoAtual <= 0 || String(conta.status).toUpperCase() === 'PAGO') {
    throw new Error('Esta conta já está paga.');
  }

  if (valor > saldoAtual + 0.001) {
    throw new Error(
      `O recebimento não pode ser maior que o saldo de R$ ${saldoAtual
        .toFixed(2)
        .replace('.', ',')}.`
    );
  }

  await run('BEGIN IMMEDIATE TRANSACTION');

  try {
    const novoValorPago = arredondar(numero(conta.valorPago) + valor);
    const novoSaldo = arredondar(Math.max(0, numero(conta.valorOriginal) - novoValorPago));
    const novoStatus = novoSaldo <= 0 ? 'PAGO' : 'PARCIAL';

    const recebimento = await run(
      `
        INSERT INTO contas_receber_recebimentos (
          conta_receber_id,
          cliente_id,
          venda_id,
          valor,
          forma_pagamento,
          executor_id,
          usuario_id,
          observacao
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        conta.id,
        conta.clienteId,
        conta.vendaId,
        valor,
        formaPagamento,
        dados.executorId || null,
        dados.usuarioId,
        String(dados.observacao || '').trim() || null,
      ]
    );

    await run(
      `
        UPDATE contas_receber
        SET valor_pago = ?,
            saldo = ?,
            status = ?,
            atualizado_em = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      [novoValorPago, novoSaldo, novoStatus, conta.id]
    );

    await run('COMMIT');

    return {
      recebimentoId: recebimento.lastID,
      contaReceberId: conta.id,
      valorRecebido: valor,
      valorPago: novoValorPago,
      saldo: novoSaldo,
      status: novoStatus,
    };
  } catch (error) {
    try {
      await run('ROLLBACK');
    } catch {}
    throw error;
  }
}

export async function cadastrarClientePrazo(dados: any) {
  await garantirEstrutura();
  return comBloqueioBanco(async () => {
    const lojaId = lojaCadastroAtual(dados.lojaId);
    const nome = String(dados.nome || '').trim(), cpf = somenteNumeros(dados.cpf), telefone = somenteNumeros(dados.telefone);
    if (nome.length < 3 || cpf.length !== 11 || telefone.length < 10 || telefone.length > 11) throw new Error('Informe nome, CPF com 11 dígitos e telefone válido.');
    const limite = Number(dados.limiteCredito ?? 0);
    if (!Number.isFinite(limite) || limite < 0) throw new Error('Informe um limite de crédito válido.');
    let cliente = await get<any>('SELECT id FROM clientes WHERE cpf = ?', [cpf]);
    if (!cliente) cliente = { id: (await run('INSERT INTO clientes(nome,cpf,telefone,limite_credito) VALUES (?,?,?,?)',[nome,cpf,telefone,arredondar(limite)])).lastID };
    await vincularCadastroNaLoja('cliente', Number(cliente.id), lojaId);
    return (await buscarClientePrazoPorId(Number(cliente.id))).cliente;
  });
}
export function registrarRecebimento(...args: Parameters<typeof registrarRecebimentoImpl>) {
  return comBloqueioBanco(() => registrarRecebimentoImpl(...args));
}
