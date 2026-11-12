# BA-2D sources

- Geometry: **Insight's own web app figure.** The outlines, muscle shapes, deep-muscle
  projections and detail lines are the 44-muscle body from the web app
  (`ASSETS.advBody` in `logger/js/data/body.js`, male and female), converted by
  `native/scripts/atlas/build_atlas.py`. The converter mirrors the drawn half,
  applies the web figure's clip shapes, flattens curves to straight-edge polygons
  and centres the figure in the 200 x 440 viewBox. No outside artwork was added.
  This replaces the first BA-2D outline (straight-edge shapes drawn by Codex) at
  Will's direction on 2026-11-10: the web app figure is the floor for the native atlas.
- Stable keys and basic-group mapping: existing repository
  `logger/js/data/body.js` (`ASSETS.advToBasic`, 44 keys). Labels derive from its
  `advGroups`; scientific labels are anatomical terminology in `src/i18n/en.ts`.
- Light sequential blue palette (#deebf7, #9ecae1, #4292c6, #08519c) and
  dark-mode #c6dbef: ColorBrewer **Blues**, Cynthia Brewer, Penn State,
  **Apache-2.0** (https://github.com/axismaps/colorbrewer/blob/master/LICENCE.txt).
  Dark-mode #263746, #5685a2 and #8dbbd6 are **original adaptations**, not
  ColorBrewer values. No artwork copied. Attribution is shown in About → Licenses.

`geometry.json` is what native reads. It is generated: change the web figure or the
converter and rerun it, do not edit the JSON by hand. Each side has `skin` (filled
silhouette), `lines` (stroke-only detail) and `muscles` in paint order; `deep: true`
marks a dashed deep muscle. Six muscles seen from both sides have a shape on each.
The PWA diagram swap was removed in fix round 2 per Will
(2026-10-28, 7:15 AM CT): the body map is native-only.
The four SVG files are plain exports of the skin, muscle and line layers, one compound
Path per key, both lateral halves in that path. Tests enforce export equality
and the combined 300 KB SVG cap. Update these exports together.

Deep muscles appear as schematic surface projections; this simplified training
map is not a depth-accurate anatomy illustration. The female outline narrows
shoulders/waist and widens hips; keys and attribution are identical.

Native attribution is basic-group data (M2-06), not measured individual muscle
activation. Every region inherits its mapped group's count. Group rollups count
that number once, not the sum of duplicated region values. Seven-day rolling
window uses completed sessions; warmups, skipped, zero-rep and unfinished sets
are excluded. Recency uses the latest completed session and weighted group sets;
10+ weighted sets in that session take precedence over the small-muscle 36h rule.
No new neck key is invented; the target/fade policy supports neck for later use.
