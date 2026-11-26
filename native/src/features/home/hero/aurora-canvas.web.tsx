import { WithSkiaWeb } from '@shopify/react-native-skia/lib/module/web';
import type { AuroraCanvasProps } from './aurora-canvas-impl';

export type { AuroraCanvasProps };
/** The web build (design checks only) loads Skia's CanvasKit first, then draws the same canvas as the phone. */
export function AuroraCanvas(p: AuroraCanvasProps) {
  return <WithSkiaWeb getComponent={() => import('./aurora-canvas-impl')} componentProps={p} fallback={null} opts={{ locateFile: (f: string) => `/${f}` }} />;
}
