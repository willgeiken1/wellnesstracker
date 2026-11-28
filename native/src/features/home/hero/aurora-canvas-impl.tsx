import { Canvas, Picture, Skia, type SkPicture } from '@shopify/react-native-skia';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { GestureDetector, useTapGesture } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { AuroraScene } from './aurora-scene';
import { HERO_H } from './camera';
import type { Triple } from './field';
import type { HeroMotion } from './motion';

/**
 * The Aurora artwork: one Skia canvas the scene draws into, a frame at a time and only while something moves (the opening
 * build, a day change, a glint, a drag easing back). At rest the last picture stays and nothing runs. The hero's swipe (aurora.tsx)
 * turns the globe through the motion and asks for frames with `motion.kick`; a tap on the sky hands back to the readout. Loaded on
 * its own so the rest of Home never needs Skia.
 */
export interface AuroraCanvasProps {
  motion: HeroMotion; width: number; dpr: number; mode: 'dark' | 'light'; colors: Record<string, string>;
  levels: number; glow: number; values: Triple; rest: boolean; sel: number; animate: boolean; calm: boolean;
  focus: number; paused: boolean; reduceMotion: boolean;
  onTapSky: () => void; onTouch: () => void;
  /** The device can't run the hero's shaders: Home shows another map style. */
  onFail: () => void;
}

export function AuroraCanvas(p: AuroraCanvasProps) {
  const { motion, width, dpr, mode, colors, levels, glow, paused } = p;
  const [pic, setPic] = useState<SkPicture | null>(null);
  const scene = useRef<AuroraScene | null>(null);
  const raf = useRef(0);
  const live = useRef({ paused, dead: false });
  const drawRef = useRef<() => void>(() => {});
  const failed = useRef(false);

  const invalidate = () => { if (!raf.current && !live.current.paused && !live.current.dead) raf.current = requestAnimationFrame(() => drawRef.current()); };
  // Kept current at commit, before the effects below run and before any frame can fire.
  useLayoutEffect(() => {
    live.current.paused = paused;
    drawRef.current = () => {
      raf.current = 0;
      const sc = scene.current;
      if (!sc || live.current.paused || live.current.dead) return;
      const { f, busy } = motion.frame(performance.now());
      const rec = Skia.PictureRecorder(), c = rec.beginRecording(Skia.XYWHRect(0, 0, sc.w, sc.h));
      sc.draw(c, f);
      setPic(rec.finishRecordingAsPicture());
      if (busy) invalidate(); else motion.rest();
    };
  });

  // The scene follows the width, theme and detail; a new scene draws the current day without its build.
  const firstDay = useRef(true);
  useEffect(() => {
    let sc: AuroraScene | null = null;
    try { sc = new AuroraScene(Skia, { w: width, dpr, mode, colors, levels, glow }); } catch { sc = null; }
    if (!sc || !sc.ok) { if (!failed.current) { failed.current = true; p.onFail(); } return; }
    sc.setData(p.values, false);
    scene.current = sc;
    motion.setOnSettle(() => scene.current?.settle());
    motion.setKick(invalidate);
    motion.setWidth(width);
    if (firstDay.current) { firstDay.current = false; motion.start({ values: p.values, rest: p.rest }, performance.now(), p.calm); }
    invalidate();
    return () => { if (scene.current === sc) scene.current = null; };
  }, [width, dpr, mode, colors, levels, glow]); // eslint-disable-line react-hooks/exhaustive-deps

  // A new day: the curtains cross over (or swap at once under Reduce Motion).
  const lastSel = useRef(p.sel), lastKey = useRef(p.values.join());
  useEffect(() => {
    const key = p.values.join();
    if (key === lastKey.current && p.sel === lastSel.current) return;
    const dir = Math.sign(p.sel - lastSel.current);
    lastKey.current = key; lastSel.current = p.sel;
    const morph = motion.setDay({ values: p.values, rest: p.rest }, p.animate, dir, performance.now());
    // Mid crossing, the rising curtains either become the leaving ones ('promote') or take the new day's shape ('replace').
    if (morph === 'promote') scene.current?.settle();
    scene.current?.setData(p.values, !!morph);
    invalidate();
  }, [p.values, p.sel, p.rest, p.animate]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { motion.focus(p.focus); invalidate(); }, [p.focus]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { motion.setReduceMotion(p.reduceMotion); invalidate(); }, [p.reduceMotion]); // eslint-disable-line react-hooks/exhaustive-deps
  // Paused while Home isn't in front: no frames at all; on return the last frame time is forgotten so nothing jumps.
  useEffect(() => {
    if (paused) { if (raf.current) cancelAnimationFrame(raf.current); raf.current = 0; motion.rest(); } else invalidate();
  }, [paused]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { live.current.dead = true; if (raf.current) cancelAnimationFrame(raf.current); raf.current = 0; }, []);

  const begin = () => { p.onTouch(); motion.finishEntrance(); invalidate(); };
  const onTapSky = p.onTapSky;
  const tap = useTapGesture({ maxDistance: 6, onBegin: () => { 'worklet'; runOnJS(begin)(); }, onActivate: () => { 'worklet'; runOnJS(onTapSky)(); } });

  return <GestureDetector gesture={tap}>
    <Canvas style={{ position: 'absolute', left: 0, top: 0, width, height: HERO_H }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {pic ? <Picture picture={pic} /> : null}
    </Canvas>
  </GestureDetector>;
}
export default AuroraCanvas;
