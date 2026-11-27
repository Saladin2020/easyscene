/**
 * Town life sample set (DSK-5): closed twins of the shop buildings (rolling shutters, tarps, a hanging "ปิด" sign),
 * walk-in interiors where the seller stands BEHIND a counter (the counter is a front-layer prop), a train station
 * hall with a ticket window and a timetable board, a platform with rails, a side-view train, an airport terminal
 * with a check-in desk and a departures board, a passenger plane, and a ตลาดนัด market stall.
 * Procedural and original like the other samples (CC0). No sacred figures or script decoration.
 */
import { createImage, type RgbaImage } from "../shared/raster.js";
import { type Rgb, alphaAt, bayer, getPx, hash, markNight, maskEnd, maskStart, mix, pick, ramp, rect, rgb, selOutline, setPx, sphereLight } from "./pixelArt.js";
import { THAI_SIGNS, type ThaiSignKey } from "./thaiSignText.js";
import { TOWN_DRAW, shadeRamp } from "./sampleTown.js";
import { KAMPUNG_DRAW } from "./sampleKampung.js";

const TEAK = ramp("#2e1a12", "#4a2a18", "#6a3e22", "#8c5630", "#ad7140", "#cc9258");
const STEEL = ramp("#252a36", "#3e4554", "#5e6878", "#87919f", "#b4bcc6", "#e4e9ee");
const CONCRETE = ramp("#4c4650", "#6c6468", "#90877f", "#b4aa9a", "#d4cab4", "#eee6d0");
const RED = ramp("#4a1018", "#741a22", "#a4262c", "#cc3a34", "#e8604a", "#f88c6a");
const CLOTH = ramp("#9a8e98", "#c4bab8", "#e6ded6", "#fbf6ec");
const YELLOW = ramp("#8a4a14", "#b8701a", "#e0a224", "#f6c840", "#fde488", "#fff6c8");
const GREEN = ramp("#0e3a2a", "#145238", "#1e6e46", "#2e8c52", "#56ac62", "#8cca7c");
const ORANGE = ramp("#7a2a10", "#b44a14", "#e06e1c", "#f6923a", "#ffb866");
const BLUE = ramp("#141e48", "#1e2e6a", "#2c4590", "#4064b4", "#6a8ed0", "#a2c0e6");
const GLASS = ramp("#162438", "#22384e", "#345470", "#4f7896", "#7aa4be", "#b2d4e2");
const WARM = ramp("#9a5a20", "#d4902e", "#f6c45a", "#ffe69a", "#fff8dc");
const TARP = ramp("#142c5a", "#1e4282", "#2a5aa8", "#3c78c8", "#62a0e0", "#9ccaf2");
const RUST = ramp("#5a2a1a", "#844024", "#a85a30");
const INK = rgb("#16121c");
const SHADOW = rgb("#1a1630");
const WHITE = rgb("#ffffff");

// ---------------- primitives ----------------
const hline = (img: RgbaImage, x0: number, x1: number, y: number, c: Rgb) => { for (let x = x0; x <= x1; x++) setPx(img, x, y, c); };
const vline = (img: RgbaImage, x: number, y0: number, y1: number, c: Rgb) => { for (let y = y0; y <= y1; y++) setPx(img, x, y, c); };
function bevel(img: RgbaImage, x: number, y: number, w: number, h: number, r: Rgb[], body = Math.floor(r.length / 2)): void {
  rect(img, x, y, w, h, r[body]!);
  hline(img, x, x + w - 1, y, r[Math.min(r.length - 1, body + 2)]!);
  vline(img, x, y, y + h - 1, r[Math.min(r.length - 1, body + 1)]!);
  hline(img, x, x + w - 1, y + h - 1, r[Math.max(0, body - 2)]!);
  vline(img, x + w - 1, y + 1, y + h - 1, r[Math.max(0, body - 1)]!);
}
function shade(img: RgbaImage, x0: number, y0: number, w: number, h: number, amount: number, c: Rgb = SHADOW): void {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (alphaAt(img, x, y)) setPx(img, x, y, mix(getPx(img, x, y), c, amount));
}
export const signW = (key: ThaiSignKey) => THAI_SIGNS[key].width;
export const signH = (key: ThaiSignKey) => THAI_SIGNS[key].height;
function signText(img: RgbaImage, key: ThaiSignKey, x: number, y: number, c: Rgb, shadow?: Rgb): void {
  const s = THAI_SIGNS[key];
  const passes: Array<[number, number, Rgb]> = shadow ? [[1, 1, shadow], [0, 0, c]] : [[0, 0, c]];
  for (const [dx, dy, col] of passes) for (let yy = 0; yy < s.height; yy++) for (let xx = 0; xx < s.width; xx++) if (s.rows[yy]![xx] === "#") setPx(img, x + xx + dx, y + yy + dy, col);
}
/** Sign board with a centred word. */
function board(img: RgbaImage, key: ThaiSignKey, cx: number, y: number, pal: Rgb[], text: Rgb, padX = 6, padY = 3): { x: number; w: number; h: number } {
  const w = signW(key) + padX * 2;
  const h = signH(key) + padY * 2;
  const x = Math.round(cx - w / 2);
  bevel(img, x, y, w, h, pal, 2);
  signText(img, key, x + padX, y + padY, text, pal[0]);
  return { x, w, h };
}
function ball(img: RgbaImage, cx: number, cy: number, r: number, pal: Rgb[]): void {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
    const dx = x - cx, dy = y - cy;
    if (dx * dx + dy * dy > r * r + 0.3) continue;
    setPx(img, x, y, pick(pal, sphereLight(dx, dy, r + 0.5) * 1.25 - 0.18, x, y, 0.3));
  }
}
/** Hanging tube light / bulb: glows at night. */
function tubeLight(img: RgbaImage, x: number, y: number, w: number): void {
  vline(img, x + 3, y - 4, y - 1, STEEL[1]!);
  vline(img, x + w - 4, y - 4, y - 1, STEEL[1]!);
  hline(img, x, x + w - 1, y, STEEL[3]!);
  markNight(img, "light", () => { hline(img, x + 1, x + w - 2, y + 1, WARM[4]!); hline(img, x + 1, x + w - 2, y + 2, WARM[3]!); });
}
/** Wall clock (hands at ~10:10). */
function wallClock(img: RgbaImage, cx: number, cy: number, r: number): void {
  ball(img, cx, cy, r, CLOTH.concat([WHITE]));
  for (let a = 0; a < 12; a++) setPx(img, Math.round(cx + Math.cos((a * Math.PI) / 6) * (r - 1.5)), Math.round(cy + Math.sin((a * Math.PI) / 6) * (r - 1.5)), INK);
  for (let k = 0; k < r - 2; k++) setPx(img, Math.round(cx - k * 0.7), Math.round(cy - k * 0.5), INK);
  for (let k = 0; k < r - 1; k++) setPx(img, Math.round(cx + k * 0.6), Math.round(cy - k * 0.8), INK);
  const n = Math.ceil(2 * Math.PI * r * 1.5);
  for (let i = 0; i < n; i++) setPx(img, Math.round(cx + Math.cos((i / n) * Math.PI * 2) * r), Math.round(cy + Math.sin((i / n) * Math.PI * 2) * r), TEAK[1]!);
}
/** Small pixel figures of goods on a shelf. */
function goods(img: RgbaImage, x0: number, x1: number, baseY: number, seed: number, tall = 9): void {
  const cols = [RED, GREEN, YELLOW, BLUE, ORANGE, CLOTH];
  let x = x0;
  let k = 0;
  while (x < x1 - 2) {
    const kind = Math.floor(hash(k, baseY, seed) * 4);
    const pal = cols[Math.floor(hash(k, baseY, seed + 1) * cols.length)]!;
    const w = kind === 0 ? 5 : kind === 1 ? 3 : kind === 2 ? 6 : 4;
    const h = kind === 0 ? tall : kind === 1 ? tall - 1 : kind === 2 ? tall - 3 : tall - 2;
    if (x + w > x1) break;
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
      const yt = baseY - h + yy;
      if (kind === 1 && yy < 3 && (xx === 0 || xx === w - 1)) continue; // bottle neck
      const lit = xx === 0 ? 0.92 : xx === w - 1 ? 0.25 : 0.62;
      setPx(img, x + xx, yt, yy === 2 && kind !== 1 ? CLOTH[3]! : pick(pal, lit, x + xx, yt, 0.2));
    }
    x += w + 1;
    k++;
  }
}
function shelf(img: RgbaImage, x0: number, x1: number, y: number): void {
  hline(img, x0, x1, y, TEAK[4]!);
  hline(img, x0, x1, y + 1, TEAK[2]!);
  hline(img, x0 + 1, x1 - 1, y + 2, mix(getPx(img, x0 + 2, y + 2), SHADOW, 0.35));
}

