# Importação de notas e custo unitário real

Em **Compras → IMPORTAR NOTA FISCAL**, use **Tirar foto** no celular ou **Selecionar imagens / PDF / XML**. O XML tem prioridade por trazer os dados estruturados; fotos e PDFs passam por leitura assistida e conferência. A leitura usa arquivos de OCR em português e de PDF servidos pelo próprio site, sem enviar a nota a um serviço externo de reconhecimento.

1. Confira fornecedor, número, série, total da nota e local de recebimento na unidade ativa.
2. Confira os produtos localizados por EAN/GTIN ou código previamente associado ao fornecedor. Correspondências por descrição são apenas sugestões: selecione o produto correto. Para produtos novos, informe um EAN válido; a criação exige também a permissão Produtos.
3. Confirme a quantidade comprada e as unidades por embalagem. Exemplo: 2 caixas com 6 unidades resultam em 12 unidades. O fator desconhecido não é presumido; pode ser guardado para compras futuras do mesmo fornecedor/produto.
4. Confira frete, seguro, descontos e impostos. Marque **Efetivamente cobrado** somente para valores realmente cobrados; use **Já incluído no valor dos produtos** para evitar somá-los novamente. ICMS próprio é informativo, não uma despesa adicional.
5. Marque cada produto como **Conferido**, salve a conferência e confira a diferença entre total calculado e total da nota. A entrada fica bloqueada se houver divergência, fator desconhecido ou item sem revisão.
6. Marque a autorização explícita e use **CONFIRMAR ENTRADA E ATUALIZAR ESTOQUE**. Essa ação atualiza o último custo dos produtos, recebe as unidades no local escolhido, calcula o custo médio ponderado e registra histórico. **Os preços de venda são preservados.** Não gera boleto ou pagamento financeiro automaticamente.

Apenas ler o arquivo ou salvar a conferência não altera produtos, custos, fornecedores ou estoque. A chave e o arquivo protegem contra repetição; uma confirmação repetida da mesma conferência não recebe a mercadoria novamente. Notas sem chave também são verificadas por fornecedor, número e série antes da entrada. Fotos diferentes da mesma nota devem ser conferidas no histórico.

## Leitura de DANFE em PDF

PDFs com texto preservam a posição das colunas de todas as páginas. O leitor identifica a tabela por seus títulos (código, descrição, NCM, CFOP, quantidade, valor unitário, total, ICMS e IPI), reúne descrições quebradas e lê o quadro de impostos separadamente. Cabeçalhos de continuação não substituem os totais da primeira página. ICMS próprio e tributos aproximados não são adicionados ao custo.

Quando a chave é válida, CNPJ do emitente, número e série são extraídos dela; o campo `0 - ENTRADA` do DANFE não é interpretado como número da nota. A data de emissão e o nome do emitente vêm dos campos do documento. Quantidades explícitas como `CX C/18 UND` e suas continuações são aproveitadas como fator sugerido, ainda sujeito à conferência. Medidas como `2L` e `105GR` não são contagens de unidades.

Se houver linhas ou páginas ilegíveis, a soma lida é comparada ao total impresso e a divergência é sinalizada. Documentos sem tabela reconhecida mantêm a leitura assistida simples. Fotos e PDFs escaneados continuam sujeitos à precisão do OCR.

Após uma atualização do leitor, selecione o PDF novamente para refazer a leitura. Se o documento já tiver um rascunho, a nova leitura é mantida na tela e a substituição exige salvar novamente com justificativa; uma entrada já confirmada não é regravada.

## Cálculo

Para o regime considerado (Simples Nacional), o custo soma produtos, frete, seguro, despesas e IPI/ICMS-ST/FCP-ST efetivamente cobrados e ainda não incluídos, descontando os abatimentos. Não adiciona ICMS próprio embutido, tributos retidos em etapas anteriores, DAS futuro da venda ou créditos fiscais presumidos. Os valores de notas específicas devem ser conferidos com o documento e a orientação fiscal da empresa.

Despesas gerais são rateadas proporcionalmente ao valor líquido dos itens, em centavos, somente no montante ainda não atribuído. O custo unitário divide o custo real do item pela quantidade convertida em unidades. O armazenamento preserva dez casas decimais para o custo; a interface apresenta valores monetários com duas casas.

O catálogo da unidade apresenta o **último custo de compra**. O **custo médio do estoque** é calculado separadamente a partir das entradas e saldos anteriores.

## Calculadora

**CALCULADORA DE CUSTO REAL** permite simular quantidades, impostos e despesas, copiar o resultado e sugerir um preço por margem bruta ou markup. A sugestão não altera a venda. Salvar o custo exige selecionar um produto da unidade, informar o motivo e confirmar; altera somente o último custo, sem movimentar estoque nem recalcular o custo médio.

## Arquivos e acesso

Até 12 arquivos, 20 páginas por PDF e 2,5 MB de documentos arquivados por conferência. Fotos são reduzidas para uma cópia legível; é possível ajustar sua rotação antes da leitura. Valores ilegíveis devem ser corrigidos, sem preenchimento fiscal inventado.

Os documentos ficam em tabelas privadas do banco e são baixados apenas pela API autenticada, com escopo de unidade e permissão Compras. RLS está habilitado e as tabelas/sequências não têm acesso concedido a `PUBLIC`, `anon`, `authenticated` ou `service_role`. O papel privado do backend é o proprietário. Confirmações e revisões registram usuário, data e componentes do cálculo; revisões de conferências salvas exigem justificativa.

A chave de 44 dígitos não permite obter automaticamente o XML da SEFAZ. A recuperação só funciona quando há uma integração autorizada configurada no backend por `NFE_INTEGRATION_URL` (HTTPS) e `NFE_INTEGRATION_TOKEN`. Sem ela, o sistema orienta a anexar o XML do fornecedor. Essas configurações são privadas; não usar variáveis `VITE_*`.

## Banco e publicação

A migration `20261022000100_custo_real_compras.sql` acrescenta quatro tabelas: `compras_conferencias`, `compras_documentos`, `compras_embalagens` e `compras_custos_historico`. É aditiva: não muda tabelas comerciais nem regrava dados existentes. O contrato passa a 42 tabelas, 474 colunas e 104 chaves estrangeiras.

Aplicar a migration antes do código dependente, sem seed ou reset. Registrar sua versão no histórico de migrations. Validar primeiro em PostgreSQL local descartável e conferir RLS, propriedade e privilégios das quatro tabelas. A implantação usa a configuração existente de dois serviços no mesmo projeto Vercel.

O build do frontend gera uma cópia local do motor puro de cálculo a partir de `backend/src/domain/custo-real.ts`. Cada serviço resolve `decimal.js` de suas próprias dependências; não requer instalação do backend durante o build do frontend. Assets de OCR/PDF e o módulo gerado são produzidos em `predev/prebuild` e ficam fora do Git.

## Verificações

- `backend/tests/custo-real.test.cjs`: fórmula, centavos, rateio, conversões, impostos incluídos, XML, chave e leitura conservadora de texto.
- `backend/tests/custo-real.integration.test.cjs`: SQLite e PostgreSQL descartáveis; leitura e rascunho sem efeitos comerciais, confirmação atômica, custo unitário e médio, preços e outros locais preservados, documentos privados, idempotência, versão, rollback e calculadora.
- QA no navegador: foto com OCR real, cálculo e confirmação, PDF de texto e escaneado com múltiplas páginas, e layout móvel.

Em produção, validar assets, autenticação, listagem de conferências e documentos sem importar uma compra fictícia ou alterar saldos para testar a publicação.
