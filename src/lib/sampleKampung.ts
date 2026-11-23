/**
 * Multicultural village set: the Muslim kampung (southern Thai / Thai-Malay) next to a small
 * Buddhist temple hall and a Chinese-Thai shrine, so one street can hold every neighbour.
 *
 * Same modular rules as sampleTown.ts: building widths are on the 16 px grid and reach both edges,
 * the bottom row is the ground contact, doors are ~56–64 px for 48 px Easy Sprite characters.
 * Procedural and original (CC0). No sacred figures, no scripture used as decoration.
 */
import { createImage, type RgbaImage } from "../shared/raster.js";
import { type Rgb, alphaAt, blendPx, foliage, getPx, hash, LEAF, mix, pick, ramp, markNight, markRect, rect, rgb, rng, selOutline, setPx } from "./pixelArt.js";
import { THAI_SIGNS, type ThaiSignKey } from "./thaiSignText.js";

const TEAK = ramp("#2e1a12", "#4a2a18", "#6a3e22", "#8c5630", "#ad7140", "#cc9258");
const CHENGAL = ramp("#3a2014", "#5a321c", "#7c4a28", "#9c6436", "#bc8248", "#d8a466");
const TILE = ramp("#4a1c14", "#6e2c1a", "#943e20", "#b8562a", "#d4743a", "#e89656");
const PALE_GREEN = ramp("#2e5a4a", "#4a7e66", "#6aa286", "#90c2a4", "#b8dcc2", "#e0f2e4");
const MOSQUE_GREEN = ramp("#0c3a2c", "#125038", "#1a6a48", "#2a8a5c", "#4aa874", "#7cc898");
const GOLD = ramp("#7a4a10", "#a46a18", "#cc9026", "#e8b440", "#f6d470", "#fff0b0");
const WHITE = ramp("#8a8678", "#aaa596", "#c8c2b2", "#e2dccc", "#f2eee2", "#ffffff");
const CONCRETE = ramp("#4c4650", "#6c6468", "#90877f", "#b4aa9a", "#d4cab4", "#eee6d0");
const RED = ramp("#4a1018", "#741a22", "#a4262c", "#cc3a34", "#e8604a", "#f88c6a");
const BLUE = ramp("#141e48", "#1e2e6a", "#2c4590", "#4064b4", "#6a8ed0", "#a2c0e6");
const YELLOW = ramp("#8a4a14", "#b8701a", "#e0a224", "#f6c840", "#fde488", "#fff6c8");
const ATTAP = ramp("#4a3a1c", "#6a5428", "#8a7034", "#a88a44", "#c4a85a", "#dcc47a");
const STEEL = ramp("#252a36", "#3e4554", "#5e6878", "#87919f", "#b4bcc6", "#e4e9ee");
const SHADOW = rgb("#1a1630");

const hline = (img: RgbaImage, x0: number, x1: number, y: number, c: Rgb) => { for (let x = x0; x <= x1; x++) setPx(img, x, y, c); };
const vline = (img: RgbaImage, x: number, y0: number, y1: number, c: Rgb) => { for (let y = y0; y <= y1; y++) setPx(img, x, y, c); };

function shadeArea(img: RgbaImage, x0: number, y0: number, w: number, h: number, amount: number): void {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (alphaAt(img, x, y)) setPx(img, x, y, mix(getPx(img, x, y), SHADOW, amount));
}

function signText(img: RgbaImage, key: ThaiSignKey, x: number, y: number, c: Rgb, shadow?: Rgb): void {
  const s = THAI_SIGNS[key];
  const passes: Array<[number, number, Rgb]> = shadow ? [[1, 1, shadow], [0, 0, c]] : [[0, 0, c]];
  for (const [dx, dy, col] of passes) {
    for (let yy = 0; yy < s.height; yy++) for (let xx = 0; xx < s.width; xx++) if (s.rows[yy]![xx] === "#") setPx(img, x + xx + dx, y + yy + dy, col);
  }
}
const signW = (key: ThaiSignKey) => THAI_SIGNS[key].width;

/** Vertical plank wall, lit on the left of each board. */
function planks(img: RgbaImage, x0: number, y0: number, w: number, h: number, pal: Rgb[], board = 4, seed = 1): void {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const k = (x - x0) % board;
      let t = k === 0 ? 0.18 : k === 1 ? 0.78 : 0.58 - k * 0.04;
      t += (hash(Math.floor((x - x0) / board), y >> 3, seed) - 0.5) * 0.1;
      setPx(img, x, y, pick(pal, t, x, y, 0.3));
    }
  }
}

/** Clay-tile roof as a trapezoid: `top` row spans [tx0, tx1], bottom row spans [bx0, bx1]. */
function tileRoof(img: RgbaImage, y0: number, y1: number, tx0: number, tx1: number, bx0: number, bx1: number, pal: Rgb[] = TILE): void {
  for (let y = y0; y <= y1; y++) {
    const v = (y - y0) / Math.max(1, y1 - y0);
    const a = Math.round(tx0 + (bx0 - tx0) * v);
    const b = Math.round(tx1 + (bx1 - tx1) * v);
    for (let x = a; x <= b; x++) {
      const row = (y - y0) % 4;
      let t = row === 0 ? 0.25 : 0.7 - row * 0.1;
      if ((x + (Math.floor((y - y0) / 4) % 2) * 3) % 6 === 0) t -= 0.2;
      t -= ((x - a) / Math.max(1, b - a)) * 0.15;
      setPx(img, x, y, pick(pal, t, x, y, 0.3));
    }
    setPx(img, a, y, pal[5]!);
    setPx(img, b, y, pal[1]!);
  }
  hline(img, bx0, bx1, y1, pal[0]!);
}

