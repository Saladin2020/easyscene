/**
 * Thai town sample set: modular shop buildings, street dressing, a temple-hill far layer and a
 * tropical mid layer. Procedural and original like the rest of the samples (CC0).
 *
 * Modular rules for every `category: "building"` part:
 * - width is a multiple of the 16 px tile grid and the art reaches both edges of that footprint
 *   (never past them), so buildings chain with `x += width` without gaps or overlap
 * - the bottom row is the ground contact (baseline) and every facade shares the same depth (back layer)
 * - scale is set for 48 px Easy Sprite characters: doors 56–64 px, a storey ~52 px
 *
 * Same art rules as sampleParts.ts: one top-left light, hue-shifted ramps, sel-out outlines.
 */
import { createImage, hslToRgb, rgbToHsl, type RgbaImage } from "../shared/raster.js";
import {
  H, LEAF, type Rgb, W, alphaAt, bayer, blendPx, clamp01, foliage, getPx, hash, mix, pick, ramp, rect, rgb, rng, selOutline,
  setPx, setWrap, sphereLight, vnoise, wrapX,
} from "./pixelArt.js";
import { THAI_SIGNS, type ThaiSignKey } from "./thaiSignText.js";

export const TOWN_GRID = 16;

// ---------------- colour ----------------

/** Shortest move of hue `h` toward `target` (both 0..1) by at most `amt`. */
function hueToward(h: number, target: number, amt: number): number {
  let d = target - h;
  if (d > 0.5) d -= 1;
  if (d < -0.5) d += 1;
  const step = Math.sign(d) * Math.min(Math.abs(d), amt);
  return (h + step + 1) % 1;
}

/**
 * Hue-shifted ramp around `hex` (index n/2 ≈ the input): shadows drift toward blue and gain
 * saturation, highlights drift toward warm yellow. Hue stays within ~±15° so recolor moves it as one.
 */
export function shadeRamp(hex: string, n = 6, lo = -0.3, hi = 0.24): Rgb[] {
  const [r, g, b] = rgb(hex);
  const [h, s, l] = rgbToHsl(r, g, b);
  const out: Rgb[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const dl = lo + (hi - lo) * t;
    const hh = t < 0.5 ? hueToward(h, 0.63, (0.5 - t) * 0.07) : hueToward(h, 0.14, (t - 0.5) * 0.06);
    const ss = clamp01(s * (1 + (0.5 - t) * 0.35));
    out.push(hslToRgb(hh, ss, Math.min(0.97, Math.max(0.04, l + dl))));
  }
  return out;
}

const TEAK = ramp("#2e1a12", "#4a2a18", "#6a3e22", "#8c5630", "#ad7140", "#cc9258");
const STEEL = ramp("#252a36", "#3e4554", "#5e6878", "#87919f", "#b4bcc6", "#e4e9ee");
const CONCRETE = ramp("#4c4650", "#6c6468", "#90877f", "#b4aa9a", "#d4cab4", "#eee6d0");
const TIN = ramp("#2e3848", "#465468", "#64748a", "#8696aa", "#acbacb", "#d6e0e8");
const RUST = ramp("#5a2a1a", "#844024", "#a85a30");
const RED = ramp("#4a1018", "#741a22", "#a4262c", "#cc3a34", "#e8604a", "#f88c6a");
const CLOTH = ramp("#9a8e98", "#c4bab8", "#e6ded6", "#fbf6ec");
const YELLOW = ramp("#8a4a14", "#b8701a", "#e0a224", "#f6c840", "#fde488", "#fff6c8");
const GREEN = ramp("#0e3a2a", "#145238", "#1e6e46", "#2e8c52", "#56ac62", "#8cca7c");
const ORANGE = ramp("#7a2a10", "#b44a14", "#e06e1c", "#f6923a", "#ffb866");
const BLUE = ramp("#141e48", "#1e2e6a", "#2c4590", "#4064b4", "#6a8ed0", "#a2c0e6");
const GLASS = ramp("#162438", "#22384e", "#345470", "#4f7896", "#7aa4be", "#b2d4e2");
const GLINT = rgb("#eef9ff");
const SHADOW = rgb("#1a1630");
const WARM = ramp("#9a5a20", "#d4902e", "#f6c45a", "#ffe69a", "#fff8dc");
const TERRA = ramp("#4a1c14", "#6e2c1a", "#943e20", "#b8562a", "#d4743a", "#e89656");
const SKIN_DOG = ramp("#4a2a18", "#7a4a26", "#a86c38", "#cc9050", "#e6b878", "#f6dcaa");
const PINK = ramp("#5a1440", "#8a1e5a", "#c02c7a", "#e4529a", "#f886b8");
const BLUE_POT = ramp("#1c2a4a", "#2a3e6a", "#3c5a90", "#5a7cb4", "#86a6d4", "#b8cfee");

const CLEAR: Rgb = [0, 0, 0];

// ---------------- primitives ----------------

const hline = (img: RgbaImage, x0: number, x1: number, y: number, c: Rgb) => { for (let x = x0; x <= x1; x++) setPx(img, x, y, c); };
const vline = (img: RgbaImage, x: number, y0: number, y1: number, c: Rgb) => { for (let y = y0; y <= y1; y++) setPx(img, x, y, c); };

/** Block with a lit top-left rim and a shaded bottom-right rim. `r` dark → light. */
function bevel(img: RgbaImage, x: number, y: number, w: number, h: number, r: Rgb[], body = Math.floor(r.length / 2)): void {
  rect(img, x, y, w, h, r[body]!);
  hline(img, x, x + w - 1, y, r[Math.min(r.length - 1, body + 2)]!);
  vline(img, x, y, y + h - 1, r[Math.min(r.length - 1, body + 1)]!);
  hline(img, x, x + w - 1, y + h - 1, r[Math.max(0, body - 2)]!);
  vline(img, x + w - 1, y + 1, y + h - 1, r[Math.max(0, body - 1)]!);
}

/** Cast shadow: pull existing opaque pixels toward a cool dark. */
function shadeArea(img: RgbaImage, x0: number, y0: number, w: number, h: number, amount: number, dither = false): void {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      if (!alphaAt(img, x, y)) continue;
      if (dither && bayer(x, y) > 0.5) continue;
      setPx(img, x, y, mix(getPx(img, x, y), SHADOW, amount));
    }
  }
}

function lightArea(img: RgbaImage, x0: number, y0: number, w: number, h: number, c: Rgb, amount: number): void {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (alphaAt(img, x, y)) setPx(img, x, y, mix(getPx(img, x, y), c, amount));
}

/** Stamp a pre-rasterized Thai sign word; optional 1 px drop shadow down-right. */
function signText(img: RgbaImage, key: ThaiSignKey, x: number, y: number, c: Rgb, shadow?: Rgb): void {
  const s = THAI_SIGNS[key];
  const passes: Array<[number, number, Rgb]> = shadow ? [[1, 1, shadow], [0, 0, c]] : [[0, 0, c]];
  for (const [dx, dy, col] of passes) {
    for (let yy = 0; yy < s.height; yy++) for (let xx = 0; xx < s.width; xx++) if (s.rows[yy]![xx] === "#") setPx(img, x + xx + dx, y + yy + dy, col);
  }
}
const signW = (key: ThaiSignKey) => THAI_SIGNS[key].width;
const signH = (key: ThaiSignKey) => THAI_SIGNS[key].height;

/** Sphere-lit disc (fruit, pots, lamps). */
function ball(img: RgbaImage, cx: number, cy: number, r: number, pal: Rgb[], bias = 0): void {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy > r * r + 0.3) continue;
      setPx(img, x, y, pick(pal, sphereLight(dx, dy, r + 0.5) * 1.25 - 0.18 + bias, x, y, 0.3));
    }
  }
}

/** Ellipse ring outline (cables, tyres). */
function ring(img: RgbaImage, cx: number, cy: number, rx: number, ry: number, c: Rgb): void {
  const n = Math.ceil(2 * Math.PI * Math.max(rx, ry) * 1.5);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    setPx(img, Math.round(cx + Math.cos(a) * rx), Math.round(cy + Math.sin(a) * ry), c);
  }
}

/** 1 px line. */
function line(img: RgbaImage, x0: number, y0: number, x1: number, y1: number, c: Rgb): void {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= n; i++) setPx(img, Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), c);
}

/** Painted render wall: flat body, sparse soft patches, rain stains dripping from `stainRows`. */
function wall(img: RgbaImage, x0: number, y0: number, w: number, h: number, r: Rgb[], seed: number, stainRows: number[] = []): void {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const n = vnoise(x, y, 7, seed) * 0.7 + hash(x, y, seed) * 0.3;
      let c = r[3]!;
      if (n > 0.8 && bayer(x, y) < 0.5) c = r[4]!;
      else if (n < 0.2 && bayer(x, y) < 0.5) c = r[2]!;
      setPx(img, x, y, c);
    }
  }
  for (const sy of stainRows) {
    for (let x = x0 + 1; x < x0 + w - 1; x++) {
      if (hash(x, sy, seed + 5) < 0.62) continue;
      const len = 3 + Math.floor(hash(x, sy, seed + 6) * 12);
      for (let k = 0; k < len && sy + k < y0 + h; k++) {
        if (k > len * 0.6 && bayer(x, sy + k) < 0.5) continue;
        setPx(img, x, sy + k, mix(r[2]!, r[3]!, k / len));
      }
    }
  }
}

/** Horizontal ledge/cornice: lit top lip, face, cast shadow on the wall below. */
function ledge(img: RgbaImage, x0: number, x1: number, y: number, r: Rgb[] = CONCRETE, shadowRows = 2): void {
  hline(img, x0, x1, y, r[5]!);
  hline(img, x0, x1, y + 1, r[4]!);
  hline(img, x0, x1, y + 2, r[2]!);
  shadeArea(img, x0, y + 3, x1 - x0 + 1, shadowRows, 0.28);
  shadeArea(img, x0, y + 3 + shadowRows, x1 - x0 + 1, 1, 0.22, true);
}

/** Concrete step along the bottom (ground contact = last row). */
function plinth(img: RgbaImage, x0: number, x1: number, h = 3): void {
  const y0 = img.height - h;
  for (let y = y0; y < img.height; y++) {
    const c = y === y0 ? CONCRETE[5]! : y === img.height - 1 ? CONCRETE[1]! : CONCRETE[3]!;
    hline(img, x0, x1, y, c);
  }
  for (let x = x0; x <= x1; x++) if (hash(x, 1, 91) > 0.9) setPx(img, x, y0 + 1, CONCRETE[2]!);
}

/** Corrugated tin band: vertical ribs lit on the left, a few rust blooms, dark drip edge. */
function tinRoof(img: RgbaImage, x0: number, y0: number, w: number, h: number, seed: number, pal: Rgb[] = TIN): void {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const k = (x - x0) % 4;
      let t = k === 0 ? 0.92 : k === 1 ? 0.66 : k === 2 ? 0.46 : 0.22;
      t -= ((y - y0) / h) * 0.18;
      let c = pick(pal, t, x, y, 0.2);
      const rust = vnoise(x, y, 5, seed);
      if (rust > 0.7 && k !== 0) c = RUST[rust > 0.8 ? 0 : k === 3 ? 1 : 2]!;
      setPx(img, x, y, c);
    }
  }
  hline(img, x0, x0 + w - 1, y0, pal[5]!);
  for (let x = x0; x < x0 + w; x++) setPx(img, x, y0 + h - 1, (x - x0) % 4 === 0 ? pal[2]! : pal[0]!);
}

/**
 * Striped awning: fabric pulled over a top bar, stripes `stripe` px, scalloped hem
 * (one scallop per stripe) and a cast shadow under it.
 */
function awning(img: RgbaImage, x0: number, y0: number, w: number, h: number, a: Rgb[], b: Rgb[], stripe = 8, shadow = 6): void {
  for (let x = x0; x < x0 + w; x++) {
    const sx = (x - x0) % stripe;
    const s = Math.floor((x - x0) / stripe) % 2 === 0 ? a : b;
    const hemDip = Math.round(2.4 * Math.sin((Math.PI * (sx + 0.5)) / stripe));
    const bottom = y0 + h - 3 + hemDip;
    for (let y = y0; y <= bottom; y++) {
      const v = (y - y0) / h;
      let t = v < 0.14 ? 0.95 : v < 0.3 ? 0.72 : 0.6 - v * 0.25;
      if (sx === 0) t -= 0.12;
      if (y === bottom) t = 0.12;
      else if (y === bottom - 1) t -= 0.18;
      setPx(img, x, y, pick(s, t, x, y, 0.3));
    }
    shadeArea(img, x, bottom + 1, 1, shadow, 0.34);
    shadeArea(img, x, bottom + 1 + shadow, 1, 2, 0.3, true);
  }
  hline(img, x0, x0 + w - 1, y0, STEEL[4]!);
}

