-- OPTIONAL: fresh installation only. Never run before importing existing SQLite.
-- No account, password, customer, stock, sale or financial movement is seeded.
BEGIN;
SET LOCAL search_path TO public, pg_catalog;

INSERT INTO public.empresas (id, nome)
VALUES (1, 'Nosso Mercadinho') ON CONFLICT DO NOTHING;

INSERT INTO public.lojas (id, empresa_id, nome, codigo, tipo)
VALUES (1, 1, 'Matriz', 'MATRIZ', 'MATRIZ') ON CONFLICT DO NOTHING;

INSERT INTO public.locais_estoque (id, loja_id, nome, tipo, permite_venda)
VALUES (1, 1, 'Área de Venda', 'VENDA', 1) ON CONFLICT DO NOTHING;

INSERT INTO public.papeis_acesso (id, nome, permissoes, sistema, acesso_todas_lojas)
VALUES
  (1, 'Administrador', '["visao","produtos","estoque","compras","financeiro","contas","clientes","vendas","fiscal","fornecedores","unidades","fechamento","pdv","usuarios","caixas"]', 1, 1),
  (2, 'Operador', '["visao","produtos","estoque","compras","contas","fornecedores","unidades"]', 1, 0),
  (3, 'Caixa', '["visao","estoque","pdv","clientes","vendas","fechamento","caixas"]', 1, 0)
ON CONFLICT DO NOTHING;

INSERT INTO public.migracoes_cadastros_lojas (chave) VALUES ('v1') ON CONFLICT DO NOTHING;

-- Financial category defaults mirror garantirCategoriasFinanceiras; preserve edits.
INSERT INTO public.financeiro_categorias (empresa_id, nome, tipo, ativo)
SELECT 1, categoria.nome, categoria.tipo, 1
FROM (VALUES
  ('Mercadorias','SAIDA'), ('Energia elétrica','SAIDA'), ('Água','SAIDA'),
  ('Internet','SAIDA'), ('Aluguel','SAIDA'), ('Condomínio','SAIDA'),
  ('Funcionários','SAIDA'), ('Impostos','SAIDA'), ('Contabilidade','SAIDA'),
  ('Manutenção','SAIDA'), ('Equipamentos','SAIDA'), ('Sistemas','SAIDA'),
  ('Taxas bancárias','SAIDA'), ('Marketing','SAIDA'), ('Frete','SAIDA'),
  ('Outras despesas','SAIDA'), ('Venda','ENTRADA'), ('Condomínios','ENTRADA'),
  ('Recebimento','ENTRADA'), ('Crédito','ENTRADA'), ('Reembolso','ENTRADA'),
  ('Outras receitas','ENTRADA')
) AS categoria(nome, tipo)
WHERE NOT EXISTS (
  SELECT 1 FROM public.financeiro_categorias existente
  WHERE existente.empresa_id = 1 AND lower(existente.nome) = lower(categoria.nome)
);

SELECT setval(pg_get_serial_sequence('public.empresas','id'), GREATEST(COALESCE(max(id),0),1), count(*) > 0) FROM public.empresas;
SELECT setval(pg_get_serial_sequence('public.lojas','id'), GREATEST(COALESCE(max(id),0),1), count(*) > 0) FROM public.lojas;
SELECT setval(pg_get_serial_sequence('public.locais_estoque','id'), GREATEST(COALESCE(max(id),0),1), count(*) > 0) FROM public.locais_estoque;
SELECT setval(pg_get_serial_sequence('public.papeis_acesso','id'), GREATEST(COALESCE(max(id),0),1), count(*) > 0) FROM public.papeis_acesso;

COMMIT;
