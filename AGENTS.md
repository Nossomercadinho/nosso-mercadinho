# Guia para agentes — Nosso Mercadinho

Este arquivo é o ponto de entrada para continuar o projeto. Descreve a configuração de referência em **20/10/2026** e os padrões que devem ser preservados nas próximas alterações. Confira o código e o ambiente de destino antes de executar operações; os números e acessos descritos abaixo não substituem uma consulta ao estado atual.

## 1. Estado do projeto e fontes de referência

- Repositório: `https://github.com/Nossomercadinho/nosso-mercadinho`.
- Branch de publicação utilizada: `main`.
- Domínio de produção informado e validado: `https://nosso-mercadinho-33tb.vercel.app/`.
- API no mesmo domínio: `https://nosso-mercadinho-33tb.vercel.app/api`.
- Supabase: projeto `MainDatabase`, referência `mnepfveqnyuweoqkecnn`, região `us-west-2`.
- A migração do SQLite para o Supabase **já foi realizada**. O banco remoto contém dados e usuários reais. Não tratar esta instalação como um banco novo.
- As credenciais não estão neste guia nem devem ser versionadas. Não recriar usuários, redefinir senhas ou reaplicar dados iniciais para fazer o sistema iniciar.

Leia conforme a tarefa:

| Arquivo | Responsabilidade |
| --- | --- |
| `README.md` | Visão geral, desenvolvimento e operação |
| `vercel.json` | Configuração efetiva dos serviços e das rotas públicas |
| `docs/VERCEL.md` | Publicação, empacotamento e verificação da Vercel |
| `docs/SUPABASE.md` | Histórico da migração, conexão, backup e preparação de novos ambientes |
| `supabase/README.md` | Contrato PostgreSQL e proteção das tabelas |
| `backend/.env.example` | Exemplo sem credenciais para o ambiente local |

`docs/PROMPT-SUPABASE.txt` é o roteiro do corte para o Supabase já executado. Sua existência não significa que a migração de produção esteja pendente. O estado local de 19/10 descrito em `docs/SUPABASE.md` é histórico; diferencie a conexão local daquela usada na Vercel.

## 2. Arquitetura e caminhos importantes

```text
Navegador
  -> domínio Vercel
     /, /pdv, arquivos públicos -> frontend React/Vite estático
     /api e /api/*             -> backend Express -> PostgreSQL/Supabase
```

O frontend chama URLs relativas `/api`. Não usa Supabase Auth nem consulta tabelas pela Data API. O backend mantém o login, a autorização, o escopo por loja e as regras de negócio.

| Caminho | O que fica aqui |
| --- | --- |
| `frontend/src/App.tsx` | Login, sessão e entrada pela rota `/pdv` |
| `frontend/src/pages/Dashboard.tsx` | Módulos disponíveis, navegação e entrada direta no PDV |
| `frontend/src/pages/PDV.tsx` | Frente de caixa e venda |
| `frontend/src/components/CaixaLifecycle.tsx` | Abertura e fechamento do expediente |
| `frontend/src/contexts/LojaContext.tsx` | Loja ativa e mercados autorizados |
| `frontend/src/services/apiClient.ts` | Requisições, token e cabeçalho de loja ativa |
| `backend/src/app.ts` | Aplicação Express, rotas e inicialização |
| `backend/src/routes/` e `backend/src/services/` | Endpoints e regras de negócio |
| `backend/src/middleware/auth.middleware.ts` | Autenticação, autorização por módulo e escopo |
| `backend/src/services/acessos.service.ts` | Papéis, permissões e vínculos entre usuários e lojas |
| `backend/src/database/` | Adaptadores SQLite e PostgreSQL e tradução de SQL |
| `backend/vercel.js` e `backend/serverless/handler.cjs` | Gateway serverless |
| `supabase/migrations/` e `supabase/schema-contract.json` | Evolução e contrato do banco |
| `backend/tests/`, `tests/` e `scripts/check-deployment.cjs` | Testes e verificação do pacote |

## 3. Como a Vercel está configurada

É **um projeto importado pela raiz do repositório**, com dois serviços. Não configurar Root Directory como `frontend` ou `backend`, nem substituir esse desenho por dois projetos independentes como ajuste rotineiro.

