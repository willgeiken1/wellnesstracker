import { useEffect, useRef, type ComponentProps } from 'react';
import { Platform } from 'react-native';
import { announce } from './announce';
import { ThemedText } from './themed-text';

type Props = ComponentProps<typeof ThemedText> & {
  /** What is spoken. Defaults to the text when the children are a plain string or number. */
  announcement?: string;
  /** Speak when the line first appears. Turn off for a status line that is on screen from the start. */
  announceOnMount?: boolean;
  /** Wait for what VoiceOver is already saying, such as the button just pressed, instead of cutting it off. */
  queue?: boolean;
};

/**
 * A line of text that tells screen reader users when it appears or changes: a saved note, an error,
 * a limit reached. Android reads it through the live region; iOS has no live regions, so it is
 * announced. Everything spoken here is also on screen.
 */
export function StatusText({ announcement, announceOnMount = true, queue = false, children, ...props }: Props) {
  const message = announcement ?? (typeof children === 'string' || typeof children === 'number' ? String(children) : '');
  useAnnounceChange(message, announceOnMount, queue);
  return <ThemedText accessibilityLiveRegion="polite" {...props}>{children}</ThemedText>;
}

/** On iOS, announce `message` when it appears (unless `onMount` is false) and whenever it changes. */
export function useAnnounceChange(message: string, onMount = true, queue = false) {
  const first = useRef(true);
  useEffect(() => {
    const skip = first.current && !onMount;
    first.current = false;
    if (skip || Platform.OS !== 'ios') return;
    announce(message, { queue });
  }, [message, onMount, queue]);
}

/** Nothing on screen; speaks `message` on iOS when it appears or changes. For a status drawn as a View with its own label. */
export function Announce({ message, onMount = true }: { message: string; onMount?: boolean }) {
  useAnnounceChange(message, onMount);
  return null;
}
