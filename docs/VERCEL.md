# Publicação com Vercel Services

O repositório está configurado para publicar **dois serviços em um único projeto e domínio**. Cada pasta instala suas dependências e executa seu próprio build. O banco continua no Supabase.

| Serviço | Pasta | Framework | Endereços públicos |
| --- | --- | --- | --- |
| `backend` | `backend` | Express | `/api` e `/api/*` |
| `frontend` | `frontend` | Vite | `/` e os demais caminhos, incluindo `/pdv` |

Os nomes dos serviços e os caminhos públicos acima foram confirmados pelo responsável e estão definidos no `vercel.json`. A publicação será feita pelo painel da Vercel; commit e push não comprovam que um novo deploy já esteja disponível.

## Roteamento e bindings

As regras da raiz encaminham primeiro `/api` e `/api/(.*)` ao serviço `backend`; o catch-all `/(.*)` vem por último e encaminha ao `frontend`. A URL e a query são preservadas: o Express continua recebendo `/api/produtos`, por exemplo. O frontend mantém o fallback para abrir rotas da SPA diretamente. No pacote de produção, arquivos públicos existentes são servidos normalmente e assets inexistentes em `/assets/` retornam 404.

Não há bindings de serviço. O frontend é um conjunto de arquivos estáticos: o JavaScript executado no navegador chama `/api` no mesmo domínio. Não existe função do frontend chamando o backend, nem outro serviço interno chamado pela API. O PostgreSQL é acessado pela conexão privada `DATABASE_URL`, não por um binding de Vercel Services.

Ambos os serviços recebem tráfego público pelas regras acima. Nenhum serviço adicional foi criado para permanecer interno. As rotas de negócio continuam exigindo autenticação e autorização no Express.

## Configuração do projeto

Importe o repositório pela **raiz (`.`)** e mantenha o `vercel.json` nessa pasta. Remova overrides antigos de instalação, build e output no painel do projeto; agora essas opções pertencem a cada serviço. Não selecione apenas `backend` ou `frontend` como Root Directory.

| Opção | Backend | Frontend |
| --- | --- | --- |
| Node.js | 22.x | 22.x |
| Install Command | `npm ci --include=dev` | `npm ci --include=dev` |
| Build Command | `npm run build` | `npm run build` |
| Entrypoint | `vercel.js` | Definido pelo Vite |
| Output Directory | `.` | `dist` |

Os comandos de instalação incluem as ferramentas de build mesmo com `NODE_ENV=production`. O build compila o backend, copia os arquivos de runtime e gera a interface. Não executa migrations, importação SQLite ou seed no Supabase.

No backend, `outputDirectory: "."` mantém `vercel.js` como entrypoint depois da compilação. Sem essa definição, a detecção automática pode escolher `dist/app.js` e ignorar o gateway que valida a configuração e organiza as requisições. Os assets de `backend/dist` são incluídos explicitamente na função.

Em **Settings → Environment Variables**, configure estas seis variáveis para **Production**:

| Variável | Conteúdo |
| --- | --- |
| `NODE_ENV` | `production` |
| `DB_CLIENT` | `postgres` |
| `DATABASE_URL` | Conexão privada do papel da API pelo Transaction pooler do Supabase, porta 6543 |
| `JWT_SECRET` | Segredo privado do login da aplicação |
| `PG_SSL` | `require` |
| `PG_SSL_CA` | PEM completo da CA; aceita múltiplas linhas ou `\n` literais |

O arquivo privado `.local/vercel-backend.env` contém os valores preparados para importar no painel e fica fora do Git e do upload. `PG_SSL_CA` evita depender do caminho de um certificado neste computador. O frontend não precisa de variáveis `VITE_*`; não crie versões públicas dos segredos do banco ou do JWT. O token geral e as chaves do Supabase não são necessários nesse deploy.

As variáveis do projeto são compartilhadas entre os serviços, mas esses valores são lidos pela API e não são inseridos nos arquivos estáticos do frontend. Para Preview, use credenciais e banco de homologação quando o deploy puder gravar dados. Sem a configuração privada exigida, o gateway responde 503 antes de carregar a aplicação e abrir um banco local.

Depois de enviar as alterações ao repositório conectado, atualize a configuração dos serviços na tela de importação da Vercel (botão **Refresh services configuration**), configure as variáveis de Production e faça o deploy pela raiz. A instalação deve ocorrer na Vercel para obter as dependências nativas de Linux. Os usuários e o seed existentes não precisam ser recriados.

## Execução e proteção dos dados

O entrypoint `backend/vercel.js` exporta uma aplicação Express sem abrir porta. O gateway aguarda a inicialização do backend antes de atender e preserva a URL completa. `npm start` e `npm run dev` da pasta `backend` continuam disponíveis para o servidor local.