/** Stilts from `y0` to the ground for each x. */
function stilts(img: RgbaImage, xs: number[], y0: number, pal: Rgb[] = TEAK, wpx = 4): void {
  for (const sx of xs) {
    for (let y = y0; y < img.height; y++) for (let k = 0; k < wpx; k++) setPx(img, sx + k, y, pick(pal, k === 0 ? 0.9 : k === wpx - 1 ? 0.15 : 0.55, sx + k, y, 0.3));
    // concrete footing
    hline(img, sx - 1, sx + wpx, img.height - 2, CONCRETE[4]!);
    hline(img, sx - 1, sx + wpx, img.height - 1, CONCRETE[2]!);
  }
}

/** Floor beam across the full width. */
function floorBeam(img: RgbaImage, x0: number, x1: number, y: number, pal: Rgb[] = TEAK): void {
  hline(img, x0, x1, y, pal[5]!);
  hline(img, x0, x1, y + 1, pal[4]!);
  for (let x = x0; x <= x1; x++) setPx(img, x, y + 2, x % 11 === 0 ? pal[1]! : pal[3]!);
  hline(img, x0, x1, y + 3, pal[0]!);
}

/** Carved geometric vent band (ukiran / ลายฉลุ): repeating 8-point stars in a lattice. */
function carvedBand(img: RgbaImage, x0: number, y0: number, w: number, h: number, wood: Rgb[], gap: Rgb): void {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const u = ((x - x0) % 8) - 3.5;
      const v = ((y - y0) % 8) - 3.5;
      const star = Math.abs(u) + Math.abs(v) < 3.2 || (Math.abs(u) < 1.6 && Math.abs(v) < 3.6) || (Math.abs(v) < 1.6 && Math.abs(u) < 3.6);
      setPx(img, x, y, star ? gap : pick(wood, 0.62 - (y - y0) * 0.02, x, y, 0.3));
    }
  }
  hline(img, x0, x0 + w - 1, y0, wood[5]!);
  hline(img, x0, x0 + w - 1, y0 + h - 1, wood[1]!);
}

/** Crescent and five-point star finial (the common sign of a mosque; not a sacred image). */
function crescent(img: RgbaImage, cx: number, cy: number, r: number, c: Rgb): void {
  for (let y = -r; y <= r; y++) {
    for (let x = -r; x <= r; x++) {
      const inA = x * x + y * y <= r * r + 0.5;
      const inB = (x - r * 0.45) ** 2 + (y + r * 0.15) ** 2 <= (r * 0.8) ** 2;
      if (inA && !inB) setPx(img, cx + x, cy + y, c);
    }
  }
}

/** Pointed (Moorish/Malay) arch opening with a dark interior. */
function pointedArch(img: RgbaImage, x0: number, y0: number, w: number, h: number, frame: Rgb[], inside: Rgb): void {
  const cx = x0 + (w - 1) / 2;
  const springY = y0 + Math.round(w * 0.55);
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      let inArch = true;
      if (y < springY) {
        const dx = Math.abs(x - cx);
        const allow = (w / 2) * Math.sqrt(Math.max(0, 1 - ((springY - y) / (springY - y0)) ** 1.6));
        inArch = dx <= allow;
      }
      if (!inArch) continue;
      const edge = !alphaAt(img, x, y - 1) || x === x0 || x === x0 + w - 1;
      setPx(img, x, y, edge ? frame[4]! : inside);
    }
  }
  for (let y = y0; y < y0 + h; y++) for (let x = x0 - 1; x <= x0 + w; x++) {
    if (getPx(img, x, y)[0] === inside[0] && getPx(img, x, y)[1] === inside[1]) continue;
  }
  // frame line around the arch
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0 - 1; x <= x0 + w; x++) {
      const me = getPx(img, x, y);
      const isIn = me[0] === inside[0] && me[1] === inside[1] && me[2] === inside[2];
      if (isIn) continue;
      const nb = [getPx(img, x + 1, y), getPx(img, x - 1, y), getPx(img, x, y + 1)];
      if (nb.some((c) => c[0] === inside[0] && c[1] === inside[1] && c[2] === inside[2])) setPx(img, x, y, frame[1]!);
    }
  }
}

/** Plinth along the bottom (ground contact = last row). */
function plinth(img: RgbaImage, x0: number, x1: number, h = 3): void {
  const y0 = img.height - h;
  for (let y = y0; y < img.height; y++) hline(img, x0, x1, y, y === y0 ? CONCRETE[5]! : y === img.height - 1 ? CONCRETE[1]! : CONCRETE[3]!);
}

/** Wooden stairs rising from the ground at (x0) up to the floor at `floorY`, going right. */
function stairs(img: RgbaImage, x0: number, floorY: number, steps: number, stepW: number, pal: Rgb[] = TEAK): void {
  const rise = (img.height - floorY) / steps;
  for (let s = 0; s < steps; s++) {
    const sy = Math.round(img.height - 1 - (s + 1) * rise);
    const sx = x0 + s * 2;
    hline(img, sx, sx + stepW, sy, pal[5]!);
    hline(img, sx, sx + stepW, sy + 1, pal[2]!);
  }
  for (let y = floorY; y < img.height; y++) {
    const k = (y - floorY) / (img.height - floorY);
    const off = Math.round((1 - k) * steps * 2);
    setPx(img, x0 + off - 1, y, pal[1]!);
    setPx(img, x0 + off + stepW + 1, y, pal[3]!);
  }
}

// ---------------- buildings ----------------

/**
 * มัสยิด — southern Thai wooden mosque after Talo Mano (Masjid Wadi Al-Husein, Narathiwat):
 * a raised chengal-wood prayer hall with a two-tier clay-tile roof, carved vents, and a wooden
 * minaret tower topped by a small dome and crescent. 176×176
 */
