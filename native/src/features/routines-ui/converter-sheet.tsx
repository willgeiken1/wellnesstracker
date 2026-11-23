import { useEffect, useState } from 'react';
import { rs } from '@/i18n/en';
import { saveItemNote } from '@/features/routines/model/actions';
import type { RoutineStore, RoutineView } from '@/features/routines/model/shape';
import { commitRoutines, routineClockNow, useRoutines, type RoutinesData } from './add-item-data';
import { announce, SheetUnavailable, useSheetClose } from './add-item-frame';
import { openConverterDraft, type ConverterDraft } from './converter';
import { converterShown } from './converter-shown';
import { ConverterStep } from './converter-step';

function Converter({ data, store, view, itemId, onClose }: { data: RoutinesData; store: RoutineStore; view: RoutineView; itemId?: string; onClose: () => void }) {
  const item = itemId ? view.items.find((row) => row.id === itemId) : undefined;
  const dose = !!item && item.kind === 'dose';
  /* Opened for a saved dose item, the amount and unit saved on it carry into Amount to convert, so they are not
     typed twice. They are the user's own numbers. The vial and the water always start empty. */
  const [calc, setCalc] = useState<ConverterDraft>(() => {
    const compound = dose && item.compoundId ? view.compounds.find((row) => row.id === item.compoundId) : undefined;
    return compound ? openConverterDraft(compound.amount, compound.unit) : openConverterDraft();
  });
  const [error, setError] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(timer);
  }, [toast]);
  const save = (note: string, inputs: { vialAmount: unknown; waterMl: unknown; vialUnit: string }) => {
    const next = item ? saveItemNote(store, item.id, note, routineClockNow(store), inputs) : null;
    if (!note || !commitRoutines(data.repository, next)) { setError(rs('noteFailed')); announce(rs('noteFailed')); return; }
    setError(''); setToast(rs('noteSaved')); announce(rs('noteSaved'));
  };
  return <ConverterStep draft={calc} onDraft={(next) => { setCalc(next); setError(''); }} onDone={onClose} onClose={onClose} canSave={dose} onSave={save} error={error} toast={toast} />;
}

/**
 * The concentration converter opened by itself, from the Peptides tab or from an item's details. It is the
 * whole sheet: the close button and Close both dismiss it, and there is no item form behind it. In a build
 * with the converter cut, or on a page that does not show it, the sheet closes at once and draws nothing.
 */
export function ConverterSheet({ itemId }: { itemId?: string }) {
  const data = useRoutines();
  const { leave } = useSheetClose(false);
  const shown = converterShown(data.store);
  const gone = !!data.store && !shown;
  useEffect(() => { if (gone) leave(); }, [gone, leave]);
  if (!data.store || !data.view) return <SheetUnavailable testID="converter" title={rs('unavailable')} onClose={leave} />;
  if (!shown) return null;
  return <Converter key={itemId ?? 'none'} data={data} store={data.store} view={data.view} itemId={itemId} onClose={leave} />;
}
