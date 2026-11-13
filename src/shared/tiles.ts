/**
 * Tile grid rules: autotile resolution, collision shapes and the terrain builder.
 * Pure functions shared by the renderer, the exporters and the web editor.
 */
import type { Rect, TileCode } from "./types.js";

/**
 * Sample tileset atlas layout (4 columns × 6 rows of 16px tiles = 64×96 px):
 *
 * - rows 0–3: solid terrain, 16 variants. Index = 4-neighbour bitmask
 *   N=1 · E=2 · S=4 · W=8 (bit set = that neighbour is also solid).
 *   A tile without its N bit gets the grass top; without E/W/S it gets that edge.
 * - row 4: one-way platform — single · left end · middle · right end
 * - row 5: slope `/` (rises to the right) · slope `\` (rises to the left) · 2 spare
 */
export const ATLAS_COLUMNS = 4;
export const ATLAS_ROWS = 6;

export const MASK_N = 1;
export const MASK_E = 2;
export const MASK_S = 4;
export const MASK_W = 8;

export interface AtlasCoord {
  col: number;
  row: number;
}

const SOLIDISH = new Set(["#", "/", "\\"]);

function cell(tiles: readonly string[], x: number, y: number): string {
  if (y < 0 || y >= tiles.length) return ".";
  const row = tiles[y]!;
  if (x < 0 || x >= row.length) return ".";
  return row[x]!;
}

/** True when the cell at (x,y) connects to solid terrain. Off-map left/right/bottom counts as solid so edges stay seamless. */
function solidAt(tiles: readonly string[], x: number, y: number, width: number): boolean {
  if (y >= tiles.length) return true;
  if (y < 0) return false;
  if (x < 0 || x >= width) return SOLIDISH.has(cell(tiles, Math.min(Math.max(x, 0), width - 1), y));
  return SOLIDISH.has(cell(tiles, x, y));
}

/** 4-neighbour mask for a solid `#` cell. Slopes count as solid neighbours. */
export function terrainMask(tiles: readonly string[], x: number, y: number): number {
  const width = tiles[0]?.length ?? 0;
  let m = 0;
  if (solidAt(tiles, x, y - 1, width)) m |= MASK_N;
  if (solidAt(tiles, x + 1, y, width)) m |= MASK_E;
  if (solidAt(tiles, x, y + 1, width)) m |= MASK_S;
  if (solidAt(tiles, x - 1, y, width)) m |= MASK_W;
  return m;
}

/** Atlas coordinate for the cell at (x,y), or null when empty. */
export function resolveTile(tiles: readonly string[], x: number, y: number): AtlasCoord | null {
  const c = cell(tiles, x, y);
  switch (c) {
    case "#": {
      const m = terrainMask(tiles, x, y);
      return { col: m % ATLAS_COLUMNS, row: Math.floor(m / ATLAS_COLUMNS) };
    }
    case "=": {
      const left = cell(tiles, x - 1, y) === "=";
      const right = cell(tiles, x + 1, y) === "=";
      const col = !left && !right ? 0 : !left ? 1 : !right ? 3 : 2;
      return { col, row: 4 };
    }
    case "/":
      return { col: 0, row: 5 };
    case "\\":
      return { col: 1, row: 5 };
    default:
      return null;
  }
}

export function atlasIndex(coord: AtlasCoord): number {
  return coord.row * ATLAS_COLUMNS + coord.col;
}

export interface TileShape {
  /** Polygon in px relative to the tile's top-left corner. */
  points: Array<[number, number]>;
  oneWay: boolean;
}

/** Collision polygon for a tile code (null = no collision). */
export function tileShape(code: string, tileSize: number): TileShape | null {
  const s = tileSize;
  switch (code as TileCode) {
    case "#":
      return { points: [[0, 0], [s, 0], [s, s], [0, s]], oneWay: false };
    case "=":
      // Thin top lip; one-way so characters can jump up through it.
      return { points: [[0, 0], [s, 0], [s, s / 4], [0, s / 4]], oneWay: true };
    case "/":
      return { points: [[0, s], [s, 0], [s, s]], oneWay: false };
    case "\\":
      return { points: [[0, 0], [s, s], [0, s]], oneWay: false };
    default:
      return null;
  }
}

/** Merge horizontal runs of `#` (solid) or `=` (one-way) cells into px rects. */
export function mergeRuns(tiles: readonly string[], tileSize: number, code: "#" | "="): Rect[] {
  const out: Rect[] = [];
  tiles.forEach((row, y) => {
    let start = -1;
    for (let x = 0; x <= row.length; x++) {
      const hit = x < row.length && row[x] === code;
      if (hit && start < 0) start = x;
      if (!hit && start >= 0) {
        out.push({
          x: start * tileSize,
          y: y * tileSize,
          w: (x - start) * tileSize,
          h: code === "=" ? tileSize / 4 : tileSize,
        });
        start = -1;
      }
    }
  });
  return out;
}

