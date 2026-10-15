import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

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

const app = express();

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

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
        error?.message ||
        'Erro interno do servidor.',
    });
  }
);

const PORT =
  Number(process.env.PORT) || 3000;

async function iniciar() {
  await bancoPronto;
  await inicializarAcessos();
  await garantirEstruturaCaixas();
  await garantirVinculosCadastros();
  await garantirPrecosCatalogoLoja();
  app.listen(PORT, () => { console.log(`Servidor rodando na porta ${PORT}`); });
}
iniciar().catch(error => { console.error('Não foi possível preparar o banco para iniciar a API:',error); process.exitCode=1; });

export default app;
