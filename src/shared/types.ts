/**
 * Easy Scene shared types — used by the Node CLI/server/MCP and the web UI.
 * Pure TypeScript: no Node imports here.
 */

export type PartKind = "background" | "tileset" | "prop";
export const PART_KINDS: PartKind[] = ["background", "tileset", "prop"];

/** Parallax depth bands, back to front. */
export type LayerBand = "sky" | "far" | "mid" | "near";
export const LAYER_BANDS: LayerBand[] = ["sky", "far", "mid", "near"];

/** Default scroll factor per band (0 = fixed to camera, 1 = moves with the tilemap). */
export const DEFAULT_SCROLL: Record<LayerBand, number> = {
  sky: 0.05,
  far: 0.2,
  mid: 0.45,
  near: 0.75,
};

export interface PartMetaBase {
  id: string;
  kind: PartKind;
  name: string;
  /** Image file inside the part folder. */
  image: string;
  width: number;
  height: number;
  tags?: string[];
  /** Main hue the art was drawn in; `color` on a layer/prop remaps this hue (easysprite recolor). */
  recolorBase?: string;
  /** true for the procedurally generated demo set. */
  sample?: boolean;
  license?: string;
  credit?: string;
}

export interface BackgroundPart extends PartMetaBase {
  kind: "background";
  band: LayerBand;
  /** Horizontal period in px; the image wraps seamlessly every loopWidth px. */
  loopWidth: number;
  defaultScroll: number;
}

export interface TilesetPart extends PartMetaBase {
  kind: "tileset";
  tileSize: number;
  columns: number;
  rows: number;
}

export interface PropPart extends PartMetaBase {
  kind: "prop";
  /** Draw behind (back) or in front of (front) characters by default. */
  defaultLayer: PropLayer;
  /** Optional solid box relative to the prop's top-left, px. */
  collision?: Rect;
  /**
   * Browsing group (optional; parts without one are listed under "decor").
   * `building` parts are modular: width is a multiple of the tile size, the art reaches both edges
   * of the footprint and the bottom row is the ground line, so they chain with `x += width`.
   */
  category?: PropCategory;
}

export type PropCategory = "building" | "street" | "nature" | "water" | "decor";
export const PROP_CATEGORIES: PropCategory[] = ["building", "street", "nature", "water", "decor"];
export const PROP_CATEGORY_LABELS: Record<PropCategory, string> = {
  building: "Buildings",
  street: "Street",
  nature: "Nature",
  water: "Canal & water",
  decor: "Decor",
};

/** A prop's browsing group (falls back to "decor"). */
export function propCategory(part: Pick<PartMetaBase, "kind"> & { category?: PropCategory }): PropCategory {
  return part.category && PROP_CATEGORIES.includes(part.category) ? part.category : "decor";
}

export type PartMeta = BackgroundPart | TilesetPart | PropPart;

