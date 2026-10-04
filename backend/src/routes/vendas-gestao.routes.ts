import { Router } from 'express';
import db from '../database/database';
import {
  permitirPerfis,
} from '../middleware/auth.middleware';

const router = Router();

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

function perfil(req: any) {
  return String(req.usuario?.perfil || '').toUpperCase();
}

function usuarioId(req: any) {
  return Number(req.usuario?.id || 0);
}

function arredondar(n: number) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

async function garantirEstrutura() {
  await run(`
    CREATE TABLE IF NOT EXISTS vendas_correcoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venda_id INTEGER NOT NULL,
      usuario_id INTEGER,
      motivo TEXT NOT NULL,
      dados_antes TEXT NOT NULL,
      dados_depois TEXT NOT NULL,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (venda_id) REFERENCES vendas(id),
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
    )
  `);

  await run(`
    CREATE INDEX IF NOT EXISTS idx_vendas_correcoes_venda
    ON vendas_correcoes(venda_id)
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS vendas_caixa_diario (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      data_referencia TEXT NOT NULL,
      loja_id INTEGER NOT NULL,
      valor_caixa REAL NOT NULL DEFAULT 0,
      usuario_id INTEGER,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
      atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(data_referencia, loja_id),
      FOREIGN KEY (loja_id) REFERENCES lojas(id),
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
    )
  `);

  await run(`
    CREATE INDEX IF NOT EXISTS idx_vendas_caixa_diario_data_loja
    ON vendas_caixa_diario(data_referencia, loja_id)
  `);
}

function restricaoLoja(req: any) {
  return perfil(req) === 'CAIXA' ? 1 : null;
}

router.get(
  '/',
  permitirPerfis('ADMINISTRADOR', 'CEO', 'CAIXA'),
  async (req: any, res) => {
    try {
      await garantirEstrutura();

      const lojaForcada = restricaoLoja(req);
      const dataInicio = String(req.query.dataInicio || '').trim();
      const dataFim = String(req.query.dataFim || '').trim();
      const forma = String(req.query.formaPagamento || '').trim();
      const status = String(req.query.status || '').trim();
      const executorId = Number(req.query.executorId || 0);
      const lojaId = lojaForcada || Number(req.query.lojaId || 0);

      const where: string[] = ['1 = 1'];
      const params: any[] = [];

      if (lojaId) {
        where.push('v.loja_id = ?');
        params.push(lojaId);
      }
      if (dataInicio) {
        where.push("date(v.criado_em, 'localtime') >= date(?)");
        params.push(dataInicio);
      }
      if (dataFim) {
        where.push("date(v.criado_em, 'localtime') <= date(?)");
        params.push(dataFim);
      }
      if (status) {
        where.push('v.status = ?');
        params.push(status);
      }
      if (executorId) {
        where.push('v.executor_id = ?');
        params.push(executorId);
      }
      if (forma) {
        where.push(`
          EXISTS (
            SELECT 1
            FROM venda_pagamentos vp2
            WHERE vp2.venda_id = v.id
              AND vp2.forma_pagamento = ?
          )
        `);
        params.push(forma);
      }

      const vendas = await all<any>(
        `
          SELECT
            v.id,
            v.loja_id AS lojaId,
            l.nome AS lojaNome,
            v.local_id AS localId,
            v.usuario_id AS usuarioId,
            u.nome AS usuarioNome,
            v.executor_id AS executorId,
            e.nome AS executorNome,
            v.status,
            v.valor_total AS valorTotal,
            v.observacao,
            v.criado_em AS criadoEm,
            GROUP_CONCAT(DISTINCT vp.forma_pagamento) AS formasPagamento,
            COUNT(DISTINCT vi.id) AS quantidadeItens
          FROM vendas v
          LEFT JOIN lojas l ON l.id = v.loja_id
          LEFT JOIN usuarios u ON u.id = v.usuario_id
          LEFT JOIN executores e ON e.id = v.executor_id
          LEFT JOIN venda_pagamentos vp ON vp.venda_id = v.id
          LEFT JOIN venda_itens vi ON vi.venda_id = v.id
          WHERE ${where.join(' AND ')}
          GROUP BY v.id
          ORDER BY v.criado_em DESC, v.id DESC
          LIMIT 1000
        `,
        params
      );

      const resumo = vendas
        .filter((v) => v.status === 'CONCLUIDA')
        .reduce(
          (acc, v) => {
            acc.quantidade += 1;
            acc.total += Number(v.valorTotal || 0);
            return acc;
          },
          { quantidade: 0, total: 0 }
        );

      const porForma = await all<any>(
        `
          SELECT
            vp.forma_pagamento AS formaPagamento,
            COALESCE(SUM(vp.valor), 0) AS total
          FROM venda_pagamentos vp
          INNER JOIN vendas v ON v.id = vp.venda_id
          WHERE ${where.join(' AND ')}
            AND v.status = 'CONCLUIDA'
          GROUP BY vp.forma_pagamento
          ORDER BY total DESC
        `,
        params
      );

      res.json({
        sucesso: true,
        vendas,
        resumo: {
          quantidade: resumo.quantidade,
          total: arredondar(resumo.total),
          ticketMedio:
            resumo.quantidade > 0
              ? arredondar(resumo.total / resumo.quantidade)
              : 0,
          porForma,
        },
      });
    } catch (error: any) {
      res.status(500).json({
        sucesso: false,
        erro: error?.message || 'Não foi possível carregar as vendas.',
      });
    }
  }
);


