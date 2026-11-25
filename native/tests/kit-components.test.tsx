import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { StyleSheet, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '../src/design/theme-provider';
import { createTheme } from '../src/design/tokens';
import {
  Badge, Button, Card, Chip, EmptyState, SegmentedControl, List, ListRow, NavBar, NavButton, PageHeader, ProgressBar, Ring, SearchField, Section, SectionHeader,
  Sheet, SheetHeader, Stat, Stepper, Switch, TextField, ToastProvider, useToast, StackGapContext, alpha, mix,
} from '../src/components/kit';

jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() } }));
const frame = { x: 0, y: 0, width: 393, height: 852 };
const repo = (theme: 'dark' | 'light') => ({ list: () => [{ id: 's', table: 'settings', updated_at: '2026-01-01T00:00:00Z', data: { theme_override: theme, accent: 'orchidEvening' } }],
  subscribe: () => () => {}, save: jest.fn() }) as never;
const inMode = (theme: 'dark' | 'light') => function Wrapper({ children }: PropsWithChildren) {
  return <SafeAreaProvider initialMetrics={{ frame, insets: { top: 59, left: 0, right: 0, bottom: 34 } }}><ThemeProvider repository={repo(theme)}>{children}</ThemeProvider></SafeAreaProvider>;
};
const dark = createTheme('dark', 'orchidEvening'), light = createTheme('light', 'orchidEvening');
const flat = (node: { props: Record<string, unknown> }) => (StyleSheet.flatten(node.props.style as never) ?? {}) as Record<string, unknown>;
const textStyle = (label: string) => flat(screen.getByText(label));

