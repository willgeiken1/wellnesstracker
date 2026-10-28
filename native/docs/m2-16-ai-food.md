# M2-16 — AI food (Snap + Describe), draft

Implements the supplied FD-14–FD-18 and PV-04 scope on M2-13 food core. The plan and answers library files were not available in this worktree; this change does not revise a product decision.

## Boundary and storage

`FoodAiService` builds a fresh allowlisted food-only request. It never reads a profile, Health, Oura, targets, or calorie-burn data. The phone guard mirrors the food guard in `supabase/functions/_shared/strip.ts`; shared synthetic vectors run against both implementations. Platform names also fail closed on the phone. Validation precedes both quota reservation and client invocation. Model output is projected to known nutrient fields, validated, and checked for forbidden labels before being offered for logging. Raw errors are not surfaced or logged.

`FoodAiClient` is injected through `FoodAiClientProvider`. Its default adapter uses the existing `food-photo` and `food-describe` endpoints through the existing loopback-only auth client. No configuration is read until a consented request reaches that adapter; missing configuration fails closed. No Anthropic SDK, credential, backend change, or telemetry is added. Tests exclusively inject stubs. The adapter projects only image/text and local quota date/timezone, honors AbortSignal, normalizes legacy nutrient responses, and routes structured server quota limits to the same local fallback. The `food-estimate` model label is an internal interface placeholder; the existing endpoint selects its actual model. Because legacy endpoints do not return per-item confidence/origin, photos, names absent from the description, and results with uncertainty notes are conservatively flagged as added/unsure.

All AI state uses the existing owner-scoped SQLite `workout_local` table under `foodAi`. This table is outside the sync catalog and existing account erasure removes it. Consent, quotas, pending JPEG bytes, review state, and thumbnails stay local. The default v1 columns flag remains false. A user-initiated phone backup can include local state; no automatic upload is added.

## Photos, quotas, and recovery

ImagePicker supplies a selected meal image; ImageManipulator re-renders a JPEG with a longest edge of at most 1280 pixels. No picker metadata enters the request. A separate small JPEG thumbnail is capped at 40,960 base64 characters (approximately 30 KB decoded). Temporary picker/render files are removed. Only photos of meals should be selected: the text guard cannot inspect pixels for private information. The consent sheet states this boundary.

Photos are committed to SQLite before attempting a send. A connected cold start, foreground resume, reconnect event, or explicit retry drains the queue. Completed results replace the queued image in one local write. Logging the result and its confirmation/thumbnail metadata is transactional. A process-kill test terminates a standalone production queue writer with SIGKILL and drains its persisted job after reopening SQLite.

Quota reservations happen before transport, on the local calendar date, with independent caps of 10 photo attempts and 20 description attempts. Offline enqueueing consumes no quota. Interrupted or failed attempts conservatively retain their reservation because the client cannot know whether the provider processed them. Delivery after an interruption is at least once; exactly-once provider execution needs server idempotency outside this step. Photos at the cap lose their upload bytes and keep an optional thumbnail for Describe/Manual fallback. Pending queue length is capped at ten images.

Consent is checked again immediately before egress and after the response. Revocation increments a generation, aborts any active request, clears queued images/results, and prevents a late reply from being stored. A request already received remotely cannot be recalled. Disabling thumbnails removes all stored thumbnail references, including queued/results/fallback copies; re-enabling does not restore them. Pending full-size upload images remain until sent or consent is revoked, as explained in Privacy.

## Presentation

AI calories count in normal totals; unconfirmed rows and ring arcs are dashed. Each result separates named and AI-added items, flags uncertainty, reveals items one at a time, and reveals all immediately with Reduce Motion. Portions support 0.5–2×. Valid grams/ounces input confirms an item and scales its nutrients when the original mass is known. The next morning (after the existing 4 AM food-day boundary), yesterday's unconfirmed entries appear in one quiet review row per day; no notification is scheduled.

## Outstanding validation

No iOS simulator/Pixel dev build or screenshots were produced in this Linux task environment. New image dependencies require rebuilding the development client. Live endpoint/device validation and Quinn review remain outstanding. Expo dependency health reports six patch-version mismatches; no unrelated dependency upgrades or check suppressions were added. The optional root PostgreSQL quota integration tests require unavailable `psql` tooling.