// ---------------- closed twins ----------------
export interface ShopFront { x: number; y: number; w: number; h: number; kind: "shutter" | "tarp" }

/** Rolling steel shutter over the shop front, padlock at the bottom, drum box on top. Covers the lit interior (no glow at night). */
export function rollShutter(img: RgbaImage, r: Rect, seed: number): void {
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; x++) {
      const k = (y - r.y) % 3;
      const t = 0.82 - ((x - r.x) / r.w) * 0.3 - ((y - r.y) / r.h) * 0.12;
      setPx(img, x, y, k === 0 ? pick(STEEL, t + 0.12, x, y, 0.3) : k === 1 ? pick(STEEL, t - 0.08, x, y, 0.3) : STEEL[1]!);
    }
  }
  for (let x = r.x; x < r.x + r.w; x++) {
    if (hash(x, 3, seed) < 0.85) continue;
    const len = 5 + Math.floor(hash(x, 4, seed) * 16);
    for (let y = r.y + r.h - 2 - len; y < r.y + r.h - 2; y++) if (bayer(x, y) < 0.55) setPx(img, x, y, mix(getPx(img, x, y), RUST[1]!, 0.32));
  }
  for (let y = r.y - 3; y < r.y; y++) hline(img, r.x - 1, r.x + r.w, y, y === r.y - 3 ? STEEL[5]! : STEEL[3]!);
  hline(img, r.x, r.x + r.w - 1, r.y + r.h - 2, STEEL[0]!);
  hline(img, r.x, r.x + r.w - 1, r.y + r.h - 1, STEEL[2]!);
  for (const hx of [r.x + Math.round(r.w * 0.25), r.x + Math.round(r.w * 0.75)]) rect(img, hx - 2, r.y + r.h - 5, 4, 2, STEEL[5]!);
  const lx = r.x + Math.round(r.w / 2) - 2;
  rect(img, lx, r.y + r.h - 7, 4, 4, YELLOW[2]!);
  setPx(img, lx, r.y + r.h - 7, YELLOW[4]!);
  setPx(img, lx + 1, r.y + r.h - 8, STEEL[3]!);
  setPx(img, lx + 2, r.y + r.h - 8, STEEL[3]!);
}
type Rect = { x: number; y: number; w: number; h: number };

/** Blue market tarp tied down over goods: folds, a sagging hem with rope ties. */
export function tarpCover(img: RgbaImage, r: Rect, seed: number, pal: Rgb[] = TARP): void {
  for (let x = r.x; x < r.x + r.w; x++) {
    const sag = Math.round(2 * Math.sin((Math.PI * (x - r.x)) / Math.max(1, r.w - 1)));
    const top = r.y + Math.round(1.5 * Math.sin((x - r.x) * 0.45 + seed));
    for (let y = top; y < r.y + r.h + sag; y++) {
      const fold = Math.sin((x - r.x) * 0.55 + Math.sin(y * 0.15) * 1.2 + seed);
      const t = 0.55 + fold * 0.18 - ((y - r.y) / r.h) * 0.18 + (x === r.x ? 0.2 : 0);
      setPx(img, x, y, pick(pal, t, x, y, 0.5));
    }
    setPx(img, x, top, pal[5]!);
    setPx(img, x, r.y + r.h + sag - 1, pal[0]!);
  }
  for (const fx of [r.x + 6, r.x + Math.round(r.w / 2), r.x + r.w - 7]) {
    const yb = r.y + r.h + Math.round(2 * Math.sin((Math.PI * (fx - r.x)) / Math.max(1, r.w - 1)));
    vline(img, fx, yb - 1, yb + 3, rgb("#d8c89a"));
    setPx(img, fx - 1, yb - 1, rgb("#b8a878"));
    setPx(img, fx + 1, yb - 1, rgb("#b8a878"));
  }
}

/** Hanging "ปิด" (closed) / "เปิด" (open) plate on two strings. */
export function hangSign(img: RgbaImage, cx: number, y: number, open: boolean): void {
  const key: ThaiSignKey = open ? "open" : "closed";
  const pal = open ? GREEN : RED;
  const w = signW(key) + 8;
  const h = signH(key) + 4;
  const x = Math.round(cx - w / 2);
  for (const sx of [x + 2, x + w - 3]) { setPx(img, sx, y - 2, TEAK[1]!); setPx(img, sx + (sx < cx ? 1 : -1), y - 3, TEAK[1]!); }
  setPx(img, Math.round(cx), y - 4, STEEL[4]!);
  bevel(img, x, y, w, h, pal, 3);
  signText(img, key, x + 4, y + 2, WHITE, pal[0]);
}

