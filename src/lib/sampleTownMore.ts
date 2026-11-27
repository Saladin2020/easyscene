/**
 * More town assets (DSK-6), side view: vehicles (pickup, tuk-tuk, scooter, songthaew, bus, truck, taxi), house styles
 * (Thai wooden stilt house, modern house, Malay kampung house, Chinese shophouse, two shophouse variants), civic
 * buildings (hospital, police station, post office, bank, district office, company office) and a ตลาดนัดมือสอง
 * (second-hand flea market): clothes stalls with shirts on rails, a junk stall, clothes racks, a banner.
 * Procedural and original like the other samples (CC0). Signs are Thai words; no sacred figures, emblems or script decoration.
 * Every vehicle is drawn facing RIGHT (its part has `facing: "right"`).
 */
import { createImage, type RgbaImage } from "../shared/raster.js";
import { type Rgb, alphaAt, getPx, hash, markNight, mix, pick, ramp, rect, rgb, selOutline, setPx, sphereLight } from "./pixelArt.js";
import { THAI_SIGNS, type ThaiSignKey } from "./thaiSignText.js";
import { shadeRamp } from "./sampleTown.js";

const STEEL = ramp("#252a36", "#3e4554", "#5e6878", "#87919f", "#b4bcc6", "#e4e9ee");
const CONCRETE = ramp("#4c4650", "#6c6468", "#90877f", "#b4aa9a", "#d4cab4", "#eee6d0");
const WHITEWALL = ramp("#8a8c96", "#a8acb4", "#c8ccd0", "#e2e4e4", "#f2f2ee", "#ffffff");
const TEAK = ramp("#2e1a12", "#4a2a18", "#6a3e22", "#8c5630", "#ad7140", "#cc9258");
const GLASS = ramp("#162438", "#22384e", "#345470", "#4f7896", "#7aa4be", "#b2d4e2");
const RED = ramp("#4a1018", "#741a22", "#a4262c", "#cc3a34", "#e8604a", "#f88c6a");
const ORANGE = ramp("#7a2a10", "#b44a14", "#e06e1c", "#f6923a", "#ffb866", "#ffd8a8");
const YELLOW = ramp("#8a4a14", "#b8701a", "#e0a224", "#f6c840", "#fde488", "#fff6c8");
const GREEN = ramp("#0e3a2a", "#145238", "#1e6e46", "#2e8c52", "#56ac62", "#8cca7c");
const BLUE = ramp("#141e48", "#1e2e6a", "#2c4590", "#4064b4", "#6a8ed0", "#a2c0e6");
const NAVY = ramp("#0c1226", "#141e3c", "#1e2c54", "#2a3c6c", "#3c5288", "#5a70a4");
const TEAL = shadeRamp("#2a9a8e");
const PINK = shadeRamp("#e0608a");
const ROOF_TILE = shadeRamp("#b0442c");
const ZINC = ramp("#3c4048", "#5a606a", "#7c838c", "#9ea6ae", "#c0c6cc", "#e0e4e8");
const WARM = ramp("#9a5a20", "#d4902e", "#f6c45a", "#ffe69a", "#fff8dc");
const TARP = ramp("#142c5a", "#1e4282", "#2a5aa8", "#3c78c8", "#62a0e0", "#9ccaf2");
const INK = rgb("#16121c");
const SHADOW = rgb("#1a1630");
const WHITE = rgb("#ffffff");
const TIRE = ramp("#121216", "#1e1e24", "#2e2e36", "#44444e");

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
/** Lit wall: vertical gradient + dither, darker to the right. */
function wall(img: RgbaImage, x0: number, y0: number, w: number, h: number, pal: Rgb[], lit = 0.7): void {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) setPx(img, x, y, pick(pal, lit - ((y - y0) / h) * 0.18 - ((x - x0) / w) * 0.12, x, y, 0.3));
}
/** Horizontal wooden planks. */
function planks(img: RgbaImage, x0: number, y0: number, w: number, h: number, pal: Rgb[], seed: number): void {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    const row = Math.floor((y - y0) / 4);
    const seam = (y - y0) % 4 === 3;
    const joint = (x - x0 + row * 13) % 37 === 0;
    const t = 0.62 + (hash(row, Math.floor((x + row * 13) / 37), seed) - 0.5) * 0.25 - ((x - x0) / w) * 0.1;
    setPx(img, x, y, seam || joint ? pal[1]! : pick(pal, t, x, y, 0.25));
  }
}
function shadeRect(img: RgbaImage, x0: number, y0: number, w: number, h: number, amount: number): void {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (alphaAt(img, x, y)) setPx(img, x, y, mix(getPx(img, x, y), SHADOW, amount));
}
function signText(img: RgbaImage, key: ThaiSignKey, x: number, y: number, c: Rgb, shadow?: Rgb): void {
  const s = THAI_SIGNS[key];
  const passes: Array<[number, number, Rgb]> = shadow ? [[1, 1, shadow], [0, 0, c]] : [[0, 0, c]];
  for (const [dx, dy, col] of passes) for (let yy = 0; yy < s.height; yy++) for (let xx = 0; xx < s.width; xx++) if (s.rows[yy]![xx] === "#") setPx(img, x + xx + dx, y + yy + dy, col);
}
/** Sign board with a centred Thai word; returns its box. */
function board(img: RgbaImage, key: ThaiSignKey, cx: number, y: number, pal: Rgb[], text: Rgb, padX = 5, padY = 3): { x: number; w: number; h: number } {
  const s = THAI_SIGNS[key];
  const w = s.width + padX * 2;
  const h = s.height + padY * 2;
  const x = Math.round(cx - w / 2);
  bevel(img, x, y, w, h, pal, 2);
  signText(img, key, x + padX, y + padY, text, pal[0]);
  return { x, w, h };
}
/** Window with a frame; lit at night. */
function win(img: RgbaImage, x: number, y: number, w: number, h: number, frame: Rgb[], bars = 1, curtain?: Rgb): void {
  bevel(img, x - 1, y - 1, w + 2, h + 2, frame, 3);
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) setPx(img, x + xx, y + yy, pick(GLASS, 0.7 - yy / (h * 2.2) - (xx / w) * 0.1 + (xx + yy < 4 ? 0.25 : 0), x + xx, y + yy, 0.3));
  if (curtain) for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < Math.ceil(w / 4); xx++) { setPx(img, x + xx, y + yy, curtain); setPx(img, x + w - 1 - xx, y + yy, mix(curtain, SHADOW, 0.2)); }
  for (let b = 1; b <= bars; b++) vline(img, x + Math.round((b * w) / (bars + 1)), y, y + h - 1, frame[2]!);
  markNight(img, "window-lit", () => { for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) setPx(img, x + xx, y + yy, getPx(img, x + xx, y + yy)); });
}
function door(img: RgbaImage, x: number, y: number, w: number, h: number, pal: Rgb[]): void {
  bevel(img, x - 1, y - 1, w + 2, h + 1, TEAK, 1);
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) setPx(img, x + xx, y + yy, pick(pal, 0.6 - (xx / w) * 0.25, x + xx, y + yy, 0.3));
  vline(img, x + Math.floor(w / 2), y, y + h - 1, pal[1]!);
  setPx(img, x + Math.floor(w / 2) - 2, y + Math.floor(h / 2), YELLOW[4]!);
}
/** Gable / pitched roof drawn as a triangle-ish slab from (x0..x1) at baseline y with height h. */
function pitched(img: RgbaImage, x0: number, x1: number, y: number, h: number, pal: Rgb[], overhang = 4, steep = 1): void {
  const cx = (x0 + x1) / 2;
  for (let yy = 0; yy < h; yy++) {
    const half = ((x1 - x0) / 2 + overhang) * ((yy + 1) / h) ** steep;
    for (let x = Math.round(cx - half); x <= Math.round(cx + half); x++) {
      const t = 0.75 - (yy / h) * 0.15 - ((x - cx) / (x1 - x0)) * 0.35 - (yy % 3 === 2 ? 0.18 : 0);
      setPx(img, x, y - h + yy, pick(pal, t, x, y - h + yy, 0.3));
    }
  }
  hline(img, Math.round(cx - (x1 - x0) / 2 - overhang), Math.round(cx + (x1 - x0) / 2 + overhang), y, pal[0]!);
}
function ground(img: RgbaImage, w: number, h: number, pal = CONCRETE): void {
  hline(img, 0, w - 1, h - 4, pal[4]!);
  for (let y = h - 3; y < h; y++) hline(img, 0, w - 1, y, pal[2]!);
}
function wheel(img: RgbaImage, cx: number, cy: number, r: number): void {
  for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
    const d = Math.hypot(x - cx, y - cy);
    if (d > r + 0.3) continue;
    setPx(img, x, y, d > r - 2 ? pick(TIRE, 0.5 - (y - cy) / (r * 3), x, y, 0.2) : d < 1.3 ? STEEL[1]! : pick(STEEL, 0.75 - (y - cy) / (r * 2.5), x, y, 0.3));
  }
}
/** Car-ish body: rows of [x0, x1] spans from y0, filled with a ramp and a beltline highlight. */
function body(img: RgbaImage, spans: Array<[number, number]>, y0: number, pal: Rgb[], belt?: number): void {
  spans.forEach(([a, b], i) => {
    const y = y0 + i;
    for (let x = a; x <= b; x++) setPx(img, x, y, pick(pal, 0.78 - (i / spans.length) * 0.4 - ((x - a) / Math.max(1, b - a)) * 0.08, x, y, 0.3));
  });
  if (belt !== undefined) { const [a, b] = spans[belt - y0] ?? [0, -1]; hline(img, a + 1, b - 1, belt, pal[5] ?? pal[pal.length - 1]!); }
}
function headlight(img: RgbaImage, x: number, y: number): void {
  setPx(img, x, y, WARM[4]!);
  setPx(img, x, y + 1, WARM[3]!);
  markNight(img, "light", () => { setPx(img, x, y, WARM[4]!); setPx(img, x, y + 1, WARM[4]!); });
}
function taillight(img: RgbaImage, x: number, y: number): void {
  setPx(img, x, y, RED[4]!);
  setPx(img, x, y + 1, RED[3]!);
}

