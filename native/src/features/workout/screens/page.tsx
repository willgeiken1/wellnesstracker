import { UnderBar } from '@/components/blur-bar';
import type { ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card } from '@/components/card';
import { KIT, StackGapContext, capitals, font, useKit } from '@/components/kit-style';
import { Stat } from '@/components/stat';
import { ShellToast } from '@/features/shell/toast';
import { fmt } from '../training-data';
import { tr } from '../tr';

/** A pushed Training screen: its nav bar fixed at the top, then the page in the kit's 16 pt gutter, cards 12 pt apart. */
export function Page({ nav, children, testID }: { nav: ReactNode; children: ReactNode; testID?: string }) {
  const k = useKit(), insets = useSafeAreaInsets();
  return <View style={{ flex: 1, backgroundColor: k.c.bg }}>
    <UnderBar bar={nav}>{top =>
      <ScrollView testID={testID} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" automaticallyAdjustKeyboardInsets scrollIndicatorInsets={{ top }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: top + 4, paddingBottom: insets.bottom + 28, gap: KIT.gap }}>
        <StackGapContext.Provider value={KIT.gap}>{children}</StackGapContext.Provider>
      </ScrollView>}
    </UnderBar>
    <ShellToast bottom={Math.max(0, insets.bottom - 8)} />
  </View>;
}

/** The mockup's `.eyebrow` in a colour: 11 pt bold capitals, spaced 0.12 em. */
export function ColorEyebrow({ children, color }: { children: string; color: string }) {
  return <Text style={[font(700, 11, 1, 0.12), capitals, { color }]}>{children}</Text>;
}

/** An eyebrow on its own text line (`<div><span class="eyebrow">`): the design's 21 pt body line, so it has the same air above and below. */
export function EyebrowLine({ children, color }: { children: string; color: string }) {
  return <View style={{ height: 21, paddingTop: 6.5 }}><ColorEyebrow color={color}>{children}</ColorEyebrow></View>;
}

/** Duration, sets and volume in three columns (`.grid3` of `ui.stat`). */
export function StatsCard({ min, sets, volume, unit, style }: { min: number; sets: number; volume: number; unit: string; style?: object }) {
  // Bottom-aligned, so the labels line up whether or not a number has a unit beside it.
  return <Card style={style}>
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: KIT.gap3 }}>
      <Stat style={{ flex: 1 }} value={min} unit={tr('trainingUnitMin')} label={tr('trainingStatDuration')} />
      <Stat style={{ flex: 1 }} value={sets} label={tr('trainingStatSets')} />
      <Stat style={{ flex: 1 }} value={fmt(volume)} unit={unit} label={tr('trainingVolume')} />
    </View>
  </Card>;
}
