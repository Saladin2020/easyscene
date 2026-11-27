/**
 * More town assets (DSK-6), side view: vehicles (pickup, tuk-tuk, scooter, songthaew, bus, truck, taxi), house styles
 * (Thai wooden stilt house, modern house, Malay kampung house, Chinese shophouse, two shophouse variants), civic
 * buildings (hospital, police station, post office, bank, district office, company office) and a ตลาดนัดมือสอง
 * (second-hand flea market): clothes stalls with shirts on rails, a junk stall, clothes racks, a banner.
 * Procedural and original like the other samples (CC0). Signs are Thai words; no sacred figures, emblems or script decoration.
 * Every vehicle is drawn facing RIGHT (its part has `facing: "right"`).
 */
import { createImage, type RgbaImage } from "../shared/raster.js";
import { type Rgb, alphaAt, bayer, getPx, hash, markNight, mix, pick, ramp, rect, rgb, selOutline, setPx, sphereLight } from "./pixelArt.js";
import { THAI_SIGNS, type ThaiSignKey } from "./thaiSignText.js";
import { TOWN_KIT, shadeRamp, shophouse } from "./sampleTown.js";

const K = TOWN_KIT;
const GLINT = K.pal.GLINT;
const CLOTH = K.pal.CLOTH;
const line = K.line;

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
// Scale (DSK-8): characters are ~39 px tall and doors 56–64 px, so cars are ~36–40 px tall, buses/lorries ~68 px.
type Edge = (y: number) => number;
/** Painted body panel between left(y)..right(y): lit top lip, ramp down, darker sill, slight right-side falloff. */
function shell(img: RgbaImage, y0: number, y1: number, left: Edge, right: Edge, pal: Rgb[], top = 0.86, bottom = 0.34): void {
  for (let y = y0; y <= y1; y++) {
    const a = Math.round(left(y)), b = Math.round(right(y));
    const v = (y - y0) / Math.max(1, y1 - y0);
    for (let x = a; x <= b; x++) {
      let t = top - (top - bottom) * v - ((x - a) / Math.max(1, b - a)) * 0.06;
      if (y === y0) t = 0.98;
      if (x === a && y > y0) t += 0.08;
      setPx(img, x, y, pick(pal, t, x, y, 0.35));
    }
  }
}
/** Tinted glass between left(y)..right(y): sky gradient, dark top seal, two diagonal glare streaks. */
function glass(img: RgbaImage, y0: number, y1: number, left: Edge, right: Edge, seed = 0): void {
  for (let y = y0; y <= y1; y++) {
    const a = Math.round(left(y)), b = Math.round(right(y));
    for (let x = a; x <= b; x++) {
      let c = y === y0 ? GLASS[0]! : pick(GLASS, 0.78 - ((y - y0) / Math.max(1, y1 - y0)) * 0.5 - ((x - a) / Math.max(1, b - a)) * 0.1, x, y, 0.35);
      const d = (x + (y - y0) * 1.3 + seed) % 23;
      if (y > y0 && d >= 3 && d < 6) c = mix(c, GLINT, 0.6);
      else if (y > y0 && d >= 8 && d < 9) c = mix(c, GLINT, 0.35);
      setPx(img, x, y, c);
    }
  }
}
/** Dark wheel well cut into the body above the axle. */
function wheelWell(img: RgbaImage, cx: number, cy: number, r: number): void {
  for (let y = cy - r - 2; y <= cy; y++) for (let x = cx - r - 2; x <= cx + r + 2; x++) {
    const d = Math.hypot(x - cx, y - cy);
    if (d > r + 2.3 || !alphaAt(img, x, y)) continue;
    setPx(img, x, y, d > r + 1.3 ? mix(getPx(img, x, y), SHADOW, 0.45) : rgb("#16141c"));
  }
}
/** Tyre + alloy rim: tread highlight top-left, lit rim, spokes, hub cap, darker lower-right. */
function tyre(img: RgbaImage, cx: number, cy: number, r: number, rim: Rgb[] = STEEL): void {
  for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
    const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy);
    if (d > r + 0.35) continue;
    const lit = (-dx - dy) / (r * 2);
    let c: Rgb;
    if (d > r - 2.2) c = d > r - 0.8 && lit > 0.12 ? TIRE[3]! : pick(TIRE, 0.45 + lit * 0.8, x, y, 0.2);
    else if (d > r - 3.2) c = pick(rim, 0.7 + lit, x, y, 0.2);
    else if (d < 1.5) c = rim[5]!;
    else {
      const ang = Math.atan2(dy, dx);
      const spoke = Math.abs(Math.sin(ang * 2.5)) < 0.32;
      c = spoke ? pick(rim, 0.62 + lit * 0.8, x, y, 0.2) : rgb("#24222c");
    }
    setPx(img, x, y, c);
  }
}
function lamp(img: RgbaImage, x: number, y: number, w: number, h: number): void {
  rect(img, x, y, w, h, WARM[3]!);
  hline(img, x, x + w - 1, y, WARM[4]!);
  setPx(img, x + w - 1, y + h - 1, WARM[1]!);
  markNight(img, "light", () => rect(img, x, y, w, h, WARM[4]!));
}
function tail(img: RgbaImage, x: number, y: number, w: number, h: number): void {
  rect(img, x, y, w, h, RED[2]!);
  for (let yy = 0; yy < h - 1; yy++) setPx(img, x, y + yy, RED[4]!);
}
function chrome(img: RgbaImage, x0: number, x1: number, y0: number, h: number): void {
  for (let y = y0; y < y0 + h; y++) hline(img, x0, x1, y, y === y0 ? STEEL[5]! : y === y0 + h - 1 ? STEEL[1]! : STEEL[3]!);
}
function seam(img: RgbaImage, x: number, y0: number, y1: number, pal: Rgb[]): void {
  for (let y = y0; y <= y1; y++) { if (alphaAt(img, x, y)) setPx(img, x, y, pal[1]!); if (alphaAt(img, x + 1, y)) setPx(img, x + 1, y, mix(getPx(img, x + 1, y), WHITE, 0.18)); }
}
/** Soft contact shadow along the bottom row between the wheels. */
function contact(img: RgbaImage, x0: number, x1: number): void {
  const y = img.height - 1;
  for (let x = x0; x <= x1; x++) if (!alphaAt(img, x, y)) setPx(img, x, y, SHADOW, 80);
}
/** Finish: own-colour outline, then re-stamp lamps so the outline never dims them. */
function finishVehicle(img: RgbaImage, lamps: () => void, shadow: [number, number]): RgbaImage {
  selOutline(img, 0.45);
  lamps();
  contact(img, shadow[0], shadow[1]);
  return img;
}
const PAINT_WHITE = ramp("#6e7284", "#9498a6", "#b8bcc4", "#d6d8da", "#ecece6", "#fbfaf4");
const PAINT_RED = shadeRamp("#c4302c");
const PAINT_TEAL = shadeRamp("#23a092");
const PAINT_BLUE = shadeRamp("#2f6cc8");
const PAINT_PINK = shadeRamp("#ec5e98");
const PAINT_ORANGE = shadeRamp("#ec7a1e");
const PAINT_GREEN = shadeRamp("#3a8c4e");
const BOX_GREY = ramp("#4a5060", "#6c7484", "#8e96a4", "#b0b8c2", "#d0d6dc", "#eef2f4");

/** White pickup (96 × 40): cab with windscreen + side window, open bed with crates and a tarp bundle. */
function pickup(): RgbaImage {
  const img = createImage(96, 40);
  const P = PAINT_WHITE;
  // cargo in the bed (behind the side panel)
  bevel(img, 9, 9, 14, 9, TEAK, 3); vline(img, 16, 10, 16, TEAK[1]!); hline(img, 10, 21, 13, TEAK[2]!);
  for (let y = 11; y < 18; y++) for (let x = 25; x < 44; x++) if (Math.hypot((x - 34) / 10, (y - 17) / 7) < 1) setPx(img, x, y, pick(TARP, 0.85 - (y - 11) / 12 - (x - 25) / 60, x, y, 0.4));
  line(img, 26, 15, 42, 13, TARP[0]!);
  // cab
  shell(img, 5, 17, (y) => 51 - (y < 7 ? 7 - y : 0), (y) => 67 + (y - 5) * 1.1, P);
  glass(img, 7, 14, () => 54, (y) => 63 + (y - 7) * 0.5, 2); // side window
  glass(img, 7, 15, (y) => 66 + (y - 7) * 1.1, (y) => 68 + (y - 7) * 1.1, 0); // windscreen edge
  vline(img, 65, 7, 16, P[2]!);
  // lower body (bed + cab + hood)
  shell(img, 17, 31, (y) => (y === 17 ? 4 : y === 31 ? 4 : 3), (y) => (y === 31 ? 91 : 92), P, 0.82, 0.4);
  shell(img, 14, 17, () => 79, (y) => 88 + (y - 14), P, 0.95, 0.8); // hood
  hline(img, 3, 49, 17, P[5]!); hline(img, 5, 47, 18, P[1]!); // bed rail + inner lip
  hline(img, 4, 91, 22, P[5]!); hline(img, 4, 91, 23, P[2]!); // beltline crease
  seam(img, 50, 17, 29, P); seam(img, 70, 17, 29, P);
  hline(img, 64, 67, 20, STEEL[3]!); hline(img, 44, 46, 20, STEEL[3]!);
  rect(img, 69, 13, 3, 3, P[1]!); setPx(img, 69, 13, P[4]!); // mirror
  hline(img, 4, 91, 30, P[1]!);
  wheelWell(img, 20, 32, 7); wheelWell(img, 76, 32, 7);
  chrome(img, 2, 8, 27, 3); chrome(img, 87, 94, 27, 3);
  rect(img, 88, 23, 5, 3, STEEL[1]!); for (let x = 88; x < 93; x += 2) setPx(img, x, 24, STEEL[3]!); // grille
  tyre(img, 20, 32, 7); tyre(img, 76, 32, 7);
  return finishVehicle(img, () => { lamp(img, 91, 19, 3, 2); tail(img, 3, 19, 2, 3); }, [10, 86]);
}