/** Night-safe closed twin: draw the day art, then cover its front (shutter / tarp) and hang the sign. */
function closedTwin(base: () => RgbaImage, front: (img: RgbaImage) => ShopFront, seed: number, signAt?: (f: ShopFront) => [number, number]): () => RgbaImage {
  return () => {
    const img = base();
    const f = front(img);
    if (f.kind === "shutter") rollShutter(img, f, seed);
    else tarpCover(img, f, seed);
    const [sx, sy] = signAt ? signAt(f) : [f.x + Math.round(f.w / 2), f.y + 4];
    hangSign(img, sx, sy, false);
    return img;
  };
}

/** Where each shop's front is (the area the closed twin covers) + the counter line sellers stand behind. */
export const SHOP_FRONTS: Record<string, { front: (h: number) => ShopFront; counterTop?: number }> = {
  prop_bld_noodle_shop: { front: () => ({ x: 6, y: 35, w: 116, h: 73, kind: "shutter" }) },
  prop_bld_mini_mart: { front: () => ({ x: 6, y: 37, w: 132, h: 63, kind: "shutter" }) },
  prop_bld_shophouse_2f: { front: (h) => ({ x: 8, y: h - 54, w: 96, h: 51, kind: "shutter" }) },
  prop_bld_shophouse_3f: { front: (h) => ({ x: 8, y: h - 54, w: 96, h: 51, kind: "shutter" }) },
  prop_bld_shophouse_3f_gold: { front: (h) => ({ x: 8, y: h - 54, w: 96, h: 51, kind: "shutter" }) },
  prop_bld_shophouse_grocery: { front: (h) => ({ x: 8, y: h - 54, w: 96, h: 51, kind: "shutter" }) },
  prop_bld_roti_teashop: { front: () => ({ x: 6, y: 31, w: 116, h: 77, kind: "shutter" }) },
  prop_bld_fruit_stall: { front: () => ({ x: 3, y: 30, w: 90, h: 34, kind: "tarp" }), counterTop: 50 },
  prop_bld_halal_stall: { front: () => ({ x: 7, y: 29, w: 82, h: 36, kind: "tarp" }), counterTop: 46 },
  prop_bld_market_stall: { front: () => ({ x: 4, y: 34, w: 88, h: 30, kind: "tarp" }), counterTop: 52 },
};

const SHUT = {
  shophouse2f: TOWN_DRAW.shophouse2fShut,
  shophouse3f: TOWN_DRAW.shophouse3fShut,
  shophouse3fGold: TOWN_DRAW.shophouse3fGoldShut,
  shophouseGrocery: TOWN_DRAW.shophouseGroceryShut,
};
const withSign = (base: () => RgbaImage, at: (img: RgbaImage) => [number, number]) => () => { const img = base(); const [x, y] = at(img); hangSign(img, x, y, false); return img; };

// ---------------- ตลาดนัด market stall (seller stands behind the table) ----------------
function marketStall(): RgbaImage {
  const w = 96;
  const h = 80;
  const img = createImage(w, h);
  // poles
  for (const px of [6, 88]) for (let y = 14; y < h; y++) { setPx(img, px, y, STEEL[4]!); setPx(img, px + 1, y, STEEL[2]!); }
  // striped canopy (orange / cream) with a scalloped valance
  for (let x = 0; x < w; x++) {
    const s = Math.floor(x / 8) % 2 === 0 ? ORANGE : CLOTH;
    const dip = Math.round(2 * Math.sin((Math.PI * ((x % 8) + 0.5)) / 8));
    for (let y = 6; y <= 18 + dip; y++) setPx(img, x, y, pick(s, y === 18 + dip ? 0.1 : 0.85 - (y - 6) * 0.04, x, y, 0.3));
    setPx(img, x, 5, s === ORANGE ? ORANGE[4]! : CLOTH[3]!);
  }
  shade(img, 0, 20, w, 3, 0.2);
  // back rack: hanging bunches of bananas + garlic strings
  hline(img, 8, 87, 22, TEAK[3]!);
  for (let k = 0; k < 6; k++) {
    const bx = 14 + k * 12;
    vline(img, bx, 23, 25, TEAK[1]!);
    if (k % 2 === 0) for (let j = 0; j < 4; j++) for (let yy = 0; yy < 7; yy++) setPx(img, bx - 3 + j * 2, 26 + yy, pick(YELLOW, 0.75 - yy * 0.06 + (j === 0 ? 0.1 : 0), bx + j, yy, 0.3));
    else for (let j = 0; j < 4; j++) ball(img, bx, 27 + j * 3, 1.6, CLOTH.concat([WHITE]));
  }
  // table (counter): seller stands behind it; produce baskets on top
  const top = 52;
  for (let y = top; y < h - 2; y++) for (let x = 2; x < w - 2; x++) setPx(img, x, y, y === top ? TEAK[5]! : y === top + 1 ? TEAK[3]! : (y - top) % 6 === 5 ? TEAK[1]! : pick(TEAK, 0.62 - ((x - 2) / w) * 0.3, x, y, 0.3));
  // tablecloth skirt (green check)
  for (let y = top + 2; y < h - 2; y++) for (let x = 4; x < w - 4; x++) if (((x >> 2) + (y >> 2)) % 2 === 0) setPx(img, x, y, mix(getPx(img, x, y), GREEN[3]!, 0.55));
  for (const lx of [4, w - 6]) for (let y = h - 2; y < h; y++) { setPx(img, lx, y, TEAK[1]!); setPx(img, lx + 1, y, TEAK[0]!); }
  const basket = (cx: number, fill: (x: number, y: number) => Rgb | null) => {
    for (let y = top - 7; y < top; y++) for (let x = cx - 9; x <= cx + 9; x++) {
      const inBasket = y >= top - 4;
      const c = inBasket ? ((x + y) % 3 === 0 ? TEAK[2]! : TEAK[4]!) : fill(x - cx, y - (top - 7));
      if (c) setPx(img, x, y, c);
    }
  };
  basket(20, (dx, dy) => (Math.hypot(dx * 0.7, dy - 2) < 6 ? pick(RED, 0.7 - dy * 0.08 + (dx < 0 ? 0.15 : 0), dx, dy, 0.4) : null)); // chillies / tomatoes
  basket(48, (dx, dy) => (Math.hypot(dx * 0.6, dy - 2) < 6.5 ? pick(GREEN, 0.75 - dy * 0.07 + (dx < 0 ? 0.12 : 0), dx, dy, 0.4) : null)); // greens
  basket(76, (dx, dy) => (Math.hypot(dx * 0.7, dy - 2) < 6 ? pick(ORANGE, 0.8 - dy * 0.08, dx, dy, 0.4) : null)); // mangoes
  // price tags
  for (const tx of [14, 42, 70]) { rect(img, tx, top + 4, 10, 6, CLOTH[3]!); hline(img, tx + 2, tx + 7, top + 7, RED[3]!); }
  // a small "ตลาด" sign on the canopy
  board(img, "market", 48, 8, GREEN.slice(1), WHITE, 4, 1);
  selOutline(img, 0.4);
  return img;
}

