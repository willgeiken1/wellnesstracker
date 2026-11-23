import { saveItem } from '../src/features/routines/model/actions';
import { deleteBlock, hideBlock, renameBlock } from '../src/features/routines/model/blocks';
import { DEFAULT_BLOCK_IDS } from '../src/features/routines/model/ids';
import {
  ADDABLE_PARTS, addRoutinePart, applySetup, askedQuestions, backSetupStep, finishSetup, hideTips, nextSetupStep, normalizeSetupAnswers, openSetupDraft,
  pickSetupAnswer, pruneSetupAnswers, readSetup, routineParts, routineSetupShows, routineShows, saveSetup, SETUP_MESSAGES, SETUP_QUESTIONS, setupAnswerText,
  setupBlocks, setupChoices, setupOffered, setupShape, setupTypeTabs, setupWindow, skipSetupQuestion, toggleFocus, type SetupDraft,
} from '../src/features/routines/model/setup';
import { DEFAULT_BLOCK_STAMP, emptyRoutineStore, liveOf, projectRoutineStore, type RoutineStore } from '../src/features/routines/model/shape';

/* Synthetic accounts only. The setup answers are keys from a fixed list, so no free text is stored.
   The rules follow the web app's setup tests for routines. */

const DAY = '2026-11-22';
const clock = (now = 5000, day = DAY) => ({ now, day });
function ids(prefix = 0) { let n = 0; return () => `0000000${prefix}-0000-4000-8000-${String(++n).padStart(12, '0')}`; }
const must = <T,>(value: T | null): T => { if (value == null) throw new Error('refused'); return value; };
const MORNING = DEFAULT_BLOCK_IDS.morning;
const NIGHT = DEFAULT_BLOCK_IDS.night;
function seeded(): RoutineStore {
  return { ...emptyRoutineStore(), blocks: [
    { id: MORNING, name: 'Morning routine', color: 'citrus', order: 0, updatedAt: DEFAULT_BLOCK_STAMP, deletedAt: null },
    { id: NIGHT, name: 'Night routine', color: 'pink', order: 1, updatedAt: DEFAULT_BLOCK_STAMP, deletedAt: null },
  ] };
}
const names = (store: RoutineStore) => must(projectRoutineStore(store)).blocks.map(block => block.name);
const done = (store: RoutineStore, answers: Record<string, unknown>, at = 5000, extra = {}) => must(applySetup(store, { status: 'done', answers, at, ...extra }));
const FULL = { goals: ['supplements', 'enhancers'], experience: 'some', days: 'regular', wake: '6-8', sleep: '10-12', train: '3-4', track: ['supplements'], inject: 'yes', count: '4-8', supply: 'yes', timing: ['waking'], watch: ['sleep'], home: 'next', feel: 'all' };

