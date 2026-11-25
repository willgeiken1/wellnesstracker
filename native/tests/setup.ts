jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));

// Keep native fetch behind the per-test HTTP stub; no native network in Jest.
jest.mock('expo/fetch', () => ({ fetch: (...args: Parameters<typeof fetch>) => global.fetch(...args) }));

// Telemetry SDKs ship ESM and native modules; tests never send anything. tests/telemetry.test.ts mocks them in detail.
jest.mock('@sentry/react-native', () => ({ init: jest.fn(), close: jest.fn(() => Promise.resolve()), setUser: jest.fn() }));
jest.mock('posthog-react-native', () => ({ __esModule: true, default: jest.fn(() => ({ identify: jest.fn(), reset: jest.fn(), capture: jest.fn(), optIn: jest.fn(() => Promise.resolve()), optOut: jest.fn(() => Promise.resolve()) })) }));

// Skia ships ESM and draws the tiles' depth on a device only; screens in tests need just the tile contents.
jest.mock('../src/features/tiles/tile-surface', () => ({ TileSurface: () => null }));
// Reanimated and gesture-handler need native code; tests share small stand-ins (tests/mocks/reanimated.ts). A test may mock them again.
jest.mock('react-native-reanimated', () => require('./mocks/reanimated').reanimatedMock());
jest.mock('react-native-gesture-handler', () => require('./mocks/reanimated').gestureHandlerMock());
