import { Host, List, ListItem, RNHostView } from '@expo/ui';
import { useWindowDimensions, View } from 'react-native';
import type { Repository } from '@/data/repository';
import { ThemedText } from '@/components/themed-text';
import { t } from '@/i18n/en';
import { Label, Sparkline } from './presentation';
const fields = [['waist_m', t('measurementWaist')], ['hips_m', t('measurementHips')], ['chest_m', t('measurementChest')], ['arm_m', t('measurementArm')], ['thigh_m', t('measurementThigh')]] as const;
export function Measurements({ repository }: { repository: Repository }) {
 const { fontScale } = useWindowDimensions();
 const rows = repository.list('measurements').sort((a, b) => String(a.data.day).localeCompare(String(b.data.day)) || a.updated_at - b.updated_at);
 return <View style={{ gap: 8 }}><Label>{t('measurementsTitle')}</Label>
  {rows.length === 0 ? <ThemedText muted>{t('measurementsEmpty')}</ThemedText> : <Host style={{ height: fields.length * 104 * fontScale + 64 }}><List>
   {fields.map(([field, label]) => {
    const values = rows.flatMap(row => typeof row.data[field] === 'number' && row.data[field]! > 0 ? [Number(row.data[field]) * 100] : []);
    return <ListItem key={field} trailing={<View style={{ width: 100 }}><Sparkline values={values} label={t('measurementHistory').replace('{label}', label).replace('{values}', values.join(', '))} testID={`measurement-${field}`} /></View>}>
     <RNHostView matchContents><View style={{ minHeight: 44, justifyContent: 'center', gap: 4 }}><Label>{label}</Label><ThemedText numeric>{values.length ? `${values.at(-1)!.toFixed(1)} cm` : t('measurementsEmpty')}</ThemedText></View></RNHostView>
    </ListItem>;
   })}
  </List></Host>}
 </View>;
}
