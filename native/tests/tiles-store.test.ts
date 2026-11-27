import { configureTileToast, createTileStore, loadTileLayout, resetTileStores, tileEdit, tileLayoutKey, tileStoreFor, type TileStorage } from '../src/features/tiles/store';
import { createSectionStore, sectionOrder, sectionValues } from '../src/features/tiles/section-store';

function fakeStorage(seed: Record<string, unknown> = {}): TileStorage & { data: Record<string, unknown> } {
  const data: Record<string, unknown> = { ...seed };
  return {
    owner: 'owner-1', data,
    localGet: <T,>(key: string) => data[key] as T | undefined,
    localSave: (key: string, value: unknown) => { if (value === null) delete data[key]; else data[key] = JSON.parse(JSON.stringify(value)); },
  } as TileStorage & { data: Record<string, unknown> };
}

describe('tile layout store', () => {
  const toasts: { message: string; undo?: () => void }[] = [];
  beforeEach(() => { toasts.length = 0; configureTileToast((message, action) => toasts.push({ message, undo: action?.onAction })); resetTileStores(); });

  it('starts from the page defaults and saves layout only, under tiles-<page>', () => {
    const storage = fakeStorage();
    const store = createTileStore(storage, 'training');
    expect(store.getState().tiles.slice(0, 2).map(e => e.id)).toEqual(['split', 'session']);
    store.setSize('goal', 'M');
    const saved = storage.data[tileLayoutKey('training')] as { v: number; tiles: unknown[][] };
    expect(saved.v).toBe(1);
    expect(saved.tiles.every(t => typeof t[0] === 'string' && typeof t[1] === 'string')).toBe(true);
    expect(loadTileLayout(storage, 'training').find(e => e.id === 'goal')!.size).toBe('M');
  });
  it('adds a tile from the tray with a toast and Undo', () => {
    const storage = fakeStorage();
    const store = createTileStore(storage, 'training');
    store.add('plan', 'M');
    expect(store.getState().tiles.some(e => e.id === 'plan')).toBe(true);
    expect(store.getState().flash.fresh).toBe('plan');
    expect(toasts[0].message).toBe('Plan days tile added');
    toasts[0].undo!();
    expect(store.getState().tiles.some(e => e.id === 'plan')).toBe(false);
  });
  it('removes a tile back to the tray and Undo puts it where it was', () => {
    const store = createTileStore(fakeStorage(), 'food');
    const before = store.getState().tiles.map(e => e.id);
    store.remove('water');
    expect(store.getState().tiles.some(e => e.id === 'water')).toBe(false);
    expect(toasts[0].message).toBe('Water is back in the tray');
    toasts[0].undo!();
    expect(store.getState().tiles.map(e => e.id)).toEqual(before);
  });
  it('words Home toasts its own way', () => {
    const store = createTileStore(fakeStorage(), 'home');
    store.remove('water');
    expect(toasts[0].message).toBe('Water tile is back in the tray');
  });
  it('resets to the defaults, clears the save, and Undo brings the layout back', () => {
    const storage = fakeStorage();
    const store = createTileStore(storage, 'progress');
    store.remove('photos');
    store.reset();
    expect(storage.data[tileLayoutKey('progress')]).toBeUndefined();
    expect(store.getState().tiles.some(e => e.id === 'photos')).toBe(true);
    expect(toasts.at(-1)!.message).toBe('Progress tiles reset');
    toasts.at(-1)!.undo!();
    expect(store.getState().tiles.some(e => e.id === 'photos')).toBe(false);
  });
  it('reads a damaged save as the defaults and keeps working when a write fails', () => {
    const storage = fakeStorage({ [tileLayoutKey('routines')]: { tiles: 'nope' } });
    expect(loadTileLayout(storage, 'routines')[0].id).toBe('sun');
    const failing = { ...storage, localSave: () => { throw new Error('disk'); } };
    const store = createTileStore(failing, 'routines');
    store.remove('sun');
    expect(store.getState().unsaved).toBe(true);
    expect(store.getState().tiles.some(e => e.id === 'sun')).toBe(false);
  });
  it('shares one store per owner and page', () => {
    const storage = fakeStorage();
    expect(tileStoreFor(storage, 'home')).toBe(tileStoreFor(storage, 'home'));
    expect(tileStoreFor(storage, 'home')).not.toBe(tileStoreFor({ ...storage, owner: 'owner-2' }, 'home'));
  });
  it('keeps edit mode to one page at a time', () => {
    tileEdit.set('food', true);
    expect(tileEdit.get().page).toBe('food');
    tileEdit.set('training', true);
    expect(tileEdit.get().page).toBe('training');
    tileEdit.set('food', false);
    expect(tileEdit.get().page).toBe('training');
    tileEdit.customize('training', 'week');
    expect(tileEdit.get().customizing).toBe('week');
    tileEdit.end();
    expect(tileEdit.get()).toEqual({ page: null, customizing: null });
  });
});

describe('page sections store', () => {
  const list = [
    { id: 'a', title: 'Alpha', icon: 'grid', render: () => null },
    { id: 'b', title: 'Beta', icon: 'grid', options: [{ id: 'n', label: 'Rows', choices: [['3', 'Three'], ['5', 'Five']] as const }], render: () => null },
    { id: 'c', title: 'Gamma', icon: 'grid', render: () => null },
  ];
  it('orders, hides, shows and customizes sections, saved under sections-<page>', () => {
    const storage = fakeStorage();
    const toasts: string[] = [];
    configureTileToast(m => toasts.push(m));
    const store = createSectionStore(storage, 'food');
    store.setOrder(['c', 'a', 'b']);
    expect(sectionOrder(store.getState().prefs, list).map(x => x.id)).toEqual(['c', 'a', 'b']);
    store.setHidden(list, 'a', true);
    expect(toasts).toEqual(['Alpha hidden']);
    expect(store.getState().prefs.hidden).toEqual(['a']);
    store.setHidden(list, 'a', false);
    expect(store.getState().prefs.hidden).toEqual([]);
    expect(sectionValues(store.getState().prefs, list[1])).toEqual({ n: '3' });
    store.setOption('b', 'n', '5');
    expect(sectionValues(store.getState().prefs, list[1])).toEqual({ n: '5' });
    expect(storage.data['sections-food']).toBeTruthy();
    store.reset();
    expect(storage.data['sections-food']).toBeUndefined();
  });
});
