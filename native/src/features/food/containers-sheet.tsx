import { useState } from 'react';
import { PanResponder, Switch as RNSwitch, View } from 'react-native';
import { Button, Chip, Chips, Icon, KitText, List, SegmentedControl, SheetHeader, Tappable, TextField, useKit } from '@/components/kit';
import type { Repository } from '@/data/repository';
import { t } from '@/i18n/en';
import { fill } from '../tiles/ui';
import { closeSheet, FoodSheet, LinkRow, RowLine, useLatest } from './sheet';
import { Caption, SectionLabel, WaterIcon } from './ui';
import { showToast } from '../shell/toast';
import { useFoodRevision } from './use-food-revision';
import { FLOZ, QUICK_MAX, QUICK_MIN, WATER_ICONS, quickContainers, readWater, setContainers, setWaterUnit, sizeSpoken, sizeText, type Container, type WaterIconName, type WaterUnit } from './water';

const OZ_PRESETS = [8, 12, 16.9, 20, 24, 32, 40], ML_PRESETS = [250, 330, 500, 750, 1000];
const ROW = 60;
const ICON_NAME: Record<WaterIconName, () => string> = { glass: () => t('foodIcGlass'), bottle: () => t('foodIcBottle'), tumbler: () => t('foodIcTumbler'), jug: () => t('foodIcJug') };

interface Draft { name: string; oz: number | null; icon: WaterIconName; quick: boolean }
/** A draft size is a real container: 1 to 135 oz (about 4 L). */
export const draftOk = (d: Pick<Draft, 'oz'>) => d.oz != null && d.oz >= 1 && d.oz <= 135;
/** Moves one container from one place to another. */
export function moveContainer(cs: Container[], from: number, to: number) {
  const next = cs.slice(), [c] = next.splice(from, 1); next.splice(Math.max(0, Math.min(next.length, to)), 0, c); return next;
}

/**
 * Containers (`water-containers`): units, the order (drag the grip, or swipe up or down on it with VoiceOver), which
 * 2 to 4 are quick add, and a form to add or edit one. Saved on the phone on every change.
 */
export function ContainersSheet({ repo }: { repo: Repository }) {
  useFoodRevision(repo);
  const s = readWater(repo), cs = s.containers, u = s.unit, nq = quickContainers(s).length;
  const [edit, setEdit] = useState<string | null>(null);
  if (edit) return <ContainerForm repo={repo} id={edit} onDone={() => setEdit(null)} />;
  const toggle = (c: Container, on: boolean) => {
    if (on && nq >= QUICK_MAX) { showToast(t('foodQuickHolds4'), { color: 'water' }); return; }
    if (!on && nq <= QUICK_MIN) { showToast(t('foodKeep2Quick'), { color: 'water' }); return; }
    setContainers(repo, cs.map(x => x.id === c.id ? { ...x, quick: on } : x));
  };
  const move = (from: number, to: number) => { if (from === to) return; setContainers(repo, moveContainer(cs, from, to)); };
  return <FoodSheet testID="food-containers-sheet" header={<SheetHeader title={t('foodContainers')} left={t('shellDone')} onLeft={() => closeSheet()} />}>
    <SectionLabel title={t('foodUnits')} inset first />
    <SegmentedControl label={t('foodUnits')} value={u} onChange={(v: WaterUnit) => setWaterUnit(repo, v)}
      options={[{ value: 'oz', label: t('foodFluidOunces') }, { value: 'ml', label: t('foodMilliliters') }]} />
    <SectionLabel title={t('foodYourContainers')} aside={fill(t('foodNOnQuick'), { n: nq })} />
    <List>
      {cs.map((c, i) => <ContainerRow key={c.id} c={c} u={u} i={i} count={cs.length} onEdit={() => setEdit(c.id)} onToggle={on => toggle(c, on)}
        onMove={(to, spoken) => { move(i, to); if (spoken) showToast(fill(t('foodMovedTo'), { name: c.name, n: to + 1 }), { color: 'water' }); else showToast(t('foodOrderSaved'), { color: 'water' }); }} />)}
      <LinkRow first={false} icon="plus" color="water" title={t('foodAddContainerRow')} sub={t('foodAddContainerSub')} onPress={() => setEdit('new')} />
    </List>
    <Caption>{t('foodContainersNote')}</Caption>
  </FoodSheet>;
}

