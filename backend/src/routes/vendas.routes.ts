import { Router } from 'express';
import { autorizarModulo, RequestAutenticada } from '../middleware/auth.middleware';
import { buscarProdutoPdv, pesquisarProdutosPdv, buscarVendaPorId, criarVenda, listarLocaisPdv } from '../services/vendas.service';
import { obterUsuarioAcesso, listarLojasPermitidas, lojaPermitida } from '../services/acessos.service';
import { exigirSessaoAberta, obterExecutorUsuario } from '../services/caixas.service';

const router = Router();
async function usuario(req: RequestAutenticada) {
  const acesso = await obterUsuarioAcesso(Number(req.usuario?.id));
  if (!acesso) throw new Error('Usuário não encontrado ou inativo.');
  return acesso;
}
async function destinoPdv(req: RequestAutenticada) {
  const acesso = await usuario(req);
  const sessao = await exigirSessaoAberta(acesso);
  const lojaInformada = req.query.lojaId ?? req.body?.lojaId;
  const localInformado = req.query.localId ?? req.body?.localId;
  if ((lojaInformada !== undefined && Number(lojaInformada) !== sessao.lojaId)
    || (localInformado !== undefined && Number(localInformado) !== sessao.localId)) {
    throw new Error('O mercado e o local devem corresponder ao caixa aberto.');
  }
  return { acesso, sessao, lojaId: Number(sessao.lojaId), localId: Number(sessao.localId) };
}

router.get('/pdv/locais', autorizarModulo('pdv'), async (req: RequestAutenticada, res) => {
  try {
    const lojas = await listarLojasPermitidas(await usuario(req));
    res.json({ sucesso: true, locais: await listarLocaisPdv(lojas.map(l => l.id)) });
  } catch (e: any) { res.status(400).json({ sucesso: false, erro: e.message }); }
});
router.get('/pdv/pesquisar', autorizarModulo('pdv'), async (req: RequestAutenticada, res) => {
  try {
    const { lojaId, localId } = await destinoPdv(req);
    const produtos = await pesquisarProdutosPdv(String(req.query.q || ''), lojaId, localId, 8);
    res.json({ sucesso: true, produtos });
  } catch (e: any) { res.status(400).json({ sucesso: false, erro: e.message }); }
});
router.get('/pdv/produto/:ean', autorizarModulo('pdv'), async (req: RequestAutenticada, res) => {
  try {
    const { lojaId, localId } = await destinoPdv(req);
    res.json({ sucesso: true, produto: await buscarProdutoPdv(String(req.params.ean || ''), lojaId, localId) });
  } catch (e: any) { res.status(400).json({ sucesso: false, erro: e.message }); }
});
router.post('/', autorizarModulo('pdv'), async (req: RequestAutenticada, res) => {
  try {
    const { acesso, sessao, lojaId, localId } = await destinoPdv(req);
    const executor = await obterExecutorUsuario(acesso);
    const resultado = await criarVenda({
      lojaId, localId, executorId: executor.id, usuarioId: acesso.id, caixaSessaoId: sessao.id,
      itens: Array.isArray(req.body?.itens) ? req.body.itens : [],
      pagamentos: Array.isArray(req.body?.pagamentos) ? req.body.pagamentos : [],
      observacao: req.body?.observacao,
      cliente: req.body?.cliente ? {
        id: Number(req.body.cliente.id || 0) || undefined,
        nome: String(req.body.cliente.nome || ''), cpf: String(req.body.cliente.cpf || ''), telefone: String(req.body.cliente.telefone || ''),
      } : undefined,
    });
    res.status(201).json({ ...resultado, executor, caixaSessaoId: sessao.id });
  } catch (e: any) { res.status(400).json({ sucesso: false, erro: e.message || 'Não foi possível concluir a venda.' }); }
});
router.get('/:id', autorizarModulo('vendas', 'pdv'), async (req: RequestAutenticada, res) => {
  try {
    const acesso = await usuario(req);
    const venda = await buscarVendaPorId(Number(req.params.id));
    if (!lojaPermitida(acesso, Number(venda.loja_id)) || (!acesso.permissoes.includes('vendas') && Number(venda.usuario_id) !== acesso.id)) {
      return res.status(403).json({ sucesso: false, erro: 'Você não tem acesso a esta venda.' });
    }
    res.json({ sucesso: true, venda });
  } catch (e: any) { res.status(404).json({ sucesso: false, erro: e.message || 'Venda não encontrada.' }); }
});
export default router;
