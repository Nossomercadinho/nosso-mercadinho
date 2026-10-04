import { useEffect, useState } from 'react';
import './IdentificarExecutor.css';

const API = '/api';

export type ExecutorIdentificado = {
  id: number;
  codigo: string;
  nome: string;
};

type Props = {
  aberto: boolean;
  titulo?: string;
  onCancelar: () => void;
  onConfirmar: (executor: ExecutorIdentificado) => void;
};

export default function IdentificarExecutor({
  aberto,
  titulo = 'Identificação do executor',
  onCancelar,
  onConfirmar,
}: Props) {
  const [codigo, setCodigo] = useState('');
  const [executor, setExecutor] =
    useState<ExecutorIdentificado | null>(null);

  const [erro, setErro] = useState('');
  const [consultando, setConsultando] = useState(false);

  useEffect(() => {
    if (aberto) {
      setCodigo('');
      setExecutor(null);
      setErro('');
    }
  }, [aberto]);

  if (!aberto) {
    return null;
  }

  async function identificarExecutor() {
    const codigoDigitado = codigo.trim();

    setErro('');
    setExecutor(null);

    if (!codigoDigitado) {
      setErro('Informe o ID do executor.');
      return;
    }

    try {
      setConsultando(true);

      const response = await fetch(
        `${API}/executores/codigo/${encodeURIComponent(
          codigoDigitado
        )}`
      );

      const data = await response.json();

      if (!response.ok || !data.sucesso) {
        setErro(
          data.erro ||
            'Executor não encontrado ou inativo.'
        );
        return;
      }

      setExecutor(data.executor);
    } catch (error) {
      console.error(
        'Erro ao identificar executor:',
        error
      );

      setErro(
        'Não foi possível consultar o executor.'
      );
    } finally {
      setConsultando(false);
    }
  }

  function confirmar() {
    if (!executor) {
      setErro(
        'Identifique o executor antes de confirmar.'
      );
      return;
    }

    onConfirmar(executor);
  }

  function tratarEnter(
    event: React.KeyboardEvent<HTMLInputElement>
  ) {
    if (event.key === 'Enter') {
      event.preventDefault();

      if (executor) {
        confirmar();
      } else {
        identificarExecutor();
      }
    }
  }

  return (
    <div className="executor-overlay">
      <div className="executor-modal">
        <h2>{titulo}</h2>

        <p className="executor-texto">
          Informe seu ID para registrar quem está
          executando esta operação.
        </p>

        <label className="executor-label">
          ID DO EXECUTOR
        </label>

        <div className="executor-campo-linha">
          <input
            type="text"
            inputMode="numeric"
            maxLength={4}
            autoFocus
            value={codigo}
            placeholder="Ex.: 03"
            onChange={(event) => {
              setCodigo(event.target.value);
              setExecutor(null);
              setErro('');
            }}
            onKeyDown={tratarEnter}
            className="executor-input"
          />

          <button
            type="button"
            onClick={identificarExecutor}
            disabled={consultando}
            className="executor-btn-identificar"
          >
            {consultando
              ? 'Consultando...'
              : 'Identificar'}
          </button>
        </div>

        {executor && (
          <div className="executor-identificado">
            <span className="executor-check">
              ✓
            </span>

            <div>
              <strong>{executor.nome}</strong>

              <div>
                Executor {executor.codigo}
              </div>
            </div>
          </div>
        )}

        {erro && (
          <div className="executor-erro">
            {erro}
          </div>
        )}

        <div className="executor-acoes">
          <button
            type="button"
            onClick={onCancelar}
            className="executor-btn-cancelar"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={confirmar}
            disabled={!executor}
            className="executor-btn-confirmar"
          >
            Confirmar operação
          </button>
        </div>
      </div>
    </div>
  );
}