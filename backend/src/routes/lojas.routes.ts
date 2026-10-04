import { Router } from 'express';

import {
  permitirPerfis,
} from '../middleware/auth.middleware';
import db from '../database/database';

const router = Router();

/*
|--------------------------------------------------------------------------
| LISTAR LOJAS / UNIDADES
|--------------------------------------------------------------------------
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
        l.id,
        l.empresa_id,
        l.nome,
        l.codigo,
        l.tipo,
        l.cnpj,
        l.endereco,
        l.numero,
        l.complemento,
        l.bairro,
        l.cidade,
        l.estado,
        l.cep,
        l.telefone,
        l.ativo,
        l.criado_em,
        l.atualizado_em,

        (
          SELECT COUNT(*)
          FROM locais_estoque le
          WHERE le.loja_id = l.id
            AND le.ativo = 1
        ) AS quantidade_locais

      FROM lojas l

      WHERE l.ativo = 1

      ORDER BY
        CASE
          WHEN l.tipo = 'MATRIZ' THEN 0
          ELSE 1
        END,
        l.nome COLLATE NOCASE ASC
    `,
    [],
    (erro, lojas) => {
      if (erro) {
        console.error(
          'Erro ao listar lojas:',
          erro
        );

        return res.status(500).json({
          sucesso: false,
          erro: 'Erro ao listar unidades',
        });
      }

      return res.json({
        sucesso: true,
        lojas,
      });
    }
  );
});

/*
|--------------------------------------------------------------------------
| BUSCAR UMA LOJA
|--------------------------------------------------------------------------
*/

router.get(
  '/:id',
  permitirPerfis(
    'ADMINISTRADOR',
    'CEO',
    'OPERADOR',
    'CAIXA'
  ),
  (req, res) => {
  const id = Number(req.params.id);

  if (!id) {
    return res.status(400).json({
      sucesso: false,
      erro: 'ID da unidade inválido',
    });
  }

  db.get(
    `
      SELECT *
      FROM lojas
      WHERE id = ?
        AND ativo = 1
      LIMIT 1
    `,
    [id],
    (erro, loja) => {
      if (erro) {
        console.error(
          'Erro ao buscar unidade:',
          erro
        );

        return res.status(500).json({
          sucesso: false,
          erro: 'Erro ao buscar unidade',
        });
      }

      if (!loja) {
        return res.status(404).json({
          sucesso: false,
          erro: 'Unidade não encontrada',
        });
      }

      return res.json({
        sucesso: true,
        loja,
      });
    }
  );
});

/*
|--------------------------------------------------------------------------
| LISTAR LOCAIS DE ESTOQUE DE UMA UNIDADE
|--------------------------------------------------------------------------
*/

router.get(
  '/:id/locais',
  permitirPerfis(
    'ADMINISTRADOR',
    'CEO',
    'OPERADOR',
    'CAIXA'
  ),
  (req, res) => {
  const lojaId = Number(req.params.id);

  if (!lojaId) {
    return res.status(400).json({
      sucesso: false,
      erro: 'ID da unidade inválido',
    });
  }

  db.all(
    `
      SELECT
        id,
        loja_id,
        nome,
        tipo,
        permite_venda,
        ativo,
        criado_em,
        atualizado_em

      FROM locais_estoque

      WHERE loja_id = ?
        AND ativo = 1

      ORDER BY
        CASE
          WHEN tipo = 'DEPOSITO' THEN 0
          WHEN tipo = 'VENDA' THEN 1
          ELSE 2
        END,
        nome COLLATE NOCASE ASC
    `,
    [lojaId],
    (erro, locais) => {
      if (erro) {
        console.error(
          'Erro ao listar locais:',
          erro
        );

        return res.status(500).json({
          sucesso: false,
          erro:
            'Erro ao listar locais de estoque',
        });
      }

      return res.json({
        sucesso: true,
        locais,
      });
    }
  );
});

/*
|--------------------------------------------------------------------------
| CADASTRAR NOVA UNIDADE
|--------------------------------------------------------------------------
*/

