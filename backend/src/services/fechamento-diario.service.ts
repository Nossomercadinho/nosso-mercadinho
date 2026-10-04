import db from '../database/database';

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

export async function garantirEstruturaFechamento() {
  await run(`
    CREATE TABLE IF NOT EXISTS fechamentos_diarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      data_referencia TEXT NOT NULL,
      loja_id INTEGER NOT NULL,
      dinheiro REAL NOT NULL DEFAULT 0,
      pix REAL NOT NULL DEFAULT 0,
      debito REAL NOT NULL DEFAULT 0,
      credito REAL NOT NULL DEFAULT 0,
      a_prazo REAL NOT NULL DEFAULT 0,
      outros REAL NOT NULL DEFAULT 0,
      total_informado REAL NOT NULL DEFAULT 0,
      executor_id INTEGER,
      usuario_id INTEGER,
      observacao TEXT,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
      atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(data_referencia, loja_id),
      FOREIGN KEY (loja_id) REFERENCES lojas(id),
      FOREIGN KEY (executor_id) REFERENCES executores(id),
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS fechamentos_diarios_historico (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fechamento_id INTEGER NOT NULL,
      usuario_id INTEGER,
      motivo TEXT,
      dados_antes TEXT,
      dados_depois TEXT NOT NULL,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (fechamento_id) REFERENCES fechamentos_diarios(id),
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
    )
  `);
}

export async function listarFechamentos(lojaId: number, inicio?: string, fim?: string) {
  await garantirEstruturaFechamento();
  const where = ['f.loja_id = ?'];
  const params: any[] = [lojaId];

  if (inicio) {
    where.push('f.data_referencia >= ?');
    params.push(inicio);
  }
  if (fim) {
    where.push('f.data_referencia <= ?');
    params.push(fim);
  }

  return all<any>(`
    SELECT
      f.id,
      f.data_referencia AS dataReferencia,
      f.loja_id AS lojaId,
      l.nome AS lojaNome,
      f.dinheiro,
      f.pix,
      f.debito,
      f.credito,
      f.a_prazo AS aPrazo,
      f.outros,
      f.total_informado AS totalInformado,
      f.executor_id AS executorId,
      e.nome AS executorNome,
      f.usuario_id AS usuarioId,
      u.nome AS usuarioNome,
      f.observacao,
      f.criado_em AS criadoEm,
      f.atualizado_em AS atualizadoEm
    FROM fechamentos_diarios f
    LEFT JOIN lojas l ON l.id = f.loja_id
    LEFT JOIN executores e ON e.id = f.executor_id
    LEFT JOIN usuarios u ON u.id = f.usuario_id
    WHERE ${where.join(' AND ')}
    ORDER BY f.data_referencia DESC, f.id DESC
    LIMIT 366
  `, params);
}

export async function buscarFechamento(data: string, lojaId: number) {
  await garantirEstruturaFechamento();
  return get<any>(`
    SELECT
      f.id,
      f.data_referencia AS dataReferencia,
      f.loja_id AS lojaId,
      l.nome AS lojaNome,
      f.dinheiro,
      f.pix,
      f.debito,
      f.credito,
      f.a_prazo AS aPrazo,
      f.outros,
      f.total_informado AS totalInformado,
      f.executor_id AS executorId,
      e.nome AS executorNome,
      f.usuario_id AS usuarioId,
      u.nome AS usuarioNome,
      f.observacao,
      f.criado_em AS criadoEm,
      f.atualizado_em AS atualizadoEm
    FROM fechamentos_diarios f
    LEFT JOIN lojas l ON l.id = f.loja_id
    LEFT JOIN executores e ON e.id = f.executor_id
    LEFT JOIN usuarios u ON u.id = f.usuario_id
    WHERE f.data_referencia = ? AND f.loja_id = ?
    LIMIT 1
  `, [data, lojaId]);
}

export async function salvarFechamento(dados: any) {
  await garantirEstruturaFechamento();

  const atual = await buscarFechamento(dados.dataReferencia, dados.lojaId);
  const total = ['dinheiro','pix','debito','credito','aPrazo','outros']
    .reduce((s, k) => s + Number(dados[k] || 0), 0);
  const totalArredondado = Math.round((total + Number.EPSILON) * 100) / 100;

  if (!atual) {
    const r = await run(`
      INSERT INTO fechamentos_diarios (
        data_referencia, loja_id, dinheiro, pix, debito, credito,
        a_prazo, outros, total_informado, executor_id, usuario_id, observacao
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      dados.dataReferencia, dados.lojaId, dados.dinheiro, dados.pix,
      dados.debito, dados.credito, dados.aPrazo, dados.outros,
      totalArredondado, dados.executorId || null, dados.usuarioId || null,
      dados.observacao || null
    ]);

    const criado = await buscarFechamento(dados.dataReferencia, dados.lojaId);
    await run(`
      INSERT INTO fechamentos_diarios_historico
        (fechamento_id, usuario_id, motivo, dados_depois)
      VALUES (?, ?, ?, ?)
    `, [r.lastID, dados.usuarioId || null, 'LANÇAMENTO INICIAL', JSON.stringify(criado)]);
    return criado;
  }

  await run(`
    UPDATE fechamentos_diarios
    SET dinheiro = ?, pix = ?, debito = ?, credito = ?, a_prazo = ?,
        outros = ?, total_informado = ?, executor_id = ?, usuario_id = ?,
        observacao = ?, atualizado_em = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [
    dados.dinheiro, dados.pix, dados.debito, dados.credito, dados.aPrazo,
    dados.outros, totalArredondado, dados.executorId || null,
    dados.usuarioId || null, dados.observacao || null, atual.id
  ]);

  const depois = await buscarFechamento(dados.dataReferencia, dados.lojaId);
  await run(`
    INSERT INTO fechamentos_diarios_historico
      (fechamento_id, usuario_id, motivo, dados_antes, dados_depois)
    VALUES (?, ?, ?, ?, ?)
  `, [
    atual.id, dados.usuarioId || null,
    dados.motivoAlteracao || 'ALTERAÇÃO MANUAL',
    JSON.stringify(atual), JSON.stringify(depois)
  ]);
  return depois;
}

export async function listarExecutores() {
  return all<any>(`
    SELECT id, codigo, nome
    FROM executores
    WHERE ativo = 1
    ORDER BY nome
  `);
}
