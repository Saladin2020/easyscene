/**
 * Shared pixel-art helpers for the procedural sample art (noise, ramps, dithering,
 * selective outlines, foliage). Pure: no Node imports.
 */
import { createImage, hexToRgb, type RgbaImage } from "../shared/raster.js";

export type Rgb = [number, number, number];
export const W = 480;
export const H = 270;
/** Sky rows from here down are water (only visible through pits). */
export const WATER_Y = 228;

// ---------------- noise + colour helpers ----------------

/** Deterministic integer hash → [0,1). */
export function hash(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
export const smooth = (t: number) => t * t * (3 - 2 * t);
export const wrapX = (x: number, p = W) => ((x % p) + p) % p;

/**
 * Value noise that repeats every `period` px horizontally (period must be a multiple of `cell`),
 * so layers built from it loop seamlessly.
 */
export function vnoise(x: number, y: number, cell: number, seed: number, period = W): number {
  const n = Math.max(1, Math.round(period / cell));
  const gx = x / cell;
  const gy = y / cell;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const fx = smooth(gx - x0);
  const fy = smooth(gy - y0);
  const h = (i: number, j: number) => hash(wrapX(i, n), j, seed);
  const a = h(x0, y0) + (h(x0 + 1, y0) - h(x0, y0)) * fx;
  const b = h(x0, y0 + 1) + (h(x0 + 1, y0 + 1) - h(x0, y0 + 1)) * fx;
  return a + (b - a) * fy;
}

export const rgb = (hex: string): Rgb => hexToRgb(hex);
export const ramp = (...hexes: string[]): Rgb[] => hexes.map(rgb);
export const mix = (a: Rgb, b: Rgb, t: number): Rgb => [
  Math.round(a[0] + (b[0] - a[0]) * t),
  Math.round(a[1] + (b[1] - a[1]) * t),
  Math.round(a[2] + (b[2] - a[2]) * t),
];

/** Ordered 4×4 Bayer threshold for crisp gradient dithering. */
export const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export const bayer = (x: number, y: number) => (BAYER[(y & 3) * 4 + (x & 3)]! + 0.5) / 16;

/**
 * Pick a ramp colour for t∈[0,1]. Bands are flat; only the middle `soft` fraction of each
 * band-to-band step is Bayer-dithered (0 = hard bands, 1 = dither the whole step).
 */
export function pick(r: Rgb[], t: number, x: number, y: number, soft = 0.5): Rgb {
  const f = clamp01(t) * (r.length - 1);
  const i = Math.min(r.length - 2, Math.floor(f));
  const fr = f - i;
  const u = soft <= 0 ? (fr < 0.5 ? 0 : 1) : clamp01((fr - (0.5 - soft / 2)) / soft);
  return r[u > bayer(x, y) ? i + 1 : i]!;
}

export function setPx(img: RgbaImage, x: number, y: number, c: Rgb, a = 255): void {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return;
  const i = (y * img.width + x) * 4;
  img.data[i] = c[0];
  img.data[i + 1] = c[1];
  img.data[i + 2] = c[2];
  img.data[i + 3] = a;
  const m = NIGHT_MASKS.get(img);
  if (m) {
    // the last writer owns the pixel: drawing over a pane (frames, grille bars, signs) un-marks it
    const p = (y * img.width + x) * 3;
    if (marking && marking.img === img) {
      m[p] = marking.win;
      m[p + 1] = marking.light;
      m[p + 2] = marking.interior;
    } else {
      m[p] = 0;
      m[p + 1] = 0;
      m[p + 2] = 0;
    }
  }
}

// ---------------- night masks ----------------
// Sample parts record which pixels are window panes and which are lamps while they are drawn, so the
// night pass lights exactly those (no colour guessing: yellow trims, gold paint and signs stay paint).
// Written next to the part as night.png: R = window id (1..127 lit by a seeded coin, 128..255 always lit),
// G = 255 lamp / bulb (keeps its colour and glows), B = 255 lit interior (an open shop front or stall: keeps
// its day colours, warmed, and glows softly), A = 255 where marked.

const NIGHT_MASKS = new WeakMap<RgbaImage, Uint8Array>();
const NEXT_WINDOW = new WeakMap<RgbaImage, number>();
let marking: { img: RgbaImage; win: number; light: number; interior: number } | null = null;
export type NightMarkKind = "window" | "window-lit" | "light" | "interior";

function maskFor(img: RgbaImage): Uint8Array {
  let m = NIGHT_MASKS.get(img);
  if (!m) {
    m = new Uint8Array(img.width * img.height * 3);
    NIGHT_MASKS.set(img, m);
  }
  return m;
}

function nextWindow(img: RgbaImage, lit: boolean): number {
  const n = (NEXT_WINDOW.get(img) ?? 0) + 1;
  NEXT_WINDOW.set(img, n);
  return ((n - 1) % 127) + 1 + (lit ? 128 : 0);
}

function markValues(img: RgbaImage, kind: NightMarkKind): { win: number; light: number; interior: number } {
  if (kind === "light") return { win: 0, light: 255, interior: 0 };
  if (kind === "interior") return { win: 0, light: 0, interior: 255 };
  return { win: nextWindow(img, kind === "window-lit"), light: 0, interior: 0 };
}

/** Everything `draw` paints on `img` is marked as `kind` (later paint over it un-marks those pixels). */
export function markNight(img: RgbaImage, kind: NightMarkKind, draw: () => void): void {
  withMark(img, markValues(img, kind), draw);
}

/** Start marking everything painted on `img` as `kind` until `maskEnd(token)` (for long drawing code). */
export function maskStart(img: RgbaImage, kind: NightMarkKind): { prev: typeof marking } {
  maskFor(img);
  const prev = marking;
  marking = { img, ...markValues(img, kind) };
  return { prev };
}

export function maskEnd(token: { prev: typeof marking }): void {
  marking = token.prev;
}

function withMark(img: RgbaImage, v: { win: number; light: number; interior: number }, draw: () => void): void {
  maskFor(img);
  const prev = marking;
  marking = { img, ...v };
  try {
    draw();
  } finally {
    marking = prev;
  }
}

/**
 * Mark pixels already drawn in a rectangle as `kind`, skipping transparent ones, ones `only` rejects and ones
 * already marked.
 * One call = one window for the window kinds.
 */
export function markRect(img: RgbaImage, x0: number, y0: number, w: number, h: number, kind: NightMarkKind, only?: (c: Rgb, x: number, y: number) => boolean): void {
  const m = maskFor(img);
  const v = markValues(img, kind);
  for (let y = Math.max(0, y0); y < Math.min(img.height, y0 + h); y++) for (let x = Math.max(0, x0); x < Math.min(img.width, x0 + w); x++) {
    const i = (y * img.width + x) * 4;
    if (!img.data[i + 3]) continue;
    if (only && !only([img.data[i]!, img.data[i + 1]!, img.data[i + 2]!], x, y)) continue;
    const p = (y * img.width + x) * 3;
    if (m[p] || m[p + 1] || m[p + 2]) continue; // already marked where it was drawn (panes, lamps)
    m[p] = v.win;
    m[p + 1] = v.light;
    m[p + 2] = v.interior;
  }
}

/** The night mask recorded while drawing `img` (undefined when nothing was marked). Transparent pixels are never marked. */
export function nightMaskImage(img: RgbaImage): RgbaImage | undefined {
  const m = NIGHT_MASKS.get(img);
  if (!m) return undefined;
  const out: RgbaImage = { width: img.width, height: img.height, data: new Uint8Array(img.width * img.height * 4) };
  let any = false;
  for (let p = 0; p < img.width * img.height; p++) {
    if (!img.data[p * 4 + 3] || (!m[p * 3] && !m[p * 3 + 1] && !m[p * 3 + 2])) continue;
    out.data[p * 4] = m[p * 3]!;
    out.data[p * 4 + 1] = m[p * 3 + 1]!;
    out.data[p * 4 + 2] = m[p * 3 + 2]!;
    out.data[p * 4 + 3] = 255;
    any = true;
  }
  return any ? out : undefined;
}

/** setPx with horizontal wrap — keeps loop layers seamless. */
export function setWrap(img: RgbaImage, x: number, y: number, c: Rgb, a = 255): void {
  setPx(img, wrapX(x, img.width), y, c, a);
}

export function getPx(img: RgbaImage, x: number, y: number): Rgb {
  const i = (y * img.width + x) * 4;
  return [img.data[i]!, img.data[i + 1]!, img.data[i + 2]!];
}

export function alphaAt(img: RgbaImage, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return 0;
  return img.data[(y * img.width + x) * 4 + 3]!;
}

/** Alpha-over one pixel (used for glows and haze). */
export function blendPx(img: RgbaImage, x: number, y: number, c: Rgb, a: number): void {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height || a <= 0) return;
  const i = (y * img.width + x) * 4;
  const da = img.data[i + 3]! / 255;
  const sa = Math.min(1, a / 255);
  const oa = sa + da * (1 - sa);
  for (let k = 0; k < 3; k++) img.data[i + k] = Math.round((c[k]! * sa + img.data[i + k]! * da * (1 - sa)) / oa);
  img.data[i + 3] = Math.round(oa * 255);
}

