import Svg, { Path } from 'react-native-svg';
import { useKit } from '@/components/kit-style';
import { PEAK, PEAK_VIEWBOX, peakDash, peakHeight, peakStroke } from './peak';

/**
 * The mountain line drawn still, with `frac` of it lit from the left in `color` (pages/onboarding.js `peakSvg`): a hairline
 * track, a soft glow under the lit part (`glow`, the lit part unless given) and the 2 pt lit line. Used by the Home nudge; the setup flow has its own animated one.
 */
export function PeakLine({ width, frac, glow = frac, color, testID }: { width: number; frac: number; glow?: number; color: string; testID?: string }) {
  const k = useKit();
  const dash = peakDash(frac), glowDash = peakDash(glow);
  // The track is the second hairline in Light and the text at 22 percent in Dark.
  const track = k.dark ? k.tint(k.c.text, 0.22) : k.c['hair-2'];
  return <Svg testID={testID} width={width} height={peakHeight(width)} viewBox={PEAK_VIEWBOX} accessible={false} style={{ overflow: 'visible' }}>
    <Path d={PEAK.d} fill="none" stroke={track} strokeWidth={peakStroke(1.5, width)} strokeLinecap="round" strokeLinejoin="round" />
    {/* The design blurs a 30 unit stroke; drawn small, a faint wide stroke reads the same without a filter. */}
    {glow > 0 ? <Path d={PEAK.d} fill="none" stroke={color} strokeOpacity={k.dark ? 0.22 : 0.15} strokeWidth={30} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={glowDash} /> : null}
    {frac > 0 ? <Path testID={testID ? `${testID}-lit` : undefined} d={PEAK.d} fill="none" stroke={color} strokeWidth={peakStroke(2, width)} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={dash} /> : null}
  </Svg>;
}