// ---------------- vehicles (facing right) ----------------
function pickup(): RgbaImage {
  const img = createImage(64, 30);
  const P = WHITEWALL;
  body(img, [[30, 44], [29, 46], [28, 48]], 6, P);
  for (let y = 9; y < 23; y++) hline(img, 2, 61 - (y < 13 ? 13 - y : 0), y, pick(P, 0.75 - (y - 9) / 30, 2, y, 0.3));
  for (let y = 4; y < 9; y++) hline(img, 30 - (y - 4), 46 + (y - 4) * 0.6, y, pick(P, 0.85, 30, y, 0.3));
  for (let y = 5; y < 9; y++) for (let x = 32; x < 46; x++) if (x - 32 < 13 - (8 - y)) setPx(img, x, y, pick(GLASS, 0.6 - (x - 32) / 40, x, y, 0.3));
  hline(img, 2, 28, 9, P[5]!);
  hline(img, 2, 28, 10, P[1]!); // bed rail
  hline(img, 2, 61, 16, STEEL[3]!);
  vline(img, 29, 9, 22, P[1]!);
  vline(img, 44, 9, 20, P[2]!);
  headlight(img, 61, 13);
  taillight(img, 2, 12);
  rect(img, 56, 19, 6, 3, STEEL[4]!);
  wheel(img, 14, 23, 6);
  wheel(img, 50, 23, 6);
  selOutline(img, 0.42);
  return img;
}
function tuktuk(): RgbaImage {
  const img = createImage(56, 36);
  // canopy
  for (let y = 2; y < 8; y++) hline(img, 6 + (y < 4 ? 2 : 0), 46, y, pick(BLUE, 0.78 - (y - 2) / 12, 6, y, 0.3));
  hline(img, 6, 47, 8, YELLOW[3]!);
  for (const x of [8, 30, 45]) vline(img, x, 8, 22, STEEL[2]!);
  // rear passenger tub + cab
  for (let y = 18; y < 28; y++) hline(img, 4, 40, y, pick(BLUE, 0.7 - (y - 18) / 30, 4, y, 0.3));
  hline(img, 4, 40, 18, BLUE[5]!);
  for (let y = 20; y < 26; y++) hline(img, 6, 26, y, pick(RED, 0.55, 6, y, 0.3)); // bench seat
  hline(img, 4, 40, 23, YELLOW[3]!);
  // front cowl over the single wheel
  for (let y = 14; y < 28; y++) { const x1 = 52 - Math.max(0, 16 - y); for (let x = 40; x <= x1; x++) setPx(img, x, y, pick(BLUE, 0.8 - (y - 14) / 30 - (x - 40) / 50, x, y, 0.3)); }
  for (let y = 9; y < 14; y++) hline(img, 44, 50 - (13 - y), y, pick(GLASS, 0.65, 44, y, 0.3)); // windscreen
  vline(img, 50, 8, 14, STEEL[3]!);
  headlight(img, 52, 17);
  taillight(img, 4, 21);
  hline(img, 34, 40, 15, STEEL[4]!); // handlebar
  wheel(img, 12, 29, 5);
  wheel(img, 46, 29, 5);
  selOutline(img, 0.42);
  return img;
}
function scooter(): RgbaImage {
  const img = createImage(40, 28);
  wheel(img, 8, 22, 5);
  wheel(img, 32, 22, 5);
  for (let y = 12; y < 20; y++) for (let x = 4; x < 22; x++) { const dx = (x - 13) / 9, dy = (y - 16) / 4; if (dx * dx + dy * dy <= 1.1) setPx(img, x, y, pick(TEAL, 0.8 - dy * 0.3 - dx * 0.2, x, y, 0.3)); }
  for (let x = 6; x < 20; x++) { setPx(img, x, 10, rgb("#2a2630")); setPx(img, x, 11, rgb("#1a1820")); }
  hline(img, 18, 28, 19, STEEL[3]!);
  for (let y = 6; y < 19; y++) for (let x = 26; x < 30; x++) setPx(img, x - Math.floor((y - 6) * 0.25), y, pick(TEAL, 0.85 - (x - 26) * 0.12, x, y, 0.3));
  for (let y = 2; y < 6; y++) setPx(img, 27, y, STEEL[2]!);
  hline(img, 24, 31, 2, STEEL[4]!);
  headlight(img, 31, 8);
  taillight(img, 3, 14);
  selOutline(img, 0.42);
  return img;
}
function songthaew(): RgbaImage {
  const img = createImage(80, 40);
  // roof rack + roof
  for (let y = 4; y < 8; y++) hline(img, 2, 50, y, pick(RED, 0.8 - (y - 4) / 10, 2, y, 0.3));
  hline(img, 2, 50, 3, STEEL[3]!);
  for (const x of [4, 18, 32, 48]) vline(img, x, 8, 24, STEEL[3]!);
  // open rear with two benches
  for (let y = 8; y < 30; y++) hline(img, 2, 50, y, y < 18 ? mix(pick(RED, 0.5, 2, y, 0.3), SHADOW, 0.55) : pick(RED, 0.72 - (y - 18) / 30, 2, y, 0.3));
  for (let y = 18; y < 22; y++) hline(img, 6, 46, y, pick(TEAK, 0.6, 6, y, 0.2)); // bench
  hline(img, 2, 50, 18, RED[5]!);
  hline(img, 2, 50, 26, YELLOW[3]!);
  vline(img, 1, 8, 30, STEEL[2]!); // grab bar at the back
  // cab
  for (let y = 10; y < 30; y++) { const x1 = 77 - Math.max(0, 14 - y); for (let x = 51; x <= x1; x++) setPx(img, x, y, pick(RED, 0.82 - (y - 10) / 30 - (x - 51) / 70, x, y, 0.3)); }
  for (let y = 12; y < 18; y++) for (let x = 55; x < 70 - Math.max(0, 14 - y); x++) setPx(img, x, y, pick(GLASS, 0.62 - (x - 55) / 40, x, y, 0.3));
  vline(img, 62, 12, 28, RED[1]!);
  hline(img, 51, 77, 22, STEEL[3]!);
  headlight(img, 77, 18);
  taillight(img, 2, 22);
  rect(img, 72, 25, 6, 3, STEEL[4]!);
  wheel(img, 14, 32, 6);
  wheel(img, 64, 32, 6);
  selOutline(img, 0.42);
  return img;
}
function bus(): RgbaImage {
  const img = createImage(128, 52);
  const BODY = ORANGE;
  for (let y = 4; y < 44; y++) { const x1 = 125 - (y < 8 ? 8 - y : 0); for (let x = 2 + (y < 6 ? 6 - y : 0); x <= x1; x++) setPx(img, x, y, y < 28 ? pick(BODY, 0.78 - (y - 4) / 60 - (x / 128) * 0.12, x, y, 0.3) : pick(WHITEWALL, 0.75 - (y - 28) / 40, x, y, 0.3)); }
  hline(img, 4, 122, 4, BODY[5]!);
  hline(img, 2, 125, 28, BODY[1]!);
  hline(img, 2, 125, 36, BODY[3]!);
  // windows
  for (let i = 0; i < 6; i++) win(img, 8 + i * 17, 10, 13, 12, STEEL, 0);
  for (let y = 9; y < 26; y++) for (let x = 112; x < 124 - Math.max(0, 12 - y); x++) setPx(img, x, y, pick(GLASS, 0.65 - (x - 112) / 30, x, y, 0.3)); // windscreen
  // door
  for (let y = 12; y < 42; y++) for (let x = 104; x < 110; x++) setPx(img, x, y, x === 107 ? STEEL[2]! : pick(GLASS, 0.55, x, y, 0.3));
  // route board (no text: blank lit strip)
  rect(img, 112, 5, 10, 3, INK);
  markNight(img, "light", () => hline(img, 113, 121, 6, WARM[3]!));
  headlight(img, 125, 34);
  taillight(img, 2, 30);
  rect(img, 2, 42, 124, 2, STEEL[1]!);
  wheel(img, 24, 44, 7);
  wheel(img, 98, 44, 7);
  selOutline(img, 0.42);
  return img;
}
function truck(): RgbaImage {
  const img = createImage(112, 52);
  // cargo box
  for (let y = 4; y < 38; y++) for (let x = 2; x < 76; x++) setPx(img, x, y, pick(ZINC, 0.78 - (y - 4) / 80 - ((x - 2) / 74) * 0.1 - ((x - 2) % 8 === 0 ? 0.12 : 0), x, y, 0.3));
  hline(img, 2, 75, 4, ZINC[5]!);
  hline(img, 2, 75, 37, ZINC[1]!);
  for (let x = 8; x < 70; x++) for (let y = 16; y < 24; y++) setPx(img, x, y, pick(GREEN, 0.62 - (y - 16) / 20, x, y, 0.3)); // painted stripe
  // cab
  for (let y = 12; y < 42; y++) { const x1 = 108 - Math.max(0, 18 - y); for (let x = 78; x <= x1; x++) setPx(img, x, y, pick(GREEN, 0.78 - (y - 12) / 50 - (x - 78) / 90, x, y, 0.3)); }
  for (let y = 15; y < 25; y++) for (let x = 90; x < 104 - Math.max(0, 18 - y); x++) setPx(img, x, y, pick(GLASS, 0.62 - (x - 90) / 30, x, y, 0.3));
  vline(img, 88, 14, 40, GREEN[1]!);
  hline(img, 78, 108, 32, STEEL[3]!);
  rect(img, 76, 38, 4, 4, STEEL[2]!);
  headlight(img, 108, 30);
  taillight(img, 2, 32);
  rect(img, 2, 38, 74, 3, STEEL[1]!);
  wheel(img, 16, 44, 7);
  wheel(img, 34, 44, 7);
  wheel(img, 96, 44, 7);
  selOutline(img, 0.42);
  return img;
}
function taxi(): RgbaImage {
  const img = createImage(60, 28);
  const P = PINK;
  for (let y = 4; y < 10; y++) hline(img, 18 - (y - 4), 40 + (y - 4) * 1.5, y, pick(P, 0.85, 18, y, 0.3));
  for (let y = 5; y < 10; y++) for (let x = 20 - (y - 5); x < 40 + (y - 5); x++) if (x !== 30) setPx(img, x, y, pick(GLASS, 0.6 - (x - 18) / 50, x, y, 0.3));
  for (let y = 10; y < 21; y++) hline(img, 2 + (y < 12 ? 12 - y : 0), 57 - (y < 12 ? 12 - y : 0), y, pick(P, 0.75 - (y - 10) / 30, 2, y, 0.3));
  hline(img, 2, 57, 14, P[5]!);
  vline(img, 30, 10, 19, P[1]!);
  rect(img, 26, 1, 8, 3, YELLOW[3]!); // roof light
  markNight(img, "light", () => rect(img, 27, 2, 6, 1, YELLOW[5]!));
  headlight(img, 57, 13);
  taillight(img, 2, 13);
  wheel(img, 13, 21, 6);
  wheel(img, 47, 21, 6);
  selOutline(img, 0.42);
  return img;
}

