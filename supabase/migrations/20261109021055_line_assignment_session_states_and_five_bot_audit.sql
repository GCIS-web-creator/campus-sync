begin;

-- The LINE-native conversational form uses multiple states; the old
-- single-step form state remains valid for sessions created before migration.
alter table public.line_assignment_sessions
  drop constraint if exists line_assignment_sessions_step_check;

alter table public.line_assignment_sessions
  add constraint line_assignment_sessions_step_check
  check (step = any (array[
    'awaiting_assignment_details',
    'awaiting_subject',
    'awaiting_target_class',
    'awaiting_subject_option',
    'awaiting_type',
    'awaiting_title',
    'awaiting_details',
    'awaiting_deadline',
    'awaiting_confirmation',
    'submitting'
  ]::text[]));

-- BOT rotation supports five official accounts (0 is the legacy marker
-- used by the shared delivery audit helper).
alter table public.line_delivery_events
  drop constraint if exists line_delivery_events_bot_slot_check;

alter table public.line_delivery_events
  add constraint line_delivery_events_bot_slot_check
  check (bot_slot is null or (bot_slot >= 0 and bot_slot <= 5));

comment on constraint line_assignment_sessions_step_check on public.line_assignment_sessions is
  'Allowed states for the LINE-native assignment conversation and legacy form sessions.';

comment on constraint line_delivery_events_bot_slot_check on public.line_delivery_events is
  'Supports legacy slot 0 and CampusSync LINE BOT slots 1 through 5.';

commit;
