import { addEntry, cleanLayout, customizeEntry, defaultLayout, moveEntry, nextSize, pickStyle, removeEntry, restoreEntry, trayDefs, trayGroups, trayStart } from '../src/features/tiles/model';
import { implementTile, pendingTiles, tilePage, tilePageIds } from '../src/features/tiles/registry';
import { isPending } from '../src/features/tiles/pending';
import type { TilePageId } from '../src/features/tiles/types';

const ids = (page: TilePageId) => defaultLayout(tilePage(page)).map(e => `${e.id}:${e.size}`);

describe('tile catalogue', () => {
  it('registers every page made of tiles', () => {
    expect(tilePageIds().sort()).toEqual(['food', 'home', 'progress', 'routines', 'training']);
  });
  it('starts each page on the design default layout, in reading order', () => {
    expect(ids('home')).toEqual(['next:M', 'workout:M', 'protein:S', 'water:S', 'steps:S', 'weight:S']);
    expect(defaultLayout(tilePage('home'))[0].style).toBe('B');
    expect(ids('training')).toEqual(['session:L', 'goal:S', 'streak:S', 'week:L', 'next:M', 'e1rm:S', 'records:S', 'muscles:L', 'recent:M']);
    expect(ids('food')).toEqual(['cal:M', 'macros:M', 'meals:L', 'water:S', 'protein:S', 'fits:M', 'week:M', 'window:S', 'streak:S', 'quick:M']);
    expect(ids('progress')).toEqual(['score:M', 'history:M', 'recovery:L', 'weight:L', 'goal:S', 'bodyfat:S', 'training:M', 'trend:S', 'records:S', 'weekly:M', 'photos:M']);
    expect(ids('routines')).toEqual(['sun:L', 'next:S', 'overview:S', 'routine:L', 'adherence:M', 'streak:S', 'supplies:S', 'peptides:M', 'week:M', 'tools:M']);
  });
  it('gives every tile a title, an icon and sizes, and every default a tile', () => {
    for (const p of tilePageIds()) {
      const cfg = tilePage(p);
      for (const d of cfg.tiles) { expect(d.title).toBeTruthy(); expect(d.icon).toBeTruthy(); expect(d.sizes.length).toBeGreaterThan(0); }
      expect(defaultLayout(cfg)).toHaveLength(cfg.defaults.length);
    }
  });
  it('ships every renderer as a named pending stub until a page packet implements it', () => {
    const week = tilePage('training').tiles.find(d => d.id === 'week')!;
    expect(isPending(week.render)).toBe(true);
    expect((week.render as () => null).name).toBe('pending_training_week');
    expect(pendingTiles('home')).toContain('score:A');
  });
  it('lets a page packet implement a tile', () => {
    const render = () => null;
    implementTile('food', 'quick', { render, label: 'Log a meal' });
    const def = tilePage('food').tiles.find(d => d.id === 'quick')!;
    expect(def.render).toBe(render); expect(def.label).toBe('Log a meal');
    expect(pendingTiles('food')).not.toContain('quick');
    expect(() => implementTile('food', 'nope', { render })).toThrow();
  });
});

describe('tile layout edits', () => {
  const cfg = tilePage('training');
  it('cleans a saved layout: unknown tiles, repeats and sizes a tile no longer offers', () => {
    const out = cleanLayout(cfg, [['week', 'L'], ['gone', 'S'], ['week', 'S'], { id: 'goal', size: 'XL' }, 'streak', 42]);
    expect(out.map(e => e.id)).toEqual(['week', 'goal', 'streak']);
    expect(out.find(e => e.id === 'goal')!.size).toBe(cfg.tiles.find(d => d.id === 'goal')!.size ?? 'S');
    expect(cleanLayout(cfg, 'junk')).toEqual([]);
  });
  it('adds, removes and puts back a tile', () => {
    const base = defaultLayout(cfg);
    const extra = trayDefs(cfg, base)[0];
    const added = addEntry(cfg, base, extra.id);
    expect(added.some(e => e.id === extra.id)).toBe(true);
    expect(trayDefs(cfg, added).some(d => d.id === extra.id)).toBe(false);
    const at = base.findIndex(e => e.id === 'goal');
    const removed = removeEntry(base, 'goal');
    expect(removed.some(e => e.id === 'goal')).toBe(false);
    // the half row it left is filled by the next small tile, so it goes back at its old index
    expect(restoreEntry(removed, base[at], at).findIndex(e => e.id === 'goal')).toBe(at);
    expect(restoreEntry(removed, base[at], at)).toHaveLength(base.length);
  });
  it('moves a tile one place and cycles its sizes', () => {
    const base = defaultLayout(cfg);
    // one place earlier would land it back where it is (the small tiles share a row), so it moves on
    expect(moveEntry(base, 'week', -1).map(e => e.id).slice(0, 4)).toEqual(['session', 'week', 'goal', 'streak']);
    expect(moveEntry(base, 'session', -1).map(e => e.id)).toEqual(base.map(e => e.id));
    const goal = base.find(e => e.id === 'goal')!;
    expect(nextSize(cfg, goal)).not.toBe(goal.size);
  });
  it('applies a customize pick, falling back when a style lacks the size', () => {
    const home = tilePage('home');
    const base = defaultLayout(home);
    const next = customizeEntry(home, base, 'next', { style: 'A', size: 'S', options: {} });
    const e = next.find(x => x.id === 'next')!;
    expect(e.style).toBe('A');
    const def = home.tiles.find(d => d.id === 'next')!;
    expect(def.versions!.find(v => v.key === 'A')!.sizes).toContain(e.size);
  });
  it('picks the size when the style changes: keep it if offered, Home falls back to M', () => {
    const def = tilePage('home').tiles.find(d => d.id === 'score')!;
    expect(pickStyle(def, { size: 'S' }, 'B', true)).toBe('S');
  });
  it('groups the tray in the page order, Home with its plain names, the rest under More', () => {
    const home = tilePage('home');
    const groups = trayGroups(home, home.tiles);
    expect(groups[0].title).toBe('Today');
    expect(groups.map(g => g.title)).toContain('Recovery and sleep');
    expect(trayStart(home, defaultLayout(home), home.tiles.find(d => d.id === 'next')!).style).toBe('B');
  });
});
