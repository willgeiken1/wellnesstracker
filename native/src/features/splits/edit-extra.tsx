import { View } from 'react-native';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Eyebrow } from '@/components/section';
import { KitText } from '@/components/themed-text';
import { alpha, useKit } from '@/components/kit-style';
import { Icon } from '@/components/icon';
import { useTheme } from '@/design/theme-provider';
import { trainingNav } from '../workout/nav';
import { tr, trCount } from '../workout/tr';
import { scheduleLine, useSplit } from './tile';

/** The Split tile's part of its customize sheet (v21 `editExtra`): your split, Change split and Edit days. */
export function SplitEditExtra({ close }: { close: () => void }) {
  const k = useKit(), { reduceMotion } = useTheme(), split = useSplit(), v = split?.view;
  // The sheet closes first, so the next screen opens over Training rather than over the sheet.
  const then = (go: () => void) => () => { close(); setTimeout(go, reduceMotion ? 0 : 300); };
  return <View testID="split-edit-extra">
    <Eyebrow style={{ marginHorizontal: 4, marginBottom: 10 }}>{tr('splitYourSplit')}</Eyebrow>
    {!v ? <Button label={tr('splitChooseASplit')} full color="training" icon="sp-split" onPress={then(() => trainingNav.splitLibrary())} /> : <>
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16 }}>
        <View style={{ width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: alpha(k.c.training, 0.15) }}>
          <Icon name="sp-split" size={20} color={k.c.training} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <KitText weight={700} size={16} lineHeight={1.2} tracking={-0.01} numberOfLines={1}>{v.def.name}</KitText>
          <KitText weight={500} size={12.5} color="text-muted" numberOfLines={1} style={{ marginTop: 2 }}>{`${trCount('splitDays', v.days.length)} · ${scheduleLine(v)}`}</KitText>
        </View>
      </Card>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
        <View style={{ flex: 1 }}><Button label={tr('splitChangeSplit')} variant="secondary" color="training" icon="swap" full onPress={then(() => trainingNav.splitLibrary())} /></View>
        <View style={{ flex: 1 }}><Button label={tr('splitEditDays')} variant="quiet" icon="edit" full onPress={then(() => trainingNav.plan())} /></View>
      </View>
    </>}
  </View>;
}
