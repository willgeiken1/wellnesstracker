import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { Platform, ScrollView, Share, TextInput, View, type GestureResponderEvent } from 'react-native';
import Svg, { Circle, G, Line, Path, Text as SvgText } from 'react-native-svg';
import { router } from 'expo-router';
import { Chip, Icon, type IconName, KitText, List, ListRow, SegmentedControl, SheetHeader, Tappable, font, mix, useKit } from '@/components/kit';
import { capitals } from '@/components/kit-style';
import { tokens } from '@/design/tokens';
import { showToast } from '@/features/shell/toast';
import { t } from '@/i18n/en';
import { fill } from '../tiles/ui';
import {
  addDays, convert, CONVERT_UNITS, dateOf, fnum, h12, hax, IU_FOR, ITEM_TYPES, needsVitamin, pretty, rById, rItems, rng, ROUTINE_COLORS, shortDate, UNITS,
  type ConvertUnit, type ItemKind, type ItemType, type RoutineColor, type Vitamin,
} from './model';
import { closeRoutines, routinesRoutes } from './nav';
import { Blk, ClearPill, Cta, DoseCard, Gauge, GhostBtn, Help, Lbx, Nudges, Readout, RtSheet, SheetTitle, UnitSeg, useRt } from './route-parts';
import { useRoutines, type NewItem, type RoutinesStore } from './store';

/* The four Routines sheets: Add item, Unit converter, Pause routine and New routine. */

const TYPE_ICON: Record<ItemType, IconName> = { Supplement: 'rt-pill', Peptide: 'rt-vial', Medication: 'rt-med', Enhancer: 'rt-bolt', Other: 'rt-dots' };
const TYPE_NAME: Record<ItemType, string> = {
  Supplement: t('routinesTSupplement'), Peptide: t('routinesTPeptide'), Medication: t('routinesTMedication'), Enhancer: t('routinesTEnhancer'), Other: t('routinesTOther'),
};

/** The open Add item sheet takes a note from the converter it opened. */
let noteSink: ((note: string) => void) | null = null;

/** Width of a view once laid out. */
function useWidth() {
  const [w, setW] = useState(0);
  return [w, (e: { nativeEvent: { layout: { width: number } } }) => setW(e.nativeEvent.layout.width)] as const;
}

/** Touch handlers that report the x of a press and a drag, in the view's own points. */
function pressX(onX: (x: number, start: boolean) => void, onEnd?: () => void) {
  return {
    onStartShouldSetResponder: () => true, onMoveShouldSetResponder: () => true, onResponderTerminationRequest: () => false,
    onResponderGrant: (e: GestureResponderEvent) => onX(e.nativeEvent.locationX, true),
    onResponderMove: (e: GestureResponderEvent) => onX(e.nativeEvent.locationX, false),
    onResponderRelease: () => onEnd?.(), onResponderTerminate: () => onEnd?.(),
  };
}

/* ---------- Add item ---------- */

/** The Add item sheet's time arc: 300 x 122, 5 AM to 11 PM. */
const apt = (h: number): [number, number] => { const a = Math.PI * (1 - (h - 5) / 18); return [150 + 130 * Math.cos(a), 100 - 80 * Math.sin(a)]; };
const aseg = (a: number, b: number) => { const p = apt(a), q = apt(b); return `M${p[0].toFixed(1)} ${p[1].toFixed(1)} A130 80 0 0 1 ${q[0].toFixed(1)} ${q[1].toFixed(1)}`; };

