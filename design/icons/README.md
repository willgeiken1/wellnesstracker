# Insight icons

One icon set for the iPhone app and the web app. `insight-icons.json` in this folder is the only place an icon is drawn; everything else is generated from it.

## The set
- 80 icons, approved by Will on Nov 23, 2026: the "Native Line" set, with its 13 navigation icons (the four chevrons, close, plus, minus, search, undo, more, check, drag-handle and share) taken from the "Soft Geometric" set and redrawn to the same weight.
- Every icon is drawn in a 24 by 24 box with one **1.75** line, round ends and round corners, in `currentColor`. An icon never carries a colour of its own; it takes the colour of the place it is used.
- Use it at **16, 20, 24 or 28** points (D14). A few older slots still ask for 14, 18 or 22; new work should pick a size from the four.
- The five tabs have a filled twin for the open tab: `home-active`, `workouts-active`, `food-active`, `progress-active` and `routine-active` (plus `insights-active` for the web app's Insights tab).
- Icons are decorative. The button or row around one carries the label a screen reader says.

`insight-icons.json` holds `strokeWidth`, `viewBox`, and `icons`: a name mapped to the inner SVG markup (`path`, `circle`, `rect`, `line` and `ellipse` only, with `stroke` and `fill` set to `none` or `currentColor`).

## Where it goes
| File | Made by | Used by |
|---|---|---|
| `native/src/components/icon-data.ts` | `gen-icons.cjs` | `<Icon name size color>` in `native/src/components/icon.tsx`, drawn with react-native-svg on iPhone, Android and web |
| `logger/js/shared/icon-set.js` | `gen-icons.cjs` | `icon(name, { cls, size })` in `logger/js/shared/icons.js` |
| every `<svg data-icon="name">` in `logger/index.html` | `gen-icons.cjs` | the web tab bar, which is plain HTML |
| `native/assets/images/navigation/*.png` | `gen-tab-icons.py` | the iPhone system tab bar, which takes pictures and not components |

Generated files start with a "GENERATED, do not edit" line.

## Changing or adding an icon
1. Edit `insight-icons.json`. Keep the 24 box, the 1.75 line and `currentColor`.
2. Run `node native/scripts/gen-icons.cjs`. It has no dependencies, and stops with a message if the markup uses a shape, attribute or colour the set does not allow. `--check` only reports whether the generated files are current; the tests run it.
3. If a tab icon changed, run `python3 native/scripts/gen-tab-icons.py` (needs `pip install cairosvg`).
4. If the web files changed, raise the cache name in `logger/sw.js` and the release in `logger/js/sentry.js`.

## The tab bar pictures
`gen-tab-icons.py` renders each tab's icon as a black glyph on a clear background, which the system bar tints. Each is the whole 24 box, so the padding is the set's own, at 1x, 2x and 3x (24, 48 and 72 pixels: `home.png`, `home@2x.png`, `home@3x.png`), with the filled twin beside it as `home-selected*.png`. The file name is the tab's label in `native/src/features/shell/tabs.ts`; the Routines tab draws `routine`.
