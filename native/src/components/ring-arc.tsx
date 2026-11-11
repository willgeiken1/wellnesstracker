import { Circle, G, Path } from "react-native-svg";
import type { RingLook } from "@/design/looks";

const TOP = -Math.PI / 2;
const point = (cx: number, cy: number, r: number, angle: number) => [cx + r * Math.cos(angle), cy + r * Math.sin(angle)] as const;
/** Clockwise arc from 12 o'clock covering `progress` (0 to 1) of the circle. */
export function arcPath(cx: number, cy: number, r: number, progress: number) {
  const v = Math.min(Math.max(progress, 0), 0.9999);
  const [x, y] = point(cx, cy, r, TOP + v * Math.PI * 2);
  return `M${cx.toFixed(2)} ${(cy - r).toFixed(2)} A${r} ${r} 0 ${v > 0.5 ? 1 : 0} 1 ${x.toFixed(2)} ${y.toFixed(2)}`;
}

type Props = {
  look: RingLook; cx: number; cy: number; r: number; width: number;
  /** 0 to 1. */ progress: number;
  color: string; track: string;
  /** Text colour of the theme; glass uses it for the tube. */ ink: string;
  dark: boolean;
  /** Estimated values draw dashed in every look, so an estimate never reads as measured. */ dashed?: boolean;
  /** Contour's two echo lines sit inside the ring. Turn them off when other rings are nested there. */ echoes?: boolean;
  testID?: string;
};

/**
 * One progress ring, drawn inside an <Svg>. Three looks share the geometry:
 * contour (flat arc with two faint echo lines), liquid (a swelling arc with a sheen and a drop at its end)
 * and glass (a clear tube with rim lights and a thinner glowing arc). All are still frames; nothing animates here.
 */
export function RingArc({ look, cx, cy, r, width, progress, color, track, ink, dark, dashed = false, echoes = true, testID }: Props) {
  const v = Math.min(Math.max(progress, 0), 1);
  const wide = width >= 10;
  const cap = dashed ? "butt" : "round";
  const dash = dashed ? "4 5" : undefined;
  const arc = (radius: number, strokeWidth: number, part = v, extra: object = {}) => part > 0
    ? <Path d={arcPath(cx, cy, radius, part)} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap={cap} strokeDasharray={dash} {...extra} />
    : null;
  if (look === "glass") {
    return <G testID={testID} id="ring-look-glass">
      <Circle cx={cx} cy={cy} r={r} fill="none" stroke={ink} strokeOpacity={dark ? 0.08 : 0.06} strokeWidth={width + (wide ? 7 : 3)} />
      {wide && <Circle cx={cx} cy={cy} r={r + width / 2 + 3.5} fill="none" stroke="#FFFFFF" strokeOpacity={dark ? 0.28 : 0.7} strokeWidth={1} />}
      {wide && <Circle cx={cx} cy={cy} r={r - width / 2 - 3.5} fill="none" stroke="#FFFFFF" strokeOpacity={dark ? 0.16 : 0.55} strokeWidth={1} />}
      {arc(r, width * 1.25, v, { strokeOpacity: 0.22 })}
      {arc(r, width * 0.62)}
      {wide && <Path d={arcPath(cx, cy, r + width * 0.5, 0.32)} fill="none" stroke="#FFFFFF" strokeOpacity={0.45} strokeWidth={1.6}
        strokeLinecap="round" transform={`rotate(-40 ${cx} ${cy})`} />}
    </G>;
  }
  if (look === "liquid") {
    // Swells along the arc stand in for the prototype's displacement filter, which react-native-svg cannot draw.
    const swells = wide && !dashed && v > 0.03
      ? Array.from({ length: Math.floor(v * 28) }, (_, i) => {
        const [x, y] = point(cx, cy, r + Math.sin(i * 2.1) * width * 0.07, TOP + ((i + 0.5) / 28) * Math.PI * 2);
        return <Circle key={i} cx={x} cy={y} r={(width / 2) * (1.02 + 0.13 * Math.sin(i * 1.7))} fill={color} />;
      })
      : null;
    const [ex, ey] = point(cx, cy, r, TOP + Math.min(v, 0.9999) * Math.PI * 2);
    return <G testID={testID} id="ring-look-liquid">
      <Circle cx={cx} cy={cy} r={r} fill="none" stroke={track} strokeOpacity={0.7} strokeWidth={width} />
      {arc(r, width * 1.05)}
      {swells}
      {wide && !dashed && v > 0 && <Path d={arcPath(cx, cy, r - width * 0.18, v * 0.92)} fill="none" stroke="#FFFFFF" strokeOpacity={0.28}
        strokeWidth={width * 0.22} strokeLinecap="round" />}
      {!dashed && v > 0.03 && <Circle cx={ex} cy={ey} r={width * 0.62} fill={color} />}
    </G>;
  }
  return <G testID={testID} id="ring-look-contour">
    <Circle cx={cx} cy={cy} r={r} fill="none" stroke={track} strokeWidth={width} />
    {arc(r, width)}
    {wide && echoes && !dashed && arc(r - width * 1.15, 1.2, v, { strokeOpacity: 0.35 })}
    {wide && echoes && !dashed && arc(r - width * 1.75, 1, v * 0.85, { strokeOpacity: 0.18 })}
  </G>;
}
