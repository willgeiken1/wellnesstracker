# Tiles

One grid engine for Home, Training, Food, Progress and Routines. Import from `src/features/tiles`.

## Mounting the grid on a page
- Use an `Animated.ScrollView` with `ref={useAnimatedRef()}` and render `<TileGrid page="training" scrollRef={ref} />` inside it. Edit mode scrolls it, a drag near an edge autoscrolls it, and the Done bar sticks under its top (`stickyTop` overrides where).
- The grid lays out, persists (per page, in the app's local storage), and handles edit mode: long press or Edit page, wiggle, remove with undo, drag to reorder, resize, Add a tile, Done.
- A page made of sections rather than tiles uses `<PageSections page sections={[{ id, title, render, options? }]} scrollRef />`.
- Edit state lives in `tileEdit` (`get`, `subscribe`, `set(page, on)`, `end()`). The dock's Done calls `tileEdit.end()`. Leaving a tab should call `tileEdit.set(page, false)`.

## App wiring (once, outside this folder)
- Sheet routes: `src/app/tiles/tray.tsx` renders `<TileTraySheet page={page} />`, `edit.tsx` renders `<TileEditorSheet page id />` (the tile editor, `editor/`), and `section.tsx` renders `<PageSectionSheet page id />`. Read `page` and `id` from the search params, and register each screen with `tileSheetOptions.tray`, `.edit` or `.section`.
- `configureTileToast((message, action?) => ...)` hands removes and resets to the shell's toast, with an Undo action.
- `configureTileRoutes({...})` points tray, customize, section or close somewhere else if a page needs to.
- The app root needs `GestureHandlerRootView`. Until it has one, the grid wraps itself.

## Registering a tile
- Each page's catalogue is in `catalog/<page>.ts`. It lists every tile with its id, sizes, styles, options, tray section and the starting layout. Every renderer starts as `pendingTile(...)`, which draws the frame, the header and a plain placeholder body.
- A packet builds a tile in its own folder and calls `implementTile` once at module load, before the page draws:

```ts
implementTile('training', 'volume', {
  render: ({ size, body, colors, tint, options, editing, preview }) => <VolumeChart w={body.w} h={body.h} />,
  meta: ({ options }) => '12 sets',           // the grey text at the header's right
  open: options => router.push('/training/volume'), // a tap outside edit mode
});
// A tile with styles: implementTile('home', 'score', { styles: { A: { render }, B: { render } } })
```
- `render` may be one function or `{ S, M, L }`. It draws only the body: the engine draws the frame, depth, header and edit chrome. Use `body.w` and `body.h`, and draw from theme `colors` and `tint` only.
- When `editing` or `preview` is true, the body gets no touches. Keep live controls and entrance motion off, and respect `reduceMotion`.
- `pendingTiles(page)` lists what is still a stub. Unknown page or tile ids throw, so typos show in tests.
- A tile's copy, names and options live in its catalogue entry. New UI strings go in `src/i18n/en.ts`.

## Adding and editing a tile
- Add a tile (`tray-sheet.tsx`) shows every tile not on the page, each drawn live at the style and size it would be added in. Add on a card adds it as shown. A tap opens the same editor as Edit tile (`editor/editor-sheet.tsx`, its `add` mode): changes go to a draft the tray keeps until Add, and there is no goal, Reset or Remove.
- Besides a tile's own catalogue options, an entry's `options` can hold two kinds of extra key that the editor writes and every page keeps:
  - `u.<unit>` (`u.weight`, `u.energy`, `u.water`, `u.distance`, `u.height`, `u.clock`): this tile's own unit, when it differs from Settings. Only the units listed for the tile in `TILE_UNITS` (`look.ts`) are offered; renderers read them through `tileUnits(options)`.
  - `tint`: a theme colour token from `SWATCHES` that replaces the tile's own colour, where `canTint` allows it.
- Goals in the editor (`tileGoals` over `TILE_GOALS`, `editor/goals.ts`) are the same goals Settings, Goals edits, not per-tile values. Progress's Goal tile offers the goal it shows. Food targets are those of the day Food shows (Home: today as food counts it). Revert puts the weight goal and food targets back exactly as stored, so one never set stays unset.