O gateway usa `createRequire(__filename)` para carregar `./dist/app.js` sob demanda. Assim, a aplicação compilada mantém o carregamento normal do Node.js, e o empacotador preserva o gateway como ponto de entrada. O tracing de arquivos (NFT) inclui os módulos e assets necessários; os padrões de exclusão abrangem os caminhos de `.env`, bancos locais, `database/sqlite.*` e `node_modules/sqlite3` dentro do pacote. Não substitua esse carregamento por um import antecipado sem validar novamente o bundle e a resposta com configuração ausente.

Fluid fica desabilitado e o gateway processa uma requisição por vez em cada instância porque o adaptador atual mantém contexto transacional por processo. O PostgreSQL também utiliza um advisory lock transacional para coordenar diferentes instâncias. A região configurada é `pdx1` e a função tem duração máxima de 60 segundos.

O contrato do banco e a tabela NCM são incluídos na função a partir de `dist/schema-contract.json` e `dist/database/ncm/ncm.json` do serviço backend. Seus caminhos de leitura independem do diretório atual.

`.vercelignore` e as exclusões da função retiram `.local`, `.env`, backups, logs e bancos SQLite do upload e do pacote. O adaptador SQLite e sua dependência nativa também são excluídos da função. Somente `frontend/dist` produz o conteúdo público estático. Respostas da API usam `Cache-Control: private, no-store`; erros de inicialização retornam uma mensagem genérica, sem detalhes de conexão.

## Verificação

Para conferir o código e os artefatos locais:

```powershell
npm ci --include=dev --prefix backend
npm ci --include=dev --prefix frontend
npm run build
npm test
npm run check:deployment
```

Para testar os serviços e os rewrites juntos, use o Vercel CLI:

```powershell
npx vercel@64.7.0 dev -L
```

`-L` inicia o ambiente local sem vincular um projeto remoto. Para testar o banco, disponibilize as seis variáveis privadas na sessão do terminal. Não são necessárias credenciais para conferir que a API responde 503 de forma controlada quando a configuração está ausente.

O servidor de desenvolvimento do Vite tem seu próprio fallback e pode responder HTML para um asset inexistente. A verificação do 404 de assets deve ser feita no bundle de produção e no domínio publicado.

Depois de gerar um build com o Vercel CLI, execute:

```powershell
npm run check:deployment -- --bundle .vercel/output
```

Esse comando inspeciona o Build Output de Services: `services/backend/functions`, `services/frontend/static`, os manifests e os rewrites entre serviços. Também verifica Node.js 22, os arquivos exigidos em runtime, a ausência de arquivos privados e dependências de desenvolvimento na função, e a ausência de segredos no frontend compilado. O bundle de publicação deve ser gerado em ambiente Linux compatível com a Vercel.

O build real de Services foi conferido com Vercel CLI 64.7.0 e Node.js 22 em Linux: 414 arquivos na função e sete arquivos estáticos. O verificador aprovou o gateway, os assets, os rewrites e as exclusões. A função empacotada passou 13 verificações contra o Supabase, incluindo autenticação, permissões e consultas, e respondeu 503 sem carregar o banco quando as variáveis privadas estavam ausentes. O desenvolvimento integrado também serviu `/`, `/pdv`, a API, os ícones, o manifesto e os módulos JavaScript com os tipos corretos.

A suíte completa em Linux passou com 73 testes aprovados e três integrações PostgreSQL opcionais puladas. Os testes de caixa, instalação nova e loja ativa agora exigem confirmação de API pronta antes de preparar seus dados temporários, evitando falhas por consultas durante a inicialização.

O estado de produção só fica confirmado após o deploy. No domínio final, confira:

| Endereço ou operação | Resultado esperado |
| --- | --- |
| `/` e `/pdv` | Interface HTML |
| `/api` | JSON com `sucesso: true` e banco disponível |
| `/api/produtos`, sem token | 401 |
| `/api/auth/login`, com acesso válido | 200 e token de sessão |
| API inexistente | 404 em JSON |
| Asset inexistente em `/assets/` | 404 |

O domínio informado para o projeto é `https://nosso-mercadinho-api.vercel.app`. A configuração local não altera esse domínio nem comprova que a nova versão já esteja publicada.

## Limites de operação

A função está configurada para até 60 segundos. A Vercel limita corpos de requisição e resposta de Functions a 4,5 MB, inclusive XMLs enviados à API; arquivos maiores exigem um fluxo de upload próprio. Consulte os [limites de Functions](https://vercel.com/docs/functions/limitations).

A auditoria npm das dependências de produção não encontrou vulnerabilidades reportadas no backend nem no frontend. A auditoria completa ainda aponta três alertas altos na cadeia de desenvolvimento `ts-node-dev → chokidar → braces`, sem correção compatível. Essa cadeia fica fora do pacote da função.

Referências: [Vercel Services](https://vercel.com/docs/services), [configuração Vercel](https://vercel.com/docs/project-configuration/vercel-json), [Express na Vercel](https://vercel.com/docs/frameworks/backend/express), [conexões Supabase para serverless](https://supabase.com/docs/guides/database/connecting-to-postgres/serverless-drivers).
