import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { StyleSheet } from 'react-native';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react-native';
import {
  CATALOGUE, DEFAULT_LAYOUT, HomeWidgetCard, SERVICES, WIDGETS, addWidget, connectService, createHomeWidgetStore, defaultHomeWidgetState,
  disconnectService, getWidget, homeItems, isAvailable, homeWidgetStoreFor, isUnlocked, markGlowSeen, moveWidget, openEdit, removeWidget,
  shouldGlow, trayItems, type ServiceId, type WidgetId,
} from '../src/features/home-widgets';
import { HOME_WIDGETS_KEY, loadHomeWidgets } from '../src/features/home-widgets/storage';
import { useHomeWidgets } from '../src/features/home-widgets/use-home-widgets';
import { completeSignOut } from '../src/auth/sign-out';
import { memoryRepository } from './workout-repository';

const ownedBy = (owner: string) => Object.assign(memoryRepository(), { owner });
/** Two repository objects over one synthetic storage, as a re-created repository for the same owner would be. */
const sharedStorage = (owner: string) => {
  const first = ownedBy(owner);
  const second = { owner, localGet: first.localGet, localSave: first.localSave };
  return { first, second };
};
const ids = WIDGETS.map(widget => widget.id);
const trayIds = (state = defaultHomeWidgetState()) => trayItems(state).map(item => item.id);
const idsFor = (service: ServiceId) => WIDGETS.filter(widget => widget.available && (widget.services as readonly ServiceId[]).includes(service)).map(widget => widget.id);

/** REDESIGN.md §2.3 (PR #117 @ 00cc944), id → title. */
const SPEC_CATALOGUE: Record<string, string> = {
  bodyMap: 'Body map', insightScore: 'Insight Score', todayWorkout: "Today's workout", foodRing: 'Food', water: 'Water',
  weekStrip: "This week's days", brief: 'Brief', yourWeek: 'Your week', headline: 'Daily headline', pattern: "Today's pattern",
  weeklyGoal: 'Weekly goal', weeklyReport: 'Weekly report', trendChips: 'Trend chips', foodYesterday: "Yesterday's food",
  weightTrend: 'Weight trend', cardio: 'Cardio', cardioMinutes: 'Cardio minutes', musclesWeek: 'Muscles this week',
  workoutPrint: 'Workout print', checkIn: 'Check in', steps: 'Steps', sleepDuration: 'Sleep duration', hrv: 'HRV',
  sleepScore: 'Sleep score', readiness: 'Readiness', lastNight: 'Last night', restingHr: 'Resting heart rate',
};
const HEALTH_OR_OURA = ['steps', 'sleepDuration', 'hrv'];
const OURA_ONLY = ['sleepScore', 'readiness', 'lastNight', 'restingHr'];
const HIDDEN = ['water', 'checkIn', 'fitbitActivity', 'whoopRecovery'];

describe('widget registry', () => {
  it('matches the §2.3 catalogue exactly: 27 ids and titles', () => {
    expect(Object.keys(SPEC_CATALOGUE)).toHaveLength(27);
    expect(CATALOGUE.map(widget => widget.id).sort()).toEqual(Object.keys(SPEC_CATALOGUE).sort());
    for (const widget of CATALOGUE) expect(widget.title).toBe(SPEC_CATALOGUE[widget.id]);
  });
  it('adds only the Fitbit and WHOOP stubs beyond the catalogue, both unavailable', () => {
    expect(ids).toHaveLength(new Set(ids).size);
    const stubs = WIDGETS.filter(widget => !(widget.id in SPEC_CATALOGUE));
    expect(stubs.map(widget => widget.id).sort()).toEqual(['fitbitActivity', 'whoopRecovery']);
    for (const stub of stubs) expect(stub.available).toBe(false);
  });
  it('requires services per §2.3, as an any-of list', () => {
    for (const widget of CATALOGUE) {
      const expected = HEALTH_OR_OURA.includes(widget.id) ? ['appleHealth', 'oura'] : OURA_ONLY.includes(widget.id) ? ['oura'] : [];
      expect([...widget.services].sort()).toEqual(expected);
    }
  });
  it('hides exactly water, checkIn and the stubs', () => {
    expect(WIDGETS.filter(widget => !widget.available).map(widget => widget.id).sort()).toEqual([...HIDDEN].sort());
  });
  it('defaults are service-free and match the I9a starting Home', () => {
    expect(DEFAULT_LAYOUT).toEqual(['bodyMap', 'insightScore', 'todayWorkout', 'foodRing']);
    expect(WIDGETS.filter(widget => widget.defaultOnHome).map(widget => widget.id)).toEqual(DEFAULT_LAYOUT);
    for (const widget of WIDGETS.filter(item => item.defaultOnHome)) expect(widget.services).toEqual([]);
  });
  it('gives every service at least one widget', () => {
    for (const service of SERVICES) expect(WIDGETS.some(widget => (widget.services as readonly ServiceId[]).includes(service))).toBe(true);
  });
  it('returns undefined for an unknown id instead of throwing', () => {
    expect(getWidget('gone' as WidgetId)).toBeUndefined();
    expect(isUnlocked(defaultHomeWidgetState(), 'gone' as WidgetId)).toBe(false);
  });
});