| Configuração | `backend` | `frontend` |
| --- | --- | --- |
| Pasta | `backend` | `frontend` |
| Framework | Express | Vite |
| Node.js | `22.x` | `22.x` |
| Instalação | `npm ci --include=dev` | `npm ci --include=dev` |
| Build | `npm run build` | `npm run build` |
| Entrypoint | `vercel.js` | Gerado pelo Vite |
| Output | `.` | `dist` |

Os rewrites públicos da raiz são, nesta ordem:

1. `/api` para o serviço `backend`.
2. `/api/(.*)` para o serviço `backend`.
3. `/(.*)` para o serviço `frontend`.

O Express recebe o prefixo `/api` e a query originais. Não remover esse prefixo no encaminhamento. O fallback da SPA pertence ao frontend: deve abrir `/pdv`, servir os arquivos existentes e deixar assets inexistentes em `/assets/` responderem 404.

**Não há bindings internos.** As chamadas saem do navegador para `/api` no mesmo domínio; não existe uma função do frontend chamando outro serviço. `DATABASE_URL` é uma conexão PostgreSQL privada e não um binding de Vercel Services. Se a arquitetura passar a ter chamadas entre funções de serviços distintos, revisar os bindings do serviço chamador nessa alteração.

Preservar os pontos de runtime:

- `backend/vercel.js` exporta Express sem abrir porta. Carrega `dist/app.js` sob demanda com `createRequire(__filename)`, depois da checagem da configuração privada.
- O handler espera a inicialização do banco e dos serviços antes de atender. Com configuração ausente, responde 503 sem carregar SQLite como alternativa.
- `fluid: false`, a fila de requisições do gateway, o pool PostgreSQL de uma conexão e o advisory lock transacional trabalham juntos. O adaptador mantém contexto transacional por processo; não aumentar concorrência ou retirar essas proteções como uma otimização isolada.
- Região da função: `pdx1`; duração máxima configurada: 60 segundos.
- `outputDirectory: "."` do backend mantém o gateway como entrypoint. Não deixar a detecção trocar esse ponto por `dist/app.js` sem validar novamente o bundle e a inicialização.
- O build do backend copia o contrato do banco e a tabela NCM para `dist/schema-contract.json` e `dist/database/ncm/ncm.json`. `includeFiles` os inclui na função. Não depender do diretório atual ou de arquivos deste computador em runtime.
- `.vercelignore` e `excludeFiles` retiram ambientes, `.local`, bancos, logs, o adaptador SQLite e a dependência `sqlite3` do pacote de produção. A parte pública estática é `frontend/dist`.
- Respostas da API usam `Cache-Control: private, no-store`. O acesso de produção ocorre no mesmo domínio; preserve as proteções e os erros genéricos do servidor.

As opções de instalação, build, output e função pertencem aos respectivos serviços no `vercel.json`. Evitar overrides antigos no painel que contrariem o arquivo. A Vercel deve instalar suas dependências Linux; não transportar `node_modules` do Windows para o deploy.

## 4. Variáveis de ambiente e credenciais

Em **Vercel → Settings → Environment Variables**, a configuração de Production utiliza:

| Variável | Valor ou origem |
| --- | --- |
| `NODE_ENV` | `production` |
| `DB_CLIENT` | `postgres` |
| `DATABASE_URL` | Conexão privada do papel `nosso_mercadinho_api` pelo **Transaction pooler**, porta **6543** |
| `JWT_SECRET` | Segredo privado existente do login da aplicação |
| `PG_SSL` | `require` |
| `PG_SSL_CA` | PEM completo da CA do Supabase; aceita múltiplas linhas ou `\n` literais |

Esses valores são usados pelo backend. O frontend atual não precisa de variáveis `VITE_*`. Nunca colocar conexão do banco, JWT, senha, token geral Supabase ou chave secreta em variável pública, código, documentação, testes ou logs. O access token geral e as chaves publicável/secreta da Data API **não são necessários para o runtime atual**.

Neste computador, `backend/.env` e `.local/vercel-backend.env`, quando presentes, guardam configurações privadas e estão ignorados. Eles não são transferidos pelo Git. Em outro ambiente, obter os valores pelo canal privado apropriado ou pela configuração da hospedagem; não inventar credenciais nem copiá-las para o guia.