// ---------------- interiors (480 × 224 back walls; the floor is the scene's tiles at y 224) ----------------
const IW = 480;
const IH = 224;

/** Doorway on the left edge showing the street outside (the way out). */
function doorway(img: RgbaImage, x0: number, w: number, top: number): void {
  for (let y = top; y < IH; y++) for (let x = x0; x < x0 + w; x++) {
    const sky = y < top + 26;
    setPx(img, x, y, sky ? pick(ramp("#7cb8e0", "#a8d4f0", "#d6eef8"), 0.4 + (y - top) / 40, x, y, 0.4) : y < IH - 14 ? pick(CONCRETE, 0.55 + hash(x >> 3, y >> 3, 5) * 0.2, x, y, 0.4) : CONCRETE[2]!);
  }
  for (let y = top - 4; y < IH; y++) { for (let k = 0; k < 4; k++) { setPx(img, x0 - 4 + k, y, TEAK[2 + (k === 0 ? 2 : 0)]!); setPx(img, x0 + w + k, y, TEAK[k === 3 ? 1 : 3]!); } }
  for (let y = top - 4; y < top; y++) hline(img, x0 - 4, x0 + w + 3, y, y === top - 4 ? TEAK[5]! : TEAK[3]!);
}

/** ร้านโชห่วย — Sino-Thai general store: shelves of goods, rice sacks, tube lights, a ceiling fan, a doorway out. */
function grocery(): RgbaImage {
  const img = createImage(IW, IH);
  const wall = shadeRamp("#e8d6a8");
  for (let y = 0; y < IH; y++) for (let x = 0; x < IW; x++) setPx(img, x, y, pick(wall, 0.55 + (hash(x >> 3, y >> 3, 9) - 0.5) * 0.06 - (y > 170 ? 0.08 : 0) - (y < 16 ? 0.12 : 0), x, y, 0.4));
  // dado tiles + skirting
  for (let y = 170; y < IH; y++) for (let x = 0; x < IW; x++) setPx(img, x, y, (x % 12 === 0 || (y - 170) % 12 === 0) ? CLOTH[1]! : pick(ramp("#5e8a7a", "#7aa696", "#9cc2b2"), 0.5 + ((x / 12) | 0) % 2 * 0.15, x, y, 0.3));
  hline(img, 0, IW - 1, 169, TEAK[4]!);
  hline(img, 0, IW - 1, 170, TEAK[2]!);
  // ceiling beam + tube lights + fan
  for (let y = 0; y < 10; y++) hline(img, 0, IW - 1, y, pick(TEAK, 0.5 - y * 0.03, 0, y, 0.2));
  for (const lx of [70, 200, 330]) tubeLight(img, lx, 18, 40);
  vline(img, 266, 10, 22, STEEL[2]!);
  ball(img, 266, 25, 3, STEEL);
  for (const [dx, dy] of [[-1, 0], [1, 0]] as const) for (let k = 4; k < 16; k++) setPx(img, 266 + dx * k, 25 + dy, k > 13 ? STEEL[1]! : STEEL[4]!);
  // the way out
  doorway(img, 12, 44, 112);
  // tall shelves behind the counter (x 140..440)
  for (const [x0, x1] of [[96, 236], [252, 420]] as const) {
    for (let y = 40; y < 170; y++) { setPx(img, x0, y, TEAK[4]!); setPx(img, x0 + 1, y, TEAK[2]!); setPx(img, x1, y, TEAK[3]!); setPx(img, x1 - 1, y, TEAK[1]!); }
    shade(img, x0 + 2, 40, x1 - x0 - 3, 130, 0.12);
    for (let s = 0; s < 5; s++) {
      const y = 64 + s * 24;
      goods(img, x0 + 4, x1 - 3, y - 1, x0 * 7 + s, s === 4 ? 12 : 10);
      shelf(img, x0, x1, y);
    }
  }
  // wall calendar (numbers grid) + a clock between the shelves
  rect(img, 440, 52, 28, 36, CLOTH[3]!);
  rect(img, 440, 52, 28, 9, RED[3]!);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) rect(img, 443 + c * 5, 64 + r * 6, 3, 3, r === 2 && c === 3 ? RED[3]! : STEEL[2]!);
  wallClock(img, 244, 52, 7);
  // rice sacks + a water jar on the floor by the door
  for (const [sx, sc] of [[66, CLOTH], [80, CLOTH], [72, CLOTH]] as const) {
    const sy = sx === 72 ? 180 : 196;
    for (let y = sy; y < sy + 26; y++) for (let x = sx - 8; x <= sx + 8; x++) if (Math.abs(x - sx) < 8 - Math.max(0, sy + 3 - y)) setPx(img, x, y, pick(sc, 0.75 - ((x - sx + 8) / 16) * 0.5, x, y, 0.4));
    hline(img, sx - 4, sx + 4, sy + 10, GREEN[3]!);
  }
  ball(img, 452, 206, 14, ramp("#3a1a12", "#5e2c18", "#8a4422", "#b06030", "#d08850"));
  rect(img, 444, 192, 16, 3, TEAK[1]!);
  // signboard above the shelves
  board(img, "grocery", 258, 14, RED.slice(1), YELLOW[4]!, 8, 3);
  return img;
}

/** Counter front (front layer, 176 × 40): glass case, candy jars, a cash register; the seller stands behind it. */
function groceryCounter(): RgbaImage {
  const w = 176;
  const h = 26;
  const img = createImage(w, h);
  // register + candy jars sit on the counter top (y 8)
  for (let y = 0; y < 8; y++) for (let x = 120; x < 146; x++) setPx(img, x, y, y < 2 ? STEEL[4]! : pick(STEEL, 0.55 - (x - 120) / 60, x, y, 0.3));
  rect(img, 124, 3, 6, 2, rgb("#1e3a2a"));
  markNight(img, "light", () => hline(img, 125, 128, 4, rgb("#7cf0a0")));
  for (const [jx, pal] of [[20, RED], [34, YELLOW], [48, GREEN]] as const) {
    for (let y = 1; y < 8; y++) for (let x = jx - 4; x <= jx + 4; x++) setPx(img, x, y, (x === jx - 4 || x === jx + 4) ? GLASS[4]! : y < 2 ? STEEL[4]! : pick(pal, 0.4 + hash(x, y, jx) * 0.5, x, y, 0.5));
  }
  bevel(img, 0, 8, w, 3, TEAK, 4);
  for (let y = 11; y < 21; y++) for (let x = 0; x < w; x++) {
    const frame = x < 3 || x >= w - 3 || (x % 44 < 2);
    setPx(img, x, y, frame ? TEAK[3]! : mix(GLASS[4]!, CLOTH[2]!, 0.35));
  }
  goods(img, 4, w - 4, 20, 77, 7);
  for (let i = 0; i < 18; i++) setPx(img, 8 + i * 9, 12 + (i % 2), WHITE);
  for (let y = 21; y < h; y++) for (let x = 0; x < w; x++) setPx(img, x, y, y === 21 ? TEAK[5]! : pick(TEAK, 0.45 - (y - 21) * 0.03, x, y, 0.3));
  selOutline(img, 0.4);
  return img;
}

