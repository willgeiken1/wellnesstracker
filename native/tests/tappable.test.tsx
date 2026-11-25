import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';
import { Tappable, PRESSED_ROW_OPACITY, PRESSED_FILL_OPACITY, tappableStyle } from '../src/components/tappable';

const at = (pressed: boolean) => ({ pressed, hovered: false });

test('a control dims while it is held and comes back when it is let go', () => {
  expect(StyleSheet.flatten(tappableStyle({ padding: 4 }, at(true)))).toEqual({ padding: 4, opacity: PRESSED_ROW_OPACITY });
  expect(StyleSheet.flatten(tappableStyle({ padding: 4 }, at(false)))).toEqual({ padding: 4 });
});

test('it keeps a style function of its own and adds the dim on top', () => {
  const own = ({ pressed }: { pressed: boolean }) => ({ backgroundColor: pressed ? 'red' : 'blue' });
  expect(StyleSheet.flatten(tappableStyle(own, at(true)))).toEqual({ backgroundColor: 'red', opacity: PRESSED_ROW_OPACITY });
  expect(StyleSheet.flatten(tappableStyle(own, at(false)))).toEqual({ backgroundColor: 'blue' });
});

test('a disabled control never dims', () => {
  expect(StyleSheet.flatten(tappableStyle({ padding: 2 }, at(true), true))?.opacity).toBeUndefined();
});

test('rows dim further than filled buttons and keys, and a control can opt out', () => {
  expect(PRESSED_ROW_OPACITY).toBe(0.6);
  expect(PRESSED_FILL_OPACITY).toBe(0.75);
  expect(StyleSheet.flatten(tappableStyle({ padding: 2 }, at(true), false, 'fill'))?.opacity).toBe(PRESSED_FILL_OPACITY);
  expect(StyleSheet.flatten(tappableStyle({ padding: 2 }, at(true), false, 'row'))?.opacity).toBe(PRESSED_ROW_OPACITY);
  expect(StyleSheet.flatten(tappableStyle({ padding: 2 }, at(true), false, 'none'))?.opacity).toBeUndefined();
});

test('no control sets a press dim of its own', () => {
  const walk = (dir: string): string[] => readdirSync(dir).flatMap((name: string) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : /\.tsx?$/.test(name) ? [path] : [];
  });
  const stray = walk(join(__dirname, '..', 'src')).filter(path => /pressed\s*\?\s*0\.\d/.test(readFileSync(path, 'utf8')));
  expect(stray).toEqual([]);
});

test('it still presses and draws with its own style at rest', async () => {
  const onPress = jest.fn();
  await render(<Tappable testID="t" accessibilityRole="button" accessibilityLabel="Go" onPress={onPress} style={{ padding: 4 }}><Text>Go</Text></Tappable>);
  expect(StyleSheet.flatten(screen.getByTestId('t').props.style)).toEqual({ padding: 4 });
  await fireEvent.press(screen.getByRole('button', { name: 'Go' }));
  expect(onPress).toHaveBeenCalledTimes(1);
});

test('rows, keys and cards that had no press look now use it', () => {
  const files = ['src/components/list-row.tsx', 'src/features/workout/keypad.tsx', 'src/features/workout/set-row.tsx',
    'src/features/settings/appearance.tsx', 'src/features/home-widgets/home-widget-card.tsx', 'src/features/food/search.tsx'];
  for (const f of files) expect(readFileSync(join(__dirname, '..', f), 'utf8')).toMatch(/Tappable as Pressable/);
});

/** Every `<Pressable …>` opening tag in a source file, with the line it starts on. */
const pressables = (source: string) => {
  const found: { line: number; tag: string }[] = [];
  for (let from = source.indexOf('<Pressable'); from >= 0; from = source.indexOf('<Pressable', from + 1)) {
    let depth = 0, to = from;
    for (; to < source.length; to++) {
      const c = source[to];
      if (c === '{') depth++; else if (c === '}') depth--; else if (c === '>' && depth === 0 && source[to - 1] !== '=') break;
    }
    found.push({ line: source.slice(0, from).split('\n').length, tag: source.slice(from, to + 1) });
  }
  return found;
};

test('no tap target is a bare Pressable with nothing to show the press', () => {
  // A plain Pressable is fine when it draws its own pressed look; one that takes a tap and shows nothing must be a Tappable.
  // This one is not a control with a look of its own: a chart you scrub. Home has no add menu or backdrop of its own any more.
  const allowed = ['src/features/body/chart.tsx'];
  const walk = (dir: string): string[] => readdirSync(dir).flatMap((name: string) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : /\.tsx$/.test(name) ? [path] : [];
  });
  const root = join(__dirname, '..');
  const bare = walk(join(root, 'src')).flatMap(path => {
    const file = path.slice(root.length + 1).split('\\').join('/'), source = readFileSync(path, 'utf8');
    if (file === 'src/components/tappable.tsx' || !/import \{[^}]*\bPressable\b[^}]*\} from 'react-native'/.test(source)) return [];
    return pressables(source).filter(({ tag }) => /onPress=/.test(tag) && !/pressed/.test(tag)).map(({ line }) => `${file}:${line}`);
  });
  expect(bare.filter(at => !allowed.some(file => at.startsWith(file + ':')))).toEqual([]);
  expect(bare.filter(at => at.startsWith('src/features/home/'))).toEqual([]);
  expect(bare.filter(at => at.startsWith('src/features/body/chart.tsx:'))).toHaveLength(1);
});

test('the controls the acceptance review named dim at the right strength', () => {
  const read = (file: string) => readFileSync(join(__dirname, '..', file), 'utf8');
  for (const file of ['src/features/food/log-screen.tsx', 'src/features/shell/profile-button.tsx',
    'src/features/paywall/screen.tsx', 'src/features/workout/parts.tsx', 'src/features/atlas/body-atlas.tsx', 'src/features/body/entry.tsx'])
    expect(read(file)).toMatch(/<Tappable\b/);
  expect(read('src/features/food/log-screen.tsx')).toMatch(/<Tappable dim="fill" key=\{meal\.id\}/);
  // Home's Done is the tile grid's edit bar now, and it dims when pressed.
  expect(read('src/features/tiles/tile-grid.tsx')).toMatch(/onPress=\{onDone\} style=\{\(\{ pressed \}\) => \[[^\]]*pressed && \{ opacity: 0\.\d+ \}\]/);
  // Home opens Settings from the shell's profile button, which shows its press.
  expect(read('src/features/home/screen.tsx')).toMatch(/<ProfileButton\b/);
  expect(read('src/features/shell/profile-button.tsx')).toMatch(/<Tappable dim="none"[^>]*accessibilityLabel=\{t\('shellProfile'\)\}/);
  // The floating bar's tabs and + button show a press by shrinking, as the mockup's shell does, rather than by dimming.
  const dock = read('src/features/shell/dock.tsx');
  expect(dock).toMatch(/<Tappable dim="none" testID=\{`tab-\$\{page\.route\}`\}/);
  expect(dock).toMatch(/<Tappable dim="none" testID="dock-plus"/);
  expect(dock.match(/scale: pressed \? PRESS_SCALE/g)).toHaveLength(2);
});
