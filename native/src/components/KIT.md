# Insight kit

Native versions of every shared building block in the final mockup's kit (`kit.css`, `kit.js`, `icons.js`, `motion.css`).
Import from `@/components/kit`. Sizes are points, colours are theme tokens (`accent`, `food`, `text-muted`, `surface-2`, ...),
and every piece follows the theme (18 palettes, dark and light) and Reduce Motion.

Kit-wide rules: no text under 11 pt (`MIN_TEXT`); every control answers to at least 44 pt (hitSlop where it is drawn
smaller); every control has a VoiceOver label; text grows with Dynamic Type (only nav bar and sheet titles truncate).

## Type, colour and layout helpers (`kit-style.ts`)

| Export | What it is |
|---|---|
| `KitText` | Text in an exact kit style: `weight` 500/600/700, `size`, `lineHeight` (multiple), `tracking` (em), `color` token, `numeric` (tabular figures). |
| `font(weight, size, lineHeight?, trackingEm?)` | The same as a style object. Use it instead of raw `fontSize` / `letterSpacing`. |
| `useKit()` | Theme plus kit.css derived colours: `pill`, `pillInk`, `sheetBg`, `scrim`, `fill`, `segOn`, `cardEdge` (light hairline shadow), `lift`, `cardBg`/`controlBg` (step up on dark sheets), `tok(name)`, `tint(color, weight)`. |
| `mix(a, b, w)`, `alpha(c, w)` | CSS `color-mix(in srgb, ...)`. |
| `KIT` | Gutter 16, gap 12 (grid3 10), radii (card/list 20, field 14, search/seg 12, sheet 24, toast 18). |
| `slopFor(w, h)` | hitSlop that grows a control to 44 x 44. |
| `capitals` | The eyebrow's small capitals (the only uppercase style allowed in the app). |
| `StackGapContext` | The gap a parent stack adds; Screen and Sheet set 12 so section headers keep their exact margins. |
| `SurfaceContext` | `page`, `sheet`, `sheet-inset`; Sheet, Card and List set it so dark sheets step their surfaces up. |

## Components