// ---------------- houses ----------------
/** Thai wooden house on stilts (112 × 112): steep gabled roof, teak plank walls, veranda, stairs, potted plants. */
function thaiWoodHouse(): RgbaImage {
  const w = 112, h = 112;
  const img = createImage(w, h);
  // stilts + under-house shade
  for (let y = 70; y < h - 4; y++) for (let x = 10; x < 100; x++) if (bayerish(x, y)) setPx(img, x, y, mix(CONCRETE[2]!, SHADOW, 0.35));
  for (const x of [12, 34, 56, 78, 96]) for (let y = 66; y < h - 4; y++) { setPx(img, x, y, TEAK[3]!); setPx(img, x + 1, y, TEAK[1]!); }
  // body
  planks(img, 10, 40, 90, 28, TEAK, 7);
  hline(img, 8, 102, 68, TEAK[1]!);
  hline(img, 8, 102, 69, TEAK[4]!);
  win(img, 22, 46, 12, 12, TEAK, 1);
  win(img, 70, 46, 12, 12, TEAK, 1);
  door(img, 46, 46, 14, 22, TEAK);
  // roof: steep gable with ridge
  pitched(img, 10, 100, 40, 32, ROOF_TILE, 7, 0.85);
  for (let y = 10; y < 40; y++) { const k = (y - 8) / 32; const half = 51 * k; setPx(img, Math.round(55 - half * 0.25), y, ROOF_TILE[0]!); }
  // stairs to the door
  for (let i = 0; i < 9; i++) hline(img, 40 - i * 3, 46 - i * 3, 70 + i * 4, TEAK[4]!);
  for (let i = 0; i < 9; i++) setPx(img, 40 - i * 3, 71 + i * 4, TEAK[1]!);
  // plants
  for (const px of [4, 104]) { rect(img, px - 2, h - 10, 6, 6, ROOF_TILE[2]!); for (let k = 0; k < 14; k++) setPx(img, px + Math.round(Math.cos(k) * 3), h - 12 - (k % 5), GREEN[2 + (k % 3)]!); }
  ground(img, w, h);
  selOutline(img, 0.4);
  return img;
}
const bayerish = (x: number, y: number) => ((x + y * 3) & 3) !== 0;

