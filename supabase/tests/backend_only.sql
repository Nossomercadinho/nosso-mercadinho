-- Run after the two migrations. No extension or Supabase Auth is required.
-- The checks and harmless denied-write probes are rolled back at the end.
BEGIN;

DO $checks$
DECLARE
  app_table text;
  blocked_role text;
  identity_sequence text;
  table_oid oid;
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
  IF (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name=ANY(app_tables)) <> 431 THEN
    RAISE EXCEPTION 'Expected 431 application columns. Compare the schema contract before deployment.';
  END IF;
  IF (SELECT count(*) FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
      WHERE n.nspname='public' AND c.contype='f' AND t.relname=ANY(app_tables)) <> 90 THEN
    RAISE EXCEPTION 'Expected 90 application foreign keys.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
      WHERE n.nspname='public' AND t.relname=ANY(app_tables) AND c.contype='f' AND (NOT c.condeferrable OR NOT c.condeferred)) THEN
    RAISE EXCEPTION 'Every application foreign key must be deferrable initially deferred.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid
      WHERE c.relname='idx_caixas_usuario_aberto' AND i.indisunique AND pg_get_expr(i.indpred,i.indrelid) LIKE '%ABERTO%') THEN
    RAISE EXCEPTION 'Missing partial unique protection for one open cash session per user.';
  END IF;
  FOREACH app_table IN ARRAY app_tables LOOP
    table_oid := to_regclass(format('public.%I',app_table));
    IF table_oid IS NULL THEN RAISE EXCEPTION 'Missing table %.',app_table; END IF;
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid=table_oid) THEN RAISE EXCEPTION 'RLS is disabled on %.',app_table; END IF;
    IF EXISTS (SELECT 1 FROM pg_policy WHERE polrelid=table_oid) THEN RAISE EXCEPTION 'Unexpected Data API RLS policy on %.',app_table; END IF;
    IF EXISTS (SELECT 1 FROM pg_class t CROSS JOIN LATERAL aclexplode(COALESCE(t.relacl,acldefault('r',t.relowner))) a
        WHERE t.oid=table_oid AND a.grantee=0) THEN RAISE EXCEPTION 'PUBLIC has table privileges on %.',app_table; END IF;
    FOREACH blocked_role IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=blocked_role)
        AND has_table_privilege(blocked_role,table_oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
        RAISE EXCEPTION 'Role % has table privileges on %.',blocked_role,app_table;
      END IF;
    END LOOP;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=app_table AND column_name='id') THEN
      identity_sequence := pg_get_serial_sequence(format('public.%I',app_table),'id');
      IF identity_sequence IS NULL THEN RAISE EXCEPTION 'Missing ID identity sequence on %.',app_table; END IF;
      FOREACH blocked_role IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=blocked_role)
          AND has_sequence_privilege(blocked_role,identity_sequence,'USAGE,SELECT,UPDATE') THEN
          RAISE EXCEPTION 'Role % has identity sequence privileges on %.',blocked_role,app_table;
        END IF;
      END LOOP;
    END IF;
  END LOOP;
  RAISE NOTICE 'Schema contract, 90 foreign keys, RLS and backend-only grants verified.';
END
$checks$;

DO $denied_requests$
DECLARE
  blocked_role text;
BEGIN
  FOREACH blocked_role IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=blocked_role) THEN CONTINUE; END IF;
    EXECUTE format('SET LOCAL ROLE %I',blocked_role);
    BEGIN
      PERFORM id FROM public.usuarios LIMIT 1;
      RAISE EXCEPTION 'Role % unexpectedly read usuarios.',blocked_role;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    BEGIN
      INSERT INTO public.migracoes_cadastros_lojas(chave) VALUES ('__blocked_probe__');
      RAISE EXCEPTION 'Role % unexpectedly inserted an application row.',blocked_role;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    BEGIN
      UPDATE public.migracoes_cadastros_lojas SET chave=chave WHERE false;
      RAISE EXCEPTION 'Role % unexpectedly updated an application table.',blocked_role;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    BEGIN
      DELETE FROM public.migracoes_cadastros_lojas WHERE false;
      RAISE EXCEPTION 'Role % unexpectedly deleted from an application table.',blocked_role;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    RESET ROLE;
  END LOOP;
  RAISE NOTICE 'Client roles cannot select, insert, update or delete application data.';
END
$denied_requests$;

ROLLBACK;
