import { exerciseLibrary, type Exercise } from './library';
import type { Equipment } from './rules';
export const muscles = [...new Set(exerciseLibrary.flatMap(e => e.main ? [e.main, ...e.helpers] : e.helpers))].sort();
export const equipmentTypes: Equipment[] = ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'other'];
export function validCustomExercise(e: { name: string; main?: string; equipment?: string; helpers?: string[] }) {
  return !!e.name.trim() && e.name.trim().length <= 100 && muscles.includes(e.main ?? '') && equipmentTypes.includes(e.equipment as Equipment) && (e.helpers ?? []).every(m => muscles.includes(m));
}
function distance(a: string, b: string) {
  const rows = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0));
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    rows[i][j] = Math.min(rows[i][j - 1] + 1, rows[i - 1][j] + 1, rows[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
  }
  return rows[a.length][b.length];
}
export function filterExercises(library: Exercise[], query = '', muscle = '', equipment = '', recent: string[] = []) {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return library.filter(e => (!muscle || e.main === muscle || e.helpers.includes(muscle)) && (!equipment || e.equipment === equipment) && words.every(word => e.name.toLowerCase().split(/\s+/).some(part => part.includes(word) || (word.length >= 4 && part.length >= 4 && distance(word, part) <= 1))))
    .sort((a, b) => {
      const rank = (name: string) => { const i = recent.indexOf(name); return i < 0 ? Infinity : i; };
      return rank(a.name) - rank(b.name);
    });
}