router.get(
  '/caixa-diario',
  permitirPerfis('ADMINISTRADOR', 'CEO', 'CAIXA'),
  async (req: any, res) => {
    try {
      await garantirEstrutura();

      const data = String(req.query.data || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
        return res.status(400).json({
          sucesso: false,
          erro: 'Informe a data no formato AAAA-MM-DD.',
        });
      }

      // CAIXA sempre consulta a Matriz. ADMIN/CEO podem informar outra loja;
      // na tela atual de Vendas, a Matriz continua sendo a unidade padrão.
      const lojaId =
        perfil(req) === 'CAIXA'
          ? 1
          : Number(req.query.lojaId || 1);

      const registro = await get<any>(
        `
          SELECT
            vcd.id,
            vcd.data_referencia AS dataReferencia,
            vcd.loja_id AS lojaId,
            l.nome AS lojaNome,
            vcd.valor_caixa AS valorCaixa,
            vcd.usuario_id AS usuarioId,
            u.nome AS usuarioNome,
            vcd.criado_em AS criadoEm,
            vcd.atualizado_em AS atualizadoEm
          FROM vendas_caixa_diario vcd
          LEFT JOIN lojas l ON l.id = vcd.loja_id
          LEFT JOIN usuarios u ON u.id = vcd.usuario_id
          WHERE vcd.data_referencia = ?
            AND vcd.loja_id = ?
          LIMIT 1
        `,
        [data, lojaId]
      );

      return res.json({
        sucesso: true,
        caixa: registro || {
          dataReferencia: data,
          lojaId,
          valorCaixa: null,
        },
      });
    } catch (error: any) {
      return res.status(500).json({
        sucesso: false,
        erro: error?.message || 'Não foi possível consultar o valor do caixa.',
      });
    }
  }
);

