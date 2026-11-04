# M2-17: shared quota prerequisite

Status: blocked before implementation. Plan scope: M2-17, WK-28, WK-30,
IN-15 (AI workout summary, Q46). Inspected base: origin/main at
5395c0d63e76b8ed8ad845025524cea0f06b5495.

The task explicitly requires stopping and explaining the prerequisite in the
draft PR body if a schema change is necessary. No feature code or SQL was changed.

## Evidence

- `supabase/functions/_shared/quota.ts` delegates quota consumption and release
  to `consume_ai_quota` and `release_ai_quota`; limits live in SQL.
- `supabase/migrations/20261004120000_ai_quota.sql:12` restricts
  `public.ai_usage.kind` to `photo` and `describe`. The existing table is named
  `ai_usage`, rather than `ai_quota`.
- The same migration's consume, release, and status RPCs accept only those two
  kinds, with limits of 10 and 20. Every other kind raises `bad quota kind`.
- A search of all checked-in migrations found no subsequent definition extending
  the constraint or these RPCs to workout summaries.

Adding a TypeScript feature key cannot make a new quota bucket work. Reusing
`photo` or `describe` would mix food and workout usage and retain the wrong daily
limit. A phone-only counter would not enforce five requests across devices or
parallel requests. Direct table writes would bypass the required atomic shared
quota pattern.

## Required prerequisite

A separately authorized SQL change must extend the existing kind constraint and
consume/release/status RPCs with a dedicated workout-summary kind and limit 5,
preserving atomic consumption and the existing food limits. It should prove the
fifth request succeeds, the sixth is refused, users and features are isolated,
and concurrent requests cannot exceed five. No SQL is proposed or applied here.

After that prerequisite, resume the phone/server allowlist with shared synthetic
vectors, guarded Haiku endpoint, Finish/History card, length preference,
regeneration, free feedback, AI label/tint, and versioned consent update. The
existing strip guard, food endpoint, phone guard, consent sheet, and workout
Finish/summary screens were inspected as reuse points.

No deployment, remote Supabase access, login, AI call, telemetry, secret access,
sync flag change, or protected-directory edit was performed.
