import { useState, type ReactNode } from 'react';
import { Animated, TextInput, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Line, Rect, Text as SvgText } from 'react-native-svg';
import { useSelectionHaptic } from '@/components/selection-haptic';
import { Tappable } from '@/components/tappable';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/design/theme-provider';
import { tokens } from '@/design/tokens';
import { rs } from '@/i18n/en';
import {
  amountDraftText, amountEditText, amountFieldText, amountMeterMax, amountSteps, parseSheetAmount, plainAmount, prettyAmount, stepAllowed, stepAmount,
} from './add-item-amounts';
import { veil, type SlotToken } from './add-item-tones';

/** The colours one amount card draws with. A filled card is the slot colour with its ink; a plain one is a surface card with a colour bar. */
function useCardInk(tone: SlotToken, filled: boolean) {
  const { colors } = useTheme();
  if (filled) {
    const ink = colors['on-accent'], fill = colors[tone];
    return { fill, ink, well: veil(fill, ink), solid: ink, onSolid: fill, bar: null };
  }
  return { fill: colors.surface, ink: colors.text, well: colors['surface-2'], solid: colors.text, onSolid: colors.bg, bar: colors[tone] };
}

/**
 * One typed amount: the number, its unit, and the steps that add to it or
 * take away from it. The number is only ever what was typed or stepped;
 * the field has no placeholder number and the card never fills one in.
 */
export function AmountCard({ testID, label, value, onChange, units, unit, onUnit, unitLabel, fixedUnit, stepsLabel, tone, filled = false, children }: {
  testID: string; label: string; value: string; onChange: (text: string) => void;
  units?: readonly string[]; unit?: string; onUnit?: (unit: string) => void; unitLabel?: string; fixedUnit?: string;
  stepsLabel: string; tone: SlotToken; filled?: boolean; children?: ReactNode;
}) {
  const { motion } = useTheme();
  const { fontScale } = useWindowDimensions();
  const tick = useSelectionHaptic();
  const ink = useCardInk(tone, filled);
  // While the field has focus it shows the digits being typed. Otherwise it shows the amount, with quarters as ¼ ½ ¾.
  const [typing, setTyping] = useState<string | null>(null);
  const [scale] = useState(() => new Animated.Value(1));
  const amount = parseSheetAmount(value);
  const steps = amountSteps(amount);
  const shownUnit = fixedUnit ?? unit ?? '';
  const stacked = fontScale >= 1.5;

  const settle = (text: string) => {
    onChange(text);
    if (typing != null) setTyping(amountEditText(text));
    if (motion.micro > 0) {
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.05, duration: motion.micro * 0.4, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: motion.micro * 0.6, useNativeDriver: true }),
      ]).start();
    }
  };
  const step = (delta: number) => {
    if (!stepAllowed(amount, delta)) return;
    const next = stepAmount(amount, delta);
    settle(next == null ? '' : plainAmount(next));
  };

  const stepButton = (delta: number) => {
    const adds = delta > 0, allowed = stepAllowed(amount, delta), text = prettyAmount(Math.abs(delta));
    return <Tappable dim="fill" key={delta} testID={`${testID}-step-${adds ? 'add' : 'take'}-${Math.abs(delta)}`} accessibilityRole="button"
      accessibilityLabel={`${adds ? rs('add') : rs('takeAway')} ${text}`} accessibilityState={{ disabled: !allowed }} disabled={!allowed} onPress={() => step(delta)}
      style={{ flex: 1, minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: adds ? ink.solid : ink.well, opacity: allowed ? 1 : 0.35 }}>
      <ThemedText numeric style={{ color: adds ? ink.onSolid : ink.ink, fontWeight: '600' }}>{`${adds ? '+' : '−'}${text}`}</ThemedText>
    </Tappable>;
  };
  const takes = steps.slice().reverse().map((size) => stepButton(-size));
  const adds = steps.map((size) => stepButton(size));

  return <View testID={testID} style={{ backgroundColor: ink.fill, borderRadius: 20, padding: tokens.spacing[2], gap: tokens.spacing[1], overflow: 'hidden' }}>
    {ink.bar && <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: ink.bar }} />}
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: tokens.spacing[1] }}>
      <ThemedText variant="caption" style={{ color: ink.ink, fontWeight: '600', flexShrink: 1 }}>{label}</ThemedText>
      <Tappable dim="fill" testID={`${testID}-clear`} accessibilityRole="button" accessibilityLabel={`${rs('clear')}, ${label}`} accessibilityState={{ disabled: !value }} disabled={!value}
        onPress={() => settle('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={{ minHeight: 28, justifyContent: 'center', paddingHorizontal: tokens.spacing[2], borderRadius: 14, backgroundColor: ink.well, opacity: value ? 1 : 0.35 }}>
        <ThemedText variant="caption" style={{ color: ink.ink, fontWeight: '600' }}>{rs('clear')}</ThemedText>
      </Tappable>
    </View>
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: tokens.spacing[1], backgroundColor: ink.well, borderRadius: 16, paddingHorizontal: tokens.spacing[2], paddingVertical: tokens.spacing[1] }}>
      <Animated.View style={{ flex: 1, minWidth: 0, transform: [{ scale }] }}>
        <TextInput testID={`${testID}-input`} accessibilityLabel={label} value={typing ?? amountFieldText(value)}
          onChangeText={(text) => { setTyping(text); onChange(amountDraftText(text)); }}
          onFocus={() => setTyping(amountEditText(value))} onBlur={() => setTyping(null)}
          keyboardType="decimal-pad" inputMode="decimal" autoCorrect={false} autoComplete="off" spellCheck={false} returnKeyType="done"
          selectionColor={ink.ink} maxFontSizeMultiplier={1.5}
          style={{ color: ink.ink, fontSize: tokens.type.display, fontFamily: tokens.font.numeral, fontVariant: ['tabular-nums'], padding: 0, minHeight: 44 }} />
      </Animated.View>
      <ThemedText testID={`${testID}-unit`} variant="headline" style={{ color: ink.ink, fontWeight: shownUnit ? '600' : '400' }}>{shownUnit || rs('unitNone')}</ThemedText>
    </View>
    {units && onUnit && <View accessibilityRole="radiogroup" accessibilityLabel={unitLabel ?? rs('unit')}
      style={{ flexDirection: 'row', flexWrap: stacked ? 'wrap' : 'nowrap', gap: 3, padding: 3, borderRadius: 14, backgroundColor: ink.well }}>
      {units.map((option) => {
        const picked = option === unit;
        return <Tappable dim="fill" key={option} testID={`${testID}-unit-${option}`} accessibilityRole="radio" accessibilityLabel={option} accessibilityState={{ checked: picked }}
          onPress={() => { if (!picked) { tick(); onUnit(option); } }}
          style={{ flexGrow: 1, flexBasis: stacked ? '30%' : 0, minHeight: 44, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: picked ? ink.solid : 'transparent' }}>
          <ThemedText variant="caption" style={{ color: picked ? ink.onSolid : ink.ink, fontWeight: '600' }}>{option}</ThemedText>
        </Tappable>;
      })}
    </View>}
    <View importantForAccessibility="no" accessibilityElementsHidden style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <ThemedText variant="caption" style={{ color: ink.ink, fontWeight: '600' }}>{rs('takeAway')}</ThemedText>
      <ThemedText variant="caption" style={{ color: ink.ink, fontWeight: '600' }}>{rs('add')}</ThemedText>
    </View>
    <View accessibilityLabel={stepsLabel} style={{ flexDirection: stacked ? 'column' : 'row', gap: stacked ? 4 : tokens.spacing[1] }}>
      <View style={{ flex: stacked ? undefined : 1, flexDirection: 'row', gap: 4 }}>{takes}</View>
      <View style={{ flex: stacked ? undefined : 1, flexDirection: 'row', gap: 4 }}>{adds}</View>
    </View>
    {children}
  </View>;
}

