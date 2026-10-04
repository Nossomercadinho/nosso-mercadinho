import { useState } from 'react';
import logo from '../assets/logo.png';

type LoginProps = {
  onLogin: () => void;
};

type UsuarioLogado = {
  id: number;
  nome: string;
  email: string;
  perfil: string;
};

const API = '/api';

export default function Login({
  onLogin,
}: LoginProps) {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] =
    useState(false);

  async function handleSubmit(
    event: React.FormEvent
  ) {
    event.preventDefault();

    setErro('');

    const emailDigitado = email
      .trim()
      .toLowerCase();

    const senhaDigitada = senha.trim();

    if (!emailDigitado || !senhaDigitada) {
      setErro(
        'Informe o e-mail e a senha.'
      );

      return;
    }

    try {
      setCarregando(true);

      const response = await fetch(
        `${API}/auth/login`,
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json',
          },

          body: JSON.stringify({
            email: emailDigitado,
            senha: senhaDigitada,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.sucesso) {
        setErro(
          data.erro ||
            'E-mail ou senha inválidos.'
        );

        return;
      }

      const usuario: UsuarioLogado =
  data.usuario;

if (!data.token) {
  setErro(
    'O servidor não retornou o token de acesso.'
  );

  return;
}

localStorage.setItem(
  'usuarioLogado',
  JSON.stringify(usuario)
);

localStorage.setItem(
  'token',
  data.token
);

onLogin();
    } catch (error) {
      console.error(
        'Erro no login:',
        error
      );

      setErro(
        'Não foi possível conectar ao sistema.'
      );
    } finally {
      setCarregando(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <img
          src={logo}
          alt="Nosso Mercadinho"
          style={{
            width: '320px',
            maxWidth: '320px',
            height: 'auto',
            objectFit: 'contain',
          }}
        />

        <h1>Nosso Mercadinho</h1>

        <p className="login-subtitle">
          Acesse o painel administrativo
        </p>

        <form onSubmit={handleSubmit}>
          {erro && (
            <div
              className="produto-mensagem-geral"
              style={{
                marginBottom: '15px',
              }}
            >
              {erro}
            </div>
          )}

          <div className="form-group">
            <label htmlFor="email">
              E-mail
            </label>

            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) =>
                setEmail(
                  event.target.value
                )
              }
              placeholder="Digite seu e-mail"
              autoComplete="email"
              disabled={carregando}
            />
          </div>

          <div className="form-group">
            <label htmlFor="senha">
              Senha
            </label>

            <input
              id="senha"
              type="password"
              value={senha}
              onChange={(event) =>
                setSenha(
                  event.target.value
                )
              }
              placeholder="Digite sua senha"
              autoComplete="current-password"
              disabled={carregando}
            />
          </div>

          <button
            type="submit"
            className="login-button"
            disabled={carregando}
          >
            {carregando
              ? 'Entrando...'
              : 'Entrar'}
          </button>
        </form>
      </section>
    </main>
  );
}