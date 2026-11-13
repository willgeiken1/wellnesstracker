// The launch accessibility pass (review plan section 4): VoiceOver hears what changes, numbers stay inside their
// rings at large text, logger rows stack, and the smaller label fixes. Made-up sample data only.
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { AccessibilityInfo, Dimensions, Platform, StyleSheet } from 'react-native';
import { ThemeProvider } from '../src/design/theme-provider';
import { announce } from '../src/components/announce';
import { StatusText } from '../src/components/status-text';
import { CalorieRing } from '../src/features/food/ring';
import { PillarRow } from '../src/features/score/card';
import { SetRow } from '../src/features/workout/set-row';
import { Keypad } from '../src/features/workout/keypad';
import { Field } from '../src/features/workout/parts';
import { EditHome } from '../src/features/home/edit-sheet';
import { FoodScreen } from '../src/features/food/screen';
import { attributedDay, meals, saveFood } from '../src/features/food/model';
import { loadTiles } from '../src/features/home/tiles';
import { memoryRepository } from './workout-repository';

jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(), impactAsync: jest.fn(), notificationAsync: jest.fn(), ImpactFeedbackStyle: {}, NotificationFeedbackType: {} }));

const wrapper = ({ children }: PropsWithChildren) => <ThemeProvider>{children}</ThemeProvider>;
const settle = () => act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); });
const window = Dimensions.get('window'), screenSize = Dimensions.get('screen');
const setFontScale = (fontScale: number) => act(() => { Dimensions.set({ window: { ...window, fontScale }, screen: { ...screenSize, fontScale } }); });

let spoken: jest.SpyInstance, queued: jest.SpyInstance;
beforeEach(() => {
  // React Native's Jest setup already mocks these, so the spy is that mock: clear what earlier tests said.
  spoken = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
  queued = jest.spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions').mockImplementation(() => {});
  spoken.mockClear(); queued.mockClear();
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
});
afterEach(() => { jest.restoreAllMocks(); Dimensions.set({ window: { ...window, fontScale: 1 }, screen: { ...screenSize, fontScale: 1 } }); });