Preservar o `JWT_SECRET` nas alterações normais; trocá-lo invalida sessões existentes. Uma troca deliberada de segredo precisa ser coordenada com a configuração dos ambientes. Após mudar variáveis na Vercel, publicar um novo deployment para aplicá-las. Para Preview com gravações, usar banco e credenciais de homologação.

## 5. Banco de dados e TLS

`backend/src/database/database.ts` seleciona o adaptador por `DB_CLIENT`. O padrão local é `sqlite`; **definir apenas `DATABASE_URL` não seleciona PostgreSQL**. Na produção, o gateway exige PostgreSQL explicitamente.

- Estrutura base: 38 tabelas em `public`, 431 colunas e 90 chaves estrangeiras. A migration de custo real `20261022000100` acrescenta quatro tabelas privadas; o contrato do código passa a 42 tabelas, 474 colunas e 104 chaves estrangeiras.
- Migrations iniciais: `20261015000100_schema_inicial.sql` e `20261015000200_backend_only.sql`, já aplicadas no projeto configurado.
- As 27 tabelas da estrutura anterior foram preservadas em `legacy_20261019`. Não apagar esse schema ou confundi-lo com as tabelas atuais.
- O papel da API é proprietário das tabelas da aplicação, sem SUPERUSER, CREATEDB, CREATEROLE ou BYPASSRLS e sem CREATE no schema. Não substituir a conexão por um administrador do banco como solução rotineira.
- RLS está habilitado; não há policies para o navegador. As tabelas e sequências têm privilégios revogados para `PUBLIC`, `anon`, `authenticated` e `service_role`.
- Novas tabelas precisam de RLS, privilégios revisados e acesso apropriado para o papel do backend. Privilégios padrão dependem do papel que cria os objetos; não presumir que a proteção de uma migration se aplica automaticamente a qualquer criador futuro.
- Produção Vercel usa Transaction pooler na porta 6543. O ambiente local documentado também pode usar Session pooler na porta 5432. Não trocar um pelo outro sem conferir o destino.
- TLS verifica certificado e hostname (`rejectUnauthorized: true`). `PG_SSL_CA` tem precedência sobre `PG_SSL_CA_FILE`; o segundo é uma alternativa local com arquivo existente no host. Um caminho Windows não funciona na Vercel.
- O adaptador remove a querystring da URI de conexão. Configurar TLS pelas variáveis próprias; não depender de `?sslmode=...` ou outros parâmetros da URL.
- `PG_SSL=disable` é aceito somente em PostgreSQL local, loopback, fora de produção. Não desabilitar a validação TLS para contornar erros do Supabase.

O adaptador PostgreSQL confere a existência das tabelas/colunas do contrato ao iniciar e recusa alterações estruturais pelo runtime. Essa checagem não valida todos os tipos, índices, relacionamentos ou privilégios; a segurança tem uma conferência específica em `supabase/tests/backend_only.sql`. Os comandos `CREATE/ALTER` usados na compatibilidade com SQLite não executam migrations remotas. O build também não aplica migration, seed ou importação.

### Quando alterar o schema

1. Criar uma **nova migration** ordenada por timestamp; preservar as migrations já aplicadas.
2. Atualizar `supabase/schema-contract.json` quando mudar tabelas/colunas e suas relações, mantendo a representação consumida pelo adaptador/exportador.
3. Manter a paridade com SQLite quando a funcionalidade existir nos dois adaptadores; revisar `sql-dialect.ts` e o SQL dos serviços se necessário.
4. Validar primeiro em banco descartável/homologação, incluindo chaves, índices, RLS, privilégios e preservação dos dados.
5. Conferir projeto, migration history e alterações pendentes antes de aplicar em produção. Planejar uma alteração compatível com a versão em execução antes de publicar o código dependente.

Datas, horas e JSON/XML permanecem em `TEXT`; flags usam inteiros `0/1`; valores e quantidades usam `NUMERIC`; IDs usam `BIGINT` com identidade que aceita importação dos IDs originais. Não mudar essas representações silenciosamente.

