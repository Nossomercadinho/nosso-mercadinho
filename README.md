# Nosso Mercadinho

Sistema de gestão de mercados com frontend React/Vite e API Express: catálogo por loja, estoque, compras, financeiro, clientes, vendas e frente de caixa com abertura e fechamento por operador.

Para continuar o projeto com outro agente, comece pelo [guia na raiz](AGENTS.md): arquitetura, Vercel, variáveis privadas, Supabase, acessos e fluxo de alteração/publicação.

O banco padrão é SQLite em `backend/src/database/nosso-mercadinho.db`. PostgreSQL/Supabase é uma opção explícita do backend. Bancos, credenciais e arquivos privados de migração ficam fora do Git; uma instalação existente deve transferir seus dados separadamente, com backup consistente.

## Desenvolvimento local

Use Node.js 22.12 ou superior compatível com o Vite do projeto. Copie `backend/.env.example` para `backend/.env` e configure um `JWT_SECRET` aleatório. Instale as dependências com `npm ci` em `backend` e `frontend`.

Execute `npm run dev` em cada pasta, em terminais separados. O frontend abre em `http://localhost:5173` e encaminha `/api` para `http://127.0.0.1:3000`. A variável `API_PROXY_TARGET` permite usar uma API separada em testes.

A primeira execução cria a estrutura do SQLite. Uma instalação sem unidades recebe a Matriz e a Área de Venda iniciais; bancos com unidades ou histórico de IDs são preservados. Usuários e executores existentes precisam ser transferidos com o banco original. Não há senha padrão versionada. Para uma instalação PostgreSQL nova, o guia abaixo inclui a criação segura do primeiro administrador.

## Interface

- `frontend/src/components/AppShell.tsx`: navegação, sidebar recolhível e header.
- `AccountMenu.tsx`, `Brand.tsx`, `ResponsiveFilters.tsx` e `Dialog.tsx`: componentes compartilhados.
- `frontend/src/system.css`: tokens visuais, padrões de módulos, filtros e fichas de registros no celular.
- `frontend/src/styles/tables.css`: cabeçalhos, células, ações e estados vazios compartilhados pelas tabelas de gestão.
- `frontend/src/pages/PDV.css`: apresentação exclusiva da frente de caixa. Atalhos: F2 para pesquisa, F4 para pagamento e Enter para adicionar um resultado.
- `frontend/src/index.css` e os estilos específicos das páginas: campos, formulários e componentes existentes. Os estilos antigos do dashboard foram retirados do Financeiro; o arquivo App.css sem uso foi removido.

O manifesto abre a experiência em modo standalone quando suportado pelo navegador. Não há operação offline nem integração com terminal de pagamento; o PDV registra o recebimento informado pelo operador.

## Validação

Frontend: `npm run build`. Backend: `npm run build` e `npm test`.