function ContainerRow({ c, u, i, count, onEdit, onToggle, onMove }: {
  c: Container; u: WaterUnit; i: number; count: number; onEdit: () => void; onToggle: (on: boolean) => void; onMove: (to: number, spoken: boolean) => void;
}) {
  const k = useKit();
  const [dy, setDy] = useState(0), [drag, setDrag] = useState(false);
  const live = useLatest({ i, count, onMove });
  const [pan] = useState(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true, onMoveShouldSetPanResponder: () => true, onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => { setDrag(true); setDy(0); },
    onPanResponderMove: (_, g) => setDy(g.dy),
    onPanResponderRelease: (_, g) => { setDrag(false); setDy(0); const { i: at, count: n, onMove: mv } = live(); const to = Math.max(0, Math.min(n - 1, at + Math.round(g.dy / ROW))); if (to !== at) mv(to, false); },
    onPanResponderTerminate: () => { setDrag(false); setDy(0); },
  }));
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: ROW, paddingLeft: 2, paddingRight: 8, backgroundColor: drag ? k.cardBg : 'transparent',
    zIndex: drag ? 2 : 0, transform: [{ translateY: dy }, { scale: drag && !k.reduceMotion ? 1.02 : 1 }], boxShadow: drag ? '0px 10px 24px -10px rgba(0,0,0,0.6)' : undefined }}>
    {i > 0 && !drag && <RowLine inset={0} />}
    <View {...pan.panHandlers} accessible accessibilityRole="adjustable" accessibilityLabel={fill(t('foodReorder'), { name: c.name })}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={e => { const to = i + (e.nativeEvent.actionName === 'decrement' ? 1 : -1); if (to >= 0 && to < count) onMove(to, true); }}
      style={{ width: 36, height: 44, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name="rt-grip" size={20} color={k.c.ghost} />
    </View>
    <Tappable dim="row" accessibilityRole="button" accessibilityLabel={fill(t('foodEditNamed'), { name: c.name, size: sizeSpoken(c.oz, u) })} onPress={onEdit}
      style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 }}>
      <View style={{ width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: k.tint(k.c.water, 0.15) }}><WaterIcon name={c.icon} size={20} color={k.c.water} /></View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <KitText weight={600} size={15.5} lineHeight={1.25} numberOfLines={1}>{c.name}</KitText>
        <KitText weight={500} size={13} numeric color="text-muted">{sizeText(c.oz, u) + (c.quick ? ` · ${t('foodTileQuick')}` : '')}</KitText>
      </View>
      <View style={{ marginRight: 4 }}><Icon name="chevron-right" size={16} color={k.c.ghost} /></View>
    </Tappable>
    <WaterSwitch value={c.quick} label={fill(t('foodQuickAddNamed'), { name: c.name })} onChange={onToggle} />
  </View>;
}

function WaterSwitch({ value, onChange, label, disabled }: { value: boolean; onChange: (on: boolean) => void; label: string; disabled?: boolean }) {
  const k = useKit();
  return <RNSwitch accessibilityLabel={label} value={value} onValueChange={onChange} disabled={disabled}
    trackColor={{ false: k.c['hair-2'], true: k.c.water }} thumbColor="#FFFFFF" ios_backgroundColor={k.c['hair-2']} style={disabled ? { opacity: 0.45 } : undefined} />;
}