export type PropLayer = "back" | "front";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Tile cell codes in `SceneDoc.tiles` rows:
 *   `.` empty · `#` solid terrain (autotiled) · `=` one-way platform
 *   `/` slope rising to the right · `\` slope rising to the left
 */
export type TileCode = "." | "#" | "=" | "/" | "\\";
export const TILE_CODES: TileCode[] = [".", "#", "=", "/", "\\"];
export const TILE_CODE_LABELS: Record<TileCode, string> = {
  ".": "Empty",
  "#": "Ground (autotile)",
  "=": "One-way platform",
  "/": "Slope up →",
  "\\": "Slope up ←",
};

export interface SceneLayer {
  part: string;
  /** Horizontal parallax factor (0..1). */
  scroll: number;
  /** Vertical parallax factor (default 0 = locked to the viewport). */
  scrollY?: number;
  /** Remap the part's recolorBase hue to this hex (easysprite-style recolor). */
  color?: string;
  /** Multiply-tint every pixel toward this hex. */
  tint?: string;
  /** 0..1 strength for `tint` (default 0.35). */
  tintAmount?: number;
  /** Extra vertical offset in px (positive = down). */
  offsetY?: number;
}

export interface SceneProp {
  part: string;
  /** Left edge in px. */
  x: number;
  /** Baseline (bottom edge) in px. */
  y: number;
  flipX?: boolean;
  layer?: PropLayer;
  color?: string;
  tint?: string;
  tintAmount?: number;
}

export interface CollisionRect extends Rect {
  oneWay?: boolean;
}

export interface SceneDoc {
  format: "easyscene/1";
  id: string;
  name: string;
  tileSize: number;
  /** Map size in tiles. */
  width: number;
  height: number;
  /** Viewport (game resolution) in px for parallax preview / Godot camera. */
  viewport: { width: number; height: number };
  /** Back-to-front parallax layers (max 5). */
  layers: SceneLayer[];
  tileset: string;
  /** `height` strings of `width` tile codes. */
  tiles: string[];
  props: SceneProp[];
  /** Extra hand-drawn collision boxes (tiles already collide). */
  collision: CollisionRect[];
  /** Legacy single easysprite side-view sheet (still read; new scenes use `characters`). */
  character?: { sheet: string; x?: number };
  /** Easy Sprite characters placed in the scene (optional, additive to easyscene/1). */
  characters?: SceneCharacter[];
  createdAt?: string;
  updatedAt?: string;
}

export type CharacterFacing = "right" | "left" | "front";
export type CharacterAnim = "idle" | "walk";
/** Where a character is drawn: behind back props, between tiles and front props (default), or over front props. */
export type CharacterLayer = "back" | "main" | "front";
export const CHARACTER_FACINGS: readonly CharacterFacing[] = ["right", "left", "front"];
export const CHARACTER_ANIMS: readonly CharacterAnim[] = ["idle", "walk"];

/** One Easy Sprite sheet placed in the scene. Paths only; images are never embedded. */
export interface SceneCharacter {
  /** Path to an Easy Sprite native sheet (.png). A sibling `<stem>.json` export, if present, supplies frames/rows. */
  sheet: string;
  /** Label used for node / file names (default: sheet file stem). */
  name?: string;
  /** Left edge of the 48px frame in world px (default 96). */
  x?: number;
  /** Baseline (feet) in world px. Default: the ground surface under the character's centre. */
  y?: number;
  facing?: CharacterFacing;
  anim?: CharacterAnim;
  /** Still pose for PNG previews / idle: frame name (`walk1`, `wave0`) or column index. */
  frame?: string | number;
  /** Sole row inside the frame. Default: detected from the sheet (Easy Sprite side sheets: 47). */
  groundRow?: number;
  layer?: CharacterLayer;
  /** Walk back and forth between minX and maxX (Pixi + Godot exports). */
  patrol?: { minX: number; maxX: number; speed?: number };
}

export interface EasySceneConfig {
  name: string;
  artStyle: string;
  tileSize: number;
  viewport: { width: number; height: number };
  maxLayers: number;
  /** easysprite side-view character sheet layout, for previews. */
  character: {
    frameSize: number;
    columns: number;
    rows: string[];
    walkFrames: number[];
    /** Fallback sole row inside a 48px frame when it cannot be detected from the sheet (Easy Sprite side view: 47). */
    groundRow: number;
  };
}

export const DEFAULT_CONFIG: EasySceneConfig = {
  name: "Easy Scene Workspace",
  artStyle: "cozy-side-view-pixel",
  tileSize: 16,
  viewport: { width: 480, height: 270 },
  maxLayers: 5,
  character: {
    frameSize: 48,
    columns: 30,
    rows: ["right", "left", "front"],
    walkFrames: [1, 2, 3, 2],
    groundRow: 47,
  },
};

export type ExportPresetId = "png" | "godot" | "pixi";
export const EXPORT_PRESETS: Array<{ id: ExportPresetId; label: string; description: string }> = [
  { id: "png", label: "PNG layers", description: "One PNG per parallax layer + tilemap + props, and a combined preview PNG" },
  {
    id: "godot",
    label: "Godot 4",
    description: "Self-contained Godot 4.3+ folder: .tscn (Parallax2D + TileMapLayer + props + collision) and TileSet .tres",
  },
  { id: "pixi", label: "PixiJS JSON", description: "Layer PNGs + tileset + scene JSON with parallax factors, tile indices and collision" },
];

export interface SceneSummary {
  id: string;
  name: string;
  width: number;
  height: number;
  layers: number;
  props: number;
  /** Placed characters (legacy `character` included). */
  characters: number;
  updatedAt?: string;
}

export interface WorkspaceSummary {
  root: string;
  config: EasySceneConfig;
  parts: PartMeta[];
  scenes: SceneSummary[];
  scenesDir: string;
  exportsDir: string;
}
