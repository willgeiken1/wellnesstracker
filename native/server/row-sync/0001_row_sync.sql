-- DRAFT - NOT APPLIED. Applying needs Quinn PASS + Will's go (HIGH).

BEGIN;

CREATE SEQUENCE public.row_sync_seq;

CREATE FUNCTION public.row_sync_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  payload jsonb;
  field text;
  write_now bigint := floor(extract(epoch FROM pg_catalog.now()) * 1000)::bigint;
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- Only the nested auth.users FK cascade may physically remove rows.
    -- Ordinary client DELETE remains ungranted and the tombstone guard remains in force.
    IF pg_catalog.pg_trigger_depth() > 1 AND NOT EXISTS (SELECT 1 FROM auth.users WHERE id=OLD.owner_id) THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'Use a row tombstone';
  END IF;
  IF NEW.owner_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Row owner mismatch'; END IF;
  -- Held until commit, across tables. A reader cannot advance past an uncommitted earlier sequence.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(NEW.owner_id::text, 0));
  -- Provenance is immutable even when the incoming LWW tuple is stale.
  IF TG_TABLE_NAME = 'weigh_ins' THEN
    IF EXISTS (SELECT 1 FROM public.weigh_ins w WHERE w.owner_id=NEW.owner_id AND w.id=NEW.id AND w.source IS DISTINCT FROM NEW.source) THEN
      RAISE EXCEPTION USING ERRCODE = 'P2001', MESSAGE = 'Sync provenance conflict';
    END IF;
  END IF;
  -- D2: clamp excessive future timestamps to transaction now, BEFORE LWW.
  -- Choosing now rather than now+5min avoids giving a bad clock a five-minute
  -- priority over later legitimate edits. Exactly +5min remains accepted.
  -- Known limitation accepted by Will (Oct 17, 2026), as no worse than no clamp:
  -- a lost clamped ack leaves the original future stamp on the client. Retrying
  -- may re-clamp to a newer now(), becoming a new version that can overwrite.
  -- Thus the same incoming tuple is not necessarily an immutable retry.
  IF NEW.updated_at > write_now + 300000 THEN
    NEW.updated_at := write_now;
    IF NEW.deleted_at IS NOT NULL THEN NEW.deleted_at := NEW.updated_at; END IF;
  END IF;
  -- D1: all payload is nullable already; source alone is retained for immutable
  -- weigh-in provenance. No value-column NOT NULL relaxation is required.
  IF NEW.deleted_at IS NOT NULL THEN
    payload := pg_catalog.to_jsonb(NEW);
    FOR field IN SELECT pg_catalog.jsonb_object_keys(payload) LOOP
      IF field NOT IN ('id','owner_id','deleted_at','updated_at','device_id','server_seq')
         AND NOT (TG_TABLE_NAME='weigh_ins' AND field='source') THEN
        payload := pg_catalog.jsonb_set(payload, ARRAY[field], 'null'::jsonb);
      END IF;
    END LOOP;
    NEW := pg_catalog.jsonb_populate_record(NEW, payload);
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.owner_id <> OLD.owner_id OR NEW.id <> OLD.id THEN RAISE EXCEPTION 'Row identity is immutable'; END IF;
    IF (NEW.updated_at, NEW.device_id COLLATE "C") <= (OLD.updated_at, OLD.device_id COLLATE "C") THEN RETURN NULL; END IF;
  END IF;
  NEW.server_seq := pg_catalog.nextval('public.row_sync_seq');
  RETURN NEW;
END $$;

