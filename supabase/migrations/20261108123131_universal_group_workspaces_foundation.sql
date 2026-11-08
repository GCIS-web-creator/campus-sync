create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 60),
  slug text not null unique,
  category text not null check (category in ('club','committee','event','project','study','research','volunteer','other')),
  description text not null default '' check (char_length(description) <= 800),
  visibility text not null default 'listed' check (visibility in ('listed','unlisted')),
  join_mode text not null default 'approval' check (join_mode in ('invite_only','approval','open')),
  is_official boolean not null default false,
  status text not null default 'active' check (status in ('active','archived','suspended')),
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  created_by uuid not null references auth.users(id) on delete restrict,
  adviser_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table if not exists public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  student_id text not null check (student_id ~ '^[0-9]{6}$'),
  display_name text not null check (char_length(trim(display_name)) between 1 and 80),
  user_class text not null check (user_class ~ '^[1-3]-[1-8]$'),
  member_role text not null default 'member' check (member_role in ('owner','admin','editor','member','adviser')),
  status text not null default 'active' check (status in ('active','removed')),
  joined_at timestamptz not null default now(),
  removed_at timestamptz,
  unique (workspace_id,user_id)
);

create table if not exists public.workspace_join_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  student_id text not null check (student_id ~ '^[0-9]{6}$'),
  display_name text not null,
  user_class text not null check (user_class ~ '^[1-3]-[1-8]$'),
  message text not null default '' check (char_length(message) <= 300),
  status text not null default 'pending' check (status in ('pending','approved','rejected','withdrawn')),
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  unique(workspace_id,user_id)
);

create table if not exists public.workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid not null references auth.users(id) on delete restrict,
  expires_at timestamptz not null,
  max_uses integer not null default 1 check (max_uses between 1 and 50),
  use_count integer not null default 0 check (use_count >= 0 and use_count <= max_uses),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

create table if not exists public.workspace_posts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  author_user_id uuid not null references auth.users(id) on delete restrict,
  title text not null check (char_length(trim(title)) between 1 and 160),
  body text not null default '' check (char_length(body) <= 10000),
  is_pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.workspace_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  sender_user_id uuid not null references auth.users(id) on delete restrict,
  body text not null check (char_length(trim(body)) between 1 and 5000),
  reply_to_id uuid references public.workspace_messages(id) on delete set null,
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.workspace_message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.workspace_messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reaction text not null check (reaction in ('like','heart','laugh','surprised','check')),
  created_at timestamptz not null default now(),
  unique(message_id,user_id,reaction)
);

create table if not exists public.workspace_files (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  uploaded_by uuid not null references auth.users(id) on delete restrict,
  folder_path text not null default '' check (char_length(folder_path) <= 500),
  file_name text not null check (char_length(trim(file_name)) between 1 and 240),
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('application/pdf','image/png','image/jpeg','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.openxmlformats-officedocument.presentationml.presentation','text/plain','text/csv')),
  file_size bigint not null check (file_size > 0 and file_size <= 20971520),
  description text not null default '' check (char_length(description) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.workspace_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  title text not null check (char_length(trim(title)) between 1 and 160),
  description text not null default '' check (char_length(description) <= 5000),
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text not null default '' check (char_length(location) <= 240),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  canceled_at timestamptz,
  check (ends_at is null or ends_at >= starts_at)
);

create table if not exists public.workspace_event_rsvps (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.workspace_events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  response text not null check (response in ('attending','maybe','not_attending')),
  updated_at timestamptz not null default now(),
  unique(event_id,user_id)
);

create table if not exists public.workspace_tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  title text not null check (char_length(trim(title)) between 1 and 200),
  description text not null default '' check (char_length(description) <= 5000),
  status text not null default 'todo' check (status in ('todo','in_progress','review','done')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  deleted_at timestamptz
);

create table if not exists public.workspace_task_assignees (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.workspace_tasks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  assigned_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(task_id,user_id)
);

create table if not exists public.workspace_task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.workspace_tasks(id) on delete cascade,
  author_user_id uuid not null references auth.users(id) on delete restrict,
  body text not null check (char_length(trim(body)) between 1 and 3000),
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz
);

create table if not exists public.workspace_minutes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  author_user_id uuid not null references auth.users(id) on delete restrict,
  title text not null check (char_length(trim(title)) between 1 and 160),
  meeting_at timestamptz not null,
  attendees text[] not null default '{}',
  agenda text not null default '' check (char_length(agenda) <= 5000),
  discussion text not null default '' check (char_length(discussion) <= 12000),
  decisions text not null default '' check (char_length(decisions) <= 8000),
  action_items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (jsonb_typeof(action_items) = 'array')
);