function ContainerForm({ repo, id, onDone }: { repo: Repository; id: string; onDone: () => void }) {
  const k = useKit();
  const s = readWater(repo), cs = s.containers, u = s.unit, ml = u === 'ml', cur = id === 'new' ? null : cs.find(c => c.id === id) ?? null, nq = quickContainers(s).length;
  const [d, setD] = useState<Draft>(() => cur ? { name: cur.name, oz: cur.oz, icon: cur.icon, quick: cur.quick } : { name: '', oz: null, icon: 'bottle', quick: nq < QUICK_MAX });
  const [sizeText_, setSizeText] = useState(() => d.oz == null ? '' : ml ? String(Math.round(d.oz / FLOZ * 1000)) : String(Math.round(d.oz * 10) / 10));
  const qFull = !d.quick && nq >= QUICK_MAX && !cur?.quick;
  const presets: [number, string][] = ml ? ML_PRESETS.map(v => [v / 1000 * FLOZ, `${v.toLocaleString('en-US')} mL`]) : OZ_PRESETS.map(v => [v, `${v} oz`]);
  const shownName = d.name.trim() || ICON_NAME[d.icon]();
  const setSize = (text: string) => { setSizeText(text); const v = parseFloat(text.replace(/,/g, '')); setD(x => ({ ...x, oz: Number.isFinite(v) && v > 0 ? (ml ? v / 1000 * FLOZ : v) : null })); };
  const save = () => {
    if (!draftOk(d)) return;
    const oz = Math.round(d.oz! * 10) / 10, name = shownName;
    if (!cur) setContainers(repo, [...cs, { id: `c${Date.now().toString(36)}`, name, oz, icon: d.icon, quick: d.quick && nq < QUICK_MAX }]);
    else setContainers(repo, cs.map(c => c.id !== cur.id ? c : { ...c, name, oz, icon: d.icon, quick: d.quick !== c.quick && !(!d.quick && nq <= QUICK_MIN) ? d.quick : c.quick }));
    onDone(); showToast(fill(t(cur ? 'foodSavedContainer' : 'foodAddedContainer'), { name, size: sizeText(oz, u) }), { color: 'water' });
  };
  const remove = () => {
    if (!cur || cs.length <= 1) return;
    const was = cs; setContainers(repo, cs.filter(c => c.id !== cur.id)); onDone();
    showToast(fill(t('foodContainerRemoved'), { name: cur.name }), { color: 'water', ms: 4200, action: { label: t('foodUndoBtn'), onAction: () => { setContainers(repo, was); showToast(fill(t('foodContainerBack'), { name: cur.name }), { color: 'water' }); } } });
  };
  return <FoodSheet testID="food-container-form" header={<SheetHeader title={t(cur ? 'foodEditContainer' : 'foodNewContainer')} left={t('cancel')} onLeft={onDone} right={t('foodSave')} onRight={save} rightDisabled={!draftOk(d)} />}>
    <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={{ alignItems: 'center', gap: 4, marginTop: 8, marginBottom: 18 }}>
      <View style={{ width: 72, height: 72, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 6, backgroundColor: k.tint(k.c.water, 0.15) }}><WaterIcon name={d.icon} size={34} color={k.c.water} /></View>
      <KitText weight={700} size={20} lineHeight={1.2} tracking={-0.02} numberOfLines={1}>{shownName}</KitText>
      <KitText weight={500} size={14} numeric color="text-muted">{d.oz ? sizeText(d.oz, u) : t('foodChooseSize')}</KitText>
    </View>
    <View style={{ gap: 10 }}>
      <TextField label={t('foodNameLabel')} value={d.name} onChangeText={name => setD(x => ({ ...x, name }))} placeholder={t('foodContainerPlaceholder')} maxLength={24} autoComplete="off" autoFocus={!cur} />
      <TextField label={t('foodSizeLabel')} value={sizeText_} onChangeText={setSize} placeholder={ml ? '946' : '32'} keyboardType="decimal-pad" unit={ml ? 'mL' : 'oz'} />
    </View>
    <Chips style={{ marginTop: 6 }}>
      {presets.map(([oz, label]) => <Chip key={label} label={label} color="water" selected={d.oz != null && Math.abs(d.oz - oz) < 0.05}
        onPress={() => { setD(x => ({ ...x, oz })); setSizeText(ml ? String(Math.round(oz / FLOZ * 1000)) : String(Math.round(oz * 10) / 10)); }} />)}
    </Chips>
    <SectionLabel title={t('foodIconLabel')} />
    <View accessibilityRole="radiogroup" accessibilityLabel={t('foodIconLabel')} style={{ flexDirection: 'row', gap: 8 }}>
      {WATER_ICONS.map(ic => { const on = d.icon === ic;
        return <Tappable key={ic} dim="fill" accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={ICON_NAME[ic]()} onPress={() => setD(x => ({ ...x, icon: ic }))}
          style={{ flex: 1, alignItems: 'center', gap: 6, minHeight: 76, paddingTop: 12, paddingHorizontal: 4, paddingBottom: 10, borderRadius: 16,
            backgroundColor: on ? k.tint(k.c.water, 0.14) : k.cardBg, boxShadow: on ? `inset 0px 0px 0px 2px ${k.c.water}` : k.cardEdge }}>
          <WaterIcon name={ic} size={28} color={on ? k.c.water : k.c['text-muted']} />
          <KitText weight={600} size={12.5} color={on ? 'water' : 'text-muted'}>{ICON_NAME[ic]()}</KitText>
        </Tappable>; })}
    </View>
    <List style={{ marginTop: 20 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 10, paddingHorizontal: 16 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <KitText weight={600} size={15.5} lineHeight={1.25}>{t('foodTileQuick')}</KitText>
          <KitText weight={500} size={13} color="text-muted" style={{ marginTop: 2 }}>{t(qFull ? 'foodQuickFullHint' : 'foodQuickHint')}</KitText>
        </View>
        <WaterSwitch value={d.quick} disabled={qFull} label={t('foodTileQuick')} onChange={quick => setD(x => ({ ...x, quick }))} />
      </View>
    </List>
    {cur ? <View style={{ marginTop: 16 }}><Button full variant="secondary" color="danger" label={t('foodRemoveContainer')} disabled={cs.length <= 1} onPress={remove} /></View> : null}
    {cur && cs.length <= 1 ? <Caption center>{t('foodKeepOne')}</Caption> : null}
    <Caption center>{t('foodDrinksKeepSize')}</Caption>
  </FoodSheet>;
}