### Seed, usuários e backups

O seed técnico e os dados da instalação original já foram transferidos. O SQLite original, seus backups e o histórico do caixa foram preservados. Não reaplicar `seed.sql`, exportação ou `admin:criar` no banco existente, nem usar reset remoto, `DROP` ou `TRUNCATE` para contornar validações.

Somente em **instalação comprovadamente nova e vazia**: aplicar migrations, depois `supabase/seed.sql` e criar o primeiro administrador pelo backend compilado com `npm run admin:criar --prefix backend`. O comando recusa banco com usuários; solicita senha sem eco ou aceita `--password-stdin`. Não serve para recuperação de conta. O seed cria empresa, Matriz, Área de Venda, papéis e categorias, sem senha padrão nem operações fictícias. O seed automático está desativado em `supabase/config.toml`.

Novos usuários da instalação existente são gerenciados pelo fluxo **Usuários e papéis**. Para migração de outra origem, seguir `docs/SUPABASE.md`: backup consistente, exportação somente leitura, destino vazio, preservação de IDs/hashes e conferência das sequências. Dumps, exports e bancos são privados. Não copiar apenas um `.db` em uso com WAL como se fosse um backup completo; usar um mecanismo de backup consistente. Voltar ao SQLite antigo depois de novas gravações no Supabase exige reconciliação.

## 6. Login, permissões e Matriz

Login: `POST /api/auth/login`. Sessão: JWT Bearer com duração atual de 8 horas. Identidade: `GET /api/auth/me`. Mercados permitidos: `GET /api/auth/lojas`. Usuários ficam em `public.usuarios`, com hash bcrypt; não migrar esse fluxo para `auth.users` como parte de uma alteração comum.

A API consulta o usuário e suas permissões atuais em cada requisição. Menus escondidos não substituem autorização no servidor. Preserve os guards por módulo, os vínculos em `usuario_lojas` e o escopo da loja ativa (`X-Loja-Id`) nas rotas correspondentes. Alterar cabeçalho, hash ou estado local não pode ampliar acesso.

Configuração dos quatro acessos do cliente validada em 20/10/2026:

| Pessoa/acesso | Papel | Permissões | Lojas |
| --- | --- | --- | --- |
| Administrativo | Administrativo | Todos os 15 módulos atuais | Apenas Matriz |
| Marcos | CEO | Todos os 15 módulos atuais | Apenas Matriz |
| Natália | Financeiro | `financeiro`, `contas` | Apenas Matriz |
| Caio | Vendas - PDV | Somente `pdv` | Apenas Matriz |

Esses acessos pertencem à empresa principal, com Matriz `loja_id=1` e Área de Venda `local_id=1`; não têm acesso automático a todas as lojas. Usuários técnicos anteriores foram preservados. Não confundir os papéis personalizados do cliente com o papel técnico padrão Administrador, que pode ter abrangência diferente. Senhas são entregues e alteradas por canal privado; não registrá-las neste arquivo.

O comportamento exclusivo do PDV é determinado por **permissões**, sem hardcode de nome, e-mail ou ID:

- Usuário com somente `pdv` entra diretamente no PDV após o login, inclusive ao abrir hash antigo de outro módulo.
- O menu e o atalho do histórico exigem `caixas`: não aparecem para esse usuário. A API preserva o acesso do operador aos próprios expedientes necessário ao ciclo do caixa.
- A tela exclusiva oferece **Sair do sistema**. Logout limpa sessão e o hash do PDV; não deixar o operador preso em um botão que retorna à mesma tela.
- Administrativo/CEO mantêm gestão e histórico. Natália mantém Financeiro e Contas/Boletos.
- O PDV conclui vendas e baixa estoque; não é um módulo separado de pedido de venda. A abertura/fechamento do próprio caixa continua necessária. Não remover endpoints do ciclo do caixa só porque o link do histórico foi ocultado.
- Não revogar de um operador o acesso necessário para encerrar um caixa ainda aberto; preservar o vínculo entre operador, loja, local, venda e expediente no servidor.

Ao criar um módulo, revisar juntos o código da permissão, o mapa das rotas/guards, o escopo por loja, o menu e os testes de acesso. Não ampliar papéis personalizados automaticamente para liberar uma tela nova.

