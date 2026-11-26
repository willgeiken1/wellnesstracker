// These tests cover the AI features, which stay in the code for a later update; the launch build hides them.
jest.mock('../src/features/ai-launch', () => ({ AI_FEATURES_ENABLED: true }));
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { ThemeProvider } from '../src/design/theme-provider';
import { FoodCalendar } from '../src/features/food/calendar';
import { FoodEntry } from '../src/features/food/entry';
import { meals, saveFood, setTargets } from '../src/features/food/model';
import { FoodScanner } from '../src/features/food/scanner';
import { FoodTargets } from '../src/features/food/targets';
import { memoryRepository } from './workout-repository';

const mockRequest = jest.fn(); let mockGranted = false;
let mockCameraProps: Record<string, any> = {};
jest.mock('expo-camera', () => ({ useCameraPermissions: () => [{ granted: mockGranted }, mockRequest], CameraView: (props: Record<string, any>) => { mockCameraProps = props; return null; } }));
jest.mock('@react-native-picker/picker', () => { const React = require('react'); const { View } = require('react-native'); const Picker = (props: any) => React.createElement(View, props); Picker.Item = () => null; return { Picker }; });

const wrapper = ({ children }: PropsWithChildren) => <ThemeProvider>{children}</ThemeProvider>;
const blank = { fiber_g: null, sugar_g: null, sodium_mg: null, amount_g: null };
/** Made-up sample foods only. */
const oats = { name: 'Synthetic oats', energy_kj: 300 * 4.184, protein_g: 10, carbs_g: 54, fat_g: 5, ...blank };
const DAY = '2026-10-27', YESTERDAY = '2026-10-26';
// 12:00 local on a made-up day: lunch time, well clear of the 4 a.m. day boundary.
beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(new Date(2026, 9, 27, 12, 0)); mockGranted = false; mockRequest.mockReset(); mockCameraProps = {}; });
afterEach(() => jest.useRealTimers());

