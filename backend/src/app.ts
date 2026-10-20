import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'node:path';

import db, { bancoPronto } from './database/database';
import { inicializarAcessos } from './services/acessos.service';
import { garantirEstruturaCaixas } from './services/caixas.service';
import { garantirVinculosCadastros } from './services/cadastros-lojas.service';
import { garantirPrecosCatalogoLoja } from './services/catalogo-lojas.service';

import produtosRoutes from './routes/produtos.routes';
import ncmRoutes from './routes/ncm.routes';
import lojasRoutes from './routes/lojas.routes';
import estoqueRoutes from './routes/estoque.routes';
import fornecedoresRoutes from './routes/fornecedores.routes';
import authRoutes from './routes/auth.routes';
import nfeRoutes from './routes/nfe.routes';
import financeiroRoutes from './routes/financeiro.routes';
import executoresRoutes from './routes/executores.routes';
import vendasRoutes from './routes/vendas.routes';
import clientesPrazoRoutes from './routes/clientes-prazo.routes';
import vendasGestaoRoutes from './routes/vendas-gestao.routes';
import fechamentoDiarioRoutes from './routes/fechamento-diario.routes';
import usuariosRoutes from './routes/usuarios.routes';
import caixasRoutes from './routes/caixas.routes';

import {
  autenticarToken,
  autorizarModuloRota,
  autorizarEscopoLoja,
} from './middleware/auth.middleware';

dotenv.config();

// The database starts connecting when its module is imported. Preserve that
// rejection for initialization without leaving an unhandled promise in runtimes
// that import the app before invoking the request handler.
void bancoPronto.catch(() => undefined);

let inicializacao: Promise<void> | undefined;

export function inicializarAplicacao(): Promise<void> {
  if (!inicializacao) {
    inicializacao = (async () => {
      await bancoPronto;
      await inicializarAcessos();
      await garantirEstruturaCaixas();
      await garantirVinculosCadastros();
      await garantirPrecosCatalogoLoja();
    })();
    // Keep the same result for concurrent requests, including failed startup.
    // Each caller still receives the original rejection and can return 503.
    void inicializacao.catch(() => undefined);
  }
  return inicializacao;
}

const app = express();
app.disable('x-powered-by');

if (process.env.NODE_ENV === 'production') {
  app.use((_req, res, next) => {
    const enviarJson = res.json.bind(res);
    // Several routes handle their own errors. Normalize unexpected failures at
    // the response boundary so those handlers cannot expose database details.
    res.json = body => {
      if (res.statusCode >= 500) {
        return enviarJson({
          sucesso: false,
          erro: res.statusCode === 503
            ? 'Serviço temporariamente indisponível. Tente novamente mais tarde.'
            : 'Erro interno do servidor.',
        });
      }
      return enviarJson(body);
    };
    next();
  });
}

app.use(
  cors({
    origin: process.env.NODE_ENV === 'production' ? false : true,
    credentials: true,
  })
);

app.use(async (_req, res, next) => {
  try {
    await inicializarAplicacao();
    next();
  } catch {
    res.status(503).json({
      sucesso: false,
      erro: 'Não foi possível preparar a API. Tente novamente mais tarde.',
    });
  }
});

app.use(
  express.json({
    limit: '20mb',
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: '20mb',
  })
);

app.get('/', (_req, res) => {
  res.json({
    sucesso: true,
    mensagem:
      'API Nosso Mercadinho funcionando.',
  });
});

app.get('/api', async (_req, res) => {
  try {
    await bancoPronto;
    await db.ping?.();
  } catch {
    return res.status(503).json({
      sucesso: false,
      erro: 'Banco de dados indisponível.',
    });
  }
  res.json({
    sucesso: true,
    mensagem:
      'API Nosso Mercadinho funcionando.',
  });
});

app.use(
  '/api/auth',
  authRoutes
);

app.use(
  '/api/produtos',
  autenticarToken,
  autorizarModuloRota,
  autorizarEscopoLoja,
  produtosRoutes
);

app.use(
  '/api/ncm',
  autenticarToken,
  autorizarModuloRota,
  autorizarEscopoLoja,
  ncmRoutes
);

app.use(
  '/api/lojas',
  autenticarToken,
  autorizarModuloRota,
  autorizarEscopoLoja,
  lojasRoutes
);

app.use(
  '/api/estoque',
  autenticarToken,
  autorizarModuloRota,
  autorizarEscopoLoja,
  estoqueRoutes
);

app.use(
  '/api/fornecedores',
  autenticarToken,
  autorizarModuloRota,
  autorizarEscopoLoja,
  fornecedoresRoutes
);

app.use(
  '/api/nfe',
  autenticarToken,
  autorizarModuloRota,
  autorizarEscopoLoja,
  nfeRoutes
);

app.use(
  '/api/financeiro',
  autenticarToken,
  autorizarModuloRota,
  autorizarEscopoLoja,
  financeiroRoutes
);

app.use(
  '/api/executores',
  autenticarToken,
  autorizarModuloRota,
  autorizarEscopoLoja,
  executoresRoutes
);

app.use(
  '/api/vendas',
  autenticarToken,
  autorizarModuloRota,
  autorizarEscopoLoja,
  vendasRoutes
);

app.use(
  '/api/clientes-prazo',
  autenticarToken,
  autorizarModuloRota,
  autorizarEscopoLoja,
  clientesPrazoRoutes
);

app.use(
  '/api/vendas-gestao',
  autenticarToken,
  autorizarModuloRota,
  autorizarEscopoLoja,
  vendasGestaoRoutes
);

app.use(
  '/api/fechamento-diario',
  autenticarToken,
  autorizarModuloRota,
  autorizarEscopoLoja,
  fechamentoDiarioRoutes
);

app.use('/api/usuarios', autenticarToken, usuariosRoutes);
app.use('/api/caixas', autenticarToken, autorizarModuloRota, autorizarEscopoLoja, caixasRoutes);

app.use((_req, res) => {
  res.status(404).json({
    sucesso: false,
    erro: 'Rota não encontrada.',
  });
});

app.use(
  (
    error: any,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error(error);

    res.status(500).json({
      sucesso: false,
      erro:
        process.env.NODE_ENV === 'production'
          ? 'Erro interno do servidor.'
          : error?.message || 'Erro interno do servidor.',
    });
  }
);

const PORT =
  Number(process.env.PORT) || 3000;

// ts-node-dev executes the entrypoint through its own require() wrapper.
const executadoDiretamente = require.main === module || (
  process.env.TS_NODE_DEV === 'true' &&
  process.argv[1] &&
  path.resolve(process.argv[1]) === __filename
);

if (executadoDiretamente) {
  inicializarAplicacao()
    .then(() => {
      app.listen(PORT, () => { console.log(`Servidor rodando na porta ${PORT}`); });
    })
    .catch(error => {
      console.error('Não foi possível preparar o banco para iniciar a API:', error);
      process.exitCode = 1;
    });
}

export default app;
