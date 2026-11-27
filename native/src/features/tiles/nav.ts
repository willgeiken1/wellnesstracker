import { router, type Href, type NativeStackNavigationOptions } from 'expo-router';
import type { TilePageId } from './types';
import { largeSheet, mediumSheet, tileEditSheet } from '../navigation/presentation';

/**
 * Where the grid sends a person: the tile tray, the customize sheet and a page section's sheet. They default to
 * the form-sheet routes under src/app/tiles/ (see TILES.md); a page can point them elsewhere.
 */
export interface TileRoutes {
  tray: (page: TilePageId) => void;
  customize: (page: TilePageId, id: string) => void;
  section: (page: string, id: string) => void;
  /** Closes the sheet on top (the sheet header's Done). */
  close: () => void;
}
const go = (href: string) => router.push(href as unknown as Href);
let routes: TileRoutes = {
  tray: page => go(`/tiles/tray?page=${page}`),
  customize: (page, id) => go(`/tiles/edit?page=${page}&id=${encodeURIComponent(id)}`),
  section: (page, id) => go(`/tiles/section?page=${encodeURIComponent(page)}&id=${encodeURIComponent(id)}`),
  close: () => { if (router.canGoBack()) router.back(); },
};
export function configureTileRoutes(next: Partial<TileRoutes>) { routes = { ...routes, ...next }; }
export const tileRoutes = (): TileRoutes => routes;

/** Stack options for the three sheet routes (registered in app/_layout.tsx): the tray is a large sheet; Customize and a
 * page section are medium sheets at the design's height (Home's Customize is taller). */
export const tileSheetOptions: Record<'tray' | 'edit' | 'section', NativeStackNavigationOptions> = {
  tray: largeSheet,
  edit: tileEditSheet(),
  section: mediumSheet('page-section'),
};
export { tileEditSheet };
