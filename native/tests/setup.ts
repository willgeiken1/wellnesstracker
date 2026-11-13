jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));

// Keep native fetch behind the per-test HTTP stub; no native network in Jest.
jest.mock('expo/fetch', () => ({ fetch: (...args: Parameters<typeof fetch>) => global.fetch(...args) }));

// Telemetry SDKs ship ESM and native modules; tests never send anything. tests/telemetry.test.ts mocks them in detail.
jest.mock('@sentry/react-native', () => ({ init: jest.fn(), close: jest.fn(() => Promise.resolve()), setUser: jest.fn() }));
jest.mock('posthog-react-native', () => ({ __esModule: true, default: jest.fn(() => ({ identify: jest.fn(), reset: jest.fn(), capture: jest.fn(), optIn: jest.fn(() => Promise.resolve()), optOut: jest.fn(() => Promise.resolve()) })) }));