Os testes comuns criam bancos temporários e APIs em portas separadas. Cobrem instalação nova, consultas dos módulos, autenticação, permissões, cadastro de produto, venda, atualização de estoque, auditoria e fechamento diário. O banco local de trabalho não é usado pelos testes. As suítes opcionais com PostgreSQL local estão descritas no [guia do banco](docs/SUPABASE.md#testes-reproduzíveis).

## Acessos e operação do caixa

Em **Usuários e papéis**, o responsável cadastra pessoas, define as áreas liberadas e os mercados permitidos. Papéis personalizados têm permissões por módulo; os papéis do sistema são protegidos. A API consulta o usuário e as permissões atuais em cada requisição, restringindo também os mercados dos registros. Uma sessão aberta deve ser encerrada antes de retirar do operador o acesso necessário para fechá-la.

No PDV, cada operador abre seu próprio expediente, escolhe entre os mercados autorizados e informa o fundo de troco. Mercado, local e responsável ficam vinculados às vendas pelo servidor. A busca aceita nome, marca ou início do código e mantém a leitura por código completo com Enter.

O fechamento confere dinheiro físico: fundo inicial + vendas em dinheiro, excluindo vendas canceladas. Pix, débito, crédito e vendas a prazo ficam discriminados no histórico. O resumo fechado é preservado; correções de vendas de um caixa encerrado são bloqueadas. **Histórico do caixa** permite consultar aberturas e conferências por mercado, operador, situação e período. Isso é separado do lançamento manual de **Fechamento Diário** usado pelo sistema anterior.

Os testes adicionais validam papéis personalizados, revogação de acesso, isolamento entre mercados, abertura e fechamento concorrentes, vendas sem caixa, identificação do operador e preservação do histórico.

## Loja ativa

O seletor **Loja ativa**, no cabeçalho, define o mercado das consultas e dos novos registros. A preferência é salva por usuário. Trocar a loja recarrega o módulo para evitar misturar formulários e resultados de mercados diferentes. A API valida o contexto e as permissões em cada requisição por meio de `X-Loja-Id`; alterar o cabeçalho não amplia o acesso do usuário.

- **Produtos:** catálogo, preços de custo/venda e estoque por mercado. Cadastrar na filial não integra automaticamente à Matriz. **Adicionar do catálogo** reutiliza o produto sem duplicar o EAN. Remover o vínculo de uma loja preserva as demais e o histórico.
- **Estoque:** entradas, saídas, contagens e reposições na loja ativa. Transferências têm origem na ativa e destino entre os mercados autorizados.
- **Financeiro, compras e vendas:** consultas, lançamentos, importações e conferências associados à loja ativa.
- **Clientes e fornecedores:** novos cadastros ficam vinculados à loja ativa. CPF/CNPJ existente é reutilizado sem duplicação. Contas e recebimentos permanecem filtrados; o limite de crédito do cliente considera a dívida global.
- **Usuários e papéis:** administração dos acessos continua abrangendo os mercados autorizados pelo responsável. Cada usuário recebe a relação de lojas em que pode trabalhar.
- **PDV:** a abertura sugere a loja ativa. Durante o expediente, loja/local/operador ficam fixos na sessão do servidor, e cada venda baixa somente o estoque desse local. Feche o caixa antes de trabalhar em outro mercado.

As migrações são aditivas, preservam os preços existentes e associam os cadastros legados às lojas identificadas no histórico, usando a Matriz quando não houver histórico.

## Publicação na Vercel

O [guia da Vercel](docs/VERCEL.md) descreve a publicação completa em um projeto na raiz do repositório, com dois serviços independentes: `frontend` (Vite) e `backend` (Express). `vercel.json` encaminha `/api` à API e os demais caminhos à interface, no mesmo domínio. Não há bindings internos, pois as chamadas partem do navegador por `/api`. As seis variáveis privadas pertencem ao servidor; a interface não precisa de variáveis Supabase. A configuração local e os backups permanecem fora do pacote.

## PostgreSQL / Supabase

O ambiente local foi conectado ao Supabase em 19/10/2026. As migrations e os dados do SQLite foram aplicados e conferidos no banco remoto; a configuração privada fica em `backend/.env`, fora do Git. O SQLite original e seu backup foram preservados. Sem `DB_CLIENT=postgres` explícito, o código continua usando SQLite por padrão. Consulte o [estado instalado](docs/SUPABASE.md#estado-instalado-em-19102026).

O [guia de operação e migração](docs/SUPABASE.md) cobre dois caminhos:

- **Instalação existente:** backup consistente, exportação somente leitura e importação em destino vazio. Usuários, senhas, IDs, relações e históricos são preservados; não aplique o seed nem crie outro primeiro administrador.
- **Instalação nova:** migrations, seed técnico e `npm run admin:criar` no backend compilado. O comando solicita a senha sem exibi-la, cria o primeiro administrador e sua identificação operacional e recusa bancos que já tenham usuários.

Ative com `DB_CLIENT=postgres`, `DATABASE_URL` privada e TLS verificado somente após preparar e conferir o destino. `DATABASE_URL` sozinha não troca o banco. O frontend continua usando `/api`, e o login e as permissões continuam na API Express. Hospedagem, credenciais remotas e o corte de produção dependem do ambiente de destino.

Para executar a configuração com outro agente que já possui os acessos do Supabase, use o [prompt de execução](docs/PROMPT-SUPABASE.txt).

## Importação de notas e custo unitário

Compras aceita fotos, PDF e XML para calcular o custo real por unidade, incluindo os impostos e despesas efetivamente cobrados. A conferência mostra produtos, embalagens e totais antes da confirmação. Confirmar recebe o estoque e atualiza custos com histórico, preservando preços de venda. Há calculadora independente com simulação de margem/markup. Consulte [o guia de importação e validação](docs/IMPORTACAO-NOTAS-CUSTO.md).

## Custos manuais e dados compartilhados

Em **Compras** há uma tabela simples de custos; em **Produtos**, use **Lançar custos**. Informe o valor total e a quantidade e confira o custo unitário calculado. Salvar atualiza somente os custos preenchidos na unidade ativa, com histórico, sem alterar preço de venda, estoque ou custo médio. Quantidade 1 permite informar diretamente o custo unitário.

Fornecedores mostra, por padrão, as unidades autorizadas e identifica a unidade de cada cadastro. As telas de gestão atualizam listas ao receber alterações em outras abas, ao voltar à janela e a cada 30 segundos enquanto visíveis. Usuários de sessões/dispositivos distintos consultam os mesmos dados do backend, respeitando permissões e vínculos de unidade.