function mosqueWooden(): RgbaImage {
  const w = 176;
  const h = 176;
  const img = createImage(w, h);
  const floorY = 140;

  // ---- minaret (left, x 4..39) ----
  const mx0 = 6;
  const mw = 30;
  stilts(img, [mx0 + 1, mx0 + mw - 5], floorY + 4, CHENGAL);
  planks(img, mx0, 52, mw, floorY + 4 - 52, CHENGAL, 3, 5);
  carvedBand(img, mx0, 52, mw, 10, CHENGAL, rgb("#2a1a12"));
  // lookout openings
  for (const oy of [70, 102]) pointedArch(img, mx0 + 9, oy, 12, 18, CHENGAL, rgb("#24160e"));
  // tower roof (small hip) + drum + dome + finial
  tileRoof(img, 40, 51, mx0 + 8, mx0 + mw - 9, mx0 - 4, mx0 + mw + 3);
  for (let y = 32; y < 40; y++) hline(img, mx0 + 8, mx0 + mw - 9, y, y === 32 ? WHITE[5]! : WHITE[3]!);
  for (let y = 14; y < 33; y++) {
    const v = (y - 14) / 18;
    const half = Math.round(Math.sin(Math.min(1, v * 1.15) * Math.PI * 0.62) * 11 * (v < 0.15 ? 0.6 + v * 2.5 : 1));
    const cx = mx0 + mw / 2 - 0.5;
    for (let dx = -half; dx <= half; dx++) setPx(img, Math.round(cx + dx), y, pick(MOSQUE_GREEN, 0.85 - (dx / Math.max(1, half)) * 0.45 - v * 0.15, Math.round(cx + dx), y, 0.3));
  }
  vline(img, mx0 + 14, 6, 14, GOLD[3]!);
  vline(img, mx0 + 15, 6, 14, GOLD[1]!);
  crescent(img, mx0 + 15, 4, 3, GOLD[4]!);

  // ---- prayer hall (x 40..175) ----
  const hx0 = 40;
  const hx1 = w - 1;
  stilts(img, [hx0 + 4, hx0 + 40, hx0 + 76, hx0 + 112, hx1 - 6], floorY + 4, CHENGAL);
  floorBeam(img, hx0, hx1, floorY, CHENGAL);
  planks(img, hx0 + 4, 92, hx1 - hx0 - 7, floorY - 92, CHENGAL, 4, 9);
  carvedBand(img, hx0 + 4, 92, hx1 - hx0 - 7, 9, CHENGAL, rgb("#2a1a12"));
  // tall louvred windows + central arched door painted green
  for (const wx of [hx0 + 12, hx0 + 34, hx0 + 92, hx0 + 114]) {
    for (let y = 106; y < 132; y++) for (let x = wx; x < wx + 12; x++) {
      const edge = x === wx || x === wx + 11 || y === 106 || y === 131;
      setPx(img, x, y, edge ? CHENGAL[1]! : (y - 106) % 3 === 0 ? MOSQUE_GREEN[1]! : MOSQUE_GREEN[3]!);
    }
  }
  pointedArch(img, hx0 + 58, 100, 22, floorY - 100, CHENGAL, rgb("#1e140e"));
  for (let y = 112; y < floorY; y++) { setPx(img, hx0 + 60, y, MOSQUE_GREEN[3]!); setPx(img, hx0 + 77, y, MOSQUE_GREEN[2]!); }
  // night: the prayer hall is lit (louvres glow between the slats, warm light in the open doorway)
  for (const wx of [hx0 + 12, hx0 + 34, hx0 + 92, hx0 + 114]) markRect(img, wx + 1, 107, 10, 24, "window-lit");
  markRect(img, hx0 + 58, 100, 22, floorY - 100, "window-lit", (c) => c[0] === 0x1e && c[1] === 0x14 && c[2] === 0x0e);
  // front stairs down to the ground
  stairs(img, hx0 + 58, floorY + 3, 7, 18, CHENGAL);
  shadeArea(img, hx0 + 4, 101, hx1 - hx0 - 7, 3, 0.3);

  // ---- two-tier roof ----
  tileRoof(img, 74, 91, hx0 + 4, hx1 - 2, hx0 - 2, hx1);
  for (let x = hx0 - 2; x <= hx1; x++) { setPx(img, x, 91, CHENGAL[4]!); setPx(img, x, 92, CHENGAL[1]!); }
  // upper tier with gable fascia (papan cantik)
  tileRoof(img, 44, 66, hx0 + 34, hx1 - 30, hx0 + 16, hx1 - 12);
  for (let y = 66; y < 74; y++) planks(img, hx0 + 18, y, hx1 - hx0 - 31, 1, CHENGAL, 3, 4);
  carvedBand(img, hx0 + 18, 66, hx1 - hx0 - 31, 8, CHENGAL, rgb("#2a1a12"));
  // ridge finials
  for (const fx of [hx0 + 34, hx1 - 30]) { vline(img, fx, 38, 44, GOLD[3]!); setPx(img, fx, 37, GOLD[5]!); }
  // sign board
  const sw = signW("mosque") + 10;
  const sx = hx0 + 69 - Math.round(sw / 2);
  rect(img, sx, 80, sw, 13, MOSQUE_GREEN[1]!);
  hline(img, sx, sx + sw - 1, 80, GOLD[4]!);
  hline(img, sx, sx + sw - 1, 92, GOLD[1]!);
  signText(img, "mosque", sx + 5, 82, GOLD[5]!, MOSQUE_GREEN[0]!);

  plinth(img, 0, w - 1, 2);
  selOutline(img, 0.42);
  // frangipani (ลีลาวดี) by the minaret
  foliage(img, [[44, h - 18, 6], [52, h - 22, 7]], LEAF, 141, { flatBottom: h - 8 });
  for (const [fx, fy] of [[44, h - 22], [50, h - 26], [55, h - 20]] as const) { setPx(img, fx, fy, WHITE[5]!); setPx(img, fx + 1, fy, YELLOW[4]!); }
  return img;
}

/**
 * บ้านมลายู — Malay raised wooden house (rumah Melayu): stilts, pale-green walls with white trim,
 * a gable with sun-ray boards and carved bargeboards, front stairs with a clay foot-wash jar. 128×136
 */