describe('the questions', () => {
  test('fifteen questions, with the web wording', () => {
    expect(SETUP_QUESTIONS.map(question => question.id)).toEqual(['goals', 'experience', 'days', 'wake', 'sleep', 'train', 'track', 'enhancers', 'inject', 'count', 'supply', 'timing', 'watch', 'home', 'feel']);
    expect(SETUP_QUESTIONS[0]).toMatchObject({ title: 'What brings you to Routines?', multi: true, hint: 'Pick any.' });
    expect(SETUP_QUESTIONS[0].choices.map(choice => choice.label)).toEqual(['Build daily habits', 'Take supplements, vitamins or skin care', 'Track enhancers or peptides', 'Track medications', 'Recover better', 'Just looking']);
    expect(SETUP_QUESTIONS.find(question => question.id === 'supply')?.title).toBe("Do you want to know when you're running low?");
    expect(SETUP_QUESTIONS.find(question => question.id === 'sleep')?.choices.map(choice => choice.label)).toEqual(['Before 10 PM', '10 PM to midnight', 'After midnight', 'In the morning, after a night shift', 'It varies']);
  });

  test('no question or choice suggests an amount', () => {
    const text = JSON.stringify([SETUP_QUESTIONS, ADDABLE_PARTS, SETUP_MESSAGES]);
    expect(text).not.toMatch(/recommended dose|should take|prescrib|typical dose|suggested dose|you should/i);
    expect(text).not.toMatch(/\d\s?(mg|mcg|iu|ml)\b/i);
  });

  test('unknown keys and values are dropped', () => {
    expect(normalizeSetupAnswers({ goals: ['habits', 'nope', 7], wake: 'noon', sleep: 'late', other: 'x', feel: ['next'] })).toEqual({ goals: ['habits'], sleep: 'late' });
    expect(normalizeSetupAnswers({ goals: ['recover', 'habits'] })).toEqual({ goals: ['habits', 'recover'] });
    expect(normalizeSetupAnswers({ goals: ['looking', 'habits'], watch: ['none', 'sleep'], track: ['meds', 'habits'] })).toEqual({ goals: ['looking'], track: ['habits'], watch: ['none'] });
    expect(normalizeSetupAnswers(null)).toEqual({});
    expect(normalizeSetupAnswers(['goals'])).toEqual({});
  });

  test('who is asked what', () => {
    expect(askedQuestions({ goals: ['looking'] })).toEqual(['goals', 'wake', 'sleep']);
    expect(askedQuestions({ goals: ['habits'] })).toEqual(['goals', 'experience', 'days', 'wake', 'sleep', 'train', 'track', 'enhancers', 'watch', 'home', 'feel']);
    expect(askedQuestions({ goals: ['enhancers'] })).toEqual(['goals', 'experience', 'days', 'wake', 'sleep', 'train', 'track', 'inject', 'count', 'supply', 'timing', 'watch', 'home', 'feel']);
    expect(askedQuestions({ goals: ['habits'], enhancers: 'yes' })).toContain('inject');
    expect(askedQuestions({ goals: ['habits'], track: ['meds'] })).toEqual(expect.arrayContaining(['count', 'supply', 'timing']));
    expect(askedQuestions({ goals: ['recover'] }).slice(0, 4)).toEqual(['goals', 'watch', 'home', 'experience']);
  });

  test('around workouts needs a training day', () => {
    expect(setupChoices('timing', { train: 'none' }).map(choice => choice.value)).toEqual(['waking', 'meals', 'bed', 'spread']);
    expect(setupChoices('timing', { train: '1-2' }).map(choice => choice.value)).toContain('workouts');
    expect(setupChoices('nope', {})).toEqual([]);
  });

  test('an answer reads back as its labels', () => {
    expect(setupAnswerText('goals', { goals: ['recover', 'habits'] })).toBe('Build daily habits, Recover better');
    expect(setupAnswerText('wake', { wake: '6-8' })).toBe('6 to 8 AM');
    expect(setupAnswerText('wake', {})).toBe('Not answered');
    expect(setupAnswerText('nope', {})).toBe('Not answered');
  });
});

