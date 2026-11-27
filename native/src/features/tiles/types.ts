import type { ReactNode } from 'react';
import type { ThemeColors, ThemeMode } from '@/design/tokens';

/** The three tile sizes: S is half a row, M a full row, L a full row and taller. */
export type TileSize = 'S' | 'M' | 'L';
/** The pages that are made of tiles. */
export type TilePageId = 'home' | 'training' | 'food' | 'progress' | 'routines';
/** A colour token name from the theme (training, food, sleep, accent, ...). */
export type TileColor = keyof ThemeColors;

/** One choice of an option: its stored value, its full label (VoiceOver, the section sheet) and an optional short label for the segmented row. */
export type TileChoice = readonly [value: string, label: string, short?: string];
/** Something a person can pick for a tile (what it shows, a range). The first choice is the default. */
export interface TileOption { id: string; label: string; choices: readonly TileChoice[] }
export type TileOptionValues = Record<string, string>;

export interface TileFrameSize { w: number; h: number }
/** What a tile renderer is given. Draw only inside `body`; colours come from `colors` (the tile's own colour is `tint`). */
export interface TileRenderProps {
  page: TilePageId;
  id: string;
  size: TileSize;
  /** The style key (see TileDef.versions); 'A' for a tile with one style. */
  style: string;
  options: TileOptionValues;
  /** The whole tile. */
  frame: TileFrameSize;
  /** The box under the header (or the whole tile less 16 pt padding when the tile draws its own header). */
  body: TileFrameSize;
  colors: ThemeColors;
  tint: string;
  mode: ThemeMode;
  reduceMotion: boolean;
  /** True while the page is in edit mode: controls inside a tile step aside so a tap customizes the tile. */
  editing: boolean;
  /** True when drawn small inside the tile tray or the customize sheet: no live controls, no entrance motion. */
  preview: boolean;
}
export type TileRenderer = (props: TileRenderProps) => ReactNode;
/** One renderer for every size, or one per size. */
export type TileRender = TileRenderer | Partial<Record<TileSize, TileRenderer>>;

/** One look of a tile (Home's tiles have several: Dial, Rings, Trend ...). */
export interface TileStyle {
  key: string;
  name: string;
  sizes?: readonly TileSize[];
  options?: readonly TileOption[];
  render: TileRender;
  meta?: (props: TileRenderProps) => string;
  /** Listed under "Depth styles" in the Home tray. */
  depth?: boolean;
}

export interface TileDef {
  id: string;
  title: string;
  /** The line under the title in the tray. */
  sub: string;
  icon: string;
  color: TileColor;
  /** Tray section, matched to the page's groups. */
  group?: string;
  sizes: readonly TileSize[];
  /** The size the tray starts on. */
  size?: TileSize;
  options?: readonly TileOption[];
  render: TileRender;
  /** Short text at the right of the header; hidden on small tiles unless metaS. */
  meta?: (props: TileRenderProps) => string;
  metaS?: boolean;
  /** false: the engine draws no header, the tile draws its own. */
  head?: boolean;
  /** Optional styles; without them the tile is its own single style. */
  versions?: readonly TileStyle[];
  /** The style a newly added tile starts in (default: the first). */
  style?: string;
  /** What a tap does, for VoiceOver ("Open the plan"). */
  label?: string;
  /** What a tap opens. The page packet wires this to its routes. */
  open?: (options: TileOptionValues) => void;
  /** A cover over the tile's figures (Hide numbers): while covered, a tap shows them instead of opening the tile. */
  cover?: TileCover;
}

/** An outside store that says when a tile's figures are covered, what VoiceOver says then, and how a tap shows them. */
export interface TileCover {
  subscribe: (listener: () => void) => () => void;
  covered: () => boolean;
  /** The tile's label while covered, from its title ("Weight hidden. Show numbers"). */
  label: (title: string) => string;
  reveal: () => void;
}

/** [id, size, style key?, options?] the compact form a default layout is written in. */
export type TileDefault = readonly [id: string, size: TileSize, style?: string, options?: TileOptionValues];

export interface TilePageConfig {
  id: TilePageId;
  /** Page name used in copy: "On Training", "Remove from Training". */
  label: string;
  /** Colour token for the tray's tile icons and the empty state. */
  color: TileColor;
  /** Tray sections in order: [name, colour]. */
  groups?: readonly (readonly [string, TileColor])[];
  /** Tray intro line. */
  intro?: string;
  defaults: readonly TileDefault[];
  tiles: readonly TileDef[];
  /** Tiles that joined the starting layout after layouts were already saved on phones (see TileArrival). */
  arrivals?: readonly TileArrival[];
  /** Home keeps its own tray copy, filter chips and tile frame; every other page uses the page variant. */
  variant?: 'page' | 'home';
}

/**
 * A tile added to a page's starting layout in a later build. A layout saved before `rev` gets it once, on load, so an
 * existing install has it too; a layout saved at `rev` or later is left as the person keeps it (a tile they removed stays
 * in the tray). It goes in after `after` when that tile is on the page, otherwise first.
 */
export interface TileArrival { id: string; rev: number; size?: TileSize; style?: string; after?: string }

/** One tile on a page: which tile, its size, style and options. */
export interface LayoutEntry { id: string; size: TileSize; style: string; options: TileOptionValues }
export interface TilePos { x: number; y: number; w: number; h: number }
