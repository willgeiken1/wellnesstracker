# INS-01 token proposal: v2 palettes, renamed tokens, contrast

**DRAFT - not applied; needs Elliot's proposal PR + Will's save tap.**

Oct 29, 2026. Task: `task-breakdown.md` row INS-01. Decision: Will's I4 (v1 ships v2's full palette list; tokens renamed).

This file proposes values only. It does not change `native/src/design/tokens.ts`, `native/src/design/tokens.json`, `design/tokens.ts` or any app code. Under design/README.md (D19), Elliot opens the token proposal PR (Claude drafts), Codex does a read-only GPT check, Quinn reviews, and nothing is applied until Will's save tap.

Sources:
- `native/design/REDESIGN.md` §5 (13 palettes, 12 role colours each, dark and light, the derived roles, the water note Q-C and both duplicate-colour notes) and §5.1 (proposed token paths).
- `design/README.md`: D3 (names describe meaning) and D6 (4.5:1 for text, 3:1 for graphics).
- `native/src/design/tokens.json` (today's app names) and `design/tokens.ts` (S1 placeholder names).
- The v2 prototype is not in this repo, so the palette values come from the REDESIGN.md §5 table. The test checks every hex against that table.

All colours are design values. No health data is involved.

## How the tables are made

`native/scripts/ins01-palette-contrast.ts` holds the 13 palettes, computes the derived roles, grades every pair, proposes fixes and writes the generated part of this file. `native/tests/ins01-palette-contrast.test.ts` recomputes the whole generated block and fails if this file drifts from it. It also fails if any proposed pair misses D6, or if water or a moved pillar sits too close to another meaning colour. To refresh after a change, run this from `native/`:

```sh
node scripts/ins01-palette-contrast.ts --write
```

**Derived roles.** REDESIGN.md §1.2 and §5 name these roles. Where v2's exact formula is not written down, the rule below is this proposal's.

| Role | Rule |
|---|---|
| `surface2` (panel) | `surface` mixed toward `text`: 7% in dark, 5% in light (REDESIGN.md §1.2) |
| `hair` / `hair2` | `text` at 9% / 20% over `bg` |
| `accentSoft` | `accent` at 16% over `surface` (card) |
| `ai` | 50/50 sRGB mix of `accent` and `sleep`. Where the mix misses 4.5:1, an explicit `ai` value is proposed |
| `accentOnText` | `accent` when it passes 4.5:1 on `bg`, panel and card. Otherwise the nearest HSL lightness of `accent` that does |

**Pairs graded, per mode.** Text pairs need 4.5:1. Graphics pairs need 3:1.
- Text, on `bg`, panel, card and `accentSoft`: `text`, `muted`.
- Text, on `bg`, panel and card: `accentOnText`, `ai`.
- Text, on `accent`: `onAccent`.
- Graphics, on `bg`, panel and card: `accent`, `training`, `food`, `recovery`, `sleep`, `water`, `success`, `warn`.

`hair` and `hair2` are decorative separators, so they are listed but not graded. Ratios use WCAG 2.x relative luminance and are rounded down, so a 4.499 shows as 4.49 and is marked FAIL.

**Fix rule.** A failing colour keeps its hue and saturation. Only its HSL lightness moves, in 0.5% steps away from the surface, until every pair it is in passes. If `onAccent` fails, it is switched to whichever of `#111111`, `#FFFFFF` or `bg` contrasts best with `accent`. If none of those passes, `accent` moves instead. Bold values in the proposed columns are changed values.

## 1. Rename map (I4)

### 1.1 Palettes: today's names to v2 ids, 1:1

Today the app has 2 modes × 4 accents in `tokens.json`. `design/tokens.ts` has 3 S1 themes. Under I4, both become the 13 v2 palettes, and each palette has a `dark` and a `light` mode. ΔE is the OKLab distance between today's dark accent and the v2 dark accent.

| # | v2 palette | id | Today's `tokens.json` | Today's `design/tokens.ts` | Note |
|---|---|---|---|---|---|
| 1 | Sea Glass Tide | `seaGlassTide` | `accents.sea` | none | Accent ΔE 0.020 |
| 2 | Mountain Mist | `mountainMist` | none | none | New |
| 3 | Moonlight Dusk | `moonlightDusk` | `accents.dusk` | `themes.dusk` | Same name. Accent ΔE 0.036 |
| 4 | Desert Mirage | `desertMirage` | `accents.sand` | `themes.sandstone` | Accent ΔE 0.025. Sandstone is the warm light theme |
| 5 | Spring Citrus | `springCitrus` | `accents.citrus` | none | Same dark accent (#D5F56B) |
| 6 | Lotus Garden | `lotusGarden` | none | none | New |
| 7 | Aurora Fjord | `auroraFjord` | none | none | New |
| 8 | Berry Meadow | `berryMeadow` | none | none | New |
| 9 | Golden Hour | `goldenHour` | none | none | New |
| 10 | Glacier Bloom | `glacierBloom` | none | `themes.calm` | Calm's blue accent #7FB2FF is ΔE 0.063 from it. Moonlight Dusk is nearer (0.045) but is already Dusk's match |
| 11 | Forest Ember | `forestEmber` | none | none | New |
| 12 | Midnight Neon | `midnightNeon` | none | none | New. Secret `neon`, `meta.locked` true |
| 13 | Holographic Chrome | `holographicChrome` | none | none | New. Secret `holo`, `meta.locked` true |

Today's `themes.dark` / `themes.light` become the `dark` / `light` mode of each palette (`themes.<id>.dark|light`). Today's global `light`/`dark` override choice (`ThemeOverride`) stays as it is.

### 1.2 Leaves: today's names to v2 token paths

Paths follow REDESIGN.md §5.1 (D3: names describe meaning, not looks).

| Today (`tokens.json`) | Today (`design/tokens.ts`) | v2 role | Proposed path (`themes.<id>.<mode>.…`) |
|---|---|---|---|
| `bg` | `color.surface.page` | bg | `color.surface.base` |
| `surface-2` | none | surface2 (derived) | `color.surface.panel` |
| `surface` | `color.surface.card`, `color.surface.sheet` | surface | `color.surface.card` (sheets use card, §5.1) |
| `text` | `color.text.primary` | text | `color.text.primary` |
| `text-muted` | `color.text.secondary`, `color.text.tertiary` | muted | `color.text.secondary` (tertiary folds in. v2 has one muted role) |
| `accent` | `color.accent.default` | accent | `color.accent.default` |
| `on-accent` | `color.text.onAccent` | onAccent | `color.text.onAccent` |
| `accent-tint` | none | accentSoft (derived) | `color.accent.soft` |
| none | none | accentOnText (derived) | `color.accent.text` (new path. §5.1 lists the role, not a path) |
| `accent-2` | none | ai (derived) | `color.ai.estimate`. `accent-2` has no v2 role. Its one use moves to `ai` or the pillar it stands for |
| none | `color.pillar.training` … `.water` | training / food / recovery / sleep / water | `color.pillar.training` / `.food` / `.recovery` / `.sleep` / `.water` |
| `success` / `warning` | `color.status.success` / `.warning` | success / warn | `color.status.success` / `color.status.warning` |
| none | `color.border.subtle` / `.default` | hair / hair2 (derived) | `color.separator.default` / `color.separator.strong` |
| `swatches` | none | none | `meta.swatches`, kept for the Appearance picker and recomputed as `[accent, recovery, sleep]` of the dark mode (open question O3) |
| none | none | secret | `meta.secret` (`neon` / `holo`), `meta.locked` default true |

Today's names that have **no v2 role** stay shared across palettes, outside `themes.<id>`, with today's values, until a later proposal changes them:

| Today | Proposed shared path | Why |
|---|---|---|
| `danger` / `on-danger` | `color.status.danger` / `color.text.onDanger` | v2 has no danger role. Destructive actions still need one |
| `ring-oura` | `color.source.oura` | Source colour, not a palette role |
| `token-muted` / `token-muted-highlight` | `color.token.muted` / `color.token.mutedHighlight` | Summit-token art, not a palette role |
| `scrim` (`tokens.ts`) | `color.scrim` | Unchanged |

## 2-3. Per-palette values and the contrast table

Section 2 (values) and section 3 (contrast, failures and fixes) are generated together, palette by palette, below. Each palette lists:
- every role in dark and light, derived roles included, as v2 has it and as proposed;
- every graded pair, with its v2 ratio and its proposed ratio;
- the failures, with the fix for each;
- near-duplicate meaning colours. These are flagged, not fixed (section 5.2).

What the tables show:
- Every palette's **light mode** fails at least 3 pairs in v2. The shared water placeholder `#4FC3F7` is 1.66-2.00:1 on light surfaces. Proposed water fixes these (section 4).
- Other v2 failures are small. Each takes a lightness nudge: Spring Citrus dark `muted`, Berry Meadow dark `recovery` and `ai`, Golden Hour dark `food` and `sleep`, Forest Ember light `ai`, and Midnight Neon light `muted`.
- After the fixes, **every pair in all 13 palettes passes D6** (the summary's "Proposed failing pairs" column is all 0, and the test enforces it).

## 4. Water (Q-C)

v2 uses one placeholder, `#4FC3F7`, for every palette. It fails 3:1 on every light surface and, in several palettes, sits close to `recovery`. Proposed: a per-palette water colour, chosen by the script.
- Hue window 175-225° (cyan to sky blue), one hue shared by both modes.
- Within the window, the hue chosen keeps water farthest, in OKLab, from every other meaning colour of that palette (accent, the four other pillars, success and warn), in both modes.
- Saturation follows the palette's `recovery`. Lightness is the nearest value that clears 3:1 on `bg`, panel and card. Light mode starts mid-tone and darkens only as far as needed, so water does not turn navy.
- Floor: ΔE ≥ 0.08 from `recovery` and from every other meaning colour, in both modes. The test enforces it.

The generated "Water (Q-C)" table below lists every palette's water and its distance from recovery. These are scripted starting points. Elliot may tune them by eye in the proposal PR, as long as the test stays green.

## 5. Duplicate colours (CHECKLIST M2: a colour always means one thing)

### 5.1 The two required fixes (REDESIGN.md §5)

1. **Spring Citrus: `accent` = `training` (#D5F56B / #5C7A08).** Resolution: **the accent keeps the lime; training moves to orange.** The lime is the palette's signature and today's `citrus` accent, and users pick a palette by its accent. Orange is also what `design/tokens.ts` base used for training (#FF8A4C), so training goes back to its original family. The script searches hues 20-60° for the colour farthest from the coral `food`, yellow `warn` and green `success`. Proposed values are in palette 5 below, and both modes clear ΔE 0.08 from every other meaning colour.
2. **Lotus Garden: `accent` = `food` (#F28C82 / #B3443A).** Resolution: **the accent keeps the lotus coral; food moves to a peach-orange** (hue window 15-40°). This is the food family in most other palettes (Sea Glass Tide, Mountain Mist, Desert Mirage, Holographic Chrome). Proposed values are in palette 6 below, and both modes clear ΔE 0.08.

The test fails if any palette's accent equals any pillar in either mode, or if a moved pillar comes within ΔE 0.08 of another meaning colour.

### 5.2 Near-duplicates found while checking (flagged, not fixed)

Using the same ΔE 0.08 floor, v2 also has many **near**-duplicates that §5 did not list. The worst are:
- Holographic Chrome light `accent` vs `sleep` (ΔE 0.016);
- Mountain Mist light `training` vs `success` (0.009);
- Forest Ember light `accent` vs `success` (0.013);
- Golden Hour dark `accent` vs `training` (0.028);
- Desert Mirage light `accent` vs `food` (0.034).

Most of the rest are green `training` vs green `success`, or orange `food` vs amber `warn`. Changing these would change what the v2 palettes look like, and that is Will's call, so this proposal **flags them and leaves them unchanged**. Each palette's list is below. See open question O1.

## Generated tables

<!-- INS-01:GENERATED:START (node scripts/ins01-palette-contrast.ts --write) -->

### Summary

Pairs graded per mode: 19 text pairs (4.5:1) and 24 graphics pairs (3:1), 43 per mode, 86 per palette.

| # | Palette | id | Secret | v2 failing pairs (dark / light) | Proposed failing pairs | Values changed | Near-duplicates flagged |
|---|---|---|---|---|---|---|---|
| 1 | Sea Glass Tide | `seaGlassTide` | no | 0 / 3 | 0 | 2 | 6 |
| 2 | Mountain Mist | `mountainMist` | no | 0 / 3 | 0 | 2 | 7 |
| 3 | Moonlight Dusk | `moonlightDusk` | no | 0 / 3 | 0 | 2 | 6 |
| 4 | Desert Mirage | `desertMirage` | no | 0 / 3 | 0 | 2 | 4 |
| 5 | Spring Citrus | `springCitrus` | no | 1 / 3 | 0 | 5 | 1 |
| 6 | Lotus Garden | `lotusGarden` | no | 0 / 3 | 0 | 4 | 2 |
| 7 | Aurora Fjord | `auroraFjord` | no | 0 / 3 | 0 | 2 | 3 |
| 8 | Berry Meadow | `berryMeadow` | no | 2 / 3 | 0 | 4 | 1 |
| 9 | Golden Hour | `goldenHour` | no | 2 / 3 | 0 | 4 | 2 |
| 10 | Glacier Bloom | `glacierBloom` | no | 0 / 3 | 0 | 2 | 1 |
| 11 | Forest Ember | `forestEmber` | no | 0 / 5 | 0 | 3 | 6 |
| 12 | Midnight Neon | `midnightNeon` | neon | 0 / 4 | 0 | 3 | 1 |
| 13 | Holographic Chrome | `holographicChrome` | holo | 0 / 3 | 0 | 2 | 4 |

### Water (Q-C)

Shared v2 placeholder #4FC3F7 replaced per palette. ΔE is OKLab distance to recovery (floor 0.08); "nearest" is the closest other meaning colour.

| Palette | Recovery dark | Water dark | ΔE dark | Recovery light | Water light | ΔE light | Nearest (dark / light) |
|---|---|---|---|---|---|---|---|
| Sea Glass Tide | #4AA8F0 | #4A81F0 | 0.105 | #1A6FB0 | #4D80E5 | 0.102 | recovery 0.105 / recovery 0.102 |
| Mountain Mist | #8FB4F0 | #8FF0E8 | 0.168 | #2D5FA8 | #29998F | 0.188 | accent 0.125 / accent 0.127 |
| Moonlight Dusk | #8EC5FF | #8EFFFB | 0.159 | #2A62A8 | #279B97 | 0.179 | training 0.125 / training 0.126 |
| Desert Mirage | #7FC0C2 | #7F90C2 | 0.135 | #1F6E70 | #5F7CD3 | 0.173 | sleep 0.106 / sleep 0.123 |
| Spring Citrus | #4FD1D9 | #4F84D9 | 0.217 | #0B7178 | #4485EE | 0.192 | sleep 0.144 / sleep 0.148 |
| Lotus Garden | #86B8F2 | #86F2F2 | 0.159 | #2862A6 | #259A9A | 0.174 | training 0.098 / training 0.128 |
| Aurora Fjord | #75D4EF | #75EFE5 | 0.081 | #2E87E0 | #179C90 | 0.152 | recovery 0.081 / accent 0.137 |
| Berry Meadow | #3E68E8 | #30ACE6 | 0.181 | #11268B | #1995CF | 0.310 | recovery 0.181 / success 0.214 |
| Golden Hour | #70E5EF | #7090EF | 0.233 | #1990C2 | #4A72E8 | 0.110 | sleep 0.131 / recovery 0.110 |
| Glacier Bloom | #8794CE | #87B2CE | 0.083 | #132185 | #1F92E0 | 0.322 | recovery 0.083 / training 0.111 |
| Forest Ember | #4D6AEA | #4DEAE7 | 0.350 | #4B92CC | #2C9B99 | 0.094 | success 0.093 / recovery 0.094 |
| Midnight Neon | #3DA2FF | #3DDBFF | 0.157 | #1F5FD6 | #1A96B2 | 0.172 | success 0.157 / success 0.166 |
| Holographic Chrome | #6EC1FF | #6EFFFF | 0.170 | #1E6DB8 | #199595 | 0.143 | success 0.169 / training 0.141 |

### 1. Sea Glass Tide (`seaGlassTide`)

**Values** (`themes.seaGlassTide.<mode>.…`; derived roles in italics)

| Role | Token path | v2 dark | v2 light | Proposed dark | Proposed light |
|---|---|---|---|---|---|
| bg | `color.surface.base` | #0C1416 | #F2F6F4 | #0C1416 | #F2F6F4 |
| *surface2* | `color.surface.panel` | #233032 | #F3F4F4 | #233032 | #F3F4F4 |
| surface | `color.surface.card` | #142124 | #FFFFFF | #142124 | #FFFFFF |
| text | `color.text.primary` | #EEF5F3 | #122022 | #EEF5F3 | #122022 |
| muted | `color.text.secondary` | #9DB3B0 | #556866 | #9DB3B0 | #556866 |
| accent | `color.accent.default` | #5FD8BC | #0E7A66 | #5FD8BC | #0E7A66 |
| onAccent | `color.text.onAccent` | #111111 | #FFFFFF | #111111 | #FFFFFF |
| *accentSoft* | `color.accent.soft` | #203E3C | #D8EAE7 | #203E3C | #D8EAE7 |
| *accentOnText* | `color.accent.text` | #5FD8BC | #0E7A66 | #5FD8BC | #0E7A66 |
| training | `color.pillar.training` | #93E07A | #3E7F1E | #93E07A | #3E7F1E |
| food | `color.pillar.food` | #F2A65A | #B4580E | #F2A65A | #B4580E |
| recovery | `color.pillar.recovery` | #4AA8F0 | #1A6FB0 | #4AA8F0 | #1A6FB0 |
| sleep | `color.pillar.sleep` | #E9B2EC | #6B4FC4 | #E9B2EC | #6B4FC4 |
| water | `color.pillar.water` | #4FC3F7 | #4FC3F7 | **#4A81F0** | **#4D80E5** |
| success | `color.status.success` | #5FD38A | #1F7A43 | #5FD38A | #1F7A43 |
| warn | `color.status.warning` | #F2C14E | #8F6400 | #F2C14E | #8F6400 |
| *hair* | `color.separator.default` | #20282A | #DEE3E1 | #20282A | #DEE3E1 |
| *hair2* | `color.separator.strong` | #394142 | #C5CBCA | #394142 | #C5CBCA |
| *ai* | `color.ai.estimate` | #A4C5D4 | #3D6595 | #A4C5D4 | #3D6595 |

**Contrast** (ratio to 1, rounded down; v2 water = shared placeholder #4FC3F7)

| Foreground on surface | Floor | v2 dark | v2 light | Proposed dark | Proposed light |
|---|---|---|---|---|---|
| text on bg | 4.5 | 16.84 | 15.34 | 16.84 | 15.34 |
| text on surface2 | 4.5 | 12.32 | 15.18 | 12.32 | 15.18 |
| text on surface | 4.5 | 14.92 | 16.72 | 14.92 | 16.72 |
| text on accentSoft | 4.5 | 10.45 | 13.41 | 10.45 | 13.41 |
| muted on bg | 4.5 | 8.43 | 5.41 | 8.43 | 5.41 |
| muted on surface2 | 4.5 | 6.17 | 5.35 | 6.17 | 5.35 |
| muted on surface | 4.5 | 7.47 | 5.90 | 7.47 | 5.90 |
| muted on accentSoft | 4.5 | 5.23 | 4.73 | 5.23 | 4.73 |
| accentOnText on bg | 4.5 | 10.67 | 4.82 | 10.67 | 4.82 |
| accentOnText on surface2 | 4.5 | 7.81 | 4.77 | 7.81 | 4.77 |
| accentOnText on surface | 4.5 | 9.45 | 5.25 | 9.45 | 5.25 |
| ai on bg | 4.5 | 10.21 | 5.51 | 10.21 | 5.51 |
| ai on surface2 | 4.5 | 7.47 | 5.45 | 7.47 | 5.45 |
| ai on surface | 4.5 | 9.04 | 6.01 | 9.04 | 6.01 |
| onAccent on accent | 4.5 | 10.82 | 5.25 | 10.82 | 5.25 |
| accent on bg | 3 | 10.67 | 4.82 | 10.67 | 4.82 |
| accent on surface2 | 3 | 7.81 | 4.77 | 7.81 | 4.77 |
| accent on surface | 3 | 9.45 | 5.25 | 9.45 | 5.25 |
| training on bg | 3 | 11.69 | 4.52 | 11.69 | 4.52 |
| training on surface2 | 3 | 8.55 | 4.47 | 8.55 | 4.47 |
| training on surface | 3 | 10.35 | 4.93 | 10.35 | 4.93 |
| food on bg | 3 | 9.20 | 4.43 | 9.20 | 4.43 |
| food on surface2 | 3 | 6.73 | 4.38 | 6.73 | 4.38 |
| food on surface | 3 | 8.15 | 4.83 | 8.15 | 4.83 |
| recovery on bg | 3 | 7.23 | 4.88 | 7.23 | 4.88 |
| recovery on surface2 | 3 | 5.29 | 4.83 | 5.29 | 4.83 |
| recovery on surface | 3 | 6.40 | 5.32 | 6.40 | 5.32 |
| sleep on bg | 3 | 10.68 | 5.44 | 10.68 | 5.44 |
| sleep on surface2 | 3 | 7.81 | 5.38 | 7.81 | 5.38 |
| sleep on surface | 3 | 9.46 | 5.93 | 9.46 | 5.93 |
| water on bg | 3 | 9.29 | **1.83 FAIL** | 5.04 | 3.48 |
| water on surface2 | 3 | 6.80 | **1.81 FAIL** | 3.69 | 3.44 |
| water on surface | 3 | 8.23 | **2.00 FAIL** | 4.47 | 3.79 |
| success on bg | 3 | 9.90 | 4.91 | 9.90 | 4.91 |
| success on surface2 | 3 | 7.25 | 4.85 | 7.25 | 4.85 |
| success on surface | 3 | 8.77 | 5.35 | 8.77 | 5.35 |
| warn on bg | 3 | 11.10 | 4.82 | 11.10 | 4.82 |
| warn on surface2 | 3 | 8.12 | 4.77 | 8.12 | 4.77 |
| warn on surface | 3 | 9.83 | 5.26 | 9.83 | 5.26 |

**Fixes**

- dark `water`: #4FC3F7 → #4A81F0 (shared placeholder; per-palette hue distinct from recovery (Q-C))
- light `water`: #4FC3F7 → #4D80E5 (shared placeholder; per-palette hue distinct from recovery (Q-C))

**Near-duplicates flagged** (OKLab ΔE < 0.08 after the fixes above; not changed here)

- dark `accent` #5FD8BC vs `success` #5FD38A: ΔE 0.065
- dark `training` #93E07A vs `success` #5FD38A: ΔE 0.066
- dark `food` #F2A65A vs `warn` #F2C14E: ΔE 0.072
- light `accent` #0E7A66 vs `success` #1F7A43: ΔE 0.050
- light `training` #3E7F1E vs `success` #1F7A43: ΔE 0.046
- light `food` #B4580E vs `warn` #8F6400: ΔE 0.073

### 2. Mountain Mist (`mountainMist`)

**Values** (`themes.mountainMist.<mode>.…`; derived roles in italics)

| Role | Token path | v2 dark | v2 light | Proposed dark | Proposed light |
|---|---|---|---|---|---|
| bg | `color.surface.base` | #101417 | #EEF1F2 | #101417 | #EEF1F2 |
| *surface2* | `color.surface.panel` | #292F34 | #F3F4F4 | #292F34 | #F3F4F4 |
| surface | `color.surface.card` | #1A2026 | #FFFFFF | #1A2026 | #FFFFFF |
| text | `color.text.primary` | #ECF0F2 | #161C20 | #ECF0F2 | #161C20 |
| muted | `color.text.secondary` | #9AA7B0 | #58646C | #9AA7B0 | #58646C |
| accent | `color.accent.default` | #8FC1D9 | #2F6F8C | #8FC1D9 | #2F6F8C |
| onAccent | `color.text.onAccent` | #111111 | #FFFFFF | #111111 | #FFFFFF |
| *accentSoft* | `color.accent.soft` | #2D3A43 | #DEE8ED | #2D3A43 | #DEE8ED |
| *accentOnText* | `color.accent.text` | #8FC1D9 | #2F6F8C | #8FC1D9 | #2F6F8C |
| training | `color.pillar.training` | #7DBF8E | #2F6B3E | #7DBF8E | #2F6B3E |
| food | `color.pillar.food` | #E3A86F | #9A5418 | #E3A86F | #9A5418 |
| recovery | `color.pillar.recovery` | #8FB4F0 | #2D5FA8 | #8FB4F0 | #2D5FA8 |
| sleep | `color.pillar.sleep` | #C3A3E0 | #7A4B9E | #C3A3E0 | #7A4B9E |
| water | `color.pillar.water` | #4FC3F7 | #4FC3F7 | **#8FF0E8** | **#29998F** |
| success | `color.status.success` | #79C99A | #2A6B44 | #79C99A | #2A6B44 |
| warn | `color.status.warning` | #E8C26A | #7F5E00 | #E8C26A | #7F5E00 |
| *hair* | `color.separator.default` | #24282B | #DBDEDF | #24282B | #DBDEDF |
| *hair2* | `color.separator.strong` | #3C4043 | #C3C6C8 | #3C4043 | #C3C6C8 |
| *ai* | `color.ai.estimate` | #A9B2DD | #555D95 | #A9B2DD | #555D95 |

**Contrast** (ratio to 1, rounded down; v2 water = shared placeholder #4FC3F7)

| Foreground on surface | Floor | v2 dark | v2 light | Proposed dark | Proposed light |
|---|---|---|---|---|---|
| text on bg | 4.5 | 16.14 | 15.15 | 16.14 | 15.15 |
| text on surface2 | 4.5 | 11.81 | 15.60 | 11.81 | 15.60 |
| text on surface | 4.5 | 14.32 | 17.19 | 14.32 | 17.19 |
| text on accentSoft | 4.5 | 10.18 | 13.81 | 10.18 | 13.81 |
| muted on bg | 4.5 | 7.51 | 5.35 | 7.51 | 5.35 |
| muted on surface2 | 4.5 | 5.50 | 5.51 | 5.50 | 5.51 |
| muted on surface | 4.5 | 6.67 | 6.07 | 6.67 | 6.07 |
| muted on accentSoft | 4.5 | 4.74 | 4.88 | 4.74 | 4.88 |
| accentOnText on bg | 4.5 | 9.51 | 4.90 | 9.51 | 4.90 |
| accentOnText on surface2 | 4.5 | 6.96 | 5.05 | 6.96 | 5.05 |
| accentOnText on surface | 4.5 | 8.44 | 5.56 | 8.44 | 5.56 |
| ai on bg | 4.5 | 8.90 | 5.46 | 8.90 | 5.46 |
| ai on surface2 | 4.5 | 6.51 | 5.62 | 6.51 | 5.62 |
| ai on surface | 4.5 | 7.89 | 6.20 | 7.89 | 6.20 |
| onAccent on accent | 4.5 | 9.70 | 5.56 | 9.70 | 5.56 |
| accent on bg | 3 | 9.51 | 4.90 | 9.51 | 4.90 |
| accent on surface2 | 3 | 6.96 | 5.05 | 6.96 | 5.05 |
| accent on surface | 3 | 8.44 | 5.56 | 8.44 | 5.56 |
| training on bg | 3 | 8.56 | 5.61 | 8.56 | 5.61 |
| training on surface2 | 3 | 6.26 | 5.78 | 6.26 | 5.78 |
| training on surface | 3 | 7.59 | 6.37 | 7.59 | 6.37 |
| food on bg | 3 | 8.90 | 5.06 | 8.90 | 5.06 |
| food on surface2 | 3 | 6.51 | 5.21 | 6.51 | 5.21 |
| food on surface | 3 | 7.89 | 5.74 | 7.89 | 5.74 |
| recovery on bg | 3 | 8.77 | 5.58 | 8.77 | 5.58 |
| recovery on surface2 | 3 | 6.42 | 5.75 | 6.42 | 5.75 |
| recovery on surface | 3 | 7.78 | 6.33 | 7.78 | 6.33 |
| sleep on bg | 3 | 8.49 | 5.55 | 8.49 | 5.55 |
| sleep on surface2 | 3 | 6.21 | 5.72 | 6.21 | 5.72 |
| sleep on surface | 3 | 7.53 | 6.31 | 7.53 | 6.31 |
| water on bg | 3 | 9.23 | **1.76 FAIL** | 13.92 | 3.05 |
| water on surface2 | 3 | 6.76 | **1.81 FAIL** | 10.18 | 3.15 |
| water on surface | 3 | 8.19 | **2.00 FAIL** | 12.35 | 3.47 |
| success on bg | 3 | 9.37 | 5.63 | 9.37 | 5.63 |
| success on surface2 | 3 | 6.85 | 5.80 | 6.85 | 5.80 |
| success on surface | 3 | 8.31 | 6.39 | 8.31 | 6.39 |
| warn on bg | 3 | 10.89 | 5.28 | 10.89 | 5.28 |
| warn on surface2 | 3 | 7.96 | 5.43 | 7.96 | 5.43 |
| warn on surface | 3 | 9.66 | 5.99 | 9.66 | 5.99 |

**Fixes**

- dark `water`: #4FC3F7 → #8FF0E8 (shared placeholder; per-palette hue distinct from recovery (Q-C))
- light `water`: #4FC3F7 → #29998F (shared placeholder; per-palette hue distinct from recovery (Q-C))

**Near-duplicates flagged** (OKLab ΔE < 0.08 after the fixes above; not changed here)

- dark `accent` #8FC1D9 vs `recovery` #8FB4F0: ΔE 0.056
- dark `training` #7DBF8E vs `success` #79C99A: ΔE 0.027
- dark `food` #E3A86F vs `warn` #E8C26A: ΔE 0.070
- dark `recovery` #8FB4F0 vs `sleep` #C3A3E0: ΔE 0.077
- light `accent` #2F6F8C vs `recovery` #2D5FA8: ΔE 0.073
- light `training` #2F6B3E vs `success` #2A6B44: ΔE 0.009
- light `food` #9A5418 vs `warn` #7F5E00: ΔE 0.059

### 3. Moonlight Dusk (`moonlightDusk`)

**Values** (`themes.moonlightDusk.<mode>.…`; derived roles in italics)

| Role | Token path | v2 dark | v2 light | Proposed dark | Proposed light |
|---|---|---|---|---|---|
| bg | `color.surface.base` | #0E0F1A | #F1F1F8 | #0E0F1A | #F1F1F8 |
| *surface2* | `color.surface.panel` | #272939 | #F3F3F4 | #272939 | #F3F3F4 |
| surface | `color.surface.card` | #181A2B | #FFFFFF | #181A2B | #FFFFFF |
| text | `color.text.primary` | #EEEFFA | #161728 | #EEEFFA | #161728 |
| muted | `color.text.secondary` | #A2A5C2 | #5A5D78 | #A2A5C2 | #5A5D78 |
| accent | `color.accent.default` | #A3ABFF | #4B55C8 | #A3ABFF | #4B55C8 |
| onAccent | `color.text.onAccent` | #0E0F1A | #FFFFFF | #0E0F1A | #FFFFFF |
| *accentSoft* | `color.accent.soft` | #2E314D | #E2E4F6 | #2E314D | #E2E4F6 |
| *accentOnText* | `color.accent.text` | #A3ABFF | #4B55C8 | #A3ABFF | #4B55C8 |
| training | `color.pillar.training` | #6FD6C4 | #0F7466 | #6FD6C4 | #0F7466 |
| food | `color.pillar.food` | #F4A98A | #A64E2C | #F4A98A | #A64E2C |
| recovery | `color.pillar.recovery` | #8EC5FF | #2A62A8 | #8EC5FF | #2A62A8 |
| sleep | `color.pillar.sleep` | #C9A6FF | #7442B8 | #C9A6FF | #7442B8 |
| water | `color.pillar.water` | #4FC3F7 | #4FC3F7 | **#8EFFFB** | **#279B97** |
| success | `color.status.success` | #6FD69A | #24774A | #6FD69A | #24774A |
| warn | `color.status.warning` | #F2CC6B | #835F00 | #F2CC6B | #835F00 |
| *hair* | `color.separator.default` | #22232E | #DDDDE5 | #22232E | #DDDDE5 |
| *hair2* | `color.separator.strong` | #3B3C47 | #C5C5CE | #3B3C47 | #C5C5CE |
| *ai* | `color.ai.estimate` | #B6A9FF | #604CC0 | #B6A9FF | #604CC0 |

**Contrast** (ratio to 1, rounded down; v2 water = shared placeholder #4FC3F7)

| Foreground on surface | Floor | v2 dark | v2 light | Proposed dark | Proposed light |
|---|---|---|---|---|---|
| text on bg | 4.5 | 16.66 | 15.73 | 16.66 | 15.73 |
| text on surface2 | 4.5 | 12.55 | 15.94 | 12.55 | 15.94 |
| text on surface | 4.5 | 15.03 | 17.68 | 15.03 | 17.68 |
| text on accentSoft | 4.5 | 11.04 | 14.03 | 11.04 | 14.03 |
| muted on bg | 4.5 | 7.89 | 5.70 | 7.89 | 5.70 |
| muted on surface2 | 4.5 | 5.94 | 5.78 | 5.94 | 5.78 |
| muted on surface | 4.5 | 7.12 | 6.41 | 7.12 | 6.41 |
| muted on accentSoft | 4.5 | 5.23 | 5.09 | 5.23 | 5.09 |
| accentOnText on bg | 4.5 | 8.91 | 5.44 | 8.91 | 5.44 |
| accentOnText on surface2 | 4.5 | 6.71 | 5.51 | 6.71 | 5.51 |
| accentOnText on surface | 4.5 | 8.04 | 6.11 | 8.04 | 6.11 |
| ai on bg | 4.5 | 9.17 | 5.67 | 9.17 | 5.67 |
| ai on surface2 | 4.5 | 6.91 | 5.75 | 6.91 | 5.75 |
| ai on surface | 4.5 | 8.27 | 6.37 | 8.27 | 6.37 |
| onAccent on accent | 4.5 | 8.91 | 6.11 | 8.91 | 6.11 |
| accent on bg | 3 | 8.91 | 5.44 | 8.91 | 5.44 |
| accent on surface2 | 3 | 6.71 | 5.51 | 6.71 | 5.51 |
| accent on surface | 3 | 8.04 | 6.11 | 8.04 | 6.11 |
| training on bg | 3 | 10.97 | 5.03 | 10.97 | 5.03 |
| training on surface2 | 3 | 8.26 | 5.10 | 8.26 | 5.10 |
| training on surface | 3 | 9.89 | 5.65 | 9.89 | 5.65 |
| food on bg | 3 | 9.88 | 4.98 | 9.88 | 4.98 |
| food on surface2 | 3 | 7.44 | 5.05 | 7.44 | 5.05 |
| food on surface | 3 | 8.91 | 5.60 | 8.91 | 5.60 |
| recovery on bg | 3 | 10.50 | 5.47 | 10.50 | 5.47 |
| recovery on surface2 | 3 | 7.91 | 5.55 | 7.91 | 5.55 |
| recovery on surface | 3 | 9.48 | 6.15 | 9.48 | 6.15 |
| sleep on bg | 3 | 9.42 | 5.81 | 9.42 | 5.81 |
| sleep on surface2 | 3 | 7.09 | 5.89 | 7.09 | 5.89 |
| sleep on surface | 3 | 8.49 | 6.53 | 8.49 | 6.53 |
| water on bg | 3 | 9.51 | **1.78 FAIL** | 16.19 | 3.00 |
| water on surface2 | 3 | 7.16 | **1.80 FAIL** | 12.20 | 3.04 |
| water on surface | 3 | 8.58 | **2.00 FAIL** | 14.61 | 3.37 |
| success on bg | 3 | 10.67 | 4.89 | 10.67 | 4.89 |
| success on surface2 | 3 | 8.04 | 4.96 | 8.04 | 4.96 |
| success on surface | 3 | 9.62 | 5.50 | 9.62 | 5.50 |
| warn on bg | 3 | 12.36 | 5.18 | 12.36 | 5.18 |
| warn on surface2 | 3 | 9.31 | 5.25 | 9.31 | 5.25 |
| warn on surface | 3 | 11.15 | 5.83 | 11.15 | 5.83 |

**Fixes**

- dark `water`: #4FC3F7 → #8EFFFB (shared placeholder; per-palette hue distinct from recovery (Q-C))
- light `water`: #4FC3F7 → #279B97 (shared placeholder; per-palette hue distinct from recovery (Q-C))

**Near-duplicates flagged** (OKLab ΔE < 0.08 after the fixes above; not changed here)

- dark `accent` #A3ABFF vs `recovery` #8EC5FF: ΔE 0.070
- dark `accent` #A3ABFF vs `sleep` #C9A6FF: ΔE 0.054
- dark `training` #6FD6C4 vs `success` #6FD69A: ΔE 0.058
- light `accent` #4B55C8 vs `recovery` #2A62A8: ΔE 0.071
- light `accent` #4B55C8 vs `sleep` #7442B8: ΔE 0.077
- light `training` #0F7466 vs `success` #24774A: ΔE 0.046

### 4. Desert Mirage (`desertMirage`)

**Values** (`themes.desertMirage.<mode>.…`; derived roles in italics)

| Role | Token path | v2 dark | v2 light | Proposed dark | Proposed light |
|---|---|---|---|---|---|
| bg | `color.surface.base` | #15110E | #F6F1EA | #15110E | #F6F1EA |
| *surface2* | `color.surface.panel` | #302A26 | #F4F1ED | #302A26 | #F4F1ED |
| surface | `color.surface.card` | #211B17 | #FFFCF8 | #211B17 | #FFFCF8 |
| text | `color.text.primary` | #F6F0EA | #231B15 | #F6F0EA | #231B15 |
| muted | `color.text.secondary` | #B5A698 | #6B5D51 | #B5A698 | #6B5D51 |
| accent | `color.accent.default` | #F2B48A | #A85F33 | #F2B48A | #A85F33 |
| onAccent | `color.text.onAccent` | #111111 | #FFFFFF | #111111 | #FFFFFF |
| *accentSoft* | `color.accent.soft` | #423329 | #F1E3D8 | #423329 | #F1E3D8 |
| *accentOnText* | `color.accent.text` | #F2B48A | #A25C31 | #F2B48A | #A25C31 |
| training | `color.pillar.training` | #A9C77E | #3E5C1C | #A9C77E | #3E5C1C |
| food | `color.pillar.food` | #F08C64 | #B85A3C | #F08C64 | #B85A3C |
| recovery | `color.pillar.recovery` | #7FC0C2 | #1F6E70 | #7FC0C2 | #1F6E70 |
| sleep | `color.pillar.sleep` | #B9A2E0 | #6D4FA8 | #B9A2E0 | #6D4FA8 |
| water | `color.pillar.water` | #4FC3F7 | #4FC3F7 | **#7F90C2** | **#5F7CD3** |
| success | `color.status.success` | #8CCB8A | #2F6E35 | #8CCB8A | #2F6E35 |
| warn | `color.status.warning` | #EFC461 | #80600A | #EFC461 | #80600A |
| *hair* | `color.separator.default` | #292522 | #E3DED7 | #292522 | #E3DED7 |
| *hair2* | `color.separator.strong` | #423E3A | #CCC6BF | #423E3A | #CCC6BF |
| *ai* | `color.ai.estimate` | #D6ABB5 | #8B576E | #D6ABB5 | #8B576E |

**Contrast** (ratio to 1, rounded down; v2 water = shared placeholder #4FC3F7)

| Foreground on surface | Floor | v2 dark | v2 light | Proposed dark | Proposed light |
|---|---|---|---|---|---|
| text on bg | 4.5 | 16.60 | 15.08 | 16.60 | 15.08 |
| text on surface2 | 4.5 | 12.50 | 15.05 | 12.50 | 15.05 |
| text on surface | 4.5 | 15.05 | 16.57 | 15.05 | 16.57 |
| text on accentSoft | 4.5 | 10.69 | 13.49 | 10.69 | 13.49 |
| muted on bg | 4.5 | 7.93 | 5.64 | 7.93 | 5.64 |
| muted on surface2 | 4.5 | 5.97 | 5.63 | 5.97 | 5.63 |
| muted on surface | 4.5 | 7.19 | 6.20 | 7.19 | 6.20 |
| muted on accentSoft | 4.5 | 5.10 | 5.05 | 5.10 | 5.05 |
| accentOnText on bg | 4.5 | 10.43 | 4.54 | 10.43 | 4.54 |
| accentOnText on surface2 | 4.5 | 7.86 | 4.53 | 7.86 | 4.53 |
| accentOnText on surface | 4.5 | 9.45 | 4.99 | 9.45 | 4.99 |
| ai on bg | 4.5 | 9.25 | 5.06 | 9.25 | 5.06 |
| ai on surface2 | 4.5 | 6.97 | 5.05 | 6.97 | 5.05 |
| ai on surface | 4.5 | 8.38 | 5.56 | 8.38 | 5.56 |
| onAccent on accent | 4.5 | 10.49 | 4.82 | 10.49 | 4.82 |
| accent on bg | 3 | 10.43 | 4.29 | 10.43 | 4.29 |
| accent on surface2 | 3 | 7.86 | 4.28 | 7.86 | 4.28 |
| accent on surface | 3 | 9.45 | 4.72 | 9.45 | 4.72 |
| training on bg | 3 | 9.97 | 6.78 | 9.97 | 6.78 |
| training on surface2 | 3 | 7.51 | 6.77 | 7.51 | 6.77 |
| training on surface | 3 | 9.04 | 7.45 | 9.04 | 7.45 |
| food on bg | 3 | 7.72 | 4.09 | 7.72 | 4.09 |
| food on surface2 | 3 | 5.81 | 4.08 | 5.81 | 4.08 |
| food on surface | 3 | 7.00 | 4.49 | 7.00 | 4.49 |
| recovery on bg | 3 | 9.13 | 5.30 | 9.13 | 5.30 |
| recovery on surface2 | 3 | 6.88 | 5.29 | 6.88 | 5.29 |
| recovery on surface | 3 | 8.28 | 5.82 | 8.28 | 5.82 |
| sleep on bg | 3 | 8.32 | 5.60 | 8.32 | 5.60 |
| sleep on surface2 | 3 | 6.26 | 5.59 | 6.26 | 5.59 |
| sleep on surface | 3 | 7.54 | 6.15 | 7.54 | 6.15 |
| water on bg | 3 | 9.37 | **1.78 FAIL** | 5.96 | 3.51 |
| water on surface2 | 3 | 7.05 | **1.77 FAIL** | 4.49 | 3.51 |
| water on surface | 3 | 8.49 | **1.95 FAIL** | 5.40 | 3.86 |
| success on bg | 3 | 9.85 | 5.49 | 9.85 | 5.49 |
| success on surface2 | 3 | 7.42 | 5.48 | 7.42 | 5.48 |
| success on surface | 3 | 8.93 | 6.03 | 8.93 | 6.03 |
| warn on bg | 3 | 11.39 | 5.19 | 11.39 | 5.19 |
| warn on surface2 | 3 | 8.57 | 5.18 | 8.57 | 5.18 |
| warn on surface | 3 | 10.32 | 5.71 | 10.32 | 5.71 |

**Fixes**

- dark `water`: #4FC3F7 → #7F90C2 (shared placeholder; per-palette hue distinct from recovery (Q-C))
- light `water`: #4FC3F7 → #5F7CD3 (shared placeholder; per-palette hue distinct from recovery (Q-C))

**Near-duplicates flagged** (OKLab ΔE < 0.08 after the fixes above; not changed here)

- dark `accent` #F2B48A vs `warn` #EFC461: ΔE 0.071
- dark `training` #A9C77E vs `success` #8CCB8A: ΔE 0.033
- light `accent` #A85F33 vs `food` #B85A3C: ΔE 0.034
- light `training` #3E5C1C vs `success` #2F6E35: ΔE 0.054

### 5. Spring Citrus (`springCitrus`)

**Values** (`themes.springCitrus.<mode>.…`; derived roles in italics)

| Role | Token path | v2 dark | v2 light | Proposed dark | Proposed light |
|---|---|---|---|---|---|
| bg | `color.surface.base` | #0F110C | #F4F5EE | #0F110C | #F4F5EE |
| *surface2* | `color.surface.panel` | #292C24 | #F3F4F3 | #292C24 | #F3F4F3 |
| surface | `color.surface.card` | #1A1D15 | #FFFFFF | #1A1D15 | #FFFFFF |
| text | `color.text.primary` | #F3F5EC | #171A10 | #F3F5EC | #171A10 |
| muted | `color.text.secondary` | #A3A893 | #5B6150 | **#A4A994** | #5B6150 |
| accent | `color.accent.default` | #D5F56B | #5C7A08 | #D5F56B | #5C7A08 |
| onAccent | `color.text.onAccent` | #0F110C | #FFFFFF | #0F110C | #FFFFFF |
| *accentSoft* | `color.accent.soft` | #384023 | #E5EAD7 | #384023 | #E5EAD7 |
| *accentOnText* | `color.accent.text` | #D5F56B | #5A7808 | #D5F56B | #5A7808 |
| training | `color.pillar.training` | #D5F56B | #5C7A08 | **#F5AB6B** | **#DC6E0F** |
| food | `color.pillar.food` | #FF795C | #A85400 | #FF795C | #A85400 |
| recovery | `color.pillar.recovery` | #4FD1D9 | #0B7178 | #4FD1D9 | #0B7178 |
| sleep | `color.pillar.sleep` | #A99BFF | #5B4BC4 | #A99BFF | #5B4BC4 |
| water | `color.pillar.water` | #4FC3F7 | #4FC3F7 | **#4F84D9** | **#4485EE** |
| success | `color.status.success` | #7EE08F | #25793A | #7EE08F | #25793A |
| warn | `color.status.warning` | #FFD24D | #7D6000 | #FFD24D | #7D6000 |
| *hair* | `color.separator.default` | #242620 | #E0E1DA | #242620 | #E0E1DA |
| *hair2* | `color.separator.strong` | #3D3F39 | #C8C9C2 | #3D3F39 | #C8C9C2 |
| *ai* | `color.ai.estimate` | #BFC8B5 | #5C6366 | #BFC8B5 | #5C6366 |

**Contrast** (ratio to 1, rounded down; v2 water = shared placeholder #4FC3F7)

| Foreground on surface | Floor | v2 dark | v2 light | Proposed dark | Proposed light |
|---|---|---|---|---|---|
| text on bg | 4.5 | 17.25 | 16.06 | 17.25 | 16.06 |
| text on surface2 | 4.5 | 12.89 | 15.98 | 12.89 | 15.98 |
| text on surface | 4.5 | 15.50 | 17.62 | 15.50 | 17.62 |
| text on accentSoft | 4.5 | 9.90 | 14.33 | 9.90 | 14.33 |
| muted on bg | 4.5 | 7.75 | 5.85 | 7.85 | 5.85 |
| muted on surface2 | 4.5 | 5.79 | 5.82 | 5.86 | 5.82 |
| muted on surface | 4.5 | 6.97 | 6.42 | 7.05 | 6.42 |
| muted on accentSoft | 4.5 | **4.45 FAIL** | 5.22 | 4.50 | 5.22 |
| accentOnText on bg | 4.5 | 15.46 | 4.64 | 15.46 | 4.64 |
| accentOnText on surface2 | 4.5 | 11.55 | 4.61 | 11.55 | 4.61 |
| accentOnText on surface | 4.5 | 13.89 | 5.09 | 13.89 | 5.09 |
| ai on bg | 4.5 | 10.98 | 5.57 | 10.98 | 5.57 |
| ai on surface2 | 4.5 | 8.20 | 5.54 | 8.20 | 5.54 |
| ai on surface | 4.5 | 9.86 | 6.11 | 9.86 | 6.11 |
| onAccent on accent | 4.5 | 15.46 | 4.95 | 15.46 | 4.95 |
| accent on bg | 3 | 15.46 | 4.51 | 15.46 | 4.51 |
| accent on surface2 | 3 | 11.55 | 4.48 | 11.55 | 4.48 |
| accent on surface | 3 | 13.89 | 4.95 | 13.89 | 4.95 |
| training on bg | 3 | 15.46 | 4.51 | 9.87 | 3.04 |
| training on surface2 | 3 | 11.55 | 4.48 | 7.37 | 3.03 |
| training on surface | 3 | 13.89 | 4.95 | 8.87 | 3.34 |
| food on bg | 3 | 7.36 | 4.86 | 7.36 | 4.86 |
| food on surface2 | 3 | 5.50 | 4.84 | 5.50 | 4.84 |
| food on surface | 3 | 6.61 | 5.33 | 6.61 | 5.33 |
| recovery on bg | 3 | 10.35 | 5.24 | 10.35 | 5.24 |
| recovery on surface2 | 3 | 7.73 | 5.22 | 7.73 | 5.22 |
| recovery on surface | 3 | 9.30 | 5.75 | 9.30 | 5.75 |
| sleep on bg | 3 | 7.97 | 5.89 | 7.97 | 5.89 |
| sleep on surface2 | 3 | 5.95 | 5.86 | 5.95 | 5.86 |
| sleep on surface | 3 | 7.16 | 6.46 | 7.16 | 6.46 |
| water on bg | 3 | 9.47 | **1.82 FAIL** | 5.09 | 3.28 |
| water on surface2 | 3 | 7.08 | **1.81 FAIL** | 3.80 | 3.26 |
| water on surface | 3 | 8.51 | **2.00 FAIL** | 4.57 | 3.59 |
| success on bg | 3 | 11.70 | 4.94 | 11.70 | 4.94 |
| success on surface2 | 3 | 8.74 | 4.91 | 8.74 | 4.91 |
| success on surface | 3 | 10.52 | 5.41 | 10.52 | 5.41 |
| warn on bg | 3 | 13.18 | 5.39 | 13.18 | 5.39 |
| warn on surface2 | 3 | 9.84 | 5.37 | 9.84 | 5.37 |
| warn on surface | 3 | 11.84 | 5.92 | 11.84 | 5.92 |

**Fixes**

- dark `muted`: #A3A893 → #A4A994 (muted worst text pair 4.45:1 < 4.5)
- dark `training`: #D5F56B → #F5AB6B (training duplicated accent #D5F56B (CHECKLIST M2))
- light `training`: #5C7A08 → #DC6E0F (training duplicated accent #5C7A08 (CHECKLIST M2))
- dark `water`: #4FC3F7 → #4F84D9 (shared placeholder; per-palette hue distinct from recovery (Q-C))
- light `water`: #4FC3F7 → #4485EE (shared placeholder; per-palette hue distinct from recovery (Q-C))

**Near-duplicates flagged** (OKLab ΔE < 0.08 after the fixes above; not changed here)

- light `accent` #5C7A08 vs `success` #25793A: ΔE 0.058

### 6. Lotus Garden (`lotusGarden`)

**Values** (`themes.lotusGarden.<mode>.…`; derived roles in italics)

| Role | Token path | v2 dark | v2 light | Proposed dark | Proposed light |
|---|---|---|---|---|---|
| bg | `color.surface.base` | #121014 | #F7F2F3 | #121014 | #F7F2F3 |
| *surface2* | `color.surface.panel` | #2C292F | #F4F3F4 | #2C292F | #F4F3F4 |
| surface | `color.surface.card` | #1D1A20 | #FFFFFF | #1D1A20 | #FFFFFF |
| text | `color.text.primary` | #F5F1F6 | #1E1720 | #F5F1F6 | #1E1720 |
| muted | `color.text.secondary` | #AFA6B3 | #655A69 | #AFA6B3 | #655A69 |
| accent | `color.accent.default` | #F28C82 | #B3443A | #F28C82 | #B3443A |
| onAccent | `color.text.onAccent` | #121014 | #FFFFFF | #121014 | #FFFFFF |
| *accentSoft* | `color.accent.soft` | #3F2C30 | #F3E1DF | #3F2C30 | #F3E1DF |
| *accentOnText* | `color.accent.text` | #F28C82 | #B3443A | #F28C82 | #B3443A |
| training | `color.pillar.training` | #7ED9B0 | #16765A | #7ED9B0 | #16765A |
| food | `color.pillar.food` | #F28C82 | #B3443A | **#F2AF82** | **#C47B4A** |
| recovery | `color.pillar.recovery` | #86B8F2 | #2862A6 | #86B8F2 | #2862A6 |
| sleep | `color.pillar.sleep` | #D1A3E6 | #83439E | #D1A3E6 | #83439E |
| water | `color.pillar.water` | #4FC3F7 | #4FC3F7 | **#86F2F2** | **#259A9A** |
| success | `color.status.success` | #7ED99A | #26743F | #7ED99A | #26743F |
| warn | `color.status.warning` | #F0C860 | #7E5F00 | #F0C860 | #7E5F00 |
| *hair* | `color.separator.default` | #262428 | #E3DEE0 | #262428 | #E3DEE0 |
| *hair2* | `color.separator.strong` | #3F3D41 | #CCC6C9 | #3F3D41 | #CCC6C9 |
| *ai* | `color.ai.estimate` | #E298B4 | #9B446C | #E298B4 | #9B446C |

**Contrast** (ratio to 1, rounded down; v2 water = shared placeholder #4FC3F7)

| Foreground on surface | Floor | v2 dark | v2 light | Proposed dark | Proposed light |
|---|---|---|---|---|---|
| text on bg | 4.5 | 16.93 | 15.80 | 16.93 | 15.80 |
| text on surface2 | 4.5 | 12.82 | 15.82 | 12.82 | 15.82 |
| text on surface | 4.5 | 15.39 | 17.52 | 15.39 | 17.52 |
| text on accentSoft | 4.5 | 11.64 | 13.88 | 11.64 | 13.88 |
| muted on bg | 4.5 | 8.04 | 5.88 | 8.04 | 5.88 |
| muted on surface2 | 4.5 | 6.09 | 5.89 | 6.09 | 5.89 |
| muted on surface | 4.5 | 7.31 | 6.52 | 7.31 | 6.52 |
| muted on accentSoft | 4.5 | 5.53 | 5.17 | 5.53 | 5.17 |
| accentOnText on bg | 4.5 | 7.97 | 4.98 | 7.97 | 4.98 |
| accentOnText on surface2 | 4.5 | 6.03 | 4.98 | 6.03 | 4.98 |
| accentOnText on surface | 4.5 | 7.24 | 5.51 | 7.24 | 5.51 |
| ai on bg | 4.5 | 8.45 | 5.51 | 8.45 | 5.51 |
| ai on surface2 | 4.5 | 6.40 | 5.52 | 6.40 | 5.52 |
| ai on surface | 4.5 | 7.68 | 6.10 | 7.68 | 6.10 |
| onAccent on accent | 4.5 | 7.97 | 5.51 | 7.97 | 5.51 |
| accent on bg | 3 | 7.97 | 4.98 | 7.97 | 4.98 |
| accent on surface2 | 3 | 6.03 | 4.98 | 6.03 | 4.98 |
| accent on surface | 3 | 7.24 | 5.51 | 7.24 | 5.51 |
| training on bg | 3 | 11.20 | 5.02 | 11.20 | 5.02 |
| training on surface2 | 3 | 8.48 | 5.02 | 8.48 | 5.02 |
| training on surface | 3 | 10.18 | 5.56 | 10.18 | 5.56 |
| food on bg | 3 | 7.97 | 4.98 | 10.11 | 3.01 |
| food on surface2 | 3 | 6.03 | 4.98 | 7.66 | 3.02 |
| food on surface | 3 | 7.24 | 5.51 | 9.19 | 3.34 |
| recovery on bg | 3 | 9.14 | 5.59 | 9.14 | 5.59 |
| recovery on surface2 | 3 | 6.92 | 5.60 | 6.92 | 5.60 |
| recovery on surface | 3 | 8.31 | 6.19 | 8.31 | 6.19 |
| sleep on bg | 3 | 9.09 | 5.80 | 9.09 | 5.80 |
| sleep on surface2 | 3 | 6.88 | 5.81 | 6.88 | 5.81 |
| sleep on surface | 3 | 8.26 | 6.43 | 8.26 | 6.43 |
| water on bg | 3 | 9.44 | **1.80 FAIL** | 14.41 | 3.07 |
| water on surface2 | 3 | 7.15 | **1.81 FAIL** | 10.91 | 3.07 |
| water on surface | 3 | 8.58 | **2.00 FAIL** | 13.10 | 3.40 |
| success on bg | 3 | 11.06 | 5.18 | 11.06 | 5.18 |
| success on surface2 | 3 | 8.37 | 5.19 | 8.37 | 5.19 |
| success on surface | 3 | 10.05 | 5.74 | 10.05 | 5.74 |
| warn on bg | 3 | 11.83 | 5.37 | 11.83 | 5.37 |
| warn on surface2 | 3 | 8.96 | 5.38 | 8.96 | 5.38 |
| warn on surface | 3 | 10.75 | 5.95 | 10.75 | 5.95 |

**Fixes**

- dark `food`: #F28C82 → #F2AF82 (food duplicated accent #F28C82 (CHECKLIST M2))
- light `food`: #B3443A → #C47B4A (food duplicated accent #B3443A (CHECKLIST M2))
- dark `water`: #4FC3F7 → #86F2F2 (shared placeholder; per-palette hue distinct from recovery (Q-C))
- light `water`: #4FC3F7 → #259A9A (shared placeholder; per-palette hue distinct from recovery (Q-C))

**Near-duplicates flagged** (OKLab ΔE < 0.08 after the fixes above; not changed here)

- dark `training` #7ED9B0 vs `success` #7ED99A: ΔE 0.029
- light `training` #16765A vs `success` #26743F: ΔE 0.036

### 7. Aurora Fjord (`auroraFjord`)

**Values** (`themes.auroraFjord.<mode>.…`; derived roles in italics)

| Role | Token path | v2 dark | v2 light | Proposed dark | Proposed light |
|---|---|---|---|---|---|
| bg | `color.surface.base` | #0B1218 | #EFF4F6 | #0B1218 | #EFF4F6 |
| *surface2* | `color.surface.panel` | #242F37 | #F3F4F4 | #242F37 | #F3F4F4 |
| surface | `color.surface.card` | #152029 | #FFFFFF | #152029 | #FFFFFF |
| text | `color.text.primary` | #EDF4F7 | #10202A | #EDF4F7 | #10202A |
| muted | `color.text.secondary` | #9CB0BC | #536873 | #9CB0BC | #536873 |
| accent | `color.accent.default` | #62D2C8 | #0B6F6A | #62D2C8 | #0B6F6A |
| onAccent | `color.text.onAccent` | #111111 | #FFFFFF | #111111 | #FFFFFF |
| *accentSoft* | `color.accent.soft` | #213C42 | #D8E8E7 | #213C42 | #D8E8E7 |
| *accentOnText* | `color.accent.text` | #62D2C8 | #0B6F6A | #62D2C8 | #0B6F6A |
| training | `color.pillar.training` | #F2F28D | #A58B12 | #F2F28D | #A58B12 |
| food | `color.pillar.food` | #DF4323 | #78290D | #DF4323 | #78290D |
| recovery | `color.pillar.recovery` | #75D4EF | #2E87E0 | #75D4EF | #2E87E0 |
| sleep | `color.pillar.sleep` | #C84AEB | #4F2484 | #C84AEB | #4F2484 |
| water | `color.pillar.water` | #4FC3F7 | #4FC3F7 | **#75EFE5** | **#179C90** |
| success | `color.status.success` | #6DD49A | #1E7444 | #6DD49A | #1E7444 |
| warn | `color.status.warning` | #F5C451 | #855C00 | #F5C451 | #855C00 |
| *hair* | `color.separator.default` | #1F262C | #DBE1E4 | #1F262C | #DBE1E4 |
| *hair2* | `color.separator.strong` | #383F45 | #C2CACD | #383F45 | #C2CACD |
| *ai* | `color.ai.estimate` | #958EDA | #2D4A77 | #958EDA | #2D4A77 |

**Contrast** (ratio to 1, rounded down; v2 water = shared placeholder #4FC3F7)

| Foreground on surface | Floor | v2 dark | v2 light | Proposed dark | Proposed light |
|---|---|---|---|---|---|
| text on bg | 4.5 | 16.95 | 15.00 | 16.95 | 15.00 |
| text on surface2 | 4.5 | 12.28 | 15.10 | 12.28 | 15.10 |
| text on surface | 4.5 | 14.86 | 16.63 | 14.86 | 16.63 |
| text on accentSoft | 4.5 | 10.55 | 13.16 | 10.55 | 13.16 |
| muted on bg | 4.5 | 8.39 | 5.26 | 8.39 | 5.26 |
| muted on surface2 | 4.5 | 6.08 | 5.30 | 6.08 | 5.30 |
| muted on surface | 4.5 | 7.35 | 5.84 | 7.35 | 5.84 |
| muted on accentSoft | 4.5 | 5.22 | 4.62 | 5.22 | 4.62 |
| accentOnText on bg | 4.5 | 10.38 | 5.41 | 10.38 | 5.41 |
| accentOnText on surface2 | 4.5 | 7.52 | 5.45 | 7.52 | 5.45 |
| accentOnText on surface | 4.5 | 9.10 | 6.00 | 9.10 | 6.00 |
| ai on bg | 4.5 | 6.42 | 8.03 | 6.42 | 8.03 |
| ai on surface2 | 4.5 | 4.65 | 8.08 | 4.65 | 8.08 |
| ai on surface | 4.5 | 5.63 | 8.90 | 5.63 | 8.90 |
| onAccent on accent | 4.5 | 10.40 | 6.00 | 10.40 | 6.00 |
| accent on bg | 3 | 10.38 | 5.41 | 10.38 | 5.41 |
| accent on surface2 | 3 | 7.52 | 5.45 | 7.52 | 5.45 |
| accent on surface | 3 | 9.10 | 6.00 | 9.10 | 6.00 |
| training on bg | 3 | 16.03 | 3.00 | 16.03 | 3.00 |
| training on surface2 | 3 | 11.62 | 3.02 | 11.62 | 3.02 |
| training on surface | 3 | 14.05 | 3.33 | 14.05 | 3.33 |
| food on bg | 3 | 4.45 | 8.92 | 4.45 | 8.92 |
| food on surface2 | 3 | 3.23 | 8.98 | 3.23 | 8.98 |
| food on surface | 3 | 3.90 | 9.89 | 3.90 | 9.89 |
| recovery on bg | 3 | 11.14 | 3.34 | 11.14 | 3.34 |
| recovery on surface2 | 3 | 8.08 | 3.36 | 8.08 | 3.36 |
| recovery on surface | 3 | 9.77 | 3.71 | 9.77 | 3.71 |
| sleep on bg | 3 | 5.05 | 9.87 | 5.05 | 9.87 |
| sleep on surface2 | 3 | 3.66 | 9.93 | 3.66 | 9.93 |
| sleep on surface | 3 | 4.43 | 10.94 | 4.43 | 10.94 |
| water on bg | 3 | 9.40 | **1.80 FAIL** | 13.67 | 3.05 |
| water on surface2 | 3 | 6.82 | **1.81 FAIL** | 9.91 | 3.07 |
| water on surface | 3 | 8.24 | **2.00 FAIL** | 11.99 | 3.39 |
| success on bg | 3 | 10.35 | 5.20 | 10.35 | 5.20 |
| success on surface2 | 3 | 7.50 | 5.24 | 7.50 | 5.24 |
| success on surface | 3 | 9.07 | 5.77 | 9.07 | 5.77 |
| warn on bg | 3 | 11.57 | 5.36 | 11.57 | 5.36 |
| warn on surface2 | 3 | 8.39 | 5.40 | 8.39 | 5.40 |
| warn on surface | 3 | 10.15 | 5.95 | 10.15 | 5.95 |

**Fixes**

- dark `water`: #4FC3F7 → #75EFE5 (shared placeholder; per-palette hue distinct from recovery (Q-C))
- light `water`: #4FC3F7 → #179C90 (shared placeholder; per-palette hue distinct from recovery (Q-C))

**Near-duplicates flagged** (OKLab ΔE < 0.08 after the fixes above; not changed here)

- dark `accent` #62D2C8 vs `recovery` #75D4EF: ΔE 0.060
- dark `accent` #62D2C8 vs `success` #6DD49A: ΔE 0.065
- light `accent` #0B6F6A vs `success` #1E7444: ΔE 0.065

### 8. Berry Meadow (`berryMeadow`)

**Values** (`themes.berryMeadow.<mode>.…`; derived roles in italics)

| Role | Token path | v2 dark | v2 light | Proposed dark | Proposed light |
|---|---|---|---|---|---|
| bg | `color.surface.base` | #120E13 | #F8F1F4 | #120E13 | #F8F1F4 |
| *surface2* | `color.surface.panel` | #2D272F | #F4F3F4 | #2D272F | #F4F3F4 |
| surface | `color.surface.card` | #1E1820 | #FFFFFF | #1E1820 | #FFFFFF |
| text | `color.text.primary` | #F7F0F6 | #22131C | #F7F0F6 | #22131C |
| muted | `color.text.secondary` | #B3A5B1 | #6A5562 | #B3A5B1 | #6A5562 |
| accent | `color.accent.default` | #F06FA0 | #B12A63 | #F06FA0 | #B12A63 |
| onAccent | `color.text.onAccent` | #120E13 | #FFFFFF | #120E13 | #FFFFFF |
| *accentSoft* | `color.accent.soft` | #402634 | #F3DDE6 | #402634 | #F3DDE6 |
| *accentOnText* | `color.accent.text` | #F06FA0 | #B12A63 | #F06FA0 | #B12A63 |
| training | `color.pillar.training` | #D5F4A1 | #4A9F13 | #D5F4A1 | #4A9F13 |
| food | `color.pillar.food` | #E8AA2C | #723E13 | #E8AA2C | #723E13 |
| recovery | `color.pillar.recovery` | #305DE6 | #11268B | **#3E68E8** | #11268B |
| sleep | `color.pillar.sleep` | #E83063 | #D32A79 | #E83063 | #D32A79 |
| water | `color.pillar.water` | #4FC3F7 | #4FC3F7 | **#30ACE6** | **#1995CF** |
| success | `color.status.success` | #7EDB95 | #25763F | #7EDB95 | #25763F |
| warn | `color.status.warning` | #F7CE5A | #7D5E00 | #F7CE5A | #7D5E00 |
| *hair* | `color.separator.default` | #272227 | #E5DDE1 | #272227 | #E5DDE1 |
| *hair2* | `color.separator.strong` | #403B40 | #CDC5C9 | #403B40 | #CDC5C9 |
| *ai* | `color.ai.estimate` | #EC5082 | #C22A6E | **#ED5C8A** | #C22A6E |

**Contrast** (ratio to 1, rounded down; v2 water = shared placeholder #4FC3F7)

| Foreground on surface | Floor | v2 dark | v2 light | Proposed dark | Proposed light |
|---|---|---|---|---|---|
| text on bg | 4.5 | 17.07 | 16.02 | 17.07 | 16.02 |
| text on surface2 | 4.5 | 12.99 | 16.10 | 12.99 | 16.10 |
| text on surface | 4.5 | 15.53 | 17.82 | 15.53 | 17.82 |
| text on accentSoft | 4.5 | 12.13 | 13.83 | 12.13 | 13.83 |
| muted on bg | 4.5 | 8.13 | 6.11 | 8.13 | 6.11 |
| muted on surface2 | 4.5 | 6.19 | 6.14 | 6.19 | 6.14 |
| muted on surface | 4.5 | 7.40 | 6.79 | 7.40 | 6.79 |
| muted on accentSoft | 4.5 | 5.78 | 5.27 | 5.78 | 5.27 |
| accentOnText on bg | 4.5 | 6.81 | 5.58 | 6.81 | 5.58 |
| accentOnText on surface2 | 4.5 | 5.18 | 5.61 | 5.18 | 5.61 |
| accentOnText on surface | 4.5 | 6.20 | 6.21 | 6.20 | 6.21 |
| ai on bg | 4.5 | 5.49 | 4.90 | 5.91 | 4.90 |
| ai on surface2 | 4.5 | **4.18 FAIL** | 4.92 | 4.50 | 4.92 |
| ai on surface | 4.5 | 5.00 | 5.45 | 5.38 | 5.45 |
| onAccent on accent | 4.5 | 6.81 | 6.21 | 6.81 | 6.21 |
| accent on bg | 3 | 6.81 | 5.58 | 6.81 | 5.58 |
| accent on surface2 | 3 | 5.18 | 5.61 | 5.18 | 5.61 |
| accent on surface | 3 | 6.20 | 6.21 | 6.20 | 6.21 |
| training on bg | 3 | 15.74 | 3.01 | 15.74 | 3.01 |
| training on surface2 | 3 | 11.97 | 3.03 | 11.97 | 3.03 |
| training on surface | 3 | 14.32 | 3.35 | 14.32 | 3.35 |
| food on bg | 3 | 9.30 | 7.82 | 9.30 | 7.82 |
| food on surface2 | 3 | 7.08 | 7.85 | 7.08 | 7.85 |
| food on surface | 3 | 8.46 | 8.69 | 8.46 | 8.69 |
| recovery on bg | 3 | 3.49 | 11.27 | 3.96 | 11.27 |
| recovery on surface2 | 3 | **2.65 FAIL** | 11.33 | 3.01 | 11.33 |
| recovery on surface | 3 | 3.17 | 12.54 | 3.60 | 12.54 |
| sleep on bg | 3 | 4.58 | 4.31 | 4.58 | 4.31 |
| sleep on surface2 | 3 | 3.48 | 4.33 | 3.48 | 4.33 |
| sleep on surface | 3 | 4.17 | 4.79 | 4.17 | 4.79 |
| water on bg | 3 | 9.54 | **1.80 FAIL** | 7.44 | 3.02 |
| water on surface2 | 3 | 7.26 | **1.81 FAIL** | 5.66 | 3.03 |
| water on surface | 3 | 8.68 | **2.00 FAIL** | 6.76 | 3.36 |
| success on bg | 3 | 11.34 | 5.04 | 11.34 | 5.04 |
| success on surface2 | 3 | 8.63 | 5.07 | 8.63 | 5.07 |
| success on surface | 3 | 10.32 | 5.61 | 10.32 | 5.61 |
| warn on bg | 3 | 12.68 | 5.43 | 12.68 | 5.43 |
| warn on surface2 | 3 | 9.65 | 5.46 | 9.65 | 5.46 |
| warn on surface | 3 | 11.54 | 6.04 | 11.54 | 6.04 |

**Fixes**

- dark `water`: #4FC3F7 → #30ACE6 (shared placeholder; per-palette hue distinct from recovery (Q-C))
- light `water`: #4FC3F7 → #1995CF (shared placeholder; per-palette hue distinct from recovery (Q-C))
- dark `recovery`: #305DE6 → #3E68E8 (recovery worst graphics pair 2.65:1 < 3)
- dark `ai`: #EC5082 → #ED5C8A (ai (accent/sleep mix #EC5082) worst text pair 4.18:1 < 4.5)

**Near-duplicates flagged** (OKLab ΔE < 0.08 after the fixes above; not changed here)

- light `accent` #B12A63 vs `sleep` #D32A79: ΔE 0.074

### 9. Golden Hour (`goldenHour`)

**Values** (`themes.goldenHour.<mode>.…`; derived roles in italics)

| Role | Token path | v2 dark | v2 light | Proposed dark | Proposed light |
|---|---|---|---|---|---|
| bg | `color.surface.base` | #13110B | #F8F4EA | #13110B | #F8F4EA |
| *surface2* | `color.surface.panel` | #2E2B23 | #F4F3EE | #2E2B23 | #F4F3EE |
| surface | `color.surface.card` | #1F1C14 | #FFFEFA | #1F1C14 | #FFFEFA |
| text | `color.text.primary` | #F8F3E6 | #241E10 | #F8F3E6 | #241E10 |
| muted | `color.text.secondary` | #B9AF96 | #685F48 | #B9AF96 | #685F48 |
| accent | `color.accent.default` | #F2C14E | #8A6400 | #F2C14E | #8A6400 |
| onAccent | `color.text.onAccent` | #111111 | #FFFFFF | #111111 | #FFFFFF |
| *accentSoft* | `color.accent.soft` | #41361D | #ECE5D2 | #41361D | #ECE5D2 |
| *accentOnText* | `color.accent.text` | #F2C14E | #8A6400 | #F2C14E | #8A6400 |
| training | `color.pillar.training` | #E8BD2D | #6F4A15 | #E8BD2D | #6F4A15 |
| food | `color.pillar.food` | #CE3A37 | #CD6D58 | **#D0403D** | #CD6D58 |
| recovery | `color.pillar.recovery` | #70E5EF | #1990C2 | #70E5EF | #1990C2 |
| sleep | `color.pillar.sleep` | #784DEB | #4A2AB2 | **#8158EC** | #4A2AB2 |
| water | `color.pillar.water` | #4FC3F7 | #4FC3F7 | **#7090EF** | **#4A72E8** |
| success | `color.status.success` | #8FD39A | #2A6F3A | #8FD39A | #2A6F3A |
| warn | `color.status.warning` | #F59E58 | #9A4A0C | #F59E58 | #9A4A0C |
| *hair* | `color.separator.default` | #28251F | #E5E1D6 | #28251F | #E5E1D6 |
| *hair2* | `color.separator.strong` | #413E37 | #CEC9BE | #413E37 | #CEC9BE |
| *ai* | `color.ai.estimate` | #B5879D | #6A4759 | **#BA8D9D** | #6A4759 |

**Contrast** (ratio to 1, rounded down; v2 water = shared placeholder #4FC3F7)

| Foreground on surface | Floor | v2 dark | v2 light | Proposed dark | Proposed light |
|---|---|---|---|---|---|
| text on bg | 4.5 | 17.03 | 15.07 | 17.03 | 15.07 |
| text on surface2 | 4.5 | 12.75 | 14.90 | 12.75 | 14.90 |
| text on surface | 4.5 | 15.35 | 16.40 | 15.35 | 16.40 |
| text on accentSoft | 4.5 | 10.70 | 13.17 | 10.70 | 13.17 |
| muted on bg | 4.5 | 8.65 | 5.76 | 8.65 | 5.76 |
| muted on surface2 | 4.5 | 6.48 | 5.69 | 6.48 | 5.69 |
| muted on surface | 4.5 | 7.80 | 6.26 | 7.80 | 6.26 |
| muted on accentSoft | 4.5 | 5.44 | 5.03 | 5.44 | 5.03 |
| accentOnText on bg | 4.5 | 11.24 | 4.89 | 11.24 | 4.89 |
| accentOnText on surface2 | 4.5 | 8.42 | 4.84 | 8.42 | 4.84 |
| accentOnText on surface | 4.5 | 10.13 | 5.33 | 10.13 | 5.33 |
| ai on bg | 4.5 | 6.21 | 7.19 | 6.63 | 7.19 |
| ai on surface2 | 4.5 | 4.65 | 7.11 | 4.96 | 7.11 |
| ai on surface | 4.5 | 5.60 | 7.82 | 5.98 | 7.82 |
| onAccent on accent | 4.5 | 11.25 | 5.37 | 11.25 | 5.37 |
| accent on bg | 3 | 11.24 | 4.89 | 11.24 | 4.89 |
| accent on surface2 | 3 | 8.42 | 4.84 | 8.42 | 4.84 |
| accent on surface | 3 | 10.13 | 5.33 | 10.13 | 5.33 |
| training on bg | 3 | 10.55 | 7.17 | 10.55 | 7.17 |
| training on surface2 | 3 | 7.90 | 7.08 | 7.90 | 7.08 |
| training on surface | 3 | 9.51 | 7.80 | 9.51 | 7.80 |
| food on bg | 3 | 3.85 | 3.22 | 4.02 | 3.22 |
| food on surface2 | 3 | **2.88 FAIL** | 3.19 | 3.01 | 3.19 |
| food on surface | 3 | 3.47 | 3.51 | 3.63 | 3.51 |
| recovery on bg | 3 | 12.71 | 3.29 | 12.71 | 3.29 |
| recovery on surface2 | 3 | 9.51 | 3.25 | 9.51 | 3.25 |
| recovery on surface | 3 | 11.45 | 3.58 | 11.45 | 3.58 |
| sleep on bg | 3 | 3.64 | 8.44 | 4.08 | 8.44 |
| sleep on surface2 | 3 | **2.73 FAIL** | 8.34 | 3.05 | 8.34 |
| sleep on surface | 3 | 3.28 | 9.18 | 3.67 | 9.18 |
| water on bg | 3 | 9.41 | **1.82 FAIL** | 6.22 | 3.93 |
| water on surface2 | 3 | 7.05 | **1.80 FAIL** | 4.65 | 3.88 |
| water on surface | 3 | 8.49 | **1.98 FAIL** | 5.60 | 4.27 |
| success on bg | 3 | 10.74 | 5.56 | 10.74 | 5.56 |
| success on surface2 | 3 | 8.04 | 5.50 | 8.04 | 5.50 |
| success on surface | 3 | 9.68 | 6.06 | 9.68 | 6.06 |
| warn on bg | 3 | 8.90 | 5.69 | 8.90 | 5.69 |
| warn on surface2 | 3 | 6.67 | 5.62 | 6.67 | 5.62 |
| warn on surface | 3 | 8.03 | 6.19 | 8.03 | 6.19 |

**Fixes**

- dark `water`: #4FC3F7 → #7090EF (shared placeholder; per-palette hue distinct from recovery (Q-C))
- light `water`: #4FC3F7 → #4A72E8 (shared placeholder; per-palette hue distinct from recovery (Q-C))
- dark `food`: #CE3A37 → #D0403D (food worst graphics pair 2.88:1 < 3)
- dark `sleep`: #784DEB → #8158EC (sleep worst graphics pair 2.73:1 < 3)

**Near-duplicates flagged** (OKLab ΔE < 0.08 after the fixes above; not changed here)

- dark `accent` #F2C14E vs `training` #E8BD2D: ΔE 0.028
- light `accent` #8A6400 vs `warn` #9A4A0C: ΔE 0.071

### 10. Glacier Bloom (`glacierBloom`)

**Values** (`themes.glacierBloom.<mode>.…`; derived roles in italics)

| Role | Token path | v2 dark | v2 light | Proposed dark | Proposed light |
|---|---|---|---|---|---|
| bg | `color.surface.base` | #0D1117 | #F0F3F8 | #0D1117 | #F0F3F8 |
| *surface2* | `color.surface.panel` | #262C35 | #F3F4F4 | #262C35 | #F3F4F4 |
| surface | `color.surface.card` | #171D26 | #FFFFFF | #171D26 | #FFFFFF |
| text | `color.text.primary` | #EEF2F8 | #121A26 | #EEF2F8 | #121A26 |
| muted | `color.text.secondary` | #A0ABBB | #56637A | #A0ABBB | #56637A |
| accent | `color.accent.default` | #9DC4FF | #2758B8 | #9DC4FF | #2758B8 |
| onAccent | `color.text.onAccent` | #0D1117 | #FFFFFF | #0D1117 | #FFFFFF |
| *accentSoft* | `color.accent.soft` | #2C3849 | #DCE4F4 | #2C3849 | #DCE4F4 |
| *accentOnText* | `color.accent.text` | #9DC4FF | #2758B8 | #9DC4FF | #2758B8 |
| training | `color.pillar.training` | #6DEAE7 | #119CA0 | #6DEAE7 | #119CA0 |
| food | `color.pillar.food` | #E66E8B | #9B2C4A | #E66E8B | #9B2C4A |
| recovery | `color.pillar.recovery` | #8794CE | #132185 | #8794CE | #132185 |
| sleep | `color.pillar.sleep` | #E4C675 | #938314 | #E4C675 | #938314 |
| water | `color.pillar.water` | #4FC3F7 | #4FC3F7 | **#87B2CE** | **#1F92E0** |
| success | `color.status.success` | #74D69C | #24733F | #74D69C | #24733F |
| warn | `color.status.warning` | #F2B85A | #8E5300 | #F2B85A | #8E5300 |
| *hair* | `color.separator.default` | #21252B | #DCDFE5 | #21252B | #DCDFE5 |
| *hair2* | `color.separator.strong` | #3A3E44 | #C4C8CE | #3A3E44 | #C4C8CE |
| *ai* | `color.ai.estimate` | #C1C5BA | #5D6E66 | #C1C5BA | #5D6E66 |

**Contrast** (ratio to 1, rounded down; v2 water = shared placeholder #4FC3F7)

| Foreground on surface | Floor | v2 dark | v2 light | Proposed dark | Proposed light |
|---|---|---|---|---|---|
| text on bg | 4.5 | 16.84 | 15.71 | 16.84 | 15.71 |
| text on surface2 | 4.5 | 12.51 | 15.86 | 12.51 | 15.86 |
| text on surface | 4.5 | 15.07 | 17.47 | 15.07 | 17.47 |
| text on accentSoft | 4.5 | 10.56 | 13.68 | 10.56 | 13.68 |
| muted on bg | 4.5 | 8.14 | 5.45 | 8.14 | 5.45 |
| muted on surface2 | 4.5 | 6.04 | 5.50 | 6.04 | 5.50 |
| muted on surface | 4.5 | 7.28 | 6.06 | 7.28 | 6.06 |
| muted on accentSoft | 4.5 | 5.10 | 4.75 | 5.10 | 4.75 |
| accentOnText on bg | 4.5 | 10.61 | 5.94 | 10.61 | 5.94 |
| accentOnText on surface2 | 4.5 | 7.88 | 6.00 | 7.88 | 6.00 |
| accentOnText on surface | 4.5 | 9.49 | 6.61 | 9.49 | 6.61 |
| ai on bg | 4.5 | 10.78 | 4.85 | 10.78 | 4.85 |
| ai on surface2 | 4.5 | 8.00 | 4.90 | 8.00 | 4.90 |
| ai on surface | 4.5 | 9.64 | 5.40 | 9.64 | 5.40 |
| onAccent on accent | 4.5 | 10.61 | 6.61 | 10.61 | 6.61 |
| accent on bg | 3 | 10.61 | 5.94 | 10.61 | 5.94 |
| accent on surface2 | 3 | 7.88 | 6.00 | 7.88 | 6.00 |
| accent on surface | 3 | 9.49 | 6.61 | 9.49 | 6.61 |
| training on bg | 3 | 13.13 | 3.00 | 13.13 | 3.00 |
| training on surface2 | 3 | 9.75 | 3.03 | 9.75 | 3.03 |
| training on surface | 3 | 11.75 | 3.34 | 11.75 | 3.34 |
| food on bg | 3 | 6.27 | 6.61 | 6.27 | 6.61 |
| food on surface2 | 3 | 4.66 | 6.68 | 4.66 | 6.68 |
| food on surface | 3 | 5.61 | 7.36 | 5.61 | 7.36 |
| recovery on bg | 3 | 6.45 | 11.92 | 6.45 | 11.92 |
| recovery on surface2 | 3 | 4.79 | 12.03 | 4.79 | 12.03 |
| recovery on surface | 3 | 5.77 | 13.25 | 5.77 | 13.25 |
| sleep on bg | 3 | 11.38 | 3.43 | 11.38 | 3.43 |
| sleep on surface2 | 3 | 8.45 | 3.46 | 8.45 | 3.46 |
| sleep on surface | 3 | 10.18 | 3.82 | 10.18 | 3.82 |
| water on bg | 3 | 9.44 | **1.80 FAIL** | 8.37 | 3.02 |
| water on surface2 | 3 | 7.01 | **1.81 FAIL** | 6.21 | 3.05 |
| water on surface | 3 | 8.45 | **2.00 FAIL** | 7.49 | 3.36 |
| success on bg | 3 | 10.67 | 5.24 | 10.67 | 5.24 |
| success on surface2 | 3 | 7.92 | 5.29 | 7.92 | 5.29 |
| success on surface | 3 | 9.54 | 5.83 | 9.54 | 5.83 |
| warn on bg | 3 | 10.61 | 5.57 | 10.61 | 5.57 |
| warn on surface2 | 3 | 7.88 | 5.62 | 7.88 | 5.62 |
| warn on surface | 3 | 9.49 | 6.19 | 9.49 | 6.19 |

**Fixes**

- dark `water`: #4FC3F7 → #87B2CE (shared placeholder; per-palette hue distinct from recovery (Q-C))
- light `water`: #4FC3F7 → #1F92E0 (shared placeholder; per-palette hue distinct from recovery (Q-C))

**Near-duplicates flagged** (OKLab ΔE < 0.08 after the fixes above; not changed here)

- dark `sleep` #E4C675 vs `warn` #F2B85A: ΔE 0.038

### 11. Forest Ember (`forestEmber`)

**Values** (`themes.forestEmber.<mode>.…`; derived roles in italics)

| Role | Token path | v2 dark | v2 light | Proposed dark | Proposed light |
|---|---|---|---|---|---|
| bg | `color.surface.base` | #0C120E | #EFF4F0 | #0C120E | #EFF4F0 |
| *surface2* | `color.surface.panel` | #252F28 | #F3F4F3 | #252F28 | #F3F4F3 |
| surface | `color.surface.card` | #162019 | #FFFFFF | #162019 | #FFFFFF |
| text | `color.text.primary` | #EDF5EF | #112016 | #EDF5EF | #112016 |
| muted | `color.text.secondary` | #9DB2A3 | #52685A | #9DB2A3 | #52685A |
| accent | `color.accent.default` | #7CD68E | #1F6E36 | #7CD68E | #1F6E36 |
| onAccent | `color.text.onAccent` | #0C120E | #FFFFFF | #0C120E | #FFFFFF |
| *accentSoft* | `color.accent.soft` | #263D2C | #DBE8DF | #263D2C | #DBE8DF |
| *accentOnText* | `color.accent.text` | #7CD68E | #1F6E36 | #7CD68E | #1F6E36 |
| training | `color.pillar.training` | #AEECAD | #255F39 | #AEECAD | #255F39 |
| food | `color.pillar.food` | #E06245 | #C0502E | #E06245 | #C0502E |
| recovery | `color.pillar.recovery` | #4D6AEA | #4B92CC | #4D6AEA | #4B92CC |
| sleep | `color.pillar.sleep` | #ECD358 | #87883A | #ECD358 | #87883A |
| water | `color.pillar.water` | #4FC3F7 | #4FC3F7 | **#4DEAE7** | **#2C9B99** |
| success | `color.status.success` | #8CDCA0 | #246B3A | #8CDCA0 | #246B3A |
| warn | `color.status.warning` | #FFB34D | #8F5200 | #FFB34D | #8F5200 |
| *hair* | `color.separator.default` | #202622 | #DBE1DC | #202622 | #DBE1DC |
| *hair2* | `color.separator.strong` | #393F3B | #C3CAC4 | #393F3B | #C3CAC4 |
| *ai* | `color.ai.estimate` | #B4D573 | #537B38 | #B4D573 | **#527937** |

**Contrast** (ratio to 1, rounded down; v2 water = shared placeholder #4FC3F7)

| Foreground on surface | Floor | v2 dark | v2 light | Proposed dark | Proposed light |
|---|---|---|---|---|---|
| text on bg | 4.5 | 17.05 | 15.19 | 17.05 | 15.19 |
| text on surface2 | 4.5 | 12.47 | 15.33 | 12.47 | 15.33 |
| text on surface | 4.5 | 15.06 | 16.90 | 15.06 | 16.90 |
| text on accentSoft | 4.5 | 10.58 | 13.38 | 10.58 | 13.38 |
| muted on bg | 4.5 | 8.41 | 5.41 | 8.41 | 5.41 |
| muted on surface2 | 4.5 | 6.15 | 5.46 | 6.15 | 5.46 |
| muted on surface | 4.5 | 7.43 | 6.02 | 7.43 | 6.02 |
| muted on accentSoft | 4.5 | 5.22 | 4.76 | 5.22 | 4.76 |
| accentOnText on bg | 4.5 | 10.70 | 5.64 | 10.70 | 5.64 |
| accentOnText on surface2 | 4.5 | 7.82 | 5.69 | 7.82 | 5.69 |
| accentOnText on surface | 4.5 | 9.45 | 6.28 | 9.45 | 6.28 |
| ai on bg | 4.5 | 11.46 | **4.43 FAIL** | 11.46 | 4.54 |
| ai on surface2 | 4.5 | 8.38 | **4.47 FAIL** | 8.38 | 4.59 |
| ai on surface | 4.5 | 10.12 | 4.93 | 10.12 | 5.06 |
| onAccent on accent | 4.5 | 10.70 | 6.28 | 10.70 | 6.28 |
| accent on bg | 3 | 10.70 | 5.64 | 10.70 | 5.64 |
| accent on surface2 | 3 | 7.82 | 5.69 | 7.82 | 5.69 |
| accent on surface | 3 | 9.45 | 6.28 | 9.45 | 6.28 |
| training on bg | 3 | 13.89 | 6.80 | 13.89 | 6.80 |
| training on surface2 | 3 | 10.15 | 6.86 | 10.15 | 6.86 |
| training on surface | 3 | 12.27 | 7.56 | 12.27 | 7.56 |
| food on bg | 3 | 5.41 | 4.26 | 5.41 | 4.26 |
| food on surface2 | 3 | 3.95 | 4.30 | 3.95 | 4.30 |
| food on surface | 3 | 4.78 | 4.74 | 4.78 | 4.74 |
| recovery on bg | 3 | 4.11 | 3.00 | 4.11 | 3.00 |
| recovery on surface2 | 3 | 3.01 | 3.03 | 3.01 | 3.03 |
| recovery on surface | 3 | 3.63 | 3.34 | 3.63 | 3.34 |
| sleep on bg | 3 | 12.65 | 3.36 | 12.65 | 3.36 |
| sleep on surface2 | 3 | 9.25 | 3.39 | 9.25 | 3.39 |
| sleep on surface | 3 | 11.17 | 3.74 | 11.17 | 3.74 |
| water on bg | 3 | 9.45 | **1.80 FAIL** | 12.84 | 3.01 |
| water on surface2 | 3 | 6.91 | **1.81 FAIL** | 9.39 | 3.04 |
| water on surface | 3 | 8.35 | **2.00 FAIL** | 11.34 | 3.35 |
| success on bg | 3 | 11.60 | 5.82 | 11.60 | 5.82 |
| success on surface2 | 3 | 8.48 | 5.87 | 8.48 | 5.87 |
| success on surface | 3 | 10.24 | 6.48 | 10.24 | 6.48 |
| warn on bg | 3 | 10.65 | 5.59 | 10.65 | 5.59 |
| warn on surface2 | 3 | 7.78 | 5.64 | 7.78 | 5.64 |
| warn on surface | 3 | 9.40 | 6.22 | 9.40 | 6.22 |

**Fixes**

- dark `water`: #4FC3F7 → #4DEAE7 (shared placeholder; per-palette hue distinct from recovery (Q-C))
- light `water`: #4FC3F7 → #2C9B99 (shared placeholder; per-palette hue distinct from recovery (Q-C))
- light `ai`: #537B38 → #527937 (ai (accent/sleep mix #537B38) worst text pair 4.43:1 < 4.5)

**Near-duplicates flagged** (OKLab ΔE < 0.08 after the fixes above; not changed here)

- dark `accent` #7CD68E vs `success` #8CDCA0: ΔE 0.032
- dark `training` #AEECAD vs `success` #8CDCA0: ΔE 0.060
- dark `sleep` #ECD358 vs `warn` #FFB34D: ΔE 0.080
- light `accent` #1F6E36 vs `training` #255F39: ΔE 0.050
- light `accent` #1F6E36 vs `success` #246B3A: ΔE 0.013
- light `training` #255F39 vs `success` #246B3A: ΔE 0.039

### 12. Midnight Neon (`midnightNeon`)

**Values** (`themes.midnightNeon.<mode>.…`; derived roles in italics)

| Role | Token path | v2 dark | v2 light | Proposed dark | Proposed light |
|---|---|---|---|---|---|
| bg | `color.surface.base` | #060A1A | #EDEFFA | #060A1A | #EDEFFA |
| *surface2* | `color.surface.panel` | #1C233E | #F3F3F5 | #1C233E | #F3F3F5 |
| surface | `color.surface.card` | #0D1430 | #FFFFFF | #0D1430 | #FFFFFF |
| text | `color.text.primary` | #EAF0FF | #0B1030 | #EAF0FF | #0B1030 |
| muted | `color.text.secondary` | #8D98C6 | #5A6390 | #8D98C6 | **#59628E** |
| accent | `color.accent.default` | #FF4FD8 | #C2189A | #FF4FD8 | #C2189A |
| onAccent | `color.text.onAccent` | #111111 | #FFFFFF | #111111 | #FFFFFF |
| *accentSoft* | `color.accent.soft` | #341D4B | #F5DAEF | #341D4B | #F5DAEF |
| *accentOnText* | `color.accent.text` | #FF4FD8 | #C2189A | #FF4FD8 | #C2189A |
| training | `color.pillar.training` | #7CFF4F | #2E8A12 | #7CFF4F | #2E8A12 |
| food | `color.pillar.food` | #FF9A1F | #C25A00 | #FF9A1F | #C25A00 |
| recovery | `color.pillar.recovery` | #3DA2FF | #1F5FD6 | #3DA2FF | #1F5FD6 |
| sleep | `color.pillar.sleep` | #C77DFF | #8A2BE2 | #C77DFF | #8A2BE2 |
| water | `color.pillar.water` | #4FC3F7 | #4FC3F7 | **#3DDBFF** | **#1A96B2** |
| success | `color.status.success` | #5FD38A | #1F7A43 | #5FD38A | #1F7A43 |
| warn | `color.status.warning` | #F2C14E | #8F6400 | #F2C14E | #8F6400 |
| *hair* | `color.separator.default` | #1B1F2F | #D9DBE8 | #1B1F2F | #D9DBE8 |
| *hair2* | `color.separator.strong` | #343848 | #C0C2D2 | #343848 | #C0C2D2 |
| *ai* | `color.ai.estimate` | #E366EC | #A622BE | #E366EC | #A622BE |

**Contrast** (ratio to 1, rounded down; v2 water = shared placeholder #4FC3F7)

| Foreground on surface | Floor | v2 dark | v2 light | Proposed dark | Proposed light |
|---|---|---|---|---|---|
| text on bg | 4.5 | 17.26 | 16.20 | 17.26 | 16.20 |
| text on surface2 | 4.5 | 13.54 | 16.75 | 13.54 | 16.75 |
| text on surface | 4.5 | 15.86 | 18.56 | 15.86 | 18.56 |
| text on accentSoft | 4.5 | 12.93 | 14.28 | 12.93 | 14.28 |
| muted on bg | 4.5 | 6.97 | 5.05 | 6.97 | 5.14 |
| muted on surface2 | 4.5 | 5.47 | 5.23 | 5.47 | 5.31 |
| muted on surface | 4.5 | 6.41 | 5.79 | 6.41 | 5.89 |
| muted on accentSoft | 4.5 | 5.22 | **4.46 FAIL** | 5.22 | 4.53 |
| accentOnText on bg | 4.5 | 6.90 | 4.71 | 6.90 | 4.71 |
| accentOnText on surface2 | 4.5 | 5.41 | 4.86 | 5.41 | 4.86 |
| accentOnText on surface | 4.5 | 6.34 | 5.39 | 6.34 | 5.39 |
| ai on bg | 4.5 | 6.92 | 5.09 | 6.92 | 5.09 |
| ai on surface2 | 4.5 | 5.42 | 5.27 | 5.42 | 5.27 |
| ai on surface | 4.5 | 6.36 | 5.84 | 6.36 | 5.84 |
| onAccent on accent | 4.5 | 6.61 | 5.39 | 6.61 | 5.39 |
| accent on bg | 3 | 6.90 | 4.71 | 6.90 | 4.71 |
| accent on surface2 | 3 | 5.41 | 4.86 | 5.41 | 4.86 |
| accent on surface | 3 | 6.34 | 5.39 | 6.34 | 5.39 |
| training on bg | 3 | 15.26 | 3.85 | 15.26 | 3.85 |
| training on surface2 | 3 | 11.97 | 3.98 | 11.97 | 3.98 |
| training on surface | 3 | 14.03 | 4.41 | 14.03 | 4.41 |
| food on bg | 3 | 9.28 | 3.85 | 9.28 | 3.85 |
| food on surface2 | 3 | 7.27 | 3.98 | 7.27 | 3.98 |
| food on surface | 3 | 8.53 | 4.41 | 8.53 | 4.41 |
| recovery on bg | 3 | 7.32 | 4.99 | 7.32 | 4.99 |
| recovery on surface2 | 3 | 5.74 | 5.16 | 5.74 | 5.16 |
| recovery on surface | 3 | 6.73 | 5.72 | 6.73 | 5.72 |
| sleep on bg | 3 | 7.32 | 5.20 | 7.32 | 5.20 |
| sleep on surface2 | 3 | 5.74 | 5.37 | 5.74 | 5.37 |
| sleep on surface | 3 | 6.73 | 5.95 | 6.73 | 5.95 |
| water on bg | 3 | 9.83 | **1.74 FAIL** | 11.98 | 3.02 |
| water on surface2 | 3 | 7.71 | **1.80 FAIL** | 9.39 | 3.13 |
| water on surface | 3 | 9.03 | **2.00 FAIL** | 11.01 | 3.47 |
| success on bg | 3 | 10.47 | 4.67 | 10.47 | 4.67 |
| success on surface2 | 3 | 8.21 | 4.83 | 8.21 | 4.83 |
| success on surface | 3 | 9.63 | 5.35 | 9.63 | 5.35 |
| warn on bg | 3 | 11.73 | 4.59 | 11.73 | 4.59 |
| warn on surface2 | 3 | 9.20 | 4.74 | 9.20 | 4.74 |
| warn on surface | 3 | 10.78 | 5.26 | 10.78 | 5.26 |

**Fixes**

- light `muted`: #5A6390 → #59628E (muted worst text pair 4.46:1 < 4.5)
- dark `water`: #4FC3F7 → #3DDBFF (shared placeholder; per-palette hue distinct from recovery (Q-C))
- light `water`: #4FC3F7 → #1A96B2 (shared placeholder; per-palette hue distinct from recovery (Q-C))

**Near-duplicates flagged** (OKLab ΔE < 0.08 after the fixes above; not changed here)

- light `training` #2E8A12 vs `success` #1F7A43: ΔE 0.074

### 13. Holographic Chrome (`holographicChrome`)

**Values** (`themes.holographicChrome.<mode>.…`; derived roles in italics)

| Role | Token path | v2 dark | v2 light | Proposed dark | Proposed light |
|---|---|---|---|---|---|
| bg | `color.surface.base` | #101215 | #E7EAEE | #101215 | #E7EAEE |
| *surface2* | `color.surface.panel` | #2D3035 | #F0F1F2 | #2D3035 | #F0F1F2 |
| surface | `color.surface.card` | #1E2126 | #FBFCFD | #1E2126 | #FBFCFD |
| text | `color.text.primary` | #F4F6F8 | #15181C | #F4F6F8 | #15181C |
| muted | `color.text.secondary` | #A3AAB3 | #5D646D | #A3AAB3 | #5D646D |
| accent | `color.accent.default` | #E9B8FF | #8A3FB8 | #E9B8FF | #8A3FB8 |
| onAccent | `color.text.onAccent` | #111111 | #FFFFFF | #111111 | #FFFFFF |
| *accentSoft* | `color.accent.soft` | #3E3949 | #E9DEF2 | #3E3949 | #E9DEF2 |
| *accentOnText* | `color.accent.text` | #E9B8FF | #8A3FB8 | #E9B8FF | #8A3FB8 |
| training | `color.pillar.training` | #9BE36D | #3F8A1C | #9BE36D | #3F8A1C |
| food | `color.pillar.food` | #FFB36B | #B85D0E | #FFB36B | #B85D0E |
| recovery | `color.pillar.recovery` | #6EC1FF | #1E6DB8 | #6EC1FF | #1E6DB8 |
| sleep | `color.pillar.sleep` | #E2A6FF | #8A47B8 | #E2A6FF | #8A47B8 |
| water | `color.pillar.water` | #4FC3F7 | #4FC3F7 | **#6EFFFF** | **#199595** |
| success | `color.status.success` | #79C99A | #2A6B44 | #79C99A | #2A6B44 |
| warn | `color.status.warning` | #E8C26A | #8F6400 | #E8C26A | #8F6400 |
| *hair* | `color.separator.default` | #252729 | #D4D7DB | #252729 | #D4D7DB |
| *hair2* | `color.separator.strong` | #3E4042 | #BDC0C4 | #3E4042 | #BDC0C4 |
| *ai* | `color.ai.estimate` | #E6AFFF | #8A43B8 | #E6AFFF | #8A43B8 |

**Contrast** (ratio to 1, rounded down; v2 water = shared placeholder #4FC3F7)

| Foreground on surface | Floor | v2 dark | v2 light | Proposed dark | Proposed light |
|---|---|---|---|---|---|
| text on bg | 4.5 | 17.31 | 14.75 | 17.31 | 14.75 |
| text on surface2 | 4.5 | 12.22 | 15.74 | 12.22 | 15.74 |
| text on surface | 4.5 | 14.90 | 17.33 | 14.90 | 17.33 |
| text on accentSoft | 4.5 | 10.27 | 13.73 | 10.27 | 13.73 |
| muted on bg | 4.5 | 8.00 | 4.95 | 8.00 | 4.95 |
| muted on surface2 | 4.5 | 5.64 | 5.29 | 5.64 | 5.29 |
| muted on surface | 4.5 | 6.88 | 5.82 | 6.88 | 5.82 |
| muted on accentSoft | 4.5 | 4.74 | 4.61 | 4.74 | 4.61 |
| accentOnText on bg | 4.5 | 11.40 | 4.99 | 11.40 | 4.99 |
| accentOnText on surface2 | 4.5 | 8.04 | 5.33 | 8.04 | 5.33 |
| accentOnText on surface | 4.5 | 9.81 | 5.86 | 9.81 | 5.86 |
| ai on bg | 4.5 | 10.66 | 4.86 | 10.66 | 4.86 |
| ai on surface2 | 4.5 | 7.52 | 5.19 | 7.52 | 5.19 |
| ai on surface | 4.5 | 9.17 | 5.71 | 9.17 | 5.71 |
| onAccent on accent | 4.5 | 11.47 | 6.02 | 11.47 | 6.02 |
| accent on bg | 3 | 11.40 | 4.99 | 11.40 | 4.99 |
| accent on surface2 | 3 | 8.04 | 5.33 | 8.04 | 5.33 |
| accent on surface | 3 | 9.81 | 5.86 | 9.81 | 5.86 |
| training on bg | 3 | 12.15 | 3.57 | 12.15 | 3.57 |
| training on surface2 | 3 | 8.57 | 3.81 | 8.57 | 3.81 |
| training on surface | 3 | 10.45 | 4.20 | 10.45 | 4.20 |
| food on bg | 3 | 10.64 | 3.77 | 10.64 | 3.77 |
| food on surface2 | 3 | 7.51 | 4.02 | 7.51 | 4.02 |
| food on surface | 3 | 9.15 | 4.43 | 9.15 | 4.43 |
| recovery on bg | 3 | 9.59 | 4.42 | 9.59 | 4.42 |
| recovery on surface2 | 3 | 6.76 | 4.71 | 6.76 | 4.71 |
| recovery on surface | 3 | 8.25 | 5.19 | 8.25 | 5.19 |
| sleep on bg | 3 | 9.94 | 4.73 | 9.94 | 4.73 |
| sleep on surface2 | 3 | 7.02 | 5.05 | 7.02 | 5.05 |
| sleep on surface | 3 | 8.55 | 5.56 | 8.55 | 5.56 |
| water on bg | 3 | 9.36 | **1.66 FAIL** | 15.55 | 3.01 |
| water on surface2 | 3 | 6.60 | **1.77 FAIL** | 10.97 | 3.21 |
| water on surface | 3 | 8.05 | **1.95 FAIL** | 13.38 | 3.54 |
| success on bg | 3 | 9.50 | 5.29 | 9.50 | 5.29 |
| success on surface2 | 3 | 6.70 | 5.65 | 6.70 | 5.65 |
| success on surface | 3 | 8.17 | 6.22 | 8.17 | 6.22 |
| warn on bg | 3 | 11.03 | 4.36 | 11.03 | 4.36 |
| warn on surface2 | 3 | 7.79 | 4.65 | 7.79 | 4.65 |
| warn on surface | 3 | 9.49 | 5.12 | 9.49 | 5.12 |

**Fixes**

- dark `water`: #4FC3F7 → #6EFFFF (shared placeholder; per-palette hue distinct from recovery (Q-C))
- light `water`: #4FC3F7 → #199595 (shared placeholder; per-palette hue distinct from recovery (Q-C))

**Near-duplicates flagged** (OKLab ΔE < 0.08 after the fixes above; not changed here)

- dark `accent` #E9B8FF vs `sleep` #E2A6FF: ΔE 0.046
- dark `food` #FFB36B vs `warn` #E8C26A: ΔE 0.050
- light `accent` #8A3FB8 vs `sleep` #8A47B8: ΔE 0.016
- light `food` #B85D0E vs `warn` #8F6400: ΔE 0.077

<!-- INS-01:GENERATED:END -->

## Open questions (for Elliot's proposal PR, then Will)

- **O1.** Should the 5.2 near-duplicates be fixed too? The most common case is pillar green next to success green. Options: (a) leave them as v2 has them; (b) move `success` to a different hue per palette, the way water moved; (c) only fix pairs below ΔE 0.04.
- **O2.** Derived rules: `ai` as a 50/50 accent/sleep mix and `accentOnText` as the "nearest passing lightness" rule are this proposal's guesses. Elliot should check them against v2's CSS and replace them if v2 differs.
- **O3.** `meta.swatches` for the Appearance picker: is `[accent, recovery, sleep]` right, or should the picker show the accent alone?
- **O4.** Secret backgrounds (Neon radial, Holo linear gradients) are graded here on their flat `bg` only. The gradient stops need their own check in the proposal PR.

## Checklist

- [x] Palette names match the v2 palettes 1:1 (13). The test reads the REDESIGN.md §5 table.
- [x] Every graded pair has a contrast value: 43 per mode, 86 per palette, v2 and proposed.
- [x] Failures are listed with fixes, and every proposed pair passes.
- [x] Each palette has its own water colour, distinct from recovery.
- [x] Both duplicate-colour notes are resolved.
- [x] Token files are unchanged: `native/src/design/tokens.ts`, `native/src/design/tokens.json` and `design/tokens.ts`.
