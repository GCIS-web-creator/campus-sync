-- CampusSync Planet Civilization Phase 4: per-question knowledge XP weights and numeric grading fix.
-- Additive only. Existing attempts, learning records, contribution data, and Planetube are untouched.

alter table public.campus_knowledge_questions
  add column if not exists xp_weight integer;

update public.campus_knowledge_questions
set xp_weight = case difficulty
  when 'normal' then 2
  when 'advanced' then 4
  when 'challenge' then 6
  else 2
end
where xp_weight is null;

alter table public.campus_knowledge_questions
  alter column xp_weight set default 2,
  alter column xp_weight set not null;

do $add_question_weight_check$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.campus_knowledge_questions'::regclass
      and conname = 'campus_knowledge_questions_xp_weight_check'
  ) then
    alter table public.campus_knowledge_questions
      add constraint campus_knowledge_questions_xp_weight_check
      check (xp_weight between 1 and 100);
  end if;
end
$add_question_weight_check$;

alter table public.campus_knowledge_attempts
  drop constraint if exists campus_knowledge_attempts_xp_awarded_check;

alter table public.campus_knowledge_attempts
  add constraint campus_knowledge_attempts_xp_awarded_check
  check (xp_awarded between 0 and 100);

-- Keep the deployed server-only function's auth, class checks, idempotency and
-- transaction logic; change only its numeric parser and XP source.
do $phase4_function_upgrade$
declare
  v_definition text;
  v_start integer;
  v_end integer;
  v_end_marker text := 'v_correct_text := v_question.correct_answer;';
  v_old_xp text := $oldxp$v_xp := case v_question.difficulty
      when 'normal' then 2
      when 'advanced' then 4
      when 'challenge' then 6
      else 2
    end;$oldxp$;
  v_new_xp text := $newxp$v_xp := v_question.xp_weight;$newxp$;
  v_new_numeric_block text := $numeric$
    if v_answer_normalized ~ '^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)$' then
      v_answer_value := v_answer_normalized::numeric;
    elsif v_answer_normalized ~ '^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)/[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)$' then
      v_denominator := split_part(v_answer_normalized, '/', 2)::numeric;
      if v_denominator = 0 then
        raise exception '分母に0は使えません。';
      end if;
      v_answer_value := split_part(v_answer_normalized, '/', 1)::numeric / v_denominator;
    else
      raise exception '数値または分数として読み取れる形式で入力してください。';
    end if;

    if v_question.correct_answer !~ '^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)$' then
      raise exception 'この問題の正答データに不備があります。';
    end if;

    v_is_correct := abs(v_answer_value - v_question.correct_answer::numeric)
      <= v_question.answer_tolerance;
    v_correct_text := v_question.correct_answer;$numeric$;
begin
  v_definition := pg_get_functiondef(
    'public.campus_submit_knowledge_attempt(uuid,uuid,uuid,text,text,text)'::regprocedure
  );

  if position('v_answer_normalized text;' in v_definition) = 0 then
    raise exception 'Phase 4 grading function declaration changed; inspect before upgrading.';
  end if;
  if position('v_answer_value numeric;' in v_definition) = 0 then
    v_definition := replace(
      v_definition,
      'v_answer_normalized text;',
      'v_answer_normalized text;' || E'\n  v_answer_value numeric;\n  v_denominator numeric;'
    );
  end if;

  v_start := position('if v_answer_normalized !~' in v_definition);
  if v_start = 0 then
    raise exception 'Phase 4 numeric grading block not found; inspect before upgrading.';
  end if;
  v_end := position(v_end_marker in substring(v_definition from v_start));
  if v_end = 0 then
    raise exception 'Phase 4 numeric grading block end not found; inspect before upgrading.';
  end if;
  v_end := v_start + v_end + length(v_end_marker) - 2;
  v_definition := overlay(
    v_definition
    placing v_new_numeric_block
    from v_start
    for v_end - v_start + 1
  );

  if position(v_old_xp in v_definition) = 0 then
    raise exception 'Phase 4 difficulty XP expression not found; inspect before upgrading.';
  end if;
  v_definition := replace(v_definition, v_old_xp, v_new_xp);

  v_definition := replace(
    v_definition,
    'v_answer_normalized := replace(trim(p_selected_answer), ''−'', ''-'');',
    'v_answer_normalized := replace(replace(trim(p_selected_answer), ''−'', ''-''), '','', '''');'
  );

  execute v_definition;
end
$phase4_function_upgrade$;

comment on column public.campus_knowledge_questions.xp_weight is
  '問題ごとの知識XP。初回正解時に1〜100 XPを一度だけ付与する。';
comment on column public.campus_knowledge_attempts.xp_awarded is
  '当該回答により初回正解として実際に付与された知識XP。再挑戦は0。';
