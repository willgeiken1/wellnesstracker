-- Destructive disposable-environment rollback; stop clients and preserve any needed data first.
-- RESTRICT (no CASCADE) fails closed if unrelated objects depend on this schema.
-- The native_pwa_purge trigger is dropped with public.purges; its function is dropped after.
BEGIN;
DROP FUNCTION public.sync_push(jsonb);
DROP FUNCTION public.sync_purge_range(uuid,date,date,bigint,text);
DROP TABLE public.profile;
DROP TABLE public.weigh_ins;
DROP TABLE public.measurements;
DROP TABLE public.routines;
DROP TABLE public.routine_exercises;
DROP TABLE public.sessions;
DROP TABLE public.entries;
DROP TABLE public.sets;
DROP TABLE public.cardio_sessions;
DROP TABLE public.food_entries;
DROP TABLE public.saved_foods;
DROP TABLE public.food_targets;
DROP TABLE public.meals;
DROP TABLE public.goals;
DROP TABLE public.plan_days;
DROP TABLE public.machine_notes;
DROP TABLE public.home_layout;
DROP TABLE public.settings;
DROP TABLE public.photos;
DROP TABLE public.custom_exercises;
DROP TABLE public.plans;
DROP TABLE public.pauses;
DROP TABLE public.purges;
DROP FUNCTION public.native_pwa_invalidate_on_purge();
DROP FUNCTION public.row_sync_guard();
DROP SEQUENCE public.row_sync_seq;
COMMIT;
