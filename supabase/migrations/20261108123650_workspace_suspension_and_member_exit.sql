create or replace function public.redeem_workspace_invite(
  p_workspace_id uuid,
  p_token_hash text,
  p_user_id uuid,
  p_student_id text,
  p_display_name text,
  p_user_class text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  invite_row public.workspace_invites%rowtype;
begin
  if p_user_id is null or p_student_id !~ '^[0-9]{6}$' or p_user_class !~ '^[1-3]-[1-8]$' then
    raise exception 'INVALID_MEMBER_CONTEXT';
  end if;

  if not exists (
    select 1 from public.workspaces w
    where w.id = p_workspace_id and w.status = 'active'
  ) then
    raise exception 'WORKSPACE_NOT_ACTIVE';
  end if;

  if exists (
    select 1 from public.workspace_members m
    where m.workspace_id = p_workspace_id and m.user_id = p_user_id and m.status = 'active'
  ) then
    return 'already_member';
  end if;

  select * into invite_row
  from public.workspace_invites i
  where i.workspace_id = p_workspace_id
    and i.token_hash = p_token_hash
    and i.revoked_at is null
    and i.expires_at > now()
    and i.use_count < i.max_uses
  for update;

  if not found then
    raise exception 'INVITE_INVALID_OR_EXPIRED';
  end if;

  insert into public.workspace_members(workspace_id,user_id,student_id,display_name,user_class,member_role,status,joined_at,removed_at)
  values(p_workspace_id,p_user_id,p_student_id,p_display_name,p_user_class,'member','active',now(),null)
  on conflict(workspace_id,user_id) do update
    set student_id=excluded.student_id,
        display_name=excluded.display_name,
        user_class=excluded.user_class,
        member_role='member',
        status='active',
        joined_at=now(),
        removed_at=null;

  update public.workspace_invites set use_count=use_count+1,last_used_at=now()
  where id=invite_row.id;

  insert into public.workspace_audit_logs(workspace_id,actor_user_id,actor_type,action,target_type,details)
  values(p_workspace_id,p_user_id,'student','invite_redeemed','member',jsonb_build_object('invite_id',invite_row.id));

  return 'joined';
end;
$$;

revoke all on function public.redeem_workspace_invite(uuid,text,uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.redeem_workspace_invite(uuid,text,uuid,text,text,text) to service_role;
