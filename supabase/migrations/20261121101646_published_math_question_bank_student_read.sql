grant select on public.campus_knowledge_questions to authenticated;

drop policy if exists campus_knowledge_questions_published_authenticated_read
  on public.campus_knowledge_questions;

create policy campus_knowledge_questions_published_authenticated_read
  on public.campus_knowledge_questions
  for select to authenticated
  using (status = 'published');

comment on policy campus_knowledge_questions_published_authenticated_read
  on public.campus_knowledge_questions
  is 'ログイン済みの生徒は公開済みの学習問題のみ閲覧できる。';
