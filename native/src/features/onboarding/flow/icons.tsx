import Svg, { Circle, Path, Rect } from 'react-native-svg';

/* The setup screens' own icons (onboarding.js INS.addIcons), on the kit's 24 grid with 1.75 strokes and round caps. */
export type ObIconName = 'ob-heart' | 'ob-water' | 'ob-stretch' | 'ob-sun' | 'ob-book' | 'ob-phone' | 'ob-pill';

export function ObIcon({ name, size = 20, color }: { name: ObIconName; size?: number; color: string }) {
  const s = { fill: 'none', stroke: color, strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
  return <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false} pointerEvents="none">
    {name === 'ob-heart' && <Path fill={color} d="M12 20.3s-7.6-4.6-8.9-9.4C2.3 7.8 4.3 5 7.3 5c1.9 0 3.4 1.1 4.7 2.8C13.3 6.1 14.8 5 16.7 5c3 0 5 2.8 4.2 5.9-1.3 4.8-8.9 9.4-8.9 9.4z" />}
    {name === 'ob-water' && <Path {...s} d="M12 3.5c3.2 3.9 6 7.3 6 10.6A6 6 0 0 1 6 14.1c0-3.3 2.8-6.7 6-10.6z" />}
    {name === 'ob-stretch' && <><Circle {...s} cx={12} cy={4.8} r={1.8} /><Path {...s} d="M5 9.5l7 1.5 7-1.5M12 11v4.5l-3.5 5M12 15.5l3.5 5" /></>}
    {name === 'ob-sun' && <><Circle {...s} cx={12} cy={12} r={3.6} /><Path {...s} d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" /></>}
    {name === 'ob-book' && <Path {...s} d="M4.5 5.5c2.6-.7 5.1-.4 7.5 1.2v12.8c-2.4-1.6-4.9-1.9-7.5-1.2zM19.5 5.5c-2.6-.7-5.1-.4-7.5 1.2v12.8c2.4-1.6 4.9-1.9 7.5-1.2z" />}
    {name === 'ob-phone' && <><Rect {...s} x={7} y={3} width={10} height={18} rx={2.5} /><Path {...s} d="M4 4l16 16" /></>}
    {name === 'ob-pill' && <><Rect {...s} x={4} y={8.5} width={16} height={7} rx={3.5} transform="rotate(-35 12 12)" /><Path {...s} d="M9.7 8.8l4.6 6.4" /></>}
  </Svg>;
}