| Component | Props (main) | Mirrors |
|---|---|---|
| `Icon` | `name`, `size` (20), `color` | `INS.icon` / `TS2.icons`: all 127 icons by mockup name (icons.js, kit.js, page modules); 24 grid, 1.75 stroke, round caps. Old names `avatar`, `chevron`, `insights` still work. |
| `Button` | `label`, `onPress`, `variant` (`primary`, `secondary`=`tinted`, `plain`=`ghost`, `quiet`, `destructive`=`danger`), `size` (`md` 48, `sm` 36), `full`, `color`, `icon`, `disabled`, `busy` | `.btn`, `.btn.secondary/.ghost/.quiet/.danger/.sm/.full` (`ui.btn`). Press scale. Without `full` the parent decides the width. |
| `IconButton` | `icon`, `label`, `onPress` | `.iconbtn` (40 pt round, light ring in light mode) |
| `Card` / `Surface` | `variant` (`default`, `tint`, `flat`) + View props | `.card`, `.card.tint`, `.card.flat` (`ui.card`) |
| `Grid` | `columns` 2 or 3 | `.grid2`, `.grid3` |
| `List` | `children` (ListRows), `footer` | `.list` + `.foot` (`ui.list`); draws the hairlines (inset 16, or 60 beside an icon) |
| `ListRow` | `title` (or old `label`), `sub`, `icon` + `color`, `value` + `strong`, `chevron`, `toggle` + `onToggle`, `right`, `danger`, `onPress` | `.row`, `.row.hasic`, `.ic`, `.val`, `.chev`, `.row.danger` (`ui.row`) |
| `ListFooter` | children | `.foot` |
| `Section` | `title`, `aside` + `onAside`, `first`, `footer`, children | `.sec` + content + `.foot` |
| `SectionHeader` | `title`, `aside`, `onAside`, `first` | `.sec` (`ui.sec`) |
| `Eyebrow` | children | `.eyebrow` (10.5 in the mockup, 11 here) |
| `LargeTitle` | children, `display` (34) | `.bigt` (30); `display` is the Settings root's 34 pt title |
| `PageHeader` | `eyebrow`, `title`, `sub`, `right` (IconButtons) | `.ph` (`ui.header`) |
| `NavBar` | `back` (previous screen's name), `onBack` (router.back), `title`, `right`, `large`, `scrolled`, `safeTop` | `.nb` (`ui.navbar`); `large` + `scrolled` for the Settings-style title that joins the bar on scroll |
| `NavButton` | `label`, `icon`, `onPress`, `disabled` | `.nb .tbtn` |
| `Sheet` | `header`, children, `scroll`, `gap` + ScrollView props | `.sheet > .scroll` (sheet colour, 16 pt sides, room at the end) |
| `SheetHeader` | `title`, `left` (Cancel; `null` for none), `onLeft`, `right`, `onRight`, `rightDisabled`, `grabber` | `.sh` (`ui.sheetHead`); left and right default to closing the sheet |
| `SheetGrabber` | none | `.grab` (draw only where the native form sheet does not) |
| `SegmentedControl` | `label`, `options`, `value`, `onChange`, `compact` (the narrow form at the end of a settings row) | `.seg` (`ui.seg`); keeps the Appearance "pills" selector look |
| `Chip` / `Chips` | `label`, `selected`, `onPress`, `icon`, `color` / children | `.chip` (`ui.chip`) / `.chips` |
| `Switch` | `value`, `onValueChange`, `label` | `.sw` (`ui.toggle`): 51 x 31, success green, knob on the switch spring |
| `Stepper` | `value`, `onChange`, `step`, `min`, `max`, `dec`, `unit`, `snap`, `label` | `.stepper` (`ui.stepper`); `stepValue()` and `formatNumber()` are the mockup's logic |
| `TextField` | `label`, `unit` + TextInput props | `.field` (`ui.field`) |
| `SearchField` | `placeholder` + TextInput props | `.search` (`ui.search`) |
| `Badge` | `label`, `color` | `.badge` (`ui.badge`) |
| `Stat` | `value`, `unit`, `label`, `sub`, `color`, `subColor` (the delta) | `.stat` (`ui.stat`) |
| `ProgressBar` | `value` 0..1, `color`, `label` | `.bar` (`ui.bar`) |
| `Ring` | `value`, `size` (64), `stroke` (7), `color`, `track`, `label`, children | `ui.ring`. (`RingArc` stays for the Appearance ring looks.) |
| `BarChart` | `values`, `labels`, `color`, `goal`, `hi`, `w`, `h`, `label` | `ui.bars` |
| `LineChart` | `values`, `color`, `fill`, `goal`, `dots`, `labels`, `min`, `max`, `dashedLast`, `label` | `ui.line` |
| `EmptyState` | `title`, `description`, `icon`, `color`, `action` | `.empty` (`ui.empty`) |
| `ToastProvider` / `useToast()` | `show(text, { color, action, onAction, ms })` | `.ins-toast` (`INS.toast`). Mount `ToastProvider` once near the root (not yet done; see below). |
| `Screen` | `title`, `tabHeader`, `topInset` | The page scroll: 16 pt gutter, 12 pt gap, `.ph` title |
| `Tappable` | Pressable props + `dim` (`row`, `fill`, `text` .45, `seg` .5, `none`) | The pressed dims |
| `PressScale` | Pressable props | `.press` (scale .97, spring back) |

## Motion (`kit-motion.ts`, `kit-motion-reanimated.ts`)

- `SPRINGS` (push, sheet, tab, soft, press, pop, toast, switch: mass, stiffness, damping, ms), `FADES`, `DISTANCES`: the
  motion.css tokens. `springConfig(name, to)` gives an `Animated.spring` config; `usePressScale()` is `.press` on RN Animated.
- Reanimated presets (import `@/components/kit-motion-reanimated` directly): `kitSpring(name)` (withSpring config, follows
  system Reduce Motion), `useKitPress()`, and entering/exiting builders `tabPageEntering(reduced)`, `tabPageExiting()`,
  `listItemEntering(index, reduced)`, `sheetItemEntering(index, reduced)`, `toastEntering(reduced)`, `toastExiting(reduced)`,
  `popEntering(reduced)`. Pass `useReducedMotion()`; with it on every preset is a 200 ms fade and nothing travels.
- Push and sheet transitions are the native stack's (UINavigationController and form sheets), which the mockup imitates.
- Jest: Reanimated loads only with `resolver: 'react-native-reanimated/jest/resolver'` in `jest.app.config.js` (not set
  yet). The core components above use RN Animated so every screen's tests run without it.
