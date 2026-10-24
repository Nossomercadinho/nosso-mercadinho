import {
  NextFunction,
  Request,
  Response,
} from 'express';
import jwt from 'jsonwebtoken';
import { lojaPermitida, obterUsuarioAcesso, UsuarioAcesso } from '../services/acessos.service';
import { contextoLojas } from '../services/escopo-lojas.service';
import db from '../database/database';

export type PerfilUsuario =
  | 'ADMINISTRADOR'
  | 'CEO'
  | 'OPERADOR'
  | 'CAIXA';

export type UsuarioToken = UsuarioAcesso;

export interface RequestAutenticada
  extends Request {
  usuario?: UsuarioToken;
  lojaAtivaId?: number;
}

function obterJwtSecret() {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error(
      'JWT_SECRET não configurado.'
    );
  }

  return secret;
}

export async function autenticarToken(
  req: RequestAutenticada,
  res: Response,
  next: NextFunction
) {
  const authorization =
    req.headers.authorization;

  if (
    !authorization ||
    !authorization.startsWith('Bearer ')
  ) {
    return res.status(401).json({
      sucesso: false,
      erro: 'Não autenticado.',
    });
  }

  const token =
    authorization.substring(7);

  let payload: UsuarioToken;
  try {
    payload = jwt.verify(
      token,
      obterJwtSecret()
    ) as UsuarioToken;

  } catch {
    return res.status(401).json({
      sucesso: false,
      erro: 'Sessão inválida ou expirada.',
    });
  }
  try {
    const usuario = await obterUsuarioAcesso(Number(payload.id));
    if (!usuario) return res.status(401).json({ sucesso: false, erro: 'Usuário inativo ou sessão inválida. Entre novamente.' });
    req.usuario = usuario;
    next();
  } catch (error) {
    // A database outage is a server failure, not an expired login. Keeping it
    // as a 500 avoids forcing every connected operator out of the application.
    next(error);
  }
}

export function permitirPerfis(
  ...perfisPermitidos: PerfilUsuario[]
) {
  return (
    req: RequestAutenticada,
    res: Response,
    next: NextFunction
  ) => {
    if (!req.usuario) {
      return res.status(401).json({
        sucesso: false,
        erro: 'Não autenticado.',
      });
    }

    // Existing endpoints used hard-coded profile names. The current role is
    // authoritative now, including roles created by the owner of the system.
    const modulos = permissoesDaRota(req);
    const permitido = modulos.length
      ? modulos.some(p => req.usuario!.permissoes.includes(p))
      : perfisPermitidos.includes(req.usuario.perfil as PerfilUsuario);
    if (!permitido) {
      return res.status(403).json({
        sucesso: false,
        erro:
          'Você não possui permissão para esta operação.',
      });
    }

    next();
  };
}

export function autorizarModulo(...codigos: string[]) {
  return (req: RequestAutenticada, res: Response, next: NextFunction) => {
    if (!req.usuario) return res.status(401).json({ sucesso: false, erro: 'Não autenticado.' });
    if (!codigos.some(c => req.usuario!.permissoes.includes(c))) return res.status(403).json({ sucesso: false, erro: 'Seu papel não permite acessar este módulo.' });
    next();
  };
}

/** Shared route map keeps legacy guards aligned with configurable modules. */
export function permissoesDaRota(req: Request): string[] {
  const caminho = `${req.baseUrl}${req.path}`.replace(/\/$/, '');
  const leitura = req.method === 'GET';
  if (caminho.startsWith('/api/usuarios')) return ['usuarios'];
  if (caminho.startsWith('/api/caixas')) return ['pdv', 'caixas'];
  if (caminho.startsWith('/api/vendas-gestao')) return ['vendas'];
  if (caminho.startsWith('/api/vendas')) return leitura && /^\/api\/vendas\/\d+$/.test(caminho) ? ['pdv', 'vendas'] : ['pdv'];
  if (caminho.startsWith('/api/clientes-prazo')) return leitura ? ['clientes', 'pdv'] : ['clientes'];
  if (caminho.startsWith('/api/fechamento-diario')) return ['fechamento'];
  if (caminho.startsWith('/api/financeiro/resumo')) return ['financeiro'];
  if (caminho.startsWith('/api/financeiro/fluxo-caixa')) return ['financeiro'];
  if (caminho.startsWith('/api/financeiro/fechamentos-caixa')) return ['financeiro', 'fechamento'];
  if (caminho.startsWith('/api/financeiro')) return ['financeiro', 'contas'];
  if (caminho.startsWith('/api/produtos')) return leitura ? ['produtos', 'estoque', 'compras'] : ['produtos'];
  if (caminho.startsWith('/api/ncm')) return ['produtos', 'compras', 'fiscal'];
  if (caminho.startsWith('/api/estoque')) return ['estoque'];
  if (caminho.startsWith('/api/lojas')) return leitura
    ? ['unidades', 'produtos', 'estoque', 'compras', 'financeiro', 'contas', 'vendas', 'pdv', 'caixas']
    : ['unidades'];
  if (caminho.startsWith('/api/fornecedores')) {
    // Supplier administration is distinct from the dropdown data used in purchases.
    if (leitura && (caminho === '/api/fornecedores' || /^\/api\/fornecedores\/\d+$/.test(caminho))) return ['fornecedores', 'compras', 'financeiro', 'contas'];
    return ['fornecedores', 'compras'];
  }
  if (caminho.startsWith('/api/nfe')) return ['compras', 'fiscal'];
  if (caminho.startsWith('/api/executores')) return ['estoque', 'compras', 'financeiro', 'contas', 'vendas', 'pdv', 'fechamento'];
  return [];
}

