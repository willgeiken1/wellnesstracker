import { useEffect, useRef, useState } from "react";
import type { Intensity, Motion } from "@/design/looks";

const easeOut = (k: number) => 1 - (1 - k) ** 3;
/** Ease out and run a little past the end before settling. `push` sets how far past. */
const overshoot = (k: number, push: number) => 1 + (push + 1) * (k - 1) ** 3 + push * (k - 1) ** 2;
export const sweepDuration = (motion: Motion, intensity: Intensity) => (motion === "lively" ? 620 + intensity * 120 : motion === "calm" ? 600 : 0);
/** Where a sweep from `start` to `target` is after `k` (0 to 1) of its time. */
export const sweepAt = (start: number, target: number, k: number, motion: Motion, intensity: Intensity) =>
  motion === "basic" || k >= 1 ? target : start + (target - start) * (motion === "lively" ? overshoot(k, 0.5 * intensity) : easeOut(k));

/**
 * The value a ring should draw right now. With motion off it is always the target. Otherwise a ring that appears
 * sweeps in from empty, and a later change sweeps from where the ring was.
 */
export function useSweep(target: number, motion: Motion, intensity: Intensity) {
  const [shown, setShown] = useState(motion === "basic" ? target : 0);
  const at = useRef(shown);
  useEffect(() => {
    const start = at.current;
    if (motion === "basic" || start === target) { at.current = target; setShown(target); return; }
    const began = Date.now(), duration = sweepDuration(motion, intensity);
    let frame = requestAnimationFrame(function tick() {
      const k = Math.min((Date.now() - began) / duration, 1);
      at.current = sweepAt(start, target, k, motion, intensity);
      setShown(at.current);
      if (k < 1) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [target, motion, intensity]);
  return motion === "basic" ? target : shown;
}