/** Blue tuk-tuk (72 × 44): canopy roof with fringe, open bench for passengers, driver cowl and windscreen. */
function tuktuk(): RgbaImage {
  const img = createImage(72, 44);
  const P = PAINT_BLUE;
  // posts
  for (const x of [6, 46]) { vline(img, x, 9, 30, STEEL[4]!); vline(img, x + 1, 9, 30, STEEL[2]!); }
  // bench + interior
  for (let y = 12; y < 24; y++) hline(img, 8, 45, y, mix(rgb("#2a2238"), P[0]!, 0.3));
  bevel(img, 10, 14, 26, 9, RED, 3); hline(img, 11, 34, 18, RED[2]!);
  vline(img, 30, 10, 22, STEEL[3]!); // grab pole
  // canopy roof
  shell(img, 2, 8, (y) => 4 - (y > 3 ? 1 : 0) + (y === 2 ? 2 : 0), (y) => 58 + (y === 2 ? -2 : 0), P, 0.95, 0.55);
  hline(img, 3, 57, 3, P[5]!);
  for (let x = 3; x <= 58; x++) { const k = x % 6; setPx(img, x, 9, k < 3 ? YELLOW[4]! : WHITE); if (k === 1 || k === 4) setPx(img, x, 10, k < 3 ? YELLOW[2]! : CLOTH[1]!); }
  // body
  shell(img, 23, 35, (y) => (y < 25 ? 4 : 3), () => 52, P, 0.8, 0.38);
  shell(img, 14, 35, (y) => 48 - (y < 16 ? 0 : 0), (y) => Math.min(69, 58 + (y - 14) * 0.8), P, 0.9, 0.36); // driver cowl
  glass(img, 9, 17, (y) => 54 + (y - 9) * 0.4, (y) => 58 + (y - 9) * 0.5, 1); // windscreen
  vline(img, 53, 9, 18, STEEL[2]!);
  hline(img, 4, 68, 27, YELLOW[3]!); hline(img, 4, 68, 28, YELLOW[1]!); // trim stripe
  for (let x = 8; x < 44; x += 6) setPx(img, x, 31, P[5]!); // rivets
  hline(img, 50, 56, 20, TIRE[1]!); hline(img, 50, 50, 19, STEEL[4]!); // handlebar
  rect(img, 6, 33, 10, 2, STEEL[3]!); // step
  wheelWell(img, 20, 36, 7); wheelWell(img, 60, 36, 7);
  tyre(img, 20, 36, 7); tyre(img, 60, 36, 7);
  return finishVehicle(img, () => { lamp(img, 67, 22, 2, 3); tail(img, 3, 25, 2, 3); }, [12, 66]);
}

/** Teal scooter (48 × 32): rounded rear cowl, dark seat, leg shield, front fender, mirrors. */
function scooter(): RgbaImage {
  const img = createImage(48, 32);
  const P = PAINT_TEAL;
  line(img, 34, 10, 39, 25, STEEL[2]!); line(img, 35, 10, 40, 25, STEEL[4]!); // fork
  shell(img, 13, 23, (y) => 4 + Math.abs(y - 18) * 0.55, (y) => 24 - (y > 20 ? (y - 20) * 2 : 0), P, 0.9, 0.35); // rear cowl
  shell(img, 20, 23, () => 18, () => 34, STEEL, 0.6, 0.3); // floorboard
  shell(img, 7, 22, (y) => 33 - (y - 7) * 0.12, (y) => 37 + (y - 7) * 0.25, P, 0.92, 0.42); // leg shield
  for (let x = 32; x <= 45; x++) { const y = 17 + Math.round(((x - 39) ** 2) / 22); setPx(img, x, y, P[4]!); setPx(img, x, y + 1, P[2]!); } // front fender
  for (let x = 6; x <= 22; x++) { setPx(img, x, 11, TIRE[3]!); setPx(img, x, 12, TIRE[2]!); } for (let x = 7; x <= 21; x++) setPx(img, x, 10, TIRE[3]!); // seat
  hline(img, 31, 40, 6, TIRE[1]!); setPx(img, 40, 6, STEEL[4]!); // handlebar
  for (let y = 1; y < 6; y++) setPx(img, 34, y, STEEL[3]!); rect(img, 33, 1, 3, 2, STEEL[4]!); // mirror
  chrome(img, 2, 13, 24, 2); // exhaust
  hline(img, 6, 20, 16, P[5]!); // body crease highlight
  tyre(img, 9, 25, 6); tyre(img, 39, 25, 6);
  return finishVehicle(img, () => { lamp(img, 38, 8, 2, 2); tail(img, 4, 15, 2, 2); }, [4, 44]);
}

/** Red songthaew (112 × 52): roof rack, open-sided passenger box with bars and benches, cab, long hood. */
function songthaew(): RgbaImage {
  const img = createImage(112, 52);
  const P = PAINT_RED;
  // roof rack
  for (const x of [6, 26, 46, 64]) vline(img, x, 3, 7, STEEL[3]!);
  hline(img, 4, 66, 3, STEEL[5]!); hline(img, 4, 66, 4, STEEL[2]!);
  // passenger box roof + open window band
  shell(img, 7, 11, () => 3, () => 68, P, 0.98, 0.6);
  hline(img, 3, 68, 12, YELLOW[4]!);
  for (let y = 13; y < 25; y++) for (let x = 5; x < 66; x++) setPx(img, x, y, mix(rgb("#2a2034"), P[0]!, 0.25 + (y - 13) * 0.02));
  hline(img, 6, 64, 15, STEEL[4]!); // grab rail
  for (let x = 8; x < 66; x += 9) { vline(img, x, 13, 24, STEEL[4]!); vline(img, x + 1, 13, 24, STEEL[2]!); }
  for (let x = 6; x < 64; x++) if ((x >> 2) % 3 !== 2) { setPx(img, x, 23, TEAK[4]!); setPx(img, x, 24, TEAK[2]!); } // bench backs
  // cab
  shell(img, 10, 26, () => 68, (y) => 86 + (y - 10) * 0.75, P);
  glass(img, 13, 22, () => 71, (y) => 80 + (y - 13) * 0.4, 3);
  glass(img, 12, 24, (y) => 85 + (y - 12) * 0.75, (y) => 87 + (y - 12) * 0.75, 0);
  // lower body + hood
  shell(img, 25, 42, (y) => (y < 27 ? 4 : 3), (y) => (y > 40 ? 106 : 107), P, 0.82, 0.36);
  shell(img, 22, 26, () => 97, (y) => 104 + (y - 22) * 0.75, P, 0.95, 0.78);
  hline(img, 3, 106, 28, YELLOW[3]!); hline(img, 3, 106, 29, YELLOW[1]!);
  seam(img, 69, 25, 40, P); seam(img, 88, 25, 40, P);
  hline(img, 83, 86, 31, STEEL[4]!);
  rect(img, 88, 18, 3, 4, P[1]!); setPx(img, 88, 18, P[4]!);
  rect(img, 3, 38, 12, 3, STEEL[3]!); hline(img, 3, 14, 38, STEEL[5]!); // rear step
  wheelWell(img, 26, 43, 8); wheelWell(img, 90, 43, 8);
  chrome(img, 2, 8, 37, 3); chrome(img, 102, 109, 37, 3);
  tyre(img, 26, 43, 8); tyre(img, 90, 43, 8);
  return finishVehicle(img, () => { lamp(img, 106, 30, 3, 3); tail(img, 3, 30, 2, 4); }, [12, 104]);
}

