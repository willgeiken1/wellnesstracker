/* The tile grid engine: one grid, tray and customize sheet for every page made of tiles. See TILES.md. */
export type { LayoutEntry, TileChoice, TileDef, TileDefault, TileOption, TileOptionValues, TilePageConfig, TilePageId, TileRender, TileRenderer, TileRenderProps, TileSize, TileStyle } from './types';
export { FRAMES, GAP, GRID_W, TILE_RADIUS } from './geometry';
export { implementTile, pendingTiles, registerTilePage, tilePage, tilePageIds, type TileImplementation } from './registry';
export { pendingTile } from './pending';
export { configureTileToast, loadTileLayout, resetTileStores, saveTileLayout, tileEdit, tileLayoutKey, tileStoreFor, type TileStorage, type TileStore, type TileToast } from './store';
export { useTileEdit, useTileStore } from './use-tiles';
export { configureTileRoutes, tileRoutes, tileSheetOptions, type TileRoutes } from './nav';
export { TileGrid, TileEditBar, type TileGridProps } from './tile-grid';
export { TileFrame } from './tile-frame';
export { TileIcon } from './tile-icon';
export { TileSurface } from './tile-surface';
export { gridTile, liftShadows, plate, raised, studioTile, well, type DepthSpec } from './depth';
export { TileTraySheet } from './tray-sheet';
export { TileCustomizeSheet } from './customize-sheet';
export { PageSections, useSections } from './sections';
export { createSectionStore, resetSectionStores, sectionKey, sectionStoreFor, type PageSection } from './section-store';
export { PageSectionSheet } from './section-sheet';
