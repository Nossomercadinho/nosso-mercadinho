import { Router } from 'express';
import { buscarNcm } from '../services/ncm.service';

const router = Router();

router.get('/:codigo', async (req, res) => {
  const { codigo } = req.params;

  if (!codigo) {
    return res.status(400).json({
      sucesso: false,
      erro: 'NCM não informado',
    });
  }

  try {
    const resultado = await buscarNcm(codigo);

    if (!resultado) {
      return res.status(404).json({
        sucesso: false,
        erro: 'NCM não encontrado na tabela oficial',
      });
    }

    return res.json({
      sucesso: true,
      ncm: resultado.codigo,
      descricao: resultado.descricao,
    });
  } catch (error) {
    console.error('Erro ao consultar NCM:', error);

    return res.status(500).json({
      sucesso: false,
      erro: 'Erro ao consultar a tabela oficial de NCM',
    });
  }
});

export default router;