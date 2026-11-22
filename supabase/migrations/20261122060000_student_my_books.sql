create table if not exists public.student_my_books (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  isbn13 text not null check (isbn13 ~ '^97[89][0-9]{10}$'),
  title text not null check (length(trim(title)) between 1 and 500),
  authors text[] not null default '{}',
  publisher text,
  published_date text,
  description text,
  thumbnail_url text,
  info_url text,
  page_count integer check (page_count is null or page_count > 0),
  source text not null default 'manual' check (source in ('openlibrary', 'google-books', 'manual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, isbn13)
);

create index if not exists student_my_books_user_created_idx
  on public.student_my_books (user_id, created_at desc);

alter table public.student_my_books enable row level security;

drop policy if exists "Students can view their own books" on public.student_my_books;
create policy "Students can view their own books"
  on public.student_my_books for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Students can add their own books" on public.student_my_books;
create policy "Students can add their own books"
  on public.student_my_books for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Students can update their own books" on public.student_my_books;
create policy "Students can update their own books"
  on public.student_my_books for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Students can delete their own books" on public.student_my_books;
create policy "Students can delete their own books"
  on public.student_my_books for delete to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.student_my_books to authenticated;
