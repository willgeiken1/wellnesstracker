import { Host } from '@expo/ui';
import { Picker, Text } from '@expo/ui/swift-ui';
import { accessibilityLabel, frame, pickerStyle, tag } from '@expo/ui/swift-ui/modifiers';
import { useTheme } from '@/design/theme-provider';
import { touchTarget } from './button';

export function SegmentedControl<T extends string>({ label, options, value, onChange }: {
  label: string; options: readonly { value: T; label: string }[]; value: T; onChange: (value: T) => void;
}) {
  const { colors, mode } = useTheme();
  return <Host matchContents={{ vertical: true }} colorScheme={mode} seedColor={colors.accent}>
    <Picker label={label} selection={value} onSelectionChange={onChange}
      modifiers={[pickerStyle('segmented'), accessibilityLabel(label), frame({ minHeight: touchTarget })]}>
      {options.map(option => <Text key={option.value} modifiers={[tag(option.value)]}>{option.label}</Text>)}
    </Picker>
  </Host>;
}
