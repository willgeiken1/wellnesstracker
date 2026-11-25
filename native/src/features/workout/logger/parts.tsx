import { useState } from 'react';
import { Text, TextInput, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { Icon } from '@/components/icon';
import { alpha, font, mix, slopFor, tabular, useKit } from '@/components/kit-style';
import { Tappable } from '@/components/tappable';
import { tr } from '../tr';
import { RPE, exerciseLines, type ExerciseView, type SetView } from './model';

/** The logger's colours: the theme plus the mockup's ghost grey and the few mixes it draws with. */
export function useLoggerColors() {
  const k = useKit();
  const c = k.c, dark = k.dark, train = c.training;
  return {
    k, c, dark, train,
    ghost: mix(c['text-muted'], c.bg, 0.6),
    /** `.tr-st` and the closed glyph: surface 2, or the soft fill in light mode for the glyph. */
    well: c['surface-2'], quiet: dark ? c['surface-2'] : k.fill,
    /** A control on a set card: the surface, with a hairline ring in light mode. */
    ring: dark ? undefined : `0px 0px 0px 1px ${c.hair}`,
  };
}
export type LoggerColors = ReturnType<typeof useLoggerColors>;

/** Text in an exact mockup style. */
export function LT({ w, s, lh, tr: track, color, num, lines = 1, style, children }: {
  w: 500 | 600 | 700; s: number; lh?: number; tr?: number; color: string; num?: boolean; lines?: number; style?: StyleProp<TextStyle>; children: React.ReactNode;
}) {
  return <Text numberOfLines={lines} style={[font(w, s, lh, track), { color }, num && tabular, style]}>{children}</Text>;
}

/** A weight or reps field that is as wide as what it holds, with its unit right after it (`.tr-f`). */
function Field({ value, placeholder, unit, label, keyboard, done, warm, col, onChange, onEnd, testID }: {
  value: string; placeholder: string; unit: string; label: string; keyboard: 'decimal-pad' | 'number-pad'; done: boolean; warm: boolean;
  col: LoggerColors; onChange: (v: string) => void; onEnd: () => void; testID?: string;
}) {
  const [width, setWidth] = useState(0);
  const [focused, setFocused] = useState(false);
  const style = [font(warm && !done ? 500 : 700, 18, undefined, -0.01), tabular];
  const ring = focused ? `0px 0px 0px 2px ${col.train}` : done ? undefined : col.ring;
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 4, height: 44, paddingHorizontal: done ? 6 : 12, borderRadius: 12,
    backgroundColor: done ? 'transparent' : col.c.surface, boxShadow: ring }, !done && { flex: 1, minWidth: 0 }]}>
    <Text style={[style, { position: 'absolute', opacity: 0 }]} onLayout={e => setWidth(e.nativeEvent.layout.width)} accessible={false} importantForAccessibility="no">{value || placeholder || ' '}</Text>
    <TextInput testID={testID} value={value} placeholder={placeholder} placeholderTextColor={col.ghost} keyboardType={keyboard} accessibilityLabel={label}
      onChangeText={t => onChange(t.replace(keyboard === 'number-pad' ? /[^0-9]/g : /[^0-9.]/g, ''))} onFocus={() => setFocused(true)}
      onBlur={() => { setFocused(false); onEnd(); }} selectTextOnFocus returnKeyType="done"
      style={[style, { color: warm && !done ? col.c['text-muted'] : col.c.text, width: Math.max(10, width + 2), height: 44, padding: 0, flexShrink: 1 }]} />
    <LT w={600} s={12.5} color={col.c['text-muted']} style={{ flexShrink: 0 }}>{unit}</LT>
  </View>;
}

/** A small pill: the set type tags, the jump chips' cousins. */
function Tag({ label, on, tone, col, onPress }: { label: string; on: boolean; tone: string; col: LoggerColors; onPress: () => void }) {
  return <Tappable dim="fill" accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: on }} onPress={onPress} hitSlop={slopFor(80, 32)}
    style={{ height: 32, paddingHorizontal: 13, borderRadius: 999, justifyContent: 'center',
      backgroundColor: on ? mix(tone, col.c.surface, col.dark ? 0.15 : 0.15) : col.c.surface,
      boxShadow: on ? `inset 0px 0px 0px 1.5px ${alpha(tone, 0.72)}` : col.ring }}>
    <LT w={600} s={13} color={on ? tone : col.c['text-muted']}>{label}</LT>
  </Tappable>;
}