create table if not exists public.workspace_reports (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  reporter_user_id uuid not null references auth.users(id) on delete restrict,
  target_type text not null check (target_type in ('workspace','post','message','file','member')),
  target_id uuid,
  reason text not null check (reason in ('spam','harassment','inappropriate','impersonation','other')),
  details text not null default '' check (char_length(details) <= 2000),
  status text not null default 'open' check (status in ('open','reviewing','resolved','dismissed')),
  reviewed_by_admin boolean not null default false,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create table if not exists public.workspace_audit_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_type text not null default 'student' check (actor_type in ('student','admin','system')),
  action text not null check (char_length(action) between 1 and 80),
  target_type text not null default '' check (char_length(target_type) <= 80),
  target_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.workspace_notifications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  notification_type text not null check (notification_type in ('message','mention','task_assigned','task_due','event_created','event_changed','post_pinned','join_request','join_approved')),
  title text not null check (char_length(title) between 1 and 160),
  body text not null default '' check (char_length(body) <= 500),
  reference_id uuid,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_workspace_members_user_status on public.workspace_members(user_id,status);
create index if not exists idx_workspace_members_workspace_status on public.workspace_members(workspace_id,status);
create index if not exists idx_workspaces_status_visibility on public.workspaces(status,visibility,created_at desc);
create index if not exists idx_workspace_requests_workspace_status on public.workspace_join_requests(workspace_id,status,requested_at desc);
create index if not exists idx_workspace_requests_user on public.workspace_join_requests(user_id,status);
create index if not exists idx_workspace_invites_workspace on public.workspace_invites(workspace_id,expires_at) where revoked_at is null;
create index if not exists idx_workspace_posts_recent on public.workspace_posts(workspace_id,created_at desc) where deleted_at is null;
create index if not exists idx_workspace_messages_recent on public.workspace_messages(workspace_id,created_at desc) where deleted_at is null;
create index if not exists idx_workspace_files_recent on public.workspace_files(workspace_id,created_at desc) where deleted_at is null;
create index if not exists idx_workspace_events_upcoming on public.workspace_events(workspace_id,starts_at) where canceled_at is null;
create index if not exists idx_workspace_tasks_status_due on public.workspace_tasks(workspace_id,status,due_at) where deleted_at is null;
create index if not exists idx_workspace_minutes_recent on public.workspace_minutes(workspace_id,meeting_at desc) where deleted_at is null;
create index if not exists idx_workspace_notifications_recipient on public.workspace_notifications(recipient_user_id,is_read,created_at desc);
create index if not exists idx_workspace_reports_open on public.workspace_reports(status,created_at desc);

do $$
declare
  table_name text;
  protected_tables text[] := array[
    'workspaces','workspace_members','workspace_join_requests','workspace_invites',
    'workspace_posts','workspace_messages','workspace_message_reactions','workspace_files',
    'workspace_events','workspace_event_rsvps','workspace_tasks','workspace_task_assignees',
    'workspace_task_comments','workspace_minutes','workspace_reports','workspace_audit_logs',
    'workspace_notifications'
  ];
begin
  foreach table_name in array protected_tables loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from anon, authenticated', table_name);
    execute format('grant all on table public.%I to service_role', table_name);
  end loop;
end $$;

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

create or replace function public.transfer_workspace_owner(
  p_workspace_id uuid,
  p_actor_user_id uuid,
  p_target_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_owner uuid;
begin
  select owner_user_id into current_owner from public.workspaces where id=p_workspace_id and status='active' for update;
  if current_owner is null or current_owner <> p_actor_user_id then
    raise exception 'OWNER_ONLY';
  end if;
  if p_target_user_id = p_actor_user_id then
    raise exception 'SAME_OWNER';
  end if;
  if not exists (
    select 1 from public.workspace_members
    where workspace_id=p_workspace_id and user_id=p_target_user_id and status='active'
  ) then
    raise exception 'TARGET_NOT_MEMBER';
  end if;

  update public.workspace_members set member_role='member'
  where workspace_id=p_workspace_id and user_id=p_actor_user_id and status='active';
  update public.workspace_members set member_role='owner'
  where workspace_id=p_workspace_id and user_id=p_target_user_id and status='active';
  update public.workspaces set owner_user_id=p_target_user_id,updated_at=now() where id=p_workspace_id;
  insert into public.workspace_audit_logs(workspace_id,actor_user_id,actor_type,action,target_type,target_id)
  values(p_workspace_id,p_actor_user_id,'student','owner_transferred','member',null);
  return true;
end;
$$;

revoke all on function public.redeem_workspace_invite(uuid,text,uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.redeem_workspace_invite(uuid,text,uuid,text,text,text) to service_role;
revoke all on function public.transfer_workspace_owner(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.transfer_workspace_owner(uuid,uuid,uuid) to service_role;
