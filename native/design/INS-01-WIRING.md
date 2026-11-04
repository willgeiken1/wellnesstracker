# INS-01 subset wiring — draft review

This draft consumes only the values merged in PR #144. It does not edit
`tokens.json` or `tokens.ts`, add palettes, rename tokens, or alter stored theme
preferences. Quinn review and the existing owner approval gates still apply;
this document does not authorize activation, merge, or release.

## Consumers

| Consumer | Role |
| --- | --- |
| ThemeProvider `colors.bg` | `color.surface.base[mode]` |
| ThemeProvider `colors.surface` | `color.surface.card[mode]` |
| ThemeProvider `colors['surface-2']` | `color.surface.panel[mode]` |
| Food calorie progress arc | `color.pillar.food[mode]` |
| Cardio weekly-minute progress arc | `color.pillar.training[mode]` |

The surface mapping reaches existing consumers of these three shared roles
across all four existing accents. Text, accent, warning, danger, success and
source colors retain their existing values. Card/panel placement, dimensions,
ring geometry, accessible quantities, calculations and persistence are unchanged.
The existing provider's system/light/dark selection supplies the mode.

Sleep remains unused: public main has no sleep visualization to wire. Adding
one or integrating a separate candidate is a follow-up, not part of this draft.
Food macro arcs stay neutral: the three pillar colors are not macro colors.

## Contrast boundary

Pillar colors are used only for graphics at full opacity. Existing text colors
remain in use for labels and numbers. In particular, light food is below 4.5:1
on panel/base and light training is below 4.5:1 on panel; none is used for text.

`tests/ins01-wiring.test.tsx` exercises all eight mode/accent combinations through
the real provider. It checks that only surface roles change, existing text roles
meet 4.5:1, status/source graphics and all three pillar values meet 3:1 on each
surface, and the rendered food/cardio SVG strokes use the intended pillar while
accessible quantities remain intact. `tests/tokens.test.ts` still verifies the
unchanged legacy token resolver.

## Review boundaries

Source: public main plus PR #144's merged values, following the bounded INS-01
request. No private candidate source or private review artifacts are included.
The six-part handoff remains the visual minimum for the broader build; this
color-only wiring does not claim to complete its layout or feature requirements.
The full 13-palette proposal and native sleep UI remain out of scope.

Simulator/emulator launches and screenshots must be reviewed separately; a
passing component test is not device-rendering evidence. See the draft PR for
exact test outcomes and host limitations.