describe('layout', () => {
  it('starts with the default layout, Insight Score on (I8)', () => {
    const state = defaultHomeWidgetState();
    expect(state.layout).toEqual(DEFAULT_LAYOUT);
    expect(state.layout).toContain('insightScore');
    expect(state.editDot).toBe(false);
  });
  it('puts every available non-default widget in the tray, service widgets locked until connected', () => {
    const state = defaultHomeWidgetState();
    const expected = WIDGETS.filter(widget => widget.available && !DEFAULT_LAYOUT.includes(widget.id)).map(widget => widget.id);
    expect(trayIds(state).sort()).toEqual(expected.sort());
    for (const item of trayItems(state)) expect(item.locked).toBe(getWidget(item.id)!.services.length > 0);
  });
  it('filters hidden widgets out of the tray rather than showing them locked', () => {
    let state = defaultHomeWidgetState();
    for (const service of SERVICES) state = connectService(state, service).state;
    for (const id of HIDDEN) expect(trayIds(state)).not.toContain(id);
    for (const id of HIDDEN) expect(addWidget(state, id as WidgetId)).toBe(state);
  });
  it('keeps checkIn out of the tray until the egress tests carry mood/energy/stress sentinels (AGENTS.md rule 6)', () => {
    expect(getWidget('checkIn')?.available).toBe(false);
    expect(WIDGETS.filter(widget => widget.available).map(widget => widget.id)).not.toContain('checkIn');
    expect(isAvailable('checkIn')).toBe(false);
    expect(trayItems(connectService(connectService(defaultHomeWidgetState(), 'oura').state, 'appleHealth').state).map(item => item.id)).not.toContain('checkIn');
    expect(trayIds()).not.toContain('checkIn');
    expect(addWidget(defaultHomeWidgetState(), 'checkIn').layout).not.toContain('checkIn');
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
    expect(addWidget(state, 'sleepScore')).toBe(state);
  });
});

