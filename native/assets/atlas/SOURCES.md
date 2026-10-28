# BA-2D sources

- Geometry: **original**. All polygon vertices, skin outlines, body proportions and
  compound SVG paths were drawn for BA-2D by Codex. No internet SVG, traced art,
  generated bitmap, GLB, or legacy PWA diagram paths were used.
- Stable keys and basic-group mapping: existing repository
  `logger/js/data/body.js` (`ASSETS.advToBasic`, 44 keys). Labels derive from its
  `advGroups`; scientific labels are anatomical terminology in `src/i18n/en.ts`.
- Light sequential blue palette (#deebf7, #9ecae1, #4292c6, #08519c) and
  dark-mode #c6dbef: ColorBrewer **Blues**, Cynthia Brewer, Penn State,
  **Apache-2.0** (https://github.com/axismaps/colorbrewer/blob/master/LICENCE.txt).
  Dark-mode #263746, #5685a2 and #8dbbd6 are **original adaptations**, not
  ColorBrewer values. No artwork copied. Attribution is shown in About → Licenses.

`geometry.json` is the canonical vertex/path source. Native reads it directly;
`logger/js/data/atlas-geometry.js` exports the same object for the live PWA.
The four SVG files are plain exports of the skin and muscle layers, one compound
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