function malayHouse(): RgbaImage {
  const w = 128;
  const h = 136;
  const img = createImage(w, h);
  const floorY = 98;
  stilts(img, [6, 36, 66, 96, 120], floorY + 4, TEAK);
  floorBeam(img, 0, w - 1, floorY, TEAK);
  planks(img, 4, 58, 88, floorY - 58, PALE_GREEN, 4, 3);
  // white trim and windows with kekisi lattice below
  for (const wx of [12, 64]) {
    for (let y = 66; y < 84; y++) for (let x = wx; x < wx + 18; x++) {
      const edge = x === wx || x === wx + 17 || y === 66 || y === 83;
      setPx(img, x, y, edge ? WHITE[5]! : mix(rgb("#2a1e18"), YELLOW[3]!, Math.max(0, 0.35 - Math.hypot(x - wx - 9, y - 72) / 22)));
    }
    vline(img, wx + 8, 67, 82, WHITE[3]!);
    // night: lamp light behind the glass (not the white mullion)
    markRect(img, wx + 1, 67, 16, 16, wx === 12 ? "window-lit" : "window", (c) => c[0] + c[1] + c[2] < 400);
    carvedBand(img, wx, 86, 18, 8, TEAK, PALE_GREEN[4]!);
  }
  // door
  for (let y = 64; y < floorY; y++) for (let x = 38; x < 56; x++) {
    const edge = x === 38 || x === 55 || y === 64;
    setPx(img, x, y, edge ? WHITE[5]! : x < 47 ? TEAK[4]! : TEAK[3]!);
  }
  vline(img, 46, 66, floorY - 1, TEAK[1]!);
  // veranda + stairs
  for (let x = 92; x < w; x++) {
    setPx(img, x, floorY - 12, WHITE[5]!);
    setPx(img, x, floorY - 11, WHITE[3]!);
    if ((x - 92) % 5 === 2) vline(img, x, floorY - 10, floorY - 1, WHITE[4]!);
  }
  stairs(img, 94, floorY + 3, 8, 14, TEAK);
  // gable roof: sun-ray boards (tebar layar) + attap/tile band + carved bargeboards
  const cx = 48;
  const apex = 8;
  const base = 58;
  for (let y = apex; y < base; y++) {
    const half = ((y - apex) / (base - apex)) * 52;
    for (let dx = -Math.floor(half); dx <= Math.floor(half); dx++) {
      const x = cx + dx;
      const fromEdge = half - Math.abs(dx);
      if (fromEdge < 3) setPx(img, x, y, pick(WHITE, dx < 0 ? 0.95 : 0.6, x, y, 0.3));
      else if (fromEdge < 9) setPx(img, x, y, pick(TILE, (dx < 0 ? 0.72 : 0.45) - (((y + Math.floor(fromEdge)) % 3 === 0) ? 0.3 : 0), x, y, 0.3));
      else {
        const ang = Math.atan2(base - y, dx);
        const ray = Math.floor(ang / (Math.PI / 16)) % 2;
        setPx(img, x, y, pick(PALE_GREEN, ray ? 0.75 : 0.45, x, y, 0.3));
      }
    }
  }
  // small diamond vent in the gable
  for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) if (Math.abs(dx) + Math.abs(dy) <= 4) setPx(img, cx + dx, 40 + dy, (Math.abs(dx) + Math.abs(dy)) % 2 ? WHITE[5]! : TEAK[0]!);
  hline(img, cx - 52, cx + 52, base - 1, TEAK[1]!);
  // finial (silang gunting) at the apex
  for (let k = 0; k < 5; k++) { setPx(img, cx - k, apex - 1 - k, WHITE[5]!); setPx(img, cx + k, apex - 1 - k, WHITE[4]!); }
  selOutline(img, 0.4);
  // tempayan (foot-wash jar) at the stairs + hibiscus
  const jar = ramp("#2a1410", "#4a2216", "#6e3420", "#94502c", "#b8743e", "#d8a060");
  for (let y = h - 14; y < h; y++) {
    const v = (y - (h - 14)) / 13;
    const half = Math.round(3 + Math.sin(v * Math.PI) * 3);
    for (let dx = -half; dx <= half; dx++) setPx(img, 88 + dx, y, pick(jar, 0.78 - (dx / half) * 0.5, 88 + dx, y, 0.3));
  }
  hline(img, 85, 91, h - 15, jar[5]!);
  foliage(img, [[10, h - 7, 6], [18, h - 9, 6]], LEAF, 88, { flatBottom: h - 1 });
  const r = rng(31);
  for (let i = 0; i < 9; i++) { const fx = Math.round(5 + r() * 18); const fy = Math.round(h - 14 + r() * 10); if (alphaAt(img, fx, fy)) setPx(img, fx, fy, RED[4]!); }
  return img;
}

