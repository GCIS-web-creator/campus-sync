-- Extend earthquake notification kinds to include nationwide major-earthquake alerts.
alter table public.jma_earthquake_notifications
  drop constraint if exists jma_earthquake_notifications_notification_kind_check;
alter table public.jma_earthquake_notifications
  add constraint jma_earthquake_notifications_notification_kind_check
  check (notification_kind in ('eew_kodaira', 'kodaira_intensity2', 'eew_cancelled', 'major_earthquake'));