describe('what the answers ask for', () => {
  test('windows follow the clock answers, except on shifts', () => {
    expect(setupWindow('morning', { wake: 'early' })).toEqual({ startMin: 300, endMin: 660 });
    expect(setupWindow('morning', { wake: 'late' })).toEqual({ startMin: 600, endMin: 960 });
    expect(setupWindow('night', { sleep: '10-12' })).toEqual({ startMin: 1260, endMin: 1380 });
    expect(setupWindow('night', { sleep: 'late' })).toEqual({ startMin: 1320, endMin: 1440 });
    expect(setupWindow('morning', { wake: 'varies' })).toBeNull();
    expect(setupWindow('morning', { wake: 'afternoon' })).toBeNull();
    expect(setupWindow('night', { sleep: 'morning' })).toBeNull();
    expect(setupWindow('morning', { wake: 'early', days: 'night' })).toBeNull();
    expect(setupWindow('night', { sleep: 'early', days: 'rotating' })).toBeNull();
  });

  test('two routines, renamed on shifts', () => {
    expect(setupBlocks({}).map(block => [block.id, block.name, block.color])).toEqual([[MORNING, 'Morning routine', 'citrus'], [NIGHT, 'Night routine', 'pink']]);
    expect(setupBlocks({ days: 'night' }).map(block => block.name)).toEqual(['Wake-up routine', 'Wind-down routine']);
    expect(setupBlocks({ days: 'night' }, 'skipped').map(block => block.name)).toEqual(['Morning routine', 'Night routine']);
  });

  test('type tabs come from what the person takes', () => {
    expect(setupTypeTabs(FULL)).toEqual(['supplement', 'peptide', 'enhancer']);
    expect(setupTypeTabs({ ...FULL, inject: 'no' })).toEqual(['supplement', 'enhancer']);
    expect(setupTypeTabs({ goals: ['meds'] })).toEqual(['medication']);
    expect(setupTypeTabs({ goals: ['meds'], track: ['habits'] })).toEqual([]);
    expect(setupTypeTabs({ goals: ['looking'] })).toEqual([]);
    expect(setupTypeTabs(FULL, 'skipped')).toEqual([]);
  });

  test('without a finished setup every part shows', () => {
    for (const prefs of [null, {}, { setup: { v: 1, status: 'skipped' as const, answers: {}, updatedAt: 2 } }]) {
      expect(setupShape(prefs)).toMatchObject({ doses: true, calculator: true, injection: true, supply: true, rest: true, tips: false, upFront: false, home: 'next', started: [] });
    }
    expect(setupShape(null).settled).toBe(false);
  });

  test('the shape of the page for a few people', () => {
    const shape = (answers: Record<string, unknown>) => setupShape(done(seeded(), answers).prefs);
    expect(shape({ goals: ['habits'], track: ['habits'], enhancers: 'no', train: 'none', experience: 'new' })).toMatchObject({ doses: false, calculator: false, injection: false, supply: false, rest: false, tips: true });
    expect(shape({ goals: ['supplements'], track: ['supplements'], enhancers: 'no', supply: 'no' })).toMatchObject({ doses: true, calculator: false, supply: false, rest: true });
    expect(shape({ goals: ['supplements'], track: ['supplements'], enhancers: 'no', supply: 'yes' }).supply).toBe(true);
    expect(shape({ goals: ['enhancers'], inject: 'no', supply: 'no' })).toMatchObject({ doses: true, calculator: false, injection: false, supply: true });
    expect(shape({ goals: ['enhancers'], inject: 'yes', count: '9+', watch: ['hrv', 'weight'], home: 'all' })).toMatchObject({ calculator: true, upFront: true, started: ['hrv', 'weight'], home: 'all' });
    expect(shape({ goals: ['looking'], wake: 'early' })).toMatchObject({ doses: true, calculator: true, rest: true, settled: true });
    expect(shape({ goals: ['habits'], experience: 'all', watch: ['none'] })).toMatchObject({ upFront: true, started: [] });
  });

  test('a tool already in use stays on screen', () => {
    const base = done(seeded(), { goals: ['habits'], track: ['habits'], enhancers: 'no', train: 'none' });
    expect(routineShows('doses', base)).toBe(false);
    expect(routineShows('calculator', base)).toBe(false);
    const dosed = must(saveItem(base, { name: 'Example Compound A', kind: 'dose', amount: '250', unit: 'mcg', blockIds: [MORNING] }, clock(6000), ids())).store;
    expect(routineShows('doses', dosed)).toBe(true);
    expect(routineShows('calculator', dosed)).toBe(true);
    expect(routineShows('injection', dosed)).toBe(true);
    expect(routineShows('rest', dosed)).toBe(false);
    expect(routineShows('rest', { ...dosed, logs: [{ id: 'l1', itemId: null, day: DAY, rest: true, updatedAt: 9, deletedAt: null } as never] })).toBe(true);
    expect(routineShows('doses', null)).toBe(true);
  });
});