CREATE TABLE public.profile (owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  updated_at bigint NOT NULL CHECK(updated_at >= 0 AND updated_at <= 9007199254740991),
  deleted_at bigint CHECK(deleted_at >= 0 AND deleted_at <= 9007199254740991),
  device_id text COLLATE "C" NOT NULL CHECK(device_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  server_seq bigint NOT NULL,
  name text,
  dob text,
  weight_unit text,
  height_m double precision, PRIMARY KEY(owner_id,id));

CREATE INDEX profile_owner_sequence ON public.profile(owner_id,server_seq);

ALTER TABLE public.profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile FORCE ROW LEVEL SECURITY;

CREATE POLICY owner_access ON public.profile FOR ALL TO authenticated USING (owner_id = (SELECT auth.uid())) WITH CHECK (owner_id = (SELECT auth.uid()));

REVOKE ALL ON TABLE public.profile FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.profile TO authenticated;

CREATE TRIGGER profile_guard BEFORE INSERT OR UPDATE OR DELETE ON public.profile FOR EACH ROW EXECUTE FUNCTION public.row_sync_guard();

CREATE TABLE public.weigh_ins (owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  updated_at bigint NOT NULL CHECK(updated_at >= 0 AND updated_at <= 9007199254740991),
  deleted_at bigint CHECK(deleted_at >= 0 AND deleted_at <= 9007199254740991),
  device_id text COLLATE "C" NOT NULL CHECK(device_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  server_seq bigint NOT NULL,
  day text,
  weight_kg double precision,
  entered_value double precision,
  entered_unit text,
  source text NOT NULL CHECK(source = 'app'), PRIMARY KEY(owner_id,id));

CREATE INDEX weigh_ins_owner_sequence ON public.weigh_ins(owner_id,server_seq);

ALTER TABLE public.weigh_ins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weigh_ins FORCE ROW LEVEL SECURITY;

CREATE POLICY owner_access ON public.weigh_ins FOR ALL TO authenticated USING (owner_id = (SELECT auth.uid())) WITH CHECK (owner_id = (SELECT auth.uid()));

REVOKE ALL ON TABLE public.weigh_ins FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.weigh_ins TO authenticated;

CREATE TRIGGER weigh_ins_guard BEFORE INSERT OR UPDATE OR DELETE ON public.weigh_ins FOR EACH ROW EXECUTE FUNCTION public.row_sync_guard();

CREATE TABLE public.measurements (owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  updated_at bigint NOT NULL CHECK(updated_at >= 0 AND updated_at <= 9007199254740991),
  deleted_at bigint CHECK(deleted_at >= 0 AND deleted_at <= 9007199254740991),
  device_id text COLLATE "C" NOT NULL CHECK(device_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  server_seq bigint NOT NULL,
  day text,
  waist_m double precision,
  hips_m double precision,
  chest_m double precision,
  arm_m double precision,
  thigh_m double precision, PRIMARY KEY(owner_id,id));

CREATE INDEX measurements_owner_sequence ON public.measurements(owner_id,server_seq);

ALTER TABLE public.measurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.measurements FORCE ROW LEVEL SECURITY;

CREATE POLICY owner_access ON public.measurements FOR ALL TO authenticated USING (owner_id = (SELECT auth.uid())) WITH CHECK (owner_id = (SELECT auth.uid()));

REVOKE ALL ON TABLE public.measurements FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.measurements TO authenticated;

CREATE TRIGGER measurements_guard BEFORE INSERT OR UPDATE OR DELETE ON public.measurements FOR EACH ROW EXECUTE FUNCTION public.row_sync_guard();

CREATE TABLE public.routines (owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  updated_at bigint NOT NULL CHECK(updated_at >= 0 AND updated_at <= 9007199254740991),
  deleted_at bigint CHECK(deleted_at >= 0 AND deleted_at <= 9007199254740991),
  device_id text COLLATE "C" NOT NULL CHECK(device_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  server_seq bigint NOT NULL,
  name text,
  position bigint, PRIMARY KEY(owner_id,id));

CREATE INDEX routines_owner_sequence ON public.routines(owner_id,server_seq);

ALTER TABLE public.routines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routines FORCE ROW LEVEL SECURITY;

CREATE POLICY owner_access ON public.routines FOR ALL TO authenticated USING (owner_id = (SELECT auth.uid())) WITH CHECK (owner_id = (SELECT auth.uid()));

REVOKE ALL ON TABLE public.routines FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.routines TO authenticated;

CREATE TRIGGER routines_guard BEFORE INSERT OR UPDATE OR DELETE ON public.routines FOR EACH ROW EXECUTE FUNCTION public.row_sync_guard();

CREATE TABLE public.routine_exercises (owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  updated_at bigint NOT NULL CHECK(updated_at >= 0 AND updated_at <= 9007199254740991),
  deleted_at bigint CHECK(deleted_at >= 0 AND deleted_at <= 9007199254740991),
  device_id text COLLATE "C" NOT NULL CHECK(device_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  server_seq bigint NOT NULL,
  routine_id text,
  exercise text,
  position bigint,
  target_sets bigint,
  target_reps bigint, PRIMARY KEY(owner_id,id));

CREATE INDEX routine_exercises_owner_sequence ON public.routine_exercises(owner_id,server_seq);

ALTER TABLE public.routine_exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routine_exercises FORCE ROW LEVEL SECURITY;

CREATE POLICY owner_access ON public.routine_exercises FOR ALL TO authenticated USING (owner_id = (SELECT auth.uid())) WITH CHECK (owner_id = (SELECT auth.uid()));

REVOKE ALL ON TABLE public.routine_exercises FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.routine_exercises TO authenticated;

CREATE TRIGGER routine_exercises_guard BEFORE INSERT OR UPDATE OR DELETE ON public.routine_exercises FOR EACH ROW EXECUTE FUNCTION public.row_sync_guard();

CREATE TABLE public.sessions (owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  updated_at bigint NOT NULL CHECK(updated_at >= 0 AND updated_at <= 9007199254740991),
  deleted_at bigint CHECK(deleted_at >= 0 AND deleted_at <= 9007199254740991),
  device_id text COLLATE "C" NOT NULL CHECK(device_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  server_seq bigint NOT NULL,
  day text,
  routine_id text,
  name text,
  origin text,
  started_at bigint,
  finished_at bigint,
  duration_ms bigint,
  notes text, PRIMARY KEY(owner_id,id));

CREATE INDEX sessions_owner_sequence ON public.sessions(owner_id,server_seq);

ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions FORCE ROW LEVEL SECURITY;

CREATE POLICY owner_access ON public.sessions FOR ALL TO authenticated USING (owner_id = (SELECT auth.uid())) WITH CHECK (owner_id = (SELECT auth.uid()));

REVOKE ALL ON TABLE public.sessions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.sessions TO authenticated;

CREATE TRIGGER sessions_guard BEFORE INSERT OR UPDATE OR DELETE ON public.sessions FOR EACH ROW EXECUTE FUNCTION public.row_sync_guard();

CREATE TABLE public.entries (owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  updated_at bigint NOT NULL CHECK(updated_at >= 0 AND updated_at <= 9007199254740991),
  deleted_at bigint CHECK(deleted_at >= 0 AND deleted_at <= 9007199254740991),
  device_id text COLLATE "C" NOT NULL CHECK(device_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  server_seq bigint NOT NULL,
  session_id text,
  exercise text,
  position bigint,
  notes text, PRIMARY KEY(owner_id,id));

CREATE INDEX entries_owner_sequence ON public.entries(owner_id,server_seq);

ALTER TABLE public.entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entries FORCE ROW LEVEL SECURITY;

CREATE POLICY owner_access ON public.entries FOR ALL TO authenticated USING (owner_id = (SELECT auth.uid())) WITH CHECK (owner_id = (SELECT auth.uid()));

REVOKE ALL ON TABLE public.entries FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.entries TO authenticated;

CREATE TRIGGER entries_guard BEFORE INSERT OR UPDATE OR DELETE ON public.entries FOR EACH ROW EXECUTE FUNCTION public.row_sync_guard();

CREATE TABLE public.sets (owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  updated_at bigint NOT NULL CHECK(updated_at >= 0 AND updated_at <= 9007199254740991),
  deleted_at bigint CHECK(deleted_at >= 0 AND deleted_at <= 9007199254740991),
  device_id text COLLATE "C" NOT NULL CHECK(device_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  server_seq bigint NOT NULL,
  entry_id text,
  position bigint,
  weight_kg double precision,
  entered_value double precision,
  entered_unit text,
  reps bigint,
  left_weight_kg double precision,
  left_entered_value double precision,
  left_entered_unit text,
  left_reps bigint,
  right_weight_kg double precision,
  right_entered_value double precision,
  right_entered_unit text,
  right_reps bigint,
  rpe double precision, PRIMARY KEY(owner_id,id));

CREATE INDEX sets_owner_sequence ON public.sets(owner_id,server_seq);

ALTER TABLE public.sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sets FORCE ROW LEVEL SECURITY;

CREATE POLICY owner_access ON public.sets FOR ALL TO authenticated USING (owner_id = (SELECT auth.uid())) WITH CHECK (owner_id = (SELECT auth.uid()));

REVOKE ALL ON TABLE public.sets FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.sets TO authenticated;

CREATE TRIGGER sets_guard BEFORE INSERT OR UPDATE OR DELETE ON public.sets FOR EACH ROW EXECUTE FUNCTION public.row_sync_guard();

CREATE TABLE public.cardio_sessions (owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  updated_at bigint NOT NULL CHECK(updated_at >= 0 AND updated_at <= 9007199254740991),
  deleted_at bigint CHECK(deleted_at >= 0 AND deleted_at <= 9007199254740991),
  device_id text COLLATE "C" NOT NULL CHECK(device_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  server_seq bigint NOT NULL,
  day text,
  kind text,
  duration_ms bigint,
  distance_m double precision,
  notes text, PRIMARY KEY(owner_id,id));

CREATE INDEX cardio_sessions_owner_sequence ON public.cardio_sessions(owner_id,server_seq);

ALTER TABLE public.cardio_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cardio_sessions FORCE ROW LEVEL SECURITY;

CREATE POLICY owner_access ON public.cardio_sessions FOR ALL TO authenticated USING (owner_id = (SELECT auth.uid())) WITH CHECK (owner_id = (SELECT auth.uid()));

REVOKE ALL ON TABLE public.cardio_sessions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.cardio_sessions TO authenticated;

CREATE TRIGGER cardio_sessions_guard BEFORE INSERT OR UPDATE OR DELETE ON public.cardio_sessions FOR EACH ROW EXECUTE FUNCTION public.row_sync_guard();

CREATE TABLE public.food_entries (owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  updated_at bigint NOT NULL CHECK(updated_at >= 0 AND updated_at <= 9007199254740991),
  deleted_at bigint CHECK(deleted_at >= 0 AND deleted_at <= 9007199254740991),
  device_id text COLLATE "C" NOT NULL CHECK(device_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  server_seq bigint NOT NULL,
  day text,
  meal_id text,
  saved_food_id text,
  name text,
  amount_g double precision,
  energy_kj double precision,
  protein_g double precision,
  carbs_g double precision,
  fat_g double precision, PRIMARY KEY(owner_id,id));

CREATE INDEX food_entries_owner_sequence ON public.food_entries(owner_id,server_seq);

ALTER TABLE public.food_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.food_entries FORCE ROW LEVEL SECURITY;

CREATE POLICY owner_access ON public.food_entries FOR ALL TO authenticated USING (owner_id = (SELECT auth.uid())) WITH CHECK (owner_id = (SELECT auth.uid()));

REVOKE ALL ON TABLE public.food_entries FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.food_entries TO authenticated;

CREATE TRIGGER food_entries_guard BEFORE INSERT OR UPDATE OR DELETE ON public.food_entries FOR EACH ROW EXECUTE FUNCTION public.row_sync_guard();

CREATE TABLE public.saved_foods (owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  updated_at bigint NOT NULL CHECK(updated_at >= 0 AND updated_at <= 9007199254740991),
  deleted_at bigint CHECK(deleted_at >= 0 AND deleted_at <= 9007199254740991),
  device_id text COLLATE "C" NOT NULL CHECK(device_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  server_seq bigint NOT NULL,
  name text,
  serving_g double precision,
  energy_kj double precision,
  protein_g double precision,
  carbs_g double precision,
  fat_g double precision, PRIMARY KEY(owner_id,id));

CREATE INDEX saved_foods_owner_sequence ON public.saved_foods(owner_id,server_seq);

ALTER TABLE public.saved_foods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_foods FORCE ROW LEVEL SECURITY;

CREATE POLICY owner_access ON public.saved_foods FOR ALL TO authenticated USING (owner_id = (SELECT auth.uid())) WITH CHECK (owner_id = (SELECT auth.uid()));

REVOKE ALL ON TABLE public.saved_foods FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.saved_foods TO authenticated;

CREATE TRIGGER saved_foods_guard BEFORE INSERT OR UPDATE OR DELETE ON public.saved_foods FOR EACH ROW EXECUTE FUNCTION public.row_sync_guard();

CREATE TABLE public.food_targets (owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  updated_at bigint NOT NULL CHECK(updated_at >= 0 AND updated_at <= 9007199254740991),
  deleted_at bigint CHECK(deleted_at >= 0 AND deleted_at <= 9007199254740991),
  device_id text COLLATE "C" NOT NULL CHECK(device_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  server_seq bigint NOT NULL,
  day text,
  energy_kj double precision,
  protein_g double precision,
  carbs_g double precision,
  fat_g double precision, PRIMARY KEY(owner_id,id));

CREATE INDEX food_targets_owner_sequence ON public.food_targets(owner_id,server_seq);

ALTER TABLE public.food_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.food_targets FORCE ROW LEVEL SECURITY;

CREATE POLICY owner_access ON public.food_targets FOR ALL TO authenticated USING (owner_id = (SELECT auth.uid())) WITH CHECK (owner_id = (SELECT auth.uid()));

REVOKE ALL ON TABLE public.food_targets FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.food_targets TO authenticated;

CREATE TRIGGER food_targets_guard BEFORE INSERT OR UPDATE OR DELETE ON public.food_targets FOR EACH ROW EXECUTE FUNCTION public.row_sync_guard();

CREATE TABLE public.meals (owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  updated_at bigint NOT NULL CHECK(updated_at >= 0 AND updated_at <= 9007199254740991),
  deleted_at bigint CHECK(deleted_at >= 0 AND deleted_at <= 9007199254740991),
  device_id text COLLATE "C" NOT NULL CHECK(device_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  server_seq bigint NOT NULL,
  name text,
  position bigint, PRIMARY KEY(owner_id,id));

CREATE INDEX meals_owner_sequence ON public.meals(owner_id,server_seq);

ALTER TABLE public.meals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meals FORCE ROW LEVEL SECURITY;

CREATE POLICY owner_access ON public.meals FOR ALL TO authenticated USING (owner_id = (SELECT auth.uid())) WITH CHECK (owner_id = (SELECT auth.uid()));

REVOKE ALL ON TABLE public.meals FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.meals TO authenticated;

CREATE TRIGGER meals_guard BEFORE INSERT OR UPDATE OR DELETE ON public.meals FOR EACH ROW EXECUTE FUNCTION public.row_sync_guard();

CREATE TABLE public.goals (owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  updated_at bigint NOT NULL CHECK(updated_at >= 0 AND updated_at <= 9007199254740991),
  deleted_at bigint CHECK(deleted_at >= 0 AND deleted_at <= 9007199254740991),
  device_id text COLLATE "C" NOT NULL CHECK(device_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  server_seq bigint NOT NULL,
  kind text,
  target_value double precision,
  target_unit text,
  target_day text, PRIMARY KEY(owner_id,id));

CREATE INDEX goals_owner_sequence ON public.goals(owner_id,server_seq);

ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goals FORCE ROW LEVEL SECURITY;

CREATE POLICY owner_access ON public.goals FOR ALL TO authenticated USING (owner_id = (SELECT auth.uid())) WITH CHECK (owner_id = (SELECT auth.uid()));

REVOKE ALL ON TABLE public.goals FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.goals TO authenticated;

CREATE TRIGGER goals_guard BEFORE INSERT OR UPDATE OR DELETE ON public.goals FOR EACH ROW EXECUTE FUNCTION public.row_sync_guard();

CREATE TABLE public.plan_days (owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  updated_at bigint NOT NULL CHECK(updated_at >= 0 AND updated_at <= 9007199254740991),
  deleted_at bigint CHECK(deleted_at >= 0 AND deleted_at <= 9007199254740991),
  device_id text COLLATE "C" NOT NULL CHECK(device_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  server_seq bigint NOT NULL,
  day text,
  routine_id text,
  status text, PRIMARY KEY(owner_id,id));

CREATE INDEX plan_days_owner_sequence ON public.plan_days(owner_id,server_seq);

ALTER TABLE public.plan_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_days FORCE ROW LEVEL SECURITY;

CREATE POLICY owner_access ON public.plan_days FOR ALL TO authenticated USING (owner_id = (SELECT auth.uid())) WITH CHECK (owner_id = (SELECT auth.uid()));

REVOKE ALL ON TABLE public.plan_days FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.plan_days TO authenticated;

CREATE TRIGGER plan_days_guard BEFORE INSERT OR UPDATE OR DELETE ON public.plan_days FOR EACH ROW EXECUTE FUNCTION public.row_sync_guard();

CREATE TABLE public.machine_notes (owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  updated_at bigint NOT NULL CHECK(updated_at >= 0 AND updated_at <= 9007199254740991),
  deleted_at bigint CHECK(deleted_at >= 0 AND deleted_at <= 9007199254740991),
  device_id text COLLATE "C" NOT NULL CHECK(device_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  server_seq bigint NOT NULL,
  exercise text,
  text text, PRIMARY KEY(owner_id,id));

CREATE INDEX machine_notes_owner_sequence ON public.machine_notes(owner_id,server_seq);

ALTER TABLE public.machine_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.machine_notes FORCE ROW LEVEL SECURITY;

CREATE POLICY owner_access ON public.machine_notes FOR ALL TO authenticated USING (owner_id = (SELECT auth.uid())) WITH CHECK (owner_id = (SELECT auth.uid()));

REVOKE ALL ON TABLE public.machine_notes FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.machine_notes TO authenticated;

CREATE TRIGGER machine_notes_guard BEFORE INSERT OR UPDATE OR DELETE ON public.machine_notes FOR EACH ROW EXECUTE FUNCTION public.row_sync_guard();

CREATE TABLE public.home_layout (owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  updated_at bigint NOT NULL CHECK(updated_at >= 0 AND updated_at <= 9007199254740991),
  deleted_at bigint CHECK(deleted_at >= 0 AND deleted_at <= 9007199254740991),
  device_id text COLLATE "C" NOT NULL CHECK(device_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  server_seq bigint NOT NULL,
  widget text,
  position bigint,
  hidden bigint, PRIMARY KEY(owner_id,id));

CREATE INDEX home_layout_owner_sequence ON public.home_layout(owner_id,server_seq);

ALTER TABLE public.home_layout ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.home_layout FORCE ROW LEVEL SECURITY;

CREATE POLICY owner_access ON public.home_layout FOR ALL TO authenticated USING (owner_id = (SELECT auth.uid())) WITH CHECK (owner_id = (SELECT auth.uid()));

REVOKE ALL ON TABLE public.home_layout FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.home_layout TO authenticated;

CREATE TRIGGER home_layout_guard BEFORE INSERT OR UPDATE OR DELETE ON public.home_layout FOR EACH ROW EXECUTE FUNCTION public.row_sync_guard();

CREATE TABLE public.settings (owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  updated_at bigint NOT NULL CHECK(updated_at >= 0 AND updated_at <= 9007199254740991),
  deleted_at bigint CHECK(deleted_at >= 0 AND deleted_at <= 9007199254740991),
  device_id text COLLATE "C" NOT NULL CHECK(device_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  server_seq bigint NOT NULL,
  theme_override text,
  accent text,
  rest_seconds bigint, PRIMARY KEY(owner_id,id));

CREATE INDEX settings_owner_sequence ON public.settings(owner_id,server_seq);

ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings FORCE ROW LEVEL SECURITY;

CREATE POLICY owner_access ON public.settings FOR ALL TO authenticated USING (owner_id = (SELECT auth.uid())) WITH CHECK (owner_id = (SELECT auth.uid()));

REVOKE ALL ON TABLE public.settings FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.settings TO authenticated;

CREATE TRIGGER settings_guard BEFORE INSERT OR UPDATE OR DELETE ON public.settings FOR EACH ROW EXECUTE FUNCTION public.row_sync_guard();

CREATE TABLE public.photos (owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  updated_at bigint NOT NULL CHECK(updated_at >= 0 AND updated_at <= 9007199254740991),
  deleted_at bigint CHECK(deleted_at >= 0 AND deleted_at <= 9007199254740991),
  device_id text COLLATE "C" NOT NULL CHECK(device_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  server_seq bigint NOT NULL,
  file_name text,
  captured_at bigint,
  width bigint,
  height bigint, PRIMARY KEY(owner_id,id));

CREATE INDEX photos_owner_sequence ON public.photos(owner_id,server_seq);

ALTER TABLE public.photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.photos FORCE ROW LEVEL SECURITY;

CREATE POLICY owner_access ON public.photos FOR ALL TO authenticated USING (owner_id = (SELECT auth.uid())) WITH CHECK (owner_id = (SELECT auth.uid()));

REVOKE ALL ON TABLE public.photos FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.photos TO authenticated;

CREATE TRIGGER photos_guard BEFORE INSERT OR UPDATE OR DELETE ON public.photos FOR EACH ROW EXECUTE FUNCTION public.row_sync_guard();

CREATE FUNCTION public.sync_push(rows jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE item jsonb; payload jsonb; stored jsonb; accepted jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF jsonb_typeof(rows) <> 'array' OR jsonb_array_length(rows) > 100 THEN RAISE EXCEPTION 'Invalid batch'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text, 0));
  FOR item IN SELECT value FROM jsonb_array_elements(rows) LOOP
    IF (item->>'owner_id')::uuid IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Row owner mismatch'; END IF;
    IF jsonb_typeof(item->'data') <> 'object' THEN RAISE EXCEPTION 'Invalid row'; END IF;
    payload := (item - 'table' - 'data') || (item->'data');
    CASE item->>'table'


WHEN 'profile' THEN
      IF EXISTS (SELECT 1 FROM jsonb_object_keys(payload) k WHERE NOT k = ANY(ARRAY['owner_id','id','updated_at','deleted_at','device_id','name','dob','weight_unit','height_m'])) OR EXISTS (SELECT 1 FROM jsonb_object_keys(item->'data') k WHERE NOT k = ANY(ARRAY['name','dob','weight_unit','height_m'])) THEN RAISE EXCEPTION 'Invalid row fields'; END IF;
      INSERT INTO public.profile (owner_id, id, updated_at, deleted_at, device_id, name, dob, weight_unit, height_m) SELECT owner_id, id, updated_at, deleted_at, device_id, name, dob, weight_unit, height_m FROM jsonb_populate_record(NULL::public.profile, payload)
      ON CONFLICT (owner_id,id) DO UPDATE SET updated_at = EXCLUDED.updated_at, deleted_at = EXCLUDED.deleted_at, device_id = EXCLUDED.device_id, name = EXCLUDED.name, dob = EXCLUDED.dob, weight_unit = EXCLUDED.weight_unit, height_m = EXCLUDED.height_m;
      SELECT pg_catalog.jsonb_build_object('table','profile',
        'owner_id',t.owner_id,'id',t.id,'updated_at',t.updated_at,
        'deleted_at',t.deleted_at,'device_id',t.device_id,
        'data',pg_catalog.to_jsonb(t)-ARRAY['owner_id','id','updated_at','deleted_at','device_id','server_seq'])
      INTO stored FROM public.profile t WHERE t.owner_id=auth.uid() AND t.id=(item->>'id')::uuid;


WHEN 'weigh_ins' THEN
      IF EXISTS (SELECT 1 FROM jsonb_object_keys(payload) k WHERE NOT k = ANY(ARRAY['owner_id','id','updated_at','deleted_at','device_id','day','weight_kg','entered_value','entered_unit','source'])) OR EXISTS (SELECT 1 FROM jsonb_object_keys(item->'data') k WHERE NOT k = ANY(ARRAY['day','weight_kg','entered_value','entered_unit','source'])) THEN RAISE EXCEPTION 'Invalid row fields'; END IF;
      INSERT INTO public.weigh_ins (owner_id, id, updated_at, deleted_at, device_id, day, weight_kg, entered_value, entered_unit, source) SELECT owner_id, id, updated_at, deleted_at, device_id, day, weight_kg, entered_value, entered_unit, source FROM jsonb_populate_record(NULL::public.weigh_ins, payload)
      ON CONFLICT (owner_id,id) DO UPDATE SET updated_at = EXCLUDED.updated_at, deleted_at = EXCLUDED.deleted_at, device_id = EXCLUDED.device_id, day = EXCLUDED.day, weight_kg = EXCLUDED.weight_kg, entered_value = EXCLUDED.entered_value, entered_unit = EXCLUDED.entered_unit, source = EXCLUDED.source;
      SELECT pg_catalog.jsonb_build_object('table','weigh_ins',
        'owner_id',t.owner_id,'id',t.id,'updated_at',t.updated_at,
        'deleted_at',t.deleted_at,'device_id',t.device_id,
        'data',pg_catalog.to_jsonb(t)-ARRAY['owner_id','id','updated_at','deleted_at','device_id','server_seq'])
      INTO stored FROM public.weigh_ins t WHERE t.owner_id=auth.uid() AND t.id=(item->>'id')::uuid;


WHEN 'measurements' THEN
      IF EXISTS (SELECT 1 FROM jsonb_object_keys(payload) k WHERE NOT k = ANY(ARRAY['owner_id','id','updated_at','deleted_at','device_id','day','waist_m','hips_m','chest_m','arm_m','thigh_m'])) OR EXISTS (SELECT 1 FROM jsonb_object_keys(item->'data') k WHERE NOT k = ANY(ARRAY['day','waist_m','hips_m','chest_m','arm_m','thigh_m'])) THEN RAISE EXCEPTION 'Invalid row fields'; END IF;
      INSERT INTO public.measurements (owner_id, id, updated_at, deleted_at, device_id, day, waist_m, hips_m, chest_m, arm_m, thigh_m) SELECT owner_id, id, updated_at, deleted_at, device_id, day, waist_m, hips_m, chest_m, arm_m, thigh_m FROM jsonb_populate_record(NULL::public.measurements, payload)
      ON CONFLICT (owner_id,id) DO UPDATE SET updated_at = EXCLUDED.updated_at, deleted_at = EXCLUDED.deleted_at, device_id = EXCLUDED.device_id, day = EXCLUDED.day, waist_m = EXCLUDED.waist_m, hips_m = EXCLUDED.hips_m, chest_m = EXCLUDED.chest_m, arm_m = EXCLUDED.arm_m, thigh_m = EXCLUDED.thigh_m;
      SELECT pg_catalog.jsonb_build_object('table','measurements',
        'owner_id',t.owner_id,'id',t.id,'updated_at',t.updated_at,
        'deleted_at',t.deleted_at,'device_id',t.device_id,
        'data',pg_catalog.to_jsonb(t)-ARRAY['owner_id','id','updated_at','deleted_at','device_id','server_seq'])
      INTO stored FROM public.measurements t WHERE t.owner_id=auth.uid() AND t.id=(item->>'id')::uuid;


WHEN 'routines' THEN
      IF EXISTS (SELECT 1 FROM jsonb_object_keys(payload) k WHERE NOT k = ANY(ARRAY['owner_id','id','updated_at','deleted_at','device_id','name','position'])) OR EXISTS (SELECT 1 FROM jsonb_object_keys(item->'data') k WHERE NOT k = ANY(ARRAY['name','position'])) THEN RAISE EXCEPTION 'Invalid row fields'; END IF;
      INSERT INTO public.routines (owner_id, id, updated_at, deleted_at, device_id, name, position) SELECT owner_id, id, updated_at, deleted_at, device_id, name, position FROM jsonb_populate_record(NULL::public.routines, payload)
      ON CONFLICT (owner_id,id) DO UPDATE SET updated_at = EXCLUDED.updated_at, deleted_at = EXCLUDED.deleted_at, device_id = EXCLUDED.device_id, name = EXCLUDED.name, position = EXCLUDED.position;
      SELECT pg_catalog.jsonb_build_object('table','routines',
        'owner_id',t.owner_id,'id',t.id,'updated_at',t.updated_at,
        'deleted_at',t.deleted_at,'device_id',t.device_id,
        'data',pg_catalog.to_jsonb(t)-ARRAY['owner_id','id','updated_at','deleted_at','device_id','server_seq'])
      INTO stored FROM public.routines t WHERE t.owner_id=auth.uid() AND t.id=(item->>'id')::uuid;


WHEN 'routine_exercises' THEN
      IF EXISTS (SELECT 1 FROM jsonb_object_keys(payload) k WHERE NOT k = ANY(ARRAY['owner_id','id','updated_at','deleted_at','device_id','routine_id','exercise','position','target_sets','target_reps'])) OR EXISTS (SELECT 1 FROM jsonb_object_keys(item->'data') k WHERE NOT k = ANY(ARRAY['routine_id','exercise','position','target_sets','target_reps'])) THEN RAISE EXCEPTION 'Invalid row fields'; END IF;
      INSERT INTO public.routine_exercises (owner_id, id, updated_at, deleted_at, device_id, routine_id, exercise, position, target_sets, target_reps) SELECT owner_id, id, updated_at, deleted_at, device_id, routine_id, exercise, position, target_sets, target_reps FROM jsonb_populate_record(NULL::public.routine_exercises, payload)
      ON CONFLICT (owner_id,id) DO UPDATE SET updated_at = EXCLUDED.updated_at, deleted_at = EXCLUDED.deleted_at, device_id = EXCLUDED.device_id, routine_id = EXCLUDED.routine_id, exercise = EXCLUDED.exercise, position = EXCLUDED.position, target_sets = EXCLUDED.target_sets, target_reps = EXCLUDED.target_reps;
      SELECT pg_catalog.jsonb_build_object('table','routine_exercises',
        'owner_id',t.owner_id,'id',t.id,'updated_at',t.updated_at,
        'deleted_at',t.deleted_at,'device_id',t.device_id,
        'data',pg_catalog.to_jsonb(t)-ARRAY['owner_id','id','updated_at','deleted_at','device_id','server_seq'])
      INTO stored FROM public.routine_exercises t WHERE t.owner_id=auth.uid() AND t.id=(item->>'id')::uuid;


WHEN 'sessions' THEN
      IF EXISTS (SELECT 1 FROM jsonb_object_keys(payload) k WHERE NOT k = ANY(ARRAY['owner_id','id','updated_at','deleted_at','device_id','day','routine_id','name','origin','started_at','finished_at','duration_ms','notes'])) OR EXISTS (SELECT 1 FROM jsonb_object_keys(item->'data') k WHERE NOT k = ANY(ARRAY['day','routine_id','name','origin','started_at','finished_at','duration_ms','notes'])) THEN RAISE EXCEPTION 'Invalid row fields'; END IF;
      INSERT INTO public.sessions (owner_id, id, updated_at, deleted_at, device_id, day, routine_id, name, origin, started_at, finished_at, duration_ms, notes) SELECT owner_id, id, updated_at, deleted_at, device_id, day, routine_id, name, origin, started_at, finished_at, duration_ms, notes FROM jsonb_populate_record(NULL::public.sessions, payload)
      ON CONFLICT (owner_id,id) DO UPDATE SET updated_at = EXCLUDED.updated_at, deleted_at = EXCLUDED.deleted_at, device_id = EXCLUDED.device_id, day = EXCLUDED.day, routine_id = EXCLUDED.routine_id, name = EXCLUDED.name, origin = EXCLUDED.origin, started_at = EXCLUDED.started_at, finished_at = EXCLUDED.finished_at, duration_ms = EXCLUDED.duration_ms, notes = EXCLUDED.notes;
      SELECT pg_catalog.jsonb_build_object('table','sessions',
        'owner_id',t.owner_id,'id',t.id,'updated_at',t.updated_at,
        'deleted_at',t.deleted_at,'device_id',t.device_id,
        'data',pg_catalog.to_jsonb(t)-ARRAY['owner_id','id','updated_at','deleted_at','device_id','server_seq'])
      INTO stored FROM public.sessions t WHERE t.owner_id=auth.uid() AND t.id=(item->>'id')::uuid;


WHEN 'entries' THEN
      IF EXISTS (SELECT 1 FROM jsonb_object_keys(payload) k WHERE NOT k = ANY(ARRAY['owner_id','id','updated_at','deleted_at','device_id','session_id','exercise','position','notes'])) OR EXISTS (SELECT 1 FROM jsonb_object_keys(item->'data') k WHERE NOT k = ANY(ARRAY['session_id','exercise','position','notes'])) THEN RAISE EXCEPTION 'Invalid row fields'; END IF;
      INSERT INTO public.entries (owner_id, id, updated_at, deleted_at, device_id, session_id, exercise, position, notes) SELECT owner_id, id, updated_at, deleted_at, device_id, session_id, exercise, position, notes FROM jsonb_populate_record(NULL::public.entries, payload)
      ON CONFLICT (owner_id,id) DO UPDATE SET updated_at = EXCLUDED.updated_at, deleted_at = EXCLUDED.deleted_at, device_id = EXCLUDED.device_id, session_id = EXCLUDED.session_id, exercise = EXCLUDED.exercise, position = EXCLUDED.position, notes = EXCLUDED.notes;
      SELECT pg_catalog.jsonb_build_object('table','entries',
        'owner_id',t.owner_id,'id',t.id,'updated_at',t.updated_at,
        'deleted_at',t.deleted_at,'device_id',t.device_id,
        'data',pg_catalog.to_jsonb(t)-ARRAY['owner_id','id','updated_at','deleted_at','device_id','server_seq'])
      INTO stored FROM public.entries t WHERE t.owner_id=auth.uid() AND t.id=(item->>'id')::uuid;


WHEN 'sets' THEN
      IF EXISTS (SELECT 1 FROM jsonb_object_keys(payload) k WHERE NOT k = ANY(ARRAY['owner_id','id','updated_at','deleted_at','device_id','entry_id','position','weight_kg','entered_value','entered_unit','reps','left_weight_kg','left_entered_value','left_entered_unit','left_reps','right_weight_kg','right_entered_value','right_entered_unit','right_reps','rpe'])) OR EXISTS (SELECT 1 FROM jsonb_object_keys(item->'data') k WHERE NOT k = ANY(ARRAY['entry_id','position','weight_kg','entered_value','entered_unit','reps','left_weight_kg','left_entered_value','left_entered_unit','left_reps','right_weight_kg','right_entered_value','right_entered_unit','right_reps','rpe'])) THEN RAISE EXCEPTION 'Invalid row fields'; END IF;
      INSERT INTO public.sets (owner_id, id, updated_at, deleted_at, device_id, entry_id, position, weight_kg, entered_value, entered_unit, reps, left_weight_kg, left_entered_value, left_entered_unit, left_reps, right_weight_kg, right_entered_value, right_entered_unit, right_reps, rpe) SELECT owner_id, id, updated_at, deleted_at, device_id, entry_id, position, weight_kg, entered_value, entered_unit, reps, left_weight_kg, left_entered_value, left_entered_unit, left_reps, right_weight_kg, right_entered_value, right_entered_unit, right_reps, rpe FROM jsonb_populate_record(NULL::public.sets, payload)
      ON CONFLICT (owner_id,id) DO UPDATE SET updated_at = EXCLUDED.updated_at, deleted_at = EXCLUDED.deleted_at, device_id = EXCLUDED.device_id, entry_id = EXCLUDED.entry_id, position = EXCLUDED.position, weight_kg = EXCLUDED.weight_kg, entered_value = EXCLUDED.entered_value, entered_unit = EXCLUDED.entered_unit, reps = EXCLUDED.reps, left_weight_kg = EXCLUDED.left_weight_kg, left_entered_value = EXCLUDED.left_entered_value, left_entered_unit = EXCLUDED.left_entered_unit, left_reps = EXCLUDED.left_reps, right_weight_kg = EXCLUDED.right_weight_kg, right_entered_value = EXCLUDED.right_entered_value, right_entered_unit = EXCLUDED.right_entered_unit, right_reps = EXCLUDED.right_reps, rpe = EXCLUDED.rpe;
      SELECT pg_catalog.jsonb_build_object('table','sets',
        'owner_id',t.owner_id,'id',t.id,'updated_at',t.updated_at,
        'deleted_at',t.deleted_at,'device_id',t.device_id,
        'data',pg_catalog.to_jsonb(t)-ARRAY['owner_id','id','updated_at','deleted_at','device_id','server_seq'])
      INTO stored FROM public.sets t WHERE t.owner_id=auth.uid() AND t.id=(item->>'id')::uuid;


WHEN 'cardio_sessions' THEN
      IF EXISTS (SELECT 1 FROM jsonb_object_keys(payload) k WHERE NOT k = ANY(ARRAY['owner_id','id','updated_at','deleted_at','device_id','day','kind','duration_ms','distance_m','notes'])) OR EXISTS (SELECT 1 FROM jsonb_object_keys(item->'data') k WHERE NOT k = ANY(ARRAY['day','kind','duration_ms','distance_m','notes'])) THEN RAISE EXCEPTION 'Invalid row fields'; END IF;
      INSERT INTO public.cardio_sessions (owner_id, id, updated_at, deleted_at, device_id, day, kind, duration_ms, distance_m, notes) SELECT owner_id, id, updated_at, deleted_at, device_id, day, kind, duration_ms, distance_m, notes FROM jsonb_populate_record(NULL::public.cardio_sessions, payload)
      ON CONFLICT (owner_id,id) DO UPDATE SET updated_at = EXCLUDED.updated_at, deleted_at = EXCLUDED.deleted_at, device_id = EXCLUDED.device_id, day = EXCLUDED.day, kind = EXCLUDED.kind, duration_ms = EXCLUDED.duration_ms, distance_m = EXCLUDED.distance_m, notes = EXCLUDED.notes;
      SELECT pg_catalog.jsonb_build_object('table','cardio_sessions',
        'owner_id',t.owner_id,'id',t.id,'updated_at',t.updated_at,
        'deleted_at',t.deleted_at,'device_id',t.device_id,
        'data',pg_catalog.to_jsonb(t)-ARRAY['owner_id','id','updated_at','deleted_at','device_id','server_seq'])
      INTO stored FROM public.cardio_sessions t WHERE t.owner_id=auth.uid() AND t.id=(item->>'id')::uuid;


WHEN 'food_entries' THEN
      IF EXISTS (SELECT 1 FROM jsonb_object_keys(payload) k WHERE NOT k = ANY(ARRAY['owner_id','id','updated_at','deleted_at','device_id','day','meal_id','saved_food_id','name','amount_g','energy_kj','protein_g','carbs_g','fat_g'])) OR EXISTS (SELECT 1 FROM jsonb_object_keys(item->'data') k WHERE NOT k = ANY(ARRAY['day','meal_id','saved_food_id','name','amount_g','energy_kj','protein_g','carbs_g','fat_g'])) THEN RAISE EXCEPTION 'Invalid row fields'; END IF;
      INSERT INTO public.food_entries (owner_id, id, updated_at, deleted_at, device_id, day, meal_id, saved_food_id, name, amount_g, energy_kj, protein_g, carbs_g, fat_g) SELECT owner_id, id, updated_at, deleted_at, device_id, day, meal_id, saved_food_id, name, amount_g, energy_kj, protein_g, carbs_g, fat_g FROM jsonb_populate_record(NULL::public.food_entries, payload)
      ON CONFLICT (owner_id,id) DO UPDATE SET updated_at = EXCLUDED.updated_at, deleted_at = EXCLUDED.deleted_at, device_id = EXCLUDED.device_id, day = EXCLUDED.day, meal_id = EXCLUDED.meal_id, saved_food_id = EXCLUDED.saved_food_id, name = EXCLUDED.name, amount_g = EXCLUDED.amount_g, energy_kj = EXCLUDED.energy_kj, protein_g = EXCLUDED.protein_g, carbs_g = EXCLUDED.carbs_g, fat_g = EXCLUDED.fat_g;
      SELECT pg_catalog.jsonb_build_object('table','food_entries',
        'owner_id',t.owner_id,'id',t.id,'updated_at',t.updated_at,
        'deleted_at',t.deleted_at,'device_id',t.device_id,
        'data',pg_catalog.to_jsonb(t)-ARRAY['owner_id','id','updated_at','deleted_at','device_id','server_seq'])
      INTO stored FROM public.food_entries t WHERE t.owner_id=auth.uid() AND t.id=(item->>'id')::uuid;


WHEN 'saved_foods' THEN
      IF EXISTS (SELECT 1 FROM jsonb_object_keys(payload) k WHERE NOT k = ANY(ARRAY['owner_id','id','updated_at','deleted_at','device_id','name','serving_g','energy_kj','protein_g','carbs_g','fat_g'])) OR EXISTS (SELECT 1 FROM jsonb_object_keys(item->'data') k WHERE NOT k = ANY(ARRAY['name','serving_g','energy_kj','protein_g','carbs_g','fat_g'])) THEN RAISE EXCEPTION 'Invalid row fields'; END IF;
      INSERT INTO public.saved_foods (owner_id, id, updated_at, deleted_at, device_id, name, serving_g, energy_kj, protein_g, carbs_g, fat_g) SELECT owner_id, id, updated_at, deleted_at, device_id, name, serving_g, energy_kj, protein_g, carbs_g, fat_g FROM jsonb_populate_record(NULL::public.saved_foods, payload)
      ON CONFLICT (owner_id,id) DO UPDATE SET updated_at = EXCLUDED.updated_at, deleted_at = EXCLUDED.deleted_at, device_id = EXCLUDED.device_id, name = EXCLUDED.name, serving_g = EXCLUDED.serving_g, energy_kj = EXCLUDED.energy_kj, protein_g = EXCLUDED.protein_g, carbs_g = EXCLUDED.carbs_g, fat_g = EXCLUDED.fat_g;
      SELECT pg_catalog.jsonb_build_object('table','saved_foods',
        'owner_id',t.owner_id,'id',t.id,'updated_at',t.updated_at,
        'deleted_at',t.deleted_at,'device_id',t.device_id,
        'data',pg_catalog.to_jsonb(t)-ARRAY['owner_id','id','updated_at','deleted_at','device_id','server_seq'])
      INTO stored FROM public.saved_foods t WHERE t.owner_id=auth.uid() AND t.id=(item->>'id')::uuid;


WHEN 'food_targets' THEN
      IF EXISTS (SELECT 1 FROM jsonb_object_keys(payload) k WHERE NOT k = ANY(ARRAY['owner_id','id','updated_at','deleted_at','device_id','day','energy_kj','protein_g','carbs_g','fat_g'])) OR EXISTS (SELECT 1 FROM jsonb_object_keys(item->'data') k WHERE NOT k = ANY(ARRAY['day','energy_kj','protein_g','carbs_g','fat_g'])) THEN RAISE EXCEPTION 'Invalid row fields'; END IF;
      INSERT INTO public.food_targets (owner_id, id, updated_at, deleted_at, device_id, day, energy_kj, protein_g, carbs_g, fat_g) SELECT owner_id, id, updated_at, deleted_at, device_id, day, energy_kj, protein_g, carbs_g, fat_g FROM jsonb_populate_record(NULL::public.food_targets, payload)
      ON CONFLICT (owner_id,id) DO UPDATE SET updated_at = EXCLUDED.updated_at, deleted_at = EXCLUDED.deleted_at, device_id = EXCLUDED.device_id, day = EXCLUDED.day, energy_kj = EXCLUDED.energy_kj, protein_g = EXCLUDED.protein_g, carbs_g = EXCLUDED.carbs_g, fat_g = EXCLUDED.fat_g;
      SELECT pg_catalog.jsonb_build_object('table','food_targets',
        'owner_id',t.owner_id,'id',t.id,'updated_at',t.updated_at,
        'deleted_at',t.deleted_at,'device_id',t.device_id,
        'data',pg_catalog.to_jsonb(t)-ARRAY['owner_id','id','updated_at','deleted_at','device_id','server_seq'])
      INTO stored FROM public.food_targets t WHERE t.owner_id=auth.uid() AND t.id=(item->>'id')::uuid;


WHEN 'meals' THEN
      IF EXISTS (SELECT 1 FROM jsonb_object_keys(payload) k WHERE NOT k = ANY(ARRAY['owner_id','id','updated_at','deleted_at','device_id','name','position'])) OR EXISTS (SELECT 1 FROM jsonb_object_keys(item->'data') k WHERE NOT k = ANY(ARRAY['name','position'])) THEN RAISE EXCEPTION 'Invalid row fields'; END IF;
      INSERT INTO public.meals (owner_id, id, updated_at, deleted_at, device_id, name, position) SELECT owner_id, id, updated_at, deleted_at, device_id, name, position FROM jsonb_populate_record(NULL::public.meals, payload)
      ON CONFLICT (owner_id,id) DO UPDATE SET updated_at = EXCLUDED.updated_at, deleted_at = EXCLUDED.deleted_at, device_id = EXCLUDED.device_id, name = EXCLUDED.name, position = EXCLUDED.position;
      SELECT pg_catalog.jsonb_build_object('table','meals',
        'owner_id',t.owner_id,'id',t.id,'updated_at',t.updated_at,
        'deleted_at',t.deleted_at,'device_id',t.device_id,
        'data',pg_catalog.to_jsonb(t)-ARRAY['owner_id','id','updated_at','deleted_at','device_id','server_seq'])
      INTO stored FROM public.meals t WHERE t.owner_id=auth.uid() AND t.id=(item->>'id')::uuid;


WHEN 'goals' THEN
      IF EXISTS (SELECT 1 FROM jsonb_object_keys(payload) k WHERE NOT k = ANY(ARRAY['owner_id','id','updated_at','deleted_at','device_id','kind','target_value','target_unit','target_day'])) OR EXISTS (SELECT 1 FROM jsonb_object_keys(item->'data') k WHERE NOT k = ANY(ARRAY['kind','target_value','target_unit','target_day'])) THEN RAISE EXCEPTION 'Invalid row fields'; END IF;
      INSERT INTO public.goals (owner_id, id, updated_at, deleted_at, device_id, kind, target_value, target_unit, target_day) SELECT owner_id, id, updated_at, deleted_at, device_id, kind, target_value, target_unit, target_day FROM jsonb_populate_record(NULL::public.goals, payload)
      ON CONFLICT (owner_id,id) DO UPDATE SET updated_at = EXCLUDED.updated_at, deleted_at = EXCLUDED.deleted_at, device_id = EXCLUDED.device_id, kind = EXCLUDED.kind, target_value = EXCLUDED.target_value, target_unit = EXCLUDED.target_unit, target_day = EXCLUDED.target_day;
      SELECT pg_catalog.jsonb_build_object('table','goals',
        'owner_id',t.owner_id,'id',t.id,'updated_at',t.updated_at,
        'deleted_at',t.deleted_at,'device_id',t.device_id,
        'data',pg_catalog.to_jsonb(t)-ARRAY['owner_id','id','updated_at','deleted_at','device_id','server_seq'])
      INTO stored FROM public.goals t WHERE t.owner_id=auth.uid() AND t.id=(item->>'id')::uuid;


WHEN 'plan_days' THEN
      IF EXISTS (SELECT 1 FROM jsonb_object_keys(payload) k WHERE NOT k = ANY(ARRAY['owner_id','id','updated_at','deleted_at','device_id','day','routine_id','status'])) OR EXISTS (SELECT 1 FROM jsonb_object_keys(item->'data') k WHERE NOT k = ANY(ARRAY['day','routine_id','status'])) THEN RAISE EXCEPTION 'Invalid row fields'; END IF;
      INSERT INTO public.plan_days (owner_id, id, updated_at, deleted_at, device_id, day, routine_id, status) SELECT owner_id, id, updated_at, deleted_at, device_id, day, routine_id, status FROM jsonb_populate_record(NULL::public.plan_days, payload)
      ON CONFLICT (owner_id,id) DO UPDATE SET updated_at = EXCLUDED.updated_at, deleted_at = EXCLUDED.deleted_at, device_id = EXCLUDED.device_id, day = EXCLUDED.day, routine_id = EXCLUDED.routine_id, status = EXCLUDED.status;
      SELECT pg_catalog.jsonb_build_object('table','plan_days',
        'owner_id',t.owner_id,'id',t.id,'updated_at',t.updated_at,
        'deleted_at',t.deleted_at,'device_id',t.device_id,
        'data',pg_catalog.to_jsonb(t)-ARRAY['owner_id','id','updated_at','deleted_at','device_id','server_seq'])
      INTO stored FROM public.plan_days t WHERE t.owner_id=auth.uid() AND t.id=(item->>'id')::uuid;


WHEN 'machine_notes' THEN
      IF EXISTS (SELECT 1 FROM jsonb_object_keys(payload) k WHERE NOT k = ANY(ARRAY['owner_id','id','updated_at','deleted_at','device_id','exercise','text'])) OR EXISTS (SELECT 1 FROM jsonb_object_keys(item->'data') k WHERE NOT k = ANY(ARRAY['exercise','text'])) THEN RAISE EXCEPTION 'Invalid row fields'; END IF;
      INSERT INTO public.machine_notes (owner_id, id, updated_at, deleted_at, device_id, exercise, text) SELECT owner_id, id, updated_at, deleted_at, device_id, exercise, text FROM jsonb_populate_record(NULL::public.machine_notes, payload)
      ON CONFLICT (owner_id,id) DO UPDATE SET updated_at = EXCLUDED.updated_at, deleted_at = EXCLUDED.deleted_at, device_id = EXCLUDED.device_id, exercise = EXCLUDED.exercise, text = EXCLUDED.text;
      SELECT pg_catalog.jsonb_build_object('table','machine_notes',
        'owner_id',t.owner_id,'id',t.id,'updated_at',t.updated_at,
        'deleted_at',t.deleted_at,'device_id',t.device_id,
        'data',pg_catalog.to_jsonb(t)-ARRAY['owner_id','id','updated_at','deleted_at','device_id','server_seq'])
      INTO stored FROM public.machine_notes t WHERE t.owner_id=auth.uid() AND t.id=(item->>'id')::uuid;


WHEN 'home_layout' THEN
      IF EXISTS (SELECT 1 FROM jsonb_object_keys(payload) k WHERE NOT k = ANY(ARRAY['owner_id','id','updated_at','deleted_at','device_id','widget','position','hidden'])) OR EXISTS (SELECT 1 FROM jsonb_object_keys(item->'data') k WHERE NOT k = ANY(ARRAY['widget','position','hidden'])) THEN RAISE EXCEPTION 'Invalid row fields'; END IF;
      INSERT INTO public.home_layout (owner_id, id, updated_at, deleted_at, device_id, widget, position, hidden) SELECT owner_id, id, updated_at, deleted_at, device_id, widget, position, hidden FROM jsonb_populate_record(NULL::public.home_layout, payload)
      ON CONFLICT (owner_id,id) DO UPDATE SET updated_at = EXCLUDED.updated_at, deleted_at = EXCLUDED.deleted_at, device_id = EXCLUDED.device_id, widget = EXCLUDED.widget, position = EXCLUDED.position, hidden = EXCLUDED.hidden;
      SELECT pg_catalog.jsonb_build_object('table','home_layout',
        'owner_id',t.owner_id,'id',t.id,'updated_at',t.updated_at,
        'deleted_at',t.deleted_at,'device_id',t.device_id,
        'data',pg_catalog.to_jsonb(t)-ARRAY['owner_id','id','updated_at','deleted_at','device_id','server_seq'])
      INTO stored FROM public.home_layout t WHERE t.owner_id=auth.uid() AND t.id=(item->>'id')::uuid;


WHEN 'settings' THEN
      IF EXISTS (SELECT 1 FROM jsonb_object_keys(payload) k WHERE NOT k = ANY(ARRAY['owner_id','id','updated_at','deleted_at','device_id','theme_override','accent','rest_seconds'])) OR EXISTS (SELECT 1 FROM jsonb_object_keys(item->'data') k WHERE NOT k = ANY(ARRAY['theme_override','accent','rest_seconds'])) THEN RAISE EXCEPTION 'Invalid row fields'; END IF;
      INSERT INTO public.settings (owner_id, id, updated_at, deleted_at, device_id, theme_override, accent, rest_seconds) SELECT owner_id, id, updated_at, deleted_at, device_id, theme_override, accent, rest_seconds FROM jsonb_populate_record(NULL::public.settings, payload)
      ON CONFLICT (owner_id,id) DO UPDATE SET updated_at = EXCLUDED.updated_at, deleted_at = EXCLUDED.deleted_at, device_id = EXCLUDED.device_id, theme_override = EXCLUDED.theme_override, accent = EXCLUDED.accent, rest_seconds = EXCLUDED.rest_seconds;
      SELECT pg_catalog.jsonb_build_object('table','settings',
        'owner_id',t.owner_id,'id',t.id,'updated_at',t.updated_at,
        'deleted_at',t.deleted_at,'device_id',t.device_id,
        'data',pg_catalog.to_jsonb(t)-ARRAY['owner_id','id','updated_at','deleted_at','device_id','server_seq'])
      INTO stored FROM public.settings t WHERE t.owner_id=auth.uid() AND t.id=(item->>'id')::uuid;


WHEN 'photos' THEN
      IF EXISTS (SELECT 1 FROM jsonb_object_keys(payload) k WHERE NOT k = ANY(ARRAY['owner_id','id','updated_at','deleted_at','device_id','file_name','captured_at','width','height'])) OR EXISTS (SELECT 1 FROM jsonb_object_keys(item->'data') k WHERE NOT k = ANY(ARRAY['file_name','captured_at','width','height'])) THEN RAISE EXCEPTION 'Invalid row fields'; END IF;
      INSERT INTO public.photos (owner_id, id, updated_at, deleted_at, device_id, file_name, captured_at, width, height) SELECT owner_id, id, updated_at, deleted_at, device_id, file_name, captured_at, width, height FROM jsonb_populate_record(NULL::public.photos, payload)
      ON CONFLICT (owner_id,id) DO UPDATE SET updated_at = EXCLUDED.updated_at, deleted_at = EXCLUDED.deleted_at, device_id = EXCLUDED.device_id, file_name = EXCLUDED.file_name, captured_at = EXCLUDED.captured_at, width = EXCLUDED.width, height = EXCLUDED.height;
      SELECT pg_catalog.jsonb_build_object('table','photos',
        'owner_id',t.owner_id,'id',t.id,'updated_at',t.updated_at,
        'deleted_at',t.deleted_at,'device_id',t.device_id,
        'data',pg_catalog.to_jsonb(t)-ARRAY['owner_id','id','updated_at','deleted_at','device_id','server_seq'])
      INTO stored FROM public.photos t WHERE t.owner_id=auth.uid() AND t.id=(item->>'id')::uuid;


ELSE RAISE EXCEPTION 'Unsupported sync table';
    END CASE;
    -- Return the actual stored version, even if a clamped/stale write was ignored
    -- and its existing sequence is behind the client's incremental cursor.
    accepted := accepted || pg_catalog.jsonb_build_array(stored);
  END LOOP;
  RETURN accepted;
END $$;

REVOKE ALL ON FUNCTION public.sync_push(jsonb) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.sync_push(jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.row_sync_guard() FROM PUBLIC, anon, authenticated;

-- Trigger execution does not require client EXECUTE; only trigger creation does.

-- USAGE permits invoker nextval; SELECT and UPDATE (setval) are not needed.
REVOKE ALL ON SEQUENCE public.row_sync_seq FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SEQUENCE public.row_sync_seq TO authenticated;

COMMIT;