/** ร้านน้ำชา — roti + tea shop: teh tarik glasses, a roti griddle cart, marble tables, a dove cage. 128×112 */
function rotiTeaShop(): RgbaImage {
  const w = 128;
  const h = 112;
  const img = createImage(w, h);
  const wall = ramp("#6a5040", "#8a6a52", "#a88a6a", "#c8aa86", "#e0c8a2", "#f2e2c4");
  for (let y = 30; y < h - 4; y++) for (let x = 4; x < w - 4; x++) setPx(img, x, y, pick(wall, 0.42 + (hash(x >> 2, y >> 2, 7) - 0.5) * 0.08, x, y, 0.4));
  // posts, beam, tin roof, sign
  for (const px of [0, w - 6]) for (let y = 24; y < h - 3; y++) for (let k = 0; k < 6; k++) setPx(img, px + k, y, pick(TEAK, k === 0 ? 0.95 : k === 5 ? 0.12 : 0.6, px + k, y, 0.3));
  for (let y = 24; y < 30; y++) hline(img, 0, w - 1, y, y === 24 ? TEAK[5]! : y === 29 ? TEAK[0]! : TEAK[3]!);
  for (let y = 14; y < 24; y++) for (let x = 0; x < w; x++) { const k = x % 4; setPx(img, x, y, pick(STEEL, (k === 0 ? 0.92 : k === 1 ? 0.66 : k === 2 ? 0.46 : 0.22) - (y - 14) * 0.02, x, y, 0.2)); }
  const sw = signW("teashop") + 14;
  rect(img, 8, 0, sw, 14, MOSQUE_GREEN[2]!);
  hline(img, 8, 8 + sw - 1, 0, MOSQUE_GREEN[5]!);
  hline(img, 8, 8 + sw - 1, 13, MOSQUE_GREEN[0]!);
  signText(img, "teashop", 15, 2, WHITE[5]!, MOSQUE_GREEN[0]!);
  const rw = signW("roti") + 10;
  rect(img, w - 10 - rw, 2, rw, 12, YELLOW[3]!);
  hline(img, w - 10 - rw, w - 11, 2, YELLOW[5]!);
  signText(img, "roti", w - 5 - rw, 3, RED[1]!);
  // shelf with tins of tea and condensed milk
  hline(img, 70, 120, 48, TEAK[4]!);
  hline(img, 70, 120, 49, TEAK[1]!);
  for (let x = 72; x < 118; x += 5) { rect(img, x, 41, 4, 7, (x / 5) % 2 ? RED[3]! : BLUE[4]!); hline(img, x, x + 3, 41, WHITE[5]!); }
  // hanging dove cage (นกเขาชวา, a southern coffee-shop classic)
  vline(img, 100, 30, 34, STEEL[1]!);
  for (let y = 35; y < 47; y++) {
    const half = Math.round(Math.min(5, 1 + (y - 35) * 0.9));
    setPx(img, 100 - half, y, TEAK[4]!);
    setPx(img, 100 + half, y, TEAK[2]!);
    if (y > 37) for (let x = 100 - half + 2; x < 100 + half; x += 2) setPx(img, x, y, TEAK[3]!);
  }
  hline(img, 95, 105, 47, TEAK[1]!);
  setPx(img, 99, 43, WHITE[3]!); setPx(img, 100, 43, CONCRETE[2]!);
  // roti cart with round griddle
  for (let y = 62; y < 92; y++) for (let x = 10; x < 52; x++) setPx(img, x, y, pick(STEEL, 0.75 - ((x - 10) / 42) * 0.35 - (y > 88 ? 0.3 : 0), x, y, 0.4));
  hline(img, 10, 51, 62, STEEL[5]!);
  for (let y = 46; y < 62; y++) for (let x = 12; x < 50; x++) setPx(img, x, y, (y === 46 || x === 12 || x === 49) ? STEEL[4]! : mix(rgb("#f2e2b8"), BLUE[4]!, 0.15));
  for (let i = 0; i < 4; i++) { hline(img, 16 + i * 8, 21 + i * 8, 56, YELLOW[3]!); hline(img, 16 + i * 8, 21 + i * 8, 57, YELLOW[1]!); }
  hline(img, 14, 48, 60, STEEL[2]!);
  for (let dx = -9; dx <= 9; dx++) setPx(img, 31 + dx, 63, Math.abs(dx) < 8 ? rgb("#2a2a30") : STEEL[1]!);
  rect(img, 14, 66, 34, 14, RED[3]!);
  hline(img, 14, 47, 66, RED[5]!);
  signText(img, "roti", 22, 67, WHITE[5]!, RED[0]!);
  for (const wx of [18, 44]) { for (let y = 92; y < h - 4; y++) setPx(img, wx, y, STEEL[1]!); }
  // marble table, teh tarik glasses with foam, stools
  hline(img, 64, 104, 82, WHITE[5]!);
  hline(img, 64, 104, 83, WHITE[3]!);
  hline(img, 64, 104, 84, CONCRETE[1]!);
  vline(img, 84, 85, h - 5, STEEL[1]!);
  hline(img, 78, 90, h - 5, STEEL[2]!);
  for (const gx of [68, 76, 94]) { rect(img, gx, 76, 3, 6, rgb("#b0703a")); hline(img, gx, gx + 2, 76, rgb("#f2e2c4")); }
  // brass teapot
  for (let y = 72; y < 81; y++) { const half = Math.round(4 * Math.sin(((y - 71) / 10) * Math.PI)); hline(img, 86 - half, 86 + half, y, GOLD[3]!); }
  setPx(img, 91, 74, GOLD[4]!); setPx(img, 92, 73, GOLD[4]!);
  for (const sx of [60, 106]) { hline(img, sx, sx + 8, 94, TEAK[4]!); hline(img, sx, sx + 8, 95, TEAK[2]!); for (let y = 96; y < h - 3; y++) { setPx(img, sx + 1, y, TEAK[3]!); setPx(img, sx + 7, y, TEAK[1]!); } }
  for (let y = 30; y < 36; y++) shadeArea(img, 4, y, w - 8, 1, 0.3 - (y - 30) * 0.04);
  plinth(img, 0, w - 1, 4);
  selOutline(img, 0.42);
  // night: the open teashop is lit
  markRect(img, 6, 30, 128 - 12, 112 - 34, "interior");
  return img;
}

