# P2c implementation plan

Goal: implement the supplied M1 part 2 scope (§7.1/§7.3/§12.1; Q2/Q11/Q12/Q90/Q93/Q98/Q103/Q124).

Architecture: one WAL SQLite file, owner-namespaced typed row tables, atomic row/outbox writes, persistent sequence cursors. Pure sync engine with injected transport; Supabase configuration restricted to loopback during this draft. Auth and demo gate all private routes. Server SQL remains unapplied outside PGlite.

Execution: inline, test-first; coordinator owns all Git writes. No builds, Docker, hosted connections, secrets, telemetry or production migrations.

1. Add failing config, chunk-storage and row conflict tests; implement fail-closed local-only config, bounded chunk storage and shared row validation/LWW.
2. Add server isolation/conflict/sequence/tombstone tests; implement draft SQL with explicit grants/RLS and invoker RPC. Serialize owner writes before assigning sequences so commit order cannot skip rows.
3. Add repository durability/atomicity/account-isolation tests; implement Drizzle migrations/schema and SQLite repository, independent children, health-source exclusion and local Oura cache.
4. Add injected-transport convergence/retry/restart properties; implement incremental paging, durable outbox acknowledgement and debounced/foreground/reconnect/manual triggers.
5. Add mocked auth/component/gating tests; implement SecureStore session lifecycle, welcome/forms/demo/account UI and SQLite appearance persistence.
6. Run TypeScript, lint, doctor, install check, complete Jest suites and root regression command. Record exact results, dependency versions, manifest and Quinn review points in p2-sync.md.

Review focus: account changes during requests; same-millisecond edits; cursor values above JS safe integers; interrupted token writes; child survival under parent deletion. Tests belong to the owning tasks above.

## Execution record

All six steps completed. Final native validation: TypeScript/lint/dependency check PASS; Doctor 20/20; Jest 92 tests across 16 suites PASS. Root regression prerequisites remain unavailable as detailed in p2-sync.md. Independent review findings were addressed with failing-then-passing regression tests; Quinn's cross-family review and Will's HIGH-risk approval remain outstanding. Git writes, builds, hosted access and schema deployment were not performed.
