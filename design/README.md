# Insight Daily design system (v0.1.0, S1 draft)

Status: **draft with placeholder values.** The real values come from the S3 slider mockup, through a proposal PR.

## Rules (D18, D19, D24, FP82, FP83)
- Claude and Codex both load this guide before any UI work. **Codex never edits `tokens.ts`.**
- Any token change goes through a proposal PR. Elliot opens it (Claude drafts), Codex does a read-only GPT check, Quinn reviews, and then it waits for Will's save tap. Token and design PRs are excluded from VR25 auto-merge.
- Figma copies these tokens. This repo folder is the source.
- At each milestone Quinn checks Apple's Human Interface Guidelines and adds a pass/fail list to the log below (D21).

## Tokens (`tokens.ts`)
- Names describe meaning, not looks: `color.pillar.training`, not `orange` (D3).
- One base set, plus per-theme overrides for Calm, Dusk and Sandstone (D4). Each theme picks its own pillar colours in the same hue family (D5).
- Placeholder colours do not meet the D6 contrast rule yet. Sandstone tertiary is about 3.4-3.8:1, and white on accent is about 2.16:1. The slider-mockup step (S3) sets the real values.
- Type: named steps that scale with Dynamic Type, the iPhone text-size setting (D7). Display, title, body and caption map to the iOS text styles largeTitle, title2, body and caption1. Every number uses tabular figures, so digits are equal width and line up (D8).
- Spacing uses a 4 pt grid: 4, 8, 12, 16, 24, 32 (D9). There are 3 corner sizes: small, card, sheet (D10).
- Motion: each preset (Basic, Calm, Lively) shares one duration scale and has its own curve (D11). Intensity changes the amount, never the speed.
- Every animation goes through one shared Reduce Motion hook (D12, built in S2).

## Haptics (D13)
Only the moments named in `haptics` may buzz: set done, PR, rest end, unlock, water tick, water goal, and the drag-to-pour stops.

## Icons (D14)
One line icon set with 2 stroke weights (regular 1.5, bold 2) in sizes 16, 20, 24 and 28.

## Materials: where glass, holo and 3D are allowed (D15)
| Material | Allowed in | Fallback |
|---|---|---|
| Liquid Glass (native) | Tab bar, sheets, Home tiles (Standard material) | Solid surface with Reduce Transparency (FP38). Solid plus outline with Increase Contrast (FP37) |
| Holo (shiny foil effect) | PR cards, unlock moments | Static sheen with Reduce Motion (FP40). Lighter version on low-end Android (FP19) |
| 3D | Body Atlas (live), pre-rendered summit tokens, Welcome lens, PR lift objects, alt icons | Flat image, at most 1.5 MB per extra item (FP75, FP80) |

## Components (D16)
| Component | States | Tokens used |
|---|---|---|
| Button | default, pressed, disabled, loading | color.accent, radius.small, type.headline |
| Card / Home tile | default, pressed, hidden (pillar off) | surface.card, radius.card, space.l |
| Sheet | open, dragging, closed | surface.sheet, radius.sheet, motion.standard |
| Goal ring | empty, partial, goal hit (ring pulse, FP36) | pillar.*, motion, haptics |
| Water vessel | level 0-100%, adding, goal | pillar.water, motion, haptics.waterTick/waterGoal |
| Toast (undo) | shown 5 s, dismissed | surface.sheet, type.callout |
| Offline banner | shown, hidden (FP51) | status.warning, type.caption |
The full list grows as screens are built. Each new component adds a row here.

## Accessibility checklist for every PR (D17)
Labels on every control · tap areas of at least 44 pt · works at the largest Dynamic Type size · Reduce Motion respected · contrast test passes (4.5:1 for text, 3:1 for graphics, D6). Placeholder colours are not at those ratios yet; S3 sets the real values.

## Do and don't (D22)
Screenshot pairs from the mockups get added here in the next mockup pass.
- Do: use `space.l` between cards. Don't: hard-code a pixel value.
- Do: `color.pillar.water`. Don't: a hex value in a component.

## Changelog (D20)
- 0.1.0 (Oct 23, 2026): S1 draft with placeholder values.
- 0.1.0 (Oct 23, 2026): Theme overrides typecheck against string colour leaves. Accent and recovery placeholders differ. Motion presets share one duration scale. Type steps name their iOS text styles. Contrast still waits on S3.

## Quinn HIG log (D21)
No milestone checks yet.