/** สถานีรถไฟ — station hall: ticket office with windows, timetable board, clock, benches, the door to the platform. */
function stationHall(): RgbaImage {
  const img = createImage(IW, IH);
  const upper = shadeRamp("#e6d8b8");
  for (let y = 0; y < IH; y++) for (let x = 0; x < IW; x++) setPx(img, x, y, pick(upper, 0.55 + (hash(x >> 3, y >> 3, 11) - 0.5) * 0.05, x, y, 0.4));
  // blue-and-white tiled dado
  for (let y = 150; y < IH; y++) for (let x = 0; x < IW; x++) setPx(img, x, y, (x % 10 === 0 || (y - 150) % 10 === 0) ? CLOTH[2]! : ((x / 10 + (y - 150) / 10) | 0) % 2 ? BLUE[3]! : CLOTH[3]!);
  hline(img, 0, IW - 1, 149, TEAK[4]!);
  // arched high windows (light comes in)
  for (const wx of [40, 340]) {
    const tok = maskStart(img, "window");
    for (let y = 30; y < 96; y++) for (let x = wx; x < wx + 44; x++) {
      const cx = wx + 22;
      if (y < 52 && Math.hypot(x - cx, y - 52) > 22) continue;
      const mull = x === cx || y === 70;
      setPx(img, x, y, mull ? TEAK[2]! : pick(GLASS, 0.75 - (y - 30) / 140, x, y, 0.4));
    }
    maskEnd(tok);
  }
  // ticket office (booth wall, the clerk window is cut out: the clerk stands behind the counter prop)
  const bx = 120;
  const bw = 150;
  for (let y = 52; y < IH; y++) for (let x = bx; x < bx + bw; x++) setPx(img, x, y, pick(TEAK, 0.55 - ((x - bx) / bw) * 0.2 + (y < 58 ? 0.25 : 0), x, y, 0.3));
  // booth interior visible through the window (shelves with ticket racks)
  const wx0 = bx + 25;
  const wy0 = 140;
  for (let y = wy0; y < wy0 + 66; y++) for (let x = wx0; x < wx0 + 100; x++) setPx(img, x, y, pick(ramp("#5a6a6a", "#768a86", "#94aaa2"), 0.5 - (y - wy0) / 200, x, y, 0.4));
  markNight(img, "interior", () => { for (let y = wy0; y < wy0 + 40; y++) for (let x = wx0; x < wx0 + 100; x++) setPx(img, x, y, getPx(img, x, y)); });
  for (let s = 0; s < 2; s++) { shelf(img, wx0 + 4, wx0 + 96, wy0 + 14 + s * 14); for (let k = 0; k < 12; k++) rect(img, wx0 + 8 + k * 7, wy0 + 8 + s * 14, 4, 6, [RED[4]!, YELLOW[4]!, GREEN[4]!, BLUE[4]!][(k + s) % 4]!); }
  board(img, "ticket", bx + bw / 2, 112, BLUE.slice(1), WHITE, 10, 4);
  // timetable board (black, header only: the game draws the rows)
  const tx = 296;
  const ty = 104;
  bevel(img, tx - 4, ty - 4, 168, 104, TEAK, 3);
  rect(img, tx, ty, 160, 96, rgb("#14181e"));
  for (let y = ty + 14; y < ty + 96; y += 10) hline(img, tx + 2, tx + 157, y, rgb("#22282e"));
  signText(img, "timetable", tx + 80 - Math.round(signW("timetable") / 2), ty + 2, YELLOW[3]!);
  markNight(img, "light", () => hline(img, tx + 2, tx + 157, ty + 13, YELLOW[1]!));
  wallClock(img, 240, 24, 10);
  board(img, "station", 240, 4, RED.slice(1), WHITE, 10, 3);
  // door to the platform (right edge) with a "ชานชาลา" sign + arrow
  for (let y = 100; y < IH; y++) for (let x = 432; x < 472; x++) setPx(img, x, y, y < 126 ? pick(ramp("#86b8d8", "#b2d8ee"), 0.5, x, y, 0.4) : pick(CONCRETE, 0.4, x, y, 0.4));
  for (let y = 96; y < IH; y++) { setPx(img, 430, y, TEAK[4]!); setPx(img, 431, y, TEAK[2]!); setPx(img, 472, y, TEAK[3]!); setPx(img, 473, y, TEAK[1]!); }
  const ps = board(img, "platform", 451, 78, GREEN.slice(1), WHITE, 3, 2);
  for (let k = 0; k < 4; k++) vline(img, 449 + k, ps.h + 80 + k, ps.h + 86 - k, YELLOW[4]!);
  // benches
  for (const bx2 of [24, 470 - 168]) if (bx2 < 100) for (let k = 0; k < 2; k++) { bevel(img, bx2 + k * 2, 186 - k * 14, 60, 4, TEAK, 3); for (const lx of [bx2 + 4, bx2 + 54]) vline(img, lx, 190, IH - 1, STEEL[1]!); }
  // tube lights
  for (const lx of [20, 180, 340]) tubeLight(img, lx, 14, 36);
  return img;
}

/** Ticket counter front (128 × 44): ledge + lower panel; the clerk's head and shoulders show above it. */
function stationCounter(): RgbaImage {
  const w = 128;
  const h = 30;
  const img = createImage(w, h);
  // clear glass partition (edges + glare only) with a speaking hole
  for (let y = 0; y < 12; y++) {
    setPx(img, 0, y, TEAK[3]!); setPx(img, 1, y, TEAK[2]!); setPx(img, w - 1, y, TEAK[1]!); setPx(img, w - 2, y, TEAK[2]!);
    if (y % 4 === 1) for (let x = 2; x < w - 2; x++) if ((x + y * 2) % 29 < 2) setPx(img, x, y, GLASS[5]!, 150);
  }
  hline(img, 0, w - 1, 0, TEAK[4]!);
  for (let k = 0; k < 6; k++) setPx(img, 60 + k, 5, GLASS[3]!, 200);
  bevel(img, 0, 12, w, 4, TEAK, 4);
  rect(img, 50, 12, 28, 2, STEEL[1]!);
  for (let y = 16; y < h; y++) for (let x = 0; x < w; x++) setPx(img, x, y, (x % 32 < 2 || y === 16) ? TEAK[2]! : pick(TEAK, 0.6 - ((x % 32) / 32) * 0.2 - (y - 16) * 0.01, x, y, 0.3));
  selOutline(img, 0.35);
  return img;
}

