/**
 * Minimal RGBA raster ops (nearest-neighbour only, no smoothing anywhere).
 * Works on plain typed arrays so Node (pngjs) and the browser (ImageData) share it.
 */

export interface RgbaImage {
  width: number;
  height: number;
  data: Uint8Array | Uint8ClampedArray;
}

export function createImage(width: number, height: number): RgbaImage {
  return { width, height, data: new Uint8Array(width * height * 4) };
}

export function cloneImage(img: RgbaImage): RgbaImage {
  return { width: img.width, height: img.height, data: new Uint8Array(img.data) };
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "").trim();
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = Number.parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function isHex(value: unknown): value is string {
  return typeof value === "string" && /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim());
}

/** Alpha-over one pixel. */
function over(dst: RgbaImage["data"], i: number, r: number, g: number, b: number, a: number): void {
  if (a === 0) return;
  if (a === 255) {
    dst[i] = r;
    dst[i + 1] = g;
    dst[i + 2] = b;
    dst[i + 3] = 255;
    return;
  }
  const da = dst[i + 3]! / 255;
  const sa = a / 255;
  const oa = sa + da * (1 - sa);
  if (oa <= 0) return;
  dst[i] = Math.round((r * sa + dst[i]! * da * (1 - sa)) / oa);
  dst[i + 1] = Math.round((g * sa + dst[i + 1]! * da * (1 - sa)) / oa);
  dst[i + 2] = Math.round((b * sa + dst[i + 2]! * da * (1 - sa)) / oa);
  dst[i + 3] = Math.round(oa * 255);
}

export interface BlitOptions {
  flipX?: boolean;
  /** Source rect (default: whole image). */
  sx?: number;
  sy?: number;
  sw?: number;
  sh?: number;
}

/** Draw `src` onto `dst` at integer (dx, dy) with alpha-over. */
export function blit(dst: RgbaImage, src: RgbaImage, dx: number, dy: number, opts: BlitOptions = {}): void {
  const sx0 = opts.sx ?? 0;
  const sy0 = opts.sy ?? 0;
  const sw = opts.sw ?? src.width - sx0;
  const sh = opts.sh ?? src.height - sy0;
  dx = Math.round(dx);
  dy = Math.round(dy);
  for (let y = 0; y < sh; y++) {
    const ty = dy + y;
    if (ty < 0 || ty >= dst.height) continue;
    for (let x = 0; x < sw; x++) {
      const tx = dx + x;
      if (tx < 0 || tx >= dst.width) continue;
      const srcX = opts.flipX ? sx0 + sw - 1 - x : sx0 + x;
      const si = ((sy0 + y) * src.width + srcX) * 4;
      over(dst.data, (ty * dst.width + tx) * 4, src.data[si]!, src.data[si + 1]!, src.data[si + 2]!, src.data[si + 3]!);
    }
  }
}

/**
 * Draw `src` repeated horizontally every `period` px so it covers [0, dst.width),
 * starting at offset `dx` (any real number; snapped to whole px).
 */
export function blitWrapX(dst: RgbaImage, src: RgbaImage, dx: number, dy: number, period = src.width): void {
  const p = Math.max(1, Math.round(period));
  const start = ((Math.round(dx) % p) + p) % p;
  for (let x = start - p; x < dst.width; x += p) blit(dst, src, x, dy, { sw: Math.min(src.width, p) });
}

/** Fill rows above `y` with each column's pixel at row `y` (extends skies on tall maps). */
export function extendUp(dst: RgbaImage, src: RgbaImage, dx: number, dy: number, period = src.width): void {
  if (dy <= 0) return;
  const p = Math.max(1, Math.round(period));
  for (let tx = 0; tx < dst.width; tx++) {
    const sx = (((tx - Math.round(dx)) % p) + p) % p;
    const si = sx * 4;
    for (let ty = 0; ty < Math.min(dy, dst.height); ty++) {
      over(dst.data, (ty * dst.width + tx) * 4, src.data[si]!, src.data[si + 1]!, src.data[si + 2]!, src.data[si + 3]!);
    }
  }
}

