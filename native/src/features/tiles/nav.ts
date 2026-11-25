import { router, type Href } from 'expo-router';
import type { TilePageId } from './types';

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

/** Stack options for the three sheet routes (tray full height, the other two at half height, like the design). */
export const tileSheetOptions = {
  tray: { presentation: 'formSheet', headerShown: false, sheetAllowedDetents: [1], sheetGrabberVisible: true, sheetCornerRadius: 28 },
  edit: { presentation: 'formSheet', headerShown: false, sheetAllowedDetents: [0.56, 1], sheetGrabberVisible: true, sheetCornerRadius: 28 },
  section: { presentation: 'formSheet', headerShown: false, sheetAllowedDetents: [0.56, 1], sheetGrabberVisible: true, sheetCornerRadius: 28 },
} as const;