export function autorizarModuloRota(req: RequestAutenticada, res: Response, next: NextFunction) {
  const modulos = permissoesDaRota(req);
  if (!modulos.length) return next();
  return autorizarModulo(...modulos)(req, res, next);
}

/** Validate explicit store context before a route touches operational data. */
export async function autorizarEscopoLoja(req: RequestAutenticada, res: Response, next: NextFunction) {
  if (!req.usuario) return res.status(401).json({ sucesso: false, erro: 'Não autenticado.' });
  const caminho = `${req.baseUrl}${req.path}`;
  const isento = /^\/api\/(?:auth|usuarios|caixas|vendas)(?:\/|$)/.test(caminho)
    || (req.method === 'GET' && /^\/api\/lojas\/?$/.test(caminho))
    // O consolidado é somente leitura e mantém todas as lojas autorizadas
    // do usuário, em vez de restringir o resumo à loja operacional ativa.
    || (req.method === 'GET' && /^\/api\/financeiro\/resumo\/?$/.test(caminho) && req.query.consolidado === '1')
    || (req.method === 'GET' && /^\/api\/fornecedores(?:\/resumo)?\/?$/.test(caminho) && req.query.consolidado === '1');
  let usuarioEscopo = req.usuario;
  const headerLoja = req.headers['x-loja-id'];
  if (!isento && headerLoja !== undefined) {
    if (typeof headerLoja !== 'string' || !/^[1-9]\d*$/.test(headerLoja) || !Number.isSafeInteger(Number(headerLoja))) return res.status(400).json({ sucesso: false, erro: 'Mercado ativo inválido.' });
    const lojaAtivaId = Number(headerLoja);
    if (!lojaPermitida(req.usuario, lojaAtivaId)) return res.status(403).json({ sucesso: false, erro: 'Você não tem acesso ao mercado ativo ou ele está desativado.' });
    req.lojaAtivaId = lojaAtivaId;
    usuarioEscopo = { ...req.usuario, acessoTodasLojas: false, lojaIds: [lojaAtivaId] };
    if (req.method !== 'GET' && /^\/api\/(?:financeiro|nfe|fechamento-diario|produtos|estoque)(?:\/|$)/.test(caminho) && !caminho.endsWith('/transferir') && req.body?.lojaId == null) {
      req.body = { ...req.body, lojaId: lojaAtivaId };
    }
  }
  const ids: unknown[] = [];
  for (const campo of ['lojaId', 'loja_id', 'lojaOrigemId', 'lojaDestinoId', 'origemLojaId', 'destinoLojaId']) {
    if (req.query[campo] !== undefined && req.query[campo] !== '') ids.push(req.query[campo]);
    if (req.body?.[campo] !== undefined && req.body[campo] !== null && req.body[campo] !== '') ids.push(req.body[campo]);
  }
  if (req.method !== 'GET' && /^\/api\/(financeiro|nfe|estoque|fechamento-diario)(?:\/|$)/.test(caminho)) req.body = { ...req.body, usuarioId: req.usuario.id };
  const lojaRota = caminho.match(/^\/api\/lojas\/(\d+)(?:\/|$)/);
  if (lojaRota) ids.push(lojaRota[1]);
  // Cash history has its own scope, including still-assigned inactive stores.
  const historicoCaixa = req.method === 'GET' && /^\/api\/caixas(?:\/|$)/.test(caminho);
  if (!historicoCaixa && ids.some(id => !lojaPermitida(req.usuario, Number(id)))) return res.status(403).json({ sucesso: false, erro: 'Você não tem acesso ao mercado informado.' });
  if (req.lojaAtivaId && [req.body?.lojaId, req.query.lojaId, req.body?.loja_id, req.query.loja_id, req.body?.lojaOrigemId, lojaRota?.[1]].some(id => id != null && id !== '' && Number(id) !== req.lojaAtivaId)) return res.status(403).json({ sucesso: false, erro: 'Esta operação não pertence ao mercado ativo. Troque o mercado para continuar.' });
  try {
    const consultar = (sql: string, id: unknown) => new Promise<any>((resolve, reject) => db.get(sql, [id], (error, row) => error ? reject(error) : resolve(row)));
    // A supplied local must belong to an allowed store, even if lojaId was omitted.
    for (const [campo, lojaCampo] of [['localId', 'lojaId'], ['localEstoqueId', 'lojaId'], ['localOrigemId', 'lojaOrigemId'], ['localDestinoId', 'lojaDestinoId']] as const) {
      const valor = req.body?.[campo] ?? req.query[campo];
      if (valor === undefined || valor === null) continue;
      const local = await consultar('SELECT loja_id FROM locais_estoque WHERE id = ? AND ativo = 1', Number(valor));
      if (!local || !lojaPermitida(req.usuario, Number(local.loja_id))) return res.status(403).json({ sucesso: false, erro: 'O local de estoque não pertence a um mercado permitido.' });
      if (req.lojaAtivaId && campo !== 'localDestinoId' && Number(local.loja_id) !== req.lojaAtivaId) return res.status(403).json({ sucesso: false, erro: 'O local de estoque não pertence ao mercado ativo.' });
      const lojaInformada = req.body?.[lojaCampo] ?? req.query[lojaCampo];
      if (lojaInformada !== undefined && Number(lojaInformada) !== Number(local.loja_id)) return res.status(400).json({ sucesso: false, erro: 'O local de estoque não pertence ao mercado selecionado.' });
    }
    if (!usuarioEscopo.acessoTodasLojas) {
      let sqlRecurso: string | undefined;
      let idRecurso: string | undefined;
      const financeiro = caminho.match(/^\/api\/financeiro\/(?:fechamentos-caixa\/)?(\d+)(?:\/|$)/);
      const nota = caminho.match(/^\/api\/nfe\/(\d+)(?:\/|$)/);
      const itemNota = caminho.match(/^\/api\/nfe\/itens\/(\d+)(?:\/|$)/);
      const recebimento = caminho.match(/^\/api\/clientes-prazo\/contas\/(\d+)\/recebimentos/);
      if (financeiro) { sqlRecurso = 'SELECT loja_id FROM financeiro_lancamentos WHERE id = ?'; idRecurso = financeiro[1]; }
      if (nota) { sqlRecurso = 'SELECT loja_id FROM notas_entrada WHERE id = ?'; idRecurso = nota[1]; }
      if (itemNota) { sqlRecurso = 'SELECT n.loja_id FROM notas_entrada_itens i JOIN notas_entrada n ON n.id = i.nota_entrada_id WHERE i.id = ?'; idRecurso = itemNota[1]; }
      if (recebimento) { sqlRecurso = 'SELECT v.loja_id FROM contas_receber cr JOIN vendas v ON v.id = cr.venda_id WHERE cr.id = ?'; idRecurso = recebimento[1]; }
      if (sqlRecurso) {
        const recurso = await consultar(sqlRecurso, Number(idRecurso));
        if (!recurso) return res.status(404).json({ sucesso: false, erro: 'Registro não encontrado.' });
        if (!lojaPermitida(usuarioEscopo, Number(recurso.loja_id))) return res.status(403).json({ sucesso: false, erro: 'Este registro não pertence ao mercado ativo ou permitido para seu usuário.' });
      }
      for (const campo of ['notaEntradaId', 'notaEntradaParcelaId']) {
        if (!req.body?.[campo]) continue;
        const sql = campo === 'notaEntradaId'
          ? 'SELECT loja_id FROM notas_entrada WHERE id = ?'
          : 'SELECT n.loja_id FROM notas_entrada_parcelas p JOIN notas_entrada n ON n.id = p.nota_entrada_id WHERE p.id = ?';
        const vinculado = await consultar(sql, Number(req.body[campo]));
        if (!vinculado || !lojaPermitida(usuarioEscopo, Number(vinculado.loja_id))) return res.status(403).json({ sucesso: false, erro: 'A nota vinculada não pertence ao mercado ativo ou permitido.' });
      }
      // Legacy forms can omit their store. A single permitted store is unambiguous;
      // with multiple stores the operator must choose instead of writing globally.
      const novaOperacao = req.method === 'POST' && /^\/api\/(?:financeiro\/?|financeiro\/fechamentos-caixa\/?|nfe\/importar\/?)$/.test(caminho);
      if (novaOperacao && !req.body?.lojaId) {
        if (req.usuario.lojaIds.length !== 1) return res.status(400).json({ sucesso: false, erro: 'Selecione o mercado desta operação.' });
        req.body = { ...req.body, lojaId: req.usuario.lojaIds[0] };
      }
    }
  } catch (error) {
    if ((error as Error)?.message?.includes('no such table')) return res.status(404).json({ sucesso: false, erro: 'Registro não encontrado.' });
    return next(error);
  }
  if (!req.usuario.acessoTodasLojas && /^\/api\/lojas\/?$/.test(caminho) && req.method === 'GET') {
    const json = res.json.bind(res);
    res.json = ((body: any) => {
      if (Array.isArray(body?.lojas)) body = { ...body, lojas: body.lojas.filter((l: any) => lojaPermitida(req.usuario, Number(l.id))) };
      return json(body);
    }) as Response['json'];
  }
  contextoLojas.run({ ...usuarioEscopo, lojaAtivaId: req.lojaAtivaId }, next);
}