/** Modern house (96 × 96): white cube, flat roof, big windows, carport slab. */
function modernHouse(): RgbaImage {
  const w = 96, h = 96;
  const img = createImage(w, h);
  wall(img, 4, 26, 60, 66, WHITEWALL, 0.8);
  wall(img, 64, 50, 30, 42, CONCRETE, 0.7);
  rect(img, 2, 22, 64, 4, STEEL[2]!); // flat roof slab
  hline(img, 2, 65, 22, STEEL[4]!);
  rect(img, 62, 46, 34, 4, STEEL[2]!); // carport roof
  hline(img, 62, 95, 46, STEEL[4]!);
  vline(img, 93, 50, h - 5, STEEL[3]!);
  for (let y = 30; y < 50; y++) for (let x = 8; x < 20; x++) setPx(img, x, y, pick(TEAK, 0.65 - ((x - 8) % 3 === 0 ? 0.2 : 0), x, y, 0.2)); // wood slats
  win(img, 24, 30, 34, 18, STEEL, 2);
  win(img, 10, 60, 24, 22, STEEL, 1);
  door(img, 40, 62, 12, 26, TEAK);
  rect(img, 46, 52, 6, 3, WARM[2]!);
  markNight(img, "light", () => rect(img, 46, 52, 6, 3, WARM[4]!));
  // potted tree
  rect(img, 54, h - 12, 6, 8, CONCRETE[1]!);
  for (let k = 0; k < 30; k++) setPx(img, 57 + Math.round(Math.cos(k * 1.7) * (2 + (k % 3))), h - 16 - (k % 7), GREEN[2 + (k % 3)]!);
  ground(img, w, h);
  selOutline(img, 0.4);
  return img;
}

