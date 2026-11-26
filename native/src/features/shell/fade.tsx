import { View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useTheme } from '@/design/theme-provider';

/** A soft fade of the page colour behind the bar, so rows scrolling under it melt away instead of showing between the pills. */
export function DockFade({ height }: { height: number }) {
  const { colors } = useTheme();
  return <View pointerEvents="none" testID="tab-fade" accessible={false} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height }}>
    <Svg width="100%" height={height}>
      <Defs><LinearGradient id="dock-fade" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0" stopColor={colors.bg} stopOpacity={0} />
        <Stop offset="0.55" stopColor={colors.bg} stopOpacity={0.92} />
        <Stop offset="1" stopColor={colors.bg} stopOpacity={1} />
      </LinearGradient></Defs>
      <Rect width="100%" height={height} fill="url(#dock-fade)" />
    </Svg>
  </View>;
}
