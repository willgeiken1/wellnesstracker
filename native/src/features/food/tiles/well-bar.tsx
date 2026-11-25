import { useState } from 'react';
import { View } from 'react-native';
import { useKit } from '@/components/kit';
import { raised, well } from '../../tiles/depth';
import { TileSurface } from '../../tiles/tile-surface';

/* Kept apart from ../ui.tsx so the sheets, which never draw it, do not load Skia. */

/** A recessed track with a raised fill (the tiles' `bar`): a well the full width, the fill to `frac`, an optional mark. */
export function WellBar({ frac, h, color, mark, dim, width: given }: { frac: number; h: number; color: string; mark?: number | null; dim?: boolean; width?: number }) {
  const k = useKit();
  const [measured, setW] = useState(0);
  const width = given ?? measured;
  const f = Math.max(0, Math.min(1, frac)), fw = f > 0 ? Math.max(h, f * width) : 0;
  return <View onLayout={given ? undefined : e => setW(e.nativeEvent.layout.width)} style={{ height: h, width: given, flex: given ? undefined : 1 }}>
    {width ? <TileSurface spec={well(k.c as never, k.mode)} width={width} height={h} /> : null}
    {fw ? <View style={{ position: 'absolute', left: 0, top: 0, width: fw, height: h, opacity: dim ? 0.5 : 1 }}>
      <TileSurface spec={raised(color, k.mode)} width={fw} height={h} />
    </View> : null}
    {mark != null && width ? <View style={{ position: 'absolute', top: -3, bottom: -3, left: mark * width - 1, width: 2, borderRadius: 1, backgroundColor: k.c.text, opacity: 0.6 }} /> : null}
  </View>;
}

