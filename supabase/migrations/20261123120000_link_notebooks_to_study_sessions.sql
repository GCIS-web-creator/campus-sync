alter table public.student_study_sessions
  add column if not exists notebook_id uuid references public.student_notebooks(id) on delete set null;

create index if not exists student_study_sessions_notebook_started_idx
  on public.student_study_sessions (notebook_id, started_at desc)
  where notebook_id is not null;

create or replace function public.validate_student_study_session_notebook_owner()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if new.notebook_id is not null and not exists (
    select 1 from public.student_notebooks n
    where n.id = new.notebook_id and n.user_id = new.user_id
  ) then
    raise exception 'The selected notebook does not belong to this student.';
  end if;
  return new;
end;
$function$;

revoke all on function public.validate_student_study_session_notebook_owner() from public, anon;
drop trigger if exists validate_student_study_session_notebook_owner on public.student_study_sessions;
create trigger validate_student_study_session_notebook_owner
before insert or update of notebook_id, user_id
on public.student_study_sessions
for each row execute function public.validate_student_study_session_notebook_owner();