describe('entry form', () => {
  const open = async (props: Partial<Parameters<typeof FoodEntry>[0]> = {}) => {
    const onSave = jest.fn(), onClose = jest.fn();
    await render(<FoodEntry day={DAY} onSave={onSave} onClose={onClose} {...props} />, { wrapper });
    return { onSave, onClose };
  };
  test('numbers use a number keyboard, show their unit, and a blank one reads Unknown and saves as unknown', async () => {
    const { onSave } = await open();
    expect(screen.getByLabelText('Food name').props.keyboardType).toBe('default');
    for (const label of ['Calories (kcal)', 'Protein (g)', 'Carbs (g)', 'Fat (g)', 'Fiber (g)', 'Sugar (g)', 'Sodium (mg)']) {
      expect(screen.getByLabelText(label).props.keyboardType).toBe('decimal-pad');
      expect(screen.getByLabelText(label).props.placeholder).toBe('Unknown');
      expect(screen.getByLabelText(label)).toHaveDisplayValue('');
    }
    for (const unit of ['kcal', 'mg', '×']) expect(screen.getAllByText(unit).length).toBeGreaterThan(0);
    await fireEvent.changeText(screen.getByLabelText('Food name'), 'Synthetic rice');
    await fireEvent.changeText(screen.getByLabelText('Fat (g)'), '0');
    await fireEvent.press(screen.getByRole('button', { name: 'Save to today' }));
    expect(onSave).toHaveBeenCalledTimes(1);
    // Typed zero stays zero; blank stays unknown.
    expect(onSave.mock.calls[0][0]).toMatchObject({ name: 'Synthetic rice', energy_kj: null, protein_g: null, fat_g: 0, sodium_mg: null });
    expect(onSave.mock.calls[0][1]).toBe(1);
  });
  test('a rejected save points at the fields inline and saves nothing', async () => {
    const { onSave } = await open();
    await fireEvent.changeText(screen.getByLabelText('Carbs (g)'), 'lots');
    await fireEvent.changeText(screen.getByLabelText('Portion multiplier'), '0');
    await fireEvent.press(screen.getByRole('button', { name: 'Save to today' }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('Add a name.')).toBeTruthy();
    expect(screen.getByText('Use a number, 0 or more.')).toBeTruthy();
    expect(screen.getByText('Use a number above 0.')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Carbs (g)'), '12');
    expect(screen.queryByText('Use a number, 0 or more.')).toBeNull();
  });
  test('a save that fails keeps the input and offers Retry in a quiet row', async () => {
    const onSave = jest.fn().mockImplementationOnce(() => { throw new Error('Synthetic failure'); });
    await render(<FoodEntry day={YESTERDAY} onSave={onSave} onClose={jest.fn()} />, { wrapper });
    await fireEvent.changeText(screen.getByLabelText('Food name'), 'Synthetic rice');
    await fireEvent.press(screen.getByRole('button', { name: 'Save to yesterday' }));
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByLabelText('Food name')).toHaveDisplayValue('Synthetic rice');
    await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
    expect(onSave).toHaveBeenCalledTimes(2);
  });
  test('Cancel sits in the header and closes without saving; the heading says what the form is for', async () => {
    const { onSave, onClose } = await open({ initial: oats, editing: true });
    expect(screen.getByRole('header', { name: 'Edit food' })).toBeTruthy();
    expect(screen.getByLabelText('Calories (kcal)')).toHaveDisplayValue('300');
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });
  test('an older day is named in words on the save button', async () => {
    await open({ day: '2026-10-20' });
    expect(screen.getByRole('button', { name: 'Save to Tue, Oct 20' })).toBeTruthy();
  });
});

describe('scanner states', () => {
  const open = async () => {
    const handlers = { onChoose: jest.fn(), onManual: jest.fn(), onClose: jest.fn(), onSearch: jest.fn() };
    await render(<FoodScanner repo={memoryRepository()} {...handlers} />, { wrapper });
    return handlers;
  };
  test('before the camera opens it says what will happen and asks for nothing', async () => {
    const handlers = await open();
    expect(screen.getByTestId('barcode-camera-idle')).toBeTruthy();
    expect(screen.getByText('Scan with the camera')).toBeTruthy();
    expect(mockRequest).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Barcode number').props.keyboardType).toBe('number-pad');
    expect(screen.getByRole('button', { name: 'Look up barcode' })).toBeDisabled();
    await fireEvent.press(screen.getByRole('button', { name: 'Search your foods' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Enter food manually' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(handlers.onSearch).toHaveBeenCalledTimes(1);
    expect(handlers.onManual).toHaveBeenCalledTimes(1);
    expect(handlers.onClose).toHaveBeenCalledTimes(1);
  });
  test('an open camera shows the framing guide, the instruction and the torch', async () => {
    await open();
    mockRequest.mockResolvedValue({ granted: true });
    await fireEvent.press(screen.getByRole('button', { name: 'Open barcode camera' }));
    expect(screen.getByTestId('barcode-frame')).toBeTruthy();
    expect(screen.getByText('Hold the barcode inside the frame. It reads on its own.')).toBeTruthy();
    expect(mockCameraProps.barcodeScannerSettings).toEqual({ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] });
    await fireEvent.press(screen.getByRole('button', { name: 'Turn torch on' }));
    expect(screen.getByRole('button', { name: 'Turn torch off' })).toBeSelected();
  });
  test('a refused camera says so once, offers Settings, and keeps typing and manual entry', async () => {
    await open();
    mockRequest.mockResolvedValue({ granted: false });
    await fireEvent.press(screen.getByRole('button', { name: 'Open barcode camera' }));
    expect(screen.getByTestId('barcode-camera-off')).toBeTruthy();
    expect(screen.getByText('The camera is not available')).toBeTruthy();
    expect(screen.getAllByText('Camera unavailable. You can type the barcode or enter food manually.')).toHaveLength(1);
    expect(screen.queryByTestId('barcode-frame')).toBeNull();
    for (const name of ['Open camera settings', 'Enter food manually', 'Search your foods']) expect(screen.getByRole('button', { name })).toBeTruthy();
    expect(screen.getByLabelText('Barcode number')).toBeTruthy();
  });
  test('a camera that fails to start is reported the same honest way', async () => {
    await open();
    mockRequest.mockResolvedValue({ granted: true });
    await fireEvent.press(screen.getByRole('button', { name: 'Open barcode camera' }));
    await act(() => mockCameraProps.onMountError());
    expect(screen.getByTestId('barcode-camera-off')).toBeTruthy();
  });
});

describe('targets', () => {
  test('with no targets it says so and shows no numbers', async () => {
    await render(<FoodTargets repo={memoryRepository()} day={DAY} revision={0} />, { wrapper });
    expect(screen.getByText('Targets are unset. You can add them later.')).toBeTruthy();
    expect(screen.queryByText(/kcal/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Set food targets' })).toBeTruthy();
  });
  test('set targets show as four labelled values with units, and edit inline with number keyboards', async () => {
    const repo = memoryRepository();
    setTargets(repo, DAY, { energy_kj: 2000 * 4.184, protein_g: 150, carbs_g: 220, fat_g: 60 }, DAY);
    await render(<FoodTargets repo={repo} day={DAY} revision={0} />, { wrapper });
    expect(screen.getByText('Daily targets (manual)')).toBeTruthy();
    expect(screen.getByLabelText('Target: 2000 kcal · Protein 150 g · Carbs 220 g · Fat 60 g')).toBeTruthy();
    for (const text of ['2,000', '150', '220', '60']) expect(screen.getByText(new RegExp('^' + text))).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Edit food targets' }));
    expect(screen.getByLabelText('Target calories (kcal)')).toHaveDisplayValue('2000');
    expect(screen.getByLabelText('Target protein (g)').props.keyboardType).toBe('decimal-pad');
    await fireEvent.changeText(screen.getByLabelText('Target fat (g)'), '');
    await fireEvent.press(screen.getByRole('button', { name: 'Save targets' }));
    expect(screen.getByRole('alert')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Target fat (g)'), '70');
    await fireEvent.press(screen.getByRole('button', { name: 'Save targets' }));
    expect(repo.list('food_targets')[0].data.fat_g).toBe(70);
    await fireEvent.press(screen.getByRole('button', { name: 'Edit food targets' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Use estimated targets' }));
    expect(repo.list('food_targets')[0].data.fat_g).toBeNull();
  });
});

describe('calendar', () => {
  test('marks today, the chosen day and the days with food; future days are blocked and claim nothing', async () => {
    const repo = memoryRepository(), onSelect = jest.fn();
    saveFood(repo, '2026-10-20', meals(repo)[0].id, oats, 1, undefined, DAY);
    await render(<FoodCalendar day={YESTERDAY} today={DAY} onSelect={onSelect} repo={repo} />, { wrapper });
    expect(screen.getByRole('header', { name: 'October 2026' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tuesday, October 20, food logged' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Monday, October 26, nothing logged' })).toBeSelected();
    expect(screen.getByRole('button', { name: 'Tuesday, October 27, today, nothing logged' })).not.toBeSelected();
    expect(screen.getByRole('button', { name: 'Wednesday, October 28' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next food month' })).toBeDisabled();
    expect(within(screen.getByTestId('food-cal-key')).getByText('Food logged')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Tuesday, October 20, food logged' }));
    expect(onSelect).toHaveBeenCalledWith('2026-10-20');
    // The strip of recent days carries the same marks.
    await fireEvent.press(within(screen.getByTestId('food-cal-recent')).getByRole('button', { name: 'Tue, Oct 20, food logged' }));
    expect(onSelect).toHaveBeenCalledTimes(2);
    await fireEvent.press(screen.getByRole('button', { name: 'Previous food month' }));
    expect(screen.getByRole('header', { name: 'September 2026' })).toBeTruthy();
  });
  test('without the food log it marks no day as logged or not logged', async () => {
    await render(<FoodCalendar day={DAY} today={DAY} onSelect={jest.fn()} />, { wrapper });
    expect(screen.getByRole('button', { name: 'Tuesday, October 27, today' })).toBeSelected();
    expect(screen.getByRole('button', { name: 'Monday, October 26' })).toBeTruthy();
    expect(within(screen.getByTestId('food-cal-key')).queryByText('Food logged')).toBeNull();
  });
});

describe('touch and text room on the screens around food logging', () => {
  test('the calendar grid reaches into the card so a day is at least 44pt wide on a 360pt phone', async () => {
    const { FoodCalendar } = require('../src/features/food/calendar') as typeof import('../src/features/food/calendar');
    const { tokens } = require('../src/design/tokens') as typeof import('../src/design/tokens');
    await render(<FoodCalendar day={DAY} today={DAY} onSelect={() => {}} />, { wrapper });
    const { StyleSheet } = require('react-native') as typeof import('react-native');
    const grid = StyleSheet.flatten(screen.getByTestId('food-calendar-grid').props.style);
    // Screen padding and card padding on each side, less what the grid takes back.
    const width = 360 - 2 * tokens.spacing[3] - 2 * tokens.spacing[3] - 2 * grid.marginHorizontal;
    expect(width / 7).toBeGreaterThanOrEqual(44);
  });
});
