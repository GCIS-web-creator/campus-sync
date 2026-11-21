-- CampusSync Planet Civilization Phase 4: server-graded knowledge questions and first-correct XP.
-- Additive only. Existing mini_test_events, student_study_sessions, and Planetube data remain untouched.

create table if not exists public.campus_knowledge_questions (
  id uuid primary key default gen_random_uuid(),
  subject text not null check (char_length(trim(subject)) between 1 and 80),
  title text not null check (char_length(trim(title)) between 1 and 160),
  prompt text not null check (char_length(trim(prompt)) between 1 and 4000),
  options jsonb not null check (
    case when jsonb_typeof(options) = 'array'
      then jsonb_array_length(options) between 2 and 6
      else false
    end
  ),
  correct_option_id text not null check (correct_option_id ~ '^[a-z][a-z0-9_-]{0,11}$'),
  explanation text not null default '' check (char_length(explanation) <= 2000),
  difficulty text not null default 'normal'
    check (difficulty in ('normal', 'advanced', 'challenge')),
  target_class text not null default 'all'
    check (char_length(trim(target_class)) between 1 and 80),
  status text not null default 'draft'
    check (status in ('draft', 'published', 'archived')),
  created_by_label text not null default 'CampusSync Admin',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  constraint campus_knowledge_questions_answer_in_options_check
    check (options @> jsonb_build_array(jsonb_build_object('id', correct_option_id)))
);

create index if not exists campus_knowledge_questions_published_idx
  on public.campus_knowledge_questions(status, subject, created_at desc);

create table if not exists public.campus_knowledge_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id uuid not null references public.campus_knowledge_questions(id) on delete restrict,
  client_attempt_id uuid not null,
  selected_option_id text not null check (selected_option_id ~ '^[a-z][a-z0-9_-]{0,11}$'),
  is_correct boolean not null,
  xp_awarded integer not null default 0 check (xp_awarded in (0, 2, 4, 6)),
  attempted_at timestamptz not null default now(),
  constraint campus_knowledge_attempt_user_request_unique unique(user_id, client_attempt_id)
);

create index if not exists campus_knowledge_attempts_user_time_idx
  on public.campus_knowledge_attempts(user_id, attempted_at desc);
create index if not exists campus_knowledge_attempts_user_question_idx
  on public.campus_knowledge_attempts(user_id, question_id, attempted_at desc);

alter table public.campus_knowledge_questions enable row level security;
alter table public.campus_knowledge_attempts enable row level security;

-- The answer key and attempt ledger are private server-side data. Students use the
-- authenticated app API; neither table is directly exposed through the Data API.
revoke all on table public.campus_knowledge_questions from public, anon, authenticated, service_role;
revoke all on table public.campus_knowledge_attempts from public, anon, authenticated, service_role;
grant select, insert, update on table public.campus_knowledge_questions to service_role;
grant select, insert, update on table public.campus_knowledge_attempts to service_role;

