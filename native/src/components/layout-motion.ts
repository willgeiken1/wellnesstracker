import { useCallback } from 'react';
import { LayoutAnimation } from 'react-native';
import { useTheme } from '@/design/theme-provider';

/** How a row eases in, out or to its new place when the list around it changes. */
export function layoutMotion(duration: number) {
  return LayoutAnimation.create(duration, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity);
}

/**
 * Returns a function to call just before a change that adds, removes, moves or folds
 * rows, so the next layout glides instead of jumping. It does nothing while Reduce
 * Motion is on, because the theme then reports a sheet time of 0.
 */
export function useLayoutMotion() {
  const { motion } = useTheme();
  const duration = motion.sheet;
  return useCallback(() => {
    if (duration > 0) LayoutAnimation.configureNext(layoutMotion(duration));
  }, [duration]);
}
