import { useState } from 'react';
import { View } from 'react-native';
import { EmptyState, Icon, KitText, List, PressScale, Ring, SheetHeader, Tappable, useKit } from '@/components/kit';
import type { Repository } from '@/data/repository';
import { t } from '@/i18n/en';
import { fill } from '../tiles/ui';
import { addWater, dropWater } from './actions';
import { clock, plural } from './day';
import { foodRoutes } from './nav';
import { useFoodDay } from './selection';
import { closeSheet, FoodSheet, RowLine } from './sheet';
import { Caption, PillStepper, SectionLabel, WaterIcon } from './ui';
import { useFoodRevision } from './use-food-revision';
import { FLOZ, drinksOn, litresOn, readWater, sizeNum, sizeSpoken, sizeText, unitLabel, waterAmt, waterNum, type Container, type WaterUnit } from './water';

/** The other amount, kept in ounces while the app runs so it stays put between visits. */
const other = { oz: 12 };
const rememberOther = (oz: number) => { other.oz = oz; };
/** One step of the other amount: 1 oz, or 50 mL. */
export function stepOther(oz: number, unit: WaterUnit, up: boolean) {
  if (unit === 'ml') { const ml = Math.round(oz / FLOZ * 1000 / 10) * 10; return Math.max(50, Math.min(2000, ml + (up ? 50 : -50))) / 1000 * FLOZ; }
  return Math.max(1, Math.min(64, Math.round(oz) + (up ? 1 : -1)));
}

/**
 * Water (`water`): the day against the goal, one tap per container, an other amount, and the day's drinks with a
 * button to take one off. Edit containers opens their own sheet.
 */
