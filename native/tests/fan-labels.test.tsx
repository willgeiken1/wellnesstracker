// The + button's arc labels show in full ("Log meal", "Dinner"), as the design's `.qa-it .lab` (nowrap, no max width)
// does. Each label used to sit absolutely positioned straight inside its 52 pt item, which on a device squeezed it to the
// item's width less its offset, so every label read "Lo…" with its hint cut to "Di…".
import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { ThemeProvider } from '../src/design/theme-provider';
import { Fan, LABEL_ROOM, Scrim, type FanAction } from '../src/features/shell/fan';
import { labelOffset, layoutArc } from '../src/features/shell/geometry';

jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(), impactAsync: jest.fn(), ImpactFeedbackStyle: { Light: 'light' } }));

const ACTIONS: FanAction[] = [
  { id: 'meal', label: 'Log meal', hint: 'Dinner', icon: 'meal' as FanAction['icon'] },
  { id: 'water', label: 'Log water', hint: '0.8 of 2.5 L today', icon: 'drop' as FanAction['icon'] },
  { id: 'add', label: 'Add a tile', hint: 'Tiles for this page', icon: 'grid' as FanAction['icon'] },
  { id: 'edit', label: 'Edit page', hint: 'Move and resize tiles', icon: 'move' as FanAction['icon'] },
];
const W = 402, H = 874, PLUS = { x: 361, y: 808 };

async function open() {
  await render(<ThemeProvider><Fan open width={W} height={H} plus={PLUS} pageLabel="Home" color="accent" actions={ACTIONS}
    onRun={() => {}} onCustomize={() => {}} onClose={() => {}} /></ThemeProvider>);
}
/** The label's bubble (the pressable that holds the name and hint) and the box it sits in. */
function label(id: string) {
  const host = screen.getByTestId(`fan-${id}-label`);
  let bubble = screen.getByText(ACTIONS.find(a => a.id === id)!.label).parent;
  while (bubble && !bubble.props.onLayout) bubble = bubble.parent;
  return { bubble: bubble!, box: StyleSheet.flatten(host.props.style) as Record<string, unknown> };
}
const lay = async (id: string, w: number, h = 40) =>
  fireEvent(label(id).bubble, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: w, height: h } } });

test('every label sits in a box wider than any label, so nothing squeezes it to its button\'s width', async () => {
  await open();
  for (const a of ACTIONS) {
    const { bubble, box } = label(a.id);
    expect(box).toMatchObject({ position: 'absolute', width: LABEL_ROOM });
    // The bubble takes its own width inside the box: no position, offset or width of its own.
    const own = StyleSheet.flatten(typeof bubble.props.style === 'function' ? bubble.props.style({ pressed: false }) : bubble.props.style) ?? {};
    for (const key of ['position', 'left', 'right', 'width', 'maxWidth']) expect(own).not.toHaveProperty(key);
    expect(screen.getByText(a.hint)).toBeTruthy();
  }
});

test('a label right of its button starts 10 pt past it; one on the left ends 10 pt before it', async () => {
  await open();
  const arc = layoutArc(W, H, PLUS, ACTIONS.length);
  for (const [i, a] of ACTIONS.entries()) {
    await lay(a.id, 150);
    const { box } = label(a.id);
    const place = labelOffset(W, arc.items[i].x, 150);
    if (place.side === 'r') expect(box).toMatchObject({ left: place.left, alignItems: 'flex-start' });
    else expect(box).toMatchObject({ left: place.left + 150 - LABEL_ROOM, alignItems: 'flex-end' });
    expect(box.top).toBe(26 - 20);
  }
});

test('the room is wide enough for the longest label the arc can show', () => {
  // The widest arc label on a phone is under 220 pt (a long hint at 11.5 pt); the box allows more than that.
  expect(LABEL_ROOM).toBeGreaterThanOrEqual(W * 0.75);
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
