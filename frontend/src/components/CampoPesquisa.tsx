import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

type OpcaoPesquisa = {
  value: string;
  label: string;
  secondary?: string;
};

type Props = {
  value: string;
  options: OpcaoPesquisa[];
  placeholder?: string;
  mensagemVazia?: string;
  permitirTextoLivre?: boolean;
  onSelect: (
    value: string,
    label: string
  ) => void;
  onTextChange?: (
    value: string
  ) => void;
};

function normalizar(
  valor: string
) {
  return String(valor || '')
    .normalize('NFD')
    .replace(
      /[\u0300-\u036f]/g,
      ''
    )
    .toLocaleLowerCase(
      'pt-BR'
    )
    .trim();
}

export default function CampoPesquisa({
  value,
  options,
  placeholder =
    'Digite para pesquisar',
  mensagemVazia =
    'Nenhum resultado encontrado.',
  permitirTextoLivre = false,
  onSelect,
  onTextChange,
}: Props) {
  const [texto, setTexto] =
    useState('');

  const [aberto, setAberto] =
    useState(false);

  const containerRef =
    useRef<HTMLDivElement>(
      null
    );

  useEffect(() => {
    if (permitirTextoLivre) {
      setTexto(value || '');
      return;
    }

    const selecionada =
      options.find(
        (opcao) =>
          opcao.value === value
      );

    setTexto(
      selecionada?.label || ''
    );
  }, [
    value,
    options,
    permitirTextoLivre,
  ]);

  useEffect(() => {
    function fecharAoClicarFora(
      evento: MouseEvent
    ) {
      if (
        containerRef.current &&
        !containerRef.current.contains(
          evento.target as Node
        )
      ) {
        setAberto(false);
      }
    }

    document.addEventListener(
      'mousedown',
      fecharAoClicarFora
    );

    return () => {
      document.removeEventListener(
        'mousedown',
        fecharAoClicarFora
      );
    };
  }, []);

  const filtradas =
    useMemo(() => {
      const busca =
        normalizar(texto);

      if (!busca) {
        return options.slice(
          0,
          12
        );
      }

      return options
        .filter((opcao) => {
          const principal =
            normalizar(
              opcao.label
            );

          const secundario =
            normalizar(
              opcao.secondary ||
              ''
            );

          return (
            principal.includes(
              busca
            ) ||
            secundario.includes(
              busca
            )
          );
        })
        .sort((a, b) => {
          const aComeca =
            normalizar(
              a.label
            ).startsWith(busca)
              ? 0
              : 1;

          const bComeca =
            normalizar(
              b.label
            ).startsWith(busca)
              ? 0
              : 1;

          if (
            aComeca !==
            bComeca
          ) {
            return (
              aComeca -
              bComeca
            );
          }

          return a.label.localeCompare(
            b.label,
            'pt-BR'
          );
        })
        .slice(
          0,
          12
        );
    }, [texto, options]);

  function selecionar(
    opcao: OpcaoPesquisa
  ) {
    setTexto(
      opcao.label
    );

    setAberto(false);

    onSelect(
      opcao.value,
      opcao.label
    );
  }

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        zIndex: aberto
          ? 80
          : 'auto',
      }}
    >
      <input
        type="text"
        autoComplete="off"
        value={texto}
        placeholder={
          placeholder
        }
        onFocus={() =>
          setAberto(true)
        }
        onChange={(evento) => {
          const novoTexto =
            evento.target.value;

          setTexto(
            novoTexto
          );

          setAberto(true);

          if (
            permitirTextoLivre
          ) {
            onTextChange?.(
              novoTexto
            );
          }
        }}
        onKeyDown={(evento) => {
          if (
            evento.key ===
              'Enter' &&
            aberto &&
            filtradas.length >
              0
          ) {
            evento.preventDefault();

            selecionar(
              filtradas[0]
            );
          }

          if (
            evento.key ===
            'Escape'
          ) {
            setAberto(false);
          }
        }}
      />

      {aberto && (
        <div
          style={{
            position:
              'absolute',
            top:
              'calc(100% + 6px)',
            left: 0,
            right: 0,
            zIndex: 99999,
            maxHeight: 280,
            overflowY: 'auto',
            background:
              '#ffffff',
            border:
              '1px solid #dedede',
            borderRadius: 10,
            boxShadow:
              '0 12px 30px rgba(0,0,0,.15)',
            padding: 6,
          }}
        >
          {filtradas.length ===
          0 ? (
            <div
              style={{
                padding:
                  '10px 12px',
                color:
                  '#777777',
                fontSize: 12,
              }}
            >
              {mensagemVazia}
            </div>
          ) : (
            filtradas.map(
              (opcao) => (
                <button
                  type="button"
                  key={
                    opcao.value
                  }
                  onMouseDown={(
                    evento
                  ) => {
                    evento.preventDefault();

                    selecionar(
                      opcao
                    );
                  }}
                  style={{
                    width:
                      '100%',
                    display:
                      'flex',
                    flexDirection:
                      'column',
                    alignItems:
                      'flex-start',
                    gap: 2,
                    padding:
                      '10px 12px',
                    border: 0,
                    borderRadius: 8,
                    background:
                      '#ffffff',
                    cursor:
                      'pointer',
                    textAlign:
                      'left',
                  }}
                  onMouseEnter={(
                    evento
                  ) => {
                    evento.currentTarget.style.background =
                      '#fff4ea';
                  }}
                  onMouseLeave={(
                    evento
                  ) => {
                    evento.currentTarget.style.background =
                      '#ffffff';
                  }}
                >
                  <strong
                    style={{
                      fontSize:
                        12,
                    }}
                  >
                    {opcao.label}
                  </strong>

                  {opcao.secondary && (
                    <small
                      style={{
                        color:
                          '#777777',
                      }}
                    >
                      {
                        opcao.secondary
                      }
                    </small>
                  )}
                </button>
              )
            )
          )}
        </div>
      )}
    </div>
  );
}
