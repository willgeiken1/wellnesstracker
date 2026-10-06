# Exercise bank: provenance and licensing

The built-in exercise bank is `ASSETS.bank` in `logger/js/data/body.js`: 478 entries, each `{ g, n, a }` (picker group, exercise name, advanced muscle keys). This note records where those entries came from, as far as the repo history and the planning notes show.

## Where the entries came from

| Entries | Added in | Source |
|---|---|---|
| 386 | `9dde787` (Oct 3, 2026, "exercise bank"), carried into `logger/js/data/body.js` by #1 | Written for Insight with the app. No outside dataset is recorded for these entries in the commit or in the project notes. |
| 2 | #33 (`5ed2a38`): JM Press, Smith Machine JM Press | Written for Insight. |
| 90 | #35 (`ac77c5b`): 75 gap-list names plus 15 extras | Insight-written names, chosen by checking which common exercises were missing. |

For the 90 entries in #35, four outside exercise lists were used only as a checklist of exercise **names**: free-exercise-db, wger (CC BY-SA), the ExerciseDB free tier, and the RepDB free dataset (repdb.co). Every name was rewritten in Insight's style, and every muscle key was picked by hand from Insight's own 44-key map. No descriptions, instructions, images, ids, or source muscle tags from any of these lists are in the repo.

## What the repo does not contain

- No RepDB files, JSON, text, ids, or images. RepDB's free-tier license doesn't allow redistributing its data as a dataset, so RepDB data and media must stay out of this public repo. If RepDB media or instructions are added later, load them from private storage at build or run time.
- No exercise images or videos from any outside source.

## Credit

Settings → About shows "Exercise data by RepDB (repdb.co)", linking to https://repdb.co, per the project's decision to credit RepDB as the exercise data source.
