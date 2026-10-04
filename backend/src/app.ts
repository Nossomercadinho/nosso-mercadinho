import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import './database/database';

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

import {
  autenticarToken,
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

app.get('/api', (_req, res) => {
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
  produtosRoutes
);

app.use(
  '/api/ncm',
  autenticarToken,
  ncmRoutes
);

app.use(
  '/api/lojas',
  autenticarToken,
  lojasRoutes
);

app.use(
  '/api/estoque',
  autenticarToken,
  estoqueRoutes
);

app.use(
  '/api/fornecedores',
  autenticarToken,
  fornecedoresRoutes
);

app.use(
  '/api/nfe',
  autenticarToken,
  nfeRoutes
);

app.use(
  '/api/financeiro',
  autenticarToken,
  financeiroRoutes
);

app.use(
  '/api/executores',
  autenticarToken,
  executoresRoutes
);

app.use(
  '/api/vendas',
  autenticarToken,
  vendasRoutes
);

app.use(
  '/api/clientes-prazo',
  autenticarToken,
  clientesPrazoRoutes
);

app.use(
  '/api/vendas-gestao',
  autenticarToken,
  vendasGestaoRoutes
);

app.use(
  '/api/fechamento-diario',
  autenticarToken,
  fechamentoDiarioRoutes
);

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

app.listen(PORT, () => {
  console.log(
    `Servidor rodando na porta ${PORT}`
  );
});

export default app;