/** Orange city bus (176 × 68): cream upper deck with a window band, orange skirt, two doors, roof AC pod, lit route board. */
function bus(): RgbaImage {
  const img = createImage(176, 68);
  const U = PAINT_WHITE, L = PAINT_ORANGE;
  shell(img, 2, 5, (y) => 62 + (5 - y), (y) => 112 - (5 - y), BOX_GREY, 0.95, 0.6); // AC pod
  for (let x = 66; x < 108; x += 4) setPx(img, x, 4, BOX_GREY[1]!);
  const L0 = (y: number) => 2 + (y < 10 ? 10 - y : 0) * 0.5;
  const R0 = (y: number) => 173 - (y < 10 ? (10 - y) * 0.7 : 0);
  shell(img, 6, 33, L0, R0, U, 0.95, 0.62);
  shell(img, 34, 56, () => 2, () => 173, L, 0.84, 0.38);
  hline(img, 2, 173, 34, L[1]!); hline(img, 2, 173, 35, L[5]!);
  hline(img, 2, 173, 44, L[5]!); hline(img, 2, 173, 45, L[2]!);
  // window band
  for (let x = 8; x < 140; x += 16) if (x < 88 || x > 106) glass(img, 12, 28, () => x, () => x + 13, x);
  for (let x = 8; x < 141; x++) { setPx(img, x, 29, U[1]!); setPx(img, x, 11, U[2]!); }
  // doors
  for (const dx of [90, 148]) { glass(img, 12, 54, () => dx, () => dx + 13, dx); vline(img, dx + 6, 12, 54, STEEL[2]!); vline(img, dx + 7, 12, 54, STEEL[4]!); bevel(img, dx - 1, 11, 16, 2, STEEL, 3); }
  // windscreen + route board
  glass(img, 13, 36, () => 165, (y) => 171, 4);
  rect(img, 150, 7, 21, 4, rgb("#1c1820"));
  markNight(img, "light", () => { for (let x = 152; x < 169; x++) if (x % 3) setPx(img, x, 8, ORANGE[4]!); for (let x = 152; x < 169; x++) if ((x + 1) % 4) setPx(img, x, 9, ORANGE[3]!); });
  for (let y = 40; y < 52; y += 2) hline(img, 6, 18, y, L[1]!); // engine vent
  rect(img, 163, 47, 9, 3, STEEL[1]!); // grille
  wheelWell(img, 36, 58, 9); wheelWell(img, 142, 58, 9);
  chrome(img, 2, 8, 52, 3); chrome(img, 160, 174, 52, 3);
  hline(img, 2, 173, 56, L[0]!);
  tyre(img, 36, 58, 9); tyre(img, 142, 58, 9);
  return finishVehicle(img, () => { lamp(img, 170, 44, 3, 3); tail(img, 3, 40, 2, 5); }, [6, 170]);
}

/** Lorry (160 × 68): ribbed grey box with a green stripe, tandem rear axle, green cab, exhaust stack, big mirror. */
function truck(): RgbaImage {
  const img = createImage(160, 68);
  const C = PAINT_GREEN;
  // cargo box with corrugated ribs
  for (let y = 4; y <= 48; y++) for (let x = 3; x <= 112; x++) {
    const k = (x - 3) % 6;
    let t = (k === 0 ? 0.92 : k < 3 ? 0.7 : k < 5 ? 0.55 : 0.32) - ((y - 4) / 44) * 0.2;
    if (y === 4) t = 1;
    setPx(img, x, y, pick(BOX_GREY, t, x, y, 0.25));
  }
  for (let y = 36; y < 41; y++) hline(img, 3, 112, y, pick(C, y === 36 ? 0.95 : 0.6 - (y - 36) * 0.06, 3, y, 0.2));
  hline(img, 3, 112, 47, BOX_GREY[1]!); hline(img, 3, 112, 48, BOX_GREY[0]!);
  vline(img, 5, 6, 46, BOX_GREY[1]!); for (const y of [10, 28, 44]) rect(img, 3, y, 3, 2, STEEL[1]!); // rear hinges
  // stains running down from the roof
  for (let x = 4; x < 112; x++) if (hash(x, 3, 77) > 0.8) for (let k = 0; k < 3 + hash(x, 4, 77) * 9; k++) setPx(img, x, 5 + k, mix(getPx(img, x, 5 + k), BOX_GREY[1]!, 0.35));
  // chassis
  rect(img, 3, 49, 154, 4, STEEL[0]!); hline(img, 3, 156, 49, STEEL[2]!);
  // cab
  vline(img, 114, 1, 34, STEEL[5]!); vline(img, 115, 1, 34, STEEL[2]!); rect(img, 113, 0, 3, 2, STEEL[1]!); // exhaust
  shell(img, 12, 52, (y) => 117 + (y < 14 ? 14 - y : 0), (y) => Math.min(156, 148 + (y - 12) * 0.5), C);
  glass(img, 16, 30, () => 121, () => 141, 6);
  glass(img, 15, 31, (y) => 147 + (y - 15) * 0.5, (y) => 150 + (y - 15) * 0.5, 0);
  hline(img, 118, 155, 33, C[5]!); hline(img, 118, 155, 34, C[1]!);
  seam(img, 118, 15, 50, C); seam(img, 144, 15, 50, C);
  hline(img, 137, 141, 37, STEEL[4]!);
  vline(img, 156, 16, 24, STEEL[2]!); rect(img, 156, 18, 2, 6, STEEL[1]!); setPx(img, 156, 18, STEEL[4]!); // mirror arm
  rect(img, 120, 46, 18, 3, STEEL[3]!); hline(img, 120, 137, 46, STEEL[5]!); // step
  for (let y = 38; y < 46; y += 2) hline(img, 151, 155, y, C[1]!); // grille
  wheelWell(img, 26, 58, 9); wheelWell(img, 48, 58, 9); wheelWell(img, 134, 58, 9);
  chrome(img, 148, 158, 52, 3);
  tyre(img, 26, 58, 9); tyre(img, 48, 58, 9); tyre(img, 134, 58, 9);
  return finishVehicle(img, () => { lamp(img, 154, 42, 3, 3); tail(img, 3, 41, 2, 5); }, [10, 152]);
}

/** Pink taxi (88 × 36): sedan with roof sign, two doors, chrome trim. */
function taxi(): RgbaImage {
  const img = createImage(88, 36);
  const P = PAINT_PINK;
  bevel(img, 37, 1, 12, 3, YELLOW, 3); // roof sign (lit at night)
  markNight(img, "light", () => rect(img, 38, 2, 10, 1, YELLOW[5]!));
  shell(img, 4, 14, (y) => 28 - (y - 4) * 1.4, (y) => 54 + (y - 4) * 2.1, P, 0.95, 0.7);
  glass(img, 6, 13, (y) => 28 - (y - 6) * 1.3, (y) => 53 + (y - 6) * 2.0, 5);
  vline(img, 44, 6, 13, P[2]!); vline(img, 45, 6, 13, P[4]!);
  shell(img, 14, 28, (y) => (y === 14 ? 6 : y === 15 ? 3 : 2), (y) => (y === 14 ? 78 : y === 15 ? 83 : 85), P, 0.84, 0.38);
  hline(img, 3, 84, 19, P[5]!); hline(img, 3, 84, 20, P[2]!);
  seam(img, 43, 14, 26, P); seam(img, 63, 14, 26, P);
  hline(img, 38, 40, 18, STEEL[4]!); hline(img, 58, 60, 18, STEEL[4]!);
  rect(img, 64, 12, 3, 3, P[1]!); setPx(img, 64, 12, P[4]!);
  hline(img, 6, 82, 25, STEEL[4]!); // chrome rub strip
  wheelWell(img, 17, 29, 6); wheelWell(img, 71, 29, 6);
  chrome(img, 1, 6, 24, 3); chrome(img, 81, 86, 24, 3);
  tyre(img, 17, 29, 6); tyre(img, 71, 29, 6);
  return finishVehicle(img, () => { lamp(img, 83, 16, 3, 2); tail(img, 2, 16, 2, 3); }, [8, 80]);
}

// ---------------- building kit (DSK-8: same primitives as the town set) ----------------
const { ledge, plinth, glassPane, pottedPlant, acUnit, awning, redLantern, shadeArea, lightArea, tinRoof, ball } = K;
const renderWall = K.wall;
const TERRA = K.pal.TERRA;
const BLUE_POT = K.pal.BLUE_POT;
const TIN = K.pal.TIN;
const WALL_CREAM = shadeRamp("#e6d2a2");
const WALL_WHITE = ramp("#7c8090", "#a2a6b0", "#c4c8cc", "#e0e2e0", "#f2f2ec", "#ffffff");

