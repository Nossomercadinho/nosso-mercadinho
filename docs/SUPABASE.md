# PostgreSQL / Supabase: instalação e migração

O adaptador PostgreSQL e as migrations foram validados em PostgreSQL local. A instalação atual continua usando SQLite; nenhum banco Supabase remoto foi configurado nem recebeu dados durante a preparação. As instruções abaixo são para executar a instalação ou o corte no ambiente de destino, com a conexão privada correspondente.

A API Express continua responsável pelo login com JWT, pelos papéis, pelas lojas autorizadas e pela loja ativa. As contas existentes permanecem em `public.usuarios`, com seus hashes de senha. Não há migração para `auth.users`, nem acesso direto do frontend às tabelas pela Data API do Supabase. As migrations bloqueiam os papéis de navegador nas tabelas da aplicação; use a conexão PostgreSQL somente no servidor.

Escolha um dos caminhos depois de aplicar as migrations estruturais:

| Situação | Dados iniciais | Primeiro acesso |
| --- | --- | --- |
| Migrar uma instalação SQLite existente | Importar a exportação em todas as tabelas vazias; **não aplicar seed** | Usar os usuários e senhas importados; **não executar `admin:criar`** |
| Instalar sem dados anteriores | Aplicar `supabase/seed.sql` uma vez, antes de iniciar a API | Criar o primeiro administrador com `admin:criar` |

Os comandos a partir da raiz do repositório usam PowerShell. Tenha as dependências do backend instaladas com `npm ci`, o cliente `psql` disponível e o Supabase CLI acessível por `npx supabase`.

## Arquivos preparados

- `supabase/migrations/`: estrutura PostgreSQL e proteção das tabelas.
- `supabase/schema-contract.json`: tabelas, colunas, tipos, identidades e referências esperadas pelo exportador.
- `supabase/config.toml`: configuração mínima do CLI, com seed automático desabilitado.
- `supabase/seed.sql`: dados técnicos opcionais para uma instalação nova. **Não aplicar antes de importar uma instalação existente.**
- `backend/scripts/export-sqlite-to-postgres.cjs`: exportação somente leitura do SQLite para um arquivo SQL privado.
- `backend/tests/export-sqlite-to-postgres.test.cjs`: validações em SQLite temporário.
- `backend/tests/export-postgres.integration.test.cjs`: aplicação das migrations e importação em um PostgreSQL local descartável.
- `backend/src/cli/primeiro-admin.ts`: primeiro acesso de uma instalação PostgreSQL nova, sem senha padrão.

Datas e horários legados continuam em `TEXT`, flags continuam como `INTEGER` com valores `0/1`, e JSON/XML continuam em `TEXT`. IDs usam `BIGINT` com identidade por padrão, aceitando os IDs originais na importação. Valores monetários e quantidades usam `NUMERIC` sem escala fixa. Esse contrato evita alterar silenciosamente os cadastros e históricos; detalhes em [supabase/README.md](../supabase/README.md).

## 1. Instalação existente: preparar a origem e o backup

Para uma instalação sem dados anteriores, pule as etapas 1 e 2 e siga pela conexão e migrations na etapa 3.

Antes do corte final, feche os expedientes do PDV e pause as gravações na API. O exportador lê uma transação consistente sem modificar o SQLite; vendas realizadas depois do início desse retrato não estarão no arquivo gerado.

Guarde uma cópia consistente do banco original e teste sua abertura separadamente. Caso o banco use WAL, copiar apenas o arquivo `.db` enquanto há gravações pode deixar alterações de fora. Com o cliente SQLite instalado, a operação `.backup` produz uma cópia consistente:

```powershell
New-Item -ItemType Directory -Force .local/backups | Out-Null
sqlite3 "backend/src/database/nosso-mercadinho.db" ".backup '.local/backups/pre-supabase.db'"
```

Escolha um nome novo para cada backup e preserve o original. As migrations aditivas da versão atual precisam ter sido executadas na instalação SQLite antes da exportação. O exportador informa tabelas/colunas incompatíveis e referências órfãs; ele não remove registros nem tenta corrigir a origem.

## 2. Gerar o SQL de dados localmente