/** Malay kampung house (112 × 112): stilts, painted wooden walls, tall pitched zinc roof, front steps, louvred windows. */
function kampungHouse(): RgbaImage {
  const w = 112, h = 112;
  const img = createImage(w, h);
  for (const x of [14, 38, 62, 86, 96]) for (let y = 70; y < h - 4; y++) { setPx(img, x, y, TEAK[2]!); setPx(img, x + 1, y, TEAK[0]!); }
  planks(img, 12, 42, 88, 28, TEAL, 11);
  hline(img, 10, 102, 70, TEAK[1]!);
  hline(img, 10, 102, 71, TEAK[4]!);
  // louvred windows
  for (const wx of [20, 72]) { bevel(img, wx - 1, 46, 16, 16, WHITEWALL, 3); for (let y = 47; y < 61; y++) for (let x = wx; x < wx + 14; x++) setPx(img, x, y, (y - 47) % 3 === 2 ? TEAK[1]! : pick(TEAK, 0.7, x, y, 0.2)); markNight(img, "window-lit", () => { for (let y = 47; y < 61; y += 3) hline(img, wx, wx + 13, y + 1, WARM[2]!); }); }
  door(img, 48, 46, 14, 24, YELLOW);
  pitched(img, 12, 100, 42, 34, ZINC, 8, 0.9);
  // decorative fascia board (plain zigzag cut, no script)
  for (let x = 4; x < 108; x++) setPx(img, x, 43 + ((x >> 1) & 1), WHITEWALL[4]!);
  // steps
  for (let i = 0; i < 9; i++) { hline(img, 48 - i * 2, 62 + i * 2, 72 + i * 4, CONCRETE[4]!); hline(img, 48 - i * 2, 62 + i * 2, 73 + i * 4, CONCRETE[2]!); }
  // hibiscus bush
  for (let k = 0; k < 40; k++) setPx(img, 100 + Math.round(Math.cos(k * 2.1) * (3 + (k % 4))), h - 8 - (k % 8), k % 9 === 0 ? RED[4]! : GREEN[2 + (k % 3)]!);
  ground(img, w, h);
  selOutline(img, 0.4);
  return img;
}

/** Chinese shophouse (112 × 160): two storeys, arched shuttered windows, five-foot way, red lanterns, fabric shop below. */
function chineseShophouse(): RgbaImage {
  const w = 112, h = 160;
  const img = createImage(w, h);
  const WALL = shadeRamp("#e8c48a");
  wall(img, 0, 24, w, h - 28, WALL, 0.78);
  // tiled eave + parapet
  rect(img, 0, 16, w, 8, ROOF_TILE[2]!);
  for (let x = 0; x < w; x += 4) vline(img, x, 16, 23, ROOF_TILE[0]!);
  hline(img, 0, w - 1, 15, ROOF_TILE[4]!);
  for (let y = 4; y < 15; y++) hline(img, 10, w - 11, y, pick(WALL, 0.85 - (y - 4) / 30, 10, y, 0.3));
  for (let x = 14; x < w - 14; x += 10) rect(img, x, 7, 6, 5, mix(WALL[2]!, TEAL[3]!, 0.5)); // ventilation tiles (geometric)
  // upper floor: three arched windows with green shutters
  for (const wx of [12, 46, 80]) {
    for (let y = 36; y < 70; y++) for (let x = wx; x < wx + 20; x++) {
      const dx = x - (wx + 9.5), arch = y < 46 ? Math.sqrt(Math.max(0, 100 - (46 - y) ** 2)) : 99;
      if (Math.abs(dx) > arch) continue;
      setPx(img, x, y, Math.abs(dx) < 5 ? pick(GLASS, 0.55 - (y - 36) / 90, x, y, 0.3) : pick(GREEN, 0.6 - (x % 2) * 0.12, x, y, 0.2));
    }
    hline(img, wx - 2, wx + 21, 70, WALL[1]!);
    markNight(img, "window-lit", () => { for (let y = 40; y < 70; y++) for (let x = wx + 5; x < wx + 15; x++) setPx(img, x, y, getPx(img, x, y)); });
  }
  hline(img, 0, w - 1, 80, WALL[5]!);
  rect(img, 0, 81, w, 4, WALL[1]!);
  // five-foot way: columns + shop front with fabric rolls
  for (let y = 85; y < h - 4; y++) for (let x = 0; x < w; x++) setPx(img, x, y, mix(pick(WALL, 0.5, x, y, 0.3), SHADOW, 0.3));
  for (const cx of [0, 52, 104]) for (let y = 85; y < h - 4; y++) hline(img, cx, cx + 7, y, pick(WALL, 0.8 - (y - 85) / 200, cx, y, 0.3));
  board(img, "fabric", 56, 88, RED.slice(1), YELLOW[4]!, 6, 2);
  for (let i = 0; i < 9; i++) { const pal = [RED, BLUE, GREEN, YELLOW, PINK, TEAL][i % 6]!; for (let y = 108; y < 140; y++) for (let x = 12 + i * 10; x < 19 + i * 10; x++) if (x < 100 && !(x >= 52 && x < 60)) setPx(img, x, y, pick(pal, 0.75 - (x % 7) / 12, x, y, 0.3)); }
  rect(img, 10, 140, 92, 12, TEAK[2]!);
  hline(img, 10, 101, 140, TEAK[4]!);
  // red lanterns (plain)
  for (const lx of [26, 86]) { vline(img, lx, 85, 89, INK); for (let y = 90; y < 98; y++) for (let x = lx - 4; x <= lx + 4; x++) { const dx = (x - lx) / 4.5, dy = (y - 94) / 4.2; if (dx * dx + dy * dy <= 1) setPx(img, x, y, pick(RED, 0.8 - dx * 0.4 - dy * 0.2, x, y, 0.3)); } hline(img, lx - 2, lx + 2, 89, YELLOW[3]!); hline(img, lx - 2, lx + 2, 98, YELLOW[3]!); markNight(img, "light", () => { for (let y = 91; y < 97; y++) hline(img, lx - 2, lx + 2, y, ORANGE[4]!); }); }
  ground(img, w, h);
  selOutline(img, 0.4);
  return img;
}

