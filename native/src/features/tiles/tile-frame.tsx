import { memo, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { tokens, type ThemeColors, type ThemeMode } from '@/design/tokens';
import { gridTile, studioTile, type DepthShadow } from './depth';
import { BODY_TOP, FRAMES, HEAD_H, PAD } from './geometry';
import { optionValues, styleOf } from './model';
import { isPending } from './pending';
import { TileIcon } from './tile-icon';
import { TileSurface } from './tile-surface';
import type { LayoutEntry, TileDef, TilePageConfig, TileRender, TileRenderer, TileRenderProps, TileSize } from './types';

function rendererFor(render: TileRender, size: TileSize): TileRenderer | null {
  if (typeof render === 'function') return render;
  return render[size] ?? render.M ?? render.S ?? render.L ?? null;
}

export interface TileFrameProps {
  cfg: TilePageConfig;
  def: TileDef;
  entry: Pick<LayoutEntry, 'size' | 'style' | 'options'>;
  colors: ThemeColors;
  mode: ThemeMode;
  reduceMotion: boolean;
  editing?: boolean;
  preview?: boolean;
  /** The lifted tile's deeper shadow while it is dragged. */
  lift?: readonly DepthShadow[];
}

/**
 * One tile: the frame's depth (Skia), the header (icon in the tile's colour, title, meta) and the body the tile's
 * renderer draws. Home's tiles use Home's own frame and draw their own header; a tile still on its pending stub gets
 * the engine's header so it reads as itself until its packet builds it.
 */
export const TileFrame = memo(function TileFrame({ cfg, def, entry, colors, mode, reduceMotion, editing = false, preview = false, lift }: TileFrameProps) {
  const f = FRAMES[entry.size] ?? FRAMES.S;
  const v = styleOf(def, entry.style);
  const render = rendererFor(v.render, entry.size);
  const pending = !render || isPending(render);
  const head = def.head !== false || pending;
  const tint = (colors[def.color] as string | undefined) ?? colors.accent;
  const body = { w: f.w - PAD * 2, h: f.h - (head ? BODY_TOP + PAD : PAD * 2) };
  const props: TileRenderProps = {
    page: cfg.id, id: def.id, size: entry.size, style: v.key, options: optionValues(def, v.key, entry.options),
    frame: f, body, colors, tint, mode, reduceMotion, editing, preview,
  };
  let content: ReactNode = null, meta = '';
  try {
    content = render ? render(props) : null;
    const m = v.meta ?? def.meta;
    if (m && (entry.size !== 'S' || def.metaS)) meta = m(props) || '';
  } catch {
    // One tile failing to draw leaves the rest of the page working; it shows its frame and header only.
    content = null;
  }
  const spec = cfg.variant === 'home' ? studioTile(colors, mode) : gridTile(colors, mode);
  return <View style={{ width: f.w, height: f.h }}>
    <TileSurface spec={spec} width={f.w} height={f.h} extraShadows={lift} />
    <View style={[styles.clip, { width: f.w, height: f.h }]}>
      {head ? <View style={styles.head}>
        <TileIcon name={def.icon} size={18} color={tint} />
        <Text numberOfLines={1} style={[styles.title, { color: colors.text }]}>{def.title}</Text>
        {meta ? <Text numberOfLines={1} style={[styles.meta, { color: colors['text-muted'] }]}>{meta}</Text> : null}
      </View> : null}
      <View pointerEvents={editing || preview ? 'none' : 'box-none'} style={[styles.body, { top: head ? BODY_TOP : PAD, width: body.w, height: body.h }]}>{content}</View>
    </View>
  </View>;
});

const styles = StyleSheet.create({
  clip: { position: 'absolute', left: 0, top: 0, borderRadius: 20, overflow: 'hidden' },
  head: { position: 'absolute', left: PAD, top: PAD, right: PAD, height: HEAD_H, flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { flexShrink: 1, minWidth: 0, fontFamily: tokens.font.bodyStrong, fontSize: 14, lineHeight: 20 },
  meta: { marginLeft: 'auto', flexShrink: 0, paddingLeft: 4, fontFamily: tokens.font.body, fontSize: 13, lineHeight: 20 },
  body: { position: 'absolute', left: PAD },
});
