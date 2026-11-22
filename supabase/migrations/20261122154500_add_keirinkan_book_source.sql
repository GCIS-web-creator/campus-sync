alter table public.student_my_books
  drop constraint if exists student_my_books_source_check;

alter table public.student_my_books
  add constraint student_my_books_source_check
  check (source = any (array[
    'openlibrary',
    'google-books',
    'openbd',
    'kirihara',
    'ndl',
    'keirinkan',
    'manual'
  ]::text[]));