/** แผงอาหารฮาลาล — halal food stall: green awning, ฮาลาล plate with a crescent, curry pots, nasi kerabu. 96×80 */
function halalStall(): RgbaImage {
  const w = 96;
  const h = 80;
  const img = createImage(w, h);
  // posts + awning
  for (const px of [2, w - 6]) for (let y = 16; y < h - 3; y++) for (let k = 0; k < 4; k++) setPx(img, px + k, y, pick(TEAK, k === 0 ? 0.9 : 0.4, px + k, y, 0.3));
  for (let x = 0; x < w; x++) {
    const s = Math.floor(x / 8) % 2 === 0 ? MOSQUE_GREEN : WHITE;
    const dip = Math.round(2.2 * Math.sin((Math.PI * ((x % 8) + 0.5)) / 8));
    for (let y = 8; y <= 20 + dip; y++) setPx(img, x, y, pick(s, y === 20 + dip ? 0.12 : 0.7 - (y - 8) * 0.03, x, y, 0.3));
  }
  hline(img, 0, w - 1, 8, STEEL[4]!);
  for (let y = 23; y < 28; y++) shadeArea(img, 0, y, w, 1, 0.25);
  // halal plate: green, white border, crescent + Thai word (generic, not any official certification mark)
  const pw = signW("halal") + 20;
  const px0 = Math.round((w - pw) / 2);
  rect(img, px0, 0, pw, 12, MOSQUE_GREEN[2]!);
  hline(img, px0, px0 + pw - 1, 0, WHITE[5]!);
  hline(img, px0, px0 + pw - 1, 11, WHITE[3]!);
  vline(img, px0, 0, 11, WHITE[5]!);
  vline(img, px0 + pw - 1, 0, 11, WHITE[3]!);
  crescent(img, px0 + 7, 6, 3, WHITE[5]!);
  setPx(img, px0 + 10, 4, WHITE[5]!);
  signText(img, "halal", px0 + 14, 1, WHITE[5]!, MOSQUE_GREEN[0]!);
  // counter
  for (let y = 46; y < h - 3; y++) for (let x = 6; x < w - 6; x++) setPx(img, x, y, pick(TEAK, y === 46 ? 0.95 : 0.55 - (x / w) * 0.2, x, y, 0.3));
  hline(img, 6, w - 7, 47, TEAK[2]!);
  rect(img, 30, 54, 36, 12, MOSQUE_GREEN[2]!);
  crescent(img, 40, 60, 4, WHITE[5]!);
  setPx(img, 46, 57, WHITE[5]!);
  hline(img, 50, 62, 58, WHITE[4]!); hline(img, 50, 60, 61, WHITE[4]!);
  // pots of curry, a plate of blue nasi kerabu, satay grill
  for (const [cx, pal] of [[16, YELLOW], [32, RED]] as const) {
    for (let y = 36; y < 46; y++) { const half = 6; for (let dx = -half; dx <= half; dx++) setPx(img, cx + dx, y, pick(STEEL, 0.85 - ((dx + half) / (2 * half)) * 0.6, cx + dx, y, 0.4)); }
    hline(img, cx - 5, cx + 5, 36, pal[3]!);
    hline(img, cx - 6, cx + 6, 35, STEEL[5]!);
  }
  for (let dx = -6; dx <= 6; dx++) { setPx(img, 52 + dx, 44, WHITE[5]!); setPx(img, 52 + dx, 45, WHITE[2]!); }
  for (let dx = -4; dx <= 4; dx++) { setPx(img, 52 + dx, 43, rgb("#5a7ad0")); setPx(img, 52 + dx, 42, dx % 3 ? rgb("#7a9ae6") : LEAF[4]!); }
  setPx(img, 50, 41, YELLOW[4]!); setPx(img, 55, 41, RED[4]!);
  for (let x = 64; x < 88; x++) { setPx(img, x, 44, STEEL[1]!); setPx(img, x, 45, RED[2]!); }
  for (let i = 0; i < 6; i++) { const sx = 66 + i * 4; for (let k = 0; k < 6; k++) setPx(img, sx + Math.round(k / 3), 43 - k, k < 4 ? TILE[3]! : YELLOW[4]!); }
  for (let i = 0; i < 10; i++) blendPx(img, 72 + Math.round(Math.sin(i) * 3), 36 - i, rgb("#ffffff"), 110 - i * 9);
  plinth(img, 0, w - 1, 3);
  selOutline(img, 0.42);
  // night: a lamp under the awning lights the pots and the plates (the counter front stays in shade)
  markRect(img, 6, 24, 96 - 12, 22, "interior");
  return img;
}

/** วัด — small Buddhist temple hall (ubosot): white walls, gold doors, tiered red-and-green roof, chofa. 128×144 */
function watSala(): RgbaImage {
  const w = 128;
  const h = 144;
  const img = createImage(w, h);
  const RED_ROOF = ramp("#4a1018", "#741a22", "#a4262c", "#cc3a34", "#e8604a", "#f88c6a");
  const GREEN_ROOF = ramp("#0e3a2a", "#145238", "#1e6e46", "#2e8c52", "#56ac62", "#8cca7c");
  // base platform + steps
  for (let y = h - 14; y < h; y++) hline(img, y < h - 4 ? 4 : 0, y < h - 4 ? w - 5 : w - 1, y, y === h - 14 ? WHITE[5]! : y === h - 1 ? CONCRETE[1]! : WHITE[3]!);
  // walls with gold door and windows
  for (let y = 84; y < h - 14; y++) for (let x = 14; x < w - 14; x++) setPx(img, x, y, pick(WHITE, 0.72 - ((x - 14) / (w - 28)) * 0.25, x, y, 0.3));
  for (let y = 92; y < h - 14; y++) for (let x = 52; x < 76; x++) {
    const edge = x === 52 || x === 75 || y === 92;
    setPx(img, x, y, edge ? GOLD[1]! : (x + y) % 5 === 0 ? GOLD[5]! : x < 64 ? GOLD[3]! : GOLD[2]!);
  }
  vline(img, 63, 93, h - 15, GOLD[0]!);
  for (const wx of [24, 92]) for (let y = 96; y < 116; y++) for (let x = wx; x < wx + 12; x++) setPx(img, x, y, x === wx || x === wx + 11 || y === 96 ? GOLD[2]! : rgb("#3a2a22"));
  // night: candle light in the windows; the gold paint stays paint
  for (const wx of [24, 92]) markRect(img, wx + 1, 97, 10, 19, "window");
  // pointed gold window crowns
  for (const wx of [24, 92, 52]) for (let k = 0; k < 6; k++) hline(img, wx + k, wx + (wx === 52 ? 23 : 11) - k, (wx === 52 ? 91 : 95) - k, GOLD[4]!);
  // tiered roof: lower green band, upper red tiers
  tileRoof(img, 68, 84, 22, w - 23, 0, w - 1, GREEN_ROOF);
  tileRoof(img, 40, 68, 36, w - 37, 14, w - 15, RED_ROOF);
  tileRoof(img, 22, 40, 48, w - 49, 34, w - 35, RED_ROOF);
  // gable (naa ban) with gold
  for (let y = 18; y < 40; y++) { const half = Math.round(((y - 18) / 22) * 18); hline(img, 64 - half, 64 + half, y, y % 4 === 0 ? GOLD[5]! : GOLD[3]!); }
  // chofa finials + bai raka edges
  for (const [fx, fy, s] of [[64, 12, 1], [12, 66, -1], [w - 13, 66, 1], [32, 38, -1], [w - 33, 38, 1]] as const) {
    for (let k = 0; k < 6; k++) setPx(img, fx + Math.round(k * 0.3) * s, fy + 6 - k, GOLD[4]!);
    setPx(img, fx + s * 2, fy, GOLD[5]!);
    setPx(img, fx + s * 3, fy + 1, GOLD[3]!);
  }
  selOutline(img, 0.42);
  return img;
}