export function WaterSheet({ repo }: { repo: Repository }) {
  useFoodRevision(repo);
  const k = useKit();
  const { day, isToday } = useFoodDay();
  const s = readWater(repo), u = s.unit, l = litresOn(s, day), g = s.goal, left = g - l, log = [...drinksOn(s, day)].reverse();
  const [otherOz, setOther] = useState(other.oz);
  const pct = Math.round(l / g * 100);
  const cap = left > 0.005 ? fill(t('foodWaterPctToGo'), { pct, left: waterAmt(left, u) }) : t('foodGoalReached') + (left < -0.03 ? ` · ${fill(t('foodWaterOver'), { v: waterAmt(-left, u) })}` : '');
  const ofLine = fill(isToday ? t('foodWaterOfToday') : t('foodWaterOf'), { goal: waterAmt(g, u) });
  const setO = (oz: number) => { rememberOther(oz); setOther(oz); };
  const shown = u === 'ml' ? Math.round(otherOz / FLOZ * 1000 / 10) * 10 : Math.round(otherOz);
  return <FoodSheet testID="food-water-sheet" header={<SheetHeader title={t('foodWater')} left={t('shellDone')} onLeft={() => closeSheet()} />}>
    <View style={{ alignItems: 'center', marginTop: 6, marginBottom: 4 }}>
      <Ring value={l / g} size={168} stroke={14} color="water" label={`${waterNum(l, u)} ${ofLine}`}>
        <View style={{ alignItems: 'center' }}>
          <KitText weight={700} size={38} lineHeight={1} tracking={-0.02} numeric>{waterNum(l, u)}</KitText>
          <KitText weight={600} size={12} lineHeight={1.2} color="text-muted" style={{ marginTop: 4 }}>{ofLine}</KitText>
        </View>
      </Ring>
    </View>
    <Caption center><KitText accessibilityLiveRegion="polite" weight={500} size={12.5} lineHeight={1.4} tracking={-0.02} numeric color="text-muted">{cap}</KitText></Caption>
    <SectionLabel title={t('foodAddADrink')} aside={t('foodEditContainers')} asideColor="water" onAside={foodRoutes.containers} />
    <View accessibilityLabel={t('foodContainersHint')} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      {s.containers.map(c => <ContainerButton key={c.id} c={c} u={u} onPress={() => addWater(repo, day, { c })} />)}
    </View>
    <List style={{ marginTop: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 56, paddingVertical: 10, paddingLeft: 16, paddingRight: 10 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <KitText weight={600} size={15.5} lineHeight={1.25} tracking={-0.01}>{t('foodWaterOther')}</KitText>
          <KitText weight={500} size={13} lineHeight={1.35} color="text-muted" style={{ marginTop: 2 }}>{t(u === 'ml' ? 'foodSteps50' : 'foodSteps1')}</KitText>
        </View>
        <PillStepper label={t('foodWaterOther')} value={shown} step={u === 'ml' ? 50 : 1} min={u === 'ml' ? 50 : 1} max={u === 'ml' ? 2000 : 64} color="water" tint="water"
          format={() => `${shown} ${unitLabel(u)}`} onChange={() => {}} onStep={d => setO(stepOther(otherOz, u, d > 0))} />
        <Tappable dim="fill" accessibilityRole="button" accessibilityLabel={fill(t('foodAddAmount'), { v: sizeSpoken(otherOz, u) })} onPress={() => addWater(repo, day, { oz: otherOz })}
          style={{ minHeight: 44, minWidth: 56, paddingHorizontal: 14, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: k.tint(k.c.water, 0.15) }}>
          <KitText weight={700} size={15} color="water">{t('foodAddWord')}</KitText>
        </Tappable>
      </View>
    </List>
    <SectionLabel title={isToday ? t('foodToday') : t('foodThatDayCap')} aside={log.length ? plural(log.length, t('foodDrink'), t('foodDrinks')) : undefined} asideNumeric />
    {log.length ? <List>
      {log.map((d, i) => <View key={d.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 10, paddingLeft: 16, paddingRight: 4 }}>
        {i > 0 && <RowLine inset={60} />}
        <View style={{ width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: k.tint(k.c.water, 0.16) }}><WaterIcon name={d.icon} size={18} color={k.c.water} /></View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <KitText weight={600} size={15.5} lineHeight={1.25} tracking={-0.01} numberOfLines={1}>{d.name}</KitText>
          <KitText weight={500} size={13} lineHeight={1.35} tracking={-0.02} numeric color="text-muted" style={{ marginTop: 2 }}>{sizeText(d.oz, u)}</KitText>
        </View>
        <KitText weight={500} size={13.5} tracking={-0.01} numeric color="text-muted">{clock(d.at)}</KitText>
        <Tappable dim="fill" accessibilityRole="button" accessibilityLabel={fill(t('foodRemoveDrink'), { name: d.name, time: clock(d.at) })} onPress={() => dropWater(repo, day, d.id)}
          style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }}><Icon name="x" size={16} color={k.c['text-muted']} /></Tappable>
      </View>)}
    </List> : <EmptyState icon="water" color="water" title={isToday ? t('foodNoWaterToday') : t('foodNoWaterDay')} description={t('foodNoWaterHint')} />}
    <Caption center>{fill(t('foodWaterGoalNote'), { goal: waterAmt(g, u) })}</Caption>
  </FoodSheet>;
}

/** A container you tap to add (`.fd-wc`): its picture with a small plus, its name and size. */
function ContainerButton({ c, u, onPress }: { c: Container; u: WaterUnit; onPress: () => void }) {
  const k = useKit();
  return <PressScale accessibilityRole="button" accessibilityLabel={fill(t('foodAddContainer'), { name: c.name, size: sizeSpoken(c.oz, u) })} onPress={onPress}
    style={{ flexBasis: '47%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingVertical: 10, paddingRight: 10, paddingLeft: 12, borderRadius: 18, backgroundColor: k.cardBg, boxShadow: k.cardEdge }}>
    <View style={{ width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: k.tint(k.c.water, 0.15) }}>
      <WaterIcon name={c.icon} size={26} color={k.c.water} />
      <View style={{ position: 'absolute', right: -5, bottom: -5, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: k.c.water, boxShadow: `0px 0px 0px 2.5px ${k.cardBg}` }}>
        <Icon name="plus" size={12} color={k.c['on-accent']} />
      </View>
    </View>
    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
      <KitText weight={600} size={15} lineHeight={1.2} tracking={-0.01} numberOfLines={1}>{c.name}</KitText>
      <KitText weight={500} size={13} tracking={-0.02} numeric color="text-muted">{`${sizeNum(c.oz, u)} ${unitLabel(u)}`}</KitText>
    </View>
  </PressScale>;
}