export function fillRect(img: RgbaImage, x0: number, y0: number, w: number, h: number, rgba: readonly number[]): void {
  for (let y = Math.max(0, y0); y < Math.min(img.height, y0 + h); y++) {
    for (let x = Math.max(0, x0); x < Math.min(img.width, x0 + w); x++) {
      const i = (y * img.width + x) * 4;
      img.data[i] = rgba[0]!;
      img.data[i + 1] = rgba[1]!;
      img.data[i + 2] = rgba[2]!;
      img.data[i + 3] = rgba[3] ?? 255;
    }
  }
}

/** Multiply-tint toward `hex` with strength `amount` (0..1). Mutates in place. */
export function tintRgba(px: RgbaImage["data"], hex: string, amount = 0.35): void {
  const [tr, tg, tb] = hexToRgb(hex);
  const a = Math.min(1, Math.max(0, amount));
  if (a === 0) return;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] === 0) continue;
    px[i] = Math.round(px[i]! * (1 - a) + ((px[i]! * tr) / 255) * a);
    px[i + 1] = Math.round(px[i + 1]! * (1 - a) + ((px[i + 1]! * tg) / 255) * a);
    px[i + 2] = Math.round(px[i + 2]! * (1 - a) + ((px[i + 2]! * tb) / 255) * a);
  }
}

// ---- hue-aware recolor (same algorithm as Easy Sprite's recolorRgba) ----

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  switch (max) {
    case r:
      h = (g - b) / d + (g < b ? 6 : 0);
      break;
    case g:
      h = (b - r) / d + 2;
      break;
    default:
      h = (r - g) / d + 4;
  }
  return [h / 6, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const hue2rgb = (p: number, q: number, t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  ];
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Remap every shade of `baseHex` to `targetHex` in an RGBA buffer. Mutates `px` in place.
 * Pixels of other hues are left alone, so outlines and accents survive.
 */
export function recolorRgba(px: RgbaImage["data"], baseHex: string, targetHex: string, tolerance = 70): void {
  const base = hexToRgb(baseHex);
  const target = hexToRgb(targetHex);
  if (base[0] === target[0] && base[1] === target[1] && base[2] === target[2]) return;

  const [bH, bS, bL] = rgbToHsl(base[0], base[1], base[2]);
  const [tH, tS, tL] = rgbToHsl(target[0], target[1], target[2]);
  const greyBase = bS < 0.15;
  const hueTol = clamp(tolerance / 1000, 0.02, 0.15);
  const lMin = bL * 0.5;
  const lMax = Math.min(1, bL * 1.6 + 0.12);

  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3]! < 8) continue;
    const [h, s, l] = rgbToHsl(px[i]!, px[i + 1]!, px[i + 2]!);
    if (l < lMin || l > lMax) continue;
    if (greyBase) {
      if (s > 0.22) continue;
    } else {
      if (s < bS * 0.35) continue;
      const dh = Math.abs(h - bH);
      if (Math.min(dh, 1 - dh) > hueTol) continue;
    }
    const outL = l <= bL ? (bL > 0.001 ? l / bL : 1) * tL : tL + (l - bL) * ((1 - tL) / Math.max(0.001, 1 - bL));
    const outS = greyBase ? tS : clamp(tS * (bS > 0.001 ? s / bS : 1), 0, 1);
    const [nr, ng, nb] = hslToRgb(tH, outS, clamp(outL, 0.02, 0.98));
    px[i] = nr;
    px[i + 1] = ng;
    px[i + 2] = nb;
  }
}

/** Apply a layer/prop's `color` (recolor) then `tint` to a copy of `img`. */
export function applyColor(
  img: RgbaImage,
  opts: { recolorBase?: string; color?: string; tint?: string; tintAmount?: number },
): RgbaImage {
  if (!(opts.color && opts.recolorBase) && !opts.tint) return img;
  const out = cloneImage(img);
  if (opts.color && opts.recolorBase) recolorRgba(out.data, opts.recolorBase, opts.color);
  if (opts.tint) tintRgba(out.data, opts.tint, opts.tintAmount ?? 0.35);
  return out;
}
