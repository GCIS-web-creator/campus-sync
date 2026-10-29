-- CampusSync class chat: configurable display name.
-- Run this file in Supabase SQL Editor after class-chat.sql.
-- Safe to rerun. Official profiles.student_name is preserved separately.

alter table public.profiles
  add column if not exists chat_display_name text;

comment on column public.profiles.chat_display_name is
  'Optional nickname shown as the author name in class chat. NULL/blank falls back to profiles.student_name.';

create or replace function public.current_class_chat_profile()
returns table (
  student_id text,
  student_name text,
  user_class text
)
language sql
stable
security definer
set search_path = public, auth
as $function$
  select
    p.student_id::text as student_id,
    coalesce(
      nullif(btrim(p.chat_display_name::text), ''),
      btrim(coalesce(p.student_name::text, ''))
    ) as student_name,
    case
      when p.user_class::text ~ '^[1-3]-[1-8]$'
        then p.user_class::text
      when p.user_class::text ~* '^([1-3])[- ]([A-H])$'
        then substring(p.user_class::text from '^([1-3])') || '-' ||
             (ascii(upper(substring(p.user_class::text from '[A-H]'))) - 64)::text
      else null
    end as user_class
  from public.profiles as p
  where p.student_id::text = split_part(coalesce(auth.jwt() ->> 'email', ''), '@', 1)
    and coalesce(auth.jwt() ->> 'email', '') ~* '^[0-9]{6}@tokyo\.soka\.ed\.jp$'
    and (p.auth_user_id = auth.uid() or p.auth_user_id is null)
  order by (p.auth_user_id = auth.uid()) desc nulls last
  limit 1
$function$;

revoke all on function public.current_class_chat_profile() from public;
revoke all on function public.current_class_chat_profile() from anon;
grant execute on function public.current_class_chat_profile() to authenticated;

-- After a profile name changes, update that user's historical messages as well.
-- SECURITY DEFINER is used so message RLS can keep enforcing normal client writes
-- while this narrowly scoped synchronization updates only the matching user.
create or replace function public.sync_class_chat_display_name_to_messages()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  effective_name text;
begin
  effective_name := coalesce(
    nullif(btrim(new.chat_display_name::text), ''),
    btrim(coalesce(new.student_name::text, ''))
  );

  if new.auth_user_id is not null then
    update public.class_chat_messages
    set student_name = effective_name
    where user_id = new.auth_user_id
      and student_id = new.student_id::text
      and student_name is distinct from effective_name;
  end if;

  return new;
end
$function$;

revoke all on function public.sync_class_chat_display_name_to_messages() from public;

drop trigger if exists sync_class_chat_display_name_to_messages on public.profiles;
create trigger sync_class_chat_display_name_to_messages
after update of student_name, chat_display_name on public.profiles
for each row
when (
  old.student_name is distinct from new.student_name
  or old.chat_display_name is distinct from new.chat_display_name
)
execute function public.sync_class_chat_display_name_to_messages();