/** Glass pane with interior, cool tint and diagonal sky reflections. */
function glassPane(img: RgbaImage, x0: number, y0: number, w: number, h: number, interior?: (x: number, y: number) => Rgb | undefined, tint = 0.35): void {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const inside = interior?.(x - x0, y - y0);
      let c = inside ? mix(inside, GLASS[3]!, tint) : pick(GLASS, 0.85 - ((y - y0) / h) * 0.7, x, y, 0.5);
      const d = (x - x0 + (y - y0) * 0.7) % 38;
      if (d > 5 && d < 9) c = mix(c, GLINT, 0.42);
      else if (d > 11 && d < 12.5) c = mix(c, GLINT, 0.3);
      setPx(img, x, y, c);
    }
  }
  hline(img, x0, x0 + w - 1, y0, mix(GLASS[0]!, SHADOW, 0.4));
}

/** Small plant in a pot: kind picks the silhouette. Base at (cx, baseY). */
function pottedPlant(img: RgbaImage, cx: number, baseY: number, kind: "leafy" | "flower" | "snake" | "palm", pot: Rgb[] = TERRA, seed = 1): void {
  const pw = kind === "snake" ? 7 : 6;
  for (let y = baseY - 5; y <= baseY; y++) {
    const inset = y >= baseY - 1 ? 1 : 0;
    for (let x = cx - Math.floor(pw / 2) + inset; x < cx + Math.ceil(pw / 2) - inset; x++) {
      const u = (x - (cx - pw / 2)) / pw;
      setPx(img, x, y, y === baseY - 5 ? pot[5]! : pick(pot, 0.85 - u * 0.7, x, y, 0.4));
    }
  }
  hline(img, cx - Math.floor(pw / 2) - 1, cx + Math.ceil(pw / 2), baseY - 5, pot[4]!);
  const top = baseY - 6;
  if (kind === "leafy" || kind === "flower") {
    foliage(img, [[cx - 3, top - 2, 3.2], [cx + 3, top - 2, 3.2], [cx, top - 5, 4]], LEAF, 400 + seed, { light: [cx - 1, top - 4, 5] });
    if (kind === "flower") {
      const r = rng(seed + 9);
      for (let i = 0; i < 6; i++) {
        const fx = Math.round(cx - 4 + r() * 8);
        const fy = Math.round(top - 7 + r() * 6);
        setPx(img, fx, fy, PINK[4]!);
        setPx(img, fx + 1, fy, PINK[3]!);
        setPx(img, fx, fy + 1, PINK[2]!);
      }
    }
  } else if (kind === "snake") {
    for (const [dx, hgt] of [[-2, 9], [0, 13], [2, 10], [-1, 7], [1, 11]] as const) {
      for (let k = 0; k < hgt; k++) {
        const x = cx + dx + (k > hgt - 3 ? Math.sign(dx) : 0);
        setPx(img, x, top - k, k === hgt - 1 ? LEAF[5]! : k % 3 === 0 ? LEAF[4]! : dx < 0 ? LEAF[3]! : LEAF[2]!);
      }
    }
  } else {
    for (let k = 0; k < 8; k++) setPx(img, cx, top - k, TEAK[3]!);
    for (const s of [-1, 1]) {
      for (let k = 0; k < 7; k++) {
        setPx(img, cx + s * k, top - 8 + Math.round((k * k) / 8), k < 3 ? LEAF[4]! : LEAF[3]!);
        setPx(img, cx + s * k, top - 7 + Math.round((k * k) / 6), LEAF[2]!);
      }
    }
  }
}

/** Wall-mounted split AC condenser 16×11 with a fan grille and a bracket. */
function acUnit(img: RgbaImage, x: number, y: number): void {
  bevel(img, x, y, 16, 10, CLOTH.concat([rgb("#ffffff")]), 2);
  for (let yy = 0; yy < 7; yy++) {
    for (let xx = 0; xx < 7; xx++) {
      const d = Math.hypot(xx - 3, yy - 3);
      if (d < 3.6) setPx(img, x + 2 + xx, y + 1 + yy, d < 1.2 ? STEEL[3]! : (xx + yy) % 2 ? STEEL[1]! : STEEL[2]!);
    }
  }
  for (let yy = 2; yy < 8; yy += 2) hline(img, x + 11, x + 14, y + yy, CLOTH[1]!);
  hline(img, x + 1, x + 15, y + 10, STEEL[1]!);
  setPx(img, x + 2, y + 11, STEEL[0]!);
  setPx(img, x + 13, y + 11, STEEL[0]!);
  vline(img, x + 15, y + 4, y + 16, STEEL[0]!); // drain pipe
}

/** Hanging red paper lantern. */
function redLantern(img: RgbaImage, cx: number, y: number): void {
  vline(img, cx, y, y + 1, STEEL[1]!);
  hline(img, cx - 2, cx + 2, y + 2, YELLOW[3]!);
  for (let yy = 0; yy < 7; yy++) {
    const half = [2, 3, 4, 4, 4, 3, 2][yy]!;
    for (let dx = -half; dx <= half; dx++) setPx(img, cx + dx, y + 3 + yy, pick(RED, 0.82 - (dx / half) * 0.4 - yy * 0.03, cx + dx, y + yy, 0.3));
  }
  hline(img, cx - 2, cx + 2, y + 10, YELLOW[2]!);
  setPx(img, cx, y + 11, RED[2]!);
  setPx(img, cx, y + 12, RED[1]!);
  setPx(img, cx - 2, y + 5, RED[5]!);
}

/** Bicycle-style cart wheel. */
function wheel(img: RgbaImage, cx: number, cy: number, r: number, spokes = true): void {
  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d > r + 0.4) continue;
      if (d > r - 1.6) setPx(img, x, y, d > r - 0.6 ? rgb("#14141c") : rgb("#2a2a34"));
      else if (d > r - 2.6) setPx(img, x, y, x + y < cx + cy ? STEEL[4]! : STEEL[2]!);
      else if (d < 1.2) setPx(img, x, y, STEEL[3]!);
      else if (spokes && (Math.abs(x - cx) < 0.6 || Math.abs(y - cy) < 0.6 || Math.abs(Math.abs(x - cx) - Math.abs(y - cy)) < 0.6)) setPx(img, x, y, STEEL[2]!);
    }
  }
}

/** Translucent steam wisps rising from (cx, y). */
function steam(img: RgbaImage, cx: number, y: number, h: number, seed: number): void {
  for (let k = 0; k < 3; k++) {
    for (let i = 0; i < h; i++) {
      const x = Math.round(cx + (k - 1) * 3 + Math.sin(i / 3 + seed + k * 2) * 1.6);
      const a = Math.round(140 * (1 - i / h));
      if ((i + k) % 5 === 4) continue;
      blendPx(img, x, y - i, rgb("#ffffff"), a);
    }
  }
}

/** Sliding aluminium window with an iron grille overlay and a concrete sun-hood. */
function grilleWindow(img: RgbaImage, x0: number, y0: number, w: number, h: number, seed: number, curtain: Rgb = rgb("#e8dcc0")): void {
  bevel(img, x0 - 2, y0 - 2, w + 4, h + 4, STEEL, 4);
  const panes = Math.max(2, Math.round(w / 18));
  const pw = w / panes;
  glassPane(img, x0, y0, w, h, (x, y) => {
    const p = Math.floor(x / pw);
    const curtained = hash(p, 0, seed) > 0.45;
    if (curtained && y < h * 0.75) {
      const fold = Math.floor(x) % 3;
      return fold === 0 ? mix(curtain, SHADOW, 0.3) : fold === 1 ? curtain : mix(curtain, rgb("#ffffff"), 0.3);
    }
    return mix(rgb("#2a2238"), WARM[1]!, hash(p, 1, seed) > 0.7 ? 0.35 : 0.05);
  }, 0.28);
  for (let i = 1; i < panes; i++) vline(img, Math.round(x0 + i * pw), y0, y0 + h - 1, STEEL[4]!);
  // iron grille: vertical bars + a diamond band
  const iron = rgb("#2a2630");
  for (let x = x0; x < x0 + w; x += 3) vline(img, x, y0, y0 + h - 1, iron);
  const mid = y0 + Math.floor(h / 2);
  for (let x = x0; x < x0 + w; x++) {
    const k = (x - x0) % 6;
    const dy = k < 3 ? k : 6 - k;
    setPx(img, x, mid - dy, iron);
    setPx(img, x, mid + dy, iron);
  }
  hline(img, x0, x0 + w - 1, y0 + 1, iron);
  hline(img, x0, x0 + w - 1, y0 + h - 2, iron);
  // sill + hood
  hline(img, x0 - 3, x0 + w + 2, y0 + h + 2, CONCRETE[5]!);
  hline(img, x0 - 3, x0 + w + 2, y0 + h + 3, CONCRETE[2]!);
  hline(img, x0 - 4, x0 + w + 3, y0 - 5, CONCRETE[5]!);
  hline(img, x0 - 4, x0 + w + 3, y0 - 4, CONCRETE[3]!);
  hline(img, x0 - 4, x0 + w + 3, y0 - 3, CONCRETE[1]!);
}

// ---------------- buildings ----------------