create or replace function public.campus_submit_knowledge_attempt(
  p_user_id uuid,
  p_question_id uuid,
  p_client_attempt_id uuid,
  p_selected_option_id text,
  p_user_class text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_question public.campus_knowledge_questions%rowtype;
  v_existing public.campus_knowledge_attempts%rowtype;
  v_attempt_id uuid;
  v_planet_id uuid;
  v_ledger_id uuid;
  v_is_correct boolean;
  v_xp integer := 0;
  v_awarded integer := 0;
  v_already_awarded boolean := false;
  v_option_text text;
  v_correct_text text;
  v_growth jsonb;
begin
  if p_user_id is null or p_question_id is null or p_client_attempt_id is null then
    raise exception '回答情報を確認できません。';
  end if;
  if p_selected_option_id is null
    or p_selected_option_id !~ '^[a-z][a-z0-9_-]{0,11}$' then
    raise exception '選択肢を確認できません。';
  end if;

  select *
    into v_question
  from public.campus_knowledge_questions q
  where q.id = p_question_id
    and q.status = 'published';

  if not found then
    raise exception 'この問題は現在公開されていません。';
  end if;
  if v_question.target_class <> 'all'
    and v_question.target_class <> coalesce(nullif(trim(p_user_class), ''), '__no_class__') then
    raise exception 'この問題は対象クラス向けではありません。';
  end if;

  select o ->> 'text'
    into v_option_text
  from jsonb_array_elements(v_question.options) as option_row(o)
  where o ->> 'id' = p_selected_option_id;
  if not found then
    raise exception '選択肢が正しくありません。';
  end if;

  v_is_correct := p_selected_option_id = v_question.correct_option_id;
  select o ->> 'text'
    into v_correct_text
  from jsonb_array_elements(v_question.options) as option_row(o)
  where o ->> 'id' = v_question.correct_option_id;

  -- One request UUID is an idempotency key. Replaying it returns the original result.
  insert into public.campus_knowledge_attempts(
    user_id, question_id, client_attempt_id, selected_option_id, is_correct, xp_awarded
  ) values (
    p_user_id, p_question_id, p_client_attempt_id, p_selected_option_id, v_is_correct, 0
  )
  on conflict (user_id, client_attempt_id) do nothing
  returning id into v_attempt_id;

  if v_attempt_id is null then
    select *
      into v_existing
    from public.campus_knowledge_attempts a
    where a.user_id = p_user_id
      and a.client_attempt_id = p_client_attempt_id;
    if not found
      or v_existing.question_id <> p_question_id
      or v_existing.selected_option_id <> p_selected_option_id then
      raise exception '同じ送信IDを別の回答に再利用できません。';
    end if;

    return jsonb_build_object(
      'success', true,
      'is_correct', v_existing.is_correct,
      'xp_awarded', v_existing.xp_awarded,
      'already_awarded', v_existing.is_correct and v_existing.xp_awarded = 0,
      'correct_option_id', v_question.correct_option_id,
      'correct_option_text', v_correct_text,
      'explanation', v_question.explanation,
      'replayed', true
    );
  end if;

  if v_is_correct then
    v_xp := case v_question.difficulty
      when 'normal' then 2
      when 'advanced' then 4
      when 'challenge' then 6
      else 2
    end;

    insert into public.campus_planets(user_id)
    values (p_user_id)
    on conflict (user_id) do nothing;

    select p.id
      into v_planet_id
    from public.campus_planets p
    where p.user_id = p_user_id
    for update;

    if v_planet_id is null then
      raise exception '惑星データを準備できませんでした。';
    end if;

    insert into public.campus_planet_growth(planet_id, user_id)
    values (v_planet_id, p_user_id)
    on conflict (planet_id) do nothing;

    insert into public.campus_xp_ledger(
      user_id, planet_id, xp_type, amount, source_type, source_id,
      source_date, credited_seconds, reason, rule_version
    ) values (
      p_user_id, v_planet_id, 'knowledge', v_xp,
      'campus_knowledge_question', p_question_id,
      (now() at time zone 'Asia/Tokyo')::date, 0,
      '知識問題の初回正解: ' || v_question.title, 1
    )
    on conflict (user_id, xp_type, source_type, source_id) do nothing
    returning id into v_ledger_id;

    if v_ledger_id is not null then
      v_awarded := v_xp;
      update public.campus_knowledge_attempts
      set xp_awarded = v_awarded
      where id = v_attempt_id;

      v_growth := public.campus_rebuild_planet_growth(p_user_id);
    else
      v_already_awarded := true;
    end if;
  end if;

  return jsonb_build_object(
    'success', true,
    'is_correct', v_is_correct,
    'xp_awarded', v_awarded,
    'already_awarded', v_already_awarded,
    'correct_option_id', v_question.correct_option_id,
    'correct_option_text', v_correct_text,
    'explanation', v_question.explanation,
    'growth', v_growth,
    'replayed', false
  );
end;
$function$;

revoke all on function public.campus_submit_knowledge_attempt(uuid, uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.campus_submit_knowledge_attempt(uuid, uuid, uuid, text, text)
  to service_role;

comment on table public.campus_knowledge_questions is
  'CampusSyncの知識XP問題バンク。正答キーはサーバー専用で、生徒APIには返さない。';
comment on table public.campus_knowledge_attempts is
  '知識問題の回答履歴と初回正解XP。生徒は本人の履歴のみサーバーAPI経由で参照する。';
comment on function public.campus_submit_knowledge_attempt(uuid, uuid, uuid, text, text) is
  '公開済み問題をサーバー採点し、同一ユーザー・同一問題の初回正解にのみ2/4/6知識XPを付与する。';