/** Platform: canopy roof on posts, a hanging "ชานชาลา" sign + clock, a small timetable board (480 × 224, transparent sky). */
function platformCanopy(): RgbaImage {
  const img = createImage(IW, IH);
  // roof
  for (let y = 18; y < 34; y++) for (let x = 0; x < IW; x++) setPx(img, x, y, y < 22 ? pick(RED, 0.75 - (y - 18) * 0.08, x, y, 0.3) : y === 33 ? TEAK[1]! : pick(CLOTH, 0.6 - (y - 22) * 0.03, x, y, 0.3));
  for (let x = 0; x < IW; x += 6) vline(img, x, 18, 21, RED[1]!);
  // posts with brackets
  for (const px of [40, 200, 360]) {
    for (let y = 34; y < IH; y++) { setPx(img, px, y, STEEL[4]!); setPx(img, px + 1, y, STEEL[3]!); setPx(img, px + 2, y, STEEL[1]!); }
    for (let k = 0; k < 10; k++) { setPx(img, px - k, 34 + k, STEEL[2]!); setPx(img, px + 2 + k, 34 + k, STEEL[2]!); }
  }
  // hanging sign + clock
  vline(img, 272, 34, 40, STEEL[1]!);
  vline(img, 320, 34, 40, STEEL[1]!);
  board(img, "platform", 296, 40, BLUE.slice(1), WHITE, 6, 2);
  wallClock(img, 120, 46, 8);
  vline(img, 120, 34, 37, STEEL[1]!);
  // lamps under the roof
  for (const lx of [100, 260, 420]) tubeLight(img, lx - 14, 36, 28);
  // small timetable board on a stand
  bevel(img, 412, 150, 56, 44, TEAK, 3);
  rect(img, 416, 154, 48, 36, rgb("#14181e"));
  signText(img, "timetable", 440 - Math.round(signW("timetable") / 2), 155, YELLOW[3]!);
  for (const lx of [418, 460]) vline(img, lx, 194, IH - 1, STEEL[1]!);
  // yellow safety line hint at the platform edge
  for (let x = 0; x < IW; x++) setPx(img, x, IH - 1, (x >> 2) % 2 ? YELLOW[3]! : YELLOW[2]!);
  return img;
}

/** Rail track seen side-on (front of the train's wheels): ballast, sleepers, rail. 480 × 16. */
function railTrack(): RgbaImage {
  const img = createImage(IW, 16);
  for (let y = 6; y < 16; y++) for (let x = 0; x < IW; x++) setPx(img, x, y, pick(ramp("#4a4440", "#6a625a", "#8a8278", "#aaa296"), 0.3 + hash(x, y, 3) * 0.5, x, y, 0.6));
  for (let x = 0; x < IW; x += 12) rect(img, x, 6, 9, 3, TEAK[2]!);
  hline(img, 0, IW - 1, 3, STEEL[5]!);
  hline(img, 0, IW - 1, 4, STEEL[3]!);
  hline(img, 0, IW - 1, 5, STEEL[1]!);
  return img;
}

/** Side-view diesel locomotive (Thai blue / cream livery). 128 × 56. */
function trainLoco(): RgbaImage {
  const w = 128;
  const h = 56;
  const img = createImage(w, h);
  const body = BLUE;
  for (let y = 8; y < 44; y++) for (let x = 2; x < w - 2; x++) {
    if (x < 14 && y < 8 + (14 - x)) continue; // sloped nose
    const stripe = y >= 28 && y < 33;
    setPx(img, x, y, stripe ? pick(CLOTH, 0.8, x, y, 0.2) : y < 12 ? body[4]! : pick(body, 0.62 - (y - 8) / 120, x, y, 0.3));
  }
  // cab windows (front) + side windows, lit at night
  markNight(img, "window-lit", () => { for (let y = 14; y < 24; y++) for (let x = 8; x < 24; x++) if (!(x < 14 && y < 8 + (14 - x) + 6)) setPx(img, x, y, pick(GLASS, 0.6 - (y - 14) / 20, x, y, 0.3)); });
  for (const wx of [40, 60, 80, 100]) markNight(img, "window", () => { for (let y = 15; y < 23; y++) for (let x = wx; x < wx + 12; x++) setPx(img, x, y, pick(GLASS, 0.55, x, y, 0.3)); });
  // headlight
  markNight(img, "light", () => ball(img, 5, 36, 2, WARM));
  // roof gear + horn
  rect(img, 30, 4, 60, 4, STEEL[3]!);
  rect(img, 96, 2, 14, 6, STEEL[2]!);
  // grille + number
  for (let y = 34; y < 42; y += 2) hline(img, 50, 90, y, body[1]!);
  rect(img, 108, 34, 12, 6, YELLOW[3]!);
  // bogies + wheels
  for (const bx of [18, 92]) {
    rect(img, bx - 2, 44, 30, 4, STEEL[1]!);
    for (const wx of [bx + 4, bx + 20]) ball(img, wx, 50, 5, STEEL);
  }
  rect(img, 0, 40, 4, 4, STEEL[2]!);
  selOutline(img, 0.4);
  return img;
}

/** Side-view passenger car (cream + red band), doors in the middle. 160 × 56. */
function trainCar(): RgbaImage {
  const w = 160;
  const h = 56;
  const img = createImage(w, h);
  for (let y = 8; y < 44; y++) for (let x = 0; x < w; x++) {
    const band = y >= 30 && y < 35;
    setPx(img, x, y, band ? RED[3]! : y < 11 ? STEEL[3]! : pick(CLOTH, 0.7 - (y - 8) / 90, x, y, 0.3));
  }
  for (let y = 4; y < 8; y++) hline(img, 4, w - 5, y, STEEL[2 + (y === 4 ? 1 : 0)]!);
  for (const wx of [8, 26, 44, 100, 118, 136]) markNight(img, "window-lit", () => { for (let y = 14; y < 26; y++) for (let x = wx; x < wx + 14; x++) setPx(img, x, y, x === wx + 7 ? CLOTH[1]! : pick(GLASS, 0.5 - (y - 14) / 30, x, y, 0.3)); });
  // doors
  for (const dx of [64, 80]) { for (let y = 12; y < 42; y++) for (let x = dx; x < dx + 14; x++) setPx(img, x, y, (x === dx || x === dx + 13) ? STEEL[1]! : y < 26 ? pick(GLASS, 0.5, x, y, 0.3) : STEEL[3]!); }
  for (const bx of [12, 118]) {
    rect(img, bx - 2, 44, 32, 4, STEEL[1]!);
    for (const wx of [bx + 4, bx + 22]) ball(img, wx, 50, 5, STEEL);
  }
  selOutline(img, 0.4);
  return img;
}

