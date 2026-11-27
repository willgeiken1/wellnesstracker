import * as Haptics from 'expo-haptics';
import { showToast } from '@/features/shell/toast';
import { t } from '@/i18n/en';
import { fill } from '../tiles/ui';
import { itemById, markOf, nowOf } from './model';
import type { RoutinesStore } from './store';

const tap = () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); };

/** Ticks an item off (or takes the tick back), with a light tap and an Undo toast when it is ticked. */
export function toggleDone(store: RoutinesStore, id: string) {
  const s = store.read(), i = itemById(s, id); if (!i) return;
  const was = markOf(s, nowOf().day, id) === 'd';
  store.toggleDone(id); tap();
  if (!was) showToast(i.kind === 'dose' ? fill(t('routinesLogged'), { dose: i.dose, name: i.name }) : fill(t('routinesDoneName'), { name: i.name }),
    { color: 'sleep', action: { label: t('routinesUndo'), onAction: () => store.toggleDone(id) } });
}
/** Skips an item today (or takes the skip back), with an Undo toast. */
export function toggleSkip(store: RoutinesStore, id: string) {
  const s = store.read(), i = itemById(s, id); if (!i) return;
  const was = markOf(s, nowOf().day, id) === 's';
  store.toggleSkip(id); tap();
  if (!was) showToast(fill(t('routinesSkippedToast'), { name: i.name }), { color: 'sleep', action: { label: t('routinesUndo'), onAction: () => store.toggleSkip(id) } });
}
