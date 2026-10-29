import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { act, renderHook } from '@testing-library/react-native';
import {
  DEFAULT_LAYOUT, SERVICES, WIDGETS, addWidget, connectService, createHomeWidgetStore, defaultHomeWidgetState,
  isUnlocked, markGlowSeen, moveWidget, openEdit, removeWidget, shouldGlow, trayItems, type WidgetId,
} from '../src/features/home-widgets';
import { HOME_WIDGETS_KEY, loadHomeWidgets } from '../src/features/home-widgets/storage';
import { useHomeWidgets } from '../src/features/home-widgets/use-home-widgets';
import { memoryRepository } from './workout-repository';

const ids = WIDGETS.map(widget => widget.id);
const trayIds = (state = defaultHomeWidgetState()) => trayItems(state).map(item => item.id);

describe('widget registry', () => {
  it('has unique ids and sentence-case titles', () => {
    expect(new Set(ids).size).toBe(ids.length);
    for (const widget of WIDGETS) expect(widget.title).toMatch(/^[A-Z][^A-Z]*$/);
  });
  it('defaults are service-free and match the I9a starting Home', () => {
    expect(DEFAULT_LAYOUT).toEqual(['bodyMap', 'insightScore', 'todayWorkout', 'foodRing']);
    expect(WIDGETS.filter(widget => widget.defaultOnHome).map(widget => widget.id)).toEqual(DEFAULT_LAYOUT);
    for (const widget of WIDGETS.filter(item => item.defaultOnHome)) expect(widget.requiredService).toBeNull();
  });
  it('gives every service at least one widget', () => {
    for (const service of SERVICES) expect(WIDGETS.some(widget => widget.requiredService === service)).toBe(true);
  });
});

describe('layout', () => {
  it('starts with the default layout, Insight Score on (I8)', () => {
    const state = defaultHomeWidgetState();
    expect(state.layout).toEqual(DEFAULT_LAYOUT);
    expect(state.layout).toContain('insightScore');
    expect(state.editDot).toBe(false);
  });
  it('puts every non-default widget in the tray, service widgets locked until connected', () => {
    const state = defaultHomeWidgetState();
    expect(trayIds(state).sort()).toEqual(ids.filter(id => !DEFAULT_LAYOUT.includes(id)).sort());
    for (const item of trayItems(state)) {
      const widget = WIDGETS.find(entry => entry.id === item.id)!;
      expect(item.locked).toBe(widget.requiredService !== null);
    }
  });
  it('adds, removes and reorders; removed widgets return to the tray', () => {
    let state = addWidget(defaultHomeWidgetState(), 'yourWeek');
    expect(state.layout).toEqual([...DEFAULT_LAYOUT, 'yourWeek']);
    expect(trayIds(state)).not.toContain('yourWeek');
    expect(addWidget(state, 'yourWeek').layout).toEqual(state.layout);
    state = moveWidget(state, 4, 0);
    expect(state.layout).toEqual(['yourWeek', ...DEFAULT_LAYOUT]);
    expect(moveWidget(state, 0, 99)).toBe(state);
    state = removeWidget(state, 'bodyMap');
    expect(state.layout).toEqual(['yourWeek', 'insightScore', 'todayWorkout', 'foodRing']);
    expect(trayIds(state)).toContain('bodyMap');
  });
  it('refuses to add a locked widget', () => {
    const state = defaultHomeWidgetState();
    expect(addWidget(state, 'ouraSleepScore')).toBe(state);
  });
});

describe('service unlock', () => {
  it.each(SERVICES)('%s unlocks only its own widgets', service => {
    const { state, unlocked } = connectService(defaultHomeWidgetState(), service);
    const expected = WIDGETS.filter(widget => widget.requiredService === service).map(widget => widget.id);
    expect(unlocked).toEqual(expected);
    for (const widget of WIDGETS) {
      expect(isUnlocked(state, widget.id)).toBe(widget.requiredService === null || widget.requiredService === service);
    }
    expect(state.layout).toEqual(DEFAULT_LAYOUT);
  });
  it('returns nothing new on reconnect and leaves the dot alone', () => {
    const first = connectService(defaultHomeWidgetState(), 'oura');
    const opened = openEdit(first.state);
    const again = connectService(opened, 'oura');
    expect(again.unlocked).toEqual([]);
    expect(again.state.editDot).toBe(false);
  });
  it('sets the edit dot on unlock and clears it when Edit opens', () => {
    const { state } = connectService(defaultHomeWidgetState(), 'appleHealth');
    expect(state.editDot).toBe(true);
    expect(openEdit(state).editDot).toBe(false);
  });
});