/** ท่าอากาศยาน — terminal hall: curtain wall onto the apron (a parked plane outside), departures board, check-in backdrop. */
function terminalHall(): RgbaImage {
  const img = createImage(IW, IH);
  const wall = shadeRamp("#d8dde4");
  for (let y = 0; y < IH; y++) for (let x = 0; x < IW; x++) setPx(img, x, y, pick(wall, 0.6 - y / 900, x, y, 0.4));
  // curtain wall (glass) on the right showing the runway and a plane
  const gx = 290;
  const tok = maskStart(img, "window");
  for (let y = 30; y < 170; y++) for (let x = gx; x < IW - 8; x++) {
    const sky = y < 128;
    let c: Rgb = sky ? pick(ramp("#6ea6d8", "#94c2ea", "#c4e0f4"), (y - 30) / 110, x, y, 0.4) : y < 140 ? pick(ramp("#5a5a62", "#74747c"), 0.5, x, y, 0.4) : pick(ramp("#6f9a5a", "#8ab874"), 0.5, x, y, 0.4);
    if (y === 133 && (x >> 3) % 2 === 0) c = WHITE;
    setPx(img, x, y, c);
  }
  maskEnd(tok);
  stampPlane(img, gx + 40, 104, 0.6);
  for (let x = gx; x < IW - 8; x += 36) vline(img, x, 30, 169, STEEL[2]!);
  hline(img, gx, IW - 9, 30, STEEL[3]!);
  hline(img, gx, IW - 9, 100, STEEL[2]!);
  // check-in backdrop with a stylised bird logo + "เช็กอิน"
  bevel(img, 40, 56, 200, 100, BLUE, 3);
  board(img, "checkin", 140, 64, CLOTH.concat([WHITE]), BLUE[1]!, 8, 3);
  for (let k = 0; k < 14; k++) { setPx(img, 120 + k, 104 - Math.round(Math.sin(k / 4.4) * 8), YELLOW[4]!); setPx(img, 120 + k, 105 - Math.round(Math.sin(k / 4.4) * 8), YELLOW[3]!); }
  for (let k = 0; k < 10; k++) setPx(img, 134 + k, 96 + Math.round(k * 0.4), YELLOW[3]!);
  // departures board (black; rows drawn by the game)
  const bx = 60;
  const by = 0 + 8;
  bevel(img, bx - 4, by - 4 + 2, 168, 46, STEEL, 2);
  rect(img, bx, by + 2, 160, 38, rgb("#101418"));
  signText(img, "airport", bx + 80 - Math.round(signW("airport") / 2), by + 3, YELLOW[3]!);
  markNight(img, "light", () => hline(img, bx + 2, bx + 157, by + 14, YELLOW[1]!));
  // floor-level: queue posts + plants
  for (const qx of [30, 250]) { vline(img, qx, 190, IH - 1, STEEL[4]!); ball(img, qx, 189, 2, STEEL); }
  for (let x = 31; x < 250; x++) if (x % 3) setPx(img, x, 194, RED[3]!);
  for (const px of [270, 470]) { for (let y = 196; y < IH; y++) for (let x = px - 6; x <= px + 6; x++) setPx(img, x, y, TEAK[2]!); for (let k = 0; k < 7; k++) ball(img, px - 6 + ((k * 5) % 13), 186 - ((k * 7) % 14), 4, GREEN); }
  for (const lx of [30, 180]) tubeLight(img, lx, 4, 40);
  return img;
}

/** Check-in desk front (160 × 40) with a baggage scale. */
function checkinDesk(): RgbaImage {
  const w = 160;
  const h = 24;
  const img = createImage(w, h);
  for (let y = 0; y < 6; y++) for (let x = 120; x < 140; x++) setPx(img, x, y, y === 0 ? STEEL[5]! : STEEL[3]!);
  markNight(img, "light", () => rect(img, 124, 2, 6, 2, rgb("#7cf0a0")));
  bevel(img, 0, 6, w, 4, CLOTH.concat([WHITE]), 3);
  for (let y = 10; y < h; y++) for (let x = 0; x < w; x++) setPx(img, x, y, x % 40 < 2 ? STEEL[2]! : pick(BLUE, 0.55 - (y - 10) * 0.01 - (x % 40) / 160, x, y, 0.3));
  for (let y = 14; y < h; y++) for (let x = w - 30; x < w; x++) setPx(img, x, y, y === 14 ? STEEL[4]! : STEEL[2]!);
  selOutline(img, 0.35);
  return img;
}

/** Passenger plane, side view (white, blue belly stripe, orange tail). Drawn into `img` at (x, y) = nose-left top, scaled by k. */
function stampPlane(img: RgbaImage, x0: number, y0: number, k: number): void {
  const L = Math.round(150 * k);
  const H2 = Math.round(18 * k);
  const cy = y0 + H2;
  for (let x = 0; x < L; x++) {
    const t = x / L;
    const half = t < 0.08 ? Math.sqrt(t / 0.08) * H2 * 0.5 : t > 0.82 ? H2 * 0.5 * (1 - (t - 0.82) / 0.3) : H2 * 0.5;
    for (let y = -Math.round(half); y <= Math.round(half); y++) {
      const yy = cy + y;
      const stripe = y > half * 0.25 && y < half * 0.55;
      setPx(img, x0 + x, yy, stripe ? BLUE[3]! : pick(CLOTH.concat([WHITE]), 0.9 - (y + half) / (2 * half + 1) * 0.5, x0 + x, yy, 0.3));
    }
    if (x > L * 0.12 && x < L * 0.78 && x % Math.max(3, Math.round(6 * k)) === 0) markNight(img, "window", () => setPx(img, x0 + x, cy - Math.round(H2 * 0.15), GLASS[2]!));
  }
  // tail fin
  for (let y = 0; y < Math.round(26 * k); y++) for (let x = 0; x < Math.round(22 * k) - y * 0.5; x++) setPx(img, x0 + L - Math.round(26 * k) + x + Math.round(y * 0.4), cy - Math.round(H2 * 0.4) - y, pick(ORANGE, 0.7 - y * 0.02, x, y, 0.3));
  // wing + engine
  for (let k2 = 0; k2 < Math.round(40 * k); k2++) setPx(img, x0 + Math.round(L * 0.45) + k2, cy + Math.round(H2 * 0.35) + Math.round(k2 * 0.15), STEEL[3]!);
  for (let y = 0; y < Math.round(7 * k); y++) for (let x = 0; x < Math.round(18 * k); x++) setPx(img, x0 + Math.round(L * 0.48) + x, cy + Math.round(H2 * 0.5) + y, x < 2 ? STEEL[1]! : STEEL[4]!);
  // cockpit
  for (let x = 0; x < Math.round(8 * k); x++) setPx(img, x0 + Math.round(4 * k) + x, cy - Math.round(H2 * 0.25), GLASS[1]!);
}