export function rect(img: RgbaImage, x0: number, y0: number, w: number, h: number, c: Rgb): void {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) setPx(img, x, y, c);
}

/** Copy the opaque pixels of `src` over `dst`. */
export function stamp(dst: RgbaImage, src: RgbaImage): void {
  for (let p = 0; p < src.width * src.height; p++) if (src.data[p * 4 + 3]) dst.data.set(src.data.subarray(p * 4, p * 4 + 4), p * 4);
}

/**
 * Selective outline ("sel-out"): every transparent pixel touching the sprite becomes a darkened,
 * cooler copy of the neighbour it touches, instead of flat black.
 */
export function selOutline(img: RgbaImage, amount = 0.42, skipBottom = true): void {
  const marks: Array<[number, number, Rgb]> = [];
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (alphaAt(img, x, y) !== 0) continue;
      const n: Array<[number, number]> = [[x, y + 1], [x + 1, y], [x - 1, y], [x, y - 1]];
      const hit = n.find(([nx, ny]) => alphaAt(img, nx, ny) === 255);
      if (!hit) continue;
      const c = getPx(img, hit[0], hit[1]);
      marks.push([x, y, [Math.round(c[0] * amount * 0.85), Math.round(c[1] * amount * 0.9), Math.round(c[2] * amount + 10)]]);
    }
  }
  for (const [x, y, c] of marks) if (!(skipBottom && y === img.height - 1)) setPx(img, x, y, c);
}

