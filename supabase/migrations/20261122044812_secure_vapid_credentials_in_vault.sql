create or replace function public.campussync_store_vapid_credentials(
  p_public_key text,
  p_private_key text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, vault
as $function$
declare
  v_public_id uuid;
  v_private_id uuid;
begin
  if p_public_key is null or length(p_public_key) < 80 or length(p_public_key) > 120 then
    raise exception 'Invalid VAPID public key';
  end if;
  if p_private_key is null or length(p_private_key) < 40 or length(p_private_key) > 60 then
    raise exception 'Invalid VAPID private key';
  end if;

  select id into v_public_id from vault.secrets where name = 'campussync_vapid_public_key_active' limit 1;
  select id into v_private_id from vault.secrets where name = 'campussync_vapid_private_key_active' limit 1;

  if v_public_id is null then
    perform vault.create_secret(p_public_key, 'campussync_vapid_public_key_active', 'Active CampusSync Web Push public key');
  else
    perform vault.update_secret(v_public_id, p_public_key, 'campussync_vapid_public_key_active', 'Active CampusSync Web Push public key', null);
  end if;
  if v_private_id is null then
    perform vault.create_secret(p_private_key, 'campussync_vapid_private_key_active', 'Active CampusSync Web Push private key');
  else
    perform vault.update_secret(v_private_id, p_private_key, 'campussync_vapid_private_key_active', 'Active CampusSync Web Push private key', null);
  end if;
  return true;
end;
$function$;

create or replace function public.campussync_get_vapid_credentials()
returns jsonb
language sql
security definer
set search_path = pg_catalog, public, vault
as $function$
  select jsonb_build_object(
    'public_key', max(decrypted_secret) filter (where name = 'campussync_vapid_public_key_active'),
    'private_key', max(decrypted_secret) filter (where name = 'campussync_vapid_private_key_active'),
    'subject', 'mailto:580098@tokyo.soka.ed.jp'
  )
  from vault.decrypted_secrets
  where name in ('campussync_vapid_public_key_active', 'campussync_vapid_private_key_active');
$function$;

revoke all on function public.campussync_store_vapid_credentials(text, text) from public, anon, authenticated;
revoke all on function public.campussync_get_vapid_credentials() from public, anon, authenticated;
grant execute on function public.campussync_store_vapid_credentials(text, text) to service_role;
grant execute on function public.campussync_get_vapid_credentials() to service_role;
