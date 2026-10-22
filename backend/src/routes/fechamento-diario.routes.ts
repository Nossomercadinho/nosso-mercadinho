import { Router } from 'express';
import { permitirPerfis } from '../middleware/auth.middleware';
import { lojaPermitida } from '../services/acessos.service';
import {
  buscarFechamento,
  ErroValidacaoFechamento,
  listarExecutores,
  listarFechamentos,
  salvarFechamento,
} from '../services/fechamento-diario.service';

const router = Router();

function lojaDoFechamento(req: any, valor: unknown) {
  return Number(valor || (req.usuario?.acessoTodasLojas ? 1 : req.usuario?.lojaIds?.[0]) || 0);
}

function usuarioId(req: any) {
  return Number(req.usuario?.id || 0);
}

router.get(
  '/executores',
  permitirPerfis('ADMINISTRADOR', 'CEO', 'CAIXA'),
  async (_req, res) => {
    try {
      res.json({ sucesso: true, executores: await listarExecutores() });
    } catch (e: any) {
      res.status(500).json({ sucesso: false, erro: e?.message || 'Erro ao listar executores.' });
    }
  }
);

router.get(
  '/',
  permitirPerfis('ADMINISTRADOR', 'CEO', 'CAIXA'),
  async (req: any, res) => {
    try {
      const lojaId = lojaDoFechamento(req, req.query.lojaId);
      if (!lojaPermitida(req.usuario, lojaId)) return res.status(403).json({ sucesso: false, erro: 'Você não tem acesso ao mercado deste fechamento.' });
      const data = String(req.query.data || '').trim();
      if (data) {
        const fechamento = await buscarFechamento(data, lojaId);
        return res.json({ sucesso: true, fechamento: fechamento || null });
      }

      const inicio = String(req.query.inicio || '').trim() || undefined;
      const fim = String(req.query.fim || '').trim() || undefined;
      const fechamentos = await listarFechamentos(lojaId, inicio, fim);
      return res.json({ sucesso: true, fechamentos });
    } catch (e: any) {
      res.status(500).json({ sucesso: false, erro: e?.message || 'Erro ao consultar fechamentos.' });
    }
  }
);

router.put(
  '/',
  permitirPerfis('ADMINISTRADOR', 'CEO', 'CAIXA'),
  async (req: any, res) => {
    try {
      const dataReferencia = String(req.body?.dataReferencia || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dataReferencia)) {
        return res.status(400).json({ sucesso: false, erro: 'Informe uma data válida.' });
      }

      const numeros = ['dinheiro','pix','debito','credito','aPrazo','outros'];
      const dados: any = {};
      for (const campo of numeros) {
        const valor = Number(req.body?.[campo] || 0);
        if (!Number.isFinite(valor) || valor < 0) {
          return res.status(400).json({ sucesso: false, erro: `Valor inválido em ${campo}.` });
        }
        dados[campo] = valor;
      }

      const lojaId = lojaDoFechamento(req, req.body?.lojaId);
      if (!lojaPermitida(req.usuario, lojaId)) return res.status(403).json({ sucesso: false, erro: 'Você não tem acesso ao mercado deste fechamento.' });
      const fechamento = await salvarFechamento({
        ...dados,
        ...(req.body?.caixa !== undefined ? { caixa: req.body.caixa } : {}),
        dataReferencia,
        lojaId,
        executorId: Number(req.body?.executorId || 0) || null,
        usuarioId: usuarioId(req) || null,
        observacao: String(req.body?.observacao || '').trim(),
        motivoAlteracao: String(req.body?.motivoAlteracao || '').trim(),
      });

      res.json({
        sucesso: true,
        mensagem: 'Fechamento diário salvo manualmente.',
        fechamento,
      });
    } catch (e: any) {
      res.status(e instanceof ErroValidacaoFechamento ? 400 : 500).json({ sucesso: false, erro: e?.message || 'Erro ao salvar fechamento.' });
    }
  }
);

export default router;
