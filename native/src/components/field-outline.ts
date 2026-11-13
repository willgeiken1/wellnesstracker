import { useTheme } from '@/design/theme-provider';
import { useIncreaseContrast } from './use-accessibility';

/**
 * Text fields are drawn as soft fills, and their edges are faint against the page (WCAG 1.4.11 asks for 3:1).
 * When iOS Increase Contrast is on, every field gets a hairline in the muted text colour, which clears 4.5:1 on
 * every theme's surfaces. The default look does not change.
 */
export function useFieldOutline() {
  const { colors } = useTheme();
  const on = useIncreaseContrast();
  return on ? { borderWidth: 1, borderColor: colors['text-muted'] } as const : null;
}
