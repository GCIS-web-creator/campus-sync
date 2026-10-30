-- LINE配信履歴に送信BOT番号を記録します。旧記録・単体BOTはNULLです。
alter table public.line_broadcast_history add column if not exists bot_slot smallint;
comment on column public.line_broadcast_history.bot_slot is '送信時に使用したBOTスロット（1〜3）。旧配信または単体BOTはNULL。';