### Fechamento Diário da Matriz

A conferência manual da Matriz recebe `caixa: { inicial, final, retiradas, itau, pagbank }`.
O servidor calcula, em centavos, `final - inicial + retiradas + itau + pagbank`.
`dinheiro` guarda apenas `final - inicial + retiradas`; os outros campos antigos de pagamento ficam zerados nesse modo para evitar duplicação.
O detalhamento versionado (`caixa.versao = 1`) fica no snapshot JSON `dados_depois` do histórico existente; consultas recuperam o snapshot mais recente. O fechamento e seu snapshot são gravados na mesma transação. Não requer migration.
Fechamentos antigos por forma de pagamento e fechamentos de filiais mantêm o comportamento original. A conversão de um fechamento antigo é explícita na tela e exige motivo de alteração. Clientes antigos não podem sobrescrever uma conferência sem enviar seu detalhamento.
Cada fechamento não zerado gera uma entrada RECEBIDO e uma baixa na data de referência, na mesma transação do fechamento, com documento reservado `FECHAMENTO-DIARIO-{id}`. Alterações atualizam os mesmos IDs; não são anexadas baixas em duplicidade. Edição/baixa/cancelamento/exclusão direta no Financeiro são bloqueados para essa origem; a correção é feita pelo Fechamento Diário, com motivo e auditoria.
`POST /api/financeiro/sincronizar-fechamentos` reconcilia os registros antigos apenas na unidade ativa/autorizada. Financeiro e Visão Geral chamam essa operação antes de carregar valores. A sincronização relê o fechamento dentro da transação para não aplicar um snapshot desatualizado. Registros zerados não criam entradas novas. Fechamentos legados com documento equivalente `FECHAMENTO-{data}-{loja}` são preservados; valores diferentes são retornados como conflitos para conferência.
O resumo ainda inclui o total de fechamentos não integrados, mas exclui os que já têm documento financeiro equivalente (legado ou integrado), evitando duplicação durante a reconciliação. O botão do Financeiro abre o módulo atualizado quando o usuário tem a permissão `fechamento`.
A Visão Geral inicia em Todas as unidades. Seu seletor de resumo é independente da loja operacional. `GET /api/financeiro/resumo?consolidado=1` ignora apenas a restrição à loja ativa, preservando integralmente as lojas autorizadas do usuário; `lojaId` opcional filtra uma unidade autorizada. Escritas continuam exigindo a unidade ativa explícita. Entradas/saídas do mês são recebimentos/pagamentos realizados; contas pendentes permanecem nos indicadores próprios.

### Importação de notas com custo real

Ver `docs/IMPORTACAO-NOTAS-CUSTO.md`. O fluxo de Compras aceita foto, PDF e XML com conferência, reconciliação e confirmação explícita. Apenas a confirmação recebe estoque no local da unidade ativa e atualiza o último custo; preserva os preços de venda. Rascunhos e leitura não alteram dados comerciais. A calculadora manual salva apenas o último custo com motivo, sem alterar estoque ou custo médio.

As quatro novas tabelas são privadas, com RLS e propriedade do papel do backend. A migration aditiva `20261022000100` foi aplicada no projeto configurado em 24/10/2026, registrada no histórico, sem seed/reset; a conferência antes/depois preservou os dados das 38 tabelas comerciais existentes. Em outro destino, aplicar a migration antes do código dependente. Arquivos são servidos somente pela API autenticada da loja. A chave não substitui uma integração fiscal autorizada. Não usar `nota-foto.service.ts` ou o fluxo antigo de sugestão de preço; eles não fazem parte desta entrega.

O catálogo da unidade mostra `preco_custo` como último custo; o saldo ponderado é retornado separadamente em `custo_medio`. Não sobrescrever o preço de venda na importação. O motor decimal canônico é `backend/src/domain/custo-real.ts`; o prebuild copia uma versão para `frontend/src/generated`, permitindo builds independentes dos serviços.