describe('VoiceOver hears what changes (A11Y-01)', () => {
  test('announce speaks trimmed text, queues behind the key name on iOS, and skips empty text', () => {
    expect(Platform.OS).toBe('ios');
    announce('  Saved.  ');
    expect(spoken).toHaveBeenCalledWith('Saved.');
    announce('5 kg', { queue: true });
    expect(queued).toHaveBeenCalledWith('5 kg', { queue: true });
    announce(''); announce(null); announce('   ');
    expect(spoken).toHaveBeenCalledTimes(1);
  });

  test('a status line is spoken when it appears and when it changes, not when it re-renders unchanged', async () => {
    const view = await render(<StatusText>Food deleted.</StatusText>, { wrapper });
    expect(spoken).toHaveBeenLastCalledWith('Food deleted.');
    await view.rerender(<StatusText>Food deleted.</StatusText>);
    expect(spoken).toHaveBeenCalledTimes(1);
    await view.rerender(<StatusText>Could not save. Try again.</StatusText>);
    expect(spoken).toHaveBeenLastCalledWith('Could not save. Try again.');
    // Android reads the same line through its live region.
    expect(screen.getByText('Could not save. Try again.').props.accessibilityLiveRegion).toBe('polite');
  });

  test('a status line that is on screen from the start waits for a change', async () => {
    const view = await render(<StatusText announceOnMount={false}>Ready</StatusText>, { wrapper });
    expect(spoken).not.toHaveBeenCalled();
    await view.rerender(<StatusText announceOnMount={false}>Camera is off</StatusText>);
    expect(spoken).toHaveBeenCalledWith('Camera is off');
  });

  const keypad = (props: Partial<React.ComponentProps<typeof Keypad>> = {}) => <Keypad label="Sample lift, Set 1, Weight" field="weight" unit="kg"
    equipment="dumbbell" value="" previous="" onChange={() => {}} onNext={() => {}} onClose={() => {}} {...props} />;

  test('each keypad key speaks the value the logger now holds, after the key name, with its unit', async () => {
    const onChange = jest.fn();
    const view = await render(keypad({ onChange }), { wrapper });
    await fireEvent.press(screen.getByTestId('keypad-key-6'));
    expect(onChange).toHaveBeenLastCalledWith('6');
    await view.rerender(keypad({ onChange, value: '6' }));
    expect(queued).toHaveBeenLastCalledWith('6 kg', { queue: true });
    await view.rerender(keypad({ onChange, value: '60' }));
    expect(queued).toHaveBeenLastCalledWith('60 kg', { queue: true });
    await view.rerender(keypad({ onChange, value: '' }));
    expect(queued).toHaveBeenLastCalledWith('blank', { queue: true });
    // Drawing the same value again says nothing new.
    await view.rerender(keypad({ onChange, value: '' }));
    expect(queued).toHaveBeenCalledTimes(3);
  });

  test('moving to another field is quiet (VoiceOver reads the new field itself); reps are spoken as reps', async () => {
    const view = await render(keypad({ value: '60' }), { wrapper });
    await view.rerender(keypad({ field: 'reps', label: 'Sample lift, Set 1, Reps', value: '8' }));
    expect(queued).not.toHaveBeenCalled();
    await view.rerender(keypad({ field: 'reps', label: 'Sample lift, Set 1, Reps', value: '1' }));
    expect(queued).toHaveBeenLastCalledWith('1 rep', { queue: true });
    await view.rerender(keypad({ field: 'reps', label: 'Sample lift, Set 1, Reps', value: '10' }));
    expect(queued).toHaveBeenLastCalledWith('10 reps', { queue: true });
  });

  test('the keypad limit hint is announced', async () => {
    await render(keypad({ field: 'reps', label: 'Sample lift, Set 1, Reps', value: '999' }), { wrapper });
    // The first digit replaces a value just opened; the next ones add to it until the limit.
    for (let i = 0; i < 4; i++) await fireEvent.press(screen.getByTestId('keypad-key-9'));
    const hint = screen.getByTestId('keypad-limit-hint');
    expect(spoken).toHaveBeenCalledWith(hint.props.children);
  });

  test('blank keypad keys are skipped by screen readers instead of read as "Blank key" buttons', async () => {
    await render(keypad({ field: 'reps', label: 'Sample lift, Set 1, Reps' }), { wrapper });
    const blank = screen.getByTestId('keypad-key-', { includeHiddenElements: true });
    expect(blank.props).toMatchObject({ accessible: false, accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' });
    expect(screen.queryByRole('button', { name: 'Blank key' })).toBeNull();
    // The ± keys shrink to fit instead of cutting off "−2.5" at large text.
    expect(within(screen.getByTestId('keypad-key-plus')).getByText('+1').props).toMatchObject({ adjustsFontSizeToFit: true, minimumFontScale: 0.4 });
  });

  test.each([
    ['stays while VoiceOver is on', true],
    ['goes after 8 seconds when VoiceOver is off', false],
  ])('Food Undo %s', async (_name, voiceOver) => {
    jest.useFakeTimers({ now: new Date(2026, 4, 12, 15, 0, 0), doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate', 'clearImmediate'] });
    try {
      jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(voiceOver);
      const repo = memoryRepository(), day = attributedDay();
      saveFood(repo, day, meals(repo)[0].id, { name: 'Sample oats', energy_kj: 418.4, protein_g: 5, carbs_g: 20, fat_g: 2, fiber_g: null, sugar_g: null, sodium_mg: null, amount_g: null }, 1, undefined, day);
      await render(<FoodScreen repository={repo} />, { wrapper });
      await settle();
      await fireEvent.press(screen.getByRole('button', { name: /^Sample oats, / }));
      await fireEvent.press(screen.getByRole('button', { name: 'Delete Sample oats' }));
      expect(spoken).toHaveBeenLastCalledWith('Food deleted.');
      await act(async () => { jest.advanceTimersByTime(9000); });
      if (voiceOver) expect(screen.getByRole('button', { name: 'Undo delete' })).toBeTruthy();
      else expect(screen.queryByRole('button', { name: 'Undo delete' })).toBeNull();
    } finally { jest.useRealTimers(); }
  });
});

describe('numbers inside rings stay inside at large text (A11Y-02)', () => {
  const total = { energy_kj: 500 * 4.184, protein_g: 30, carbs_g: 60, fat_g: 15, fiber_g: null, sugar_g: null, sodium_mg: null, amount_g: null };
  const target = { energy_kj: 2000 * 4.184, protein_g: 150, carbs_g: 200, fat_g: 70 } as const;

  test('at the default size the ring looks as before: one number in the middle, no extra line', async () => {
    await render(<CalorieRing total={total} target={target as never} />, { wrapper });
    expect(screen.getByTestId('food-ring-middle').props.maxFontSizeMultiplier).toBe(1.2);
    expect(screen.queryByTestId('food-ring-full')).toBeNull();
  });

  test('at 3x the middle grows only 1.2x and shrinks to fit, and the same value is written in full below', async () => {
    await setFontScale(3);
    await render(<CalorieRing total={total} target={target as never} />, { wrapper });
    expect(screen.getByTestId('food-ring-middle').props).toMatchObject({ maxFontSizeMultiplier: 1.2, numberOfLines: 1, adjustsFontSizeToFit: true });
    const full = screen.getByTestId('food-ring-full');
    expect(full.props.maxFontSizeMultiplier).toBe(0);
    expect(full).toHaveTextContent('1,500 kcal left');
  });
});

describe('logger set rows stack at large text (A11Y-03)', () => {
  type Row = React.ComponentProps<typeof SetRow>;
  const row = (props: Partial<Row> = {}) => <SetRow exerciseIndex={0} exercise="Sample lift" index={0} unit="kg" draft={{ weight: '60', reps: '8' } as Row['draft']}
    previous="57.5 × 8" hint="" onEdit={() => {}} onDone={() => {}} onRemove={() => {}} onTag={() => {}} {...props} />;

  test('at the default size everything sits on one row', async () => {
    await render(row(), { wrapper });
    expect(screen.queryByTestId('set-row-0-0-names', { includeHiddenElements: true })).toBeNull();
    expect(StyleSheet.flatten(screen.getByTestId('set-row-0-0').props.style).flexWrap).toBeUndefined();
  });

  test('at 3x the row wraps: number, last time and check, then a name over each box, then the boxes', async () => {
    await setFontScale(3);
    await render(row(), { wrapper });
    const rowView = screen.getByTestId('set-row-0-0');
    expect(StyleSheet.flatten(rowView.props.style).flexWrap).toBe('wrap');
    const names = screen.getByTestId('set-row-0-0-names', { includeHiddenElements: true });
    expect(StyleSheet.flatten(names.props.style).flexBasis).toBe('100%');
    expect(within(names).getByText('kg', { includeHiddenElements: true })).toBeTruthy();
    expect(within(names).getByText('Reps', { includeHiddenElements: true })).toBeTruthy();
    // The check comes before the names, so it stays on the first line; the boxes follow on the last.
    const order = rowView.children.filter(child => typeof child !== 'string').map(child => (child as { props: { testID?: string } }).props.testID ?? '');
    expect(order.indexOf('set-0-0-done')).toBeLessThan(order.indexOf('set-row-0-0-names'));
    expect(order.indexOf('set-row-0-0-names')).toBeLessThan(order.indexOf('set-0-0-weight'));
    expect(screen.getByRole('button', { name: 'Sample lift, Set 1, Weight, 60' })).toBeTruthy();
    // No fixed-width column holds text: the set number has a minimum width, not a width.
    for (const node of rowView.queryAll(n => n.type === 'Text')) {
      for (let up = node.parent; up && up !== rowView; up = up.parent) expect(StyleSheet.flatten(up.props.style)?.width).toBeUndefined();
    }
  });

  test('on a done row the tag is drawn in accent-2, which reads on the tint in every theme (A11Y-04 part)', async () => {
    const { createTheme } = require('../src/design/tokens') as typeof import('../src/design/tokens');
    await render(row({ draft: { weight: '60', reps: '8', setId: 'made-up', tag: 'warmup' } as Row['draft'] }), { wrapper });
    const letter = screen.getByText('W', { includeHiddenElements: true });
    // Tests run in the light theme, where plain accent on the tint falls short of 4.5:1 in six palettes.
    expect(StyleSheet.flatten(letter.props.style).color).toBe(createTheme('light')['accent-2']);
  });
});

test('Score pillar names sit above full-width bars at large text (A11Y-07)', async () => {
  await render(<PillarRow pillar="training" value={72} />, { wrapper });
  expect(StyleSheet.flatten(screen.getByTestId('score-pillar-training').props.style).flexDirection).toBe('row');
  expect(StyleSheet.flatten(screen.getByText('Training').props.style)).toMatchObject({ minWidth: 72 });
  await setFontScale(3);
  await render(<PillarRow pillar="training" value={72} />, { wrapper });
  expect(StyleSheet.flatten(screen.getByTestId('score-pillar-training').props.style).flexDirection).toBeUndefined();
  expect(screen.getByLabelText('Training, 72 out of 100')).toBeTruthy();
});

describe('field edges with Increase Contrast (A11Y-09)', () => {
  test.each([[false], [true]])('Increase Contrast %s: the field has a muted hairline only when on', async on => {
    const { createTheme } = require('../src/design/tokens') as typeof import('../src/design/tokens');
    jest.spyOn(AccessibilityInfo, 'isDarkerSystemColorsEnabled').mockResolvedValue(on);
    await render(<Field label="Sample note" value="" />, { wrapper });
    await settle();
    const style = () => StyleSheet.flatten(screen.getByLabelText('Sample note').props.style);
    if (on) await waitFor(() => expect(style()).toMatchObject({ borderWidth: 1, borderColor: createTheme('light')['text-muted'] }));
    else expect(style().borderWidth).toBeUndefined();
  });
});

test.each([[false, 'slide'], [true, 'none']] as const)('Edit Home with Reduce Motion %s opens with %s (A11Y-16)', async (reduce, animation) => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(reduce);
  await render(<EditHome visible tiles={loadTiles(null)} onChange={() => {}} onClose={() => {}} />, { wrapper });
  await waitFor(() => expect(screen.getByTestId('home-edit-sheet', { includeHiddenElements: true })).toHaveProp('animationType', animation));
});
