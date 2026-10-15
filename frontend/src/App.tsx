import {
  useEffect,
  useState,
} from 'react';

import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import { LojaProvider } from './contexts/LojaContext';

const API =
  '/api';

function App() {
  const [logado, setLogado] =
    useState(false);

  const [
    verificandoSessao,
    setVerificandoSessao,
  ] = useState(true);

  const rotaPdv =
    window.location.pathname
      .replace(/\/+$/, '')
      .toLowerCase() === '/pdv';

  useEffect(() => {
    verificarSessao();
  }, []);

  async function verificarSessao() {
    const token =
      localStorage.getItem('token');

    const usuario =
      localStorage.getItem(
        'usuarioLogado'
      );

    if (!token || !usuario) {
      limparSessao();
      setVerificandoSessao(false);
      return;
    }

    try {
      const response = await fetch(
        `${API}/auth/me`,
        {
          headers: {
            Authorization:
              `Bearer ${token}`,
          },
        }
      );

      const data =
        await response.json();

      if (
        !response.ok ||
        !data.sucesso ||
        !data.usuario
      ) {
        limparSessao();
        setLogado(false);
        return;
      }

      localStorage.setItem(
        'usuarioLogado',
        JSON.stringify(
          data.usuario
        )
      );

      setLogado(true);
    } catch (error) {
      console.error(
        'Erro ao validar sessão:',
        error
      );

      setLogado(false);
    } finally {
      setVerificandoSessao(false);
    }
  }

  function limparSessao() {
    localStorage.removeItem('nm-loja-ativa');
    localStorage.removeItem(
      'usuarioLogado'
    );

    localStorage.removeItem(
      'token'
    );
  }

  function fazerLogout() {
    limparSessao();
    setLogado(false);
  }

  function loginConcluido() {
    setLogado(true);
  }

  if (verificandoSessao) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent:
            'center',
          fontFamily:
            'Arial, sans-serif',
        }}
      >
        Verificando sessão...
      </div>
    );
  }

  if (logado) {
    return (
      <LojaProvider><Dashboard onLogout={fazerLogout} modoPdvDireto={rotaPdv} /></LojaProvider>
    );
  }

  return (
    <Login
      onLogin={
        loginConcluido
      }
    />
  );
}

export default App;
