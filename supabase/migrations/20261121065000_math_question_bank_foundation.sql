-- Extend CampusSync knowledge questions for the 1,000+ mathematics question bank.
-- Existing multiple-choice rows and the original five-argument RPC remain compatible.

alter table public.campus_knowledge_questions
  add column if not exists subject_code text,
  add column if not exists unit text not null default '未分類',
  add column if not exists question_type text not null default 'multiple_choice',
  add column if not exists correct_answer text,
  add column if not exists answer_tolerance numeric not null default 0,
  add column if not exists source_name text not null default 'CampusSyncオリジナル',
  add column if not exists source_url text,
  add column if not exists source_license text,
  add column if not exists source_attribution text,
  add column if not exists source_revision text,
  add column if not exists content_hash text;

alter table public.campus_knowledge_questions
  drop constraint if exists campus_knowledge_questions_options_check,
  drop constraint if exists campus_knowledge_questions_answer_in_options_check,
  alter column correct_option_id drop not null;

alter table public.campus_knowledge_questions
  add constraint campus_knowledge_questions_question_type_check
    check (question_type in ('multiple_choice', 'numeric', 'written')),
  add constraint campus_knowledge_questions_question_format_check
    check (
      (
        question_type = 'multiple_choice'
        and jsonb_typeof(options) = 'array'
        and jsonb_array_length(options) between 2 and 6
        and correct_option_id is not null
        and options @> jsonb_build_array(jsonb_build_object('id', correct_option_id))
      )
      or
      (
        question_type in ('numeric', 'written')
        and options = '[]'::jsonb
        and correct_option_id is null
        and correct_answer is not null
        and char_length(trim(correct_answer)) between 1 and 2000
      )
    ),
  add constraint campus_knowledge_questions_unit_check
    check (char_length(trim(unit)) between 1 and 120),
  add constraint campus_knowledge_questions_subject_code_check
    check (subject_code is null or subject_code ~ '^(math[1abc23]|math[23])$'),
  add constraint campus_knowledge_questions_answer_tolerance_check
    check (answer_tolerance >= 0 and answer_tolerance <= 1000000000000),
  add constraint campus_knowledge_questions_source_url_check
    check (source_url is null or source_url ~ '^https://'),
  add constraint campus_knowledge_questions_content_hash_check
    check (content_hash is null or content_hash ~ '^[0-9a-f]{64}$');

create unique index if not exists campus_knowledge_questions_content_hash_uidx
  on public.campus_knowledge_questions(content_hash)
  where content_hash is not null;

alter table public.campus_knowledge_attempts
  alter column selected_option_id drop not null,
  add column if not exists selected_answer text,
  add column if not exists is_graded boolean not null default true;

create index if not exists campus_knowledge_questions_subject_unit_idx
  on public.campus_knowledge_questions(subject_code, unit, difficulty, status);

create or replace function public.campus_submit_knowledge_attempt(
  p_user_id uuid,
  p_question_id uuid,
  p_client_attempt_id uuid,
  p_selected_option_id text,
  p_user_class text,
  p_selected_answer text default null
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
  v_is_correct boolean := false;
  v_is_graded boolean := true;
  v_xp integer := 0;
  v_awarded integer := 0;
  v_already_awarded boolean := false;
  v_selected_text text;
  v_correct_text text;
  v_answer_normalized text;
  v_growth jsonb;
begin
  if p_user_id is null or p_question_id is null or p_client_attempt_id is null then
    raise exception '回答情報を確認できません。';
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

  if v_question.question_type = 'multiple_choice' then
    if p_selected_option_id is null
      or p_selected_option_id !~ '^[a-z][a-z0-9_-]{0,11}$'
      or p_selected_answer is not null then
      raise exception '選択肢を選んでください。';
    end if;

    select o ->> 'text'
      into v_selected_text
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
  elsif v_question.question_type = 'numeric' then
    if p_selected_option_id is not null or p_selected_answer is null
      or char_length(trim(p_selected_answer)) not between 1 and 120 then
      raise exception '数値の解答を入力してください。';
    end if;
    v_answer_normalized := replace(replace(trim(p_selected_answer), '−', '-'), '，', ',');
    if v_answer_normalized !~ '^[+-]?([0-9]+(\.[0-9]*)?|\.[0-9]+)([eE][+-]?[0-9]+)?$' then
      raise exception '数値として読み取れる形式で入力してください。';
    end if;
    if v_question.correct_answer !~ '^[+-]?([0-9]+(\.[0-9]*)?|\.[0-9]+)([eE][+-]?[0-9]+)?$' then
      raise exception 'この問題の正答データに不備があります。';
    end if;
    v_is_correct := abs(v_answer_normalized::numeric - v_question.correct_answer::numeric)
      <= v_question.answer_tolerance;
    v_correct_text := v_question.correct_answer;
  else
    if p_selected_option_id is not null or p_selected_answer is null
      or char_length(trim(p_selected_answer)) not between 1 and 2000 then
      raise exception '解答を入力してください。';
    end if;
    -- Written responses are retained for the student's self-review. They are not
    -- automatically graded and therefore cannot grant knowledge XP.
    v_is_graded := false;
    v_is_correct := false;
    v_correct_text := v_question.correct_answer;
  end if;

  insert into public.campus_knowledge_attempts(
    user_id, question_id, client_attempt_id, selected_option_id,
    selected_answer, is_correct, is_graded, xp_awarded
  ) values (
    p_user_id, p_question_id, p_client_attempt_id, p_selected_option_id,
    case when v_question.question_type = 'multiple_choice' then null else trim(p_selected_answer) end,
    v_is_correct, v_is_graded, 0
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
      or v_existing.selected_option_id is distinct from p_selected_option_id
      or v_existing.selected_answer is distinct from case
        when v_question.question_type = 'multiple_choice' then null
        else trim(p_selected_answer)
      end then
      raise exception '同じ送信IDを別の回答に再利用できません。';
    end if;

    return jsonb_build_object(
      'success', true,
      'is_correct', v_existing.is_correct,
      'is_graded', v_existing.is_graded,
      'xp_awarded', v_existing.xp_awarded,
      'already_awarded', v_existing.is_correct and v_existing.xp_awarded = 0,
      'question_type', v_question.question_type,
      'correct_option_id', v_question.correct_option_id,
      'correct_option_text', v_correct_text,
      'correct_answer', case when v_question.question_type = 'multiple_choice' then null else v_correct_text end,
      'explanation', v_question.explanation,
      'replayed', true
    );
  end if;

  if v_is_graded and v_is_correct then
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
    'is_graded', v_is_graded,
    'xp_awarded', v_awarded,
    'already_awarded', v_already_awarded,
    'question_type', v_question.question_type,
    'correct_option_id', v_question.correct_option_id,
    'correct_option_text', v_correct_text,
    'correct_answer', case when v_question.question_type = 'multiple_choice' then null else v_correct_text end,
    'explanation', v_question.explanation,
    'growth', v_growth,
    'replayed', false
  );
end;
$function$;

revoke all on function public.campus_submit_knowledge_attempt(uuid, uuid, uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.campus_submit_knowledge_attempt(uuid, uuid, uuid, text, text, text)
  to service_role;

comment on table public.campus_knowledge_questions is
  'CampusSync知識問題バンク。数学問題の単元・形式・出典・ライセンス・重複防止情報を含む。';
comment on function public.campus_submit_knowledge_attempt(uuid, uuid, uuid, text, text, text) is
  '公開問題をサーバー採点し、選択式・数値式の初回正解のみXP付与。記述式は自己確認用でXP対象外。';
