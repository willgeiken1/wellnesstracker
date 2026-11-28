// The + button's arc: every name sits on the right of its button, like the Food arc, except the top one, which sits on the left
// where the arc meets the screen edge. Before, a wide name flipped to the left on any row and could cover its own button
// (Routines' Add item hid its icon), and the second row up flipped on Home, Training and Progress.
import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { ThemeProvider } from '../src/design/theme-provider';
import { Fan, Scrim, type FanAction } from '../src/features/shell/fan';
import { fitHint, labelPlace, labelWidth, layoutArc, layoutDock } from '../src/features/shell/geometry';
import { ACTIONS as CATALOGUE, defaultHints, PAGE_KEYS } from '../src/features/shell/pages';
import { t } from '../src/i18n/en';

jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(), impactAsync: jest.fn(), ImpactFeedbackStyle: { Light: 'light' } }));

const ACTIONS: FanAction[] = [
  { id: 'add', label: 'Add item', hint: 'Supplement, habit or dose', hints: ['Supplement, habit or dose', 'Dose or habit'], icon: 'capsule' as FanAction['icon'] },
  { id: 'due', label: 'Check off', hint: 'Screens off, 8:30 PM', hints: ['Screens off, 8:30 PM', 'Screens off'], icon: 'checks' as FanAction['icon'] },
  { id: 'conv', label: 'Converter', hint: 'mg, mcg, IU, mL', icon: 'swap' as FanAction['icon'] },
  { id: 'order', label: 'Reorder', hint: 'Drag your list', icon: 'reorder' as FanAction['icon'] },
];
const W = 402, H = 874, PLUS = { x: 361, y: 808 };

async function open(actions = ACTIONS) {
  await render(<ThemeProvider><Fan open width={W} height={H} plus={PLUS} pageLabel="Routines" color="sleep" actions={actions}
    onRun={() => {}} onCustomize={() => {}} onClose={() => {}} /></ThemeProvider>);
}
const box = (id: string) => StyleSheet.flatten(screen.getByTestId(`fan-${id}-label`).props.style) as Record<string, number | string>;

test('every name is on the right of its button except the top one, which is on the left', async () => {
  await open();
  const arc = layoutArc(W, H, PLUS, ACTIONS.length);
  ACTIONS.forEach((a, i) => {
    const top = i === ACTIONS.length - 1, place = labelPlace(W, arc.items[i].x, top), b = box(a.id);
    expect(place.side).toBe(top ? 'l' : 'r');
    expect(b).toMatchObject({ position: 'absolute', width: place.room, left: top ? -8 - place.room : 60, alignItems: top ? 'flex-end' : 'flex-start' });
    // The box never reaches its button or past 12 pt from the screen edge.
    const x0 = arc.items[i].x + (b.left as number), x1 = x0 + (b.width as number);
    if (top) { expect(x1).toBeLessThanOrEqual(arc.items[i].x - 8); expect(x0).toBeGreaterThanOrEqual(12 - 0.01); }
    else { expect(x0).toBeGreaterThanOrEqual(arc.items[i].x + 52 + 8); expect(x1).toBeLessThanOrEqual(W - 12 + 0.01); }
  });
});

test('each row shows the fullest hint that fits its room', async () => {
  await open();
  const arc = layoutArc(W, H, PLUS, ACTIONS.length);
  ACTIONS.forEach((a, i) => {
    const room = labelPlace(W, arc.items[i].x, i === ACTIONS.length - 1).room;
    expect(screen.getByText(fitHint(a.label, a.hints ?? [a.hint], room))).toBeTruthy();
  });
  // The top row has room for everything; the bottom row of four on a 402 pt phone has 185 pt, so Add item uses its short form.
  expect(screen.getByText('Reorder')).toBeTruthy();
  expect(screen.getByText('Dose or habit')).toBeTruthy();
});

test('a name and hint shrink to fit rather than being cut short', async () => {
  await open();
  for (const a of ACTIONS) {
    const name = screen.getByText(a.label);
    expect(name.props).toMatchObject({ numberOfLines: 1, adjustsFontSizeToFit: true });
    expect(name.props.minimumFontScale).toBeGreaterThanOrEqual(0.75);
  }
});

test('the label is centred on its button once measured', async () => {
  await open();
  let bubble = screen.getByText('Reorder').parent;
  while (bubble && !bubble.props.onLayout) bubble = bubble.parent;
  await fireEvent(bubble!, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 120, height: 40 } } });
  expect(box('order').top).toBe(26 - 20);
});

// Every action can sit on any row, since people choose and order their own. Its default name and hint fit every right-hand row
// on a 402 pt iPhone and wider without shrinking, within 5 percent on a 393 pt one, and within 20 percent on a 375 pt one.
test('every default name and hint fits every row of the arc', () => {
  const misses: string[] = [];
  for (const w of [375, 393, 402, 430, 440]) for (const active of [0, 2, 4]) for (const n of [1, 2, 3, 4, 5]) {
    const arc = layoutArc(w, 874, layoutDock(w, 874, 34, 5, [0, 1, 2, 3, 4], active).plusCenter, n).items;
    arc.forEach((item, i) => {
      const place = labelPlace(w, item.x, i === n - 1);
      for (const page of PAGE_KEYS) for (const action of CATALOGUE[page]) {
        const name = t(action.label), hint = fitHint(name, defaultHints(action, new Date(2026, 0, 1, 8)), place.room);
        const need = labelWidth(name, hint), pad = 20, shrink = w >= 402 ? 1 : w >= 393 ? 0.95 : 0.8;
        const ok = (need - pad) * shrink + pad <= place.room;
        if (!ok) misses.push(`${page}/${action.id} "${name} / ${hint}" ${Math.round(need)} > ${Math.round(place.room)} at ${w} pt`);
      }
    });
  }
  expect([...new Set(misses)]).toEqual([]);
});

// Closing the actions faded the scrim out over 200 ms while it still took every tap, so a tap on the page right after
// (a tab, the Settings initial) did nothing.
test('the scrim lets taps through to the page as soon as the actions close', async () => {
  const view = await render(<ThemeProvider><Scrim open onClose={() => {}} /></ThemeProvider>);
  expect(screen.getByTestId('fan-scrim')).toHaveProp('pointerEvents', 'auto');
  await view.rerender(<ThemeProvider><Scrim open={false} onClose={() => {}} /></ThemeProvider>);
  const scrim = screen.queryByTestId('fan-scrim');
  if (scrim) expect(scrim).toHaveProp('pointerEvents', 'none');
});

// On the phone the page's own text read through the dim scrim next to the page name and Customize. The kit's scrim blurs
// the page (backdrop-filter: blur(14px)) and names the page in small capitals; the app now does both.
test('the scrim blurs the page behind the actions, as the kit does', async () => {
  await render(<ThemeProvider><Scrim open onClose={() => {}} /></ThemeProvider>);
  const blur = screen.getByTestId('fan-scrim-blur');
  expect(blur).toBeTruthy();
  expect(StyleSheet.flatten(screen.getByTestId('fan-scrim').props.style).backgroundColor).toBeUndefined();
});
test('the page name above the actions is in small capitals, as the kit draws it', async () => {
  await open();
  expect(StyleSheet.flatten(screen.getByTestId('fan-page').props.style)).toMatchObject({ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.54 });
  expect(screen.getByText('Routines')).toBeTruthy();
});