PDFs textuais enviam `paginasPdf` com posições de texto para `ler-danfe-pdf.ts`; preservar colunas e páginas, sem reduzir DANFE tabular a uma linha simples. Cabeçalhos de continuação não substituem o quadro de totais. Número/série/CNPJ são obtidos da chave válida; `0 - ENTRADA` não é número fiscal. Fatores de embalagem podem vir de contagens explícitas na descrição, sempre com revisão. Reler documento já salvo não deve apagar a nova leitura na tela: atualizar o rascunho exige versão e justificativa, e entradas confirmadas são preservadas. PDFs reais de clientes e suas extrações ficam fora do Git; testes usam geometria e dados fictícios.

### Fotos no PDV

A busca por nome e a leitura por EAN do PDV retornam `foto` do catálogo. As sugestões e os itens da venda mostram a imagem com carregamento sob demanda e ícone alternativo quando ausente ou indisponível; falhas da imagem não impedem vender. O campo é compartilhado pelo produto entre unidades. Ao enriquecer fotos, preservar imagens existentes, conferir EAN e apresentação, e atualizar apenas foto/data, sem mudar preços, custos ou estoque. Fontes e conferências de dados reais ficam em `.local`, fora do Git.

### Custos simples e atualização compartilhada

**Compras** prioriza `TabelaCustosSimples`; **Produtos → Lançar custos** usa o mesmo componente. `POST /api/produtos/custos/simples` exige Produtos, unidade ativa e confirmação explícita pelo botão. Recalcula total/quantidade em decimal, valida todos os itens e custos esperados antes de gravar o lote, e registra `TABELA_SIMPLES` no histórico existente. Não altera estoque, custo médio ou venda. Não requer novas tabelas/migration.

Fornecedores oferece `?consolidado=1` somente nos GETs da lista e do resumo. Essa consulta ignora o filtro operacional ativo, mas mantém todas as restrições de unidades autorizadas, como o consolidado financeiro. Cada fornecedor informa a unidade de origem; editar/ativar/desativar continua limitado à unidade ativa. A visão consolidada escolhe um vínculo ativo autorizado quando disponível e não duplica fornecedores.

`apiClient` notifica alterações concluídas entre abas sem enviar dados comerciais ou credenciais. `useDadosCompartilhados` atualiza listas ao receber notificação, ganhar foco e a cada 30 segundos com a página visível; sessões em dispositivos diferentes usam essa consulta periódica autenticada. Não substituir formulários em edição por snapshots automáticos. A tabela de custos mantém o snapshot enquanto houver valores digitados e exige revisão em caso de concorrência. Não disparar notificações para POSTs auxiliares de leitura ou de sincronização de fechamentos, evitando ciclos de atualização.

## 7. Desenvolvimento local

Usar **Node.js 22.x**, com versão compatível com o Vite do projeto (22.12 ou superior). As dependências têm lockfiles separados; a raiz não é um workspace npm.

Em uma instalação local nova, a partir da raiz:

```powershell
npm ci --include=dev --prefix backend
npm ci --include=dev --prefix frontend
if (-not (Test-Path -LiteralPath 'backend/.env')) {
  Copy-Item backend/.env.example backend/.env
}
```

O `Copy-Item` acima é somente para ambiente sem `backend/.env`: não sobrescrever uma configuração privada existente. Configurar o backend com os valores privados do ambiente escolhido; o exemplo vem com SQLite e não é a configuração de produção.

Em terminais separados:

```powershell
npm run dev --prefix backend
```

```powershell
npm run dev --prefix frontend
```

API local: porta 3000 (`PORT` opcional). Vite: porta 5173. O proxy do Vite encaminha `/api` à API local. `API_PROXY_TARGET` permite escolher outra API; confirmar o destino antes de testar operações que gravam. Para executar o backend compilado: `npm run build --prefix backend`, depois `npm start --prefix backend`.

Antes de iniciar ou parar processos, verificar quem usa as portas. Usar porta de teste separada quando necessário; não interromper o ambiente de trabalho nem reinstalar dependências de processos ativos sem necessidade.

## 8. Validação proporcional à mudança

Os comandos abaixo partem da raiz:

```powershell
npm run build
npm test
npm run check:deployment
```

