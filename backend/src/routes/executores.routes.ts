import { Router } from 'express';
import db from '../database/database';

import {
  permitirPerfis,
} from '../middleware/auth.middleware';

const router = Router();

type Executor = {
  id: number;
  codigo: string;
  nome: string;
  ativo: number;
};

/*
|--------------------------------------------------------------------------
| LISTAR EXECUTORES ATIVOS
|--------------------------------------------------------------------------
|
| Todos os perfis autenticados que possam realizar operações precisam
| conseguir listar os executores ativos para identificação.
|
*/

router.get(
  '/',
  permitirPerfis(
    'ADMINISTRADOR',
    'CEO',
    'OPERADOR',
    'CAIXA'
  ),
  (_req, res) => {
    db.all(
      `
        SELECT
          id,
          codigo,
          nome,
          ativo
        FROM executores
        WHERE ativo = 1
        ORDER BY codigo
      `,
      [],
      (
        erro: Error | null,
        executores: Executor[]
      ) => {
        if (erro) {
          console.error(
            'Erro ao listar executores:',
            erro
          );

          return res.status(500).json({
            sucesso: false,
            erro:
              'Erro ao consultar executores.',
          });
        }

        return res.json({
          sucesso: true,
          executores,
        });
      }
    );
  }
);

/*
|--------------------------------------------------------------------------
| IDENTIFICAR EXECUTOR PELO CÓDIGO
|--------------------------------------------------------------------------
|
| Esta rota não administra executores.
| Ela apenas valida a identidade operacional de um executor ativo.
|
| É necessária principalmente para o perfil compartilhado CAIXA.
|
*/

router.get(
  '/codigo/:codigo',
  permitirPerfis(
    'ADMINISTRADOR',
    'CEO',
    'OPERADOR',
    'CAIXA'
  ),
  (req, res) => {
    const codigo = String(
      req.params.codigo || ''
    ).trim();

    if (!codigo) {
      return res.status(400).json({
        sucesso: false,
        erro: 'Informe o ID do executor.',
      });
    }

    db.get(
      `
        SELECT
          id,
          codigo,
          nome,
          ativo
        FROM executores
        WHERE codigo = ?
        LIMIT 1
      `,
      [codigo],
      (
        erro: Error | null,
        executor: Executor | undefined
      ) => {
        if (erro) {
          console.error(
            'Erro ao consultar executor:',
            erro
          );

          return res.status(500).json({
            sucesso: false,
            erro:
              'Erro ao identificar executor.',
          });
        }

        if (!executor) {
          return res.status(404).json({
            sucesso: false,
            erro: 'Executor não encontrado.',
          });
        }

        if (Number(executor.ativo) !== 1) {
          return res.status(403).json({
            sucesso: false,
            erro: 'Executor inativo.',
          });
        }

        return res.json({
          sucesso: true,
          executor: {
            id: executor.id,
            codigo: executor.codigo,
            nome: executor.nome,
          },
        });
      }
    );
  }
);

export default router;
