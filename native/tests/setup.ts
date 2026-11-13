jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));

// Keep native fetch behind the per-test HTTP stub; no native network in Jest.
jest.mock('expo/fetch', () => ({ fetch: (...args: Parameters<typeof fetch>) => global.fetch(...args) }));

// React Native's Jest preset reports the system text size as 2x. Tests start at the default size, as most people
// use the app; large-text tests opt in (see tests/large-text.test.tsx and shell.test.tsx).
{
  const { Dimensions } = require('react-native') as typeof import('react-native');
  Dimensions.set({ window: { ...Dimensions.get('window'), fontScale: 1 }, screen: { ...Dimensions.get('screen'), fontScale: 1 } });
}
