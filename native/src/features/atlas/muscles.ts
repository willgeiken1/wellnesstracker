import source from '../../../assets/atlas/muscles.json';
import { en } from '@/i18n/en';
export const atlasMuscles = source.map(m => ({...m,
 name: en[`atlas_${m.key}` as keyof typeof en],
 scientific: en[`atlasScientific_${m.key}` as keyof typeof en],
}));
