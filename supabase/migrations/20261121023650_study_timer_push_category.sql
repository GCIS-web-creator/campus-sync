-- Add an independent notification category for Pomodoro timer events.
-- Existing reminder preferences remain unchanged; missing study_timer keys default to enabled.

alter table campus_private.push_notification_outbox
  drop constraint if exists push_notification_outbox_category_check;

alter table campus_private.push_notification_outbox
  add constraint push_notification_outbox_category_check
  check (category in (
    'todo_reminders', 'chat_messages', 'school_announcements', 'transport_alerts',
    'cafeteria_updates', 'activity_updates', 'weather_alerts', 'disaster_alerts', 'study_timer'
  ));

alter table public.push_reminder_preferences
  alter column notification_settings set default
  '{"todo_reminders":true,"chat_messages":true,"school_announcements":true,"transport_alerts":true,"cafeteria_updates":true,"activity_updates":true,"weather_alerts":true,"disaster_alerts":true,"study_timer":true}'::jsonb;

update public.push_reminder_preferences
set notification_settings = coalesce(notification_settings, '{}'::jsonb) || '{"study_timer":true}'::jsonb
where not coalesce(notification_settings, '{}'::jsonb) ? 'study_timer';
