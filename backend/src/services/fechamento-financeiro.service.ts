import db from '../database/database';
import { transacaoCaixa } from './caixas.service';
import { escopoLojaSql } from './escopo-lojas.service';

function run(sql: string, params: any[] = []) {
  return new Promise<{ lastID: number; changes: number }>((resolve, reject) => {
    db.run(sql, params, function (error) { error ? reject(error) : resolve({ lastID: this.lastID, changes: this.changes }); });
  });
}
function get(sql: string, params: any[] = []) {
  return new Promise<any>((resolve, reject) => db.get(sql, params, (error, row) => error ? reject(error) : resolve(row)));
}
function all(sql: string, params: any[] = []) {
  return new Promise<any[]>((resolve, reject) => db.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows)));
}

export function exigirEdicaoNaOrigem(lancamento: any) {
  if (String(lancamento.numero_documento || '').startsWith('FECHAMENTO-DIARIO-')) {
    throw new Error('Este lançamento é integrado automaticamente. Altere os valores no Fechamento Diário da unidade e data correspondentes.');
  }
}

// Usa o mesmo bloqueio/transação do fechamento, inclusive entre funções PostgreSQL.
export async function integrarFechamentoFinanceiro(fechamento: any, usuarioId?: number | null) {
  return transacaoCaixa(async () => {
    const atual = await get(`SELECT id, loja_id AS lojaId, data_referencia AS dataReferencia,
      total_informado AS totalInformado, usuario_id AS usuarioId, observacao
      FROM fechamentos_diarios WHERE id = ? AND loja_id = ? AND ${escopoLojaSql('loja_id')}`,
      [fechamento.id, fechamento.lojaId]);
    if (!atual) throw new Error('Fechamento não encontrado nesta unidade.');
    fechamento = atual;
    const loja = await get('SELECT id, empresa_id, nome, tipo FROM lojas WHERE id = ?', [fechamento.lojaId]);
    if (!loja) throw new Error('Unidade do fechamento não encontrada.');
    const total = Math.round(Number(fechamento.totalInformado) * 100) / 100;
    if (!Number.isFinite(total)) throw new Error('Total do fechamento inválido.');
    const documento = `FECHAMENTO-DIARIO-${fechamento.id}`;
    const vinculado = await get('SELECT * FROM financeiro_lancamentos WHERE numero_documento = ? AND loja_id = ?', [documento, loja.id]);
    if (!vinculado) {
      const legado = await get(`SELECT id, valor_original FROM financeiro_lancamentos
        WHERE numero_documento = ? AND loja_id = ? AND tipo = 'ENTRADA' AND status <> 'CANCELADO'`,
        [`FECHAMENTO-${fechamento.dataReferencia}-${loja.id}`, loja.id]);
      if (legado) {
        return { estado: Math.round(Number(legado.valor_original) * 100) === Math.round(total * 100) ? 'existente' : 'conflito', lancamentoId: legado.id };
      }
      if (total === 0) return { estado: 'sem-valor', lancamentoId: null };
    }
    const observacao = `Integrado do Fechamento Diário #${fechamento.id}. ${fechamento.observacao || ''}`.trim();
    const usuario = usuarioId || fechamento.usuarioId || null;
    const baixas = vinculado ? await all('SELECT id, valor, data_baixa FROM financeiro_baixas WHERE lancamento_id = ?', [vinculado.id]) : [];
    if (vinculado && baixas.length > 1) throw new Error(`Fechamento #${fechamento.id} tem mais de um recebimento e precisa de revisão.`);
    if (vinculado && vinculado.status === 'RECEBIDO' && Number(vinculado.valor_original) === total
      && vinculado.data_vencimento === fechamento.dataReferencia && vinculado.observacao === observacao
      && baixas.length === 1 && Number(baixas[0].valor) === total && baixas[0].data_baixa === fechamento.dataReferencia) {
      return { estado: 'existente', lancamentoId: vinculado.id };
    }
    let lancamentoId = vinculado?.id;
    if (!vinculado) {
      const nomeCategoria = loja.tipo === 'MATRIZ' ? 'Venda' : 'Condomínios';
      let categoria = await get('SELECT id FROM financeiro_categorias WHERE empresa_id = ? AND nome = ? AND tipo = ?', [loja.empresa_id, nomeCategoria, 'ENTRADA']);
      if (!categoria) {
        const criada = await run('INSERT INTO financeiro_categorias (empresa_id, nome, tipo, ativo) VALUES (?, ?, ?, 1)', [loja.empresa_id, nomeCategoria, 'ENTRADA']);
        categoria = { id: criada.lastID };
      }
      const criado = await run(`INSERT INTO financeiro_lancamentos
        (empresa_id, loja_id, categoria_id, tipo, descricao, numero_documento, valor_original,
         data_emissao, data_vencimento, forma_pagamento, status, observacao, usuario_criacao_id, usuario_baixa_id, baixado_em)
        VALUES (?, ?, ?, 'ENTRADA', ?, ?, ?, ?, ?, 'Fechamento diário', 'RECEBIDO', ?, ?, ?, CURRENT_TIMESTAMP)`,
        [loja.empresa_id, loja.id, categoria.id, `FECHAMENTO DIÁRIO - ${loja.nome}`, documento, total,
          fechamento.dataReferencia, fechamento.dataReferencia, observacao, fechamento.usuarioId || usuario, usuario]);
      lancamentoId = criado.lastID;
    } else {
      await run(`UPDATE financeiro_lancamentos SET valor_original = ?, data_emissao = ?, data_vencimento = ?,
        status = 'RECEBIDO', observacao = ?, usuario_alteracao_id = ?, usuario_baixa_id = ?,
        baixado_em = CURRENT_TIMESTAMP, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?`,
        [total, fechamento.dataReferencia, fechamento.dataReferencia, observacao, usuario, usuario, lancamentoId]);
    }
    if (baixas.length) {
      await run('UPDATE financeiro_baixas SET valor = ?, data_baixa = ?, observacao = ?, usuario_id = ? WHERE id = ?',
        [total, fechamento.dataReferencia, observacao, usuario, baixas[0].id]);
    } else {
      await run(`INSERT INTO financeiro_baixas (lancamento_id, valor, data_baixa, forma_pagamento, observacao, usuario_id)
        VALUES (?, ?, ?, 'Fechamento diário', ?, ?)`, [lancamentoId, total, fechamento.dataReferencia, observacao, usuario]);
    }
    await run(`INSERT INTO financeiro_historico (lancamento_id, usuario_id, acao, descricao, valor_anterior, valor_novo)
      VALUES (?, ?, 'INTEGRACAO_FECHAMENTO_DIARIO', ?, ?, ?)`,
      [lancamentoId, usuario, observacao, vinculado ? String(vinculado.valor_original) : null, String(total)]);
    return { estado: vinculado ? 'atualizado' : 'criado', lancamentoId };
  });
}

export async function sincronizarFechamentosFinanceiro(lojaId: number, usuarioId: number) {
  // Uma unidade por chamada: não permite que o navegador amplie o escopo da sessão.
  const fechamentos = await all(`SELECT id, loja_id AS lojaId, data_referencia AS dataReferencia,
    total_informado AS totalInformado, usuario_id AS usuarioId, observacao
    FROM fechamentos_diarios WHERE loja_id = ? AND ${escopoLojaSql('loja_id')} ORDER BY id`, [lojaId]);
  const resultado = { criados: 0, atualizados: 0, existentes: 0, semValor: 0, conflitos: [] as any[] };
  for (const fechamento of fechamentos) {
    const integrado = await integrarFechamentoFinanceiro(fechamento, usuarioId);
    if (integrado.estado === 'criado') resultado.criados++;
    else if (integrado.estado === 'atualizado') resultado.atualizados++;
    else if (integrado.estado === 'sem-valor') resultado.semValor++;
    else if (integrado.estado === 'conflito') resultado.conflitos.push({ data: fechamento.dataReferencia, lancamentoId: integrado.lancamentoId });
    else resultado.existentes++;
  }
  return resultado;
}