/** ร้านก๋วยเตี๋ยว — open-front noodle shop with a street cart, steaming pots and stools. 128×112 */
function noodleShop(): RgbaImage {
  const w = 128;
  const h = 112;
  const img = createImage(w, h);
  const wallR = shadeRamp("#9cc4b4");
  // interior back wall (in shade) with shelves and a menu board
  for (let y = 34; y < h - 4; y++) {
    for (let x = 6; x < w - 6; x++) {
      const t = 0.42 + (hash(x >> 2, y >> 2, 3) - 0.5) * 0.08 - (y > 86 ? 0.08 : 0);
      setPx(img, x, y, pick(wallR, t, x, y, 0.4));
    }
  }
  for (let y = 86; y < h - 4; y++) for (let x = 6; x < w - 6; x++) setPx(img, x, y, (x % 6 === 0 || y % 6 === 2) ? CLOTH[1]! : CLOTH[2]!);
  shadeArea(img, 6, 86, w - 12, h - 90, 0.18);
  for (const [mx, mw] of [[68, 22], [94, 22]] as const) {
    bevel(img, mx, 52, mw, 16, CLOTH.concat([rgb("#ffffff")]), 3);
    for (let i = 0; i < 4; i++) {
      hline(img, mx + 3, mx + 3 + 6 + ((i * 5) % 7), 55 + i * 3, i === 0 ? RED[2]! : STEEL[1]!);
      hline(img, mx + mw - 6, mx + mw - 4, 55 + i * 3, RED[3]!);
    }
  }
  hline(img, 66, 118, 76, TEAK[4]!);
  hline(img, 66, 118, 77, TEAK[2]!);
  const jarCols = [RED[3]!, YELLOW[3]!, GREEN[4]!, ORANGE[3]!, CLOTH[3]!, BLUE[4]!];
  for (let x = 68; x < 116; x += 4) {
    const c = jarCols[Math.floor(hash(x, 2, 5) * jarCols.length)]!;
    const hh = 3 + Math.floor(hash(x, 3, 5) * 4);
    for (let y = 75 - hh; y <= 75; y++) { setPx(img, x, y, c); setPx(img, x + 1, y, mix(c, SHADOW, 0.3)); }
    setPx(img, x, 75 - hh, mix(c, rgb("#ffffff"), 0.4));
  }
  ball(img, 48, 52, 4, CLOTH.concat([rgb("#ffffff")]));
  setPx(img, 48, 50, STEEL[0]!); setPx(img, 48, 51, STEEL[0]!); setPx(img, 49, 52, STEEL[0]!);
  lightArea(img, 6, 36, w - 12, 10, WARM[3]!, 0.18);
  // posts + header beam
  for (const px of [0, w - 6]) {
    for (let y = 26; y < h - 3; y++) for (let k = 0; k < 6; k++) setPx(img, px + k, y, pick(TEAK, k === 0 ? 0.95 : k === 5 ? 0.12 : 0.62 - k * 0.06 + (hash(px + k, y >> 2, 8) - 0.5) * 0.12, px + k, y, 0.3));
  }
  for (let y = 28; y < 34; y++) for (let x = 0; x < w; x++) setPx(img, x, y, y === 28 ? TEAK[5]! : y === 33 ? TEAK[0]! : pick(TEAK, 0.6 - (y - 29) * 0.08, x, y, 0.3));
  // tin roof + sign board on posts
  tinRoof(img, 0, 18, w, 10, 17);
  shadeArea(img, 0, 28, w, 2, 0.35);
  for (const px of [36, 90]) for (let y = 12; y < 18; y++) { setPx(img, px, y, STEEL[3]!); setPx(img, px + 1, y, STEEL[1]!); }
  bevel(img, 26, 0, 76, 14, RED, 2);
  rect(img, 28, 2, 72, 10, YELLOW[4]!);
  hline(img, 28, 99, 2, YELLOW[5]!);
  hline(img, 28, 99, 11, YELLOW[2]!);
  for (let yy = 0; yy < 5; yy++) for (let xx = -5 + yy; xx <= 5 - yy; xx++) setPx(img, 36 + xx, 6 + yy, yy === 0 ? CLOTH[3]! : xx < 0 ? RED[4]! : RED[2]!);
  hline(img, 31, 41, 5, YELLOW[1]!);
  for (const sx of [34, 37]) for (let k = 0; k < 3; k++) setPx(img, sx + (k % 2), 2 + k, CLOTH[1]!);
  signText(img, "noodle", 45, 1, RED[2]!, RED[0]!);
  awning(img, 4, 34, w - 8, 11, RED.slice(1), CLOTH, 8, 5);
  redLantern(img, 12, 46);
  redLantern(img, 115, 46);
  // ---- noodle cart ----
  bevel(img, 26, 60, 32, 20, RED, 3);
  glassPane(img, 28, 62, 28, 16, (x, y) => {
    if (y > 10) return (x + y) % 3 === 0 ? YELLOW[3]! : YELLOW[4]!;
    if (y > 5 && x % 6 < 3) return x % 12 < 6 ? TEAK[3]! : CLOTH[3]!;
    if (y > 5) return GREEN[4]!;
    return rgb("#3a2a2a");
  }, 0.18);
  for (const [px, pw] of [[8, 9], [17, 9]] as const) {
    for (let y = 66; y < 80; y++) for (let x = px; x < px + pw; x++) setPx(img, x, y, pick(STEEL, 0.95 - ((x - px) / pw) * 0.75, x, y, 0.4));
    hline(img, px - 1, px + pw, 65, STEEL[5]!);
    hline(img, px, px + pw - 1, 64, STEEL[4]!);
    setPx(img, px + 4, 63, STEEL[1]!);
    steam(img, px + 4, 62, 16, px);
  }
  for (let y = 80; y < 98; y++) for (let x = 6; x < 60; x++) setPx(img, x, y, pick(STEEL, 0.72 - ((x - 6) / 54) * 0.3 - (y > 95 ? 0.3 : 0), x, y, 0.4));
  hline(img, 6, 59, 80, STEEL[5]!);
  rect(img, 9, 83, 47, 12, RED[3]!);
  hline(img, 9, 55, 83, RED[5]!);
  hline(img, 9, 55, 94, RED[1]!);
  signText(img, "noodleSmall", 12, 84, CLOTH[3]!, RED[0]!);
  wheel(img, 16, 102, 6);
  wheel(img, 50, 102, 6);
  // table, condiments, stools
  hline(img, 66, 104, 84, STEEL[5]!);
  hline(img, 66, 104, 85, STEEL[3]!);
  hline(img, 66, 104, 86, STEEL[1]!);
  for (const lx of [68, 102]) vline(img, lx, 87, h - 4, STEEL[2]!);
  const condi = [RED[3]!, YELLOW[3]!, GREEN[3]!, CLOTH[3]!];
  for (let i = 0; i < 4; i++) { rect(img, 76 + i * 3, 80, 2, 4, condi[i]!); setPx(img, 76 + i * 3, 80, mix(condi[i]!, rgb("#ffffff"), 0.5)); }
  rect(img, 90, 79, 6, 5, PINK[3]!); hline(img, 90, 95, 79, PINK[4]!); setPx(img, 92, 78, CLOTH[3]!);
  for (let k = 0; k < 6; k++) setPx(img, 98 + (k % 2), 78 + Math.floor(k / 2), TEAK[4]!);
  const stool = (sx: number, pal: Rgb[]) => {
    hline(img, sx, sx + 8, 98, pal[4]!);
    hline(img, sx, sx + 8, 99, pal[2]!);
    for (let y = 100; y < h - 3; y++) { setPx(img, sx + 1, y, pal[3]!); setPx(img, sx + 7, y, pal[1]!); }
    hline(img, sx + 2, sx + 6, 104, pal[1]!);
  };
  stool(62, RED);
  stool(96, RED);
  stool(110, BLUE);
  plinth(img, 0, w - 1, 4);
  selOutline(img, 0.42);
  return img;
}

/** มินิมาร์ท — generic 24 h convenience store with a striped fascia and a glass front. 144×104 */
function miniMart(): RgbaImage {
  const w = 144;
  const h = 104;
  const img = createImage(w, h);
  const white = CONCRETE.slice(2).concat([rgb("#ffffff")]);
  for (let y = 0; y < 34; y++) for (let x = 0; x < w; x++) setPx(img, x, y, pick(white, 0.78 - (x / w) * 0.12, x, y, 0.4));
  hline(img, 0, w - 1, 0, rgb("#ffffff"));
  hline(img, 0, w - 1, 1, CONCRETE[4]!);
  const band = (y0: number, hh: number, pal: Rgb[]) => {
    for (let y = y0; y < y0 + hh; y++) for (let x = 0; x < w; x++) setPx(img, x, y, pick(pal, (y === y0 ? 0.95 : 0.62) - (x / w) * 0.15, x, y, 0.3));
  };
  band(19, 4, ORANGE);
  band(24, 4, GREEN);
  band(29, 3, RED);
  hline(img, 0, w - 1, 33, CONCRETE[2]!);
  ball(img, 14, 9, 6, YELLOW);
  setPx(img, 12, 8, TEAK[0]!); setPx(img, 16, 8, TEAK[0]!);
  hline(img, 12, 16, 11, TEAK[1]!); setPx(img, 11, 10, TEAK[1]!); setPx(img, 17, 10, TEAK[1]!);
  signText(img, "mart", 24, 3, GREEN[2]!, GREEN[5]!);
  bevel(img, 104, 4, 34, 12, RED, 3);
  signText(img, "open24", 106 + Math.floor((30 - signW("open24")) / 2), 6, rgb("#ffffff"), RED[0]!);
  shadeArea(img, 0, 34, w, 2, 0.4);
  const productCols = [RED[3]!, YELLOW[3]!, GREEN[4]!, BLUE[4]!, ORANGE[3]!, PINK[3]!, CLOTH[3]!, rgb("#8a5ac4")];
  const interior = (gx: number) => (x: number, y: number): Rgb => {
    const wx = gx + x;
    if (y < 3) return y === 1 && wx % 22 < 14 ? rgb("#fffbe8") : rgb("#d8dccc");
    for (const sy of [16, 27, 38, 49]) {
      if (y === sy) return STEEL[4]!;
      if (y === sy + 1) return STEEL[2]!;
      if (y < sy && y >= sy - 6) {
        const slot = Math.floor(wx / 3);
        const hh = 3 + Math.floor(hash(slot, sy, 7) * 4);
        if (sy - y <= hh && wx % 3 !== 2) return productCols[Math.floor(hash(slot, sy, 8) * productCols.length)]!;
      }
    }
    return y < 10 ? rgb("#eef0e4") : rgb("#d6dace");
  };
  const fridge = (x: number, y: number): Rgb => {
    if (x < 2 || x > 37) return STEEL[3]!;
    if (y < 4) return rgb("#e8f4ff");
    if ((y - 4) % 11 === 10) return STEEL[4]!;
    const k = Math.floor((x - 2) / 3);
    if ((x - 2) % 3 === 2) return rgb("#bfe4ff");
    return [GREEN[4]!, RED[3]!, BLUE[4]!, ORANGE[3]!, YELLOW[3]!][(k + Math.floor((y - 4) / 11)) % 5]!;
  };
  rect(img, 3, 36, 138, 3, STEEL[4]!);
  hline(img, 3, 140, 36, STEEL[5]!);
  glassPane(img, 7, 39, 42, 57, interior(7), 0.22);
  glassPane(img, 53, 39, 39, 57, interior(53), 0.3);
  glassPane(img, 96, 39, 42, 57, (x, y) => (y > 3 && y < 54 ? fridge(x, y) : interior(96)(x, y)), 0.22);
  for (const mx of [3, 49, 92, 138]) {
    for (let y = 36; y < 97; y++) { setPx(img, mx, y, STEEL[5]!); setPx(img, mx + 1, y, STEEL[4]!); setPx(img, mx + 2, y, STEEL[2]!); setPx(img, mx + 3, y, STEEL[1]!); }
  }
  for (let y = 39; y < 97; y++) { setPx(img, 72, y, GREEN[1]!); setPx(img, 73, y, GREEN[3]!); }
  for (const hx of [69, 76]) for (let y = 60; y < 72; y++) setPx(img, hx, y, STEEL[5]!);
  for (let y = 40; y < 96; y++) { setPx(img, 53, y, GREEN[3]!); setPx(img, 91, y, GREEN[1]!); }
  hline(img, 53, 91, 39, GREEN[4]!);
  rect(img, 58, 52, 10, 4, GREEN[4]!); hline(img, 58, 67, 52, GREEN[5]!);
  rect(img, 77, 52, 10, 4, GREEN[4]!); hline(img, 77, 86, 52, GREEN[5]!);
  for (let yy = -6; yy <= 6; yy++) for (let xx = -6; xx <= 6; xx++) {
    const a = Math.atan2(yy, xx);
    const rr = 5 + Math.cos(a * 8) * 1.4;
    if (Math.hypot(xx, yy) <= rr) setPx(img, 20 + xx, 74 + yy, Math.hypot(xx, yy) < 3 ? RED[3]! : YELLOW[3]!);
  }
  for (let y = 97; y < h; y++) for (let x = 0; x < w; x++) setPx(img, x, y, y === 97 ? CONCRETE[5]! : y >= h - 2 ? CONCRETE[1]! : (x % 8 === 0) ? CONCRETE[2]! : CONCRETE[3]!);
  for (let y = 34; y < 97; y++) { setPx(img, 0, y, CONCRETE[5]!); setPx(img, 1, y, CONCRETE[4]!); setPx(img, 2, y, CONCRETE[3]!); setPx(img, w - 3, y, CONCRETE[3]!); setPx(img, w - 2, y, CONCRETE[2]!); setPx(img, w - 1, y, CONCRETE[1]!); }
  // ice-cream freezer outside
  bevel(img, 112, 80, 26, 21, white, 2);
  rect(img, 112, 80, 26, 4, BLUE[3]!);
  hline(img, 112, 137, 80, BLUE[5]!);
  hline(img, 112, 137, 83, BLUE[1]!);
  glassPane(img, 114, 85, 22, 6, (x) => [RED[4]!, YELLOW[4]!, PINK[4]!, GREEN[5]!, CLOTH[3]!][Math.floor(x / 3) % 5], 0.2);
  rect(img, 117, 93, 16, 5, BLUE[4]!);
  hline(img, 117, 132, 93, BLUE[5]!);
  for (const fx of [113, 136]) setPx(img, fx, 101, STEEL[1]!);
  selOutline(img, 0.42);
  return img;
}