- `build`: compila backend, copia assets de runtime e gera frontend.
- `test`: executa suítes do backend e testes do gateway serverless da raiz.
- `check:deployment`: confere o frontend compilado, procura credenciais/arquivos privados e exige os assets do backend. **Sem `--bundle`, não valida um pacote Vercel completo.**
- Para mudança só de frontend, build do frontend e QA do fluxo afetado podem bastar. Documentação sem alteração de código não exige repetir toda a suíte.
- As integrações PostgreSQL opcionais usam `PG_TEST_DATABASE_URL` e `POSTGRES_EXPORT_TEST_URL` em bancos **locais descartáveis**. Nunca apontar fixtures/testes destrutivos para o Supabase de produção.
- No QA de produção, privilegiar login e consultas. Não abrir caixa, concluir venda, lançar boleto ou fechar expediente real apenas para testar uma mudança de navegação.

Para conferir os serviços integrados, o fluxo documentado foi validado com Vercel CLI 64.7.0:

```powershell
npx vercel@64.7.0 dev -L
```

`-L` executa localmente sem vincular projeto remoto. Fornecer as variáveis privadas à sessão para testar PostgreSQL. Não trocar silenciosamente a conta/projeto da Vercel usada pelo usuário.

Se gerar o Build Output completo em Linux compatível com a Vercel:

```powershell
npm run check:deployment -- --bundle .vercel/output
```

Esse modo também valida os dois serviços, entrypoint, Node 22, rewrites, assets e exclusões da função. Um build TypeScript/Vite aprovado sozinho não comprova que o empacotamento serverless esteja correto.

## 9. Commit, publicação e verificação final

1. Conferir `git status` e preservar trabalho local alheio à tarefa. Alterar apenas o escopo solicitado.
2. Validar a mudança e revisar `git diff --check`, os arquivos staged e a ausência de credenciais/dados.
3. Fazer commit quando solicitado. Usar o fluxo de branch autorizado; para nova branch, o padrão é `codex/`. Não forçar push nem reescrever histórico remoto.
4. Enviar ao remoto quando fizer parte da tarefa. Na publicação, usar o mesmo projeto Vercel pela raiz; atualizar **Refresh services configuration** quando a importação precisar reler os serviços e manter as variáveis do ambiente correto.
5. Commit/push não comprovam deploy. Conferir o deployment correspondente ao commit no painel e aguardar conclusão antes de anunciar que produção foi atualizada. A publicação pode ser feita pelo painel ou pela integração Git, conforme a configuração do projeto.
6. Após deploy, conferir o domínio e os fluxos afetados. Mudanças de navegação podem exigir recarregar a página ou fazer login novamente para carregar a versão nova.

Smoke esperado no domínio final:

| Verificação | Resultado esperado |
| --- | --- |
| `GET /` e `GET /pdv` | Interface HTML |
| `GET /api` | 200 JSON, `sucesso: true`, banco disponível |
| `GET /api/produtos` sem token | 401 |
| `POST /api/auth/login` válido | 200 com token e usuário, sem registrar o token em relatório público |
| `GET /api/auth/me` autenticado | Usuário, permissões e lojas corretos |
| API inexistente | 404 em JSON |
| `/assets/inexistente.js` em produção | 404, sem virar HTML da SPA |
| Caio / Natália / Administrativo / Marcos | Módulos e restrição à Matriz conforme a configuração vigente |

Se falhar, investigar primeiro:

- **503 da API:** variáveis privadas, gateway, inicialização e conectividade/TLS do banco; não habilitar SQLite como fallback.
- **Contrato/coluna ausente:** migrations do destino e contrato incluído no build; não tentar criar a tabela por endpoint ou seed.
- **HTML em `/api`:** ordem e destino dos rewrites; não alterar o cliente para contornar roteamento errado.
- **401/403:** sessão, papel atual e loja autorizada; não ampliar acesso para esconder a falha.
- **Asset ausente ou `/pdv` quebrado:** output do frontend e fallback; confirmar no pacote/domínio publicado, pois o Vite de desenvolvimento tem comportamento diferente.

Ao encerrar, informar o que mudou, a validação executada, o commit e o estado real da publicação. Atualizar este guia e os documentos específicos quando a tarefa mudar a arquitetura, as variáveis, o banco ou o padrão de acessos.
