import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { AppState, Linking } from 'react-native';
import { router } from 'expo-router';
import { ThemeProvider } from '../src/design/theme-provider';
import { BarcodeSheet } from '../src/features/food/barcode-sheet';
import { closeCart } from '../src/features/food/cart';
import { resetFoodDay } from '../src/features/food/selection';
import { memoryRepository } from './workout-repository';

/* The Scan barcode sheet (src/features/food/barcode-sheet.tsx), the routed sheet that replaced the old Food screen's scanner.
 * Made-up barcodes and foods only. */
const mockRequest = jest.fn();
let mockGranted = false, mockCanAsk = true;
let mockCameraProps: Record<string, any> = {};
jest.mock('expo-camera', () => ({
  useCameraPermissions: () => [{ granted: mockGranted, canAskAgain: mockCanAsk }, mockRequest],
  CameraView: (props: Record<string, any>) => { mockCameraProps = props; return null; },
}));
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), canGoBack: () => true, replace: jest.fn(), push: jest.fn(), navigate: jest.fn() },
  useNavigation: () => ({ canGoBack: () => true, addListener: () => () => {} }),
}));
jest.mock('expo-haptics', () => ({ impactAsync: () => Promise.resolve(), selectionAsync: () => Promise.resolve(), notificationAsync: () => Promise.resolve(), ImpactFeedbackStyle: { Light: 'light' } }));
jest.mock('../src/features/shell/toast', () => ({ showToast: jest.fn() }));

const wrapper = ({ children }: PropsWithChildren) => <ThemeProvider>{children}</ThemeProvider>;
const code = '0000000000017';
const originalFetch = global.fetch;
let mockHttp: jest.Mock;
/** A streamed Open Food Facts answer, as expo/fetch gives it. */
const answer = (json: unknown) => ({ ok: true, status: 200, headers: { get: () => null }, body: { getReader: () => {
  let done = false;
  return { read: async () => done ? { done: true } : (done = true, { done: false, value: new TextEncoder().encode(JSON.stringify(json)) }), cancel: jest.fn(async () => {}), releaseLock: jest.fn() };
} } });
const product = { status: 1, product: { product_name: 'Synthetic cereal', serving_quantity: 40, serving_quantity_unit: 'g', nutriments: { 'energy-kcal_100g': 100, proteins_100g: 1, carbohydrates_100g: 2, fat_100g: 1 } } };
const cached = (food: Record<string, unknown>, servingGrams: number | null) => ({ [code]: { fetchedAt: Date.now(), product: { food: { amount_g: 100, ...food }, servingGrams } } });

beforeEach(() => {
  mockGranted = false; mockCanAsk = true; mockRequest.mockReset(); mockCameraProps = {};
  mockHttp = jest.fn(); global.fetch = mockHttp;
  (router.back as jest.Mock).mockClear(); closeCart(); resetFoodDay();
});
afterEach(() => { global.fetch = originalFetch; });

async function typeAndLookUp(value = code) {
  await fireEvent.press(screen.getByRole('button', { name: 'Type the number' }));
  await fireEvent.changeText(screen.getByLabelText('Barcode number'), value);
  await fireEvent.press(screen.getByRole('button', { name: 'Look up barcode' }));
}

describe('closing the scanner mid-lookup', () => {
  test('aborts the request and writes nothing to the cache', async () => {
    const repo = memoryRepository(); let signal: AbortSignal | undefined;
    mockHttp.mockImplementation((_url: string, options: { signal: AbortSignal }) => {
      signal = options.signal;
      return new Promise((_, reject) => signal!.addEventListener('abort', () => reject(new Error('cancelled')), { once: true }));
    });
    const view = await render(<BarcodeSheet repo={repo} />, { wrapper });
    await typeAndLookUp();
    expect(mockHttp).toHaveBeenCalledTimes(1);
    expect(signal!.aborted).toBe(false);
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(router.back).toHaveBeenCalledTimes(1);
    await view.unmount();
    expect(signal!.aborted).toBe(true);
    expect(repo.localSnapshot()).toEqual({});
  });

  test('an answer that still arrives after the sheet closed is not cached', async () => {
    const repo = memoryRepository(); let deliver!: (value: unknown) => void;
    mockHttp.mockImplementation(() => new Promise(resolve => { deliver = resolve; }));
    const view = await render(<BarcodeSheet repo={repo} />, { wrapper });
    await typeAndLookUp();
    await view.unmount();
    await act(async () => { deliver(answer(product)); await Promise.resolve(); });
    expect(repo.localGet('barcode:v2')).toBeUndefined();
  });

  test('while the sheet stays open, the same answer is cached and shown', async () => {
    const repo = memoryRepository();
    mockHttp.mockResolvedValue(answer(product));
    await render(<BarcodeSheet repo={repo} />, { wrapper });
    await typeAndLookUp();
    expect(screen.getByText('Synthetic cereal')).toBeTruthy();
    expect(Object.keys(repo.localGet<Record<string, unknown>>('barcode:v2')!)).toEqual([code]);
  });
});