/** แผงผลไม้ — fruit stall under a big striped umbrella. 96×80 */
function fruitStall(): RgbaImage {
  const w = 96;
  const h = 80;
  const img = createImage(w, h);
  const cx = 47.5;
  for (let y = 22; y < h; y++) { setPx(img, 47, y, STEEL[4]!); setPx(img, 48, y, STEEL[2]!); }
  for (const lx of [7, 87]) for (let y = 54; y < h; y++) { setPx(img, lx, y, TEAK[4]!); setPx(img, lx + 1, y, TEAK[2]!); }
  hline(img, 8, 87, 70, TEAK[2]!);
  for (let y = 66; y < h; y++) for (let x = 12; x < 38; x++) setPx(img, x, y, (x + y) % 3 === 0 ? TEAK[2]! : (x - y) % 4 === 0 ? TEAK[5]! : TEAK[4]!);
  for (const [bx, by] of [[17, 64], [24, 63], [31, 64]] as const) ball(img, bx, by, 3.6, ramp("#2e3a14", "#4e5a1a", "#6e7a24", "#98a03a", "#c4c46a"));
  for (let y = 64; y < h; y++) for (let x = 56; x < 84; x++) setPx(img, x, y, y % 5 === 0 ? TEAK[1]! : pick(TEAK, 0.7 - ((x - 56) / 28) * 0.4, x, y, 0.3));
  for (const bx of [62, 72]) {
    ball(img, bx, 62, 5, GREEN.slice(1));
    for (let k = -4; k <= 4; k += 3) for (let yy = -4; yy <= 2; yy++) if (Math.hypot(k, yy) < 4.6) setPx(img, bx + k, 62 + yy, GREEN[1]!);
  }
  for (let y = 50; y < 55; y++) for (let x = 0; x < w; x++) setPx(img, x, y, y === 50 ? TEAK[5]! : y === 54 ? TEAK[0]! : pick(TEAK, 0.7 - (y - 51) * 0.12, x, y, 0.3));
  const crate = (x0: number, cw: number, y0: number, fruit: (x: number, y: number) => void) => {
    for (let y = y0; y < 50; y++) for (let x = x0; x < x0 + cw; x++) setPx(img, x, y, (y - y0) % 4 === 3 ? TEAK[1]! : pick(TEAK, 0.75 - ((x - x0) / cw) * 0.4, x, y, 0.3));
    vline(img, x0, y0, 49, TEAK[5]!);
    vline(img, x0 + cw - 1, y0, 49, TEAK[1]!);
    for (let i = 0; i < cw - 4; i += 4) fruit(x0 + 3 + i, y0);
  };
  const mango = ramp("#7a4410", "#c07a14", "#e8a822", "#f8cc4a", "#fff090");
  crate(5, 26, 40, (x, y) => ball(img, x, y - 1, 2.6, mango));
  crate(33, 30, 42, (x, y) => ball(img, x, y - 1, 2.4, ORANGE));
  crate(65, 26, 40, (x, y) => { ball(img, x, y - 2, 2.8, PINK); setPx(img, x - 2, y - 4, GREEN[4]!); setPx(img, x + 2, y - 3, GREEN[4]!); });
  for (let yy = 0; yy < 6; yy++) for (let xx = -8; xx <= 8; xx++) {
    const d = Math.hypot(xx / 8, yy / 6);
    if (d > 1) continue;
    const c = d > 0.86 ? GREEN[2]! : d > 0.74 ? CLOTH[3]! : (xx * 3 + yy * 5) % 11 === 0 ? TEAK[0]! : yy === 0 ? RED[5]! : RED[4]!;
    setPx(img, 48 + xx, 44 + yy, c);
  }
  bevel(img, 34, 55, 28, 12, ramp("#6e5034", "#9a7450", "#c4a070", "#e0c494", "#f4e2bc"), 3);
  signText(img, "fruit", 48 - Math.ceil(signW("fruit") / 2), 57, RED[2]!);
  const capTop = 4;
  const capBot = 24;
  for (let y = capTop; y <= capBot + 2; y++) {
    for (let x = 1; x < w - 1; x++) {
      const dx = (x - cx) / 46;
      const dy = (capBot - y) / (capBot - capTop);
      const inDome = dx * dx + dy * dy <= 1;
      const ang = Math.atan2(capBot - y + 2, x - cx);
      const panel = Math.floor((ang / Math.PI) * 8);
      const local = (ang / Math.PI) * 8 - panel;
      const hem = y > capBot && y <= capBot + 2 && Math.abs(Math.sin(local * Math.PI)) * 2.4 > y - capBot;
      if (!(inDome && y <= capBot) && !hem) continue;
      const pal = panel % 2 === 0 ? GREEN.slice(1) : CLOTH;
      let t = 0.66 - dx * 0.35 - (1 - dy) * 0.1;
      if (local < 0.12) t += 0.15;
      if (local > 0.88) t -= 0.15;
      if (hem && y === capBot + 2) t -= 0.25;
      setPx(img, x, y, pick(pal, t, x, y, 0.3));
    }
  }
  for (let y = capTop - 3; y < capTop; y++) setPx(img, 47, y, YELLOW[3]!);
  setPx(img, 48, capTop - 2, YELLOW[1]!);
  const banana = ramp("#6a5012", "#a8841a", "#e0bc2a", "#f6dc5a", "#fff2a0");
  for (const bx of [14, 80]) {
    vline(img, bx, 26, 29, TEAK[2]!);
    for (let k = 0; k < 4; k++) for (let i = 0; i < 6; i++) setPx(img, bx - 3 + k * 2, 30 + i + (k % 2), pick(banana, 0.85 - k * 0.15, bx + k, i, 0.3));
    setPx(img, bx - 3, 36, banana[0]!);
  }
  selOutline(img, 0.42);
  return img;
}

type ShopKind = "coffee" | "pharmacy" | "gold" | "repair";

interface ShophouseOpts {
  floors: 2 | 3;
  wallHex: string;
  kind: ShopKind;
  shutter: "open" | "half" | "closed";
  tank?: boolean;
  seed: number;
}

const SHOP_SIGN: Record<ShopKind, { key: ThaiSignKey; board: Rgb[]; text: Rgb }> = {
  coffee: { key: "coffee", board: ramp("#2a160e", "#4a2a18", "#6a3e22", "#8c5630", "#ad7140"), text: rgb("#fbe8c0") },
  pharmacy: { key: "pharmacy", board: GREEN, text: rgb("#ffffff") },
  gold: { key: "gold", board: RED, text: YELLOW[4]! },
  repair: { key: "repair", board: BLUE, text: rgb("#ffffff") },
};

/** Shop interior seen through the open shutter (local coords in the 96 px wide opening). */
function shopInterior(kind: ShopKind, seed: number): (x: number, y: number, ih: number) => Rgb {
  const lamps = [16, 40, 88];
  return (x, y, ih) => {
    const floor = y > ih - 5;
    switch (kind) {
      case "coffee": {
        if (floor) return (x + (y % 2) * 4) % 8 < 4 ? TEAK[2]! : TEAK[1]!;
        if (y > ih - 22 && x > 10 && x < 64) return y === ih - 21 ? TEAK[5]! : (x - 10) % 9 === 0 ? TEAK[1]! : TEAK[3]!;
        if (y > ih - 32 && y <= ih - 22 && x > 18 && x < 30) return y === ih - 31 ? STEEL[5]! : STEEL[3]!;
        if (y > 6 && y < 22 && x > 52 && x < 80) return (y === 7 || y === 21 || x === 53 || x === 79) ? TEAK[3]! : (y % 4 === 1 && x > 56 && x < 56 + ((y * 7) % 18)) ? CLOTH[3]! : rgb("#24302a");
        if (lamps.some((lx) => Math.hypot(x - lx, y - 8) < 2.5)) return WARM[3]!;
        if (lamps.some((lx) => x === lx && y < 6)) return STEEL[1]!;
        const glow = Math.max(...lamps.map((lx) => 1 - Math.hypot(x - lx, y - 10) / 26));
        return pick(ramp("#3a2218", "#5a3622", "#7e4e2c", "#a66e3c"), 0.25 + Math.max(0, glow) * 0.8, x, y, 0.6);
      }
      case "pharmacy": {
        if (floor) return x % 6 < 3 ? CLOTH[2]! : CLOTH[1]!;
        if (y > ih - 16) return y === ih - 16 ? STEEL[5]! : y < ih - 10 ? mix(GLASS[4]!, rgb("#ffffff"), 0.4) : CLOTH[1]!;
        if (y % 9 === 0) return CLOTH[0]!;
        if (y % 9 >= 3) {
          const slot = Math.floor(x / 3);
          const cols = [RED[4]!, BLUE[4]!, GREEN[4]!, YELLOW[3]!, CLOTH[3]!, PINK[4]!];
          if (x % 3 !== 2 && (y % 9) > 8 - (2 + Math.floor(hash(slot, Math.floor(y / 9), seed) * 5))) return cols[Math.floor(hash(slot, y >> 3, seed + 1) * cols.length)]!;
        }
        return rgb("#e6f0ec");
      }
      case "gold": {
        if (floor) return RED[1]!;
        if (y > ih - 18) {
          if (y === ih - 18) return STEEL[5]!;
          if (y === ih - 17) return GLINT;
          if (y < ih - 9) {
            const k = (x + 3) % 12;
            if (k === 0) return YELLOW[1]!;
            if (y === ih - 12 && k > 2 && k < 10) return k % 2 ? YELLOW[4]! : YELLOW[2]!; // gold chains
            if (y === ih - 14 && (k === 4 || k === 8)) return YELLOW[5]!; // bangles
            return mix(RED[4]!, GLASS[5]!, 0.45);
          }
          return y === ih - 9 ? YELLOW[3]! : RED[2]!;
        }
        if (y < 3) return y === 1 ? YELLOW[3]! : RED[1]!;
        // back wall: framed red panels with gold trim, a shrine shelf in the middle
        if (x > 38 && x < 58 && y > 8 && y < 24) {
          if (y === 9 || x === 39 || x === 57) return YELLOW[3]!;
          if (y === 23) return TEAK[2]!;
          if (y > 17 && y < 23 && x > 44 && x < 52) return YELLOW[y === 18 ? 5 : 3]!;
          if (y > 13 && y < 18 && (x === 43 || x === 53)) return WARM[3]!;
          return RED[1]!;
        }
        const px = x % 16;
        if (px === 0) return YELLOW[1]!;
        if (px === 1 || y === 5) return YELLOW[2]!;
        return pick(RED, 0.62 - Math.abs(px - 8) * 0.03 + (y < ih * 0.4 ? 0.1 : 0), x, y, 0.4);
      }
      default:
        return floor ? STEEL[1]! : rgb("#2a2830");
    }
  };
}

