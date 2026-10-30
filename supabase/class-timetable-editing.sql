-- CampusSync 7組・8組の時間割編集テーブル。初回保存までは現行コードのデータを初期表示します。
begin;
create table if not exists public.class_timetable_slots(group_name text not null check(group_name in('7組','8組')),day_key text not null check(day_key in('Mon','Tue','Wed','Thu','Fri')),period smallint not null check(period between 1 and 8),subject text not null default '',teacher text not null default '',updated_at timestamptz not null default now(),primary key(group_name,day_key,period),constraint class_timetable_subject_length check(char_length(subject)<=120),constraint class_timetable_teacher_length check(char_length(teacher)<=120));
alter table public.class_timetable_slots enable row level security;
revoke all on public.class_timetable_slots from public,anon,authenticated;
grant select on public.class_timetable_slots to anon,authenticated;
grant all on public.class_timetable_slots to service_role;
drop policy if exists class_timetable_slots_read_public on public.class_timetable_slots;
create policy class_timetable_slots_read_public on public.class_timetable_slots for select to anon,authenticated using(true);
create or replace function public.replace_campussync_class_timetable(p_rows jsonb) returns integer language plpgsql security definer set search_path=public,pg_temp as $function$
declare v_row jsonb;v_count integer:=0;v_group text;v_day text;v_period integer;v_subject text;v_teacher text;
begin
 if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>80 then raise exception '時間割データは80行以内のJSON配列で指定してください。';end if;
 delete from public.class_timetable_slots;
 for v_row in select value from jsonb_array_elements(p_rows) loop
  v_group:=v_row->>'group_name';v_day:=v_row->>'day_key';v_period:=(v_row->>'period')::integer;v_subject:=btrim(coalesce(v_row->>'subject',''));v_teacher:=btrim(coalesce(v_row->>'teacher',''));
  if v_group not in('7組','8組') or v_day not in('Mon','Tue','Wed','Thu','Fri') or v_period<1 or v_period>8 or char_length(v_subject)>120 or char_length(v_teacher)>120 then raise exception '時間割の行に不正な値があります。';end if;
  if v_subject<>'' then insert into public.class_timetable_slots(group_name,day_key,period,subject,teacher,updated_at) values(v_group,v_day,v_period,v_subject,v_teacher,now());v_count:=v_count+1;end if;
 end loop;return v_count;
end;$function$;
revoke all on function public.replace_campussync_class_timetable(jsonb) from public,anon,authenticated;
grant execute on function public.replace_campussync_class_timetable(jsonb) to service_role;
commit;
select group_name,day_key,count(*) as periods from public.class_timetable_slots group by group_name,day_key order by group_name,day_key;