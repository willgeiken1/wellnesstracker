import { Button } from './button';
export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return <Button label={label} selected={selected} onPress={onPress} variant={selected ? 'primary' : 'secondary'} />;
}
