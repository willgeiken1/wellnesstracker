// Large-text sweep over screens filled with the made-up sample data (A11Y-18): the screens people use most,
// rendered at the largest iOS text sizes, must let every word grow, never clip it, and never cut it off.
import { act, render } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { Dimensions, StyleSheet } from 'react-native';
import type { TestInstance } from 'test-renderer';
import { ThemeProvider } from '../src/design/theme-provider';
import { WorkoutStore } from '../src/data/workout/store';
import { createSampleDays } from '../src/features/workout/devSampleDays';
import { HEADING_MAX, IN_RING_MAX } from '../src/components/text-size';
import { tokens } from '../src/design/tokens';
import { memoryRepository } from './workout-repository';

let mockRepository: ReturnType<typeof memoryRepository>;
jest.mock('../src/auth/provider', () => ({
  useAuth: () => ({ repository: mockRepository, pending: 0, syncStatus: 'idle', demo: true }),
  AuthContext: jest.requireActual('react').createContext(null),
}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), navigate: jest.fn(), replace: jest.fn(), back: jest.fn() },
  Stack: { Screen: () => null }, useIsFocused: () => true, useLocalSearchParams: () => ({}),
}));
jest.mock('expo-keep-awake', () => ({ useKeepAwake: jest.fn() }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(), impactAsync: jest.fn(), notificationAsync: jest.fn(), ImpactFeedbackStyle: {}, NotificationFeedbackType: {} }));
jest.mock('../src/features/health/apple', () => ({ appleHealth: () => null }));
jest.mock('../src/features/home/use-focused', () => ({ useFocused: () => true }));
jest.mock('../src/auth/client', () => ({ getAuthClient: () => null }));

import Home from '../src/app/(tabs)/index';
import { FoodScreen } from '../src/features/food/screen';
import { ScoreDetail } from '../src/features/score/detail';
import { ActiveWorkout } from '../src/features/workout/active';
import { Cardio } from '../src/features/cardio/screen';
import { Onboarding, OnboardingDraftProvider } from '../src/features/onboarding/screen';

// A fixed afternoon so the sample weeks and "today" do not depend on when the tests run.
const NOW = new Date(2026, 4, 12, 15, 0, 0);
const window = Dimensions.get('window'), screenSize = Dimensions.get('screen');
const setFontScale = (fontScale: number) => Dimensions.set({ window: { ...window, fontScale }, screen: { ...screenSize, fontScale } });

function seed() {
  mockRepository = memoryRepository();
  createSampleDays(new WorkoutStore(mockRepository), { isDev: true, demo: true, signedIn: false }, NOW.getTime());
  return mockRepository;
}
function startWorkout() {
  const store = new WorkoutStore(mockRepository), session = store.start();
  const bench = store.addExercise(session.id, 'Bench Press', 3);
  store.editDraft(bench.id, 0, { weight: '135', reps: '8' });
  store.toggleDone(bench.id, 0);
  store.addExercise(session.id, 'Pull-Up', 3);
}

// Known and assigned, so the sweep stays strict about everything else. Delete a line when its fix lands.
const PENDING = new Set([
  // A11Y-06: Food log-method labels (design polish thread, food/screen.tsx).
  '"Snap" is cut to 1 line(s)', '"Describe" is cut to 1 line(s)', '"Scan" is cut to 1 line(s)', '"Manual" is cut to 1 line(s)', '"Saved" is cut to 1 line(s)',
]);

const textOf = (node: TestInstance): string => node.children.map(child => typeof child === 'string' ? child : textOf(child)).join('');

