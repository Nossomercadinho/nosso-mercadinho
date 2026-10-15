-- This application authenticates in Express using usuarios + JWT_SECRET.
-- Do not grant the Supabase Data API access to the application tables.
-- DATABASE_URL must identify a trusted table owner / BYPASSRLS server connection.
-- No browser role receives an RLS policy or any table/sequence privilege.
BEGIN;

DO $security$
DECLARE
  app_table text;
  blocked_role text;
  identity_sequence text;
  app_tables constant text[] := ARRAY[
    'clientes', 'empresas', 'financeiro_categorias', 'fornecedores', 'lojas',
    'clientes_lojas', 'fornecedores_lojas', 'locais_estoque',
    'migracoes_cadastros_lojas', 'papeis_acesso', 'produtos', 'estoque_saldos',
    'fornecedor_precos_historico', 'fornecedor_produtos', 'fornecedor_produtos_lojas',
    'produtos_lojas', 'usuarios', 'caixas_sessoes', 'executores', 'auditoria_operacoes',
    'fechamentos_diarios', 'fechamentos_diarios_historico', 'movimentacoes_estoque',
    'notas_entrada', 'notas_entrada_itens', 'notas_entrada_parcelas',
    'financeiro_lancamentos', 'financeiro_baixas', 'financeiro_fechamentos_caixa',
    'financeiro_historico', 'usuario_lojas', 'vendas', 'contas_receber',
    'contas_receber_recebimentos', 'venda_itens', 'venda_pagamentos',
    'vendas_caixa_diario', 'vendas_correcoes'
  ];
BEGIN
  FOREACH app_table IN ARRAY app_tables LOOP
    IF to_regclass(format('public.%I', app_table)) IS NULL THEN
      RAISE EXCEPTION 'Application table public.% is missing; apply the baseline migration first.', app_table;
    END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', app_table);
    -- The owner can operate through the trusted server connection. FORCE RLS is
    -- deliberately absent; client access still requires grants AND policies.
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC', app_table);
    FOREACH blocked_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = blocked_role) THEN
        EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM %I', app_table, blocked_role);
      END IF;
    END LOOP;
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = app_table AND column_name = 'id'
    ) THEN
      identity_sequence := pg_get_serial_sequence(format('public.%I', app_table), 'id');
      IF identity_sequence IS NOT NULL THEN
        EXECUTE format('REVOKE ALL PRIVILEGES ON SEQUENCE %s FROM PUBLIC', identity_sequence);
        FOREACH blocked_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = blocked_role) THEN
            EXECUTE format('REVOKE ALL PRIVILEGES ON SEQUENCE %s FROM %I', identity_sequence, blocked_role);
          END IF;
        END LOOP;
      END IF;
    END IF;
  END LOOP;
END
$security$;

-- Apply these defaults to objects subsequently created by this migration owner.
-- Every future application migration must also explicitly enable table RLS.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL PRIVILEGES ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL PRIVILEGES ON SEQUENCES FROM PUBLIC;
DO $defaults$
DECLARE
  blocked_role text;
BEGIN
  FOREACH blocked_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = blocked_role) THEN
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL PRIVILEGES ON TABLES FROM %I', blocked_role);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL PRIVILEGES ON SEQUENCES FROM %I', blocked_role);
    END IF;
  END LOOP;
END
$defaults$;

COMMENT ON TABLE public.usuarios IS 'Express authentication with existing bcrypt hashes. Not Supabase Auth; server connection only.';
COMMENT ON TABLE public.usuario_lojas IS 'Allowed markets enforced by Express JWT authorization and X-Loja-Id context.';
COMMENT ON TABLE public.produtos_lojas IS 'Store-specific sale price, cost, minimum and catalogue visibility; shared EAN metadata stays in produtos.';

COMMIT;
