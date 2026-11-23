import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react-native';
import ReactNative, { View } from 'react-native';
import { TabDock, type DockItem } from '../src/components/floating-tabs';
import { activeIcon, Icon, type IconName } from '../src/components/icon';
import { ICON_STROKE, iconData } from '../src/components/icon-data';
import { ThemeProvider } from '../src/design/theme-provider';
import { tabs } from '../src/features/shell/tabs';

const root = join(__dirname, '..', '..');
const set = JSON.parse(readFileSync(join(root, 'design/icons/insight-icons.json'), 'utf8')) as { strokeWidth: number; icons: Record<string, string> };
const names = Object.keys(iconData) as IconName[];
const SHAPES = ['RNSVGPath', 'RNSVGCircle', 'RNSVGRect', 'RNSVGLine', 'RNSVGEllipse'];
// An icon is hidden from VoiceOver, so tests reach it through the view around it.
const within = (testID: string, type?: string) => screen.getByTestId(testID).queryAll(node => (type ? String(node.type) === type : SHAPES.includes(String(node.type))));
const shapes = () => within('wrap');

describe('the Insight icon set', () => {
  test('the generated files match design/icons/insight-icons.json', () => {
    expect(() => execFileSync('node', [join(root, 'native/scripts/gen-icons.cjs'), '--check'], { stdio: 'pipe' })).not.toThrow();
    expect(names).toEqual(Object.keys(set.icons));
    expect(ICON_STROKE).toBe(set.strokeWidth);
  });

  test('every line is the set\'s one weight with round ends, and nothing carries its own colour', () => {
    for (const name of names) for (const shape of iconData[name as keyof typeof iconData]) {
      const attrs = shape.attrs as Record<string, string | number>;
      if (attrs.stroke) expect([name, attrs.stroke, attrs.strokeWidth, attrs.strokeLinecap, attrs.strokeLinejoin]).toEqual([name, 'currentColor', ICON_STROKE, 'round', 'round']);
      expect(['none', 'currentColor', undefined]).toContain(attrs.fill);
      expect(attrs.stroke === 'currentColor' || attrs.fill === 'currentColor').toBe(true);
    }
  });

  test.each(names)('%s draws in the colour it is given and is hidden from VoiceOver', async name => {
    await render(<ThemeProvider><View testID="wrap"><Icon name={name} size={20} color="#123456" /></View></ThemeProvider>);
    const svg = within('wrap', 'RNSVGSvgView')[0];
    expect(screen.queryByTestId('wrap')).toBeTruthy();
    expect(svg.props.accessible).toBe(false);
    expect(svg.props.importantForAccessibility).toBe('no-hide-descendants');
    const drawn = shapes();
    expect(drawn).toHaveLength(iconData[name as keyof typeof iconData].length);
    const tint = { type: 0, payload: ReactNative.processColor('#123456') };
    for (const shape of drawn) {
      const painted = [shape.props.stroke, shape.props.fill].filter(paint => paint && paint.type === 0 && paint.payload !== undefined);
      expect(painted.length).toBeGreaterThan(0);
      for (const paint of painted) expect(paint).toEqual(tint);
    }
  });

  test('the names screens used before the set still draw an icon', async () => {
    const pairs = { chevron: 'chevron-right', forward: 'chevron-right', back: 'chevron-left', down: 'chevron-down', up: 'chevron-up', add: 'plus', routines: 'routine', workout: 'workouts', health: 'heart' } as const;
    for (const [alias, name] of Object.entries(pairs) as [IconName, keyof typeof iconData][]) {
      const view = await render(<ThemeProvider><View testID="wrap"><Icon name={alias} /></View></ThemeProvider>);
      expect(shapes().map(shape => shape.props.d ?? shape.type)).toEqual(iconData[name].map(shape => ('d' in shape.attrs ? shape.attrs.d : expect.any(String))));
      await view.unmount();
    }
  });

  test('every tab has an outline, a filled twin, and system-bar pictures at 1x, 2x and 3x', () => {
    for (const tab of tabs) {
      expect(activeIcon(tab.label)).toMatch(/-active$/);
      for (const state of ['', '-selected']) for (const scale of ['', '@2x', '@3x'])
        expect(existsSync(join(root, 'native/assets/images/navigation', `${tab.label}${state}${scale}.png`))).toBe(true);
    }
    expect(activeIcon('search')).toBe('search');
  });

  test('the floating bar fills the open tab and outlines the rest', async () => {
    const items: DockItem[] = tabs.map(tab => ({ key: tab.route, label: tab.label, icon: tab.label }));
    await render(<ThemeProvider><TabDock items={items} active={0} onPress={() => {}} /></ThemeProvider>);
    const first = (testID: string) => within(testID, 'RNSVGPath')[0];
    expect(first('tab-index').props.d).toBe(iconData['home-active'][0].attrs.d);
    expect(first('tab-index').props.fill.payload).toBeDefined();
    expect(first('tab-food').props.d).toBe(iconData.food[0].attrs.d);
  });
});
