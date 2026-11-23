alter table public.student_study_sessions
  add column if not exists book_id uuid references public.student_my_books(id) on delete set null;

create index if not exists student_study_sessions_book_started_idx
  on public.student_study_sessions (book_id, started_at desc)
  where book_id is not null;

create or replace function public.validate_student_study_session_book_owner()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if new.book_id is not null and not exists (
    select 1
    from public.student_my_books b
    where b.id = new.book_id
      and b.user_id = new.user_id
  ) then
    raise exception 'The selected book does not belong to this student.';
  end if;
  return new;
end;
$function$;

revoke all on function public.validate_student_study_session_book_owner() from public, anon;
drop trigger if exists validate_student_study_session_book_owner on public.student_study_sessions;
create trigger validate_student_study_session_book_owner
before insert or update of book_id, user_id
on public.student_study_sessions
for each row execute function public.validate_student_study_session_book_owner();
