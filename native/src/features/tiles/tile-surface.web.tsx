import { createElement } from 'react';
import type { DepthShadow, DepthSpec } from './depth';

const css = (s: DepthShadow, inset = false) => `${inset ? 'inset ' : ''}${s.x}px ${s.y}px ${s.blur}px ${s.spread}px ${s.color}`;

/** The web build (design checks only) draws the same depth spec with CSS, so it can be compared with the reference shots. */
export function TileSurface({ spec, width, height, extraShadows }: { spec: DepthSpec; width: number; height: number; extraShadows?: readonly DepthShadow[] }) {
  const shadows = [
    spec.topLine ? `inset 0 1px 0 ${spec.topLine}` : '',
    spec.bottomLine ? `inset 0 -1px 0 ${spec.bottomLine}` : '',
    spec.sink ? `inset 0 ${spec.sink[0]}px ${spec.sink[1]}px ${spec.sink[2]}` : '',
    spec.innerRing ? `inset 0 0 0 1px ${spec.innerRing}` : '',
    spec.outerRing ? `0 0 0 1px ${spec.outerRing}` : '',
    ...spec.shadows.map(s => css(s)),
    ...(extraShadows ?? []).map(s => css(s)),
  ].filter(Boolean).join(',');
  return createElement('div', { 'aria-hidden': true, style: {
    position: 'absolute', left: 0, top: 0, width, height, borderRadius: spec.radius, pointerEvents: 'none',
    background: `linear-gradient(180deg,${spec.stops.map(s => `${s[0]} ${s[1] * 100}%`).join(',')})`, boxShadow: shadows,
  } });
}