/** Shophouse variant (112 × 144): two storeys, colored facade, a shop sign and shop goods. */
function shophouseVariant(facade: string, sign: ThaiSignKey, signPal: Rgb[], goods: "paper" | "clothes"): () => RgbaImage {
  return () => {
    const w = 112, h = 144;
    const img = createImage(w, h);
    const WALL = shadeRamp(facade);
    wall(img, 0, 12, w, h - 16, WALL, 0.78);
    rect(img, 0, 8, w, 6, WALL[1]!);
    hline(img, 0, w - 1, 8, WALL[5]!);
    for (const wx of [10, 44, 78]) { win(img, wx, 24, 24, 26, WHITEWALL, 1); for (let x = wx - 2; x < wx + 26; x += 3) vline(img, x, 54, 60, STEEL[3]!); hline(img, wx - 3, wx + 26, 53, STEEL[4]!); hline(img, wx - 3, wx + 26, 61, STEEL[2]!); }
    rect(img, 0, 66, w, 4, WALL[1]!);
    hline(img, 0, w - 1, 70, WALL[5]!);
    board(img, sign, w / 2, 73, signPal, WHITE, 8, 3);
    // open shop front with goods
    for (let y = 92; y < h - 4; y++) for (let x = 6; x < w - 6; x++) setPx(img, x, y, mix(pick(WALL, 0.4, x, y, 0.3), SHADOW, 0.45));
    markNight(img, "interior", () => { for (let y = 92; y < h - 4; y++) for (let x = 6; x < w - 6; x++) setPx(img, x, y, getPx(img, x, y)); });
    if (goods === "paper") {
      for (const sy of [100, 114, 128]) { hline(img, 10, w - 11, sy, TEAK[4]!); for (let x = 12; x < w - 12; x += 4) { const pal = [BLUE, RED, YELLOW, GREEN, WHITEWALL][(x / 4) % 5 | 0]!; rect(img, x, sy - 8, 3, 8, pal[3]!); setPx(img, x, sy - 8, pal[5]!); } }
    } else {
      for (const ry of [98, 118]) { hline(img, 10, w - 11, ry, STEEL[4]!); for (let x = 12; x < w - 16; x += 9) shirt(img, x, ry + 1, [RED, BLUE, GREEN, YELLOW, PINK, TEAL, WHITEWALL][(x / 9) % 7 | 0]!); }
    }
    rect(img, 0, h - 4, w, 1, CONCRETE[4]!);
    for (let y = h - 3; y < h; y++) hline(img, 0, w - 1, y, CONCRETE[2]!);
    selOutline(img, 0.4);
    return img;
  };
}

/** A shirt on a hanger (9 × 12), hanging from y. */
function shirt(img: RgbaImage, x: number, y: number, pal: Rgb[]): void {
  setPx(img, x + 4, y, STEEL[3]!);
  hline(img, x + 2, x + 6, y + 1, STEEL[3]!);
  const rows = ["..#####..", ".#######.", "#########", "##.###.##", "..#####..", "..#####..", "..#####..", "..#####..", "..#####..", "..#####.."];
  rows.forEach((r, yy) => { for (let xx = 0; xx < 9; xx++) if (r[xx] === "#") setPx(img, x + xx, y + 2 + yy, pick(pal, 0.75 - xx / 20 - yy / 40, x + xx, y + 2 + yy, 0.3)); });
  setPx(img, x + 4, y + 2, mix(pal[1]!, SHADOW, 0.3)); // collar
}

// ---------------- civic buildings ----------------
function hospital(): RgbaImage {
  const w = 224, h = 144;
  const img = createImage(w, h);
  wall(img, 0, 20, w, h - 24, WHITEWALL, 0.85);
  rect(img, 0, 14, w, 6, GREEN[3]!);
  hline(img, 0, w - 1, 14, GREEN[5]!);
  for (let r = 0; r < 3; r++) for (let i = 0; i < 9; i++) if (!(r === 2 && i >= 3 && i <= 5)) win(img, 8 + i * 24, 28 + r * 28, 16, 16, STEEL, 1, r === 1 && i % 2 ? CLOTH() : undefined);
  hline(img, 0, w - 1, 52, GREEN[4]!);
  hline(img, 0, w - 1, 80, GREEN[4]!);
  // green plus (medical, not the protected red cross)
  // rooftop sign box on two posts
  vline(img, 104, 11, 13, STEEL[2]!); vline(img, 119, 11, 13, STEEL[2]!);
  bevel(img, 101, 0, 22, 11, WHITEWALL, 4);
  rect(img, 106, 4, 12, 3, GREEN[3]!); rect(img, 110, 2, 4, 7, GREEN[3]!);
  markNight(img, "light", () => { rect(img, 106, 4, 12, 3, GREEN[5]!); rect(img, 110, 2, 4, 7, GREEN[5]!); });
  board(img, "hospital", w / 2, 86, GREEN.slice(1), WHITE, 8, 3);
  // entrance canopy + glass doors
  rect(img, 76, 104, 72, 4, STEEL[2]!);
  hline(img, 76, 147, 104, STEEL[4]!);
  for (let y = 108; y < h - 4; y++) for (let x = 86; x < 138; x++) setPx(img, x, y, x === 111 || x === 112 ? STEEL[1]! : pick(GLASS, 0.7 - (y - 108) / 80, x, y, 0.3));
  markNight(img, "window-lit", () => { for (let y = 108; y < h - 4; y++) for (let x = 86; x < 138; x++) setPx(img, x, y, getPx(img, x, y)); });
  // emergency entrance sign (green bar + white plus; not the protected red-cross emblem)
  rect(img, 168, 104, 40, 10, GREEN[2]!);
  rect(img, 172, 108, 6, 2, WHITE); rect(img, 174, 106, 2, 6, WHITE);
  ground(img, w, h);
  selOutline(img, 0.4);
  return img;
}
function CLOTH(): Rgb { return rgb("#e8e0d0"); }

function policeStation(): RgbaImage {
  const w = 160, h = 112;
  const img = createImage(w, h);
  const WALL = shadeRamp("#d9c7a0");
  wall(img, 0, 22, w, h - 26, WALL, 0.8);
  rect(img, 0, 14, w, 8, NAVY[2]!);
  hline(img, 0, w - 1, 14, NAVY[4]!);
  board(img, "police", w / 2, 26, NAVY.slice(1), YELLOW[4]!, 8, 3);
  for (let i = 0; i < 5; i++) if (i !== 2) win(img, 10 + i * 30, 50, 20, 22, NAVY, 1);
  door(img, 66, 56, 28, 36, GLASS);
  // blue/red light on the canopy
  rect(img, 70, 48, 20, 4, STEEL[2]!);
  rect(img, 74, 44, 5, 4, BLUE[4]!); rect(img, 81, 44, 5, 4, RED[4]!);
  markNight(img, "light", () => { rect(img, 74, 44, 5, 4, BLUE[5]!); rect(img, 81, 44, 5, 4, RED[5]!); });
  // flag pole with a plain striped flag
  vline(img, 150, 30, h - 5, STEEL[4]!);
  const stripes = [RED[3]!, WHITE, NAVY[3]!, NAVY[3]!, WHITE, RED[3]!];
  stripes.forEach((c, i) => hline(img, 138, 149, 30 + i, c));
  ground(img, w, h);
  selOutline(img, 0.4);
  return img;
}

