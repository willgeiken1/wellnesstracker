import { View } from 'react-native';
import { Button } from '../../../components/button';
import { ThemedText } from '../../../components/themed-text';
import type { Repository } from '../../../data/repository';
import { t } from '../../../i18n/en';
import { useFoodRevision } from '../../food/use-food-revision';
import { summaryLength, setSummaryLength } from './service';
export function SummaryLengthPicker({ repo, disabled = false }: {
    repo: Repository;
    disabled?: boolean;
}) {
    'use no memo';
    useFoodRevision(repo);
    return <View style={{ gap: 8 }}>
    <ThemedText>{t('workoutAiLength')}</ThemedText>
    {(['short', 'coach', 'detailed'] as const).map(length => <Button key={length} label={t(length === 'short' ? 'workoutAiShort' : length === 'coach' ? 'workoutAiCoach' : 'workoutAiDetailed')} variant="secondary" selected={summaryLength(repo) === length} disabled={disabled} onPress={() => setSummaryLength(repo, length)}/>)}
  </View>;
}