/** Tiled roof seen from the long side: rows of overlapping tiles (lit lip, dark under-lap), ridge cap, fascia, eave shadow. */
function tileRoof(img: RgbaImage, x0: number, x1: number, yEave: number, h: number, pal: Rgb[], inset: number, seed: number, fascia: Rgb[] = TEAK): void {
  for (let y = yEave - h; y <= yEave; y++) {
    const v = (y - (yEave - h)) / h; // 0 at ridge, 1 at eave
    const flare = v > 0.82 ? (v - 0.82) * 1.6 : 0; // eaves flare out a little
    const a = Math.round(x0 + inset * (1 - v) - flare * 6), b = Math.round(x1 - inset * (1 - v) + flare * 6);
    const row = Math.floor((y - (yEave - h)) / 3), ry = (y - (yEave - h)) % 3;
    for (let x = a; x <= b; x++) {
      const col = (x + row * 3) % 6;
      let t = 0.72 - v * 0.2 - ((x - a) / Math.max(1, b - a)) * 0.12 + (hash(x >> 1, row, seed) - 0.5) * 0.12;
      if (ry === 0) t += 0.2; else if (ry === 2) t -= 0.3;
      if (col === 0 && ry > 0) t -= 0.22;
      if (x === a) t += 0.15;
      setPx(img, x, y, pick(pal, t, x, y, 0.3));
    }
  }
  const a = x0 + inset, b = x1 - inset;
  hline(img, a, b, yEave - h, pal[5]!);
  hline(img, a, b, yEave - h + 1, pal[4]!);
  // fascia board + eave shadow on whatever is under it
  const fa = x0 - 5, fb = x1 + 5;
  hline(img, fa, fb, yEave + 1, fascia[4]!);
  hline(img, fa, fb, yEave + 2, fascia[2]!);
  shadeArea(img, fa, yEave + 3, fb - fa + 1, 4, 0.34);
  shadeArea(img, fa, yEave + 7, fb - fa + 1, 2, 0.28, true);
}
/** Thai panel wall (ฝาปะกน): teak stiles + rails framing recessed panels lit top-left. */
function panelWall(img: RgbaImage, x0: number, y0: number, w: number, h: number, pal: Rgb[], cell = 12): void {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    const cx = (x - x0) % cell, cy = (y - y0) % 14;
    let t: number;
    if (cx < 2 || cy < 2) t = cx === 0 || cy === 0 ? 0.82 : 0.6; // frame
    else if (cx === 2 || cy === 2) t = 0.25; // inner shadow
    else if (cx === cell - 1 || cy === 13) t = 0.72; // lit lower-right lip
    else t = 0.5 + (hash(Math.floor((x - x0) / cell), Math.floor((y - y0) / 14), 3) - 0.5) * 0.15;
    t -= ((x - x0) / w) * 0.08;
    setPx(img, x, y, pick(pal, t, x, y, 0.25));
  }
}
/** Vertical board siding with batten seams and light grain. */
function boards(img: RgbaImage, x0: number, y0: number, w: number, h: number, pal: Rgb[], seed: number, step = 5): void {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    const k = (x - x0) % step;
    let t = 0.62 + (hash(Math.floor((x - x0) / step), 0, seed) - 0.5) * 0.18 - ((y - y0) / h) * 0.12;
    if (k === 0) t = 0.2; else if (k === 1) t += 0.18;
    if (hash(x, y >> 2, seed) > 0.93) t -= 0.1;
    setPx(img, x, y, pick(pal, t, x, y, 0.3));
  }
}
/** Horizontal clapboard / plank siding with shadowed laps. */
function clapboard(img: RgbaImage, x0: number, y0: number, w: number, h: number, pal: Rgb[], seed: number): void {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    const row = Math.floor((y - y0) / 4), ry = (y - y0) % 4;
    let t = 0.6 + (hash(row, Math.floor((x + row * 11) / 29), seed) - 0.5) * 0.2 - ((x - x0) / w) * 0.08;
    if (ry === 0) t += 0.18; else if (ry === 3) t -= 0.28;
    if ((x - x0 + row * 11) % 29 === 0) t -= 0.25;
    setPx(img, x, y, pick(pal, t, x, y, 0.25));
  }
}
/** Brick texture (running bond) with mortar and a few darker bricks. */
function brick(img: RgbaImage, x0: number, y0: number, w: number, h: number, pal: Rgb[], mortar: Rgb, seed: number): void {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    const row = Math.floor((y - y0) / 4), ry = (y - y0) % 4, bx = (x - x0 + (row % 2) * 4) % 8;
    if (ry === 3 || bx === 0) { setPx(img, x, y, mortar); continue; }
    let t = 0.55 + (hash(Math.floor((x - x0 + (row % 2) * 4) / 8), row, seed) - 0.5) * 0.35;
    if (ry === 0) t += 0.15;
    setPx(img, x, y, pick(pal, t, x, y, 0.3));
  }
}
/** Framed window: lintel hood with shadow, frame, glass with interior (curtains/lamp), mullions, sill. */
function framedWindow(img: RgbaImage, x: number, y: number, w: number, h: number, frame: Rgb[], o: { panes?: number; curtain?: Rgb; lit?: boolean; hood?: Rgb[]; seed?: number } = {}): void {
  const seed = o.seed ?? x * 7 + y;
  if (o.hood) { bevel(img, x - 3, y - 4, w + 6, 3, o.hood, 3); shadeArea(img, x - 2, y - 1, w + 4, 2, 0.3); }
  bevel(img, x - 2, y - 2, w + 4, h + 4, frame, 3);
  glassPane(img, x, y, w, h, (xx, yy) => {
    if (o.curtain && (xx < w * 0.28 || xx > w * 0.72)) { const f = xx % 3; return f === 0 ? mix(o.curtain, SHADOW, 0.3) : f === 1 ? o.curtain : mix(o.curtain, WHITE, 0.3); }
    return mix(rgb("#2a2238"), WARM[1]!, hash(Math.floor(xx / 6), 1, seed) > 0.6 ? 0.35 : 0.08);
  }, 0.3, o.lit === false ? "window" : "window-lit");
  const panes = o.panes ?? 2;
  for (let i = 1; i < panes; i++) vline(img, x + Math.round((i * w) / panes), y, y + h - 1, frame[4]!);
  hline(img, x - 3, x + w + 2, y + h + 2, frame[5]!);
  hline(img, x - 3, x + w + 2, y + h + 3, frame[2]!);
  shadeArea(img, x - 2, y + h + 4, w + 4, 1, 0.25);
}
/** Louvred / panel shutters folded open on both sides of a window. */
function shutters(img: RgbaImage, x: number, y: number, w: number, h: number, pal: Rgb[]): void {
  for (const sx of [x - 2 - Math.ceil(w / 2), x + w + 2]) {
    bevel(img, sx, y - 2, Math.ceil(w / 2), h + 4, pal, 3);
    for (let yy = y; yy < y + h; yy += 2) hline(img, sx + 1, sx + Math.ceil(w / 2) - 2, yy, pal[1]!);
  }
}
/** Panelled timber door in a frame with a step and a brass knob. */
function panelDoor(img: RgbaImage, x: number, y: number, w: number, h: number, pal: Rgb[], frame: Rgb[] = TEAK, double = false): void {
  bevel(img, x - 2, y - 2, w + 4, h + 2, frame, 2);
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
    const lx = double ? xx % Math.ceil(w / 2) : xx, pw = double ? Math.ceil(w / 2) : w;
    const inPanel = lx > 1 && lx < pw - 2 && ((yy > 2 && yy < h * 0.45) || (yy > h * 0.5 && yy < h - 3));
    let t = 0.58 - (xx / w) * 0.15;
    if (inPanel) t -= 0.16;
    if (lx === 1 || yy === 1) t += 0.18;
    setPx(img, x + xx, y + yy, pick(pal, t, x + xx, y + yy, 0.25));
  }
  if (double) vline(img, x + Math.ceil(w / 2) - 1, y, y + h - 1, pal[0]!);
  setPx(img, x + (double ? Math.ceil(w / 2) - 3 : w - 3), y + Math.floor(h * 0.5), YELLOW[4]!);
}
/** Balcony / veranda rail: lit top bar, balusters, bottom bar, cast shadow behind. */
function rail(img: RgbaImage, x0: number, x1: number, y: number, h: number, pal: Rgb[], step = 3): void {
  shadeArea(img, x0, y + 1, x1 - x0 + 1, h, 0.18, true);
  hline(img, x0, x1, y, pal[5]!); hline(img, x0, x1, y + 1, pal[2]!);
  for (let x = x0; x <= x1; x += step) { vline(img, x, y + 2, y + h - 1, pal[3]!); if (x + 1 <= x1) setPx(img, x + 1, y + 2, pal[1]!); }
  hline(img, x0, x1, y + h, pal[4]!); hline(img, x0, x1, y + h + 1, pal[1]!);
}
/** Stainless rooftop water tank on a steel stand. */
function waterTank(img: RgbaImage, cx: number, baseY: number, r = 7): void {
  for (const dx of [-r + 2, r - 2]) vline(img, cx + dx, baseY - 4, baseY, STEEL[1]!);
  hline(img, cx - r + 1, cx + r - 1, baseY - 4, STEEL[3]!);
  for (let y = baseY - 4 - r * 2; y < baseY - 4; y++) for (let x = cx - r; x <= cx + r; x++) {
    const u = (x - cx) / r;
    if (Math.abs(u) > 1) continue;
    let t = 0.92 - Math.abs(u + 0.35) * 0.7;
    if ((y - (baseY - 4 - r * 2)) % 5 === 0) t -= 0.25;
    setPx(img, x, y, pick(STEEL, t, x, y, 0.2));
  }
  for (let x = cx - r + 2; x <= cx + r - 2; x++) setPx(img, x, baseY - 5 - r * 2, STEEL[4]!);
}
/** Wall lamp: bracket + warm shade, lit at night. */
function wallLamp(img: RgbaImage, x: number, y: number): void {
  hline(img, x, x + 2, y, STEEL[1]!);
  rect(img, x + 1, y + 1, 3, 3, WARM[2]!); setPx(img, x + 1, y + 1, WARM[3]!);
  markNight(img, "light", () => rect(img, x + 1, y + 1, 3, 3, WARM[4]!));
}
/** Sign board with a Thai word; `lit` makes the face glow at night. Returns its box. */
function signBoard(img: RgbaImage, key: ThaiSignKey, cx: number, y: number, pal: Rgb[], text: Rgb, o: { padX?: number; padY?: number; lit?: boolean; trim?: Rgb } = {}): { x: number; w: number; h: number } {
  const s = THAI_SIGNS[key];
  const padX = o.padX ?? 5, padY = o.padY ?? 3;
  const w = s.width + padX * 2, h = s.height + padY * 2;
  const x = Math.round(cx - w / 2);
  bevel(img, x - 1, y - 1, w + 2, h + 2, STEEL, 1);
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) setPx(img, x + xx, y + yy, pick(pal, 0.68 - yy / (h * 2.4) - (xx / w) * 0.08, x + xx, y + yy, 0.3));
  hline(img, x, x + w - 1, y, pal[pal.length - 1]!);
  if (o.trim) { hline(img, x + 1, x + w - 2, y + 1, o.trim); hline(img, x + 1, x + w - 2, y + h - 2, o.trim); }
  const draw = () => signText(img, key, x + padX, y + padY, text, pal[0]);
  if (o.lit) markNight(img, "light", draw); else draw();
  shadeArea(img, x - 1, y + h + 1, w + 2, 2, 0.3);
  return { x, w, h };
}
/** Under-floor shade of a stilt house: dark earth fading downwards, dithered. */
function underShade(img: RgbaImage, x0: number, x1: number, y0: number, y1: number): void {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const v = (y - y0) / Math.max(1, y1 - y0);
    if (v > 0.6 && bayer(x, y) < (v - 0.6) * 2.2) continue;
    setPx(img, x, y, mix(rgb("#3a3036"), rgb("#6a5a50"), v * 0.6 + hash(x, y, 9) * 0.08));
  }
}
function post(img: RgbaImage, x: number, y0: number, y1: number, pal: Rgb[], w = 3): void {
  for (let y = y0; y <= y1; y++) { setPx(img, x, y, pal[4]!); for (let k = 1; k < w - 1; k++) setPx(img, x + k, y, pal[3]!); setPx(img, x + w - 1, y, pal[1]!); }
}
/** Glazed water jar (โอ่ง). */
function jar(img: RgbaImage, cx: number, baseY: number): void {
  const J = ramp("#2a1a16", "#4a2c1e", "#6c4028", "#8e5a34", "#b07a48", "#d6a06a");
  ball(img, cx, baseY - 6, 6, J);
  hline(img, cx - 3, cx + 3, baseY - 12, J[1]!); hline(img, cx - 3, cx + 3, baseY - 13, J[4]!);
  hline(img, cx - 3, cx + 3, baseY, J[0]!);
}