Instale as dependências do backend com `npm ci`. A partir da raiz do repositório:

```powershell
node backend/scripts/export-sqlite-to-postgres.cjs --sqlite .local/backups/pre-supabase.db --output .local/exports/dados-supabase.sql
```

O processo imprime apenas quantidades e o caminho do arquivo. O SQL contém cadastros, vendas, dados financeiros e hashes de senha: mantenha-o em armazenamento privado e fora do Git. O diretório `.local` está ignorado pelo repositório.

O exportador:

- abre o banco com `OPEN_READONLY`, `query_only` e transação de leitura;
- executa `quick_check`, `foreign_key_check` e confere também as referências adicionais da migration PostgreSQL;
- recusa tabelas/colunas desconhecidas, colunas obrigatórias ausentes e valores incompatíveis;
- preserva IDs inteiros de 64 bits sem passar por arredondamento do JavaScript, além de datas, hashes, flags e textos JSON/XML;
- gera uma transação com bloqueio das tabelas e uma verificação de que **todas as tabelas da aplicação no destino estão vazias**;
- valida as chaves estrangeiras e ajusta as identidades, preservando também o maior ID já usado no SQLite;
- não conecta ao PostgreSQL, não sobrescreve o arquivo de saída e não executa `DROP`, `DELETE` ou `TRUNCATE` no destino.

Use `--help` para as opções. `--batch-size 100` é o padrão; reduza para bancos com imagens grandes embutidas em campos de texto. `--contract` e `--schema` atendem a testes ou a uma estrutura de destino explicitamente revisada; a operação normal usa o contrato versionado e o esquema `public`.

## 3. Escolher a conexão PostgreSQL