export function AddItem({ store, type, routine }: { store: RoutinesStore; type?: string; routine?: string }) {
  const k = useKit(), c = k.c, rt = useRt(), { s } = useRoutines(store);
  const pre = (ITEM_TYPES as readonly string[]).includes(type ?? '') ? (type as ItemType) : '';
  const [d, setD] = useState<NewItem>(() => ({
    name: '', type: pre, kind: pre === 'Peptide' || pre === 'Supplement' || pre === 'Medication' ? 'dose' : 'check', amt: null, unit: '',
    routines: routine && rById(s, routine) ? [routine] : [], time: null, hand: '', mixed: '', note: null,
  }));
  const set = (p: Partial<NewItem>) => setD(x => ({ ...x, ...p }));
  useEffect(() => { noteSink = note => setD(x => ({ ...x, note })); return () => { noteSink = null; }; }, []);
  const [w, onW] = useWidth(), [aw, onAw] = useWidth();
  const dose = d.kind === 'dose', RL = s.routines;
  const picked = RL.filter(r => d.routines.includes(r.id));
  const setFromX = (x: number) => {
    if (aw <= 0) return;
    const vx = (x / aw) * 300, cc = Math.max(-1, Math.min(1, (vx - 150) / 130));
    const hv = Math.round((5 + 18 * (1 - Math.acos(cc) / Math.PI)) * 12) / 12;
    set({ time: Math.max(5, Math.min(23, hv)) });
  };
  let big: string, sm: string;
  if (d.time != null) {
    const inr = RL.find(r => d.time! >= r.from && d.time! <= r.to);
    big = h12(d.time); sm = inr ? fill(t('routinesInName'), { name: inr.name }) : t('routinesOwnTime');
  } else if (picked.length === 1) { big = picked[0].name; sm = fill(t('routinesAtStart'), { time: h12(picked[0].from) }); }
  else if (picked.length > 1) { big = fill(t('routinesNRoutines'), { n: picked.length }); sm = t('routinesEachStart'); }
  else { big = t('routinesNoRoutine'); sm = t('routinesPickBelow'); }
  const summary = d.amt != null && d.unit ? fill(t('routinesLogsEach'), { amt: pretty(d.amt), unit: d.unit }) : d.amt != null ? t('routinesPickUnit') : t('routinesTypeAmount');

  const save = () => {
    const ok = d.name.trim() && (!dose || (d.amt != null && d.unit));
    if (!ok) { showToast(dose ? t('routinesNeedDose') : t('routinesNeedName'), { color: 'warning' }); return; }
    const { undo } = store.addItem(d);
    closeRoutines();
    showToast(t('routinesItemAdded'), { color: 'sleep', action: { label: t('routinesUndo'), onAction: undo } });
  };
  const arcH = (aw * 122) / 300;
  const lbl = { fill: c['text-muted'], fontFamily: tokens.font.bodyStrong } as const;

  return <RtSheet testID="routines-add-item" header={<SheetTitle title={t('routinesAddItem')} onClose={closeRoutines} />}>
    <Blk>
      <Lbx>{t('routinesName')}</Lbx>
      <TextInput testID="routines-add-name" accessibilityLabel={t('routinesName')} value={d.name} onChangeText={v => set({ name: v })} maxLength={80}
        placeholder={t('routinesWhatIsIt')} placeholderTextColor={c.ghost ?? c['text-muted']} autoComplete="off" selectionColor={c.accent} cursorColor={c.accent}
        style={[font(700, 26, undefined, -0.03), { color: c.text, borderBottomWidth: 2, borderBottomColor: c['hair-2'], paddingTop: 2, paddingBottom: 6, paddingHorizontal: 0 }]} />
    </Blk>
    <Blk>
      <Lbx right={t('routinesOptional')}>{t('routinesType')}</Lbx>
      <View accessibilityRole="radiogroup" accessibilityLabel={t('routinesType')} style={{ flexDirection: 'row', gap: 2 }}>
        {ITEM_TYPES.map(ty => {
          const on = d.type === ty;
          return <Tappable key={ty} dim="fill" accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={TYPE_NAME[ty]}
            onPress={() => set({ type: on ? '' : ty })} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
            <View style={{ width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, borderColor: on ? c.sleep : c['hair-2'], backgroundColor: on ? c.sleep : 'transparent',
              alignItems: 'center', justifyContent: 'center', boxShadow: on ? 'inset 0 -3px 0 rgba(20,20,20,0.12)' : undefined }}>
              <Icon name={TYPE_ICON[ty]} size={20} color={on ? rt.ink : c['text-muted']} />
            </View>
            <KitText weight={600} size={11} lineHeight={1.2} color={on ? 'text' : 'text-muted'} numberOfLines={1} style={{ textAlign: 'center', width: 80, alignSelf: 'center' }}>{TYPE_NAME[ty]}</KitText>
          </Tappable>;
        })}
        <Tappable dim="fill" accessibilityRole="button" accessibilityLabel={t('routinesNewType')} onPress={() => showToast(t('routinesNewTypeToast'), { color: 'sleep' })}
          style={{ flex: 1, alignItems: 'center', gap: 6 }}>
          <View style={{ width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, borderStyle: 'dashed', borderColor: c['hair-2'], alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="plus" size={20} color={c['text-muted']} />
          </View>
          <KitText weight={600} size={11} lineHeight={1.2} color="text-muted" numberOfLines={1} style={{ textAlign: 'center' }}>{t('routinesNewType')}</KitText>
        </Tappable>
      </View>
    </Blk>
    <Blk>
      <Lbx>{t('routinesLogAs')}</Lbx>
      <View accessibilityRole="radiogroup" accessibilityLabel={t('routinesLogAs')} style={{ flexDirection: 'row', gap: 8 }}>
        {([['check', 'rt-checkc', t('routinesCheck'), t('routinesCheckSub')], ['dose', 'rt-vial', t('routinesDose'), t('routinesDoseSub')]] as [ItemKind, IconName, string, string][]).map(([kind, icon, title, sub]) => {
          const on = d.kind === kind;
          return <Tappable key={kind} dim="fill" accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={`${title}. ${sub}`} onPress={() => set({ kind })}
            style={{ flex: 1, borderRadius: 20, padding: 12, gap: 6, backgroundColor: on ? c.accent : rt.raised, boxShadow: on ? undefined : rt.edge }}>
            <Icon name={icon} size={22} color={on ? rt.ink : c.text} />
            <KitText weight={700} size={17} color={on ? rt.ink : 'text'}>{title}</KitText>
            <KitText weight={500} size={12} lineHeight={1.35} color={on ? rt.inkm : 'text-muted'}>{sub}</KitText>
          </Tappable>;
        })}
      </View>
    </Blk>
    {dose ? <View style={{ gap: 16 }}>
      <View onLayout={onW}>
        <DoseCard color={c.accent} label={t('routinesAmount')} right={<ClearPill label={t('routinesClearAmount')} disabled={d.amt == null} onPress={() => set({ amt: null })} />}>
          <Readout testID="routines-add-amount" label={t('routinesAmount')} value={d.amt} unit={d.unit || null} onChange={amt => set({ amt })} />
          <UnitSeg units={UNITS} value={d.unit as (typeof UNITS)[number] | ''} onChange={unit => set({ unit })} label={t('routinesUnit')} cardColor={c.accent} />
          <Nudges caps value={d.amt} onChange={amt => set({ amt })} cardColor={c.accent} />
          <Gauge value={d.amt} width={Math.max(0, w - 28)} />
          <KitText weight={d.amt != null && d.unit ? 700 : 600} size={13} color={d.amt != null && d.unit ? rt.ink : rt.inkm} accessibilityLiveRegion="polite">{summary}</KitText>
        </DoseCard>
      </View>
      <Help>{t('routinesDoseHelp')}</Help>
      <Tappable dim="fill" accessibilityRole="button" accessibilityLabel={t('routinesUnitConverter')}
        onPress={() => routinesRoutes.converter({ from: 'add-item', amt: d.amt != null ? String(d.amt) : undefined, unit: d.unit || undefined })}
        style={{ backgroundColor: rt.well, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, boxShadow: rt.edge }}>
        <Icon name="rt-calc" size={20} color={c.sleep} />
        <View style={{ flex: 1, gap: 1 }}>
          <KitText weight={700} size={14}>{t('routinesUnitConverter')}</KitText>
          <KitText weight={600} size={12} color="text-muted">{d.note ? d.note : t('routinesConvSub')}</KitText>
        </View>
        <Icon name="chevron-right" size={16} color={c['text-muted']} />
      </Tappable>
    </View> : null}
    <Blk>
      <Lbx>{t('routinesRoutinesAndTime')}</Lbx>
      <View style={{ backgroundColor: rt.well, borderRadius: 22, paddingTop: 10, paddingHorizontal: 8, paddingBottom: 12, gap: 10, boxShadow: rt.edge }}>
        <View onLayout={onAw} accessible accessibilityRole="adjustable" accessibilityLabel={t('routinesArcLabel')}
          accessibilityValue={{ text: d.time != null ? h12(d.time) : t('routinesRoutineStart') }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={e => { const v = d.time ?? 7; set({ time: e.nativeEvent.actionName === 'increment' ? Math.min(23, v + 0.25) : Math.max(5, v - 0.25) }); }}
          {...pressX(x => setFromX(x))} style={{ height: arcH || 1 }}>
          {aw > 0 ? <Svg width={aw} height={arcH} viewBox="0 0 300 122" pointerEvents="none">
            <Path d="M20 100 A130 80 0 0 1 280 100" fill="none" stroke={c['hair-2']} strokeWidth={2} strokeDasharray="1 6" strokeLinecap="round" />
            {RL.map(r => { const on = d.routines.includes(r.id); return <Path key={r.id} d={aseg(r.from, Math.min(23, r.to))} fill="none" stroke={c[r.color]} strokeLinecap="round" strokeWidth={on ? 9 : 4} opacity={on ? 1 : 0.4} />; })}
            {d.time != null ? (() => { const q = apt(d.time); return <>
              <Line x1={q[0]} y1={100} x2={q[0]} y2={q[1]} stroke={c.text} strokeWidth={1.4} strokeDasharray="2 3" />
              <Circle cx={q[0]} cy={q[1]} r={8} fill="#FFFDF2" stroke="#141414" strokeWidth={3} />
            </>; })() : null}
            <Line x1={10} y1={100} x2={290} y2={100} stroke={c['text-muted']} strokeWidth={1.3} />
            {[[20, 5], [85, 11], [150, 14], [215, 17], [280, 23]].map(([x, h]) => <SvgText key={h} x={x} y={116} textAnchor="middle" fontSize={10} {...lbl}>{hax(h)}</SvgText>)}
            <SvgText x={150} y={84} textAnchor="middle" fill={c['text-muted']} fontFamily={tokens.font.bodyStrong} fontSize={11}>{sm}</SvgText>
          </Svg> : null}
          {aw > 0 ? <ArcNumber size={21} baseline={66} scale={aw / 300}>{big}</ArcNumber> : null}
        </View>
        <View accessibilityRole="none" accessibilityLabel={t('routinesTitle')} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 4 }}>
          {RL.map(r => {
            const on = d.routines.includes(r.id);
            return <Tappable key={r.id} dim="fill" accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={r.name}
              onPress={() => set({ routines: on ? d.routines.filter(x => x !== r.id) : [...d.routines, r.id] })}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 38, borderWidth: 1.5, borderColor: on ? c.text : c['hair-2'], borderRadius: 999, paddingLeft: 9, paddingRight: 12 }}>
              <View style={{ width: 16, height: 16, borderRadius: 8, borderWidth: 1.6, borderColor: on ? 'transparent' : c['hair-2'], alignItems: 'center', justifyContent: 'center' }}>
                <View style={{ width: on ? 16 : 6, height: on ? 16 : 6, borderRadius: 8, backgroundColor: c[r.color] }} />
              </View>
              <KitText weight={600} size={13.5} color={on ? 'text' : 'text-muted'}>{r.name}</KitText>
            </Tappable>;
          })}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 }}>
          <KitText weight={600} size={13} color="text-muted">{t('routinesTime')}</KitText>
          <KitText weight={d.time != null ? 700 : 500} size={13} numeric color={d.time != null ? 'text' : (c.ghost ? 'ghost' : 'text-muted')}>{d.time != null ? h12(d.time) : t('routinesRoutineStart')}</KitText>
          {d.time != null ? <Tappable dim="fill" accessibilityRole="button" accessibilityLabel={t('routinesClearTime')} onPress={() => set({ time: null })} hitSlop={{ top: 9, bottom: 9, left: 4, right: 4 }}
            style={{ marginLeft: 'auto', borderWidth: 1, borderColor: c['hair-2'], borderRadius: 999, paddingVertical: 4, paddingHorizontal: 11 }}>
            <KitText weight={600} size={12.5} color="text-muted">{t('routinesClear')}</KitText>
          </Tappable> : null}
        </View>
      </View>
      <Help>{d.type ? t('routinesHelpTyped') : t('routinesHelpMulti')}</Help>
    </Blk>
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <MiniField label={t('routinesOnHand')} placeholder={t('routinesHiddenPh')} value={d.hand} numeric onChange={v => set({ hand: v.replace(/\D/g, '') })} />
        {dose ? <MiniField label={t('routinesMixedOn')} placeholder={t('routinesNotMixed')} value={d.mixed} onChange={v => set({ mixed: v })} /> : null}
      </View>
      <Help>{dose ? t('routinesHelpDose') : t('routinesHelpCheck')}</Help>
    </View>
    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
      <Icon name="info" size={16} color={c['text-muted']} />
      <KitText weight={500} size={12.5} color="text-muted" style={{ flex: 1 }}>{t('routinesCustomItem')}</KitText>
    </View>
    <Cta testID="routines-add-save" label={t('routinesAddItem')} onPress={save} />
  </RtSheet>;
}