// ---------------- houses ----------------
/** Thai wooden house on stilts (112 × 112): steep flared tile roof, ฝาปะกน panel walls, open shutters, stair, jar + bench under the floor. */
function thaiWoodHouse(): RgbaImage {
  const w = 112, h = 112;
  const img = createImage(w, h);
  underShade(img, 12, 100, 72, h - 4);
  for (let x = 22; x < 48; x++) { setPx(img, x, 98, x % 3 ? TEAK[5]! : TEAK[3]!); setPx(img, x, 99, TEAK[2]!); } // bamboo bench (แคร่)
  for (const x of [23, 46]) vline(img, x, 100, h - 4, TEAK[1]!);
  jar(img, 70, h - 4);
  for (const x of [13, 35, 57, 79, 97]) post(img, x, 70, h - 4, TEAK);
  // floor beam + walls
  bevel(img, 8, 68, 96, 4, TEAK, 3);
  panelWall(img, 12, 38, 88, 30, TEAK);
  for (const wx of [22, 76]) { shutters(img, wx, 45, 12, 14, TEAK); framedWindow(img, wx, 45, 12, 14, TEAK, { panes: 1, curtain: rgb("#e8dcc0") }); }
  panelDoor(img, 48, 44, 16, 24, TEAK, TEAK, true);
  wallLamp(img, 66, 42);
  // roof
  tileRoof(img, 4, 107, 35, 31, ROOF_TILE, 20, 3);
  // stair to the door with a hand rail
  for (let i = 0; i < 10; i++) { const sx = 46 - i * 3, sy = 72 + i * 4; hline(img, sx - 3, sx + 2, sy, TEAK[5]!); hline(img, sx - 3, sx + 2, sy + 1, TEAK[2]!); }
  line(img, 49, 72, 19, h - 4, TEAK[1]!); line(img, 49, 64, 19, h - 12, TEAK[4]!); line(img, 49, 65, 19, h - 11, TEAK[2]!);
  pottedPlant(img, 6, h - 4, "leafy", TERRA, 2);
  pottedPlant(img, 106, h - 4, "flower", TERRA, 5);
  plinth(img, 0, w - 1, 3);
  selOutline(img, 0.42);
  return img;
}

/** Modern house (96 × 96): white render + vertical timber cladding, flat slab roofs with shadow, glass balcony, carport. */
function modernHouse(): RgbaImage {
  const w = 96, h = 96;
  const img = createImage(w, h);
  renderWall(img, 4, 18, 54, h - 21, WALL_WHITE, 21, [48]);
  boards(img, 6, 22, 14, 33, TEAK, 4, 3);
  framedWindow(img, 26, 24, 26, 16, STEEL, { panes: 3, curtain: rgb("#d8d0c4") });
  rail(img, 23, 56, 41, 6, STEEL, 4); // glass-edge balcony rail
  ledge(img, 2, 60, 48, WALL_WHITE, 2);
  // lower right wing: clapboard + carport slab
  clapboard(img, 58, 52, 35, h - 55, TEAK, 8);
  glassPane(img, 62, 60, 28, h - 64, (x, y) => (y > h - 72 ? mix(TEAK[2]!, SHADOW, 0.2) : x % 14 === 0 ? STEEL[2]! : mix(rgb("#3a2e30"), WARM[1]!, x > 14 ? 0.4 : 0.1)), 0.3, "window-lit");
  bevel(img, 61, 59, 30, 1, STEEL, 4);
  rect(img, 52, 46, 43, 4, WALL_WHITE[3]!); hline(img, 52, 94, 46, WALL_WHITE[5]!); hline(img, 52, 94, 49, WALL_WHITE[1]!);
  shadeArea(img, 52, 50, 43, 4, 0.32);
  // roof slab with parapet
  rect(img, 1, 13, 60, 5, WALL_WHITE[3]!); hline(img, 1, 60, 13, WALL_WHITE[5]!); hline(img, 1, 60, 17, WALL_WHITE[1]!);
  shadeArea(img, 4, 18, 54, 4, 0.3);
  waterTank(img, 47, 12, 5);
  // ground floor
  framedWindow(img, 9, 58, 18, 18, STEEL, { panes: 2 });
  panelDoor(img, 34, 62, 12, h - 66, TEAK, STEEL);
  wallLamp(img, 47, 58);
  acUnit(img, 32, 26 + 26);
  pottedPlant(img, 52, h - 4, "snake", CONCRETE, 3);
  pottedPlant(img, 6, h - 4, "flower", TERRA, 7);
  plinth(img, 0, w - 1, 3);
  selOutline(img, 0.42);
  return img;
}