/** The RPE segmented row (`.tr-rpe`): 6 to 10, last time's value outlined until one is picked. */
export function RpeRow({ value, last, col, onPick, size = 40 }: { value: number | null; last: number | null; col: LoggerColors; onPick: (v: number) => void; size?: number }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
    <LT w={700} s={10} tr={0.08} color={col.c['text-muted']} style={{ width: 32, textAlign: 'center' }}>{tr('trainingRpe')}</LT>
    <View accessibilityRole="radiogroup" accessibilityLabel={last != null ? tr('trainingRpeGroupLast', { n: last }) : tr('trainingRpeGroup')}
      style={{ flex: 1, flexDirection: 'row', gap: 2, padding: 2, borderRadius: 12, backgroundColor: col.c.surface, boxShadow: col.ring }}>
      {RPE.map(v => {
        const on = value === v, ls = value == null && last != null && Math.round(last) === v;
        return <Tappable key={v} dim="seg" accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={ls ? tr('trainingRpeLast', { n: v }) : String(v)}
          onPress={() => onPick(v)} style={{ flex: 1, height: size, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
            backgroundColor: on ? col.train : ls ? alpha(col.train, 0.1) : 'transparent', boxShadow: ls ? `inset 0px 0px 0px 1.5px ${alpha(col.train, 0.38)}` : undefined }}>
          <LT w={700} s={15} num color={on ? col.c['on-accent'] : ls ? col.c.text : col.c['text-muted']}>{v}</LT>
        </Tappable>;
      })}
    </View>
  </View>;
}
export function TagRow({ s, col, onTag, more, moreLabel, style }: { s: SetView; col: LoggerColors; onTag: (t: 'warmup' | 'failure') => void; more?: () => void; moreLabel?: string; style?: StyleProp<ViewStyle> }) {
  return <View accessibilityRole="none" accessibilityLabel={tr('trainingSetType')} style={[{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, marginLeft: 40 }, style]}>
    <Tag label={tr('trainingWarmup')} on={s.warm} tone={col.c.warning} col={col} onPress={() => onTag('warmup')} />
    <Tag label={tr('trainingToFailure')} on={s.failure} tone={col.c.danger} col={col} onPress={() => onTag('failure')} />
    {more && <Tappable dim="text" accessibilityRole="button" accessibilityLabel={moreLabel} onPress={more} hitSlop={{ top: 6, bottom: 6 }}
      style={{ marginLeft: 'auto', width: 44, height: 32, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name="more" size={20} color={col.ghost} />
    </Tappable>}
  </View>;
}

export interface SetHandlers {
  onField: (s: SetView, field: 'weight' | 'reps', value: string) => void;
  onEnd: (s: SetView) => void;
  onCheck: (s: SetView) => void;
  onTag: (s: SetView, tag: 'warmup' | 'failure') => void;
  onRpe: (s: SetView, v: number) => void;
  onToggleOpen: (s: SetView) => void;
  onMore: (s: SetView, label: string) => void;
}
/** One set card (`.tr-st`): weight and reps, the check, then set type tags and RPE while it is open. */
export function SetCard({ e, s, ei, current, open, plates, col, h }: {
  e: ExerciseView; s: SetView; ei: number; current: boolean; open: boolean; plates: string | null; col: LoggerColors; h: SetHandlers;
}) {
  const { c, train } = col;
  const label = s.warm ? tr('trainingWarmSet', { name: e.label }) : tr(s.failure ? 'trainingSetFailure' : 'trainingSetLabel', { name: e.label, n: s.num });
  const bg = s.done ? mix(train, c.surface, col.dark ? 0.13 : 0.11) : s.warm ? (col.dark ? alpha(c['surface-2'], 0.5) : mix(c['surface-2'], c.surface, 0.5)) : c['surface-2'];
  const numColor = s.warm ? c.warning : s.done ? train : c['text-muted'];
  const unitName = e.unit === 'kg' ? tr('trainingKilograms') : tr('trainingPounds');
  const meta = s.done ? `${s.rpe != null ? tr('trainingRpeMeta', { n: s.rpe }) : tr('trainingNoRpe')}${s.pr ? tr('trainingNewPrMeta') : ''}${tr(open ? 'trainingHideRpe' : 'trainingEditRpe')}` : '';
  return <View testID={`set-${ei}-${s.index}`} accessibilityLabel={label} style={{ paddingTop: 8, paddingBottom: 8, paddingLeft: 8, paddingRight: 6, borderRadius: 16, backgroundColor: bg,
    boxShadow: current ? `inset 0px 0px 0px 1.5px ${alpha(train, 0.6)}` : undefined }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <View style={{ width: 32, alignItems: 'center' }}>
        <View style={{ width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: s.warm ? alpha(c.warning, 0.16) : 'transparent' }}>
          <LT w={700} s={15} num color={numColor}>{s.warm ? 'W' : s.num}</LT>
          {s.failure && <View style={{ position: 'absolute', top: -3, right: -4, paddingVertical: 2, paddingHorizontal: 3, borderRadius: 5,
            backgroundColor: mix(c.danger, col.dark ? c['surface-2'] : c.surface, col.dark ? 0.18 : 0.14) }}>
            <LT w={700} s={9} lh={1} color={c.danger}>F</LT>
          </View>}
        </View>
      </View>
      <Field testID={`set-${ei}-${s.index}-weight`} value={s.draft.weight} placeholder={s.weightHint} unit={e.unit} label={tr('trainingWeightIn', { label, unit: unitName })}
        keyboard="decimal-pad" done={s.done} warm={s.warm} col={col} onChange={v => h.onField(s, 'weight', v)} onEnd={() => h.onEnd(s)} />
      <Field testID={`set-${ei}-${s.index}-reps`} value={s.draft.reps} placeholder={s.repsHint} unit={tr('trainingRepsUnit')} label={tr('trainingRepsField', { label })}
        keyboard="number-pad" done={s.done} warm={s.warm} col={col} onChange={v => h.onField(s, 'reps', v)} onEnd={() => h.onEnd(s)} />
      {s.done && <Tappable dim="text" accessibilityRole="button" accessibilityLabel={meta} accessibilityState={{ expanded: open }} onPress={() => h.onToggleOpen(s)}
        style={{ flex: 1, minWidth: 0, height: 44, paddingLeft: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
        <LT w={600} s={13} num color={s.rpe != null ? c['text-muted'] : col.ghost} style={{ flexShrink: 1 }}>{s.rpe != null ? tr('trainingRpeValue', { n: s.rpe }) : tr('trainingRpe')}</LT>
        {s.pr && <PrBadge col={col} />}
        <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}><Icon name="tr-down" size={16} color={col.ghost} /></View>
      </Tappable>}
      <Tappable dim="none" testID={`set-${ei}-${s.index}-check`} accessibilityRole="button" accessibilityState={{ checked: s.done }}
        accessibilityLabel={tr(s.done ? 'trainingUncheck' : 'trainingCheckOff', { label })} onPress={() => h.onCheck(s)}
        style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12 }}>
        <View style={{ width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: s.done ? train : c.surface,
          boxShadow: s.done ? undefined : col.ring }}>
          <Icon name="check" size={18} color={s.done ? c['on-accent'] : col.ghost} />
        </View>
      </Tappable>
    </View>
    {open && <>
      <TagRow s={s} col={col} onTag={t => h.onTag(s, t)} more={() => h.onMore(s, label)} moreLabel={tr('trainingSetOptions', { label })} />
      <RpeRow value={s.rpe} last={s.lastRpe} col={col} onPick={v => h.onRpe(s, v)} />
    </>}
    {plates && <Text style={[font(500, 12.5, 1.35), tabular, { color: c['text-muted'], marginTop: 9, marginLeft: 40, marginRight: 6 }]}>
      <Text style={[font(600, 12.5), { color: c.text }]}>{tr('trainingPlates')} </Text>{plates}
    </Text>}
  </View>;
}

export function PrBadge({ col }: { col: LoggerColors }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, height: 20, paddingHorizontal: 6, borderRadius: 999, backgroundColor: alpha(col.c.warning, 0.16) }}>
    <Icon name="trophy" size={12} color={col.c.warning} />
    <LT w={700} s={11} color={col.c.warning}>{tr('trainingPr')}</LT>
  </View>;
}