router.post(
  '/',
  permitirPerfis(
    'ADMINISTRADOR',
    'CEO'
  ),
  (req, res) => {
  const {
    empresaId,
    nome,
    codigo,
    tipo,
    cnpj,
    endereco,
    numero,
    complemento,
    bairro,
    cidade,
    estado,
    cep,
    telefone,
    possuiDeposito,
  } = req.body;

  if (!String(nome || '').trim()) {
    return res.status(400).json({
      sucesso: false,
      erro: 'Nome da unidade é obrigatório',
    });
  }

  const tipoLoja =
    tipo === 'MATRIZ'
      ? 'MATRIZ'
      : 'FILIAL';

  /*
   * Enquanto temos uma empresa principal,
   * utilizamos empresa 1 como padrão.
   */
  const empresa =
    Number(empresaId) || 1;

  db.run(
    `
      INSERT INTO lojas (
        empresa_id,
        nome,
        codigo,
        tipo,
        cnpj,
        endereco,
        numero,
        complemento,
        bairro,
        cidade,
        estado,
        cep,
        telefone
      )
      VALUES (
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?
      )
    `,
    [
      empresa,
      String(nome).trim(),
      codigo || '',
      tipoLoja,
      cnpj || '',
      endereco || '',
      numero || '',
      complemento || '',
      bairro || '',
      cidade || '',
      estado || '',
      cep || '',
      telefone || '',
    ],
    function (erro) {
      if (erro) {
        console.error(
          'Erro ao cadastrar unidade:',
          erro
        );

        return res.status(500).json({
          sucesso: false,
          erro: 'Erro ao cadastrar unidade',
        });
      }

      const lojaId = this.lastID;

      /*
      |--------------------------------------------------------------------------
      | ÁREA DE VENDA
      |--------------------------------------------------------------------------
      |
      | Toda unidade terá uma área de venda.
      */

      db.run(
        `
          INSERT INTO locais_estoque (
            loja_id,
            nome,
            tipo,
            permite_venda
          )
          VALUES (?, ?, ?, ?)
        `,
        [
          lojaId,
          'Área de Venda',
          'VENDA',
          1,
        ],
        (erroVenda) => {
          if (erroVenda) {
            console.error(
              'Erro ao criar área de venda:',
              erroVenda
            );
          }
        }
      );

      /*
      |--------------------------------------------------------------------------
      | DEPÓSITO
      |--------------------------------------------------------------------------
      |
      | Matriz sempre terá depósito.
      | Filiais podem ter depósito/reserva.
      */

      const criarDeposito =
        tipoLoja === 'MATRIZ' ||
        possuiDeposito === true;

      if (criarDeposito) {
        db.run(
          `
            INSERT INTO locais_estoque (
              loja_id,
              nome,
              tipo,
              permite_venda
            )
            VALUES (?, ?, ?, ?)
          `,
          [
            lojaId,
            'Depósito',
            'DEPOSITO',
            0,
          ],
          (erroDeposito) => {
            if (erroDeposito) {
              console.error(
                'Erro ao criar depósito:',
                erroDeposito
              );
            }
          }
        );
      }

      return res.status(201).json({
        sucesso: true,
        mensagem:
          'Unidade cadastrada com sucesso',
        id: lojaId,
      });
    }
  );
});

/*
|--------------------------------------------------------------------------
| CRIAR NOVO LOCAL DE ESTOQUE
|--------------------------------------------------------------------------
|
| Isso permite futuramente ter:
|
| Depósito
| Área de Venda
| Câmara Fria
| Freezer
| Estoque de Bebidas
| Reserva
| etc.
|
*/

router.post(
  '/:id/locais',
  permitirPerfis(
    'ADMINISTRADOR',
    'CEO'
  ),
  (req, res) => {
  const lojaId = Number(req.params.id);

  const {
    nome,
    tipo,
    permiteVenda,
  } = req.body;

  if (!lojaId) {
    return res.status(400).json({
      sucesso: false,
      erro: 'ID da unidade inválido',
    });
  }

  if (!String(nome || '').trim()) {
    return res.status(400).json({
      sucesso: false,
      erro:
        'Nome do local de estoque é obrigatório',
    });
  }

  db.run(
    `
      INSERT INTO locais_estoque (
        loja_id,
        nome,
        tipo,
        permite_venda
      )
      VALUES (?, ?, ?, ?)
    `,
    [
      lojaId,
      String(nome).trim(),
      String(tipo || 'OUTRO')
        .trim()
        .toUpperCase(),
      permiteVenda ? 1 : 0,
    ],
    function (erro) {
      if (erro) {
        console.error(
          'Erro ao criar local:',
          erro
        );

        return res.status(500).json({
          sucesso: false,
          erro:
            'Erro ao criar local de estoque',
        });
      }

      return res.status(201).json({
        sucesso: true,
        mensagem:
          'Local de estoque criado',
        id: this.lastID,
      });
    }
  );
});

/*
|--------------------------------------------------------------------------
| EDITAR LOCAL DE ESTOQUE
|--------------------------------------------------------------------------
*/