/** Malay kampung house (112 × 112): teal board walls, louvred windows with lattice vents, tiled stair, tiled roof with a zig-zag fascia. */
function kampungHouse(): RgbaImage {
  const w = 112, h = 112;
  const img = createImage(w, h);
  const T = TEAL;
  underShade(img, 10, 102, 72, h - 4);
  for (const x of [11, 33, 75, 99]) post(img, x, 70, h - 4, CONCRETE);
  // tiled front stair (blue-white tiles on the risers)
  for (let i = 0; i < 9; i++) {
    const sy = 72 + i * 4, x0 = 47 - (i >> 1), x1 = 63 + (i >> 1);
    hline(img, x0, x1, sy, CONCRETE[5]!);
    for (let y = sy + 1; y < sy + 4; y++) for (let x = x0; x <= x1; x++) setPx(img, x, y, y === sy + 3 ? CONCRETE[2]! : ((x >> 2) + (y >> 1)) % 2 ? BLUE_POT[3]! : CLOTH[2]!);
    shadeArea(img, x0, sy + 1, x1 - x0 + 1, 1, 0.25);
  }
  for (const s of [-1, 1]) { const bx = s < 0 ? 45 : 65; for (let y = 66; y < h - 4; y++) { setPx(img, bx + s * Math.round((y - 66) / 8), y, WHITE); if (y % 6 === 0) vline(img, bx + s * Math.round((y - 66) / 8), y, y + 5, CLOTH[1]!); } }
  bevel(img, 6, 68, 100, 4, TEAK, 3);
  boards(img, 10, 38, 92, 30, T, 6, 4);
  hline(img, 10, 101, 38, WHITE); hline(img, 10, 101, 66, WHITE);
  for (const x of [10, 54, 101]) vline(img, x, 38, 67, WHITE);
  // louvred windows + lattice vent above
  for (const wx of [18, 78]) {
    bevel(img, wx - 2, 41, 20, 4, WALL_WHITE, 3);
    for (let y = 42; y < 44; y++) for (let x = wx; x < wx + 16; x++) if ((x + y) % 3 === 0) setPx(img, x, y, T[0]!);
    framedWindow(img, wx, 47, 16, 16, WALL_WHITE, { panes: 2, curtain: rgb("#f0d8a0") });
    for (let y = 47; y < 63; y += 3) hline(img, wx, wx + 15, y, mix(T[4]!, WHITE, 0.4)); // louvres
  }
  panelDoor(img, 46, 44, 18, 24, TEAK, WALL_WHITE, true);
  // roof + zig-zag fascia (papan cantik)
  tileRoof(img, 2, 109, 34, 30, TERRA, 18, 8, WALL_WHITE);
  for (let x = -3; x < w + 3; x++) { const k = x % 6; const d = k < 3 ? k : 6 - k; for (let yy = 0; yy <= d; yy++) setPx(img, x, 37 + yy, yy === d ? WALL_WHITE[2]! : WHITE); }
  pottedPlant(img, 38, 72, "flower", BLUE_POT, 4);
  pottedPlant(img, 72, 72, "leafy", BLUE_POT, 9);
  pottedPlant(img, 104, h - 4, "palm", TERRA, 6);
  plinth(img, 0, w - 1, 3);
  selOutline(img, 0.42);
  return img;
}

/** Chinese shophouse ร้านผ้า (112 × 160): tiled roof, cream render with pilasters, arched windows with green shutters, arcade + fabric shop. */
function chineseShophouse(): RgbaImage {
  const w = 112, h = 160;
  const img = createImage(w, h);
  const C = WALL_CREAM;
  const SH = shadeRamp("#3f8a62");
  renderWall(img, 2, 18, 108, h - 21, C, 31, [26, 86]);
  // pilasters
  for (const px of [2, 103]) { for (let y = 18; y < h - 3; y++) for (let x = px; x < px + 7; x++) setPx(img, x, y, pick(C, x === px ? 0.95 : x === px + 6 ? 0.35 : 0.66, x, y, 0.3)); bevel(img, px - 1, 22, 9, 3, C, 3); }
  // upper floor: three arched windows with open green shutters
  for (const wx of [17, 49, 81]) {
    for (let y = 30; y < 38; y++) for (let x = wx - 2; x < wx + 16; x++) if (Math.hypot(x - (wx + 6.5), y - 38) < 10.5) setPx(img, x, y, C[2]!);
    shutters(img, wx, 38, 13, 26, SH);
    glassPane(img, wx, 30, 14, 34, (x, y) => (y < 8 ? (Math.hypot(x - 6.5, y - 8) > 7.5 ? undefined : (x + y) % 4 === 0 ? WHITE : rgb("#3a3040")) : x < 4 || x > 9 ? rgb("#c8a868") : rgb("#2a2232")), 0.3, "window-lit");
    for (let y = 30; y < 38; y++) for (let x = wx; x < wx + 14; x++) if (Math.hypot(x - (wx + 6.5), y - 38) > 7.5) setPx(img, x, y, C[3]!);
    hline(img, wx - 3, wx + 16, 66, C[5]!); hline(img, wx - 3, wx + 16, 67, C[2]!);
  }
  rail(img, 9, 102, 72, 7, SH, 3);
  for (const px of [18, 56, 92]) pottedPlant(img, px, 71, px === 56 ? "flower" : "leafy", TERRA, px);
  ledge(img, 0, w - 1, 82, C, 3);
  // roof tiles behind a stepped parapet
  for (let y = 2; y < 14; y++) for (let x = 6 + (14 - y) >> 1; x < w - 6; x++) { const r = (y - 2) % 3; setPx(img, x, y, pick(ROOF_TILE, (r === 0 ? 0.9 : r === 2 ? 0.3 : 0.62) - (x % 5 === 0 ? 0.2 : 0), x, y, 0.3)); }
  bevel(img, 0, 13, w, 6, C, 3);
  ledge(img, 0, w - 1, 18, C, 2);
  // ground floor: sign, lanterns, arcade opening with fabric bolts
  signBoard(img, "fabric", w / 2, 88, RED, YELLOW[4]!, { padX: 10, padY: 3, trim: YELLOW[2], lit: false });
  const ix0 = 12, ix1 = 99, iy0 = 108, iy1 = h - 5;
  for (let y = iy0; y <= iy1; y++) for (let x = ix0; x <= ix1; x++) {
    const ly = y - iy0, lx = x - ix0;
    let c: Rgb = mix(rgb("#3a2c30"), WARM[1]!, Math.max(0, 0.35 - Math.abs(lx - 44) / 120));
    if (y > iy1 - 3) c = (lx + (ly % 2) * 3) % 6 < 3 ? TEAK[2]! : TEAK[1]!;
    else if (ly % 12 === 0) c = TEAK[4]!;
    else if (lx > 6 && lx < 82 && ly < 36) { // shelves of rolled cloth: each bolt is a lit cylinder end
      const bolt = Math.floor(lx / 5), u = lx % 5;
      const pal = [RED, BLUE, YELLOW, GREEN, PINK, ORANGE, TEAL, NAVY][Math.floor(hash(bolt, Math.floor(ly / 12), 4) * 8)]!;
      if (u < 4) c = pick(pal, u === 0 ? 0.85 : u === 3 ? 0.3 : 0.6, x, y, 0.2);
    } else if (ly >= 36 && lx > 20 && lx < 70) c = ly === 36 ? TEAK[5]! : ly < 40 ? [RED[3]!, YELLOW[3]!, BLUE[3]!, CLOTH[2]!][Math.floor(lx / 6) % 4]! : TEAK[2]!; // counter with folded cloth
    setPx(img, x, y, c);
  }
  markNight(img, "window-lit", () => { for (let y = iy0; y < iy1 - 3; y++) for (let x = ix0; x <= ix1; x++) setPx(img, x, y, getPx(img, x, y)); });
  shadeArea(img, ix0, iy0, ix1 - ix0 + 1, 5, 0.35);
  for (const sx of [ix0, ix1 - 6]) for (let x = sx; x < sx + 7; x++) for (let y = iy0; y <= iy1; y++) setPx(img, x, y, pick(TEAK, (x - sx) % 3 === 0 ? 0.3 : 0.62, x, y, 0.2)); // folded shutter boards
  redLantern(img, 20, 102); redLantern(img, 91, 102);
  pottedPlant(img, 6, h - 4, "palm", TERRA, 3);
  plinth(img, 0, w - 1, 4);
  selOutline(img, 0.42);
  return img;
}

/** Thai shophouse variants (112 × 144) drawn by the same painter as the town shophouses: sign, awning-free open front, rail, AC, vents. */
const shophouseStationery = shophouse({ floors: 2, wallHex: "#8fb4d8", kind: "stationery", shutter: "open", seed: 53 });
const shophouseClothes = shophouse({ floors: 2, wallHex: "#e3a3b5", kind: "clothes", shutter: "open", seed: 61 });

function shirt(img: RgbaImage, x: number, y: number, pal: Rgb[]): void {
  setPx(img, x + 4, y, STEEL[3]!);
  hline(img, x + 2, x + 6, y + 1, STEEL[3]!);
  const rows = ["..#####..", ".#######.", "#########", "##.###.##", "..#####..", "..#####..", "..#####..", "..#####..", "..#####..", "..#####.."];
  rows.forEach((r, yy) => { for (let xx = 0; xx < 9; xx++) if (r[xx] === "#") setPx(img, x + xx, y + 2 + yy, pick(pal, 0.75 - xx / 20 - yy / 40, x + xx, y + 2 + yy, 0.3)); });
  setPx(img, x + 4, y + 2, mix(pal[1]!, SHADOW, 0.3)); // collar
}