function postOffice(): RgbaImage {
  const w = 128, h = 96;
  const img = createImage(w, h);
  wall(img, 0, 22, w, h - 26, WHITEWALL, 0.85);
  rect(img, 0, 12, w, 10, RED[3]!);
  hline(img, 0, w - 1, 12, RED[5]!);
  board(img, "post", w / 2, 26, RED.slice(1), WHITE, 8, 3);
  win(img, 10, 48, 28, 26, STEEL, 2);
  win(img, 90, 48, 28, 26, STEEL, 2);
  door(img, 50, 50, 28, 38, GLASS);
  // red mailbox
  rect(img, 116, h - 22, 9, 18, RED[3]!); hline(img, 116, 124, h - 22, RED[5]!); hline(img, 118, 122, h - 17, INK);
  ground(img, w, h);
  selOutline(img, 0.4);
  return img;
}

function bank(): RgbaImage {
  const w = 128, h = 112;
  const img = createImage(w, h);
  const WALL = shadeRamp("#c8ccd8");
  wall(img, 0, 18, w, h - 22, WALL, 0.82);
  rect(img, 0, 10, w, 8, BLUE[2]!);
  hline(img, 0, w - 1, 10, BLUE[4]!);
  // columns
  for (const cx of [6, 38, 84, 116]) for (let y = 40; y < h - 4; y++) hline(img, cx, cx + 6, y, pick(WHITEWALL, 0.85 - (cx % 7) / 20, cx, y, 0.3));
  board(img, "bank", w / 2, 22, BLUE.slice(1), YELLOW[4]!, 10, 4);
  for (let y = 44; y < h - 4; y++) for (let x = 48; x < 80; x++) setPx(img, x, y, x === 63 || x === 64 ? STEEL[1]! : pick(GLASS, 0.7 - (y - 44) / 90, x, y, 0.3));
  markNight(img, "window-lit", () => { for (let y = 44; y < h - 4; y++) for (let x = 48; x < 80; x++) setPx(img, x, y, getPx(img, x, y)); });
  // ATM
  bevel(img, 92, 58, 18, 34, STEEL, 3);
  rect(img, 95, 62, 12, 8, GLASS[4]!);
  markNight(img, "light", () => rect(img, 95, 62, 12, 8, GLASS[5]!));
  for (let k = 0; k < 9; k++) setPx(img, 96 + (k % 3) * 2, 74 + Math.floor(k / 3) * 2, STEEL[5]!);
  win(img, 14, 50, 18, 28, STEEL, 1);
  ground(img, w, h);
  selOutline(img, 0.4);
  return img;
}

function districtOffice(): RgbaImage {
  const w = 192, h = 112;
  const img = createImage(w, h);
  const WALL = shadeRamp("#efe2b8");
  wall(img, 0, 30, w, h - 34, WALL, 0.82);
  // hip roof, plain
  for (let y = 10; y < 30; y++) { const inset = Math.round((30 - y) * 1.2); hline(img, inset - 4, w - 1 - inset + 4, y, pick(ROOF_TILE, 0.75 - (y - 10) / 40 - (y % 3 === 2 ? 0.15 : 0), inset, y, 0.3)); }
  hline(img, 0, w - 1, 30, ROOF_TILE[0]!);
  board(img, "district", w / 2, 34, TEAK.slice(1), YELLOW[4]!, 8, 3);
  for (let i = 0; i < 6; i++) if (i !== 2 && i !== 3) win(img, 12 + i * 30, 56, 18, 24, TEAK, 1);
  // porch with steps
  rect(img, 70, 54, 52, 3, WALL[5]!);
  for (const cx of [72, 116]) for (let y = 57; y < h - 8; y++) hline(img, cx, cx + 3, y, WALL[4]!);
  door(img, 84, 62, 24, 40, TEAK);
  for (let i = 0; i < 3; i++) hline(img, 66 - i * 3, 126 + i * 3, h - 8 + i, CONCRETE[4 - i]!);
  // flag pole (plain stripes)
  vline(img, 186, 20, h - 5, STEEL[4]!);
  [RED[3]!, WHITE, NAVY[3]!, NAVY[3]!, WHITE, RED[3]!].forEach((c, i) => hline(img, 174, 185, 20 + i, c));
  ground(img, w, h);
  selOutline(img, 0.4);
  return img;
}

function companyOffice(): RgbaImage {
  const w = 128, h = 160;
  const img = createImage(w, h);
  for (let y = 8; y < h - 4; y++) for (let x = 4; x < w - 4; x++) {
    const col = (x - 4) % 20, row = (y - 8) % 14;
    const frame = col < 2 || row < 2;
    setPx(img, x, y, frame ? pick(STEEL, 0.7 - (x / w) * 0.2, x, y, 0.3) : pick(GLASS, 0.72 - (y / h) * 0.35 - (col + row < 6 ? -0.15 : 0), x, y, 0.3));
  }
  markNight(img, "window-lit", () => { for (let y = 8; y < h - 30; y++) for (let x = 4; x < w - 4; x++) { const col = (x - 4) % 20, row = (y - 8) % 14; if (col >= 2 && row >= 2 && hash(Math.floor((x - 4) / 20), Math.floor((y - 8) / 14), 5) < 0.55) setPx(img, x, y, getPx(img, x, y)); } });
  rect(img, 2, 4, w - 4, 4, STEEL[2]!);
  hline(img, 2, w - 3, 4, STEEL[4]!);
  board(img, "company", w / 2, h - 46, NAVY.slice(1), WHITE, 10, 3);
  for (let y = h - 30; y < h - 4; y++) for (let x = 44; x < 84; x++) setPx(img, x, y, x === 63 || x === 64 ? STEEL[1]! : pick(GLASS, 0.75, x, y, 0.3));
  ground(img, w, h);
  selOutline(img, 0.4);
  return img;
}