/** Lambert-ish term for a sphere normal under the shared top-left light. */
export function sphereLight(dx: number, dy: number, r: number): number {
  const nx = dx / r;
  const ny = dy / r;
  const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
  return clamp01(0.5 + (-0.55 * nx - 0.65 * ny + 0.52 * nz) * 0.62);
}

/** Shaded foliage clump: puffs of leaves lit top-left, with clumped leaf texture and a ragged rim. */
export function foliage(
  img: RgbaImage, puffs: ReadonlyArray<readonly [number, number, number]>, pal: Rgb[], seed: number,
  opts: { wrap?: boolean; flatBottom?: number; light?: [number, number, number] } = {},
): void {
  const put = opts.wrap ? setWrap : setPx;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [cx, cy, r] of puffs) {
    x0 = Math.min(x0, cx - r);
    x1 = Math.max(x1, cx + r);
    y0 = Math.min(y0, cy - r);
    y1 = Math.max(y1, cy + r);
  }
  const [gx, gy, gr] = opts.light ?? [(x0 + x1) / 2, (y0 + y1) / 2, Math.max(x1 - x0, y1 - y0) / 2];
  for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) {
    if (opts.flatBottom !== undefined && y > opts.flatBottom) continue;
    for (let x = Math.floor(x0); x <= Math.ceil(x1); x++) {
      let owner = -1;
      for (let i = 0; i < puffs.length; i++) {
        const [cx, cy, r] = puffs[i]!;
        const d = Math.hypot(x - cx, y - cy);
        const rag = (hash(x, y, seed) - 0.5) * 1.6;
        if (d <= r + (d > r - 1.5 ? rag : 0)) owner = i;
      }
      if (owner < 0) continue;
      const [cx, cy, r] = puffs[owner]!;
      let t = sphereLight(x - cx, y - cy, r) * 0.6 + sphereLight(x - gx, y - gy, gr) * 0.5 - 0.05;
      // leaf clumps: small bright tufts on the lit side, dark pockets between them
      const clump = vnoise(x, y, 3, seed + 2);
      t += clump > 0.62 ? 0.14 : clump < 0.3 ? -0.14 : 0;
      // contact shadow cast by a puff drawn in front of this one
      for (let j = owner + 1; j < puffs.length; j++) {
        const [jx, jy, jr] = puffs[j]!;
        if (Math.hypot(x - (jx + 1.5), y - (jy + 2.5)) < jr) t -= 0.28;
      }
      if (opts.flatBottom !== undefined) t -= clamp01((y - (opts.flatBottom - 3)) / 3) * 0.25;
      put(img, x, y, pick(pal, t, wrapX(x), y, 0.3));
    }
  }
}

export const LEAF = ramp("#204a34", "#2b6038", "#3a7a40", "#4f9a4a", "#6cb455", "#93cc66");
