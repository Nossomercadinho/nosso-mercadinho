import { Router } from 'express';
import db from '../database/database';
import type { RequestAutenticada } from '../middleware/auth.middleware';
import { lojaPermitida } from '../services/acessos.service';
import { escopoLojaSql } from '../services/escopo-lojas.service';

const router = Router();
const limiteCentavos = 999_999_999_999;

function inteiroEntre(valor: unknown, minimo: number, maximo: number): valor is number {
  return typeof valor === 'number' && Number.isSafeInteger(valor) && valor >= minimo && valor <= maximo;
}

router.get('/', (req: RequestAutenticada, res, next) => {
  const ano = typeof req.query.ano === 'string' && /^\d{4}$/.test(req.query.ano)
    ? Number(req.query.ano)
    : NaN;
  if (!inteiroEntre(ano, 1900, 9999)) {
    return res.status(400).json({ sucesso: false, erro: 'Informe um ano entre 1900 e 9999.' });
  }

  db.all(
    `SELECT f.loja_id, f.ano, f.mes, f.valor_centavos
     FROM faturamento_mensal f
     JOIN lojas l ON l.id = f.loja_id AND l.ativo = 1
     WHERE (f.ano = ? OR (f.ano = ? AND f.mes = 12))
       AND ${escopoLojaSql('f.loja_id')}
     ORDER BY f.ano, f.mes, f.loja_id`,
    [ano, ano - 1],
    (erro, linhas) => {
      if (erro) return next(erro);
      return res.json({
        sucesso: true,
        registros: linhas.map(linha => ({
          lojaId: Number(linha.loja_id),
          ano: Number(linha.ano),
          mes: Number(linha.mes),
          centavos: Number(linha.valor_centavos),
        })),
      });
    },
  );
});

router.put('/', (req: RequestAutenticada, res, next) => {
  const { lojaId, ano, mes, centavos, anterior } = req.body ?? {};
  if (!req.usuario || !req.lojaAtivaId || lojaId !== req.lojaAtivaId || !lojaPermitida(req.usuario, lojaId)) {
    return res.status(403).json({ sucesso: false, erro: 'Selecione a unidade ativa antes de gravar.' });
  }
  if (!inteiroEntre(ano, 1900, 9999) || !inteiroEntre(mes, 1, 12)
      || !inteiroEntre(centavos, 0, limiteCentavos)
      || (anterior !== null && !inteiroEntre(anterior, 0, limiteCentavos))) {
    return res.status(400).json({ sucesso: false, erro: 'Confira o ano, o mês e o valor do faturamento.' });
  }

  // Um registro por competência. Uma edição concorrente deve ser revisada.
  const agora = new Date().toISOString();
  db.run(
    `INSERT INTO faturamento_mensal (loja_id, ano, mes, valor_centavos, atualizado_por, atualizado_em)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (loja_id, ano, mes) DO UPDATE SET
       valor_centavos = excluded.valor_centavos,
       atualizado_por = excluded.atualizado_por,
       atualizado_em = excluded.atualizado_em
     WHERE faturamento_mensal.valor_centavos = ?
       OR faturamento_mensal.valor_centavos = excluded.valor_centavos`,
    [lojaId, ano, mes, centavos, req.usuario.id, agora, anterior],
    function (erro) {
      if (erro) return next(erro);
      if (!this.changes) {
        return res.status(409).json({ sucesso: false, erro: 'O valor foi atualizado em outra sessão. Recarregue o histórico e revise a alteração.' });
      }
      return res.json({ sucesso: true, registro: { lojaId, ano, mes, centavos } });
    },
  );
});

export default router;