/** ศาลเจ้า — small Chinese-Thai shrine: red pillars, curved green-tile roof, lanterns, incense urn. 80×96 */
function chineseShrine(): RgbaImage {
  const w = 80;
  const h = 96;
  const img = createImage(w, h);
  for (let y = h - 8; y < h; y++) hline(img, 2, w - 3, y, y === h - 8 ? CONCRETE[5]! : y === h - 1 ? CONCRETE[1]! : CONCRETE[3]!);
  for (let y = 40; y < h - 8; y++) for (let x = 10; x < w - 10; x++) setPx(img, x, y, pick(RED, 0.5 - ((x - 10) / (w - 20)) * 0.2, x, y, 0.3));
  for (const px of [10, w - 16]) for (let y = 36; y < h - 8; y++) for (let k = 0; k < 6; k++) setPx(img, px + k, y, pick(RED, k === 0 ? 0.95 : 0.6 - k * 0.07, px + k, y, 0.3));
  for (let y = 54; y < h - 8; y++) for (let x = 26; x < 54; x++) setPx(img, x, y, x === 26 || x === 53 || y === 54 ? GOLD[3]! : rgb("#2a1410"));
  vline(img, 40, 55, h - 9, GOLD[2]!);
  // night: warm light inside the open shrine doors
  markRect(img, 27, 55, 26, h - 8 - 55, "window-lit", (c) => c[0] === 0x2a && c[1] === 0x14 && c[2] === 0x10);
  // curved roof with upturned ends
  for (let y = 22; y < 38; y++) {
    const v = (y - 22) / 15;
    const half = Math.round(18 + v * 22);
    for (let dx = -half; dx <= half; dx++) setPx(img, 40 + dx, y, pick(MOSQUE_GREEN, (y - 22) % 3 === 0 ? 0.3 : 0.72 - (dx + half) / (4 * half), 40 + dx, y, 0.3));
  }
  for (const s of [-1, 1]) for (let k = 0; k < 5; k++) setPx(img, 40 + s * (40 - Math.min(k, 1)), 37 - k, YELLOW[4]!);
  hline(img, 22, 58, 21, YELLOW[3]!);
  for (const s of [-1, 1]) { setPx(img, 40 + s * 14, 18, YELLOW[4]!); setPx(img, 40 + s * 15, 19, YELLOW[3]!); }
  hline(img, 0, w - 1, 38, RED[1]!);
  // name board
  const sw = signW("shrine") + 8;
  rect(img, 40 - Math.round(sw / 2), 42, sw, 11, rgb("#1e1410"));
  signText(img, "shrine", 44 - Math.round(sw / 2), 42, GOLD[4]!);
  // lanterns
  for (const lx of [18, w - 19]) {
    vline(img, lx, 39, 41, STEEL[1]!);
    markNight(img, "light", () => { for (let yy = 0; yy < 7; yy++) { const half = [2, 3, 4, 4, 4, 3, 2][yy]!; hline(img, lx - half, lx + half, 42 + yy, RED[3 + (yy < 3 ? 1 : 0)]!); } });
    hline(img, lx - 2, lx + 2, 49, YELLOW[3]!);
  }
  selOutline(img, 0.42);
  // incense urn with smoke
  for (let y = h - 16; y < h - 8; y++) hline(img, 36, 44, y, y === h - 16 ? GOLD[5]! : GOLD[2]!);
  for (let i = 0; i < 12; i++) blendPx(img, 40 + Math.round(Math.sin(i / 2) * 2), h - 18 - i, rgb("#ffffff"), 120 - i * 9);
  return img;
}

// ---------------- coast / kampung nelayan ----------------

