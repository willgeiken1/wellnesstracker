import { Card } from './card';
import { ThemedText } from './themed-text';
import { Button } from './button';
import { Badge } from './badge';
import { t } from '@/i18n/en';
export function EmptyState({ title, description = t('placeholderBody'), action }: {
  title: string; description?: string; action: { label: string; onPress: () => void };
}) {
  return <Card><Badge label={t('placeholder')} /><ThemedText variant="headline" accessibilityRole="header">{title}</ThemedText>
    <ThemedText muted>{description}</ThemedText><Button label={action.label} onPress={action.onPress} /></Card>;
}
