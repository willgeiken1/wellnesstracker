jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));

// Keep native fetch behind the per-test HTTP stub; no native network in Jest.
jest.mock('expo/fetch', () => ({ fetch: (...args: Parameters<typeof fetch>) => global.fetch(...args) }));

// Native Expo UI hosts cannot mount in Jest. Preserve picker selection and modifier props.
jest.mock('@expo/ui', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { Host: 'ExpoUIHost', List: View, RNHostView: View,
    ListItem: ({ children, trailing }: any) => React.createElement(View, null, children, trailing),
    BottomSheet: ({ children, isPresented, ...props }: any) => isPresented ? React.createElement(View, props, children) : null };
});
jest.mock('@expo/ui/swift-ui', () => {
  const React = require('react');
  const { View, Pressable, Text: RNText } = require('react-native');
  return {
    Text: ({ children, ...props }: any) => React.createElement(RNText,
      { ...props, allowFontScaling: true, maxFontSizeMultiplier: 0 }, children),
    Picker: ({ children, selection, onSelectionChange, ...props }: any) => React.createElement(View,
      { ...props, accessibilityLabel: props.label, testID: 'native-segmented-picker' }, React.Children.map(children, (child: any) => {
        const value = child.props.modifiers.find((modifier: any) => modifier.$type === 'tag').tag;
        return React.createElement(Pressable, { accessibilityRole: 'tab', accessibilityLabel: child.props.children,
          accessibilityState: { selected: selection === value }, onPress: () => onSelectionChange(value) }, child);
      })),
  };
});