/** เรือกอและ — kolek: painted Malay fishing boat with a high curled bow and stern. 96×36 */
function kolekBoat(): RgbaImage {
  const w = 96;
  const h = 36;
  const img = createImage(w, h);
  // kolek paint: red sheer strake, yellow scroll band, then a blue-green hull
  const bands = [RED, YELLOW, BLUE, MOSQUE_GREEN, MOSQUE_GREEN];
  for (let x = 4; x < w - 4; x++) {
    const u = (x - 4) / (w - 9);
    // sheer: high, curling ends (stern left, bow right)
    const rise = Math.pow(Math.abs(u - 0.5) * 2, 3.6) * 13;
    const sheer = Math.round(16 - rise);
    const keel = 30 - Math.round(Math.pow(Math.abs(u - 0.5) * 2, 2.2) * 9);
    for (let y = sheer; y <= keel; y++) {
      const band = Math.floor((y - sheer) / 3);
      const pal = bands[band % bands.length]!;
      let c = pick(pal, y === sheer ? 0.95 : 0.6 - (y - sheer) * 0.02, x, y, 0.3);
      // painted floral scroll in the top band
      if (band === 1 && (x + y) % 7 === 0) c = WHITE[5]!;
      setPx(img, x, y, c);
    }
  }
  // curled bow and stern posts (bangau / sagu)
  for (const [bx, s] of [[w - 6, 1], [5, -1]] as const) {
    for (let k = 0; k < 9; k++) setPx(img, bx + s * Math.round(Math.sin(k / 3) * 2), 4 + k, k < 3 ? GOLD[4]! : RED[3]!);
    setPx(img, bx + s * 2, 3, GOLD[5]!);
  }
  // a folded net and a paddle
  for (let x = 30; x < 48; x++) for (let y = 12; y < 16; y++) setPx(img, x, y, (x + y) % 2 ? rgb("#3a6a8a") : rgb("#5a8aaa"));
  for (let k = 0; k < 14; k++) setPx(img, 58 + k, 6 + Math.round(k * 0.5), TEAK[3]!);
  selOutline(img, 0.42, false);
  for (let x = 0; x < w; x++) if (x % 5 !== 0) blendPx(img, x, h - 2, rgb("#e4f6fb"), 140);
  return img;
}

/** ราวตากปลา — fish and squid drying rack on bamboo legs. 48×32 */
function fishRack(): RgbaImage {
  const w = 48;
  const h = 32;
  const img = createImage(w, h);
  const bamboo = ramp("#5a5a1e", "#7e7e2a", "#a4a23c", "#c8c45a", "#e4dc86");
  for (const lx of [3, w - 5]) for (let y = 6; y < h; y++) { setPx(img, lx, y, bamboo[3]!); setPx(img, lx + 1, y, bamboo[1]!); }
  for (const ry of [8, 18]) for (let x = 2; x < w - 2; x++) { setPx(img, x, ry, bamboo[4]!); setPx(img, x, ry + 1, bamboo[2]!); }
  // net mesh + fish
  for (let y = 10; y < 18; y++) for (let x = 6; x < w - 6; x++) if ((x + y) % 3 === 0) setPx(img, x, y, rgb("#8a8a7a"));
  for (let i = 0; i < 6; i++) {
    const fx = 8 + i * 6;
    for (let k = 0; k < 6; k++) setPx(img, fx + (k < 2 ? 1 : 0), 11 + k, k === 0 ? WHITE[4]! : pick(CONCRETE, 0.8 - k * 0.08, fx, 11 + k, 0.2));
    setPx(img, fx + 1, 17, CONCRETE[2]!);
  }
  for (let i = 0; i < 4; i++) { const sx = 9 + i * 9; for (let k = 0; k < 7; k++) setPx(img, sx, 20 + k, k < 3 ? rgb("#e8c8a8") : rgb("#d8a888")); setPx(img, sx - 1, 26, rgb("#d8a888")); setPx(img, sx + 1, 26, rgb("#d8a888")); }
  selOutline(img, 0.42);
  return img;
}

/** บ้านชาวประมง — stilt fishing hut over the water with an attap roof, nets and a ladder. 96×88 */
function fisherHut(): RgbaImage {
  const w = 96;
  const h = 88;
  const img = createImage(w, h);
  const deckY = 54;
  stilts(img, [6, 30, 60, 86], deckY + 3, TEAK, 3);
  floorBeam(img, 0, w - 1, deckY, TEAK);
  planks(img, 8, 26, 58, deckY - 26, ATTAP, 3, 2);
  for (let y = 32; y < 46; y++) for (let x = 20; x < 34; x++) setPx(img, x, y, x === 20 || x === 33 || y === 32 ? TEAK[1]! : rgb("#2a2018"));
  for (let y = 30; y < deckY; y++) for (let x = 42; x < 56; x++) setPx(img, x, y, x === 42 || x === 55 || y === 30 ? TEAK[1]! : x < 49 ? TEAK[4]! : TEAK[3]!);
  // attap (nipah) roof
  for (let y = 6; y < 28; y++) {
    const v = (y - 6) / 21;
    const half = Math.round(8 + v * 36);
    for (let dx = -half; dx <= half; dx++) setPx(img, 38 + dx, y, pick(ATTAP, (y % 3 === 0 ? 0.25 : 0.75) - (dx + half) / (4 * half) + (hash(38 + dx, y, 3) - 0.5) * 0.15, 38 + dx, y, 0.4));
  }
  // hanging nets on the deck rail + ladder to the water
  for (let x = 66; x < w; x++) { setPx(img, x, deckY - 12, TEAK[5]!); if ((x - 66) % 6 === 0) vline(img, x, deckY - 11, deckY - 1, TEAK[3]!); }
  for (let y = deckY - 11; y < deckY - 2; y++) for (let x = 68; x < 92; x++) if ((x + y) % 3 === 0) setPx(img, x, y, rgb("#3a6a8a"));
  for (let y = deckY + 4; y < h; y++) { setPx(img, 72, y, TEAK[4]!); setPx(img, 80, y, TEAK[2]!); if (y % 5 === 0) hline(img, 72, 80, y, TEAK[3]!); }
  selOutline(img, 0.42);
  for (let x = 0; x < w; x++) if (x % 5 !== 0) blendPx(img, x, h - 2, rgb("#e4f6fb"), 120);
  return img;
}

export const KAMPUNG_DRAW = {
  mosqueWooden,
  malayHouse,
  rotiTeaShop,
  halalStall,
  watSala,
  chineseShrine,
  kolekBoat,
  fishRack,
  fisherHut,
} satisfies Record<string, () => RgbaImage>;
