alter table public.campus_knowledge_questions drop constraint if exists campus_knowledge_questions_subject_code_check;
alter table public.campus_knowledge_questions add constraint campus_knowledge_questions_subject_code_check
check (subject_code is null or subject_code in ('math1','matha','math2','mathb','math3','mathc','chem_theory','chem_inorganic','chem_organic','chem_polymer'));
comment on table public.campus_knowledge_questions is 'CampusSyncの数学・化学問題バンク。単元・形式・出典・ライセンス・重複防止情報を保持する。';