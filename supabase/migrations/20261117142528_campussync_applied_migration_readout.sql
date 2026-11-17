create or replace function public.campussync_list_applied_migrations()
returns table (version text, name text)
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select m.version::text, coalesce(m.name, '')::text
  from supabase_migrations.schema_migrations as m
  order by m.version desc
$function$;

revoke all on function public.campussync_list_applied_migrations() from public, anon, authenticated;
grant execute on function public.campussync_list_applied_migrations() to service_role;