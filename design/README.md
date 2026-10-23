# Insight Daily design system (v0.1.1, S1 draft)

Status: **draft with placeholder values.** The real values come from the S3 slider mockup, through a proposal PR.

## Rules (D18, D19, D24, FP82, FP83)
- Claude and Codex both load the shared Insight design skill before any UI work (D18, FP83). The skill gets written in S2. **Codex never edits `tokens.ts`.**
- Any token change goes through a proposal PR. Elliot opens it (Claude drafts), Codex does a read-only GPT check, Quinn reviews, and then it waits for Will's save tap. Token and design PRs are excluded from VR25 auto-merge.
- Figma copies these tokens. This repo folder is the source.
- At each milestone Quinn checks Apple's Human Interface Guidelines and adds a pass/fail list to the log below (D21).

## Tokens (`tokens.ts`)
- Names describe meaning, not looks: `base.color.pillar.training`, not `orange` (D3).
- One base set, plus per-theme overrides for Calm, Dusk and Sandstone (D4). Each theme picks its own pillar colours in the same hue family (D5). Dusk overrides `themes.dusk.color.pillar.training`, `themes.dusk.color.pillar.food`, `themes.dusk.color.pillar.recovery`, `themes.dusk.color.pillar.sleep`, and `themes.dusk.color.pillar.water`. Sandstone overrides `themes.sandstone.color.pillar.training`, `themes.sandstone.color.pillar.food`, `themes.sandstone.color.pillar.recovery`, `themes.sandstone.color.pillar.sleep`, and `themes.sandstone.color.pillar.water`. Each stays in the same hue family as `base.color.pillar`. Those hexes are placeholders; S3 tunes them.
- Placeholder colours do not meet the D6 contrast rule yet. Sandstone `themes.sandstone.color.text.tertiary` is about 3.4-3.8:1, and white (`themes.sandstone.color.text.onAccent`) on `base.color.accent.default` is about 2.16:1. The slider-mockup step (S3) sets the real values.
- `base.color.pillar.recovery` and `base.color.pillar.water` are both blue. S3 must check they look distinct.
- Type: named steps that scale with Dynamic Type, the iPhone text-size setting (D7). The six steps map to iOS text styles: `type.step.display` → largeTitle, `type.step.title` → title2, `type.step.body` → body, `type.step.caption` → caption1, `type.step.headline` → headline, `type.step.callout` → callout. Every number uses tabular figures (`type.numbers.fontVariant`), so digits are equal width and line up (D8).
- Spacing uses a 4 pt grid: `space.xs` 4, `space.s` 8, `space.m` 12, `space.l` 16, `space.xl` 24, `space.xxl` 32 (D9). There are 3 corner sizes: `radius.small`, `radius.card`, `radius.sheet` (D10).
- Motion: each preset (Basic, Calm, Lively) shares one duration scale, `motionDurationMs` 160/260/420 (`motion[preset].durationMs.quick`, `motion[preset].durationMs.standard`, `motion[preset].durationMs.slow`), on purpose, so Basic is slightly slower than before, and has its own curve (`motion[preset].curve`) (D11). Intensity changes the amount, never the speed. S3 tunes the scale.
- Every animation goes through one shared Reduce Motion hook (D12, built in S2).

## Haptics (D13)
Only the moments named in `haptics` may buzz: `haptics.setDone`, `haptics.pr`, `haptics.restEnd`, `haptics.unlock`, `haptics.waterTick`, `haptics.waterGoal`, and `haptics.selectionDetent` (the drag-to-pour stops).

## Icons (D14)
One line icon set with 2 stroke weights (`icon.strokeWidth.regular` 1.5, `icon.strokeWidth.bold` 2) in `icon.size` 16, 20, 24 and 28.

## Materials: where glass, holo and 3D are allowed (D15)
| Material | Allowed in | Fallback |
|---|---|---|
| Liquid Glass (native) | Tab bar, sheets, Home tiles (Standard material) | Solid surface with Reduce Transparency (FP38). Solid plus outline with Increase Contrast (FP37) |
| Holo (shiny foil effect) | PR cards, unlock moments | Static sheen with Reduce Motion (FP40). Lighter version on low-end Android (FP19) |
| 3D | Body Atlas (live), pre-rendered summit tokens, Welcome lens, PR lift objects, alt icons | Flat image, at most 1.5 MB per extra item (FP75, FP80) |

## Components (D16)
| Component | States | Tokens used |
|---|---|---|
| Button | default, pressed, disabled, loading | `base.color.accent.default`, `radius.small`, `type.step.headline` |
| Card / Home tile | default, pressed, hidden (pillar off) | `base.color.surface.card`, `radius.card`, `space.l` |
| Sheet | open, dragging, closed | `base.color.surface.sheet`, `radius.sheet`, `motion[preset].durationMs.standard` |
| Goal ring | empty, partial, goal hit (ring pulse, FP36) | `base.color.pillar.training`, `base.color.pillar.food`, `base.color.pillar.recovery`, `base.color.pillar.sleep`, `base.color.pillar.water`, `motion`, `haptics` |
| Water vessel | level 0-100%, adding, goal | `base.color.pillar.water`, `motion`, `haptics.waterTick`, `haptics.waterGoal` |
| Toast (undo) | shown 5 s, dismissed | `base.color.surface.sheet`, `type.step.callout` |
| Offline banner | shown, hidden (FP51) | `base.color.status.warning`, `type.step.caption` |
The full list grows as screens are built. Each new component adds a row here.

## Accessibility checklist for every PR (D17)
Labels on every control · tap areas of at least 44 pt · works at the largest Dynamic Type size · Reduce Motion respected · contrast test passes (4.5:1 for text, 3:1 for graphics, D6). Placeholder colours are not at those ratios yet; S3 sets the real values.

## Do and don't (D22)
Screenshot pairs from the mockups get added here in the next mockup pass.
- Do: use `space.l` between cards. Don't: hard-code a pixel value.
- Do: `base.color.pillar.water`. Don't: a hex value in a component.

## Changelog (D20)
- 0.1.0 (Oct 23, 2026): S1 draft with placeholder values.
- 0.1.1 (Oct 23, 2026): B1 — colour leaves are string, so theme overrides typecheck. M1 — placeholder colours miss the D6 contrast rule; S3 sets the real values. M2 — accent and recovery placeholders differ. M3 — one shared motion scale, and all six type steps map to iOS text styles. M4 — the selection-detent comment reads animation idea #23 / W6. README token paths match `tokens.ts`. Dusk and Sandstone each override all five pillar colours (placeholders in the base hue families; S3 tunes them). The shared Insight design skill is named; it gets written in S2.

## Quinn HIG log (D21)
No milestone checks yet.