router.put(
  '/:id/locais/:localId',
  permitirPerfis(
    'ADMINISTRADOR',
    'CEO'
  ),
  (req, res) => {
  const lojaId = Number(req.params.id);
  const localId = Number(req.params.localId);
  const { nome, tipo, permiteVenda } = req.body;

  if (!lojaId || !localId) {
    return res.status(400).json({
      sucesso: false,
      erro: 'ID da unidade ou do local inválido',
    });
  }

  if (!String(nome || '').trim()) {
    return res.status(400).json({
      sucesso: false,
      erro: 'Nome do local de estoque é obrigatório',
    });
  }

  db.run(
    `
      UPDATE locais_estoque
      SET
        nome = ?,
        tipo = ?,
        permite_venda = ?,
        atualizado_em = CURRENT_TIMESTAMP
      WHERE id = ?
        AND loja_id = ?
        AND ativo = 1
    `,
    [
      String(nome).trim(),
      String(tipo || 'OUTRO').trim().toUpperCase(),
      permiteVenda ? 1 : 0,
      localId,
      lojaId,
    ],
    function (erro) {
      if (erro) {
        console.error('Erro ao editar local de estoque:', erro);
        return res.status(500).json({
          sucesso: false,
          erro: 'Erro ao editar local de estoque',
        });
      }

      if (this.changes === 0) {
        return res.status(404).json({
          sucesso: false,
          erro: 'Local de estoque não encontrado',
        });
      }

      return res.json({
        sucesso: true,
        mensagem: 'Local de estoque atualizado com sucesso',
      });
    }
  );
});

/*
|--------------------------------------------------------------------------
| EDITAR UNIDADE
|--------------------------------------------------------------------------
*/

router.put(
  '/:id',
  permitirPerfis(
    'ADMINISTRADOR',
    'CEO'
  ),
  (req, res) => {
  const id = Number(req.params.id);

  if (!id) {
    return res.status(400).json({
      sucesso: false,
      erro: 'ID da unidade inválido',
    });
  }

  const {
    nome,
    codigo,
    tipo,
    cnpj,
    endereco,
    numero,
    complemento,
    bairro,
    cidade,
    estado,
    cep,
    telefone,
  } = req.body;

  if (!String(nome || '').trim()) {
    return res.status(400).json({
      sucesso: false,
      erro: 'Nome da unidade é obrigatório',
    });
  }

  const tipoLoja =
    tipo === 'MATRIZ'
      ? 'MATRIZ'
      : 'FILIAL';

  db.run(
    `
      UPDATE lojas

      SET
        nome = ?,
        codigo = ?,
        tipo = ?,
        cnpj = ?,
        endereco = ?,
        numero = ?,
        complemento = ?,
        bairro = ?,
        cidade = ?,
        estado = ?,
        cep = ?,
        telefone = ?,
        atualizado_em = CURRENT_TIMESTAMP

      WHERE id = ?
        AND ativo = 1
    `,
    [
      String(nome).trim(),
      codigo || '',
      tipoLoja,
      cnpj || '',
      endereco || '',
      numero || '',
      complemento || '',
      bairro || '',
      cidade || '',
      estado || '',
      cep || '',
      telefone || '',
      id,
    ],
    function (erro) {
      if (erro) {
        console.error(
          'Erro ao editar unidade:',
          erro
        );

        return res.status(500).json({
          sucesso: false,
          erro: 'Erro ao editar unidade',
        });
      }

      if (this.changes === 0) {
        return res.status(404).json({
          sucesso: false,
          erro: 'Unidade não encontrada',
        });
      }

      return res.json({
        sucesso: true,
        mensagem:
          'Unidade atualizada com sucesso',
      });
    }
  );
});

/*
|--------------------------------------------------------------------------
| DESATIVAR UNIDADE
|--------------------------------------------------------------------------
|
| Não apagamos fisicamente a unidade.
| Isso será importante para preservar movimentações futuras.
|
*/

router.delete(
  '/:id',
  permitirPerfis(
    'ADMINISTRADOR',
    'CEO'
  ),
  (req, res) => {
  const id = Number(req.params.id);

  if (!id) {
    return res.status(400).json({
      sucesso: false,
      erro: 'ID da unidade inválido',
    });
  }

  db.run(
    `
      UPDATE lojas
      SET
        ativo = 0,
        atualizado_em = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    [id],
    function (erro) {
      if (erro) {
        console.error(
          'Erro ao desativar unidade:',
          erro
        );

        return res.status(500).json({
          sucesso: false,
          erro: 'Erro ao desativar unidade',
        });
      }

      if (this.changes === 0) {
        return res.status(404).json({
          sucesso: false,
          erro: 'Unidade não encontrada',
        });
      }

      /*
       * Desativamos também os locais,
       * sem apagá-los do histórico.
       */

      db.run(
        `
          UPDATE locais_estoque
          SET
            ativo = 0,
            atualizado_em = CURRENT_TIMESTAMP
          WHERE loja_id = ?
        `,
        [id]
      );

      return res.json({
        sucesso: true,
        mensagem:
          'Unidade desativada com sucesso',
      });
    }
  );
});

export default router;