/** A small labelled field on the well (`.rt-mini`). */
function MiniField({ label, placeholder, value, onChange, numeric }: { label: string; placeholder: string; value: string; onChange: (v: string) => void; numeric?: boolean }) {
  const k = useKit(), rt = useRt();
  return <View style={{ flex: 1, backgroundColor: rt.well, borderRadius: 16, paddingVertical: 9, paddingHorizontal: 12, gap: 2, minHeight: 56, boxShadow: rt.edge }}>
    <KitText weight={600} size={11} color="text-muted">{label}</KitText>
    <TextInput accessibilityLabel={label} value={value} onChangeText={onChange} placeholder={placeholder} autoComplete="off"
      keyboardType={numeric ? 'number-pad' : 'default'} inputMode={numeric ? 'numeric' : 'text'}
      placeholderTextColor={k.c.ghost ?? k.c['text-muted']} selectionColor={k.c.accent} cursorColor={k.c.accent}
      style={[font(600, 15), { color: k.c.text, padding: 0, fontVariant: ['tabular-nums'] }]} />
  </View>;
}

/* ---------- Unit converter ---------- */

export function Converter({ from, amt, unit }: { from?: string; amt?: string; unit?: string }) {
  const k = useKit(), c = k.c, rt = useRt(), fromAI = from === 'add-item';
  const [C, setC] = useState(() => {
    const f: ConvertUnit = (CONVERT_UNITS as readonly string[]).includes(unit ?? '') ? (unit as ConvertUnit) : 'mcg';
    const a = amt != null && amt !== '' && Number.isFinite(Number(amt)) ? Number(amt) : 250;
    return { amt: a as number | null, from: f, to: (f === 'mg' || f === 'IU' ? 'mcg' : f === 'mL' ? 'mL' : 'mg') as ConvertUnit, vit: 'd3' as Vitamin };
  });
  const set = (p: Partial<typeof C>) => setC(x => ({ ...x, ...p }));
  const r = convert(C), iu = needsVitamin(C.from, C.to);
  const lad: ConvertUnit[] = C.from === 'mL' || C.to === 'mL' ? ['mL'] : ['mcg', 'mg', ...(iu || C.from === 'IU' ? ['IU' as const] : [])];
  const result = r.ok && r.v != null ? `${fnum(r.v)} ${C.to}` : '';
  const copy = async () => {
    if (!r.ok) { showToast(t('routinesNothingToCopy'), { color: 'warning' }); return; }
    const nav = (globalThis as { navigator?: { clipboard?: { writeText(s: string): Promise<void> } } }).navigator;
    if (Platform.OS === 'web' && nav?.clipboard) { await nav.clipboard.writeText(result); showToast(fill(t('routinesCopied'), { v: result }), { color: 'sleep' }); return; }
    await Share.share({ message: result });
  };
  const saveNote = () => {
    if (!r.ok || r.v == null || C.amt == null) { showToast(t('routinesNeedUnits'), { color: 'warning' }); return; }
    noteSink?.(`${fnum(C.amt)} ${C.from} = ${fnum(r.v)} ${C.to}`);
    closeRoutines();
    showToast(t('routinesNoteSaved'), { color: 'sleep' });
  };
  return <RtSheet testID="routines-converter" header={<SheetTitle title={t('routinesUnitConverter')} size={22} onClose={closeRoutines}
    back={fromAI ? t('routinesAddItem') : undefined} top />}>
    <Help>{t('routinesConvHelp')}</Help>
    <DoseCard small color={c.sleep} label={t('routinesAmount')} right={<ClearPill label={t('routinesClearAmount')} disabled={C.amt == null} onPress={() => set({ amt: null })} />}>
      <Readout small testID="routines-conv-amount" label={t('routinesAmount')} value={C.amt} unit={C.from} onChange={a => set({ amt: a })} />
      <UnitSeg units={CONVERT_UNITS} value={C.from} onChange={u => set({ from: u })} label={t('routinesFromUnit')} cardColor={c.sleep} />
      <Nudges value={C.amt} onChange={a => set({ amt: a })} cardColor={c.sleep} />
    </DoseCard>
    <DoseCard small color={c.accent} label={t('routinesConvertTo')}>
      <UnitSeg units={CONVERT_UNITS} value={C.to} onChange={u => set({ to: u })} label={t('routinesToUnit')} cardColor={c.accent} />
      {iu ? <View style={{ gap: 6 }}>
        <KitText weight={700} size={11} tracking={0.14} color={rt.inkm} style={capitals}>{t('routinesIuFor')}</KitText>
        <View accessibilityRole="radiogroup" accessibilityLabel={t('routinesIuForLabel')} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {(Object.keys(IU_FOR) as Vitamin[]).map(v => { const on = C.vit === v; return <Tappable key={v} dim="fill" accessibilityRole="radio" accessibilityState={{ selected: on }}
            accessibilityLabel={IU_FOR[v].n} onPress={() => set({ vit: v })}
            style={{ minHeight: 36, paddingHorizontal: 12, borderRadius: 999, justifyContent: 'center', backgroundColor: on ? rt.ink : rt.glass }}>
            <KitText weight={600} size={13} color={on ? (k.dark ? '#ffffff' : c.accent) : rt.ink}>{IU_FOR[v].n}</KitText>
          </Tappable>; })}
        </View>
      </View> : null}
    </DoseCard>
    <View accessibilityLiveRegion="polite" style={{ backgroundColor: rt.well, borderRadius: 22, padding: 14, gap: 12, boxShadow: rt.edge }}>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
          <KitText weight={700} size={11} tracking={0.14} color="text-muted" style={capitals}>{t('routinesConverted')}</KitText>
          <KitText testID="routines-conv-result" weight={700} size={30} tracking={-0.03} numeric numberOfLines={1} color={r.ok ? 'text' : 'ghost'}>
            {r.ok && r.v != null ? fnum(r.v) : '–'}{r.ok ? <KitText weight={600} size={15} tracking={0} color="text-muted">{` ${C.to}`}</KitText> : null}
          </KitText>
        </View>
        <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
          <KitText weight={700} size={11} tracking={0.14} color="text-muted" style={capitals}>{t('routinesRate')}</KitText>
          <KitText weight={700} size={17} tracking={-0.01} numeric numberOfLines={1} color={r.ok ? 'text' : 'ghost'} style={{ paddingTop: 12.5 }}>{r.ok ? r.rate : '–'}</KitText>
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {lad.map((u, i) => {
          const f = u === C.from, to = u === C.to && C.to !== C.from;
          return <View key={u} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {i ? <KitText weight={600} size={11} color="text-muted">{u === 'mg' ? '× 1,000' : u === 'IU' ? '⇄' : ''}</KitText> : null}
            <View style={{ paddingVertical: 5, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1.5, borderColor: to ? c.accent : f ? c.sleep : c['hair-2'], backgroundColor: to ? c.accent : 'transparent' }}>
              <KitText weight={700} size={12} color={to ? c['on-accent'] : f ? c.sleep : 'text-muted'}>{u}</KitText>
            </View>
          </View>;
        })}
      </View>
      <View style={{ gap: 3, borderTopWidth: 1, borderTopColor: c.hair, paddingTop: 10 }}>
        {r.detail ? <KitText weight={500} size={12.5} lineHeight={1.4} color="text-muted">{r.detail}</KitText> : null}
        {r.lines.map(l => <KitText key={l} weight={500} size={12.5} lineHeight={1.4} numeric>{l}</KitText>)}
      </View>
      <KitText weight={700} size={12.5} color="text-muted">{t('routinesConvNote')}</KitText>
    </View>
    {fromAI ? <>
      <Cta label={t('routinesSaveNote')} onPress={saveNote} />
      <Help style={{ marginTop: -8 }}>{t('routinesSaveNoteHelp')}</Help>
    </> : <Cta label={t('routinesCopyResult')} onPress={() => { void copy(); }} />}
    <GhostBtn label={t('routinesClose')} onPress={closeRoutines} />
  </RtSheet>;
}