router.put(
  '/caixa-diario',
  permitirPerfis('ADMINISTRADOR', 'CEO', 'CAIXA'),
  async (req: any, res) => {
    try {
      await garantirEstrutura();

      const data = String(req.body?.data || '').trim();
      const valor = Number(req.body?.valorCaixa);

      if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
        return res.status(400).json({
          sucesso: false,
          erro: 'Informe a data no formato AAAA-MM-DD.',
        });
      }

      if (!Number.isFinite(valor) || valor < 0) {
        return res.status(400).json({
          sucesso: false,
          erro: 'Informe um valor de caixa válido.',
        });
      }

      const lojaId =
        perfil(req) === 'CAIXA'
          ? 1
          : Number(req.body?.lojaId || 1);

      await run(
        `
          INSERT INTO vendas_caixa_diario (
            data_referencia,
            loja_id,
            valor_caixa,
            usuario_id
          )
          VALUES (?, ?, ?, ?)
          ON CONFLICT(data_referencia, loja_id)
          DO UPDATE SET
            valor_caixa = excluded.valor_caixa,
            usuario_id = excluded.usuario_id,
            atualizado_em = CURRENT_TIMESTAMP
        `,
        [data, lojaId, arredondar(valor), usuarioId(req) || null]
      );

      const salvo = await get<any>(
        `
          SELECT
            vcd.id,
            vcd.data_referencia AS dataReferencia,
            vcd.loja_id AS lojaId,
            l.nome AS lojaNome,
            vcd.valor_caixa AS valorCaixa,
            vcd.usuario_id AS usuarioId,
            u.nome AS usuarioNome,
            vcd.criado_em AS criadoEm,
            vcd.atualizado_em AS atualizadoEm
          FROM vendas_caixa_diario vcd
          LEFT JOIN lojas l ON l.id = vcd.loja_id
          LEFT JOIN usuarios u ON u.id = vcd.usuario_id
          WHERE vcd.data_referencia = ?
            AND vcd.loja_id = ?
          LIMIT 1
        `,
        [data, lojaId]
      );

      return res.json({
        sucesso: true,
        mensagem: 'Valor do caixa salvo.',
        caixa: salvo,
      });
    } catch (error: any) {
      return res.status(500).json({
        sucesso: false,
        erro: error?.message || 'Não foi possível salvar o valor do caixa.',
      });
    }
  }
);

router.get(
  '/:id',
  permitirPerfis('ADMINISTRADOR', 'CEO', 'CAIXA'),
  async (req: any, res) => {
    try {
      await garantirEstrutura();
      const id = Number(req.params.id);
      const lojaForcada = restricaoLoja(req);

      const venda = await get<any>(
        `
          SELECT
            v.*,
            l.nome AS lojaNome,
            u.nome AS usuarioNome,
            e.nome AS executorNome,
            c.id AS clienteId,
            c.nome AS clienteNome,
            c.cpf AS clienteCpf,
            c.telefone AS clienteTelefone
          FROM vendas v
          LEFT JOIN lojas l ON l.id = v.loja_id
          LEFT JOIN usuarios u ON u.id = v.usuario_id
          LEFT JOIN executores e ON e.id = v.executor_id
          LEFT JOIN clientes c ON c.id = v.cliente_id
          WHERE v.id = ?
          LIMIT 1
        `,
        [id]
      );

      if (!venda) {
        return res.status(404).json({ sucesso: false, erro: 'Venda não encontrada.' });
      }
      if (lojaForcada && Number(venda.loja_id) !== lojaForcada) {
        return res.status(403).json({ sucesso: false, erro: 'Venda fora da Matriz.' });
      }

      const itens = await all<any>(
        `
          SELECT
            vi.id,
            vi.produto_id AS produtoId,
            vi.ean,
            vi.descricao,
            vi.quantidade,
            vi.preco_unitario AS precoUnitario,
            vi.subtotal
          FROM venda_itens vi
          WHERE vi.venda_id = ?
          ORDER BY vi.id
        `,
        [id]
      );

      const pagamentos = await all<any>(
        `
          SELECT id, forma_pagamento AS formaPagamento, valor, criado_em AS criadoEm
          FROM venda_pagamentos
          WHERE venda_id = ?
          ORDER BY id
        `,
        [id]
      );

      const correcoes = await all<any>(
        `
          SELECT
            vc.id,
            vc.motivo,
            vc.criado_em AS criadoEm,
            u.nome AS usuarioNome
          FROM vendas_correcoes vc
          LEFT JOIN usuarios u ON u.id = vc.usuario_id
          WHERE vc.venda_id = ?
          ORDER BY vc.id DESC
        `,
        [id]
      );

      res.json({ sucesso: true, venda, itens, pagamentos, correcoes });
    } catch (error: any) {
      res.status(500).json({
        sucesso: false,
        erro: error?.message || 'Não foi possível abrir a venda.',
      });
    }
  }
);