/** The small-amount meter on the dose card: where the typed amount sits from 0 to 2, or 0 to 4. Decorative; the number above says the same. */
export function AmountMeter({ amount, ink, track }: { amount: number | null; ink: string; track: string }) {
  const max = amountMeterMax(amount);
  if (max == null) return null;
  const value = amount ?? 0;
  const x = (at: number) => 12 + (at / max) * 276;
  const marks = Array.from({ length: max * 4 + 1 }, (_, quarter) => quarter);
  return <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
    <Svg testID="dose-meter" width="100%" viewBox="0 0 300 36" style={{ aspectRatio: 300 / 36 }} accessible={false}>
      <Rect x={12} y={8} width={276} height={6} rx={3} fill={track} />
      <Rect x={12} y={8} width={Math.max(0, x(value) - 12)} height={6} rx={3} fill={ink} />
      {marks.map((quarter) => {
        const whole = quarter % 4 === 0;
        return <Line key={quarter} x1={x(quarter / 4)} y1={whole ? 2 : 5} x2={x(quarter / 4)} y2={8} stroke={ink} strokeWidth={whole ? 1.6 : 1.2} />;
      })}
      {marks.filter((quarter) => quarter % 4 === 0).map((quarter) => (
        <SvgText key={quarter} x={x(quarter / 4)} y={32} fontSize={tokens.type.caption} fontWeight="600" fill={ink} textAnchor="middle">{String(quarter / 4)}</SvgText>
      ))}
      {value > 0 && <Circle cx={x(value)} cy={11} r={6} fill={track} stroke={ink} strokeWidth={2.5} />}
    </Svg>
  </View>;
}