// ---------------- civic buildings ----------------
const MINT = shadeRamp("#bfe0d2");
const STONE = ramp("#4a4448", "#6e666a", "#948a86", "#b8aea4", "#d6ccbe", "#efe8da");
const MAROON = shadeRamp("#8a2a30");
/** Flat roof: parapet coping with lit lip, a stain band, and the shadow it casts. */
function parapet(img: RgbaImage, x0: number, x1: number, y: number, h: number, pal: Rgb[], seed: number): void {
  renderWall(img, x0, y, x1 - x0 + 1, h, pal, seed, [y + 2]);
  hline(img, x0 - 1, x1 + 1, y, pal[5]!); hline(img, x0 - 1, x1 + 1, y + 1, pal[4]!);
  hline(img, x0 - 1, x1 + 1, y + h - 1, pal[1]!);
  shadeArea(img, x0, y + h, x1 - x0 + 1, 2, 0.26);
}
/** Plain-stripe flag on a pole (no emblems). */
function flagPole(img: RgbaImage, x: number, top: number, bottom: number): void {
  vline(img, x, top, bottom, STEEL[4]!); vline(img, x + 1, top, bottom, STEEL[2]!);
  ball(img, x + 0.5, top - 1, 1.5, YELLOW);
  [RED[3]!, WHITE, NAVY[3]!, NAVY[3]!, WHITE, RED[3]!].forEach((c, i) => { for (let k = 0; k < 13; k++) setPx(img, x - 13 + k, top + 2 + i + Math.round(Math.sin(k / 2.2) * 0.8), i === 0 && k % 4 === 0 ? mix(c, WHITE, 0.2) : k > 9 ? mix(c, SHADOW, 0.15) : c); });
}
/** Hospital (224 × 144): mint-and-white three-storey block, window ribbons with hoods, lit sign, canopy entrance, rooftop plant. */
function hospital(): RgbaImage {
  const w = 224, h = 144;
  const img = createImage(w, h);
  // rooftop plant room + tank
  renderWall(img, 150, 4, 44, 12, CONCRETE, 3);
  for (let x = 154; x < 190; x += 4) vline(img, x, 6, 14, CONCRETE[2]!);
  waterTank(img, 30, 16, 6);
  renderWall(img, 4, 18, w - 8, h - 21, WALL_WHITE, 41, [34, 66]);
  parapet(img, 2, w - 3, 14, 6, MINT, 7);
  // floors 2–3: window ribbons
  for (const fy of [26, 58]) {
    for (let x = 12; x < w - 16; x += 24) if (fy === 26 ? x < 60 || x > 140 : x < 86 || x > 130) framedWindow(img, x, fy, 14, 18, MINT, { panes: 2, hood: MINT, curtain: fy === 26 ? rgb("#cfe6f0") : undefined, seed: x + fy });
    ledge(img, 2, w - 3, fy + 25, MINT, 2);
  }
  // sign + green cross, entrance portico
  signBoard(img, "hospital", 112, 30, GREEN, WHITE, { padX: 6, padY: 3, lit: true });
  for (const [cx, cy] of [[96, 58], [128, 58]] as const) { rect(img, cx - 1, cy - 4, 4, 11, GREEN[3]!); rect(img, cx - 4, cy - 1, 10, 4, GREEN[3]!); markNight(img, "light", () => { rect(img, cx, cy - 3, 2, 9, GREEN[5]!); rect(img, cx - 3, cy, 8, 2, GREEN[5]!); }); }
  glassPane(img, 92, 102, 40, h - 106, (x, y) => (x === 19 || x === 20 ? STEEL[2]! : y > 26 ? CLOTH[1]! : mix(rgb("#dfe8e4"), WARM[2]!, 0.15)), 0.3, "window-lit");
  rect(img, 80, 90, 64, 5, MINT[3]!); hline(img, 80, 143, 90, MINT[5]!); hline(img, 80, 143, 94, MINT[1]!); // canopy slab
  shadeArea(img, 82, 95, 60, 6, 0.32);
  for (const px of [83, 138]) post(img, px, 95, h - 5, WALL_WHITE);
  for (let x = 12; x < w - 16; x += 24) if (x < 70 || x > 146) framedWindow(img, x, 102, 14, 20, MINT, { panes: 2, seed: x });
  wallLamp(img, 76, 98); wallLamp(img, 146, 98);
  for (const px of [74, 152]) pottedPlant(img, px, h - 4, "palm", CONCRETE, px);
  pottedPlant(img, 10, h - 4, "leafy", TERRA, 2); pottedPlant(img, 214, h - 4, "flower", TERRA, 3);
  plinth(img, 0, w - 1, 4);
  selOutline(img, 0.42);
  return img;
}

/** Police station (160 × 112): hip-roofed two-storey block in cream with maroon trim, navy lit sign, flag, lamp, notice board. */
function policeStation(): RgbaImage {
  const w = 160, h = 112;
  const img = createImage(w, h);
  renderWall(img, 6, 26, w - 12, h - 29, WALL_CREAM, 13, [60]);
  tileRoof(img, 4, w - 5, 23, 20, MAROON, 16, 11, WALL_CREAM);
  for (const x of [16, 40, 104, 128]) framedWindow(img, x, 32, 14, 18, MAROON, { panes: 2, hood: WALL_CREAM, curtain: rgb("#e8e0d0"), seed: x });
  ledge(img, 4, w - 5, 57, WALL_CREAM, 2);
  for (const x of [16, 40, 104, 128]) framedWindow(img, x, 70, 14, 20, MAROON, { panes: 2, seed: x + 9 });
  // entrance bay
  renderWall(img, 62, 28, 36, h - 31, shadeRamp("#d4c09a"), 19);
  signBoard(img, "police", 80, 33, NAVY, WHITE, { padX: 4, padY: 3, lit: true });
  rect(img, 58, 60, 44, 4, MAROON[3]!); hline(img, 58, 101, 60, MAROON[5]!); shadeArea(img, 60, 64, 40, 5, 0.3);
  panelDoor(img, 70, 72, 20, h - 76, TEAK, MAROON, true);
  for (const px of [62, 95]) post(img, px, 64, h - 5, WALL_WHITE);
  wallLamp(img, 66, 66); wallLamp(img, 91, 66);
  // notice board + flag
  bevel(img, 108, 96, 16, 11, TEAK, 3); for (const [x, y, c] of [[110, 98, WHITE], [116, 99, YELLOW[4]!], [111, 103, PINK[4]!]] as const) rect(img, x, y, 5, 3, c);
  flagPole(img, 150, 28, h - 5);
  pottedPlant(img, 52, h - 4, "snake", CONCRETE, 1); pottedPlant(img, 104, h - 4, "leafy", CONCRETE, 2);
  plinth(img, 0, w - 1, 4);
  selOutline(img, 0.42);
  return img;
}

/** Post office ไปรษณีย์ (128 × 96): red-brick base, cream upper wall, striped awning, red mailbox, lit sign. */
function postOffice(): RgbaImage {
  const w = 128, h = 96;
  const img = createImage(w, h);
  renderWall(img, 4, 20, w - 8, 40, WALL_CREAM, 17, [30]);
  brick(img, 4, 60, w - 8, h - 63, shadeRamp("#b4503a"), rgb("#d8c4a8"), 5);
  parapet(img, 2, w - 3, 14, 7, RED, 3);
  signBoard(img, "post", w / 2, 24, RED, WHITE, { padX: 8, padY: 3, lit: true, trim: YELLOW[3] });
  for (const x of [12, 96]) framedWindow(img, x, 26, 18, 18, WALL_WHITE, { panes: 2, curtain: rgb("#f4e4c0"), seed: x });
  ledge(img, 2, w - 3, 52, WALL_CREAM, 2);
  awning(img, 8, 56, w - 16, 9, RED, [WHITE, WHITE, WHITE, CLOTH[2]!, WHITE, WHITE].map((c) => c), 8, 4);
  for (const x of [12, 88]) framedWindow(img, x, 70, 26, 18, WALL_WHITE, { panes: 3, seed: x });
  glassPane(img, 50, 68, 26, h - 72, (x, y) => (x === 12 || x === 13 ? STEEL[2]! : y > 18 ? STEEL[3]! : mix(rgb("#e8dcc0"), WARM[2]!, 0.2)), 0.3, "window-lit");
  bevel(img, 48, 66, 30, 2, STEEL, 3);
  // red mailbox (ตู้ไปรษณีย์) on a post
  vline(img, 117, h - 12, h - 4, STEEL[1]!);
  for (let y = h - 28; y < h - 12; y++) for (let x = 112; x < 123; x++) setPx(img, x, y, pick(RED, (y === h - 28 ? 0.95 : 0.72) - (x - 112) / 22, x, y, 0.3));
  hline(img, 114, 120, h - 24, RED[0]!); rect(img, 114, h - 21, 7, 2, WHITE);
  plinth(img, 0, w - 1, 3);
  selOutline(img, 0.42);
  return img;
}