/** ตึกแถว — Thai/Sino shophouse unit, 112 px wide, 2–3 storeys. */
function shophouse(o: ShophouseOpts): () => RgbaImage {
  return () => {
    const w = 112;
    const gf = 72;
    const uf = 52;
    const parapet = o.floors === 2 ? 20 : 16;
    const extra = o.tank ? 16 : 0;
    const h = gf + uf * (o.floors - 1) + parapet + extra;
    const img = createImage(w, h);
    const wr = shadeRamp(o.wallHex);
    const top = extra;
    const groundTop = h - gf;
    const floorTops = Array.from({ length: o.floors - 1 }, (_, i) => top + parapet + i * uf);
    wall(img, 0, top + 4, w, h - top - 4, wr, o.seed, [...floorTops.map((y) => y + 44), top + parapet, groundTop]);
    // stepped centre of the parapet
    wall(img, 36, top, 40, 4, wr, o.seed);
    hline(img, 36, 75, top, wr[5]!);
    vline(img, 36, top, top + 3, wr[4]!);
    vline(img, 75, top + 1, top + 3, wr[1]!);
    // pilasters (party walls) — lit left, shaded right
    for (let y = top + 4; y < h; y++) {
      for (let k = 0; k < 5; k++) {
        setPx(img, k, y, pick(CONCRETE, k === 0 ? 0.98 : k === 4 ? 0.35 : 0.78, k, y, 0.3));
        setPx(img, w - 1 - k, y, pick(CONCRETE, k === 0 ? 0.05 : k === 4 ? 0.7 : 0.42, w - 1 - k, y, 0.3));
      }
    }
    hline(img, 0, 35, top + 4, CONCRETE[5]!);
    hline(img, 76, w - 1, top + 4, CONCRETE[5]!);
    hline(img, 0, w - 1, top + 5, CONCRETE[4]!);
    // breeze-block vents
    for (let bx = 10; bx + 6 <= w - 10; bx += 8) {
      const by = top + parapet - 12;
      for (let yy = 0; yy < 6; yy++) for (let xx = 0; xx < 6; xx++) {
        const edge = xx === 0 || yy === 0 || xx === 5 || yy === 5;
        const cross = xx === 2 || xx === 3 || yy === 2 || yy === 3;
        setPx(img, bx + xx, by + yy, edge ? (xx === 0 || yy === 0 ? wr[1]! : wr[4]!) : cross ? wr[3]! : rgb("#1e1a26"));
      }
    }
    ledge(img, 0, w - 1, top + parapet - 4, CONCRETE, 2);
    if (o.tank) {
      // stainless water tank on a stand + a TV antenna
      for (let y = 2; y < 14; y++) for (let x = 70; x < 90; x++) setPx(img, x, y, pick(STEEL, 0.98 - ((x - 70) / 20) * 0.8, x, y, 0.4));
      for (const ry of [5, 10]) hline(img, 70, 89, ry, STEEL[1]!);
      hline(img, 72, 87, 1, STEEL[4]!);
      for (const lx of [72, 87]) vline(img, lx, 14, 15, STEEL[0]!);
      vline(img, 24, 1, 15, STEEL[2]!);
      hline(img, 18, 30, 3, STEEL[3]!);
      hline(img, 20, 28, 7, STEEL[3]!);
      hline(img, 22, 26, 11, STEEL[3]!);
    }
    floorTops.forEach((fy, i) => {
      const lowest = i === floorTops.length - 1;
      grilleWindow(img, 14, fy + 10, 68, 26, o.seed + i * 3);
      acUnit(img, 88, fy + 14);
      if (lowest) {
        const ry = fy + uf - 16;
        for (let x = 6; x < w - 6; x++) {
          setPx(img, x, ry, CONCRETE[5]!);
          setPx(img, x, ry + 1, CONCRETE[3]!);
          if ((x - 6) % 4 === 0) vline(img, x, ry + 2, ry + 11, rgb("#2e2a34"));
          else if ((x - 6) % 4 === 1) vline(img, x, ry + 2, ry + 11, rgb("#4a4652"));
        }
        hline(img, 6, w - 7, ry + 6, rgb("#2e2a34"));
        pottedPlant(img, 20, ry - 1, "leafy", TERRA, o.seed);
        pottedPlant(img, 32, ry - 1, "flower", TERRA, o.seed + 1);
        pottedPlant(img, 70, ry - 1, "snake", BLUE_POT, o.seed + 2);
      } else {
        hline(img, 18, 80, fy + 6, STEEL[3]!);
        const clothes = [RED[3]!, YELLOW[4]!, BLUE[4]!, CLOTH[3]!, GREEN[4]!, PINK[4]!];
        for (let k = 0; k < 6; k++) {
          const cx = 22 + k * 10;
          const c = clothes[(k + o.seed) % clothes.length]!;
          const ch = 6 + (k % 3) * 2;
          for (let y = 0; y < ch; y++) for (let x = 0; x < 6; x++) setPx(img, cx + x, fy + 7 + y, x === 0 ? mix(c, rgb("#ffffff"), 0.3) : x === 5 ? mix(c, SHADOW, 0.3) : c);
        }
      }
      ledge(img, 0, w - 1, fy + uf - 4, CONCRETE, 2);
    });
    // ground floor: sign board, shutter drum, opening
    const sign = SHOP_SIGN[o.kind];
    bevel(img, 8, groundTop + 2, 96, 14, sign.board, 2);
    hline(img, 9, 102, groundTop + 3, sign.board[4]!);
    signText(img, sign.key, 56 - Math.ceil(signW(sign.key) / 2), groundTop + 3 + Math.floor((12 - signH(sign.key)) / 2), sign.text, sign.board[0]);
    if (o.kind === "pharmacy") for (const px of [18, 94]) { rect(img, px - 1, groundTop + 5, 3, 8, GREEN[5]!); rect(img, px - 4, groundTop + 8, 9, 2, GREEN[5]!); }
    if (o.kind === "coffee") for (const px of [18, 94]) { rect(img, px - 3, groundTop + 6, 6, 5, CLOTH[3]!); setPx(img, px + 3, groundTop + 7, CLOTH[3]!); setPx(img, px + 3, groundTop + 8, CLOTH[3]!); hline(img, px - 4, px + 3, groundTop + 12, CLOTH[2]!); }
    if (o.kind === "gold") for (const px of [18, 94]) for (let k = 0; k < 4; k++) hline(img, px - k, px + k, groundTop + 6 + k, YELLOW[5 - (k >> 1)]!);
    if (o.kind === "repair") for (const px of [18, 94]) { ring(img, px, groundTop + 9, 4, 4, rgb("#ffffff")); setPx(img, px, groundTop + 9, rgb("#ffffff")); }
    const oy = groundTop + 18;
    const oh = h - 3 - oy;
    const inner = shopInterior(o.kind, o.seed);
    const shutterTo = o.shutter === "open" ? oy + 4 : o.shutter === "half" ? oy + Math.round(oh * 0.42) : h - 3;
    for (let y = oy; y < h - 3; y++) {
      for (let x = 8; x < 104; x++) {
        if (y < shutterTo) {
          const k = (y - oy) % 3;
          setPx(img, x, y, k === 0 ? STEEL[4]! : k === 1 ? STEEL[3]! : STEEL[1]!);
        } else setPx(img, x, y, inner(x - 8, y - oy, oh));
      }
    }
    if (o.shutter !== "closed") {
      shadeArea(img, 8, shutterTo, 96, 4, 0.35);
      hline(img, 8, 103, shutterTo - 1, STEEL[0]!);
      for (const hx of [30, 80]) { setPx(img, hx, shutterTo, STEEL[4]!); setPx(img, hx, shutterTo + 1, STEEL[4]!); }
    } else {
      rect(img, 54, h - 9, 4, 4, YELLOW[2]!);
      setPx(img, 55, h - 10, STEEL[3]!);
      setPx(img, 56, h - 10, STEEL[3]!);
      for (let x = 8; x < 104; x++) {
        if (hash(x, 3, o.seed) < 0.82) continue;
        const len = 6 + Math.floor(hash(x, 4, o.seed) * 20);
        for (let y = h - 4 - len; y < h - 4; y++) if (bayer(x, y) < 0.6) setPx(img, x, y, mix(getPx(img, x, y), RUST[1]!, 0.3));
      }
    }
    for (let y = oy - 2; y < oy + 3; y++) hline(img, 7, 104, y, y === oy - 2 ? STEEL[5]! : y === oy + 2 ? STEEL[0]! : STEEL[3]!);
    for (let y = oy; y < h - 3; y++) { setPx(img, 7, y, STEEL[1]!); setPx(img, 104, y, STEEL[1]!); }
    plinth(img, 0, w - 1, 3);
    if (o.kind === "repair") {
      const tyre = (x0: number, x1: number, ty: number) => {
        for (let x = x0; x < x1; x++) for (let y = ty - 4; y <= ty; y++) {
          const end = x === x0 || x === x1 - 1;
          if (end && (y === ty - 4 || y === ty)) continue;
          const tread = (x + (y === ty - 2 ? 1 : 0)) % 3 === 0;
          setPx(img, x, y, y === ty - 4 ? rgb("#5a5a66") : y === ty ? rgb("#101016") : end ? rgb("#1a1a22") : tread ? rgb("#1c1c24") : rgb("#30303a"));
        }
      };
      for (let k = 0; k < 4; k++) tyre(84, 100, h - 4 - k * 5);
      for (let k = 0; k < 2; k++) tyre(14, 30, h - 4 - k * 5);
    }
    selOutline(img, 0.42);
    return img;
  };
}

/** เรือนไทย — traditional teak stilt house: steep gable with sun-ray infill, veranda, stairs. 128×136 */
function thaiHouse(): RgbaImage {
  const w = 128;
  const h = 136;
  const img = createImage(w, h);
  const floorY = 94;
  for (const sx of [12, 40, 68, 92, 118]) {
    for (let y = floorY + 4; y < h; y++) for (let k = 0; k < 4; k++) setPx(img, sx + k, y, pick(TEAK, k === 0 ? 0.92 : k === 3 ? 0.12 : 0.6 - k * 0.1, sx + k, y, 0.3));
  }
  for (let i = 0; i < 24; i++) {
    setPx(img, 16 + i, floorY + 6 + Math.round(i * 0.6), TEAK[1]!);
    setPx(img, 67 - i, floorY + 6 + Math.round(i * 0.6), TEAK[1]!);
  }
  // under the house: glazed water jars + a bamboo bench
  const jar = ramp("#2a1410", "#4a2216", "#6e3420", "#94502c", "#b8743e", "#d8a060");
  for (const jx of [24, 33]) {
    for (let y = h - 15; y < h; y++) {
      const v = (y - (h - 15)) / 14;
      const half = Math.round(3 + Math.sin(v * Math.PI) * 2.6);
      for (let dx = -half; dx <= half; dx++) setPx(img, jx + dx, y, pick(jar, 0.78 - (dx / half) * 0.5, jx + dx, y, 0.3));
    }
    hline(img, jx - 3, jx + 3, h - 16, jar[5]!);
    setPx(img, jx - 2, h - 12, jar[5]!);
  }
  const bamboo = ramp("#5a5a1e", "#7e7e2a", "#a4a23c", "#c8c45a", "#e4dc86");
  for (let x = 48; x < 88; x++) {
    setPx(img, x, h - 12, x % 4 === 0 ? bamboo[1]! : bamboo[4]!);
    setPx(img, x, h - 11, bamboo[2]!);
  }
  for (const lx of [50, 85]) vline(img, lx, h - 10, h - 1, bamboo[1]!);
  for (let x = 0; x < w; x++) {
    setPx(img, x, floorY, TEAK[5]!);
    setPx(img, x, floorY + 1, TEAK[4]!);
    setPx(img, x, floorY + 2, x % 11 === 0 ? TEAK[1]! : TEAK[3]!);
    setPx(img, x, floorY + 3, TEAK[0]!);
  }
  // walls: framed teak panels (fa pakon)
  const wx0 = 8;
  const wx1 = 92;
  for (let y = 54; y < floorY; y++) {
    for (let x = wx0; x < wx1; x++) {
      const px = (x - wx0) % 12;
      const py = (y - 54) % 13;
      let t: number;
      if (px === 0 || py === 0) t = 0.2;
      else if (px === 1 || py === 1) t = 0.9;
      else if (px === 11 || py === 12) t = 0.35;
      else t = 0.62 + (hash(x, y >> 2, 31) - 0.5) * 0.1;
      if (x > wx1 - 14) t -= 0.12;
      setPx(img, x, y, pick(TEAK.slice(1), t, x, y, 0.3));
    }
  }
  const win = (x0: number) => {
    for (let y = 64; y < 82; y++) for (let x = x0; x < x0 + 14; x++) {
      const inner = x > x0 && x < x0 + 13 && y > 64 && y < 81;
      setPx(img, x, y, inner ? (y > 76 ? rgb("#3a2618") : mix(rgb("#2a1a14"), WARM[1]!, Math.max(0, 0.4 - Math.hypot(x - x0 - 7, y - 70) / 18))) : TEAK[0]!);
    }
    for (const [sx, lit] of [[x0 - 6, true], [x0 + 14, false]] as const) {
      for (let y = 64; y < 82; y++) for (let x = sx; x < sx + 6; x++) {
        const edge = x === sx || x === sx + 5 || y === 64 || y === 81 || y === 72;
        setPx(img, x, y, edge ? TEAK[lit ? 2 : 1]! : TEAK[lit ? 4 : 3]!);
      }
    }
    hline(img, x0 - 2, x0 + 15, 82, TEAK[5]!);
    hline(img, x0 - 2, x0 + 15, 83, TEAK[1]!);
  };
  win(18);
  win(64);
  for (let y = 62; y < floorY; y++) for (let x = 42; x < 58; x++) {
    const frame = x === 42 || x === 57 || y === 62;
    const panel = (x === 45 || x === 54) && y > 65 && y < floorY - 3;
    setPx(img, x, y, frame ? TEAK[0]! : x === 49 || x === 50 ? rgb("#1e120c") : panel ? TEAK[2]! : x < 50 ? TEAK[4]! : TEAK[3]!);
  }
  // veranda railing, plants, stairs down to the right
  for (let x = wx1; x < w; x++) {
    setPx(img, x, floorY - 12, TEAK[5]!);
    setPx(img, x, floorY - 11, TEAK[3]!);
    if ((x - wx1) % 4 === 1) vline(img, x, floorY - 10, floorY - 1, TEAK[4]!);
    if ((x - wx1) % 4 === 2) vline(img, x, floorY - 10, floorY - 1, TEAK[2]!);
  }
  vline(img, w - 2, floorY - 12, floorY - 1, TEAK[1]!);
  pottedPlant(img, 98, floorY - 13, "flower", TERRA, 5);
  pottedPlant(img, 110, floorY - 13, "leafy", TERRA, 6);
  pottedPlant(img, 120, floorY - 13, "palm", TERRA, 7);
  for (let s = 0; s < 9; s++) {
    const sy = floorY + 4 + s * 4;
    const sx = 96 + s * 3;
    for (let x = sx; x < Math.min(w, sx + 6); x++) { setPx(img, x, sy, TEAK[5]!); setPx(img, x, sy + 1, TEAK[2]!); }
  }
  line(img, 96, floorY + 6, 125, h - 1, TEAK[1]!);
  line(img, 97, floorY + 6, 126, h - 1, TEAK[3]!);
  shadeArea(img, wx0, 54, wx1 - wx0, 3, 0.4);
  shadeArea(img, wx0, 57, wx1 - wx0, 2, 0.25, true);
  // gable: sun-ray infill, tile band, bargeboards, flared eaves with ngao hooks, chofa
  const cx = 50;
  const apex = 6;
  const base = 56;
  for (let y = apex; y < base; y++) {
    const half = ((y - apex) / (base - apex)) * 48;
    for (let dx = -Math.floor(half); dx <= Math.floor(half); dx++) {
      const x = cx + dx;
      const fromEdge = half - Math.abs(dx);
      if (fromEdge < 3) setPx(img, x, y, pick(TEAK, dx < 0 ? 0.9 : 0.3, x, y, 0.3));
      else if (fromEdge < 8) {
        const row = (y + Math.floor(fromEdge)) % 3;
        setPx(img, x, y, pick(TERRA, (dx < 0 ? 0.72 : 0.45) - (row === 0 ? 0.3 : 0), x, y, 0.3));
      } else {
        const ang = Math.atan2(base - y, dx);
        const ray = Math.floor(ang / (Math.PI / 14)) % 2;
        setPx(img, x, y, pick(TEAK.slice(1), ray ? 0.68 : 0.36, x, y, 0.3));
      }
    }
  }
  for (let dx = -10; dx <= 10; dx++) for (let dy = 0; dy <= 10; dy++) {
    const d = Math.hypot(dx, dy);
    if (d <= 10 && d > 8.6) setPx(img, cx + dx, base - 4 - dy, TEAK[5]!);
    else if (d <= 8.6) setPx(img, cx + dx, base - 4 - dy, TEAK[(dx + 20) % 3 === 0 ? 2 : 3]!);
  }
  for (let x = cx - 46; x <= cx + 46; x++) {
    setPx(img, x, base - 3, TEAK[5]!);
    setPx(img, x, base - 2, TEAK[3]!);
    setPx(img, x, base - 1, TEAK[1]!);
  }
  for (const s of [-1, 1]) {
    for (let k = 0; k < 6; k++) {
      setPx(img, cx + s * (48 + k), base - 1 + Math.round(k * 0.4), TEAK[s < 0 ? 5 : 2]!);
      setPx(img, cx + s * (48 + k), base + Math.round(k * 0.4), TEAK[1]!);
    }
    for (let k = 0; k < 4; k++) setPx(img, cx + s * 54, base + 1 - k, TEAK[s < 0 ? 5 : 3]!);
    setPx(img, cx + s * 53, base - 3, TEAK[s < 0 ? 5 : 3]!);
  }
  for (const [x, y] of [[cx, apex - 1], [cx, apex - 2], [cx + 1, apex - 3], [cx + 2, apex - 4], [cx + 3, apex - 4], [cx + 3, apex - 5], [cx - 1, apex - 1]] as const) setPx(img, x, y, YELLOW[3]!);
  selOutline(img, 0.4);
  // bougainvillea at the left stilt
  foliage(img, [[6, h - 6, 5], [12, h - 9, 6], [4, h - 12, 4]], LEAF, 77, { flatBottom: h - 1 });
  const r = rng(12);
  for (let i = 0; i < 16; i++) {
    const fx = Math.round(2 + r() * 14);
    const fy = Math.round(h - 16 + r() * 12);
    if (alphaAt(img, fx, fy)) setPx(img, fx, fy, r() > 0.4 ? PINK[4]! : PINK[3]!);
  }
  return img;
}