/** Pad/crop to width × height and replace unknown characters with `.`. */
export function normalizeTiles(tiles: readonly string[] | undefined, width: number, height: number): string[] {
  const out: string[] = [];
  for (let y = 0; y < height; y++) {
    const src = tiles?.[y] ?? "";
    let row = "";
    for (let x = 0; x < width; x++) {
      const c = src[x] ?? ".";
      row += c === "#" || c === "=" || c === "/" || c === "\\" ? c : ".";
    }
    out.push(row);
  }
  return out;
}

export function setTile(tiles: readonly string[], x: number, y: number, code: TileCode): string[] {
  return tiles.map((row, ry) => (ry === y && x >= 0 && x < row.length ? row.slice(0, x) + code + row.slice(x + 1) : row));
}

/**
 * Baseline (px) of the first surface from the top in column `col`; map bottom when none.
 * One-way platforms count only with `{ platforms: true }` (props and preview walkers stay on the ground).
 */
export function surfaceY(tiles: readonly string[], col: number, tileSize: number, opts: { platforms?: boolean } = {}): number {
  for (let y = 0; y < tiles.length; y++) {
    const c = cell(tiles, col, y);
    if (c === "#" || (c === "=" && opts.platforms)) return y * tileSize;
    if (c === "/" || c === "\\") return y * tileSize + tileSize / 2;
  }
  return tiles.length * tileSize;
}

export interface TerrainSpec {
  width: number;
  height: number;
  /** Solid rows at the bottom (default 3). */
  groundHeight?: number;
  /** Raised plateaus with 45° slopes on both sides. */
  hills?: Array<{ x: number; width: number; height: number }>;
  /** Gaps in the ground (x, width in tiles). */
  pits?: Array<{ x: number; width: number }>;
  /** One-way platforms; y counts tiles up from the ground surface. */
  platforms?: Array<{ x: number; y: number; length: number }>;
}

/** Build a tile grid from a few high-level terrain features (handy for CLI / MCP agents). */
export function buildTiles(spec: TerrainSpec): string[] {
  const { width, height } = spec;
  const groundHeight = Math.max(0, Math.min(height, spec.groundHeight ?? 3));
  const grid: string[][] = Array.from({ length: height }, () => Array.from({ length: width }, () => "."));
  const put = (x: number, y: number, c: string) => {
    if (x >= 0 && x < width && y >= 0 && y < height) grid[y]![x] = c;
  };
  const fillFrom = (x: number, top: number) => {
    for (let y = Math.max(0, top); y < height; y++) put(x, y, "#");
  };
  const g = height - groundHeight; // first solid row
  for (let x = 0; x < width; x++) fillFrom(x, g);

  for (const hill of spec.hills ?? []) {
    const h = Math.max(1, Math.floor(hill.height));
    const w = Math.max(1, Math.floor(hill.width));
    for (let i = 0; i < h; i++) {
      const lx = hill.x + i;
      fillFrom(lx, g - i);
      put(lx, g - i - 1, "/");
    }
    for (let i = 0; i < w; i++) fillFrom(hill.x + h + i, g - h);
    for (let i = 0; i < h; i++) {
      const rx = hill.x + h + w + i;
      const top = g - (h - 1 - i);
      fillFrom(rx, top);
      put(rx, top - 1, "\\");
    }
  }

  for (const pit of spec.pits ?? []) {
    for (let x = pit.x; x < pit.x + pit.width; x++) {
      for (let y = 0; y < height; y++) if (grid[y]?.[x] && grid[y]![x] !== "=") put(x, y, ".");
    }
  }

  for (const p of spec.platforms ?? []) {
    const y = g - Math.max(1, Math.floor(p.y));
    for (let x = p.x; x < p.x + p.length; x++) put(x, y, "=");
  }

  return grid.map((r) => r.join(""));
}

/** Baseline (px) of the first surface (ground, platform or slope) at or below pixel `fromY` in column `col`. */
export function surfaceBelow(tiles: readonly string[], col: number, tileSize: number, fromY: number): number {
  for (let y = Math.max(0, Math.floor(fromY / tileSize)); y < tiles.length; y++) {
    const c = cell(tiles, col, y);
    if (c === "#" || c === "=") return y * tileSize;
    if (c === "/" || c === "\\") return y * tileSize + tileSize / 2;
  }
  return tiles.length * tileSize;
}