Copie a conexão no botão **Connect** do projeto Supabase. Para um backend persistente e para migrations/importações, prefira a conexão **Direct**, porta `5432`. Quando o ambiente só tem IPv4 e não alcança o endpoint direto do projeto, use **Session pooler**, também na porta `5432`, com o host e o usuário fornecidos pelo painel. Não derive o host do nome da região. [Documentação de conexões](https://supabase.com/docs/guides/database/connecting-to-postgres).

Use TLS com validação do certificado e do hostname. Para `psql`, configure `PGSSLMODE=verify-full` e `PGSSLROOTCERT` com o certificado CA baixado do painel do projeto. Não use `sslmode=disable`, `rejectUnauthorized: false` nem `NODE_TLS_REJECT_UNAUTHORIZED=0` para uma conexão de produção. Baixar o certificado sozinho não configura a conexão; o cliente precisa utilizá-lo. [SSL no Supabase](https://supabase.com/docs/guides/platform/ssl-enforcement).

As credenciais PostgreSQL pertencem apenas ao ambiente do backend. Não use variáveis `VITE_*`, arquivos do frontend ou mensagens de chat para guardar a conexão. A senha na URI deve ter seus caracteres reservados codificados para URL.

## 4. Aplicar as migrations estruturais

Use um projeto novo ou um destino revisado sem dados da aplicação. Ao migrar o SQLite, não inicie a API PostgreSQL nem aplique o seed antes da transferência, para evitar registros técnicos em conflito com os IDs importados. Na instalação nova, o seed vem depois das migrations.

Com o Supabase CLI disponível, a partir da raiz do repositório:

```powershell
npx supabase login
npx supabase link --project-ref SEU_PROJECT_REF
npx supabase migration list
npx supabase db push --dry-run
npx supabase db push
```

Confira o projeto vinculado e a prévia antes do último comando. `db push` aplica as migrations pendentes; não acrescente `--include-seed` para a migração do SQLite. Não use `db reset --linked` neste processo: esse comando recria o banco remoto e apaga dados. [Fluxo oficial de migrations](https://supabase.com/docs/guides/local-development/cli-workflows).

Também é possível aplicar os arquivos SQL em ordem pelo cliente `psql`, usando a conexão Direct/Session apropriada. Não misture aplicações manuais e pelo CLI no mesmo projeto sem reconciliar o histórico das migrations.

## 5. Completar os dados iniciais

### Conexão para os comandos SQL

Configure o cliente PostgreSQL no terminal. Os exemplos abaixo contêm somente marcadores; copie os valores reais do painel para o ambiente local, sem versioná-los:

```powershell
$env:PGHOST = 'HOST_COPIADO_DO_CONNECT'
$env:PGPORT = '5432'
$env:PGDATABASE = 'postgres'
$env:PGUSER = 'USUARIO_COPIADO_DO_CONNECT'
$env:PGSSLMODE = 'verify-full'
$env:PGSSLROOTCERT = 'C:/caminho/privado/supabase-ca.crt'
```

`-W` solicita a senha, sem incluí-la no histórico do comando. `ON_ERROR_STOP` interrompe a importação no primeiro erro. Use uma conta PostgreSQL administrativa/autorizada para importar os dados nas tabelas protegidas; não use os papéis `anon` ou `authenticated`. [Uso de psql com Supabase](https://supabase.com/docs/guides/database/psql).

### Caminho A: importar a instalação existente

Não aplique `supabase/seed.sql` neste caminho. Com todas as tabelas da aplicação vazias, execute a exportação gerada na etapa 2:

```powershell
psql -X -W -v ON_ERROR_STOP=1 -f .local/exports/dados-supabase.sql
```

Se houver registros em qualquer tabela da aplicação, o arquivo aborta antes de inserir dados. Não contorne a verificação apagando tabelas ou usando `ON CONFLICT` indiscriminadamente: revise se o destino é o correto e prepare outro destino vazio. Em uma sessão SQL interativa que ficou com transação abortada, execute `ROLLBACK` antes de continuar a inspeção.

Após a importação, compare as quantidades por tabela com o relatório da origem e confira os saldos por loja, usuários/papéis, último histórico de caixa e vendas recentes. IDs explícitos e relações são preservados; as identidades ficam posicionadas para os próximos cadastros.

O exportador preserva IDs de 64 bits. A API trabalha com IDs inteiros no intervalo seguro do JavaScript, até `9007199254740991`, e rejeita valores maiores ao lê-los. Um banco legado fora desse intervalo precisa de uma revisão de compatibilidade antes do corte.

### Caminho B: instalação nova

Use um destino novo, sem dados anteriores. Aplique apenas o seed técnico depois das migrations:

```powershell
psql -X -W -v ON_ERROR_STOP=1 -f supabase/seed.sql
```

O seed cria empresa, Matriz, Área de Venda, papéis protegidos e categorias financeiras. Ele não cria conta, senha, cliente, produto, venda ou lançamento financeiro. O seed automático está desabilitado em `supabase/config.toml`; ele deve continuar desabilitado para a migração de bases existentes.

Configure o ambiente privado do backend conforme a etapa 6. Antes de iniciar a API, execute em `backend`:

```powershell
npm run build
npm run admin:criar
```

O comando solicita nome, e-mail e senha duas vezes, sem exibir a senha. Ela precisa ter pelo menos 12 caracteres, até 72 bytes UTF-8 e nenhuma quebra de linha. A criação é atômica e recusa qualquer instalação que já tenha usuários; não é um comando de recuperação de conta e não deve ser usado depois de importar usuários.

Além do administrador com acesso às lojas, o comando cria uma identificação operacional curta, vinculada ao mesmo usuário, para estoque e fechamento manual. O código é exibido ao concluir; ele não substitui a senha de login. Os expedientes e vendas do novo PDV identificam o operador pela autenticação.

Para automação, `npm run admin:criar -- --nome "Nome do responsável" --email "responsavel@empresa.com" --password-stdin` recebe uma única senha pela entrada padrão. Forneça-a por um mecanismo privado de segredos; não coloque a senha em argumento, variável de ambiente ou comando literal no histórico. Sem `--password-stdin`, use um terminal interativo.

## 6. Ativar o backend e conferir a operação

O banco padrão continua sendo SQLite. Para ativar PostgreSQL, configure **`DB_CLIENT=postgres` explicitamente**; definir somente `DATABASE_URL` não troca o banco. Configure a URI somente no ambiente da API, com a conexão Direct ou Session, e mantenha `JWT_SECRET` definido. A conexão da API deve usar o proprietário das tabelas ou um papel de servidor revisado com `BYPASSRLS`: os papéis de navegador e a chave `service_role` não têm acesso às tabelas protegidas. Uma chave da Data API não substitui uma conexão PostgreSQL.

No backend, use `PG_SSL=require`, que valida o certificado com `rejectUnauthorized: true`, e `PG_SSL_CA_FILE` com o caminho do certificado CA quando necessário. Esse nome de opção pertence ao adaptador da aplicação; no cliente `psql`, as opções correspondentes continuam sendo `PGSSLMODE=verify-full` e `PGSSLROOTCERT`. O adaptador ignora parâmetros de consulta da URI; configure TLS pelas variáveis próprias, sem depender de `?sslmode=`. `PG_SSL=disable` é reservado a testes locais explícitos e é recusado em produção ou para hosts remotos. Não coloque a API em produção apontando para o novo banco antes de preparar e conferir os dados.

```powershell
Set-Location backend
# Configure DATABASE_URL e JWT_SECRET no ambiente privado ou em backend/.env.
$env:DB_CLIENT = 'postgres'
$env:PG_SSL = 'require'
$env:PG_SSL_CA_FILE = 'C:/caminho/privado/supabase-ca.crt'
npm run build
```

Na instalação nova, execute `npm run admin:criar` se ainda não criou o administrador no caminho B; o comando é usado uma única vez. Para a base importada, conserve os usuários existentes. Depois de preparar os dados e o primeiro acesso:

```powershell
npm start
```

Use um terminal ou ambiente de implantação dedicado ao destino. Preserve a configuração da instalação SQLite em operação até concluir o corte. O comando `build` compila a API e copia o contrato para `dist/schema-contract.json`; as migrations não são aplicadas automaticamente na inicialização. A API valida a estrutura existente e consulta o banco antes de responder em `/api`.

O frontend precisa de `npm ci` e `npm run build` em `frontend` para a versão de produção. Hospede o resultado de `frontend/dist` e encaminhe `/api` para a API Express; o proxy do Vite é para desenvolvimento.

Confira login existente, loja ativa, permissões entre mercados, produtos/preços/estoque, cadastro e busca de clientes/fornecedores e abertura/venda/fechamento do PDV em um ambiente de homologação. Confira também os relatórios financeiros, os números dos próximos cadastros e a ausência de dados de uma loja nas consultas de outra. O frontend continua chamando `/api`; a troca do banco não exige expor credenciais PostgreSQL no navegador.

Mantenha o SQLite e o backup originais preservados. Antes de aceitar novas gravações no PostgreSQL, uma reversão pode restaurar a configuração anterior da API. Depois que o novo banco receber vendas ou outros lançamentos, retornar ao SQLite antigo exige reconciliar esses dados; a cópia anterior já não representa o estado atual.

## Testes reproduzíveis

Os testes comuns usam apenas bancos temporários:

```powershell
Set-Location backend
npm run build
npm test
```

Para repetir somente a exportação SQLite: `node --test tests/export-sqlite-to-postgres.test.cjs`.

O teste de integração exige `POSTGRES_EXPORT_TEST_URL` configurada de forma privada para um PostgreSQL **local** com permissão para criar um banco temporário:

```powershell
node --test tests/export-postgres.integration.test.cjs
```

Ele recusa hosts remotos, cria um database próprio com nome aleatório, aplica as migrations reais, importa dados falsos, compara textos/IDs/hashes/datas/flags/JSON, testa texto com sintaxe SQL e tenta uma reimportação no alvo ocupado. No final, fecha as conexões e remove somente o database criado pelo teste, sem `FORCE`. Sem a variável, esse teste é pulado; `npm test` continua seguro para o SQLite local de trabalho.

A suíte da API e do primeiro administrador usa outra variável privada, `PG_TEST_DATABASE_URL`, apontando para PostgreSQL local com banco cujo nome termine em `_test` e permissão para criar/remover bancos temporários:

```powershell
npm run test:postgres
```

Ela recusa hosts remotos e cria seus próprios bancos isolados. Verifica a operação da API em PostgreSQL e a criação inicial do administrador, incluindo senha, executor, concorrência e recusa de base com usuários. Sem a variável, os testes PostgreSQL são pulados. Nenhuma dessas variáveis deve apontar para o banco de trabalho ou de produção.