// ---------------- street dressing ----------------

/**
 * Concrete power pole with crossarms and a tangle of spare cable, 240 px wide.
 * Wires meet the sprite edges at the same heights, so poles placed edge to edge (every 240 px)
 * give continuous wires that sag lowest halfway between poles. `end: true` drops the right-hand
 * span and adds a guy wire instead: use it last in a run, and flipped (flipX) first.
 */
function powerPole(opts: { end?: boolean; transformer?: boolean } = {}): () => RgbaImage {
  return () => {
    const w = 240;
    const h = 160;
    const img = createImage(w, h);
    const px = 116;
    for (let y = 8; y < h; y++) {
      const taper = y < 60 ? 1 : 0;
      for (let k = taper; k < 8 - taper; k++) {
        const u = (k - taper) / (7 - 2 * taper);
        setPx(img, px + k, y, pick(CONCRETE, 0.92 - u * 0.8 + (hash(k, y >> 1, 3) - 0.5) * 0.08, px + k, y, 0.3));
      }
    }
    hline(img, px + 1, px + 6, 8, CONCRETE[5]!);
    rect(img, px + 1, 92, 6, 8, BLUE[3]!);
    hline(img, px + 1, px + 6, 92, BLUE[5]!);
    for (const ty of [70, 110]) hline(img, px, px + 7, ty, rgb("#1a1a20"));
    const arm = (y: number, x0: number, x1: number) => {
      hline(img, x0, x1, y, STEEL[4]!);
      hline(img, x0, x1, y + 1, STEEL[2]!);
      hline(img, x0, x1, y + 2, STEEL[0]!);
    };
    arm(18, px - 22, px + 29);
    arm(34, px - 16, px + 23);
    for (const [ix, iy] of [[px - 20, 18], [px - 10, 18], [px + 16, 18], [px + 26, 18], [px - 14, 34], [px + 20, 34]] as const) {
      for (let k = 1; k <= 3; k++) hline(img, ix - 1, ix + 1, iy - k, k === 2 ? rgb("#8a4a2a") : rgb("#c8bca8"));
    }
    line(img, px, 30, px - 14, 21, STEEL[1]!);
    line(img, px + 7, 30, px + 23, 21, STEEL[1]!);
    if (opts.transformer) {
      const tx = px + 10;
      for (let y = 42; y < 62; y++) for (let x = tx; x < tx + 12; x++) setPx(img, x, y, pick(STEEL, 0.92 - ((x - tx) / 12) * 0.8, x, y, 0.4));
      for (const ry of [46, 54]) hline(img, tx, tx + 11, ry, STEEL[1]!);
      hline(img, tx + 1, tx + 10, 41, STEEL[5]!);
      for (const bx of [tx + 2, tx + 9]) { setPx(img, bx, 40, rgb("#c8bca8")); setPx(img, bx, 39, rgb("#8a4a2a")); }
      hline(img, px + 8, tx - 1, 50, STEEL[0]!);
      hline(img, px + 8, tx - 1, 58, STEEL[0]!);
    }
    for (let y = h - 4; y < h; y++) hline(img, px - 2, px + 9, y, y === h - 4 ? CONCRETE[5]! : CONCRETE[2]!);
    selOutline(img, 0.42);
    // wires: parabolas, highest at the pole, lowest at the sprite edges (mid-span)
    const wire = rgb("#24222c");
    const half = w / 2;
    const wires: Array<[number, number]> = [[14, 14], [15, 15], [30, 16], [64, 18], [67, 21], [71, 24]];
    for (const [yp, sag] of wires) {
      for (let x = 0; x < w; x++) {
        if (opts.end && x > px + 7) continue;
        if (x >= px && x < px + 8) continue;
        const d = Math.abs(x + 0.5 - half) / half;
        const y = Math.round(yp + sag * d * d);
        if (!alphaAt(img, x, y) || y > 60) setPx(img, x, y, wire);
      }
    }
    if (opts.end) {
      // guy wire anchored in the ground
      line(img, px + 7, 24, px + 60, h - 2, wire);
      for (let y = h - 3; y < h; y++) hline(img, px + 58, px + 62, y, CONCRETE[y === h - 3 ? 5 : 2]!);
      setPx(img, px + 31, 87, rgb("#d8d040"));
      setPx(img, px + 32, 89, rgb("#d8d040"));
    }
    // spare-cable coils hanging off the pole
    for (const [cx, cy, rx, ry] of [[px + 12, 80, 6, 7], [px + 14, 82, 5, 6], [px + 10, 84, 6, 5], [px - 5, 78, 4, 6]] as const) ring(img, cx, cy, rx, ry, wire);
    rect(img, px + 8, 86, 5, 6, rgb("#3a3a44"));
    hline(img, px + 8, px + 12, 86, STEEL[3]!);
    return img;
  };
}

/** Thai national flag on a white pole. 32×112 */
function flagPole(): RgbaImage {
  const w = 32;
  const h = 112;
  const img = createImage(w, h);
  for (let y = 4; y < h - 6; y++) { setPx(img, 5, y, rgb("#ffffff")); setPx(img, 6, y, CLOTH[2]!); setPx(img, 7, y, CLOTH[0]!); }
  ball(img, 6, 2.5, 2.2, YELLOW);
  // red · white · blue (double) · white · red
  const stripes: Rgb[][] = [RED.slice(2), CLOTH, BLUE.slice(1), BLUE.slice(1), CLOTH, RED.slice(2)];
  const fh = 18;
  for (let x = 8; x < w; x++) {
    const u = (x - 8) / (w - 8);
    const wave = Math.sin(u * Math.PI * 2.2 + 0.4) * 1.6 * u;
    const shade = Math.cos(u * Math.PI * 2.2 + 0.4);
    for (let y = 0; y < fh; y++) {
      const band = stripes[Math.min(5, Math.floor(y / 3))]!;
      const yy = 6 + y + Math.round(wave);
      setPx(img, x, yy, pick(band, 0.62 + shade * 0.25 * u + (y === 0 ? 0.15 : 0), x, yy, 0.3));
    }
  }
  vline(img, 8, 6, 6 + fh, STEEL[2]!);
  for (let y = h - 6; y < h; y++) hline(img, 0, 13, y, y === h - 6 ? CONCRETE[5]! : y === h - 1 ? CONCRETE[1]! : CONCRETE[3]!);
  hline(img, 2, 11, h - 9, CONCRETE[5]!);
  rect(img, 2, h - 8, 10, 2, CONCRETE[3]!);
  selOutline(img, 0.42);
  return img;
}

/** Green road direction signs (temple → / ← market) + a blue soi plate. 48×64 */
function signpostThai(): RgbaImage {
  const w = 48;
  const h = 64;
  const img = createImage(w, h);
  for (let y = 4; y < h; y++) { setPx(img, 23, y, STEEL[4]!); setPx(img, 24, y, STEEL[2]!); }
  const board = (y0: number, dir: 1 | -1, key: ThaiSignKey) => {
    for (let y = y0; y < y0 + 12; y++) {
      for (let x = 2; x < 46; x++) {
        const tip = dir > 0 ? x - 39 : 8 - x;
        const yy = Math.abs(y - (y0 + 5.5));
        if (tip > 0 && yy > 6 - tip) continue;
        const border = y === y0 || y === y0 + 11 || (dir > 0 ? x === 2 : x === 45) || (tip > 0 && yy > 5 - tip);
        setPx(img, x, y, border ? rgb("#f4f4ee") : pick(GREEN, 0.5 - (y - y0) * 0.02, x, y, 0.3));
      }
    }
    const tx = dir > 0 ? 6 : 42 - signW(key);
    signText(img, key, tx, y0 + 2 + Math.floor((8 - signH(key)) / 2), rgb("#ffffff"));
    const ax = dir > 0 ? Math.min(37, tx + signW(key) + 6) : Math.max(10, tx - 6);
    hline(img, ax - 2, ax + 2, y0 + 6, rgb("#ffffff"));
    setPx(img, ax + 1 * dir, y0 + 5, rgb("#ffffff"));
    setPx(img, ax + 1 * dir, y0 + 7, rgb("#ffffff"));
  };
  board(4, 1, "temple");
  board(18, -1, "market");
  bevel(img, 8, 34, 32, 11, BLUE, 3);
  signText(img, "soi", 24 - Math.ceil(signW("soi") / 2), 35 + Math.floor((9 - signH("soi")) / 2), rgb("#ffffff"));
  for (let y = h - 3; y < h; y++) hline(img, 20, 27, y, CONCRETE[y === h - 3 ? 5 : 2]!);
  selOutline(img, 0.42);
  return img;
}

