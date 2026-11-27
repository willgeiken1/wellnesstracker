import { Box, BoxShadow, Canvas, LinearGradient, rect, rrect, vec } from '@shopify/react-native-skia';
import { StyleSheet, View } from 'react-native';
import { shadowReach, type DepthShadow, type DepthSpec } from './depth';

// CSS blur radius to Skia's Gaussian sigma; a 1 pt line has no blur (a tiny sigma keeps the mask filter valid).
const sigma = (blur: number) => Math.max(0.01, blur / 2);

/**
 * Draws a depth spec (tile, well, raised fill, plate) behind its children: the top-lit gradient, the 1 pt light
 * lines and the layered drop shadows, with Skia. The canvas reaches past the box so the shadows are not cut off.
 */
export function TileSurface({ spec, width, height, extraShadows }: { spec: DepthSpec; width: number; height: number; extraShadows?: readonly DepthShadow[] }) {
  const outer = [...(extraShadows ?? []), ...spec.shadows];
  const reach = shadowReach(outer);
  const r = Math.min(spec.radius, width / 2, height / 2);
  const box = rrect(rect(reach.l, reach.t, width, height), r, r);
  const w = width + reach.l + reach.r, h = height + reach.t + reach.b;
  return <View pointerEvents="none" style={[styles.abs, { left: -reach.l, top: -reach.t, width: w, height: h }]}>
    <Canvas style={{ width: w, height: h }}>
      <Box box={box}>
        <LinearGradient start={vec(0, reach.t)} end={vec(0, reach.t + height)} colors={spec.stops.map(s => s[0])} positions={spec.stops.map(s => s[1])} />
        {/* CSS paints the first shadow on top; Skia paints in order, so the list goes in reverse */}
        {outer.slice().reverse().map((s, i) => <BoxShadow key={`o${i}`} dx={s.x} dy={s.y} blur={sigma(s.blur)} spread={s.spread} color={s.color} />)}
        {spec.outerRing ? <BoxShadow dx={0} dy={0} blur={sigma(0)} spread={1} color={spec.outerRing} /> : null}
        {spec.innerRing ? <BoxShadow inner dx={0} dy={0} blur={sigma(0)} spread={1} color={spec.innerRing} /> : null}
        {spec.topLine ? <BoxShadow inner dx={0} dy={1} blur={sigma(0)} color={spec.topLine} /> : null}
        {spec.bottomLine ? <BoxShadow inner dx={0} dy={-1} blur={sigma(0)} color={spec.bottomLine} /> : null}
        {spec.sink ? <BoxShadow inner dx={0} dy={spec.sink[0]} blur={sigma(spec.sink[1])} color={spec.sink[2]} /> : null}
      </Box>
    </Canvas>
  </View>;
}
const styles = StyleSheet.create({ abs: { position: 'absolute' } });