/** Plane prop 160 × 56 (wheels down on the ground line). */
function planeSide(): RgbaImage {
  const img = createImage(160, 56);
  stampPlane(img, 4, 14, 1);
  for (const wx of [40, 104]) { vline(img, wx, 44, 50, STEEL[1]!); ball(img, wx, 52, 3, STEEL); }
  selOutline(img, 0.35);
  return img;
}

/** Small plane silhouette for the sky (48 × 16), wheels up. */
function planeSky(): RgbaImage {
  const img = createImage(48, 16);
  stampPlane(img, 1, 1, 0.31);
  return img;
}

/** Control tower (48 × 160). */
function controlTower(): RgbaImage {
  const w = 48;
  const h = 160;
  const img = createImage(w, h);
  for (let y = 40; y < h; y++) for (let x = 14; x < 34; x++) setPx(img, x, y, pick(CONCRETE, 0.8 - (x - 14) / 30, x, y, 0.3));
  for (let y = 14; y < 40; y++) for (let x = 4; x < 44; x++) {
    const glass = y > 18 && y < 34;
    setPx(img, x, y, glass ? pick(GLASS, 0.6 - (y - 18) / 30, x, y, 0.3) : pick(CONCRETE, 0.85 - (x - 4) / 60, x, y, 0.3));
  }
  markNight(img, "window-lit", () => { for (let y = 20; y < 33; y++) for (let x = 6; x < 42; x++) if ((x - 6) % 9) setPx(img, x, y, getPx(img, x, y)); });
  for (let x = 2; x < 46; x++) { setPx(img, x, 12, STEEL[4]!); setPx(img, x, 13, STEEL[2]!); }
  vline(img, 24, 2, 11, STEEL[2]!);
  markNight(img, "light", () => { setPx(img, 24, 1, RED[4]!); setPx(img, 23, 1, RED[3]!); });
  for (let y = 60; y < h; y += 24) for (let x = 18; x < 30; x++) if ((x & 1) === 0) markNight(img, "window", () => setPx(img, x, y, GLASS[3]!));
  selOutline(img, 0.4);
  return img;
}

/** Terminal building facade for the airport street (224 × 112) with the "ท่าอากาศยาน" sign. */
function terminalFacade(): RgbaImage {
  const w = 224;
  const h = 112;
  const img = createImage(w, h);
  for (let y = 18; y < h; y++) for (let x = 0; x < w; x++) setPx(img, x, y, pick(CONCRETE, 0.85 - y / 400 - (x / w) * 0.1, x, y, 0.3));
  // wave roof
  for (let x = 0; x < w; x++) { const top = 10 + Math.round(6 * Math.sin((x / w) * Math.PI)); for (let y = 18 - (top - 10) - 6; y < 20; y++) setPx(img, x, y, pick(STEEL, 0.8 - (y - 4) / 30, x, y, 0.3)); }
  // glass front
  for (let y = 40; y < h - 4; y++) for (let x = 8; x < w - 8; x++) setPx(img, x, y, (x - 8) % 26 === 0 ? STEEL[2]! : pick(GLASS, 0.62 - (y - 40) / 140, x, y, 0.3));
  markNight(img, "window-lit", () => { for (let y = 40; y < h - 4; y++) for (let x = 9; x < w - 8; x++) if ((x - 8) % 26) setPx(img, x, y, getPx(img, x, y)); });
  board(img, "airport", w / 2, 22, BLUE.slice(1), WHITE, 10, 3);
  // doors
  for (let y = 72; y < h - 4; y++) for (let x = 96; x < 128; x++) setPx(img, x, y, x === 111 || x === 112 ? STEEL[1]! : pick(GLASS, 0.75, x, y, 0.3));
  hline(img, 0, w - 1, h - 4, CONCRETE[4]!);
  for (let y = h - 3; y < h; y++) hline(img, 0, w - 1, y, CONCRETE[2]!);
  selOutline(img, 0.4);
  return img;
}

/** Runway markings strip (front, 480 × 8): centre-line dashes + threshold bars. */
function runwayMarks(): RgbaImage {
  const img = createImage(IW, 8);
  for (let x = 0; x < IW; x++) if ((x >> 4) % 2 === 0) { setPx(img, x, 3, WHITE); setPx(img, x, 4, CLOTH[2]!); }
  return img;
}

export const TOWN_LIFE_DRAW = {
  // closed twins
  noodleShopClosed: closedTwin(TOWN_DRAW.noodleShop, (img) => SHOP_FRONTS.prop_bld_noodle_shop!.front(img.height), 5),
  miniMartClosed: closedTwin(TOWN_DRAW.miniMart, (img) => SHOP_FRONTS.prop_bld_mini_mart!.front(img.height), 6),
  fruitStallClosed: closedTwin(TOWN_DRAW.fruitStall, (img) => SHOP_FRONTS.prop_bld_fruit_stall!.front(img.height), 7, (f) => [f.x + f.w / 2, f.y + 8]),
  shophouse2fClosedSign: withSign(SHUT.shophouse2f, (img) => [56, img.height - 48]),
  shophouse3fClosedSign: withSign(SHUT.shophouse3f, (img) => [56, img.height - 48]),
  shophouse3fGoldClosedSign: withSign(SHUT.shophouse3fGold, (img) => [56, img.height - 48]),
  shophouseGroceryClosedSign: withSign(SHUT.shophouseGrocery, (img) => [56, img.height - 48]),
  rotiTeashopClosed: closedTwin(KAMPUNG_DRAW.rotiTeaShop, (img) => SHOP_FRONTS.prop_bld_roti_teashop!.front(img.height), 8),
  halalStallClosed: closedTwin(KAMPUNG_DRAW.halalStall, (img) => SHOP_FRONTS.prop_bld_halal_stall!.front(img.height), 9, (f) => [f.x + f.w / 2, f.y + 8]),
  marketStall,
  marketStallClosed: closedTwin(marketStall, (img) => SHOP_FRONTS.prop_bld_market_stall!.front(img.height), 10, (f) => [f.x + f.w / 2, f.y + 6]),
  // interiors + transit
  grocery,
  groceryCounter,
  stationHall,
  stationCounter,
  platformCanopy,
  railTrack,
  trainLoco,
  trainCar,
  terminalHall,
  checkinDesk,
  planeSide,
  planeSky,
  controlTower,
  terminalFacade,
  runwayMarks,
} satisfies Record<string, () => RgbaImage>;
