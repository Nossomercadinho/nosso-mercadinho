# Nosso Mercadinho

Código atual preparado para publicação em repositório privado.

Inclui backend e frontend. Banco local, arquivos .env, scripts administrativos com credenciais, cópias antigas e histórico Git foram excluídos.

Esta cópia ainda precisa de configuração de produção e hospedagem. O banco de dados atual deve ser transferido separadamente, com backup consistente. Não use este pacote para substituir a instalação local ou apagar seus dados.

Frontend: instalar dependências e executar npm run dev para desenvolvimento ou npm run build para gerar a versão de produção.

Backend: configurar JWT_SECRET no ambiente. A aplicação usa SQLite em src/database/nosso-mercadinho.db. O servidor de produção e armazenamento persistente ainda precisam ser configurados.
