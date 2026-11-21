-- CampusSync Phase 3: student contribution submissions and Admin-reviewed contribution XP.
-- Existing contribution_scores / contribution_history remain untouched.

create table if not exists public.campus_contribution_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  activity_title text not null check (char_length(trim(activity_title)) between 3 and 120),
  activity_date date not null,
  description text not null check (char_length(trim(description)) between 10 and 2000),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'returned', 'withdrawn')),
  xp_amount integer check (xp_amount is null or xp_amount in (10, 25, 50)),
  review_reason text,
  reviewer_label text,
  reviewed_at timestamptz,
  xp_ledger_entry_id uuid unique references public.campus_xp_ledger(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campus_contribution_submission_approval_shape_check check (
    (status = 'approved' and xp_amount in (10, 25, 50) and xp_ledger_entry_id is not null and reviewed_at is not null)
    or
    (status <> 'approved' and xp_ledger_entry_id is null)
  )
);

create index if not exists campus_contribution_submissions_user_created_idx
  on public.campus_contribution_submissions(user_id, created_at desc);
create index if not exists campus_contribution_submissions_status_created_idx
  on public.campus_contribution_submissions(status, created_at asc);
create unique index if not exists campus_contribution_submissions_active_activity_unique
  on public.campus_contribution_submissions(user_id, activity_date, lower(trim(activity_title)))
  where status in ('pending', 'approved', 'returned');

create table if not exists public.campus_contribution_review_events (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.campus_contribution_submissions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null
    check (event_type in ('submitted', 'resubmitted', 'withdrawn', 'approved', 'rejected', 'returned')),
  from_status text check (from_status is null or from_status in ('pending', 'approved', 'rejected', 'returned', 'withdrawn')),
  to_status text not null check (to_status in ('pending', 'approved', 'rejected', 'returned', 'withdrawn')),
  xp_amount integer check (xp_amount is null or xp_amount in (10, 25, 50)),
  reason text not null default '',
  actor_label text not null default '生徒',
  created_at timestamptz not null default now()
);

create index if not exists campus_contribution_review_events_user_created_idx
  on public.campus_contribution_review_events(user_id, created_at desc);
create index if not exists campus_contribution_review_events_submission_created_idx
  on public.campus_contribution_review_events(submission_id, created_at asc);

alter table public.campus_contribution_submissions enable row level security;
alter table public.campus_contribution_review_events enable row level security;

revoke all on table public.campus_contribution_submissions from anon, authenticated;
revoke all on table public.campus_contribution_review_events from anon, authenticated;
grant select on table public.campus_contribution_submissions to authenticated;
grant select on table public.campus_contribution_review_events to authenticated;
grant select, insert, update on table public.campus_contribution_submissions to service_role;
grant select, insert on table public.campus_contribution_review_events to service_role;

drop policy if exists campus_contribution_submissions_owner_read on public.campus_contribution_submissions;
create policy campus_contribution_submissions_owner_read
  on public.campus_contribution_submissions for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists campus_contribution_review_events_owner_read on public.campus_contribution_review_events;
