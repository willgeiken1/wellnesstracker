import { useState } from 'react';
import { View } from 'react-native';
import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { t } from '@/i18n/en';
export interface SupersetItem { id:string; name:string; group:string | null }
export function SupersetControls({items, currentId, onLink, onUnlink}: {
  items:SupersetItem[]; currentId:string; onLink:(ids:string[])=>void; onUnlink:()=>void;
}) {
  const [choosing,setChoosing] = useState(false), [selected,setSelected] = useState<string[]>([currentId]);
  const current = items.find(e => e.id === currentId);
  if (!current) return null;
  const members = items.filter(e => !!current.group && e.group === current.group);
  return <View>
    {members.length > 0 && <ThemedText>{t('supersetMembers').replace('{names}',members.map(e => e.name).join(', '))}</ThemedText>}
    <Button label={t('linkSuperset').replace('{name}',current.name)} variant="secondary" onPress={() => {setSelected([currentId]);setChoosing(true);}} />
    {current.group && <Button label={t('unlinkSuperset').replace('{name}',current.name)} variant="secondary" onPress={onUnlink} />}
    {choosing && <View>
      <ThemedText>{t('supersetHelp')}</ThemedText>
      {items.filter(e => e.id !== currentId).map(e => <Button key={e.id} label={t('supersetSelect').replace('{name}',e.name)} selected={selected.includes(e.id)} variant="secondary" disabled={!selected.includes(e.id) && selected.length === 3} onPress={() => setSelected(ids => ids.includes(e.id) ? ids.filter(id => id !== e.id) : [...ids,e.id])} />)}
      <Button label={t('saveSuperset')} disabled={selected.length<2} onPress={() => {onLink(items.filter(e => selected.includes(e.id)).map(e => e.id));setChoosing(false);}} />
      <Button label={t('cancel')} variant="secondary" onPress={() => setChoosing(false)} />
    </View>}
  </View>;
}
