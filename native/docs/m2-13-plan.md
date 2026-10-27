# M2-13 Food core draft plan
Spec: supplied FD-01–10, FD-19/20/22, ONB-10. Stacked on M2-12.
1. Test then implement timezone attribution, nullable totals, portions, CRUD,
   guarded tombstone Undo, saved/recent/favorites/combos/copy, and target selection.
2. Test then implement accessible Food screen, manual entry, targets, calendar;
   connect both routes. No animation; canonical kJ; owner-scoped local extras.
3. Run native typecheck/lint/full tests, offline dependency diagnostics, root tests.
   Record counts and limitations in .codex-pr-body.md; leave uncommitted.
Review: DST/year boundaries, null nutrients, invalid portions, future writes,
failed saves, owner isolation. No repository/schema/transport/flag changes.

Verification: typecheck and lint passed; native CI tests 1,244 / 69 suites passed.
Food coverage: 29 tests / 4 suites passed. Root fallback: 434 passed, 12 environment/
harness failures. See ../../.codex-pr-body.md for incomplete visual/integration work.
All changes are uncommitted; repository and restricted paths remain unchanged.
