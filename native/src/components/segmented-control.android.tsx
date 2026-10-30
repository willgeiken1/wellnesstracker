import { Host } from '@expo/ui';
import { SegmentedButton, SingleChoiceSegmentedButtonRow, Text } from '@expo/ui/jetpack-compose';
import { defaultMinSize } from '@expo/ui/jetpack-compose/modifiers';
import { touchTarget } from './button';
import { useTheme } from '@/design/theme-provider';

export function SegmentedControl<T extends string>({ label, options, value, onChange }: {
  label: string; options: readonly { value: T; label: string }[]; value: T; onChange: (value: T) => void;
}) {
  const { colors, mode } = useTheme();
  return <Host matchContents={{ vertical: true }} colorScheme={mode} seedColor={colors.accent} accessibilityLabel={label}>
    <SingleChoiceSegmentedButtonRow>
      {options.map(option => <SegmentedButton key={option.value} selected={value === option.value}
        onClick={() => onChange(option.value)} modifiers={[defaultMinSize({ minWidth: touchTarget, minHeight: touchTarget })]}>
        <SegmentedButton.Label><Text>{option.label}</Text></SegmentedButton.Label>
      </SegmentedButton>)}
    </SingleChoiceSegmentedButtonRow>
  </Host>;
}