/** An exercise card (`.tr-ex`): the header that opens and closes it, then its sets and footer while open. */
export function ExerciseHeader({ e, ei, open, current, col, onToggle, onMore }: {
  e: ExerciseView; ei: number; open: boolean; current: boolean; col: LoggerColors; onToggle: () => void; onMore: () => void;
}) {
  const { c, train } = col, { s1, s2 } = exerciseLines(e);
  const spoken = tr(e.all ? 'trainingExDone' : current ? 'trainingExNow' : 'trainingExSets', { name: e.label, done: e.done, total: e.total, sub: s1 });
  return <View style={{ flexDirection: 'row', alignItems: 'center', paddingRight: 4 }}>
    <Tappable dim="none" testID={`exercise-${ei}`} accessibilityRole="button" accessibilityLabel={spoken} accessibilityState={{ expanded: open }} onPress={onToggle}
      style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 66, paddingVertical: 10, paddingLeft: 14, paddingRight: 10 }}>
      <View style={{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
        backgroundColor: e.all ? alpha(train, 0.17) : current ? 'transparent' : col.quiet,
        boxShadow: !e.all && current ? `inset 0px 0px 0px 1.5px ${train}` : undefined }}>
        {e.all ? <Icon name="check" size={16} color={train} /> : <LT w={700} s={13} num color={current ? train : c['text-muted']}>{ei + 1}</LT>}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <LT w={700} s={17} lh={1.2} tr={-0.02} color={open ? train : e.all ? c['text-muted'] : c.text}>{e.label}</LT>
        <LT w={500} s={12.5} lh={1.3} num color={c['text-muted']} style={{ marginTop: 3 }}>{open ? s2 : s1}</LT>
      </View>
      {!open && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: 120 }}>
        {e.total > 8 ? <LT w={600} s={12.5} num color={c['text-muted']}>{`${e.done}/${e.total}`}</LT>
          : Array.from({ length: e.total }, (_, i) => <View key={i} style={{ width: 7, height: 7, borderRadius: 3.5,
            backgroundColor: i < e.done ? train : current && i === e.done ? 'transparent' : alpha(c['text-muted'], 0.34),
            boxShadow: current && i === e.done ? `inset 0px 0px 0px 1.5px ${train}` : undefined }} />)}
      </View>}
      <View style={{ width: 20, alignItems: 'center', transform: [{ rotate: open ? '180deg' : '0deg' }] }}><Icon name="tr-down" size={18} color={col.ghost} /></View>
    </Tappable>
    {open && <Tappable dim="text" accessibilityRole="button" accessibilityLabel={tr('trainingExOptions', { name: e.label })} onPress={onMore}
      style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name="more" size={22} color={c['text-muted']} />
    </Tappable>}
  </View>;
}