describe('applying a setup', () => {
  test('a finished setup records the answers and sets the windows', () => {
    const store = done(seeded(), FULL);
    expect(readSetup(store.prefs)).toEqual({ status: 'done', answers: normalizeSetupAnswers(FULL) });
    expect(store.prefs.setup).toMatchObject({ v: 1, status: 'done', updatedAt: 5000 });
    expect(store.prefs.updatedAt).toBe(5000);
    expect(store.blocks.find(block => block.id === MORNING)).toMatchObject({ name: 'Morning routine', startMin: 360, endMin: 720, updatedAt: 5000 });
    expect(store.blocks.find(block => block.id === NIGHT)).toMatchObject({ startMin: 1260, endMin: 1380 });
    expect(store.prefs.typeTabs).toEqual(['supplement', 'peptide', 'enhancer']);
    expect(store.prefs.focusMode).toBeUndefined();
    expect(store.items).toEqual([]);
    expect(store.logs).toEqual([]);
  });

  test('it adds no check and no item', () => {
    const store = done(emptyRoutineStore(), FULL);
    expect(names(store)).toEqual(['Morning routine', 'Night routine']);
    expect(store.items).toEqual([]);
    expect(store.placements).toEqual([]);
    expect(store.compounds).toEqual([]);
    /* A new setup routine takes the seed stamp, so any edit beats it. */
    expect(store.blocks.every(block => block.updatedAt === DEFAULT_BLOCK_STAMP)).toBe(true);
    expect(store.blocks.map(block => block.startMin)).toEqual([360, 1260]);
  });

  test('skip records the choice and leaves every routine alone', () => {
    const before = seeded();
    const store = must(applySetup(before, { status: 'skipped', answers: FULL, at: 5000 }));
    expect(store.blocks).toEqual(before.blocks);
    expect(readSetup(store.prefs)).toEqual({ status: 'skipped', answers: {} });
    expect(store.prefs.typeTabs).toBeUndefined();
    expect(setupOffered(store.prefs)).toBe(false);
    expect(setupOffered(before.prefs)).toBe(true);
    expect(must(applySetup(emptyRoutineStore(), { status: 'skipped', at: 5000 })).blocks).toEqual([]);
  });

  test('a bad status or time is refused', () => {
    expect(applySetup(seeded(), { status: 'later', answers: {}, at: 5000 })).toBeNull();
    expect(applySetup(seeded(), { status: 'done', answers: {}, at: NaN })).toBeNull();
    expect(applySetup(null, { status: 'done', answers: {}, at: 5000 })).toBeNull();
  });

  test('shifts rename an untouched routine and keep the default windows', () => {
    const store = done(seeded(), { goals: ['habits'], days: 'night', wake: 'early', sleep: 'early' });
    expect(names(store)).toEqual(['Wake-up routine', 'Wind-down routine']);
    expect(store.blocks.every(block => block.startMin === undefined)).toBe(true);
    const back = done(store, { goals: ['habits'], days: 'regular' }, 7000);
    expect(names(back)).toEqual(['Morning routine', 'Night routine']);
  });

  test('a routine the user made their own keeps its name and times', () => {
    const renamed = must(renameBlock(seeded(), MORNING, 'Zzyq Start', clock(3000)));
    const placed = must(saveItem(renamed, { name: 'Example Check', kind: 'check', blockIds: [NIGHT] }, clock(3001), ids())).store;
    const store = done(placed, { goals: ['habits'], days: 'night', wake: 'early' });
    expect(names(store)).toEqual(['Zzyq Start', 'Night routine']);
    const timed = { ...seeded(), blocks: seeded().blocks.map(block => (block.id === MORNING ? { ...block, startMin: 420, endMin: 600, updatedAt: 3000 } : block)) };
    expect(done(timed, FULL).blocks.find(block => block.id === MORNING)).toMatchObject({ startMin: 420, endMin: 600, updatedAt: 3000 });
  });

  test('a deleted routine stays deleted', () => {
    const gone = must(deleteBlock(seeded(), NIGHT, clock(3000)));
    expect(names(done(gone, FULL))).toEqual(['Morning routine']);
    /* A saved delete keeps no row on the phone, so the screen names it. */
    const reread = { ...seeded(), blocks: seeded().blocks.filter(block => block.id !== NIGHT) };
    expect(names(done(reread, FULL, 5000, { removed: [NIGHT] }))).toEqual(['Morning routine']);
    expect(names(done(reread, FULL))).toEqual(['Morning routine', 'Night routine']);
  });

  test('a hidden routine stays hidden and a user routine is never removed', () => {
    const own = must(saveItem(seeded(), { name: 'Example Check', kind: 'check', blockIds: [MORNING] }, clock(3000), ids())).store;
    const hidden = must(hideBlock(own, NIGHT, clock(3001)));
    const extra = { ...hidden, blocks: [...hidden.blocks, { id: '00000009-0000-4000-8000-000000000001', name: 'Zzyq Midday Block', color: 'lavender', order: 2, updatedAt: 3002, deletedAt: null }] };
    const store = done(extra, { goals: ['looking'] });
    expect(names(store)).toEqual(['Morning routine', 'Zzyq Midday Block']);
    expect(must(projectRoutineStore(store)).hiddenBlocks.map(block => block.id)).toEqual([NIGHT]);
    expect(liveOf(store.items)).toHaveLength(1);
    expect(liveOf(store.placements)).toHaveLength(1);
  });

  test('just what is next turns Focus mode on, and a retake leaves a hand change alone', () => {
    const first = done(seeded(), { ...FULL, feel: 'next' });
    expect(first.prefs.focusMode).toBe(true);
    const off = must(toggleFocus(first, clock(6000)));
    expect(off.prefs.focusMode).toBeUndefined();
    expect(off.prefs.updatedAt).toBe(6000);
    expect(done(off, { ...FULL, feel: 'next' }, 7000, { touched: ['wake'] }).prefs.focusMode).toBeUndefined();
    expect(done(off, { ...FULL, feel: 'next' }, 7000, { touched: ['feel'] }).prefs.focusMode).toBe(true);
    expect(done(first, { ...FULL, feel: 'all' }, 7000).prefs.focusMode).toBeUndefined();
  });

  test('nine or more a day folds the routines, except the current one', () => {
    const answers = { ...FULL, count: '9+' };
    expect(done(seeded(), answers).prefs.collapsedBlocks).toEqual([MORNING, NIGHT]);
    expect(done(seeded(), answers, 5000, { keepOpen: () => MORNING }).prefs.collapsedBlocks).toEqual([NIGHT]);
    expect(done(seeded(), answers, 5000, { touched: ['feel'] }).prefs.collapsedBlocks).toBeUndefined();
    const morning = must(saveSetup(seeded(), { status: 'done', answers }, clock(5000), new Date(2026, 10, 22, 8, 15)));
    expect(morning.prefs.collapsedBlocks).toEqual([NIGHT]);
    expect(morning.prefs.setup?.updatedAt).toBe(5000);
    expect(saveSetup(seeded(), { status: 'later' }, clock(), new Date(2026, 10, 22, 8, 15))).toBeNull();
    expect(saveSetup(seeded(), { status: 'done', answers }, { now: NaN, day: DAY }, new Date(2026, 10, 22, 8, 15))).toBeNull();
  });

  test('a later setup always stamps after the one before', () => {
    const first = done(seeded(), FULL, 5000);
    const second = done(first, { ...FULL, wake: 'early' }, 4000);
    expect(second.prefs.updatedAt).toBeGreaterThan(first.prefs.updatedAt);
    /* The window set by the first pass counts as the user's own after that. */
    expect(second.blocks.find(block => block.id === MORNING)).toMatchObject({ startMin: 360 });
  });
});

