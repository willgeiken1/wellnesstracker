import type { Repository } from '../src/data/repository';
import type { Row } from '../src/data/rows';
import { DEFAULT_BLOCK_IDS, routineLogId, routinePlacementId, routineUuid } from '../src/features/routines/model/ids';
import { emptyRoutineStore, type RoutineLog, type RoutineStore } from '../src/features/routines/model/shape';
import { commitRoutineStore, readRoutineStore } from '../src/features/routines/data/sqlite';
import { memoryRepository } from './workout-repository';

/* A phone's data in memory, with the two extra things the routine store asks of a repository.
   Everything here is made up: no real compound, amount or person. */
export function routinesRepository(): Repository {
  const repo = memoryRepository() as unknown as Repository & { device: string; putLocal: (row: Row) => void };
  repo.device = 'synthetic';
  repo.putLocal = (row: Row) => { repo.save(row.table, row.data, row.id); };
  return repo;
}

export const SAMPLE = {
  morning: DEFAULT_BLOCK_IDS.morning, night: DEFAULT_BLOCK_IDS.night,
  stretch: routineUuid('test', 'stretch'), walk: routineUuid('test', 'walk'), vial: routineUuid('test', 'vial'), wind: routineUuid('test', 'wind'),
  compound: routineUuid('test', 'compound'),
} as const;
export const SAMPLE_DAY = '2026-11-23';
/** Eight in the morning on the sample day, inside the Morning routine. */
export const SAMPLE_NOW = new Date(2026, 10, 23, 8, 0, 0);

const stamp = { updatedAt: 10, deletedAt: null };
/** Morning holds two checks and one made-up dose item of the peptide type; Night holds one check. */
export function sampleStore(patch: (store: RoutineStore) => void = () => {}): RoutineStore {
  const store = emptyRoutineStore();
  store.blocks = [
    { id: SAMPLE.morning, name: 'Morning routine', color: 'citrus', order: 0, startMin: 300, endMin: 660, ...stamp },
    { id: SAMPLE.night, name: 'Night routine', color: 'pink', order: 1, startMin: 1260, endMin: 1380, ...stamp },
  ];
  store.compounds = [{ id: SAMPLE.compound, name: 'Zzyq Sample Vial', amount: 3, unit: 'units', startDate: null, archivedAt: null, chartLine: false, ...stamp }];
  store.items = [
    { id: SAMPLE.stretch, name: 'Zzyq Stretch', kind: 'check', compoundId: null, timeMin: 420, ...stamp },
    { id: SAMPLE.walk, name: 'Zzyq Walk', kind: 'check', compoundId: null, timeMin: 600, ...stamp },
    { id: SAMPLE.vial, name: 'Zzyq Sample Vial', kind: 'dose', compoundId: SAMPLE.compound, type: 'peptide', timeMin: 480, onHand: 20, onHandDay: '2026-11-01', ...stamp },
    { id: SAMPLE.wind, name: 'Zzyq Wind Down', kind: 'check', compoundId: null, ...stamp },
  ];
  store.placements = [[SAMPLE.morning, SAMPLE.stretch], [SAMPLE.morning, SAMPLE.vial], [SAMPLE.morning, SAMPLE.walk], [SAMPLE.night, SAMPLE.wind]]
    .map(([blockId, itemId], order) => ({ id: routinePlacementId(blockId, itemId), blockId, itemId, order, ...stamp }));
  store.prefs = { lastBlockId: null, updatedAt: 10, setup: { v: 1, status: 'done', answers: {}, updatedAt: 10 }, added: ['doses', 'calculator', 'injection', 'supply', 'rest'], tipsHidden: true };
  patch(store);
  return store;
}

/** A taken log of the sample dose item on a day. */
export function vialLog(day: string, extra: Partial<RoutineLog> = {}): RoutineLog {
  return { id: routineLogId(SAMPLE.vial, day), itemId: SAMPLE.vial, compoundId: SAMPLE.compound, day, status: 'done', amount: 3, unit: 'units',
    at: new Date(`${day}T07:30:00`).getTime(), updatedAt: 20, deletedAt: null, ...extra };
}

export function seededRepository(patch?: (store: RoutineStore) => void): Repository {
  const repo = routinesRepository();
  commitRoutineStore(repo, sampleStore(patch), 100);
  return repo;
}
export const stored = (repo: Repository) => readRoutineStore(repo);
/** The live log of an item on a day, as the phone holds it. */
export const logOf = (repo: Repository, itemId: string, day = SAMPLE_DAY) => stored(repo).logs.find(log => log.itemId === itemId && log.day === day && log.deletedAt === null) ?? null;