/* ---------- Pause routine ---------- */

const WHY = [t('routinesWhyTravel'), t('routinesWhyBreak'), t('routinesWhyUnwell')];
const UNTIL: [number, string][] = [[3, t('routines3Days')], [7, t('routines1Week')], [14, t('routines2Weeks')]];

export function PauseRoutine({ store, routine }: { store: RoutinesStore; routine?: string }) {
  const k = useKit(), c = k.c, rt = useRt(), { s, n } = useRoutines(store);
  const [rid, setRid] = useState(() => (routine && rById(s, routine) ? routine : (rById(s, 'night') ? 'night' : s.routines[0]?.id ?? '')));
  const [why, setWhy] = useState<string | null>(WHY[0]), [days, setDays] = useState(7), [remind, setRemind] = useState(true);
  const strip = useRef<ComponentRef<typeof ScrollView>>(null);
  const r = rById(s, rid);
  const back = addDays(n.day, days), backLabel = shortDate(back);
  const [stripW, setStripW] = useState(0), placed = useRef(false);
  useEffect(() => {
    // Like the mockup's scrollIntoView: the chosen day moves to the middle, and the strip opens unscrolled while it fits.
    if (!stripW) return;
    const fits = 16 + days * 54 - 6 <= stripW, wasPlaced = placed.current;
    placed.current = true;
    if (!wasPlaced && fits) return;
    strip.current?.scrollTo({ x: Math.max(0, 16 + (days - 1) * 54 + 24 - stripW / 2), animated: wasPlaced });
  }, [days, stripW]);
  if (!r) return null;
  const go = () => {
    const undo = store.pause(r.id, back, why);
    closeRoutines();
    showToast(fill(t('routinesPausedToast'), { name: r.name, date: backLabel }), { color: 'sleep', action: { label: t('routinesUndo'), onAction: undo } });
  };
  const nItems = rItems(s, r.id, n, true).length;
  return <RtSheet testID="routines-pause" header={<SheetHeader title={t('routinesPauseRoutine')} left={t('routinesCancel')} onLeft={closeRoutines} right={t('routinesPause')} onRight={go} />}>
    <Help size={14} style={{ marginTop: -6 }}>{t('routinesPauseIntro')}</Help>
    <Blk>
      <Lbx>{t('routinesRoutineWord')}</Lbx>
      <SegmentedControl label={t('routinesRoutineToPause')} options={s.routines.map(x => ({ value: x.id, label: x.name }))} value={r.id} onChange={setRid} />
    </Blk>
    <Blk>
      <Lbx right={t('routinesOptional')}>{t('routinesWhy')}</Lbx>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {WHY.map(w => <Chip key={w} label={w} color="sleep" selected={why === w} onPress={() => setWhy(why === w ? null : w)} />)}
      </View>
    </Blk>
    <Blk>
      <Lbx>{t('routinesUntil')}</Lbx>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {UNTIL.map(([d, l]) => <Chip key={d} label={l} color="sleep" selected={days === d} onPress={() => setDays(d)} />)}
      </View>
      <ScrollView ref={strip} horizontal showsHorizontalScrollIndicator={false} accessibilityLabel={t('routinesPickBack')} onLayout={e => setStripW(e.nativeEvent.layout.width)}
        style={{ marginHorizontal: -16, flexGrow: 0 }} contentContainerStyle={{ gap: 6, paddingHorizontal: 16, paddingVertical: 2 }}>
        {Array.from({ length: 14 }, (_, i) => {
          const d = i + 1, day = addDays(n.day, d), on = d === days, inside = d < days, dt = dateOf(day);
          return <Tappable key={d} dim="fill" accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={fill(t('routinesBackOnDay'), { date: shortDate(day) })}
            onPress={() => setDays(d)} style={{ width: 48, minHeight: 62, borderRadius: 14, alignItems: 'center', justifyContent: 'center', gap: 2,
              backgroundColor: on ? c.sleep : inside ? mix(c.sleep, rt.raised, 0.22) : rt.raised, boxShadow: on ? undefined : `0 0 0 1px ${c.hair}` }}>
            <KitText weight={700} size={10.5} tracking={0.06} color={on ? rt.inkm : 'text-muted'} style={capitals}>{dt.toLocaleDateString('en-US', { weekday: 'short' })}</KitText>
            <KitText weight={700} size={18} numeric color={on ? rt.ink : 'text'}>{String(dt.getDate())}</KitText>
          </Tappable>;
        })}
      </ScrollView>
    </Blk>
    <View style={{ backgroundColor: rt.well, borderRadius: 18, paddingVertical: 12, paddingHorizontal: 14, flexDirection: 'row', gap: 12, alignItems: 'center', boxShadow: `0 0 0 1px ${c.hair}` }}>
      <View style={{ width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: mix(c.sleep, 'transparent', 0.16) }}>
        <Icon name="pause" size={18} color={c.sleep} />
      </View>
      <KitText weight={500} size={14} lineHeight={1.4} style={{ flex: 1 }}>
        <KitText weight={700} size={14}>{fill(t('routinesPausesTonight'), { name: r.name })}</KitText>{fill(t('routinesBackOnRest'), { date: backLabel, n: nItems })}
      </KitText>
    </View>
    <List>
      <ListRow title={t('routinesRemOff')} sub={t('routinesRemOffSub')} toggle={remind} onToggle={setRemind} />
    </List>
    <Cta testID="routines-pause-go" label={fill(t('routinesPauseUntil'), { name: r.name, date: backLabel })} color={c.sleep} ink={rt.ink} onPress={go} />
  </RtSheet>;
}