/** The note field under an exercise header. */
export function NoteField({ value, name, col, onSave }: { value: string; name: string; col: LoggerColors; onSave: (v: string) => void }) {
  const [text, setText] = useState(value);
  return <View style={{ marginTop: 4, marginHorizontal: 16, marginBottom: 8, flexDirection: 'row', gap: 8, alignItems: 'flex-start', paddingVertical: 10, paddingHorizontal: 12,
    borderRadius: 12, backgroundColor: col.c['surface-2'] }}>
    <View style={{ marginTop: 2 }}><Icon name="note" size={16} color={col.c['text-muted']} /></View>
    <TextInput multiline value={text} onChangeText={setText} onBlur={() => onSave(text)} placeholder={tr('trainingAddNote')} placeholderTextColor={col.ghost}
      accessibilityLabel={tr('trainingNoteFor', { name })} maxLength={2000}
      style={[font(500, 14, 1.4), { flex: 1, minHeight: 20, padding: 0, color: col.c.text }]} />
  </View>;
}

/** Add set and Note under the sets (`.ft`). */
export function ExerciseFooter({ name, hasNote, col, onAdd, onNote, ei }: { name: string; hasNote: boolean; col: LoggerColors; onAdd: () => void; onNote: () => void; ei: number }) {
  return <View style={{ flexDirection: 'row', gap: 8, paddingTop: 8, paddingHorizontal: 12, paddingBottom: 12 }}>
    <Tappable dim="fill" testID={`add-set-${ei}`} accessibilityRole="button" accessibilityLabel={`${name}, ${tr('trainingAddSet')}`} onPress={onAdd}
      style={{ flex: 1, minHeight: 44, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: alpha(col.train, 0.11) }}>
      <Icon name="plus" size={18} color={col.train} /><LT w={600} s={14.5} color={col.train}>{tr('trainingAddSet')}</LT>
    </Tappable>
    {!hasNote && <Tappable dim="fill" accessibilityRole="button" accessibilityLabel={`${name}, ${tr('trainingAddNote')}`} onPress={onNote}
      style={{ width: 96, minHeight: 44, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: col.quiet }}>
      <Icon name="note" size={16} color={col.c['text-muted']} /><LT w={600} s={14.5} color={col.c['text-muted']}>{tr('trainingNote')}</LT>
    </Tappable>}
  </View>;
}