describe('adding a part from settings', () => {
  const quiet = () => done(seeded(), { goals: ['habits'], track: ['habits'], enhancers: 'no', train: 'none' });

  test('each part with its label and whether it is on the page', () => {
    const store = quiet();
    const parts = routineParts(store, feature => routineShows(feature, store));
    expect(parts.map(part => [part.key, part.label, part.present])).toEqual([
      ['morning', 'Morning routine', true], ['night', 'Night routine', true],
      ['supplements', 'Supplements tab', false], ['enhancers', 'Peptides and Enhancers tabs', false], ['meds', 'Medications tab', false],
      ['doses', 'Dose amounts', false], ['calculator', 'Concentration converter', false], ['rest', 'Rest day button', false], ['tips', 'Getting started tips', false],
    ]);
    expect(parts.find(part => part.key === 'calculator')?.hint).toBe('Works out the arithmetic for a vial you mix.');
    expect(parts.find(part => part.key === 'enhancers')?.hint).toBe('Peptides and Enhancers tabs, with dose amounts, the converter and supply.');
    expect(parts.find(part => part.key === 'morning')?.hint).toBe('Habits and checks for the start of the day.');
    const shift = done(seeded(), { goals: ['habits'], days: 'rotating' });
    expect(routineParts(shift, () => true).slice(0, 2).map(part => part.label)).toEqual(['Wake-up routine', 'Wind-down routine']);
  });

  test('a type part turns on its tabs and the tools it needs', () => {
    const store = must(addRoutinePart(quiet(), 'enhancers', clock(6000)));
    expect(store.prefs.typeTabs).toEqual(['peptide', 'enhancer']);
    expect(store.prefs.added).toEqual(['doses', 'calculator', 'injection', 'supply']);
    expect(store.prefs.updatedAt).toBe(6000);
    for (const feature of ['doses', 'calculator', 'injection', 'supply']) expect(routineSetupShows(store.prefs, feature)).toBe(true);
    expect(routineSetupShows(store.prefs, 'rest')).toBe(false);
    const more = must(addRoutinePart(store, 'meds', clock(6001)));
    expect(more.prefs.typeTabs).toEqual(['peptide', 'enhancer', 'medication']);
    expect(routineParts(more, feature => routineShows(feature, more)).filter(part => part.present).map(part => part.key)).toEqual(['morning', 'night', 'enhancers', 'meds', 'doses', 'calculator']);
  });

  test('a tool part only turns on, and tips come back', () => {
    const rest = must(addRoutinePart(quiet(), 'rest', clock(6000)));
    expect(rest.prefs.added).toEqual(['rest']);
    const hidden = must(hideTips(must(addRoutinePart(rest, 'tips', clock(6001))), clock(6002)));
    expect(hidden.prefs.tipsHidden).toBe(true);
    expect(hideTips(hidden, clock(6003))).toBeNull();
    expect(routineParts(hidden, feature => routineShows(feature, hidden)).find(part => part.key === 'tips')?.present).toBe(false);
    const back = must(addRoutinePart(hidden, 'tips', clock(6004)));
    expect(back.prefs.tipsHidden).toBeUndefined();
    expect(routineParts(back, feature => routineShows(feature, back)).find(part => part.key === 'tips')?.present).toBe(true);
    expect(addRoutinePart(quiet(), 'nope', clock())).toBeNull();
    expect(addRoutinePart(quiet(), 'rest', { now: NaN, day: DAY })).toBeNull();
  });

  test('a hidden routine is shown again with its items', () => {
    const own = must(saveItem(quiet(), { name: 'Example Check', kind: 'check', blockIds: [NIGHT] }, clock(6000), ids())).store;
    const hidden = must(hideBlock(own, NIGHT, clock(6001)));
    expect(routineParts(hidden, () => false).find(part => part.key === 'night')?.present).toBe(false);
    const back = must(addRoutinePart(hidden, 'night', clock(6002)));
    expect(names(back)).toEqual(['Morning routine', 'Night routine']);
    expect(must(projectRoutineStore(back)).placements.filter(place => place.blockId === NIGHT)).toHaveLength(1);
  });

  test('a deleted routine comes back, empty once the delete was saved', () => {
    const own = must(saveItem(quiet(), { name: 'Example Check', kind: 'check', blockIds: [NIGHT] }, clock(6000), ids())).store;
    const gone = must(deleteBlock(own, NIGHT, clock(6001)));
    expect(names(must(addRoutinePart(gone, 'night', clock(6002))))).toEqual(['Morning routine', 'Night routine']);
    const reread = { ...own, blocks: own.blocks.filter(block => block.id !== NIGHT), placements: [] };
    const back = must(addRoutinePart(reread, 'night', clock(6002)));
    expect(back.blocks.find(block => block.id === NIGHT)).toMatchObject({ name: 'Night routine', color: 'pink', order: 1, deletedAt: null });
    expect(must(projectRoutineStore(back)).placements).toEqual([]);
    /* A routine already on the page is left as it is. */
    expect(must(addRoutinePart(back, 'night', clock(6003))).blocks).toEqual(back.blocks);
  });
});