describe('glow once', () => {
  it('glows newly unlocked widgets until each is marked seen', () => {
    const { state, unlocked } = connectService(defaultHomeWidgetState(), 'oura');
    for (const id of unlocked) expect(shouldGlow(state, id)).toBe(true);
    expect(shouldGlow(state, 'yourWeek')).toBe(false);
    const [first, ...rest] = unlocked;
    const seen = markGlowSeen(state, first);
    expect(shouldGlow(seen, first)).toBe(false);
    for (const id of rest) expect(shouldGlow(seen, id)).toBe(true);
    expect(trayItems(seen).find(item => item.id === first)?.glow).toBe(false);
  });
  it('never glows again after seen, even across reconnects', () => {
    let state = connectService(defaultHomeWidgetState(), 'oura').state;
    for (const id of WIDGETS.filter(widget => widget.requiredService === 'oura').map(widget => widget.id)) state = markGlowSeen(state, id);
    state = connectService(state, 'oura').state;
    for (const id of WIDGETS.filter(widget => widget.requiredService === 'oura').map(widget => widget.id)) expect(shouldGlow(state, id)).toBe(false);
  });
});

describe('persistence', () => {
  it('round-trips through the local storage helper', () => {
    const repo = memoryRepository();
    const store = createHomeWidgetStore(repo);
    const unlocked = store.connectService('oura');
    store.markGlowSeen(unlocked[0]);
    store.add(unlocked[1]);
    const reloaded = createHomeWidgetStore(repo).getState();
    expect(reloaded.services).toEqual(['oura']);
    expect(reloaded.editDot).toBe(true);
    expect(shouldGlow(reloaded, unlocked[0])).toBe(false);
    expect(reloaded.layout).toEqual([...DEFAULT_LAYOUT, unlocked[1]]);
    store.openEdit();
    expect(createHomeWidgetStore(repo).getState().editDot).toBe(false);
  });
  it('falls back to defaults and drops unknown or locked ids from bad saved data', () => {
    const repo = memoryRepository();
    expect(loadHomeWidgets(repo)).toEqual(defaultHomeWidgetState());
    repo.localSave(HOME_WIDGETS_KEY, 'nonsense');
    expect(loadHomeWidgets(repo)).toEqual(defaultHomeWidgetState());
    repo.localSave(HOME_WIDGETS_KEY, { layout: ['bodyMap', 'gone', 'bodyMap', 'whoopRecovery'], services: ['oura', 'myspace'], editDot: 'yes', glowPending: ['ouraSleepScore', 7], glowSeen: [] });
    const state = loadHomeWidgets(repo);
    expect(state.layout).toEqual(['bodyMap']);
    expect(state.services).toEqual(['oura']);
    expect(state.editDot).toBe(false);
    expect(state.glowPending).toEqual(['ouraSleepScore']);
  });
  it('keeps working in memory when there is no repository yet', () => {
    const store = createHomeWidgetStore(null);
    expect(store.connectService('fitbit').length).toBeGreaterThan(0);
    expect(store.getState().editDot).toBe(true);
  });
});

describe('useHomeWidgets', () => {
  it('exposes state and actions and re-renders on change', async () => {
    const repo = memoryRepository();
    const { result } = await renderHook(() => useHomeWidgets(repo));
    expect(result.current.layout).toEqual(DEFAULT_LAYOUT);
    expect(result.current.editDot).toBe(false);
    let unlocked: WidgetId[] = [];
    await act(async () => { unlocked = result.current.connectService('appleHealth'); });
    expect(unlocked.length).toBeGreaterThan(0);
    expect(result.current.editDot).toBe(true);
    expect(result.current.tray.find(item => item.id === unlocked[0])).toMatchObject({ locked: false, glow: true });
    await act(async () => { result.current.openEdit(); result.current.markGlowSeen(unlocked[0]); });
    expect(result.current.editDot).toBe(false);
    expect(result.current.tray.find(item => item.id === unlocked[0])?.glow).toBe(false);
    await act(async () => { result.current.remove('foodRing'); });
    expect(result.current.layout).not.toContain('foodRing');
  });
});

describe('no pop-ups (I9b)', () => {
  it('uses no Alert or Modal APIs', () => {
    const dir = join(__dirname, '../src/features/home-widgets');
    for (const file of readdirSync(dir)) {
      const source = readFileSync(join(dir, file), 'utf8');
      expect(source).not.toMatch(/\bAlert\b|\bModal\b|\balert\(/);
    }
  });
});
