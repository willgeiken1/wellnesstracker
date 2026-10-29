jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));

// Keep native fetch behind the per-test HTTP stub; no native network in Jest.
jest.mock('expo/fetch', () => ({ fetch: (...args: Parameters<typeof fetch>) => global.fetch(...args) }));

// Native Expo UI hosts cannot mount in Jest. Preserve picker selection and modifier props.
jest.mock('@expo/ui', () => ({ Host: 'ExpoUIHost' }));
jest.mock('@expo/ui/swift-ui', () => {
  const React = require('react');
  const { View, Pressable, Text: RNText } = require('react-native');
  const Pass = ({children}: any) => React.createElement(View, {}, children);
  const ContextMenu = Pass as any;
  ContextMenu.Trigger = Pass; ContextMenu.Items = Pass;
  return {
    ContextMenu, RNHostView: Pass,
    Button: ({label,onPress}: any) => React.createElement(Pressable, {accessibilityRole:'button',accessibilityLabel:label,onPress}, React.createElement(RNText, {},label)),
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