/* ---------- New routine ---------- */

/** The New routine arc: 260 x 132, 5 AM to 11 PM. */
const P2 = (h: number): [number, number] => { const x = 16 + ((h - 5) * 228) / 18, d = (x - 130) / 114; return [x, 112 - 84 * Math.sqrt(Math.max(0, 1 - d * d))]; };
const nseg = (a: number, b: number) => { const p = P2(a), q = P2(b); return `M${p[0].toFixed(1)} ${p[1].toFixed(1)} A114 84 0 0 1 ${q[0].toFixed(1)} ${q[1].toFixed(1)}`; };
const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const DAY_NAMES = [t('routinesMonday'), t('routinesTuesday'), t('routinesWednesday'), t('routinesThursday'), t('routinesFriday'), t('routinesSaturday'), t('routinesSunday')];
const COLOR_NAME: Record<RoutineColor, string> = { warning: t('routinesColAmber'), sleep: t('routinesColViolet'), recovery: t('routinesColMint'), food: t('routinesColGold'), training: t('routinesColCoral') };

export function NewRoutine({ store }: { store: RoutinesStore }) {
  const k = useKit(), c = k.c, rt = useRt(), { s } = useRoutines(store);
  const dragCaps = t('routinesDragEither').toUpperCase(); // SVG text has no text transform.
  const [name, setName] = useState(''), [from, setFrom] = useState(15), [to, setTo] = useState(17);
  const [days, setDays] = useState([1, 1, 1, 1, 1, 0, 0]), [color, setColor] = useState<RoutineColor>('food'), [items, setItems] = useState<string[]>([]);
  const [aw, onAw] = useWidth(), drag = useRef<'from' | 'to' | null>(null);
  /** One item to offer: Fish oil in the demo, else the first supplement, else the first item. */
  const suggest = useMemo(() => s.items.find(i => i.id === 'fish') ?? s.items.find(i => i.type === 'Supplement') ?? s.items[0] ?? null, [s.items]);
  const hourAt = (x: number) => { const vx = (x / aw) * 260, h = 5 + ((vx - 16) * 18) / 228; return Math.max(5, Math.min(23, Math.round(h * 4) / 4)); };
  const onX = (x: number, start: boolean) => {
    if (aw <= 0) return;
    const h = hourAt(x);
    if (start) drag.current = Math.abs(h - from) <= Math.abs(h - to) ? 'from' : 'to';
    if (drag.current === 'from') setFrom(Math.min(h, to - 0.5)); else setTo(Math.max(h, from + 0.5));
  };
  const save = () => {
    const nm = name.trim();
    if (!nm) { showToast(t('routinesNeedName'), { color: 'warning' }); return; }
    store.addRoutine({ name: nm, from, to, color, days: days.flatMap((on, i) => (on ? [(i + 1) % 7] : [])), items });
    closeRoutines();
    showToast(fill(t('routinesSaved'), { name: nm }), { color: 'sleep' });
  };
  const h = (aw * 132) / 260;
  return <RtSheet testID="routines-new" header={<SheetTitle title={t('routinesNewRoutine')} onClose={closeRoutines} closeLabel={t('routinesCancel')} />}>
    <Blk>
      <Lbx>{t('routinesName')}</Lbx>
      <TextInput testID="routines-new-name" accessibilityLabel={t('routinesName')} value={name} onChangeText={setName} placeholder={t('routinesNamePh')} autoComplete="off"
        placeholderTextColor={c['text-muted']} selectionColor={c.accent} cursorColor={c.accent}
        style={[font(600, 16), { color: c.text, backgroundColor: rt.raised, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14, boxShadow: `0 0 0 1px ${c.hair}` }]} />
    </Blk>
    <Blk>
      <Lbx>{t('routinesWhen')}</Lbx>
      <View style={{ backgroundColor: rt.well, borderRadius: 22, paddingTop: 10, paddingHorizontal: 8, paddingBottom: 12, boxShadow: rt.edge }}>
        <View onLayout={onAw} accessible accessibilityRole="adjustable" accessibilityLabel={t('routinesWindowArc')} accessibilityValue={{ text: rng(from, to) }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={e => { const d = e.nativeEvent.actionName === 'increment' ? 0.5 : -0.5; setTo(x => Math.max(from + 0.5, Math.min(23, x + d))); }}
          {...pressX(onX, () => { drag.current = null; })} style={{ height: h || 1 }}>
          {aw > 0 ? <Svg width={aw} height={h} viewBox="0 0 260 132" pointerEvents="none">
            <Path d="M16 112 A114 84 0 0 1 244 112" fill="none" stroke={c['hair-2']} strokeWidth={2} strokeDasharray="1 6" strokeLinecap="round" />
            {s.routines.map(r => <Path key={r.id} d={nseg(r.from, Math.min(23, r.to))} fill="none" stroke={c[r.color]} strokeWidth={6} opacity={0.3} strokeLinecap="round" />)}
            <Path d={nseg(from, to)} fill="none" stroke={c[color]} strokeWidth={9} strokeLinecap="round" />
            {[from, to].map((x, i) => { const p = P2(x); return <G key={i}>
              <Line x1={p[0]} y1={112} x2={p[0]} y2={p[1]} stroke={c['hair-2']} strokeWidth={1.4} />
              <Circle cx={p[0]} cy={p[1]} r={9} fill="#FFFDF2" stroke="#141414" strokeWidth={3} />
            </G>; })}
            <Line x1={16} y1={112} x2={244} y2={112} stroke={c['text-muted']} strokeWidth={1.3} />
            {[5, 8, 11, 14, 17, 20, 23].map(x => <SvgText key={x} x={P2(x)[0]} y={128} textAnchor="middle" fill={c['text-muted']} fontFamily={tokens.font.bodyStrong} fontSize={10}>{hax(x)}</SvgText>)}
            <SvgText x={130} y={97} textAnchor="middle" fill={c['text-muted']} fontFamily={tokens.font.bodyStrong} fontSize={11} letterSpacing={0.9}>{dragCaps}</SvgText>
          </Svg> : null}
          {aw > 0 ? <ArcNumber size={17} baseline={80} scale={aw / 260}>{rng(from, to)}</ArcNumber> : null}
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {[[from, t('routinesStarts')], [to, t('routinesEnds')]].map(([v, l]) => <View key={String(l)} accessible accessibilityLabel={`${l}, ${h12(v as number)}`}
          style={{ flex: 1, backgroundColor: rt.raised, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14, alignItems: 'center', boxShadow: `0 0 0 1px ${c.hair}` }}>
          <KitText weight={600} size={16} numeric>{h12(v as number)}</KitText>
        </View>)}
      </View>
    </Blk>
    <Blk>
      <Lbx>{t('routinesDaysLbl')}</Lbx>
      <View style={{ flexDirection: 'row', gap: 4 }}>
        {DAY_LETTERS.map((l, i) => { const on = !!days[i]; return <Tappable key={i} dim="fill" accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={DAY_NAMES[i]}
          onPress={() => setDays(ds => ds.map((x, j) => (j === i ? (x ? 0 : 1) : x)))}
          style={{ flex: 1, minHeight: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? c.sleep : rt.raised }}>
          <KitText weight={700} size={13} color={on ? rt.ink : 'text-muted'}>{l}</KitText>
        </Tappable>; })}
      </View>
    </Blk>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 14 }}>
      <Lbx>{t('routinesColor')}</Lbx>
      <View accessibilityRole="radiogroup" accessibilityLabel={t('routinesColor')} style={{ flexDirection: 'row', gap: 6 }}>
        {ROUTINE_COLORS.map(col => { const on = col === color; return <Tappable key={col} dim="fill" accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={COLOR_NAME[col]}
          onPress={() => setColor(col)} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: c[col], boxShadow: on ? `0 0 0 2px ${k.sheetBg}, 0 0 0 4px ${c.text}` : undefined }} />
        </Tappable>; })}
      </View>
    </View>
    <Blk>
      <Lbx>{t('routinesItemsLbl')}</Lbx>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {suggest ? <Chip icon="plus" color="sleep" label={suggest.name} selected={items.includes(suggest.id)}
          onPress={() => setItems(xs => (xs.includes(suggest.id) ? xs.filter(x => x !== suggest.id) : [...xs, suggest.id]))} /> : null}
        <Chip icon="plus" label={t('routinesFromTabs')} onPress={() => showToast(t('routinesFromTabsToast'), { color: 'sleep' })} />
        <Chip icon="plus" label={t('routinesFromLibrary')} onPress={() => showToast(t('routinesFromLibraryToast'), { color: 'sleep' })} />
      </View>
    </Blk>
    <Cta testID="routines-new-save" label={t('routinesSaveRoutine')} color={c.text} ink={c.bg} onPress={save} />
  </RtSheet>;
}

/** The big time inside an arc (`.rt-arc .big`), drawn as text over the drawing so its figures keep one width and its
 * tracking, which drawn-in text cannot. `baseline` and `size` are in the drawing's own units. */
function ArcNumber({ children, size, baseline, scale }: { children: string; size: number; baseline: number; scale: number }) {
  return <KitText weight={700} size={size * scale} tracking={-0.02} numeric numberOfLines={1} allowFontScaling={false} pointerEvents="none"
    style={{ position: 'absolute', left: 0, right: 0, top: (baseline - size * 1.04) * scale, textAlign: 'center' }}>{children}</KitText>;
}
