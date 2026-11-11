import { useState } from 'react';
import { View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/design/theme-provider';
import { tokens } from '@/design/tokens';
import { t } from '@/i18n/en';
import { Pick, semibold } from './parts';
export interface SupersetItem { id:string; name:string; group:string | null }
/** Link an exercise with one or two partners, or unlink it. Used inside an exercise card in the logger and in the routine editor. */
export function SupersetControls({items, currentId, onLink, onUnlink}: {
  items:SupersetItem[]; currentId:string; onLink:(ids:string[])=>void; onUnlink:()=>void;
}) {
  const {colors} = useTheme();
  const [choosing,setChoosing] = useState(false), [selected,setSelected] = useState<string[]>([currentId]);
  const current = items.find(e => e.id === currentId);
  if (!current) return null;
  const members = items.filter(e => !!current.group && e.group === current.group);
  const others = items.filter(e => e.id !== currentId);
  return <View style={{gap:tokens.spacing[0]}}>
    {members.length > 0 && <ThemedText>{t('supersetMembers').replace('{names}',members.map(e => e.name).join(', '))}</ThemedText>}
    <View style={{flexDirection:'row',flexWrap:'wrap',columnGap:tokens.spacing[1]}}>
      <Pick onSurface text={t('supersetLink')} label={t('linkSuperset').replace('{name}',current.name)} onPress={() => {setSelected([currentId]);setChoosing(true);}} />
      {current.group && <Pick onSurface text={t('supersetUnlink')} label={t('unlinkSuperset').replace('{name}',current.name)} onPress={onUnlink} />}
    </View>
    {choosing && <View testID="superset-chooser" style={{gap:tokens.spacing[1],padding:tokens.spacing[2],borderRadius:14,borderWidth:1,borderColor:colors['hair-2']}}>
      <ThemedText style={semibold}>{t('supersetWith').replace('{name}',current.name)}</ThemedText>
      <ThemedText muted variant="caption">{t(others.length ? 'supersetHelp' : 'supersetNoPartners')}</ThemedText>
      <View style={{flexDirection:'row',flexWrap:'wrap',columnGap:tokens.spacing[1]}}>
        {others.map(e => <Pick key={e.id} onSurface text={e.name} label={t('supersetSelect').replace('{name}',e.name)} selected={selected.includes(e.id)} disabled={!selected.includes(e.id) && selected.length === 3} onPress={() => setSelected(ids => ids.includes(e.id) ? ids.filter(id => id !== e.id) : [...ids,e.id])} />)}
      </View>
      <View style={{flexDirection:'row',flexWrap:'wrap',columnGap:tokens.spacing[1]}}>
        <Pick strong text={t('saveSuperset')} disabled={selected.length<2} onPress={() => {onLink(items.filter(e => selected.includes(e.id)).map(e => e.id));setChoosing(false);}} />
        <Pick onSurface text={t('cancel')} onPress={() => setChoosing(false)} />
      </View>
    </View>}
  </View>;
}
