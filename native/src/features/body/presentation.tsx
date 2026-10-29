import { Component, Fragment, useEffect, useState, type PropsWithChildren } from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/design/theme-provider';
import { tokens } from '@/design/tokens';

// Current native token names; INS-01 owns the semantic surface/pillar rename.
export function TonePanel({ children, testID }: PropsWithChildren<{ testID?: string }>) {
 const { colors } = useTheme();
 return <View testID={testID} style={{ backgroundColor: colors['surface-2'], borderRadius: tokens.radii.card, padding: tokens.spacing[3], gap: tokens.spacing[2] }}>{children}</View>;
}
export function Label({ children }: PropsWithChildren) {
 return <ThemedText accessibilityRole="header" style={{ fontSize: tokens.type.caption, fontWeight: '600', fontFamily: undefined }}>{children}</ThemedText>;
}
export function ExampleTag() {
 const { colors } = useTheme();
 return <View style={{ alignSelf: 'flex-start', backgroundColor: colors['surface-2'], borderRadius: tokens.radii.input, paddingHorizontal: tokens.spacing[1], paddingVertical: tokens.spacing[0] }}><Label>Example data</Label></View>;
}
export function LoadingPanels() {
 const [visible, setVisible] = useState(false);
 useEffect(() => { const timer = setTimeout(() => setVisible(true), 300); return () => clearTimeout(timer); }, []);
 return visible ? <View testID="loading-panels" accessibilityLabel="Loading" accessibilityRole="progressbar" style={{ gap: tokens.spacing[3] }}>
  {[0, 1].map(key => <TonePanel key={key}><View style={{ height: 120 }} /></TonePanel>)}
 </View> : null;
}
export function LoadError({ name, onRetry }: { name: string; onRetry: () => void }) {
 return <View style={{ gap: tokens.spacing[1] }}><ThemedText muted accessibilityRole="alert">Couldn’t load {name}.</ThemedText><Button variant="secondary" label="Try again" onPress={onRetry} /></View>;
}
/** A local render/read failure never exposes its message or payload. */
export class ReadBoundary extends Component<PropsWithChildren<{ name: string }>, { failed: boolean; attempt: number }> {
 state = { failed: false, attempt: 0 };
 static getDerivedStateFromError() { return { failed: true }; }
 render() {
  return this.state.failed ? <LoadError name={this.props.name} onRetry={() => this.setState(({ attempt }) => ({ failed: false, attempt: attempt + 1 }))} /> : <Fragment key={this.state.attempt}>{this.props.children}</Fragment>;
 }
}
export function Sparkline({ values, label, testID, color }: { values: (number | null)[]; label: string; testID?: string; color?: string }) {
 const { colors } = useTheme();
 const measured = values.filter((value): value is number => value !== null && Number.isFinite(value));
 const low = Math.min(...measured), high = Math.max(...measured);
 const points = values.map((value, i) => value === null ? '' : `${i && values[i - 1] !== null ? 'L' : 'M'}${4 + i / Math.max(1, values.length - 1) * 292},${52 - (value - low) / Math.max(1, high - low) * 44} l0.5,0`);
 return <View testID={testID} accessible accessibilityLabel={label} style={{ minHeight: 60, flexGrow: 1 }}>
  <Svg accessible={false} width="100%" height={60} viewBox="0 0 300 60" preserveAspectRatio="none"><Path d={points.join(' ') + (values.length === 1 ? ' l1,0' : '')} stroke={color ?? colors.accent} strokeWidth={2.5} fill="none" /></Svg>
 </View>;
}

/** Pattern rendering is independent of any inference or Health data source. */
export function PatternPanel({ pattern }: { pattern?: { direction: 'up' | 'down'; sentence: string } }) {
 return <TonePanel>
  <ThemedText>{pattern ? `${pattern.direction === 'up' ? '↑' : '↓'} ${pattern.sentence}` : 'Not enough paired observations to show a pattern yet.'}</ThemedText>
  <ThemedText muted variant="caption">Correlation, not cause</ThemedText>
 </TonePanel>;
}