router.put(
  '/:id/corrigir',
  permitirPerfis('ADMINISTRADOR', 'CEO', 'CAIXA'),
  async (req: any, res) => {
    const id = Number(req.params.id);
    const motivo = String(req.body?.motivo || '').trim();
    const itensEntrada = Array.isArray(req.body?.itens) ? req.body.itens : [];
    const formaPagamento = String(req.body?.formaPagamento || '').trim().toUpperCase();

    if (motivo.length < 5) {
      return res.status(400).json({
        sucesso: false,
        erro: 'Informe o motivo da correção com pelo menos 5 caracteres.',
      });
    }
    if (!itensEntrada.length) {
      return res.status(400).json({ sucesso: false, erro: 'A venda precisa ter itens.' });
    }
    if (!formaPagamento) {
      return res.status(400).json({ sucesso: false, erro: 'Informe a forma de pagamento.' });
    }

    try {
      await garantirEstrutura();

      const venda = await get<any>('SELECT * FROM vendas WHERE id = ?', [id]);
      if (!venda) {
        return res.status(404).json({ sucesso: false, erro: 'Venda não encontrada.' });
      }
      if (venda.status !== 'CONCLUIDA') {
        return res.status(400).json({ sucesso: false, erro: 'Somente vendas concluídas podem ser corrigidas.' });
      }
      if (perfil(req) === 'CAIXA' && Number(venda.loja_id) !== 1) {
        return res.status(403).json({ sucesso: false, erro: 'O caixa só pode corrigir vendas da Matriz.' });
      }

      const itensAtuais = await all<any>(
        'SELECT * FROM venda_itens WHERE venda_id = ? ORDER BY id',
        [id]
      );
      const pagamentosAtuais = await all<any>(
        'SELECT * FROM venda_pagamentos WHERE venda_id = ? ORDER BY id',
        [id]
      );

      const mapaAtual = new Map(itensAtuais.map((i) => [Number(i.id), i]));
      let novoTotal = 0;

      for (const entrada of itensEntrada) {
        const item = mapaAtual.get(Number(entrada.id));
        if (!item) {
          return res.status(400).json({
            sucesso: false,
            erro: 'A correção contém item que não pertence a esta venda.',
          });
        }
        const quantidade = Number(entrada.quantidade);
        if (!Number.isFinite(quantidade) || quantidade <= 0) {
          return res.status(400).json({
            sucesso: false,
            erro: `Quantidade inválida para ${item.descricao}.`,
          });
        }
        novoTotal += quantidade * Number(item.preco_unitario);
      }
      novoTotal = arredondar(novoTotal);

      const eraAPrazo = pagamentosAtuais.some(
        (p) => String(p.forma_pagamento).toUpperCase() === 'A_PRAZO'
      );
      const seraAPrazo = formaPagamento === 'A_PRAZO';

      if (!eraAPrazo && seraAPrazo && !venda.cliente_id) {
        return res.status(400).json({
          sucesso: false,
          erro:
            'Uma venda que não era A Prazo não pode ser transformada em A Prazo por esta tela sem vincular um cliente. Faça uma nova venda A Prazo ou use o cadastro do cliente.',
        });
      }

      let conta: any = undefined;
      try {
        conta = await get<any>(
          'SELECT * FROM contas_receber WHERE venda_id = ? LIMIT 1',
          [id]
        );
      } catch {}

      if (conta && Number(conta.valor_pago || 0) > novoTotal + 0.001) {
        return res.status(400).json({
          sucesso: false,
          erro: 'O novo total não pode ser menor que o valor já recebido do cliente.',
        });
      }
      if (eraAPrazo && !seraAPrazo && conta && Number(conta.valor_pago || 0) > 0) {
        return res.status(400).json({
          sucesso: false,
          erro:
            'Esta venda A Prazo já possui recebimentos. Não é possível trocar a forma de pagamento sem estornar os recebimentos.',
        });
      }

      const antes = {
        venda,
        itens: itensAtuais,
        pagamentos: pagamentosAtuais,
        contaReceber: conta || null,
      };

      await run('BEGIN IMMEDIATE TRANSACTION');

      try {
        for (const entrada of itensEntrada) {
          const item = mapaAtual.get(Number(entrada.id));
          const antiga = Number(item.quantidade);
          const nova = Number(entrada.quantidade);
          const diferencaEstoque = antiga - nova;

          await run(
            `
              UPDATE venda_itens
              SET quantidade = ?,
                  subtotal = ?
              WHERE id = ? AND venda_id = ?
            `,
            [
              nova,
              arredondar(nova * Number(item.preco_unitario)),
              item.id,
              id,
            ]
          );

          if (Math.abs(diferencaEstoque) > 0.000001) {
            let saldo = await get<any>(
              `
                SELECT id
                FROM estoque_saldos
                WHERE produto_id = ?
                  AND loja_id = ?
                  AND local_id = ?
                LIMIT 1
              `,
              [item.produto_id, venda.loja_id, venda.local_id]
            );

            if (!saldo) {
              const novoSaldo = await run(
                `
                  INSERT INTO estoque_saldos
                    (produto_id, loja_id, local_id, quantidade, custo_medio)
                  VALUES (?, ?, ?, 0, 0)
                `,
                [item.produto_id, venda.loja_id, venda.local_id]
              );
              saldo = { id: novoSaldo.lastID };
            }

            await run(
              `
                UPDATE estoque_saldos
                SET quantidade = quantidade + ?,
                    atualizado_em = CURRENT_TIMESTAMP
                WHERE id = ?
              `,
              [diferencaEstoque, saldo.id]
            );

            await run(
              `
                INSERT INTO movimentacoes_estoque (
                  produto_id,
                  tipo,
                  quantidade,
                  loja_origem_id,
                  local_origem_id,
                  loja_destino_id,
                  local_destino_id,
                  usuario_id,
                  referencia,
                  observacao,
                  justificativa
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `,
              [
                item.produto_id,
                diferencaEstoque > 0 ? 'AJUSTE_ENTRADA' : 'AJUSTE_SAIDA',
                Math.abs(diferencaEstoque),
                diferencaEstoque < 0 ? venda.loja_id : null,
                diferencaEstoque < 0 ? venda.local_id : null,
                diferencaEstoque > 0 ? venda.loja_id : null,
                diferencaEstoque > 0 ? venda.local_id : null,
                usuarioId(req) || null,
                `CORRECAO_VENDA_${id}`,
                `Correção da venda #${id}`,
                motivo,
              ]
            );
          }
        }

        await run(
          `
            UPDATE vendas
            SET valor_total = ?,
                atualizado_em = CURRENT_TIMESTAMP
            WHERE id = ?
          `,
          [novoTotal, id]
        );

        await run('DELETE FROM venda_pagamentos WHERE venda_id = ?', [id]);
        await run(
          `
            INSERT INTO venda_pagamentos
              (venda_id, forma_pagamento, valor)
            VALUES (?, ?, ?)
          `,
          [id, formaPagamento, novoTotal]
        );

        if (seraAPrazo) {
          if (conta) {
            const pago = Number(conta.valor_pago || 0);
            const saldo = arredondar(novoTotal - pago);
            await run(
              `
                UPDATE contas_receber
                SET valor_original = ?,
                    saldo = ?,
                    status = ?,
                    atualizado_em = CURRENT_TIMESTAMP
                WHERE id = ?
              `,
              [
                novoTotal,
                saldo,
                saldo <= 0 ? 'PAGO' : pago > 0 ? 'PARCIAL' : 'ABERTO',
                conta.id,
              ]
            );
          }
        } else if (conta) {
          await run('DELETE FROM contas_receber WHERE id = ?', [conta.id]);
        }

        const depois = {
          valorTotal: novoTotal,
          formaPagamento,
          itens: itensEntrada.map((i: any) => ({
            id: Number(i.id),
            quantidade: Number(i.quantidade),
          })),
        };

        await run(
          `
            INSERT INTO vendas_correcoes (
              venda_id,
              usuario_id,
              motivo,
              dados_antes,
              dados_depois
            ) VALUES (?, ?, ?, ?, ?)
          `,
          [
            id,
            usuarioId(req) || null,
            motivo,
            JSON.stringify(antes),
            JSON.stringify(depois),
          ]
        );

        await run('COMMIT');

        res.json({
          sucesso: true,
          mensagem: 'Venda corrigida com histórico preservado.',
          vendaId: id,
          valorTotal: novoTotal,
        });
      } catch (error) {
        try { await run('ROLLBACK'); } catch {}
        throw error;
      }
    } catch (error: any) {
      res.status(400).json({
        sucesso: false,
        erro: error?.message || 'Não foi possível corrigir a venda.',
      });
    }
  }
);