function pottedPlants(): RgbaImage {
  const img = createImage(32, 28);
  pottedPlant(img, 7, 27, "snake", BLUE_POT, 1);
  pottedPlant(img, 25, 27, "palm", TERRA, 3);
  pottedPlant(img, 16, 27, "flower", ramp("#3a1e14", "#5e3420", "#86502e", "#b07040", "#d09458", "#ecbc80"), 2);
  selOutline(img, 0.42);
  return img;
}

/** Wooden planter of Thai marigolds. 32×18 */
function flowerBox(): RgbaImage {
  const img = createImage(32, 18);
  foliage(img, [[6, 9, 4], [13, 7, 5], [21, 8, 5], [27, 9, 4]], LEAF, 88, { flatBottom: 11, light: [12, 5, 10] });
  const r = rng(31);
  const marigold = [ORANGE[3]!, YELLOW[3]!, ORANGE[4]!];
  for (let i = 0; i < 14; i++) {
    const fx = Math.round(3 + r() * 26);
    const fy = Math.round(3 + r() * 7);
    if (!alphaAt(img, fx, fy)) continue;
    const c = marigold[i % 3]!;
    setPx(img, fx, fy, c);
    setPx(img, fx + 1, fy, c);
    setPx(img, fx, fy + 1, mix(c, SHADOW, 0.35));
    setPx(img, fx, fy - 1, mix(c, rgb("#ffffff"), 0.35));
  }
  for (let y = 11; y < 18; y++) for (let x = 1; x < 31; x++) setPx(img, x, y, y === 11 ? TEAK[5]! : y === 14 ? TEAK[1]! : y === 17 ? TEAK[0]! : pick(TEAK, 0.7 - (x / 32) * 0.4, x, y, 0.3));
  selOutline(img, 0.42);
  return img;
}

/** Step-through scooter with a front basket. 48×32 */
function motorbike(): RgbaImage {
  const img = createImage(48, 32);
  wheel(img, 9, 25, 6, false);
  wheel(img, 38, 25, 6, false);
  for (let y = 13; y < 22; y++) for (let x = 24; x < 44; x++) {
    const dx = (x - 34) / 10;
    const dy = (y - 18) / 5;
    if (dx * dx + dy * dy > 1.1 || (y > 19 && Math.hypot(x - 38, y - 25) < 8)) continue;
    setPx(img, x, y, pick(RED, 0.8 - dy * 0.3 - dx * 0.25, x, y, 0.3));
  }
  for (let x = 25; x < 41; x++) { setPx(img, x, 11, rgb("#3a3440")); setPx(img, x, 12, rgb("#1a1820")); }
  hline(img, 14, 28, 20, STEEL[3]!);
  hline(img, 14, 28, 21, STEEL[1]!);
  for (let y = 8; y < 21; y++) for (let x = 12; x < 17; x++) setPx(img, x + Math.floor((y - 8) * 0.25), y, pick(RED, 0.85 - (x - 12) * 0.12, x, y, 0.3));
  line(img, 12, 6, 9, 25, STEEL[2]!);
  line(img, 13, 6, 10, 25, STEEL[4]!);
  hline(img, 9, 15, 5, STEEL[1]!);
  ball(img, 10, 7, 1.6, WARM);
  vline(img, 14, 1, 4, STEEL[2]!);
  hline(img, 13, 16, 1, STEEL[4]!);
  for (let y = 7; y < 13; y++) for (let x = 2; x < 10; x++) setPx(img, x, y, (x + y) % 2 === 0 ? STEEL[3]! : STEEL[1]!);
  hline(img, 2, 9, 7, STEEL[4]!);
  hline(img, 30, 42, 22, STEEL[4]!);
  hline(img, 30, 42, 23, STEEL[2]!);
  setPx(img, 44, 15, RED[5]!);
  setPx(img, 44, 16, RED[3]!);
  line(img, 30, 26, 27, 31, STEEL[1]!);
  selOutline(img, 0.42);
  return img;
}

function streetDog(): RgbaImage {
  const img = createImage(24, 16);
  const f = SKIN_DOG;
  for (let y = 5; y < 11; y++) for (let x = 5; x < 18; x++) {
    const dy = (y - 8) / 3.2;
    const dx = (x - 11.5) / 6.8;
    if (dx * dx + dy * dy > 1) continue;
    setPx(img, x, y, pick(f, 0.7 - dy * 0.35, x, y, 0.3));
  }
  for (const [lx, c] of [[6, 2], [8, 3], [15, 2], [17, 3]] as const) for (let y = 10; y < 16; y++) setPx(img, lx, y, f[c]!);
  for (let y = 2; y < 8; y++) for (let x = 16; x < 22; x++) if (Math.hypot(x - 18.5, y - 4.5) < 3.2) setPx(img, x, y, pick(f, 0.8 - (y - 2) * 0.08, x, y, 0.3));
  for (let x = 21; x < 24; x++) for (let y = 5; y < 7; y++) setPx(img, x, y, f[4]!);
  setPx(img, 23, 5, rgb("#1a1414"));
  setPx(img, 19, 4, rgb("#1a1414"));
  for (const [x, y] of [[17, 1], [17, 0], [20, 1], [20, 0], [16, 1]] as const) setPx(img, x, y, f[2]!);
  for (const [x, y] of [[4, 6], [3, 5], [3, 4], [4, 3], [5, 3]] as const) setPx(img, x, y, f[3]!);
  selOutline(img, 0.42);
  return img;
}

function cat(): RgbaImage {
  const img = createImage(16, 12);
  const f = ramp("#5a2a12", "#8a4a1c", "#c07028", "#e09444", "#f6be72", "#ffe2b0");
  for (let y = 4; y < 12; y++) for (let x = 3; x < 11; x++) {
    const d = Math.hypot((x - 7) / 4, (y - 8.5) / 3.6);
    if (d > 1) continue;
    let t = 0.72 - (x - 3) * 0.05 - (y - 4) * 0.03;
    if ((y + Math.floor(x / 2)) % 3 === 0) t -= 0.25;
    setPx(img, x, y, pick(f, t, x, y, 0.3));
  }
  for (let y = 1; y < 6; y++) for (let x = 7; x < 13; x++) if (Math.hypot(x - 9.8, y - 3.4) < 2.7) setPx(img, x, y, pick(f, 0.8 - (y - 1) * 0.06, x, y, 0.3));
  for (const [x, y] of [[8, 0], [8, 1], [12, 0], [11, 1]] as const) setPx(img, x, y, f[2]!);
  setPx(img, 10, 3, GREEN[4]!);
  setPx(img, 12, 3, GREEN[4]!);
  for (const [x, y] of [[2, 10], [1, 9], [1, 8], [2, 7], [3, 11]] as const) setPx(img, x, y, f[3]!);
  selOutline(img, 0.42);
  return img;
}

/** Wooden pier: plank deck on top (walkable), posts down into the canal. 64×48 */
function pier(): RgbaImage {
  const w = 64;
  const h = 48;
  const img = createImage(w, h);
  const moss = ramp("#1a3a2a", "#2a5238", "#3e6e44");
  for (const sx of [3, 29, 55]) {
    for (let y = 6; y < h; y++) for (let k = 0; k < 5; k++) {
      let c = pick(TEAK, k === 0 ? 0.85 : k === 4 ? 0.12 : 0.58 - k * 0.08, sx + k, y, 0.3);
      if (y > 14) c = mix(c, moss[1]!, clamp01((y - 14) / 10) * 0.55);
      if (y > 22) c = mix(c, rgb("#1e3a52"), clamp01((y - 22) / 20) * 0.6);
      setPx(img, sx + k, y, c);
    }
  }
  for (let i = 0; i < 22; i++) {
    setPx(img, 8 + i, 7 + Math.round(i * 0.3), TEAK[1]!);
    setPx(img, 54 - i, 7 + Math.round(i * 0.3), TEAK[1]!);
  }
  for (let x = 0; x < w; x++) {
    const joint = x % 16 === 15;
    setPx(img, x, 0, TEAK[5]!);
    setPx(img, x, 1, joint ? TEAK[1]! : TEAK[4]!);
    setPx(img, x, 2, joint ? TEAK[1]! : hash(x, 2, 4) > 0.75 ? TEAK[2]! : TEAK[3]!);
    setPx(img, x, 3, joint ? TEAK[1]! : TEAK[3]!);
    setPx(img, x, 4, TEAK[1]!);
    setPx(img, x, 5, TEAK[0]!);
  }
  selOutline(img, 0.42, false);
  for (const sx of [3, 29, 55]) for (let k = -2; k < 7; k++) if ((k + sx) % 3 !== 0) blendPx(img, sx + k, 9, rgb("#e4f6fb"), 150);
  return img;
}

/** Long wooden canal boat with baskets of produce (floating market). 64×20 */
function canalBoat(): RgbaImage {
  const w = 64;
  const h = 20;
  const img = createImage(w, h);
  for (let x = 2; x < w - 1; x++) {
    const u = (x - 2) / (w - 3);
    const sheer = 10 - Math.round(Math.pow(Math.max(0, u - 0.7) / 0.3, 2) * 8) - Math.round(Math.pow(Math.max(0, 0.12 - u) / 0.12, 2) * 3);
    const keel = 17 - Math.round(Math.pow(Math.max(0, u - 0.78) / 0.22, 1.5) * 6);
    for (let y = sheer; y <= keel; y++) {
      let t = y === sheer ? 0.95 : y === sheer + 1 ? 0.75 : 0.5 - (y - sheer) * 0.04;
      if (y === sheer + 3) t = 0.15;
      setPx(img, x, y, y === sheer + 3 ? BLUE[3]! : pick(TEAK, t, x, y, 0.3));
    }
  }
  for (const [bx, pal] of [[14, ORANGE], [24, GREEN.slice(1)], [34, YELLOW], [44, RED.slice(1)]] as const) {
    for (let y = 6; y < 10; y++) for (let x = bx; x < bx + 8; x++) setPx(img, x, y, (x + y) % 2 ? TEAK[4]! : TEAK[3]!);
    for (let k = 0; k < 3; k++) ball(img, bx + 1.5 + k * 2.5, 5, 1.6, pal);
  }
  selOutline(img, 0.42, false);
  for (let x = 0; x < w; x++) if (x % 5 !== 0) blendPx(img, x, h - 2, rgb("#e4f6fb"), 140);
  return img;
}

// ---------------- backgrounds ----------------

/** Wrapped distance on the 480 px loop. */
const wrapDist = (a: number, b: number) => Math.min(Math.abs(a - b), W - Math.abs(a - b));