describe('buttons', () => {
  test('a primary button is a 48 pt accent pill in 700 16 pt on-accent type', async () => {
    await render(<Button label="Log meal" onPress={() => {}} />, { wrapper: inMode('dark') });
    const b = flat(screen.getByRole('button', { name: 'Log meal' }));
    expect(b).toMatchObject({ minHeight: 48, paddingHorizontal: 20, borderRadius: 999, backgroundColor: dark.accent });
    expect(textStyle('Log meal')).toMatchObject({ fontFamily: 'PlusJakartaSans_700Bold', fontSize: 16, color: dark['on-accent'] });
  });
  test('each kind draws as the mockup: tinted, plain, quiet and destructive', async () => {
    await render(<>
      <Button label="Tinted" variant="secondary" color="food" onPress={() => {}} />
      <Button label="Plain" variant="plain" onPress={() => {}} />
      <Button label="Quiet" variant="quiet" onPress={() => {}} />
      <Button label="Delete" variant="destructive" onPress={() => {}} />
    </>, { wrapper: inMode('dark') });
    expect(flat(screen.getByRole('button', { name: 'Tinted' })).backgroundColor).toBe(alpha(dark.food, 0.16));
    expect(textStyle('Tinted').color).toBe(dark.food);
    expect(flat(screen.getByRole('button', { name: 'Plain' })).backgroundColor).toBe('transparent');
    expect(flat(screen.getByRole('button', { name: 'Quiet' })).backgroundColor).toBe(dark['surface-2']);
    expect(flat(screen.getByRole('button', { name: 'Delete' })).backgroundColor).toBe(alpha(dark.danger, 0.16));
  });
  test('a small button is drawn 36 pt tall and grows to 48 pt to touch; a disabled one is faded and does nothing', async () => {
    const onPress = jest.fn();
    await render(<Button label="Add" size="sm" disabled onPress={onPress} />, { wrapper: inMode('dark') });
    const b = screen.getByRole('button', { name: 'Add' });
    expect(flat(b)).toMatchObject({ minHeight: 36, paddingHorizontal: 14, opacity: 0.4 });
    expect(b.props.hitSlop).toEqual({ top: 6, bottom: 6 });
    await fireEvent.press(b);
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('lists and rows', () => {
  test('rows stack on one 20 pt surface with hairlines inset 16 pt, or 60 pt beside an icon', async () => {
    const onPress = jest.fn();
    await render(<List testID="list" footer="A note under the list.">
      <ListRow title="Goals and targets" icon="score" color="warning" value="2,200 kcal" onPress={onPress} />
      <ListRow title="Connections" icon="link" color="success" value="2 connected" onPress={() => {}} />
      <ListRow title="Week starts on" value="Monday" strong />
    </List>, { wrapper: inMode('dark') });
    expect(textStyle('Goals and targets')).toMatchObject({ fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 15.5 });
    expect(textStyle('2,200 kcal')).toMatchObject({ fontSize: 15, color: dark['text-muted'], fontVariant: ['tabular-nums'] });
    expect(textStyle('Monday').color).toBe(dark.text);
    expect(textStyle('A note under the list.')).toMatchObject({ fontSize: 12.5, color: dark['text-muted'] });
    const row = screen.getByRole('button', { name: 'Goals and targets, 2,200 kcal' });
    expect(flat(row)).toMatchObject({ minHeight: 56, paddingHorizontal: 16, gap: 12 });
    await fireEvent.press(row);
    expect(onPress).toHaveBeenCalled();
    const lines = screen.getByTestId('list').queryAll(n => n.type === 'View' && n.props.pointerEvents === 'none' && flat(n).height === 1);
    expect(lines.map(n => flat(n).left)).toEqual([60, 60]);
  });
  test('a row with a switch toggles it and speaks its title', async () => {
    const onToggle = jest.fn();
    await render(<List><ListRow title="Weekly report" sub="Mondays at 8:00 AM" toggle onToggle={onToggle} /></List>, { wrapper: inMode('dark') });
    const sw = screen.getByRole('switch', { name: 'Weekly report' });
    expect(sw.props.accessibilityState).toMatchObject({ checked: true });
    expect(flat(sw)).toMatchObject({ width: 51, height: 31, backgroundColor: dark.success });
    expect(sw.props.hitSlop).toEqual({ top: 7, bottom: 7 });
    await fireEvent.press(sw);
    expect(onToggle).toHaveBeenCalledWith(false);
  });
  test('the older one-line row still works', async () => {
    const onPress = jest.fn();
    await render(<ListRow label="Licenses" onPress={onPress} />, { wrapper: inMode('light') });
    await fireEvent.press(screen.getByRole('button', { name: 'Licenses' }));
    expect(onPress).toHaveBeenCalled();
  });
});

describe('controls', () => {
  test('a switch that is off is the hairline grey', async () => {
    await render(<Switch value={false} onValueChange={() => {}} label="Food reminders" />, { wrapper: inMode('dark') });
    expect(flat(screen.getByRole('switch', { name: 'Food reminders' })).backgroundColor).toBe(dark['hair-2']);
  });
  test('a chip is a 36 pt pill that fills with its colour when chosen', async () => {
    const onPress = jest.fn();
    await render(<><Chip label="Recent" selected color="food" onPress={onPress} /><Chip label="Saved" onPress={() => {}} /></>, { wrapper: inMode('dark') });
    const on = screen.getByRole('button', { name: 'Recent' });
    expect(flat(on)).toMatchObject({ minHeight: 36, paddingHorizontal: 14, backgroundColor: dark.food });
    expect(on.props.accessibilityState).toMatchObject({ selected: true });
    expect(on.props.hitSlop).toEqual({ top: 6, bottom: 6 });
    expect(textStyle('Recent')).toMatchObject({ color: dark['on-accent'], fontSize: 13.5 });
    expect(flat(screen.getByRole('button', { name: 'Saved' })).backgroundColor).toBe(dark.surface);
  });
  test('the compact segmented control fits a settings row and still reaches 44 pt', async () => {
    await render(<SegmentedControl compact label="Time" options={[{ value: '12', label: '12-hour' }, { value: '24', label: '24-hour' }]} value="12" onChange={() => {}} />, { wrapper: inMode('dark') });
    const on = screen.getByRole('tab', { name: '12-hour' });
    expect(flat(on)).toMatchObject({ minHeight: 32, paddingHorizontal: 6 });
    expect(32 + on.props.hitSlop.top + on.props.hitSlop.bottom).toBeGreaterThanOrEqual(44);
    expect(textStyle('24-hour')).toMatchObject({ fontSize: 13, color: dark['text-muted'] });
  });
  test('the stepper steps within bounds and every button reaches 44 pt', async () => {
    const onChange = jest.fn();
    await render(<Stepper value={2200} step={50} unit="kcal" onChange={onChange} label="Calories" />, { wrapper: inMode('dark') });
    expect(screen.getByText('2,200 kcal')).toBeTruthy();
    const more = screen.getByRole('button', { name: 'More' });
    expect(flat(more)).toMatchObject({ width: 38, height: 38 });
    expect(38 + more.props.hitSlop.top + more.props.hitSlop.bottom).toBeGreaterThanOrEqual(44);
    await fireEvent.press(more);
    expect(onChange).toHaveBeenCalledWith(2250);
    await fireEvent.press(screen.getByRole('button', { name: 'Less' }));
    expect(onChange).toHaveBeenLastCalledWith(2150);
  });
  test('a badge is 11.5 pt bold on a 16 percent tint; no kit text goes under 11 pt', async () => {
    await render(<Badge label="New" color="success" />, { wrapper: inMode('light') });
    expect(textStyle('New')).toMatchObject({ fontSize: 11.5, color: light.success });
  });
  test('fields: a labelled field and a search field with their kit sizes', async () => {
    await render(<><TextField label="Body weight" unit="lb" value="182.1" onChangeText={() => {}} /><SearchField placeholder="Search foods" /></>, { wrapper: inMode('dark') });
    expect(textStyle('Body weight')).toMatchObject({ fontSize: 12, color: dark['text-muted'] });
    expect(flat(screen.getByLabelText('Body weight'))).toMatchObject({ fontSize: 17, fontFamily: 'PlusJakartaSans_600SemiBold' });
    expect(flat(screen.getByLabelText('Search foods'))).toMatchObject({ fontSize: 16, minHeight: 44 });
  });
});

describe('surfaces and sheets', () => {
  test('in light mode a card has the hairline edge; in dark it has none', async () => {
    await render(<Card testID="card"><Text>In a card</Text></Card>, { wrapper: inMode('light') });
    expect(flat(screen.getByTestId('card'))).toMatchObject({ borderRadius: 20, padding: 16, backgroundColor: light.surface });
    expect(String(flat(screen.getByTestId('card')).boxShadow)).toContain(light.hair);
  });
  test('on a dark sheet cards, lists and chips step up a level, and chips in a card on it step up again', async () => {
    await render(<Sheet header={<SheetHeader title="Log food" />}>
      <Card testID="card"><Chip label="Inside" onPress={() => {}} /></Card>
      <Chip label="Outside" onPress={() => {}} />
    </Sheet>, { wrapper: inMode('dark') });
    expect(flat(screen.getByTestId('card')).backgroundColor).toBe(dark['surface-2']);
    expect(flat(screen.getByRole('button', { name: 'Outside' })).backgroundColor).toBe(dark['surface-2']);
    expect(flat(screen.getByRole('button', { name: 'Inside' })).backgroundColor).toBe(mix(dark.text, dark['surface-2'], 0.09));
  });
  test('the sheet header has Cancel on the left, the title, and a bold right action that ghosts while disabled', async () => {
    const onRight = jest.fn();
    await render(<SheetHeader title="Quick add" right="Add" onRight={onRight} rightDisabled />, { wrapper: inMode('dark') });
    expect(textStyle('Cancel')).toMatchObject({ color: dark.accent, fontSize: 17, fontFamily: 'PlusJakartaSans_500Medium' });
    expect(textStyle('Quick add')).toMatchObject({ fontSize: 17, fontFamily: 'PlusJakartaSans_700Bold' });
    expect(textStyle('Add')).toMatchObject({ color: dark.ghost, fontFamily: 'PlusJakartaSans_700Bold' });
    await fireEvent.press(screen.getByRole('button', { name: 'Add' }));
    expect(onRight).not.toHaveBeenCalled();
  });
});

describe('headers', () => {
  test('the nav bar: an accent back button named for where it goes, the title in the middle, actions on the right', async () => {
    const onBack = jest.fn(), onEdit = jest.fn();
    await render(<NavBar back="Settings" onBack={onBack} title="Units and formats" right={<NavButton label="Edit" onPress={onEdit} />} />, { wrapper: inMode('dark') });
    const back = screen.getByRole('button', { name: 'Back to Settings' });
    expect(flat(back)).toMatchObject({ minHeight: 44, minWidth: 44 });
    expect(textStyle('Settings')).toMatchObject({ color: dark.accent, fontSize: 17 });
    expect(textStyle('Units and formats')).toMatchObject({ fontSize: 17, fontFamily: 'PlusJakartaSans_700Bold' });
    await fireEvent.press(back);
    expect(onBack).toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Edit' }));
    expect(onEdit).toHaveBeenCalled();
  });
  test('a large title shows big under the bar and only joins the bar once scrolled', async () => {
    await render(<NavBar back="Home" title="Settings" large />, { wrapper: inMode('dark') });
    const titles = screen.getAllByText('Settings', { includeHiddenElements: true }).filter(n => flat(n).fontFamily === 'PlusJakartaSans_700Bold');
    expect(titles.map(n => flat(n).fontSize).sort()).toEqual([17, 34]);
  });
  test('a tab page header and a section header use the kit sizes and keep their margins inside a gapped stack', async () => {
    await render(<StackGapContext.Provider value={12}>
      <PageHeader eyebrow="Tuesday" title="Food" />
      <SectionHeader title="Meals" aside="See all" onAside={() => {}} testID="sec" />
    </StackGapContext.Provider>, { wrapper: inMode('dark') });
    expect(textStyle('Food')).toMatchObject({ fontSize: 34, lineHeight: 35.7 });
    expect(textStyle('Tuesday')).toMatchObject({ fontSize: 11.5, textTransform: 'uppercase' });
    expect(textStyle('Meals')).toMatchObject({ fontSize: 20 });
    expect(flat(screen.getByTestId('sec'))).toMatchObject({ marginTop: 16, marginBottom: 0 });
    expect(screen.getByRole('button', { name: 'See all' }).props.hitSlop).toEqual({ top: 9, bottom: 9, left: 8, right: 8 });
  });
  test('a section groups its header, content and footnote', async () => {
    await render(<Section title="Training" footer="Only on planned days."><Text>Rows</Text></Section>, { wrapper: inMode('dark') });
    expect(screen.getByText('Only on planned days.')).toBeTruthy();
  });
});

describe('numbers, progress and empty states', () => {
  test('a stat is a 28 pt tabular number with its unit, label and change', async () => {
    await render(<Stat value="182.1" unit="lb" label="Weight" sub="Down 1.2 this week" subColor="success" />, { wrapper: inMode('dark') });
    expect(textStyle('Weight')).toMatchObject({ fontSize: 12.5, color: dark['text-muted'] });
    expect(textStyle('Down 1.2 this week').color).toBe(dark.success);
    expect(screen.getByLabelText('182.1 lb, Weight, Down 1.2 this week')).toBeTruthy();
  });
  test('a progress bar and a ring report their value to VoiceOver', async () => {
    await render(<><ProgressBar value={0.62} color="water" label="Water" /><Ring value={0.5} label="Half way" /></>, { wrapper: inMode('dark') });
    expect(screen.getByRole('progressbar', { name: 'Water' }).props.accessibilityValue).toMatchObject({ now: 62, text: '62%' });
    expect(screen.getByLabelText('Half way')).toBeTruthy();
  });
  test('an empty state shows its icon tile, title, line and button', async () => {
    const onPress = jest.fn();
    await render(<EmptyState title="No meals yet" description="Log one to see it here." icon="meal" color="food" action={{ label: 'Log a meal', onPress }} />, { wrapper: inMode('dark') });
    expect(textStyle('No meals yet')).toMatchObject({ fontSize: 17 });
    await fireEvent.press(screen.getByRole('button', { name: 'Log a meal' }));
    expect(onPress).toHaveBeenCalled();
  });
});

describe('toast', () => {
  test('a toast shows its text and action, runs the action once and goes after its time', async () => {
    jest.useFakeTimers();
    const onAction = jest.fn();
    function Trigger() { const toast = useToast(); return <Button label="Save" onPress={() => toast.show('Meal saved', { action: 'Undo', onAction })} />; }
    await render(<ToastProvider><Trigger /></ToastProvider>, { wrapper: inMode('dark') });
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('Meal saved')).toBeTruthy();
    expect(textStyle('Meal saved')).toMatchObject({ fontSize: 14, fontFamily: 'PlusJakartaSans_600SemiBold' });
    await fireEvent.press(screen.getByRole('button', { name: 'Undo' }));
    expect(onAction).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    await act(async () => { jest.advanceTimersByTime(4000); });
    await act(async () => { jest.advanceTimersByTime(1000); });
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
    jest.useRealTimers();
  });
  test('without a provider, showing a toast does nothing and does not throw', async () => {
    function Lone() { const toast = useToast(); toast.show('Nothing'); return null; }
    await render(<Lone />, { wrapper: inMode('dark') });
  });
});