/** Every rule a screen must keep at a large text size. Returns readable problems, so a failure says what and where. */
function sweep(root: TestInstance) {
  const problems: string[] = [];
  const texts = root.queryAll(node => node.type === 'Text');
  // Nested Text inherits its parent's settings; only the outer one decides how the line grows.
  const outer = texts.filter(node => { for (let up = node.parent; up; up = up.parent) if (up.type === 'Text') return false; return true; });
  const full = outer.filter(node => node.props.maxFontSizeMultiplier === 0).map(textOf);
  for (const node of outer) {
    const text = textOf(node).trim(), where = `"${text.slice(0, 40)}"`;
    if (node.props.allowFontScaling !== true) problems.push(`${where} does not scale`);
    const cap = node.props.maxFontSizeMultiplier;
    // Inside something with a fixed height or shape the text can only grow a little (a number inside a ring)...
    let boxed = false;
    for (let up: TestInstance | null = node.parent; up; up = up.parent) {
      const style = StyleSheet.flatten(up.props.style) ?? {};
      if (typeof style.height === 'number' || typeof style.maxHeight === 'number' || style.aspectRatio !== undefined) boxed = true;
    }
    if (boxed && !(cap > 0 && cap <= IN_RING_MAX)) problems.push(`${where} sits in a fixed-height box but grows without limit`);
    // ...and whatever is held back is also written somewhere at full size.
    // Title and display styles stop at HEADING_MAX (twice the size or more), like iOS's own large titles, so a long
    // word never breaks in the middle. They still grow, and nothing else may stop there.
    const size = StyleSheet.flatten(node.props.style)?.fontSize ?? 0;
    const heading = !boxed && (Object.values(HEADING_MAX) as number[]).includes(cap) && size >= tokens.type.title;
    if (cap !== 0 && !heading && !(cap > 0 && cap <= IN_RING_MAX)) problems.push(`${where} has maxFontSizeMultiplier ${cap}`);
    if (cap > 0 && !heading && text && !full.some(other => other.includes(text))) problems.push(`${where} is capped with no full-size copy`);
    // A line limit cuts words off unless the text shrinks to fit instead.
    if (node.props.numberOfLines !== undefined && !node.props.adjustsFontSizeToFit) problems.push(`${where} is cut to ${node.props.numberOfLines} line(s)`);
  }
  // On the device a percentage basis that may also shrink was ignored inside a wrapping row, squeezing words to one
  // letter per line (the rest bar and exercise names at AX5). Stacked layouts use a column or a fixed width instead.
  for (const node of root.queryAll(item => item.type === 'View')) {
    const style = StyleSheet.flatten(node.props.style) ?? {};
    if (typeof style.flexBasis === 'string' && style.flexBasis.endsWith('%') && ((style.flexShrink ?? 0) > 0 || (style.flex ?? 0) > 0))
      problems.push(`${node.props.testID ?? 'a view'} has a shrinking percentage basis (${style.flexBasis})`);
  }
  return problems;
}

const wrapper = ({ children }: { children: React.ReactNode }) => <ThemeProvider>{children}</ThemeProvider>;
async function sweepOf(ui: ReactElement) {
  const result = await render(ui, { wrapper });
  await act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); });
  const problems = sweep(result.container).filter(problem => !PENDING.has(problem));
  result.unmount();
  return problems;
}

beforeEach(() => {
  jest.useFakeTimers({ now: NOW, doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate', 'nextTick', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
  setFontScale(3);
});
afterEach(() => { setFontScale(1); jest.useRealTimers(); });

describe.each([2, 3])('at %sx text with two weeks of sample data', scale => {
  beforeEach(() => { setFontScale(scale); seed(); });
  test('Home', async () => expect(await sweepOf(<Home />)).toEqual([]));
  test('Food', async () => expect(await sweepOf(<FoodScreen repository={mockRepository} />)).toEqual([]));
  test('Insight Score', async () => expect(await sweepOf(<ScoreDetail />)).toEqual([]));
  test('the workout logger', async () => { startWorkout(); expect(await sweepOf(<ActiveWorkout />)).toEqual([]); });
  test('Cardio', async () => expect(await sweepOf(<Cardio repository={mockRepository} />)).toEqual([]));
  test('onboarding', async () => expect(await sweepOf(<OnboardingDraftProvider><Onboarding /></OnboardingDraftProvider>)).toEqual([]));
});

test('the sweep itself catches a number that grows inside a fixed ring and a cut-off label', async () => {
  const { Text, View } = require('react-native') as typeof import('react-native');
  const result = await render(<View>
    <View style={{ width: 96, height: 96 }}><Text allowFontScaling maxFontSizeMultiplier={0}>120</Text></View>
    <Text allowFontScaling maxFontSizeMultiplier={0} numberOfLines={1}>Previous</Text>
  </View>);
  expect(sweep(result.container)).toEqual(['"120" sits in a fixed-height box but grows without limit', '"Previous" is cut to 1 line(s)']);
});