/** Hazy far hills with a golden chedi and a small temple hall on the highest hill. Loops every 480 px. */
function templeHill(): RgbaImage {
  const img = createImage(W, H);
  const back = shadeRamp("#9ab8b4", 5, -0.18, 0.12);
  const front = shadeRamp("#6f9a7a", 6, -0.26, 0.2);
  const peakX = 300;
  const bump = (x: number, cx: number, wdt: number, amp: number) => amp * Math.exp(-(wrapDist(x, cx) ** 2) / (wdt * wdt));
  const backTop = (x: number) => Math.round(178 - 8 * Math.sin((2 * Math.PI * 2 * x) / W + 0.6) - 5 * Math.sin((2 * Math.PI * 5 * x) / W + 1.9) - (vnoise(x, 0, 16, 81) - 0.5) * 6 - bump(x, 90, 50, 18));
  const frontTop = (x: number) => Math.round(206 - 6 * Math.sin((2 * Math.PI * 3 * x) / W + 2.2) - (vnoise(x, 0, 12, 82) - 0.5) * 5 - bump(x, peakX, 46, 46));
  for (let x = 0; x < W; x++) {
    const t0 = backTop(x);
    for (let y = t0; y < H; y++) setPx(img, x, y, pick(back, (y === t0 ? 0.9 : 0.55) - (y - t0) * 0.004 + (vnoise(x, y, 10, 83) - 0.5) * 0.06, x, y, 0.5));
  }
  for (let x = 0; x < W; x++) {
    const t0 = frontTop(x);
    const slope = frontTop(wrapX(x + 3)) - frontTop(wrapX(x - 3));
    const face = slope < -1 ? 0.14 : slope > 1 ? -0.12 : 0;
    for (let y = t0; y < H; y++) {
      const canopy = vnoise(x, y, 3, 84) > 0.62 ? 0.12 : vnoise(x, y, 3, 85) < 0.3 ? -0.1 : 0;
      const t = y === t0 ? 0.95 : 0.6 + face * clamp01(1 - (y - t0) / 14) + canopy - (y - t0) * 0.004;
      setPx(img, x, y, pick(front, t, x, y, 0.4));
    }
  }
  const r = rng(86);
  for (let i = 0; i < 46; i++) {
    const x = Math.floor(r() * W);
    if (wrapDist(x, peakX) < 30) continue;
    const y = frontTop(x) + 1;
    const rad = 2 + r() * 2.5;
    for (let dy = -4; dy <= 0; dy++) for (let dx = -4; dx <= 4; dx++) if (dx * dx + dy * dy <= rad * rad) setWrap(img, x + dx, y + dy, dx + dy < -1 ? front[4]! : front[3]!);
  }
  // naga stairway zig-zagging down the temple hill
  const stone = rgb("#e8e2d0");
  let sx = peakX + 2;
  for (let y = frontTop(peakX) + 8; y < 238; y++) {
    sx += (y >> 3) % 2 === 0 ? 1 : -1;
    setWrap(img, sx, y, stone);
    if (y % 2 === 0) setWrap(img, sx + 1, y, mix(stone, front[2]!, 0.5));
  }
  // golden chedi: white stepped base, gold bell, ringed spire, finial
  const gold = ramp("#7a4a10", "#b8781a", "#e0aa2a", "#f8d454", "#fff2a8");
  const white = ramp("#a8a4b0", "#ccc8cc", "#ece8e2", "#fffbf2");
  let y = frontTop(peakX) + 2;
  for (const [hw, hh, pal] of [[14, 3, white], [11, 3, white], [9, 2, gold]] as Array<[number, number, Rgb[]]>) {
    for (let k = 0; k < hh; k++, y--) for (let dx = -hw; dx <= hw; dx++) setWrap(img, peakX + dx, y, pick(pal, 0.75 - (dx / hw) * 0.45 + (k === hh - 1 ? 0.2 : 0), peakX + dx, y, 0.3));
  }
  for (let k = 0; k < 11; k++, y--) {
    const hw = Math.round(8 * Math.sqrt(Math.max(0, 1 - Math.pow(k / 11, 2))));
    for (let dx = -hw; dx <= hw; dx++) setWrap(img, peakX + dx, y, pick(gold, 0.82 - (dx / Math.max(1, hw)) * 0.5 + (k > 7 ? 0.1 : 0), peakX + dx, y, 0.3));
  }
  for (let k = 0; k < 14; k++, y--) {
    const hw = Math.max(0, Math.round(2.6 - k * 0.18));
    for (let dx = -hw; dx <= hw; dx++) setWrap(img, peakX + dx, y, k % 3 === 0 && hw > 0 ? gold[1]! : dx <= 0 ? gold[4]! : gold[2]!);
  }
  setWrap(img, peakX, y, rgb("#ffffff"));
  // temple hall with an orange roof beside the chedi
  const hx = peakX + 24;
  const hy = frontTop(hx) + 4;
  for (let yy = hy - 7; yy < hy; yy++) for (let dx = -8; dx <= 8; dx++) setWrap(img, hx + dx, yy, dx < -6 ? white[3]! : dx > 6 ? white[0]! : white[2]!);
  for (let dx = -4; dx <= 4; dx += 4) for (let yy = hy - 5; yy < hy - 1; yy++) setWrap(img, hx + dx, yy, rgb("#5a3a2a"));
  const tile = ramp("#7a2a14", "#b4461c", "#e06a26", "#f6944a");
  for (let k = 0; k < 9; k++) {
    const hw = 11 - k;
    for (let dx = -hw; dx <= hw; dx++) setWrap(img, hx + dx, hy - 8 - k, k % 3 === 2 ? tile[3]! : dx < 0 ? tile[2]! : tile[1]!);
  }
  setWrap(img, hx, hy - 17, gold[3]!);
  setWrap(img, hx + 1, hy - 18, gold[3]!);
  setWrap(img, hx - 11, hy - 9, gold[3]!);
  setWrap(img, hx + 11, hy - 9, gold[3]!);
  // atmospheric haze toward the foot of the hills
  const haze = rgb("#cfe2e0");
  for (let yy = 214; yy < H; yy++) for (let x = 0; x < W; x++) {
    const hz = clamp01((yy - 214) / 30);
    if (alphaAt(img, x, yy) && bayer(x, yy) < hz) setPx(img, x, yy, mix(getPx(img, x, yy), haze, 0.3 + hz * 0.2));
  }
  return img;
}

/** Coconut palm: curved trunk + drooping fronds (wraps). */
function palm(img: RgbaImage, bx: number, by: number, h: number, lean: number, pal: Rgb[], trunk: Rgb[], seed: number): void {
  let tx = bx;
  let ty = by;
  for (let k = 0; k < h; k++) {
    tx = Math.round(bx + lean * Math.pow(k / h, 1.6) * h * 0.35);
    ty = by - k;
    setWrap(img, tx, ty, k % 4 === 0 ? trunk[0]! : trunk[2]!);
    setWrap(img, tx + 1, ty, k % 4 === 0 ? trunk[0]! : trunk[1]!);
  }
  const r = rng(seed);
  const fronds = 11;
  for (let f = 0; f < fronds; f++) {
    const a = -Math.PI + (f / (fronds - 1)) * Math.PI + (r() - 0.5) * 0.25;
    const len = h * 0.3 + r() * 5;
    const side = Math.cos(a) < 0 ? 0.1 : -0.1;
    for (let k = 0; k < len; k++) {
      const u = k / len;
      const x = Math.round(tx + Math.cos(a) * k);
      const y = Math.round(ty + Math.sin(a) * k * 0.5 + u * u * len * 0.7);
      setWrap(img, x, y, pick(pal, 0.8 - u * 0.4 + side, wrapX(x), y, 0.3));
      // leaflets hanging off the rachis, longer mid-frond
      const leaf = Math.round(Math.sin(u * Math.PI) * 3.2);
      for (let j = 1; j <= leaf; j++) {
        setWrap(img, x, y + j, pick(pal, 0.55 - j * 0.12 - u * 0.2 + side, wrapX(x), y + j, 0.3));
        if (k % 2 === 0) setWrap(img, x + (Math.cos(a) < 0 ? -1 : 1), y + j, pal[1]!);
      }
    }
  }
  for (const [dx, dy] of [[-1, 1], [1, 1], [0, 2]] as const) setWrap(img, tx + dx, ty + dy, rgb("#5a4a1a"));
}

/** Banana plant: a few broad paddle leaves (wraps). */
function bananaPlant(img: RgbaImage, bx: number, by: number, pal: Rgb[], seed: number): void {
  const r = rng(seed);
  for (let k = 0; k < 12; k++) { setWrap(img, bx, by - k, pal[2]!); setWrap(img, bx + 1, by - k, pal[1]!); }
  for (let l = 0; l < 5; l++) {
    const a = -Math.PI / 2 + (l - 2) * 0.55 + (r() - 0.5) * 0.2;
    const len = 12 + r() * 6;
    for (let k = 2; k < len; k++) {
      const u = k / len;
      const x = bx + Math.cos(a) * k;
      const y = by - 11 + Math.sin(a) * k + u * u * 6;
      const wdt = Math.sin(u * Math.PI) * 3;
      for (let s = -wdt; s <= wdt; s++) {
        const px = Math.round(x - Math.sin(a) * s);
        const py = Math.round(y + Math.cos(a) * s * 0.6);
        setWrap(img, px, py, pick(pal, 0.7 - s * 0.08 - u * 0.2, wrapX(px), py, 0.3));
      }
    }
  }
}

/** Tropical mid layer: palms, banana plants, mango trees and roofs of the old town. Loops every 480 px. */
function tropicalMid(): RgbaImage {
  const img = createImage(W, H);
  const far = shadeRamp("#5a9070", 5, -0.22, 0.16);
  const near = shadeRamp("#3f8a4e", 6, -0.26, 0.22);
  const trunk = ramp("#4a3a2e", "#6a5440", "#8c7458");
  const roofs = ramp("#8a4a3a", "#a85e44", "#c47a56", "#dc9c76");
  const walls = ramp("#a8a8a0", "#c4c0b4", "#dcd6c6");
  const r = rng(91);
  for (let i = 0; i < 9; i++) {
    const cx = Math.floor((i / 9) * W + r() * 24);
    const hw = 10 + Math.floor(r() * 8);
    const base = 222;
    const wallH = 7 + Math.floor(r() * 5);
    for (let y = base - wallH; y < base + 6; y++) for (let dx = -hw + 2; dx <= hw - 2; dx++) setWrap(img, cx + dx, y, dx > hw - 5 ? walls[0]! : walls[1]!);
    for (let dx = -hw + 5; dx <= hw - 5; dx += 6) for (let y = base - wallH + 2; y < base - wallH + 5; y++) setWrap(img, cx + dx, y, rgb("#4a4a5a"));
    for (let k = 0; k < hw * 0.8; k++) {
      const w2 = hw - k;
      for (let dx = -w2; dx <= w2; dx++) setWrap(img, cx + dx, base - wallH - k, k === 0 ? roofs[0]! : dx < 0 ? roofs[2]! : roofs[1]!);
    }
    setWrap(img, cx, base - wallH - Math.floor(hw * 0.8) - 1, roofs[3]!);
  }
  for (let x = 0; x < W; x++) {
    const top = Math.round(224 - 6 * Math.sin((2 * Math.PI * 7 * x) / W + 0.4) - (vnoise(x, 0, 6, 92) - 0.5) * 8);
    for (let y = top; y < H; y++) setPx(img, x, y, pick(far, (y === top ? 0.85 : 0.5) + (vnoise(x, y, 4, 93) - 0.5) * 0.2 - (y - top) * 0.01, x, y, 0.5));
  }
  for (let i = 0; i < 9; i++) {
    const bx = Math.floor((i / 9) * W + r() * 30);
    palm(img, bx, 236, 44 + Math.floor(r() * 26), r() > 0.5 ? 1 : -1, near.slice(1), trunk, 940 + i);
  }
  for (let i = 0; i < 8; i++) bananaPlant(img, Math.floor(r() * W), 238, near, 960 + i);
  for (let i = 0; i < 6; i++) {
    const cx = Math.floor((i / 6) * W + 30 + r() * 30);
    const rad = 10 + r() * 6;
    foliage(img, [[cx - rad * 0.7, 232 - rad * 0.4, rad * 0.75], [cx + rad * 0.6, 232 - rad * 0.3, rad * 0.7], [cx, 230 - rad * 0.8, rad]], near, 970 + i, { wrap: true, light: [cx - 3, 226 - rad, rad * 1.4] });
  }
  for (let x = 0; x < W; x++) {
    const top = Math.round(238 - 3 * Math.sin((2 * Math.PI * 11 * x) / W) - (vnoise(x, 0, 5, 94) - 0.5) * 4);
    for (let y = top; y < H; y++) setPx(img, x, y, pick(near, (y === top ? 0.62 : 0.38) + (vnoise(x, y, 4, 95) - 0.5) * 0.25 - (y - top) * 0.01, x, y, 0.5));
  }
  return img;
}

// ---------------- registry ----------------

/** Every Thai-town drawing, keyed for sampleParts.ts. */
export const TOWN_DRAW = {
  noodleShop,
  miniMart,
  fruitStall,
  shophouse2f: shophouse({ floors: 2, wallHex: "#7fb79c", kind: "coffee", shutter: "open", tank: true, seed: 11 }),
  shophouse3f: shophouse({ floors: 3, wallHex: "#e2c27a", kind: "pharmacy", shutter: "half", seed: 23 }),
  shophouse3fGold: shophouse({ floors: 3, wallHex: "#e0907a", kind: "gold", shutter: "open", seed: 37 }),
  shophouse2fClosed: shophouse({ floors: 2, wallHex: "#8fb2d6", kind: "repair", shutter: "closed", seed: 41 }),
  thaiHouse,
  powerPole: powerPole({ transformer: true }),
  powerPoleEnd: powerPole({ end: true }),
  flagPole,
  signpostThai,
  pottedPlants,
  flowerBox,
  motorbike,
  streetDog,
  cat,
  pier,
  canalBoat,
  templeHill,
  tropicalMid,
} satisfies Record<string, () => RgbaImage>;
