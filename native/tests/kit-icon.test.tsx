import { readFileSync } from 'fs';
import { render, screen } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { ThemeProvider } from '../src/design/theme-provider';
import { Icon, ICON_NAMES, ICON_STROKE } from '../src/components/icon';
import { ICONS } from '../src/components/icon-data';

const wrapper = ({ children }: PropsWithChildren) => <ThemeProvider>{children}</ThemeProvider>;
const MOCKUP_ICONS = ['score', 'today-map', 'week', 'up-next', 'calories', 'protein', 'volume', 'weight', 'steps', 'sleep', 'water', 'mindful',
  'routine', 'daily-routine', 'heart', 'pillar-training', 'pillar-food', 'pillar-recovery', 'timer', 'streak', 'check', 'chevron-right', 'plus', 'info', 'lock', 'play'];
const KIT_ICONS = ['back', 'close', 'search', 'minus', 'more', 'gear', 'person', 'edit', 'trash', 'bell', 'shield', 'faceid', 'cloud', 'export', 'ring',
  'apple', 'moon', 'sun', 'flame', 'trophy', 'link', 'note', 'clock', 'home', 'workouts', 'food', 'progress', 'routines', 'x', 'grid', 'move', 'layers',
  'drop', 'meal', 'repeat', 'run', 'clip', 'barcode', 'bolt', 'bookmark', 'copy', 'scale', 'camera', 'cal', 'sliders', 'ruler', 'share', 'capsule',
  'checks', 'swap', 'reorder', 'pause', 'history', 'sliders2'];

test('every icon of the mockup set and the kit is there by the same name', () => {
  for (const name of [...MOCKUP_ICONS, ...KIT_ICONS]) expect(ICON_NAMES).toContain(name);
});

test('every icon draws on the 24 pt grid with the 1.75 stroke and round ends', async () => {
  expect(ICON_STROKE).toBe(1.75);
  for (const name of ICON_NAMES) {
    const view = await render(<Icon testID="icon" name={name} size={18} color="#123456" />, { wrapper });
    const svg = screen.getByTestId('icon', { includeHiddenElements: true });
    expect(svg.props).toMatchObject({ width: 18, height: 18, vbWidth: 24, vbHeight: 24, accessible: false });
    const marks = svg.queryAll(node => /^RNSVG(Path|Circle|Rect)$/.test(String(node.type)));
    expect(marks.length).toBeGreaterThan(0);
    // Stroked marks carry the 1.75 line; round caps (1) and joins (1) on every mark.
    for (const mark of marks) {
      if (mark.props.stroke) expect(mark.props.strokeWidth).toBe(1.75);
      expect(mark.props.strokeLinecap).toBe(1);
      expect(mark.props.strokeLinejoin).toBe(1);
    }
    expect(ICONS[name].length).toBeGreaterThan(0);
    await view.unmount();
  }
});

test('the kit draws a stroked line where the mockup does and fills only its dots', () => {
  const more = ICONS.more;
  expect(more.every(el => el.t === 'circle' && el.f === 1 && el.s === 1)).toBe(true);
  expect(ICONS.score.map(el => el.t !== 'g' && [el.f, el.s])).toEqual([[0, 1], [0, 1], [1, 0]]);
  expect(ICONS.back).toEqual([{ t: 'path', d: 'M15 5.5 8.5 12l6.5 6.5', f: 0, s: 1 }]);
});

test('a kit icon wins over the icons.js icon of the same name, as the mockup looks them up', () => {
  expect(ICONS.check).toEqual([{ t: 'path', d: 'm5 12.5 4.5 4.5L19 7.5', f: 0, s: 1 }]);
});

test('the names older screens used still draw', async () => {
  for (const name of ['avatar', 'chevron', 'insights', 'home', 'workouts', 'food', 'progress'] as const) {
    const view = await render(<Icon testID="icon" name={name} />, { wrapper });
    const svg = screen.getByTestId('icon', { includeHiddenElements: true });
    expect(svg.props.width).toBe(20);
    expect(svg.queryAll(node => /^RNSVG(Path|Circle|Rect)$/.test(String(node.type))).length).toBeGreaterThan(0);
    await view.unmount();
  }
});

test('icons no longer lean on SF Symbols, so iOS draws the mockup set too', () => {
  expect(readFileSync(require.resolve('../src/components/icon.tsx'), 'utf8')).not.toMatch(/expo-symbols/);
});