test('the camera asks just in time; when it is off for good, the sheet offers system Settings and typing still works', async () => {
  mockCanAsk = false;
  const settings = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
  await render(<BarcodeSheet repo={memoryRepository()} />, { wrapper });
  expect(mockRequest).not.toHaveBeenCalled();
  expect(mockCameraProps.onBarcodeScanned).toBeUndefined();
  await fireEvent.press(screen.getByRole('button', { name: 'Open camera settings' }));
  expect(settings).toHaveBeenCalledTimes(1); settings.mockRestore();
  await fireEvent.press(screen.getByRole('button', { name: 'Type the number' }));
  expect(screen.getByLabelText('Barcode number')).toBeTruthy();
  expect(mockHttp).not.toHaveBeenCalled();
});

test('a cached scan needs no network, keeps the label calories and adds one label serving', async () => {
  const repo = memoryRepository();
  repo.localSave('barcode:v2', cached({ name: 'Synthetic cereal', energy_kj: 418.4, protein_g: 0, carbs_g: 0, fat_g: 0 }, 40));
  mockGranted = true;
  await render(<BarcodeSheet repo={repo} />, { wrapper });
  await fireEvent.press(screen.getByRole('button', { name: 'Turn torch on' }));
  expect(mockCameraProps.enableTorch).toBe(true);
  await act(async () => { await mockCameraProps.onBarcodeScanned({ data: code, type: 'ean13' }); });
  expect(screen.getByText('Synthetic cereal')).toBeTruthy();
  expect(screen.getByText('Label calories differ from 4/4/9 macro calories by more than 15%. Keeping the label value.')).toBeTruthy();
  await fireEvent.press(screen.getByTestId('food-barcode-add'));
  const entries = repo.list('food_entries');
  expect(entries).toHaveLength(1);
  expect(entries[0].data).toMatchObject({ amount_g: 40, energy_kj: 167.36 });
  expect(mockHttp).not.toHaveBeenCalled();
});

test('not found offers manual entry', async () => {
  mockHttp.mockResolvedValue(answer({ status: 0 }));
  await render(<BarcodeSheet repo={memoryRepository()} />, { wrapper });
  await typeAndLookUp();
  expect(screen.getByText('Food not found. Enter it manually.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Enter food manually' })).toBeTruthy();
  expect(mockHttp).toHaveBeenCalledTimes(1);
});

test('duplicate scanner callbacks send one request, and a failed lookup can be tried again', async () => {
  let reject!: (error: Error) => void;
  mockHttp.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
  mockGranted = true;
  await render(<BarcodeSheet repo={memoryRepository()} />, { wrapper });
  const scan = mockCameraProps.onBarcodeScanned;
  await act(() => { scan({ data: code, type: 'ean13' }); scan({ data: code, type: 'ean13' }); });
  expect(mockHttp).toHaveBeenCalledTimes(1);
  await act(() => reject(new Error('offline')));
  expect(screen.getByText('Could not look up this barcode. Check the code or connection and try again.')).toBeTruthy();
  mockHttp.mockResolvedValue(answer({ status: 0 }));
  await fireEvent.press(screen.getByRole('button', { name: 'Type the number' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Look up barcode' }));
  expect(mockHttp).toHaveBeenCalledTimes(2);
  expect(screen.getByText('Food not found. Enter it manually.')).toBeTruthy();
});

test('a scan queued after a cached lookup settles is ignored', async () => {
  const repo = memoryRepository();
  repo.localSave('barcode:v2', cached({ name: 'Synthetic cereal', energy_kj: 418.4, protein_g: 1, carbs_g: 2, fat_g: 1 }, 50));
  mockGranted = true;
  await render(<BarcodeSheet repo={repo} />, { wrapper });
  const scan = mockCameraProps.onBarcodeScanned;
  await act(async () => { await scan({ data: code, type: 'ean13' }); });
  expect(screen.getByText('Synthetic cereal')).toBeTruthy();
  const get = jest.spyOn(repo, 'localGet');
  await act(async () => { await scan({ data: '00000000', type: 'ean8' }); });
  expect(get).not.toHaveBeenCalledWith('barcode:v2');
  expect(mockHttp).not.toHaveBeenCalled();
  expect(screen.getByText('Synthetic cereal')).toBeTruthy();
});

test('backgrounding turns the torch off', async () => {
  const listener = AppState.addEventListener as jest.Mock;
  mockGranted = true;
  await render(<BarcodeSheet repo={memoryRepository()} />, { wrapper });
  await fireEvent.press(screen.getByRole('button', { name: 'Turn torch on' }));
  expect(mockCameraProps.enableTorch).toBe(true);
  const onChange = listener.mock.calls.filter(([event]) => event === 'change').at(-1)![1];
  await act(() => onChange('background'));
  expect(screen.queryByRole('button', { name: 'Turn torch off' })).toBeNull();
  await act(() => onChange('active'));
  expect(mockCameraProps.enableTorch).toBe(false);
});

test('a UPC-E scan asks for the expanded UPC-A code', async () => {
  mockHttp.mockResolvedValue({ status: 404, ok: false });
  mockGranted = true;
  await render(<BarcodeSheet repo={memoryRepository()} />, { wrapper });
  await act(async () => { await mockCameraProps.onBarcodeScanned({ data: '01234505', type: 'upc_e' }); });
  expect(mockHttp.mock.calls[0][0]).toContain('/012000003455.json?fields=');
});
