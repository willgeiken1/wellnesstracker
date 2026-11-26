import { View } from 'react-native';
import { Tappable } from '@/components/tappable';
import { ThemedText } from '@/components/themed-text';
import { router } from 'expo-router';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useTheme } from '@/design/theme-provider';
import { tokens } from '@/design/tokens';
import { t } from '@/i18n/en';
import { alpha, mix } from './colors';
import { ActionIcon } from './icons';
import Animated from 'react-native-reanimated';
import { DISTANCES } from '@/components/kit-motion';
import { useSpringPress } from './press';
import { AvatarPhoto, useProfilePhoto } from '@/features/settings/avatar-photo';

/** The round profile button at the top right of Home: the person's initial (or a person when there is no name yet) on a soft
 * accent gradient. It opens Settings. 44 points, so it is a full touch target. */
export function ProfileButton({ name, onPress = () => router.push('/settings') }: { name?: string | null; onPress?: () => void }) {
  const { colors, mode, reduceMotion } = useTheme();
  const press = useSpringPress(DISTANCES.pressScale, reduceMotion, DISTANCES.pressOpacity);
  const dark = mode === 'dark';
  const initial = name?.trim().charAt(0).toUpperCase();
  const photo = useProfilePhoto();
  const from = mix(colors.accent, dark ? 0.34 : 0.16, colors.surface), to = mix(colors.sleep, dark ? 0.22 : 0.12, colors.surface);
  return <Tappable dim="none" testID="profile-button" accessibilityRole="button" accessibilityLabel={t('shellProfile')} onPress={onPress}
    onPressIn={press.onPressIn} onPressOut={press.onPressOut}>
    <Animated.View style={[{ width: 44, height: 44, borderRadius: 22, overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
      boxShadow: dark ? '0px 6px 16px -8px rgba(0, 0, 0, 0.6)' : `0px 4px 12px -6px ${alpha(colors.text, 0.3)}` }, press.style]}>
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
      {/* 150deg: from the top left to the bottom right, slightly steeper than the diagonal. */}
      <Svg width="100%" height="100%"><Defs><LinearGradient id="profile-fill" x1="0.25" y1="0.07" x2="0.75" y2="0.93">
        <Stop offset="0" stopColor={from} /><Stop offset="1" stopColor={to} />
      </LinearGradient></Defs><Rect width="100%" height="100%" fill="url(#profile-fill)" /></Svg>
    </View>
    <View pointerEvents="none">
      {initial ? <ThemedText style={{ fontFamily: tokens.font.heading, fontSize: 17, lineHeight: 17, letterSpacing: -0.34, color: colors.text }}>{initial}</ThemedText>
        : <ActionIcon name="person" size={20} color={colors.text} />}
    </View>
    {photo ? <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0 }}><AvatarPhoto uri={photo} size={44} /></View> : null}
    {/* The thin accent ring sits over the gradient, as the design's inset ring does over its fill. */}
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 22, borderWidth: 1, borderColor: alpha(colors.accent, dark ? 0.36 : 0.24) }} />
    </Animated.View>
  </Tappable>;
}