// ---------------- ตลาดนัดมือสอง (flea market) ----------------
/** Clothes stall (96 × 80): tarp roof, a rail of second-hand shirts at the back, folded clothes on the table (counterTop 50). */
function fleaClothesStall(tarp: Rgb[], seed: number): () => RgbaImage {
  return () => {
    const w = 96, h = 80;
    const img = createImage(w, h);
    for (const x of [3, w - 5]) for (let y = 10; y < h - 4; y++) { setPx(img, x, y, STEEL[3]!); setPx(img, x + 1, y, STEEL[1]!); }
    for (let y = 4; y < 14; y++) hline(img, 0, w - 1, y, pick(tarp, 0.8 - (y - 4) / 20 - ((y - 4) % 4 === 3 ? 0.2 : 0), 0, y, 0.3));
    for (let x = 0; x < w; x += 6) for (let k = 0; k < 3; k++) setPx(img, x + k, 14 + (k === 1 ? 1 : 0), tarp[1]!);
    board(img, "clothes", w / 2, 16, YELLOW.slice(1), RED[1]!, 5, 2);
    // rail of shirts behind the seller
    hline(img, 6, w - 7, 34, STEEL[4]!);
    for (let i = 0; i < 9; i++) shirt(img, 8 + i * 9, 35, [RED, BLUE, GREEN, YELLOW, PINK, TEAL, WHITEWALL, ORANGE][(i + seed) % 8]!);
    // table with folded clothes + price tags
    rect(img, 6, 50, w - 12, 4, TEAK[4]!);
    for (let y = 54; y < h - 4; y++) hline(img, 6, w - 7, y, pick(TARP, 0.5 - (y - 54) / 60, 6, y, 0.3));
    for (let i = 0; i < 7; i++) { const pal = [BLUE, RED, GREEN, YELLOW, PINK, WHITEWALL, TEAL][(i * 3 + seed) % 7]!; for (let k = 0; k < 3; k++) { rect(img, 10 + i * 11, 47 - k * 2, 9, 2, pal[3 - (k % 2)]!); hline(img, 10 + i * 11, 18 + i * 11, 47 - k * 2, pal[5]!); } }
    board(img, "sale", 70, 58, RED.slice(1), WHITE, 3, 2);
    hline(img, 0, w - 1, h - 4, CONCRETE[4]!);
    for (let y = h - 3; y < h; y++) hline(img, 0, w - 1, y, CONCRETE[2]!);
    selOutline(img, 0.4);
    return img;
  };
}
/** Second-hand goods stall (96 × 80): radios, lamps, shoes, a kettle, books on a mat table (counterTop 50). */
function fleaJunkStall(): RgbaImage {
  const w = 96, h = 80;
  const img = createImage(w, h);
  for (const x of [3, w - 5]) for (let y = 10; y < h - 4; y++) { setPx(img, x, y, TEAK[3]!); setPx(img, x + 1, y, TEAK[1]!); }
  for (let y = 4; y < 14; y++) hline(img, 0, w - 1, y, pick(GREEN, 0.75 - (y - 4) / 20 - ((y >> 1) & 1) * 0.12, 0, y, 0.3));
  board(img, "flea", w / 2, 16, ORANGE.slice(1), WHITE, 4, 2);
  // shelf behind: radios + lamps
  hline(img, 8, w - 9, 40, TEAK[4]!);
  for (let i = 0; i < 4; i++) { bevel(img, 10 + i * 20, 30, 14, 10, [STEEL, TEAK, RED, BLUE][i]!, 2); setPx(img, 14 + i * 20, 34, STEEL[5]!); setPx(img, 20 + i * 20, 33, STEEL[0]!); }
  // table goods
  rect(img, 6, 50, w - 12, 4, TEAK[4]!);
  for (let y = 54; y < h - 4; y++) hline(img, 6, w - 7, y, pick(TEAK, 0.45 - (y - 54) / 70, 6, y, 0.3));
  for (let i = 0; i < 3; i++) { rect(img, 10 + i * 9, 46, 7, 4, [RED, BLUE, TEAK][i]![3]!); hline(img, 10 + i * 9, 16 + i * 9, 46, [RED, BLUE, TEAK][i]![5]!); } // shoes
  for (let y = 42; y < 50; y++) for (let x = 42; x < 52; x++) { const d = Math.hypot(x - 47, y - 46); if (d < 4.5) setPx(img, x, y, pick(STEEL, sphereLight(x - 47, y - 46, 5), x, y, 0.3)); } // kettle
  hline(img, 51, 54, 44, STEEL[3]!);
  for (let i = 0; i < 4; i++) rect(img, 62 + i * 6, 42 + (i % 2), 5, 8 - (i % 2), [YELLOW, GREEN, RED, BLUE][i]![3]!); // books
  hline(img, 0, w - 1, h - 4, CONCRETE[4]!);
  for (let y = h - 3; y < h; y++) hline(img, 0, w - 1, y, CONCRETE[2]!);
  selOutline(img, 0.4);
  return img;
}
/** Free-standing clothes rack (48 × 48). */
function clothesRack(): RgbaImage {
  const img = createImage(48, 48);
  vline(img, 3, 8, 44, STEEL[3]!); vline(img, 44, 8, 44, STEEL[3]!);
  hline(img, 3, 44, 8, STEEL[4]!);
  hline(img, 0, 7, 45, STEEL[2]!); hline(img, 40, 47, 45, STEEL[2]!);
  for (let i = 0; i < 4; i++) shirt(img, 5 + i * 10, 9, [TEAL, YELLOW, RED, BLUE][i]!);
  selOutline(img, 0.4);
  return img;
}
/** Market entrance banner on two tall poles (160 × 64): "ตลาดนัดมือสอง". */
function fleaBanner(): RgbaImage {
  const w = 160, h = 64;
  const img = createImage(w, h);
  for (const x of [2, w - 4]) for (let y = 0; y < h; y++) { setPx(img, x, y, TEAK[3]!); setPx(img, x + 1, y, TEAK[1]!); }
  for (let y = 4; y < 22; y++) hline(img, 6, w - 7, y, pick(ORANGE, 0.7 - (y - 4) / 40, 6, y, 0.3));
  hline(img, 6, w - 7, 4, ORANGE[5]!);
  hline(img, 6, w - 7, 21, ORANGE[1]!);
  signText(img, "flea", Math.round(w / 2 - THAI_SIGNS.flea.width / 2), 8, WHITE, ORANGE[0]);
  for (let x = 8; x < w - 8; x += 8) { setPx(img, x, 23, [RED, YELLOW, GREEN, BLUE][(x / 8) % 4 | 0]![4]!); setPx(img, x + 1, 24, [RED, YELLOW, GREEN, BLUE][(x / 8) % 4 | 0]![3]!); }
  selOutline(img, 0.4);
  return img;
}

export const TOWN_MORE_DRAW = {
  pickup, tuktuk, scooter, songthaew, bus, truck, taxi,
  thaiWoodHouse, modernHouse, kampungHouse, chineseShophouse,
  shophouseStationery: shophouseVariant("#8fb4d8", "stationery", BLUE.slice(1), "paper"),
  shophouseClothes: shophouseVariant("#e3a3b5", "clothes", PINK.slice(1), "clothes"),
  hospital, policeStation, postOffice, bank, districtOffice, companyOffice,
  fleaClothesA: fleaClothesStall(TARP, 0), fleaClothesB: fleaClothesStall(RED, 3), fleaJunk: fleaJunkStall, clothesRack, fleaBanner,
};