describe('service unlock', () => {
  it.each(SERVICES)('%s unlocks only its own available widgets', service => {
    const { state, unlocked } = connectService(defaultHomeWidgetState(), service);
    expect(unlocked).toEqual(idsFor(service));
    for (const widget of WIDGETS) {
      const services = widget.services as readonly ServiceId[];
      expect(isUnlocked(state, widget.id)).toBe(services.length === 0 || services.includes(service));
    }
    expect(state.layout).toEqual(DEFAULT_LAYOUT);
  });
  it('unlocks any-of widgets with either Apple Health or Oura', () => {
    const health = connectService(defaultHomeWidgetState(), 'appleHealth');
    expect(health.unlocked.sort()).toEqual([...HEALTH_OR_OURA].sort());
    for (const id of OURA_ONLY) expect(isUnlocked(health.state, id as WidgetId)).toBe(false);
    const oura = connectService(defaultHomeWidgetState(), 'oura');
    expect(oura.unlocked.sort()).toEqual([...HEALTH_OR_OURA, ...OURA_ONLY].sort());
  });
  it('reports only newly unlocked widgets when a second service covers some already', () => {
    const health = connectService(defaultHomeWidgetState(), 'appleHealth').state;
    const { unlocked } = connectService(health, 'oura');
    expect(unlocked.sort()).toEqual([...OURA_ONLY].sort());
  });
  it('stub services unlock nothing visible and set no dot', () => {
    for (const service of ['fitbit', 'whoop'] as const) {
      const { state, unlocked } = connectService(defaultHomeWidgetState(), service);
      expect(unlocked).toEqual([]);
      expect(state.editDot).toBe(false);
    }
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

describe('disconnect', () => {
  it('keeps a placed widget in position while locked, and it returns there on reconnect (F3)', () => {
    let state = connectService(defaultHomeWidgetState(), 'oura').state;
    state = addWidget(state, 'sleepScore');
    state = moveWidget(state, 4, 1);
    const placed = ['bodyMap', 'sleepScore', 'insightScore', 'todayWorkout', 'foodRing'];
    expect(state.layout).toEqual(placed);
    state = disconnectService(state, 'oura');
    expect(state.services).toEqual([]);
    expect(state.layout).toEqual(placed);
    expect(homeItems(state).find(item => item.id === 'sleepScore')).toMatchObject({ id: 'sleepScore', title: 'Sleep score', locked: true });
    expect(trayIds(state)).not.toContain('sleepScore');
    state = connectService(state, 'oura').state;
    expect(state.layout).toEqual(placed);
    expect(homeItems(state).every(item => !item.locked)).toBe(true);
  });
  it('shows a disconnected Oura widget on Home, grayed, with "Oura disconnected" and Reconnect (§2.5, FP73)', () => {
    let state = connectService(defaultHomeWidgetState(), 'oura').state;
    state = addWidget(addWidget(state, 'readiness'), 'steps');
    expect(homeItems(state).every(item => item.disconnected === null)).toBe(true);
    state = disconnectService(state, 'oura');
    const home = homeItems(state);
    expect(home.map(item => item.id)).toEqual([...DEFAULT_LAYOUT, 'readiness', 'steps']);
    for (const id of ['readiness', 'steps']) {
      expect(home.find(item => item.id === id)).toMatchObject({
        locked: true, disconnected: { service: 'oura', message: 'Oura disconnected', action: 'Reconnect' },
      });
    }
    for (const item of home.filter(entry => DEFAULT_LAYOUT.includes(entry.id))) expect(item.disconnected).toBeNull();
  });
  it('names Apple Health, not Oura, for an Apple-Health-only user who disconnects (F7)', () => {
    let state = addWidget(connectService(defaultHomeWidgetState(), 'appleHealth').state, 'steps');
    state = disconnectService(state, 'appleHealth');
    expect(homeItems(state).find(item => item.id === 'steps')).toMatchObject({
      locked: true, disconnected: { service: 'appleHealth', message: 'Apple Health disconnected', action: 'Reconnect' },
    });
  });
  it('keeps the Apple Health target after a reload, and clears it on reconnect (F7)', () => {
    const repo = memoryRepository();
    const store = createHomeWidgetStore(repo);
    store.connectService('appleHealth');
    store.add('steps');
    store.disconnectService('appleHealth');
    const reloaded = createHomeWidgetStore(repo);
    expect(homeItems(reloaded.getState()).find(item => item.id === 'steps')?.disconnected).toMatchObject({ service: 'appleHealth', message: 'Apple Health disconnected' });
    reloaded.connectService('appleHealth');
    expect(homeItems(createHomeWidgetStore(repo).getState()).find(item => item.id === 'steps')).toMatchObject({ locked: false, disconnected: null });
  });
  it('targets the service most recently dropped when a user had both (F7)', () => {
    let state = addWidget(connectService(connectService(defaultHomeWidgetState(), 'oura').state, 'appleHealth').state, 'steps');
    state = disconnectService(disconnectService(state, 'oura'), 'appleHealth');
    expect(homeItems(state).find(item => item.id === 'steps')?.disconnected?.service).toBe('appleHealth');
  });
  it('clears the disconnected state on reconnect, keeping the slot', () => {
    let state = addWidget(connectService(defaultHomeWidgetState(), 'oura').state, 'lastNight');
    state = connectService(disconnectService(state, 'oura'), 'oura').state;
    expect(homeItems(state).find(item => item.id === 'lastNight')).toMatchObject({ locked: false, disconnected: null });
  });
  it('keeps an any-of widget unlocked while another of its services stays connected', () => {
    let state = connectService(defaultHomeWidgetState(), 'appleHealth').state;
    state = connectService(state, 'oura').state;
    state = disconnectService(state, 'oura');
    expect(isUnlocked(state, 'steps')).toBe(true);
    expect(isUnlocked(state, 'sleepScore')).toBe(false);
  });
  it('survives a reload while disconnected', () => {
    const repo = memoryRepository();
    const store = createHomeWidgetStore(repo);
    store.connectService('oura');
    store.add('readiness');
    store.disconnectService('oura');
    expect(createHomeWidgetStore(repo).getState().layout).toEqual([...DEFAULT_LAYOUT, 'readiness']);
    const reconnected = createHomeWidgetStore(repo);
    reconnected.connectService('oura');
    expect(reconnected.getState().layout).toEqual([...DEFAULT_LAYOUT, 'readiness']);
  });
  it('is a no-op for a service that is not connected', () => {
    const state = defaultHomeWidgetState();
    expect(disconnectService(state, 'oura')).toBe(state);
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
    for (const id of idsFor('oura')) state = markGlowSeen(state, id);
    state = disconnectService(state, 'oura');
    state = connectService(state, 'oura').state;
    for (const id of idsFor('oura')) expect(shouldGlow(state, id)).toBe(false);
    expect(state.glowPending).toEqual([]);
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
  it('falls back to defaults, drops unknown and hidden ids, and keeps locked placements', () => {
    const repo = memoryRepository();
    expect(loadHomeWidgets(repo)).toEqual(defaultHomeWidgetState());
    repo.localSave(HOME_WIDGETS_KEY, 'nonsense');
    expect(loadHomeWidgets(repo)).toEqual(defaultHomeWidgetState());
    repo.localSave(HOME_WIDGETS_KEY, {
      layout: ['bodyMap', 'gone', 'bodyMap', 'whoopRecovery', 'checkIn', 'restingHr'],
      services: ['appleHealth', 'myspace'], editDot: 'yes', glowPending: ['steps', 7], glowSeen: [],
    });
    const state = loadHomeWidgets(repo);
    expect(state.layout).toEqual(['bodyMap', 'restingHr']);
    expect(homeItems(state).map(item => item.locked)).toEqual([false, true]);
    expect(state.services).toEqual(['appleHealth']);
    expect(state.editDot).toBe(false);
    expect(state.glowPending).toEqual(['steps']);
  });
  it('prunes glowPending ids that are already in glowSeen', () => {
    const repo = memoryRepository();
    repo.localSave(HOME_WIDGETS_KEY, { layout: DEFAULT_LAYOUT, services: ['oura'], glowPending: ['steps', 'hrv', 'readiness'], glowSeen: ['hrv'] });
    const state = loadHomeWidgets(repo);
    expect(state.glowPending).toEqual(['steps', 'readiness']);
    expect(state.glowSeen).toEqual(['hrv']);
  });
  it('keeps working in memory when there is no repository yet', () => {
    const store = createHomeWidgetStore(null);
    expect(store.connectService('oura').length).toBeGreaterThan(0);
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
    await act(async () => { result.current.add(unlocked[0]); result.current.disconnectService('appleHealth'); });
    expect(result.current.home.find(item => item.id === unlocked[0])?.locked).toBe(true);
  });
});

describe('shared store per owner (B3)', () => {
  it('starts fresh when the same owner signs out and back in (R4-1)', async () => {
    const owner = 'owner-resign';
    const before = ownedBy(owner);
    const old = await renderHook(() => useHomeWidgets(before));
    await act(async () => { old.result.current.remove('bodyMap'); old.result.current.connectService('oura'); });
    const marker = { owner, startedAt: 1, phase: 'pending' as const };
    const storage = { read: async () => null, write: async () => {}, remove: async () => {} };
    const wiped = Object.assign(before, { wipe: () => { before.localSave(HOME_WIDGETS_KEY, undefined); } });
    await completeSignOut(marker, wiped as never, storage, async () => {});
    const after = ownedBy(owner); // new repository over empty storage
    const fresh = await renderHook(() => useHomeWidgets(after));
    expect(fresh.result.current.layout).toEqual(DEFAULT_LAYOUT);
    expect(fresh.result.current.services).toEqual([]);
    await act(async () => { fresh.result.current.remove('foodRing'); });
    expect(loadHomeWidgets(after).layout).not.toContain('foodRing');
    expect(loadHomeWidgets(after).layout).toContain('bodyMap');
    expect(loadHomeWidgets(before).layout).toContain('bodyMap'); // old repository is never written again
    const second = { owner, localGet: after.localGet, localSave: after.localSave };
    expect(homeWidgetStoreFor(second)).toBe(homeWidgetStoreFor(after));
  });
  it('reuses one store per owner and repository, and a new one for another owner', () => {
    const a = ownedBy('owner-a');
    expect(homeWidgetStoreFor(a)).toBe(homeWidgetStoreFor(a));
    expect(homeWidgetStoreFor(ownedBy('owner-b'))).not.toBe(homeWidgetStoreFor(a));
  });
  it('shares one store across repository objects for the same owner, so a removal is not undone (F6)', async () => {
    const { first, second } = sharedStorage('owner-two-repos');
    expect(homeWidgetStoreFor(second)).toBe(homeWidgetStoreFor(first));
    const a = await renderHook(() => useHomeWidgets(first));
    const b = await renderHook(() => useHomeWidgets(second));
    await act(async () => { a.result.current.remove('bodyMap'); });
    await act(async () => { b.result.current.remove('foodRing'); });
    const layout = ['insightScore', 'todayWorkout'];
    expect(a.result.current.layout).toEqual(layout);
    expect(b.result.current.layout).toEqual(layout);
    expect(loadHomeWidgets(first).layout).toEqual(layout);
    expect(createHomeWidgetStore(second).getState().layout).toEqual(layout);
  });
  it('keeps Home and Edit widgets in sync after an edit', async () => {
    const repo = ownedBy('owner-sync');
    const home = await renderHook(() => useHomeWidgets(repo));
    const edit = await renderHook(() => useHomeWidgets(repo));
    await act(async () => { edit.result.current.connectService('oura'); });
    await act(async () => { edit.result.current.add('readiness'); edit.result.current.move(4, 0); edit.result.current.remove('foodRing'); });
    const layout = ['readiness', 'bodyMap', 'insightScore', 'todayWorkout'];
    expect(edit.result.current.layout).toEqual(layout);
    expect(home.result.current.layout).toEqual(layout);
    expect(home.result.current.editDot).toBe(true);
    await act(async () => { edit.result.current.openEdit(); });
    expect(home.result.current.editDot).toBe(false);
    await act(async () => { home.result.current.disconnectService('oura'); });
    expect(edit.result.current.home[0]).toMatchObject({ id: 'readiness', disconnected: { service: 'oura' } });
  });
  it('keeps different owners isolated', async () => {
    const [x, y] = [ownedBy('owner-x'), ownedBy('owner-y')];
    const a = await renderHook(() => useHomeWidgets(x));
    const b = await renderHook(() => useHomeWidgets(y));
    await act(async () => { a.result.current.remove('bodyMap'); a.result.current.connectService('oura'); });
    expect(a.result.current.layout).not.toContain('bodyMap');
    expect(b.result.current.layout).toEqual(DEFAULT_LAYOUT);
    expect(b.result.current.services).toEqual([]);
  });
  it('reconnects a disconnected widget from Home', async () => {
    const repo = ownedBy('owner-reconnect');
    const { result } = await renderHook(() => useHomeWidgets(repo));
    await act(async () => { result.current.connectService('oura'); result.current.add('sleepScore'); result.current.disconnectService('oura'); });
    const item = result.current.home.find(entry => entry.id === 'sleepScore')!;
    await act(async () => { result.current.connectService(item.disconnected!.service); });
    expect(result.current.home.find(entry => entry.id === 'sleepScore')).toMatchObject({ locked: false, disconnected: null });
  });
});

describe('disconnected widget on Home (F3)', () => {
  it('renders grayed out with the service message and a Reconnect action', async () => {
    let state = addWidget(connectService(defaultHomeWidgetState(), 'oura').state, 'readiness');
    state = disconnectService(state, 'oura');
    const items = homeItems(state);
    const onReconnect = jest.fn();
    await render(<>{items.filter(item => ['bodyMap', 'readiness'].includes(item.id)).map(item => <HomeWidgetCard key={item.id} item={item} onReconnect={onReconnect} />)}</>);
    const card = screen.getByTestId('home-widget-readiness');
    expect(card.props.accessibilityState).toMatchObject({ disabled: true });
    expect(StyleSheet.flatten(card.props.style).opacity).toBeLessThan(1);
    expect(screen.getByText('Oura disconnected')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reconnect Readiness' })).toBeTruthy();
    const connected = screen.getByTestId('home-widget-bodyMap');
    expect(connected.props.accessibilityState).toMatchObject({ disabled: false });
    expect(screen.getAllByText('Reconnect')).toHaveLength(1);
    await fireEvent.press(screen.getByText('Reconnect'));
    expect(onReconnect).toHaveBeenCalledWith(expect.objectContaining({ id: 'readiness' }));
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
