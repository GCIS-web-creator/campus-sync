
CREATE OR REPLACE FUNCTION public.hiadmin_database_explorer_schema()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, information_schema, public
AS $function$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'name', t.table_name,
        'estimated_rows', COALESCE(s.n_live_tup, 0),
        'primary_key', COALESCE((
          SELECT jsonb_agg(k.column_name ORDER BY k.ordinal_position)
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage k
            ON k.constraint_name = tc.constraint_name
           AND k.constraint_schema = tc.constraint_schema
          WHERE tc.table_schema = 'public'
            AND tc.table_name = t.table_name
            AND tc.constraint_type = 'PRIMARY KEY'
        ), '[]'::jsonb),
        'columns', (
          SELECT COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'name', c.column_name,
                'type', c.data_type,
                'nullable', c.is_nullable = 'YES',
                'default', c.column_default
              ) ORDER BY c.ordinal_position
            ),
            '[]'::jsonb
          )
          FROM information_schema.columns c
          WHERE c.table_schema = 'public'
            AND c.table_name = t.table_name
        )
      ) ORDER BY t.table_name
    ),
    '[]'::jsonb
  )
  FROM information_schema.tables t
  LEFT JOIN pg_stat_user_tables s
    ON s.schemaname = t.table_schema
   AND s.relname = t.table_name
  WHERE t.table_schema = 'public'
    AND t.table_type = 'BASE TABLE';
$function$;

REVOKE ALL ON FUNCTION public.hiadmin_database_explorer_schema() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hiadmin_database_explorer_schema() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hiadmin_database_explorer_schema() TO service_role;