router.post(
  '/:id/cancelar',
  permitirPerfis('ADMINISTRADOR', 'CEO'),
  async (req: any, res) => {
    const id = Number(req.params.id);
    const motivo = String(req.body?.motivo || '').trim();

    if (motivo.length < 5) {
      return res.status(400).json({
        sucesso: false,
        erro: 'Informe o motivo do cancelamento.',
      });
    }

    try {
      await garantirEstrutura();
      const venda = await get<any>('SELECT * FROM vendas WHERE id = ?', [id]);
      if (!venda) {
        return res.status(404).json({ sucesso: false, erro: 'Venda não encontrada.' });
      }
      if (venda.status === 'CANCELADA') {
        return res.status(400).json({ sucesso: false, erro: 'Venda já cancelada.' });
      }

      const itens = await all<any>('SELECT * FROM venda_itens WHERE venda_id = ?', [id]);
      let conta: any;
      try {
        conta = await get<any>('SELECT * FROM contas_receber WHERE venda_id = ?', [id]);
      } catch {}

      if (conta && Number(conta.valor_pago || 0) > 0) {
        return res.status(400).json({
          sucesso: false,
          erro: 'A venda possui recebimento A Prazo. Estorne o recebimento antes de cancelar.',
        });
      }

      await run('BEGIN IMMEDIATE TRANSACTION');
      try {
        for (const item of itens) {
          let saldo = await get<any>(
            `
              SELECT id FROM estoque_saldos
              WHERE produto_id = ? AND loja_id = ? AND local_id = ?
              LIMIT 1
            `,
            [item.produto_id, venda.loja_id, venda.local_id]
          );
          if (!saldo) {
            const novo = await run(
              `
                INSERT INTO estoque_saldos
                  (produto_id, loja_id, local_id, quantidade, custo_medio)
                VALUES (?, ?, ?, 0, 0)
              `,
              [item.produto_id, venda.loja_id, venda.local_id]
            );
            saldo = { id: novo.lastID };
          }
          await run(
            `
              UPDATE estoque_saldos
              SET quantidade = quantidade + ?,
                  atualizado_em = CURRENT_TIMESTAMP
              WHERE id = ?
            `,
            [Number(item.quantidade), saldo.id]
          );
        }

        if (conta) {
          await run('DELETE FROM contas_receber WHERE id = ?', [conta.id]);
        }

        await run(
          `
            UPDATE vendas
            SET status = 'CANCELADA',
                cancelado_em = CURRENT_TIMESTAMP,
                atualizado_em = CURRENT_TIMESTAMP,
                observacao = CASE
                  WHEN observacao IS NULL OR TRIM(observacao) = ''
                    THEN ?
                  ELSE observacao || ' | ' || ?
                END
            WHERE id = ?
          `,
          [`Cancelamento: ${motivo}`, `Cancelamento: ${motivo}`, id]
        );

        await run(
          `
            INSERT INTO vendas_correcoes
              (venda_id, usuario_id, motivo, dados_antes, dados_depois)
            VALUES (?, ?, ?, ?, ?)
          `,
          [
            id,
            usuarioId(req) || null,
            motivo,
            JSON.stringify({ venda, itens, contaReceber: conta || null }),
            JSON.stringify({ status: 'CANCELADA' }),
          ]
        );

        await run('COMMIT');
        res.json({ sucesso: true, mensagem: 'Venda cancelada e estoque estornado.' });
      } catch (error) {
        try { await run('ROLLBACK'); } catch {}
        throw error;
      }
    } catch (error: any) {
      res.status(400).json({
        sucesso: false,
        erro: error?.message || 'Não foi possível cancelar a venda.',
      });
    }
  }
);

export default router;