describe('the setup sheet', () => {
  const walk = (draft: SetupDraft, picks: [string, string | string[]][]) => {
    let finished = false;
    for (const [id, value] of picks) {
      expect(draft.step).toBe(id);
      if (Array.isArray(value)) {
        for (const key of value) draft = must(pickSetupAnswer(draft, id, key)).draft;
        const step = must(nextSetupStep(draft));
        draft = step.draft; finished = step.finished;
      } else {
        const step = must(pickSetupAnswer(draft, id, value));
        draft = step.draft; finished = step.finished;
      }
    }
    return { draft, finished };
  };

  test('one question at a time, to the end', () => {
    const start = openSetupDraft(null);
    expect(start).toEqual({ mode: 'quiz', step: 'goals', answers: {} });
    expect(nextSetupStep(start)).toBeNull();
    const { draft, finished } = walk(start, [['goals', ['looking']], ['wake', '6-8'], ['sleep', 'late']]);
    expect(finished).toBe(true);
    expect(finishSetup(draft, null, 'done')).toEqual({ status: 'done', answers: { goals: ['looking'], wake: '6-8', sleep: 'late' }, touched: null });
    expect(finishSetup(draft, null, 'skipped')).toEqual({ status: 'skipped', answers: {}, touched: null });
  });

  test('pick any toggles, and the exclusive choice clears the rest', () => {
    let draft = openSetupDraft(null);
    draft = must(pickSetupAnswer(draft, 'goals', 'habits')).draft;
    draft = must(pickSetupAnswer(draft, 'goals', 'recover')).draft;
    expect(draft.answers.goals).toEqual(['habits', 'recover']);
    draft = must(pickSetupAnswer(draft, 'goals', 'looking')).draft;
    expect(draft.answers.goals).toEqual(['looking']);
    draft = must(pickSetupAnswer(draft, 'goals', 'meds')).draft;
    expect(draft.answers.goals).toEqual(['meds']);
    draft = must(pickSetupAnswer(draft, 'goals', 'meds')).draft;
    expect(draft.answers.goals).toBeUndefined();
    expect(draft.step).toBe('goals');
    expect(pickSetupAnswer(draft, 'goals', 'nope')).toBeNull();
    expect(pickSetupAnswer(draft, 'wake', 'early')).toBeNull();
    expect(pickSetupAnswer(null, 'goals', 'habits')).toBeNull();
  });

  test('back and skip this question', () => {
    const { draft } = walk(openSetupDraft(null), [['goals', ['habits']], ['experience', 'new']]);
    expect(draft.step).toBe('days');
    expect(must(backSetupStep(draft)).step).toBe('experience');
    expect(backSetupStep(openSetupDraft(null))).toBeNull();
    const skipped = must(skipSetupQuestion({ ...draft, step: 'experience' }));
    expect(skipped.draft.step).toBe('days');
    expect(skipped.draft.answers.experience).toBeUndefined();
    expect(must(skipSetupQuestion({ ...draft, step: 'feel' })).finished).toBe(true);
  });

  test('an answer left behind by an earlier pick is dropped', () => {
    expect(pruneSetupAnswers({ goals: ['looking'], wake: 'early', inject: 'yes', count: '9+', feel: 'next' })).toEqual({ goals: ['looking'], wake: 'early' });
    expect(pruneSetupAnswers({ goals: ['supplements'], train: 'none', timing: ['workouts', 'bed'] })).toEqual({ goals: ['supplements'], train: 'none', timing: ['bed'] });
    expect(pruneSetupAnswers({ goals: ['supplements'], train: 'none', timing: ['workouts'] })).toEqual({ goals: ['supplements'], train: 'none' });
  });

  test('a closed first pass keeps its place, and a retake starts from the saved answers', () => {
    const part = walk(openSetupDraft(null), [['goals', ['habits']]]).draft;
    expect(openSetupDraft(null, 'quiz', part)).toBe(part);
    const saved = done(seeded(), { ...FULL, feel: 'next' });
    const retake = openSetupDraft(saved.prefs, 'retake', part);
    expect(retake).toEqual({ mode: 'retake', step: 'goals', answers: normalizeSetupAnswers({ ...FULL, feel: 'next' }) });
    expect(openSetupDraft(saved.prefs, 'quiz', retake)).toEqual({ mode: 'quiz', step: 'goals', answers: {} });
    const changed = { ...retake, answers: { ...retake.answers, wake: 'early', home: 'all' } };
    expect(finishSetup(changed, saved.prefs, 'done').touched?.sort()).toEqual(['home', 'wake']);
    expect(finishSetup(retake, saved.prefs, 'done').touched).toEqual([]);
  });

  test('the messages are the web ones', () => {
    expect(SETUP_MESSAGES).toEqual({
      failed: "Your setup couldn't be saved right now. Try again in a moment.",
      retaken: 'Setup saved. Nothing was removed.',
      done: 'Your Routines page is set up.',
      skipped: 'Setup skipped. You can set up your page from Routines settings.',
    });
  });
});
