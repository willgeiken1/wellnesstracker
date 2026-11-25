import { useContext, type ReactNode } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { t } from '@/i18n/en';
import { Icon, type IconName } from './icon';
import { alpha, capitals, StackGapContext, useKit } from './kit-style';
import { KitText } from './themed-text';
import { Tappable } from './tappable';
import { LargeTitle } from './section';

/**
 * The kit's `.nb` (`ui.navbar`) for a pushed screen: a back button in the accent (chevron and the previous screen's
 * name), the title centred in 700 17 pt, and actions on the right. It sits under the status bar on the page colour at
 * 88 percent. With `large`, the title is drawn big under the bar instead and shows in the bar only once `scrolled`.
 */
export function NavBar({ back, onBack, title, right, large = false, scrolled = false, safeTop = true, testID }: {
  /** The previous screen's name for the back button; leave out for no back button. */ back?: string;
  /** What back does; the router's back unless given. */ onBack?: () => void;
  title?: string; right?: ReactNode;
  /** Settings-style large title (34 pt) under the bar. */ large?: boolean;
  /** For a large title: the page has scrolled past it, so the bar shows the title. */ scrolled?: boolean;
  /** Pad for the status bar. Off when the screen already sits below it. */ safeTop?: boolean; testID?: string;
}) {
  const k = useKit();
  const insets = useSafeAreaInsets();
  const showTitle = !large || scrolled;
  return <>
    <View testID={testID} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44, paddingTop: safeTop ? insets.top : 0, paddingHorizontal: 8,
      paddingBottom: 6, marginHorizontal: -16, backgroundColor: alpha(k.c.bg, 0.88), zIndex: 5 }}>
      <View style={{ flex: 1, minWidth: 88, alignItems: 'flex-start' }}>
        {back != null ? <Tappable dim="text" testID={testID ? `${testID}-back` : undefined} accessibilityRole="button"
          accessibilityLabel={t('kitBackTo').replace('{name}', back || t('kitBackPrevious'))} onPress={onBack ?? (() => router.back())}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 1, minHeight: 44, minWidth: 44, paddingLeft: 2, paddingRight: 8 }}>
          <Icon name="back" size={22} color={k.c.accent} />
          <KitText weight={500} size={17} tracking={-0.01} color="accent">{back || t('kitBack')}</KitText>
        </Tappable> : null}
      </View>
      <View style={{ maxWidth: 190, opacity: showTitle ? 1 : 0 }} accessibilityElementsHidden={!showTitle} importantForAccessibility={showTitle ? 'auto' : 'no-hide-descendants'}>
        {title ? <KitText weight={700} size={17} tracking={-0.02} numberOfLines={1} accessibilityRole="header" style={{ textAlign: 'center' }}>{title}</KitText> : null}
      </View>
      <View style={{ flex: 1, minWidth: 88, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 4 }}>{right}</View>
    </View>
    {large && title ? <LargeTitle display>{title}</LargeTitle> : null}
  </>;
}

/** The kit's `.tbtn`: an accent text or icon button for a nav bar's right side, 44 pt square at least. */
export function NavButton({ label, icon, onPress, disabled = false, testID }: { label: string; icon?: IconName; onPress: () => void; disabled?: boolean; testID?: string }) {
  const k = useKit();
  return <Tappable dim="text" testID={testID} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={{ minHeight: 44, minWidth: 44, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' }}>
    {icon ? <Icon name={icon} size={22} color={disabled ? k.c.ghost : k.c.accent} />
      : <KitText weight={600} size={17} tracking={-0.01} color={disabled ? 'ghost' : 'accent'}>{label}</KitText>}
  </Tappable>;
}

/**
 * The kit's `.ph` (`ui.header`) at the top of a tab: an eyebrow (bold small capitals), a 34 pt title and an optional
 * muted line, with round icon buttons on the right.
 */
export function PageHeader({ eyebrow, title, sub, right, testID }: { eyebrow?: string; title: string; sub?: string; right?: ReactNode; testID?: string }) {
  const gap = useContext(StackGapContext);
  return <View testID={testID} style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, paddingTop: 8, paddingBottom: Math.max(0, 18 - gap) }}>
    <View style={{ flex: 1, minWidth: 0 }}>
      {eyebrow ? <KitText weight={700} size={11.5} lineHeight={1} tracking={0.14} color="text-muted" style={capitals}>{eyebrow}</KitText> : null}
      <KitText weight={700} size={34} lineHeight={1.05} tracking={-0.035} accessibilityRole="header" style={{ marginTop: eyebrow ? 8 : 0 }}>{title}</KitText>
      {sub ? <KitText weight={500} size={14} lineHeight={1.4} color="text-muted" style={{ marginTop: 8 }}>{sub}</KitText> : null}
    </View>
    {right ? <View style={{ flexDirection: 'row', gap: 8, flexShrink: 0, paddingBottom: 2 }}>{right}</View> : null}
  </View>;
}