/** Bank ธนาคาร (128 × 112): stone facade with pilasters, tall glass, lit sign band, ATM with a glowing screen, steps, plants. */
function bank(): RgbaImage {
  const w = 128, h = 112;
  const img = createImage(w, h);
  const BRAND = shadeRamp("#5a3c9a");
  renderWall(img, 4, 14, w - 8, h - 17, STONE, 23, [40]);
  for (let y = 14; y < h - 3; y += 6) hline(img, 4, w - 5, y, STONE[2]!); // stone courses
  parapet(img, 2, w - 3, 8, 6, STONE, 5);
  rect(img, 2, 20, w - 4, 16, BRAND[2]!); hline(img, 2, w - 3, 20, BRAND[4]!); hline(img, 2, w - 3, 35, BRAND[0]!);
  signBoard(img, "bank", w / 2, 22, BRAND, WHITE, { padX: 8, padY: 2, lit: true });
  shadeArea(img, 4, 36, w - 8, 3, 0.3);
  // pilasters between tall windows
  for (const px of [6, 36, 86, 116]) { for (let y = 40; y < h - 4; y++) for (let x = px; x < px + 6; x++) setPx(img, x, y, pick(STONE, x === px ? 0.98 : x === px + 5 ? 0.3 : 0.72, x, y, 0.3)); bevel(img, px - 1, 40, 8, 3, STONE, 4); }
  for (const x of [16, 96]) { glassPane(img, x, 46, 16, 40, (xx, yy) => (yy % 13 === 0 ? STEEL[3]! : undefined), 0.35, "window-lit"); bevel(img, x - 1, 45, 18, 1, STEEL, 4); }
  // glass doors
  glassPane(img, 46, 52, 36, h - 56, (x, y) => (x === 17 || x === 18 ? STEEL[2]! : y > 30 ? STEEL[3]! : mix(rgb("#e0d8ee"), WARM[2]!, 0.15)), 0.32, "window-lit");
  bevel(img, 44, 48, 40, 4, STONE, 4);
  // ATM
  bevel(img, 18, 90, 12, 16, STEEL, 2); markNight(img, "light", () => rect(img, 20, 92, 8, 5, rgb("#7ad0f0"))); rect(img, 20, 99, 8, 2, STEEL[0]!);
  for (let i = 0; i < 3; i++) hline(img, 40 - i * 2, 88 + i * 2, h - 6 + i, STONE[5 - i]!);
  pottedPlant(img, 100, h - 4, "snake", CONCRETE, 6); pottedPlant(img, 110, h - 4, "leafy", CONCRETE, 7);
  plinth(img, 0, w - 1, 3);
  selOutline(img, 0.42);
  return img;
}

/** District office ที่ว่าการอำเภอ (192 × 112): two-tier tiled roof, cream walls, white-column veranda, central steps, sign, plain-stripe flag. */
function districtOffice(): RgbaImage {
  const w = 192, h = 112;
  const img = createImage(w, h);
  renderWall(img, 8, 36, w - 16, h - 39, WALL_CREAM, 29, [50]);
  // upper tier + lower tier roofs
  tileRoof(img, 40, w - 41, 20, 16, ROOF_TILE, 12, 5, WALL_CREAM);
  renderWall(img, 44, 21, w - 88, 8, WALL_CREAM, 30);
  tileRoof(img, 6, w - 7, 34, 8, ROOF_TILE, 8, 6, WALL_CREAM);
  for (let i = 0; i < 6; i++) if (i !== 2 && i !== 3) framedWindow(img, 16 + i * 30, 50, 16, 22, TEAK, { panes: 2, hood: WALL_CREAM, curtain: rgb("#f0e6cc"), seed: i });
  for (let i = 0; i < 6; i++) if (i !== 2 && i !== 3) shutters(img, 16 + i * 30, 50, 16, 22, shadeRamp("#3a6a8a"));
  // veranda with white columns + rail
  for (const cx of [12, 44, 140, 172]) post(img, cx, 76, h - 6, WALL_WHITE, 4);
  rail(img, 10, 70, 88, 8, WALL_WHITE, 4); rail(img, 122, 181, 88, 8, WALL_WHITE, 4);
  // portico
  rect(img, 70, 44, 52, 4, WALL_WHITE[3]!); hline(img, 70, 121, 44, WALL_WHITE[5]!); shadeArea(img, 72, 48, 48, 4, 0.3);
  for (const cx of [72, 116]) post(img, cx, 48, h - 8, WALL_WHITE, 4);
  signBoard(img, "district", 96, 50, TEAK, YELLOW[4]!, { padX: 4, padY: 2, lit: false, trim: YELLOW[2] });
  panelDoor(img, 84, 72, 24, h - 80, TEAK, TEAK, true);
  for (let i = 0; i < 3; i++) hline(img, 66 - i * 3, 126 + i * 3, h - 8 + i, CONCRETE[4 - i]!);
  flagPole(img, 186, 14, h - 5);
  pottedPlant(img, 62, h - 9, "flower", TERRA, 4); pottedPlant(img, 130, h - 9, "flower", TERRA, 8);
  plinth(img, 0, w - 1, 3);
  selOutline(img, 0.42);
  return img;
}

/** Company office บริษัท (128 × 160): stepped glass tower (mullions, spandrels, sky reflections), roof plant + mast, stone podium with lit sign and lobby. */
function companyOffice(): RgbaImage {
  const w = 128, h = 160;
  const img = createImage(w, h);
  const CW = ramp("#16243a", "#203650", "#2e4c6c", "#44688a", "#6890ae", "#a0c4da");
  const curtain = (x0: number, x1: number, y0: number, y1: number) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const col = (x - x0) % 8, row = (y - y0) % 12;
      let c: Rgb;
      if (col === 0) c = pick(STEEL, x === x0 ? 0.95 : 0.62, x, y, 0.2); // mullion
      else if (row < 3) c = row === 0 ? STEEL[4]! : pick(STEEL, 0.32, x, y, 0.2); // spandrel band
      else {
        const sky = 0.78 - ((y - y0) / (y1 - y0)) * 0.42 - ((x - x0) / (x1 - x0)) * 0.12;
        c = pick(CW, sky, x, y, 0.35);
        const d = (x - x0 + (y - y0) * 0.55) % 46;
        if (d > 6 && d < 13) c = mix(c, GLINT, 0.38); else if (d > 16 && d < 18) c = mix(c, GLINT, 0.22);
        if (col === 7) c = mix(c, SHADOW, 0.25);
      }
      setPx(img, x, y, c);
    }
    markNight(img, "window-lit", () => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const col = (x - x0) % 8, row = (y - y0) % 12; if (col > 0 && row >= 3 && hash(Math.floor((x - x0) / 8), Math.floor((y - y0) / 12), 5) < 0.5) setPx(img, x, y, getPx(img, x, y)); } });
  };
  // mast + roof plant
  vline(img, 64, 0, 12, STEEL[4]!); setPx(img, 64, 0, RED[4]!);
  renderWall(img, 44, 10, 40, 8, CONCRETE, 9); for (let x = 46; x < 82; x += 3) vline(img, x, 12, 16, CONCRETE[2]!);
  curtain(28, 99, 20, 48); bevel(img, 26, 18, 76, 3, STEEL, 3);
  curtain(16, 111, 52, 116); bevel(img, 14, 49, 100, 3, STEEL, 3); shadeArea(img, 16, 52, 96, 2, 0.3);
  // podium
  renderWall(img, 4, 120, w - 8, h - 123, STONE, 15, []);
  bevel(img, 2, 116, w - 4, 4, STONE, 4); shadeArea(img, 4, 120, w - 8, 2, 0.3);
  signBoard(img, "company", w / 2, 123, NAVY, WHITE, { padX: 8, padY: 2, lit: true });
  glassPane(img, 38, 140, 52, h - 144, (x, y) => (x % 13 === 0 ? STEEL[2]! : y > 12 ? STEEL[3]! : mix(rgb("#e4e0d8"), WARM[2]!, 0.2)), 0.3, "window-lit");
  rect(img, 34, 136, 60, 3, STEEL[3]!); hline(img, 34, 93, 136, STEEL[5]!); shadeArea(img, 36, 139, 56, 3, 0.3);
  for (const px of [14, 114]) pottedPlant(img, px, h - 4, "palm", CONCRETE, px);
  wallLamp(img, 28, 138); wallLamp(img, 97, 138);
  plinth(img, 0, w - 1, 4);
  selOutline(img, 0.42);
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
  shophouseStationery, shophouseClothes,
  hospital, policeStation, postOffice, bank, districtOffice, companyOffice,
  fleaClothesA: fleaClothesStall(TARP, 0), fleaClothesB: fleaClothesStall(RED, 3), fleaJunk: fleaJunkStall, clothesRack, fleaBanner,
};
