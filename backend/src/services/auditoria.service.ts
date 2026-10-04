import db from '../database/database';

export type ExecutorValidado = {
  id: number;
  codigo: string;
  nome: string;
};

type RegistrarAuditoriaPayload = {
  executorId: number;
  usuarioSessaoId?: number | null;

  modulo: string;
  acao: string;

  entidade?: string | null;
  entidadeId?: number | null;

  descricao?: string | null;
};

function executarGet<T = any>(
  sql: string,
  parametros: any[] = []
): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    db.get(
      sql,
      parametros,
      (erro, resultado) => {
        if (erro) {
          reject(erro);
          return;
        }

        resolve(
          resultado as T | undefined
        );
      }
    );
  });
}

function executarRun(
  sql: string,
  parametros: any[] = []
): Promise<{
  lastID: number;
  changes: number;
}> {
  return new Promise((resolve, reject) => {
    db.run(
      sql,
      parametros,
      function (erro) {
        if (erro) {
          reject(erro);
          return;
        }

        resolve({
          lastID: this.lastID,
          changes: this.changes,
        });
      }
    );
  });
}

/*
|--------------------------------------------------------------------------
| VALIDAR EXECUTOR
|--------------------------------------------------------------------------
*/

export async function validarExecutor(
  codigo?: string | null
): Promise<ExecutorValidado> {
  const codigoLimpo =
    String(codigo || '').trim();

  if (!codigoLimpo) {
    throw new Error(
      'Informe o ID do executor.'
    );
  }

  const executor =
    await executarGet<any>(
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
      [codigoLimpo]
    );

  if (!executor) {
    throw new Error(
      'Executor não encontrado.'
    );
  }

  if (
    Number(executor.ativo) !== 1
  ) {
    throw new Error(
      'Executor inativo.'
    );
  }

  return {
    id: Number(executor.id),
    codigo: String(
      executor.codigo
    ),
    nome: String(
      executor.nome
    ),
  };
}

/*
|--------------------------------------------------------------------------
| REGISTRAR AUDITORIA
|--------------------------------------------------------------------------
*/

export async function registrarAuditoria(
  dados: RegistrarAuditoriaPayload
) {
  if (!dados.executorId) {
    throw new Error(
      'Executor obrigatório para registrar a operação.'
    );
  }

  if (
    !String(dados.modulo || '').trim()
  ) {
    throw new Error(
      'Módulo da auditoria não informado.'
    );
  }

  if (
    !String(dados.acao || '').trim()
  ) {
    throw new Error(
      'Ação da auditoria não informada.'
    );
  }

  const resultado =
    await executarRun(
      `
        INSERT INTO auditoria_operacoes (
          executor_id,
          usuario_sessao_id,
          modulo,
          acao,
          entidade,
          entidade_id,
          descricao
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        dados.executorId,

        dados.usuarioSessaoId ||
          null,

        String(
          dados.modulo
        ).trim(),

        String(
          dados.acao
        ).trim(),

        dados.entidade
          ? String(
              dados.entidade
            ).trim()
          : null,

        dados.entidadeId ||
          null,

        dados.descricao
          ? String(
              dados.descricao
            ).trim()
          : null,
      ]
    );

  return resultado.lastID;
}

/*
|--------------------------------------------------------------------------
| VALIDAR + REGISTRAR
|--------------------------------------------------------------------------
*/

export async function validarERegistrarAuditoria(
  codigoExecutor:
    string | null | undefined,

  dados: Omit<
    RegistrarAuditoriaPayload,
    'executorId'
  >
) {
  const executor =
    await validarExecutor(
      codigoExecutor
    );

  const auditoriaId =
    await registrarAuditoria({
      ...dados,
      executorId:
        executor.id,
    });

  return {
    auditoriaId,
    executor,
  };
}