create policy campus_contribution_review_events_owner_read
  on public.campus_contribution_review_events for select to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.campus_submit_contribution(
  p_user_id uuid, p_activity_title text, p_activity_date date, p_description text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_submission public.campus_contribution_submissions%rowtype;
begin
  if p_user_id is null then raise exception '申請者を確認できません。'; end if;
  if p_activity_title is null or char_length(trim(p_activity_title)) not between 3 and 120 then
    raise exception '活動名は3〜120文字で入力してください。';
  end if;
  if p_activity_date is null then raise exception '活動日を入力してください。'; end if;
  if p_description is null or char_length(trim(p_description)) not between 10 and 2000 then
    raise exception '活動内容は10〜2000文字で入力してください。';
  end if;

  insert into public.campus_contribution_submissions(user_id, activity_title, activity_date, description)
  values (p_user_id, trim(p_activity_title), p_activity_date, trim(p_description))
  returning * into v_submission;

  insert into public.campus_contribution_review_events(
    submission_id, user_id, event_type, from_status, to_status, reason, actor_label
  ) values (v_submission.id, p_user_id, 'submitted', null, 'pending', '', '生徒');

  return jsonb_build_object('success', true, 'submission_id', v_submission.id, 'status', v_submission.status);
end;
$function$;

create or replace function public.campus_update_contribution_submission(
  p_user_id uuid,
  p_submission_id uuid,
  p_action text,
  p_activity_title text default null,
  p_activity_date date default null,
  p_description text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_submission public.campus_contribution_submissions%rowtype;
  v_next_status text;
  v_event_type text;
begin
  if p_user_id is null or p_submission_id is null then raise exception '申請を確認できません。'; end if;

  select * into v_submission
  from public.campus_contribution_submissions
  where id = p_submission_id and user_id = p_user_id
  for update;
  if not found then raise exception '申請が見つかりません。'; end if;

  if p_action = 'withdraw' then
    if v_submission.status <> 'pending' then raise exception '審査待ちの申請だけ取り下げできます。'; end if;
    v_next_status := 'withdrawn';
    v_event_type := 'withdrawn';
    update public.campus_contribution_submissions
      set status = v_next_status, updated_at = now()
      where id = v_submission.id;
  elsif p_action = 'resubmit' then
    if v_submission.status <> 'returned' then raise exception '差し戻された申請だけ再提出できます。'; end if;
    if p_activity_title is null or char_length(trim(p_activity_title)) not between 3 and 120 then
      raise exception '活動名は3〜120文字で入力してください。';
    end if;
    if p_activity_date is null then raise exception '活動日を入力してください。'; end if;
    if p_description is null or char_length(trim(p_description)) not between 10 and 2000 then
      raise exception '活動内容は10〜2000文字で入力してください。';
    end if;
    v_next_status := 'pending';
    v_event_type := 'resubmitted';
    update public.campus_contribution_submissions
      set activity_title = trim(p_activity_title),
          activity_date = p_activity_date,
          description = trim(p_description),
          status = v_next_status,
          xp_amount = null,
          review_reason = null,
          reviewer_label = null,
          reviewed_at = null,
          xp_ledger_entry_id = null,
          updated_at = now()
      where id = v_submission.id;
  else
    raise exception '申請操作が正しくありません。';
  end if;

  insert into public.campus_contribution_review_events(
    submission_id, user_id, event_type, from_status, to_status, reason, actor_label
  ) values (v_submission.id, p_user_id, v_event_type, v_submission.status, v_next_status, '', '生徒');

  return jsonb_build_object('success', true, 'status', v_next_status);
end;
$function$;

create or replace function public.campus_review_contribution_submission(
  p_submission_id uuid,
  p_decision text,
  p_xp_amount integer default null,
  p_review_reason text default '',
  p_reviewer_label text default 'CampusSync Admin'
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_submission public.campus_contribution_submissions%rowtype;
  v_planet_id uuid;
  v_ledger_id uuid;
  v_growth jsonb;
  v_next_status text;
  v_reason text := left(trim(coalesce(p_review_reason, '')), 500);
  v_actor text := left(trim(coalesce(p_reviewer_label, 'CampusSync Admin')), 100);
begin
  if p_submission_id is null then raise exception '審査対象を確認できません。'; end if;
  if p_decision is null or p_decision not in ('approve', 'reject', 'return') then
    raise exception '審査操作が正しくありません。';
  end if;
  if p_decision = 'approve' and (p_xp_amount is null or p_xp_amount not in (10, 25, 50)) then
    raise exception 'XPは10・25・50から選択してください。';
  end if;
  if p_decision <> 'approve' and char_length(v_reason) < 5 then
    raise exception '却下・差し戻しには5文字以上の理由が必要です。';
  end if;
  if v_actor = '' then v_actor := 'CampusSync Admin'; end if;

  select * into v_submission
  from public.campus_contribution_submissions
  where id = p_submission_id
  for update;
  if not found then raise exception '申請が見つかりません。'; end if;
  if v_submission.status <> 'pending' then
    raise exception 'この申請はすでに審査済み、または取り下げ済みです。';
  end if;

  v_next_status := case p_decision when 'approve' then 'approved' when 'reject' then 'rejected' else 'returned' end;

  if p_decision = 'approve' then
    insert into public.campus_planets(user_id)
    values (v_submission.user_id)
    on conflict (user_id) do nothing;

    select p.id into v_planet_id
    from public.campus_planets p
    where p.user_id = v_submission.user_id
    for update;

    insert into public.campus_planet_growth(planet_id, user_id)
    values (v_planet_id, v_submission.user_id)
    on conflict (planet_id) do nothing;

    insert into public.campus_xp_ledger(
      user_id, planet_id, xp_type, amount, source_type, source_id, source_date, credited_seconds, reason
    )
    values (
      v_submission.user_id, v_planet_id, 'contribution', p_xp_amount,
      'campus_contribution_submission', v_submission.id,
      v_submission.activity_date, 0, '学校貢献: ' || v_submission.activity_title
    )
    on conflict (user_id, xp_type, source_type, source_id) do nothing
    returning id into v_ledger_id;

    if v_ledger_id is null then
      select l.id into v_ledger_id
      from public.campus_xp_ledger l
      where l.user_id = v_submission.user_id
        and l.xp_type = 'contribution'
        and l.source_type = 'campus_contribution_submission'
        and l.source_id = v_submission.id;
    end if;
    if v_ledger_id is null then raise exception '学校貢献XPの台帳登録に失敗しました。'; end if;
  end if;

  update public.campus_contribution_submissions
  set status = v_next_status,
      xp_amount = case when p_decision = 'approve' then p_xp_amount else null end,
      review_reason = case when v_reason = '' then null else v_reason end,
      reviewer_label = v_actor,
      reviewed_at = now(),
      xp_ledger_entry_id = case when p_decision = 'approve' then v_ledger_id else null end,
      updated_at = now()
  where id = v_submission.id;

  insert into public.campus_contribution_review_events(
    submission_id, user_id, event_type, from_status, to_status, xp_amount, reason, actor_label
  )
  values (
    v_submission.id, v_submission.user_id, v_next_status, v_submission.status, v_next_status,
    case when p_decision = 'approve' then p_xp_amount else null end, v_reason, v_actor
  );

  if p_decision = 'approve' then
    v_growth := public.campus_rebuild_planet_growth(v_submission.user_id);
  end if;

  return jsonb_build_object(
    'success', true,
    'status', v_next_status,
    'xp_amount', case when p_decision = 'approve' then p_xp_amount else null end,
    'growth', v_growth
  );
end;
$function$;

revoke all on function public.campus_submit_contribution(uuid, text, date, text) from public, anon, authenticated;
revoke all on function public.campus_update_contribution_submission(uuid, uuid, text, text, date, text) from public, anon, authenticated;
revoke all on function public.campus_review_contribution_submission(uuid, text, integer, text, text) from public, anon, authenticated;
grant execute on function public.campus_submit_contribution(uuid, text, date, text) to service_role;
grant execute on function public.campus_update_contribution_submission(uuid, uuid, text, text, date, text) to service_role;
grant execute on function public.campus_review_contribution_submission(uuid, text, integer, text, text) to service_role;

comment on table public.campus_contribution_submissions is
  '生徒の学校貢献活動申請。Admin承認前にXPは付与されない。';
comment on table public.campus_contribution_review_events is
  '学校貢献申請の提出・再提出・取り下げ・審査結果を追記保存する監査履歴。';
comment on function public.campus_review_contribution_submission(uuid, text, integer, text, text) is
  'Admin承認と学校貢献XP付与を同一トランザクションで実行する。';
