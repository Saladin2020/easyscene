/**
 * Brick town sample set: 19th-century style brick rowhouses (2–4 storeys) with slate mansard and
 * gable roofs, dormers, chimneys, cornices, bay windows and shop fronts with striped awnings, plus
 * the street dressing that goes with them (street trees, planters, a curb-and-asphalt road strip,
 * parked cars, a lamp post, a fire hydrant, a bus stop) and a city skyline / utility-pole parallax.
 *
 * Procedural and original (CC0): every pixel comes from the code below. Reference photos were only
 * used for the general look; nothing is traced or sampled from them.
 *
 * Modular rules (same as sampleTown.ts): building widths are on the 16 px grid, the facade is opaque
 * from the ground row up to the cornice on BOTH edge columns (party walls), and the bottom row is the
 * ground contact, so any rowhouse chains with any other (`x += width`) into an endless terrace.
 * Scale: a storey is 44 px over a 64 px ground floor, doors ~48 px, for 48 px Easy Sprite characters.
 */
import { createImage, type RgbaImage } from "../shared/raster.js";
import {
  H, LEAF, type Rgb, W, alphaAt, bayer, blendPx, clamp01, foliage, getPx, hash, mix, pick, ramp, rect, rgb, rng, selOutline,
  markRect, maskEnd, maskStart, setPx, setWrap, vnoise, wrapX,
} from "./pixelArt.js";

// ---------------- palettes ----------------

export const BRICK = {
  red: ramp("#3a1410", "#5a1e16", "#7c2a1e", "#9c3a26", "#b85032", "#d06c44"),
  brown: ramp("#2a1812", "#40261a", "#5a3624", "#74482e", "#8e5e3c", "#a87650"),
  cream: ramp("#6e6250", "#8c7e66", "#ab9c80", "#c6b898", "#dcd0b2", "#efe6cc"),
  tan: ramp("#5a3a22", "#7a5232", "#9a6c44", "#b68658", "#cea26e", "#e4be8a"),
} as const;
export type BrickColor = keyof typeof BRICK;

const SLATE = ramp("#181c26", "#262c38", "#363e4c", "#4a5464", "#606c7e", "#7e8a9c");
const STONE = ramp("#6e6a60", "#8e887a", "#aca596", "#c8c0ae", "#ddd6c4", "#f2ecdc");
const GLASS = ramp("#121a28", "#1c2a3e", "#2a4058", "#3e5c78", "#62849e", "#9cbcd0");
const SASH = ramp("#8a8a86", "#b0aea6", "#d0ccc2", "#e6e2d8", "#f6f4ee");
const IRON = ramp("#101418", "#1a2024", "#262e32", "#364044", "#4a5658");
const CURTAIN = ramp("#5a3a3a", "#8a5a4a", "#c49a7a", "#e8d2b0");
const WARM_LIGHT = ramp("#6a4a2a", "#a07040", "#d8a860", "#f4d48a");
const BARK = ramp("#241812", "#38261a", "#4e3622", "#664a2e", "#80603c");
const CONCRETE = ramp("#3c3c42", "#5a5a60", "#7c7a7a", "#a09c96", "#c4beb4", "#e2dcd0");
const ASPHALT = ramp("#121216", "#1a1a20", "#22222a", "#2c2c34", "#383840", "#46464e");
const RED_PAINT = ramp("#3a0c10", "#621418", "#8e1e20", "#b82c28", "#d84a3a", "#f07a5e");
const DARK_PAINT = ramp("#0e1018", "#181c26", "#242a38", "#343c4c", "#4c566a", "#6e7a8e");
const TEAL = ramp("#06302e", "#0c4a46", "#12645e", "#1c8078", "#3aa098", "#72c4ba");
const WHITE = ramp("#9a9a9e", "#bcbcbe", "#d8d6d2", "#ecebe6", "#f8f8f4", "#ffffff");
const STREET_LEAF = ramp("#1a4228", "#245a30", "#327438", "#468e40", "#62a84a", "#8cc45a");
const FLOWERS = [rgb("#e84a5a"), rgb("#f6c84a"), rgb("#f4f0e6"), rgb("#c46ad0")];
const SHADOW = rgb("#141428");

export const DOOR_COLORS: Record<string, Rgb[]> = {
  green: ramp("#0a2418", "#123622", "#1c4c30", "#286640", "#3a8052"),
  black: ramp("#0a0c10", "#14181e", "#20262e", "#2e3640", "#424c58"),
  red: ramp("#3a0c10", "#5a1418", "#7e1e22", "#a02c2c", "#c0443c"),
  blue: ramp("#0c1630", "#142446", "#1e3660", "#2c4c80", "#4268a0"),
  oak: ramp("#2a1a10", "#422a18", "#5e3e22", "#7a542e", "#966c3c"),
};

const hline = (img: RgbaImage, x0: number, x1: number, y: number, c: Rgb) => { for (let x = x0; x <= x1; x++) setPx(img, x, y, c); };
const vline = (img: RgbaImage, x: number, y0: number, y1: number, c: Rgb) => { for (let y = y0; y <= y1; y++) setPx(img, x, y, c); };

function shade(img: RgbaImage, x0: number, y0: number, w: number, h: number, amount: number, c: Rgb = SHADOW): void {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (alphaAt(img, x, y)) setPx(img, x, y, mix(getPx(img, x, y), c, amount));
}

// ---------------- brick + facade primitives ----------------

/**
 * Running-bond brick wall. Courses are 3 px (2 px brick + 1 px mortar), bricks 6 px long, offset
 * half a brick per course. Pattern is keyed to absolute x so neighbouring modules line up when chained
 * on the 16 px grid (6 does not divide 16, so the bond is keyed to x mod 48 = lcm(16, 6)… close enough:
 * the mortar colour is close to the brick body so a bond step at a party wall reads as a joint).
 */
function brickWall(img: RgbaImage, x0: number, y0: number, w: number, h: number, pal: Rgb[], seed: number): void {
  const mortar = mix(pal[3]!, STONE[3]!, 0.45);
  for (let y = y0; y < y0 + h; y++) {
    const fromBottom = img.height - 1 - y;
    const course = Math.floor(fromBottom / 3);
    const inCourse = fromBottom % 3;
    for (let x = x0; x < x0 + w; x++) {
      if (inCourse === 2) { setPx(img, x, y, mortar); continue; }
      const off = course % 2 ? 3 : 0;
      const bx = (x + off) % 6;
      if (bx === 5) { setPx(img, x, y, mix(mortar, pal[2]!, 0.35)); continue; }
      const id = Math.floor((x + off) / 6);
      let t = 0.52 + (hash(id, course, seed) - 0.5) * 0.34;
      if (hash(id, course, seed + 9) > 0.93) t -= 0.22; // over-burnt headers
      if (inCourse === 1) t += 0.08; // top of each brick catches the light
      // weathering: soft vertical streaks + grime gathering low on the wall
      t += (vnoise(x, y, 16, seed + 3, 960) - 0.5) * 0.12;
      t -= clamp01((y - (img.height - 26)) / 26) * 0.1;
      setPx(img, x, y, pick(pal, t, x, y, 0.25));
    }
  }
}

/** Stone band (string course / lintel / sill): lit top row, shaded bottom row. */
function stoneBand(img: RgbaImage, x0: number, y0: number, w: number, h: number, pal: Rgb[] = STONE): void {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const t = y === y0 ? 0.95 : y === y0 + h - 1 ? 0.22 : 0.62 - (y - y0) * 0.05;
      setPx(img, x, y, pick(pal, t + (hash(x, y, 51) - 0.5) * 0.06, x, y, 0.2));
    }
  }
  shade(img, x0, y0 + h, w, 1, 0.38);
}

/** Double-hung sash window with stone lintel (+keystone) and sill. (x0, y0) is the glass top-left. */
function sashWindow(img: RgbaImage, x0: number, y0: number, w: number, h: number, seed: number, opts: { arch?: boolean; lit?: boolean; trim?: Rgb[] } = {}): void {
  const trim = opts.trim ?? STONE;
  const r = rng(seed);
  // reveal (dark recess) then frame
  for (let y = y0 - 1; y <= y0 + h; y++) for (let x = x0 - 1; x <= x0 + w; x++) setPx(img, x, y, SASH[1]!);
  // night: the glass (and curtains / blinds behind it) is one window; the sash bars drawn later stay dark
  const win = maskStart(img, opts.lit ? "window-lit" : "window");
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const u = (x - x0) / Math.max(1, w - 1);
      const v = (y - y0) / Math.max(1, h - 1);
      // sky reflection: brighter at the top-left, a diagonal glint band
      let t = 0.62 - v * 0.42 - u * 0.12;
      if (Math.abs((x - x0) - (y - y0) * 0.6 - w * 0.35) < 1.2 && v < 0.55) t += 0.3;
      let c = pick(GLASS, t, x, y, 0.4);
      if (opts.lit) c = pick(WARM_LIGHT, 0.85 - v * 0.4, x, y, 0.4);
      setPx(img, x, y, c);
    }
  }
  // curtains or blinds behind some panes
  const deco = r();
  if (!opts.lit && deco < 0.35) {
    const cw = Math.max(2, Math.round(w * 0.28));
    for (let y = y0; y < y0 + h - 2; y++) for (let k = 0; k < cw - Math.round((y - y0) * 0.08); k++) {
      setPx(img, x0 + k, y, pick(CURTAIN, 0.7 - k * 0.12, x0 + k, y, 0.3));
      setPx(img, x0 + w - 1 - k, y, pick(CURTAIN, 0.45 - k * 0.1, x0 + w - 1 - k, y, 0.3));
    }
  } else if (!opts.lit && deco < 0.55) {
    const bh = Math.round(h * (0.25 + r() * 0.25));
    for (let y = y0; y < y0 + bh; y++) hline(img, x0, x0 + w - 1, y, (y - y0) % 2 ? SASH[2]! : SASH[3]!);
  }
  maskEnd(win);
  // muntins: meeting rail + centre bar
  const mid = y0 + Math.floor(h / 2);
  hline(img, x0, x0 + w - 1, mid, SASH[4]!);
  hline(img, x0, x0 + w - 1, mid + 1, SASH[2]!);
  if (w >= 8) vline(img, x0 + Math.floor(w / 2), y0, y0 + h - 1, SASH[3]!);
  // inner shadow under the head
  for (let x = x0; x < x0 + w; x++) setPx(img, x, y0, mix(getPx(img, x, y0), SHADOW, 0.45));
  // lintel (flat with keystone, or segmental arch of stone)
  if (opts.arch) {
    for (let x = x0 - 2; x <= x0 + w + 1; x++) {
      const u = (x - (x0 + (w - 1) / 2)) / ((w + 4) / 2);
      const lift = Math.round(Math.sqrt(Math.max(0, 1 - u * u)) * 3);
      for (let k = 0; k < 3; k++) setPx(img, x, y0 - 2 - lift - k, pick(trim, k === 2 ? 0.95 : k === 1 ? 0.6 : 0.3, x, y0 - k, 0.2));
    }
  } else {
    stoneBand(img, x0 - 2, y0 - 4, w + 4, 3, trim);
    const kx = x0 + Math.floor(w / 2) - 1;
    rect(img, kx, y0 - 5, 3, 4, trim[4]!);
    setPx(img, kx + 2, y0 - 2, trim[2]!);
  }
  // sill
  stoneBand(img, x0 - 2, y0 + h + 1, w + 4, 2, trim);
}

/** Cornice: bracketed, dentil band and a projecting lit crown with a cast shadow. Returns its height. */
function cornice(img: RgbaImage, y0: number, pal: Rgb[], w: number): number {
  // crown moulding
  hline(img, 0, w - 1, y0, pal[5]!);
  hline(img, 0, w - 1, y0 + 1, pal[3]!);
  hline(img, 0, w - 1, y0 + 2, pal[1]!);
  // dentils + brackets
  for (let x = 0; x < w; x++) {
    setPx(img, x, y0 + 3, x % 2 ? pal[0]! : pal[4]!);
    setPx(img, x, y0 + 4, x % 2 ? pal[0]! : pal[2]!);
    const b = x % 8;
    for (let y = y0 + 5; y < y0 + 8; y++) setPx(img, x, y, b === 1 ? pal[4]! : b === 2 ? pal[2]! : b === 3 && y < y0 + 7 ? pal[1]! : getPx(img, x, y));
  }
  shade(img, 0, y0 + 5, w, 2, 0.35);
  for (let x = 0; x < w; x++) if (x % 8 === 1 || x % 8 === 2) { setPx(img, x, y0 + 5, x % 8 === 1 ? pal[4]! : pal[2]!); setPx(img, x, y0 + 6, x % 8 === 1 ? pal[3]! : pal[1]!); }
  return 8;
}

/** Slate roof band with staggered scallop rows. `inset(y)` gives the left/right inset per row (mansard/gable taper). */
function slateBand(img: RgbaImage, y0: number, y1: number, w: number, inset: (y: number) => number, seed: number): void {
  for (let y = y0; y <= y1; y++) {
    const ins = inset(y);
    const row = Math.floor((y1 - y) / 3);
    for (let x = ins; x < w - ins; x++) {
      const k = (y1 - y) % 3;
      const off = row % 2 ? 2 : 0;
      let t = k === 2 ? 0.75 : k === 1 ? 0.5 : 0.3;
      if ((x + off) % 4 === 0) t -= 0.2;
      t += (hash(Math.floor((x + off) / 4), row, seed) - 0.5) * 0.22;
      t += (1 - (y - y0) / Math.max(1, y1 - y0)) * 0.1; // the upper roof sees more sky
      setPx(img, x, y, pick(SLATE, t, x, y, 0.25));
    }
    if (ins > 0) { setPx(img, ins, y, SLATE[5]!); setPx(img, w - ins - 1, y, SLATE[1]!); }
  }
}

/** Dormer window sitting on a roof slope: little pediment, sash, cheek walls. */
function dormer(img: RgbaImage, cx: number, base: number, wpx: number, hpx: number, trim: Rgb[], seed: number): void {
  const x0 = cx - Math.floor(wpx / 2);
  // cheeks
  rect(img, x0, base - hpx, wpx, hpx, trim[2]!);
  vline(img, x0, base - hpx, base - 1, trim[4]!);
  vline(img, x0 + wpx - 1, base - hpx, base - 1, trim[1]!);
  sashWindow(img, x0 + 2, base - hpx + 3, wpx - 4, hpx - 5, seed, { trim });
  // pediment
  const ph = Math.ceil(wpx / 2.4);
  for (let k = 0; k < ph; k++) {
    const half = Math.round((k / ph) * (wpx / 2 + 1));
    const y = base - hpx - ph + k;
    for (let dx = -half; dx <= half; dx++) setPx(img, cx + dx, y, Math.abs(dx) >= half - 1 ? (dx < 0 ? trim[5]! : trim[1]!) : trim[3]!);
  }
}

/** Brick chimney stack with stone cap and clay pots. */
function chimney(img: RgbaImage, x0: number, top: number, bottom: number, pal: Rgb[], seed: number): void {
  brickWall(img, x0, top + 3, 8, bottom - top - 3, pal, seed);
  vline(img, x0, top + 3, bottom, pal[5]!);
  vline(img, x0 + 7, top + 3, bottom, pal[1]!);
  stoneBand(img, x0 - 1, top + 2, 10, 2);
  for (const px of [x0 + 1, x0 + 5]) { rect(img, px, top, 2, 2, rgb("#a8582e")); setPx(img, px, top, rgb("#d07a44")); }
}

/** Panelled front door with fanlight transom, stone surround. (x0, top) of the opening. */
function frontDoor(img: RgbaImage, x0: number, top: number, w: number, bottom: number, pal: Rgb[], trim: Rgb[]): void {
  // surround
  for (let y = top - 3; y <= bottom; y++) { setPx(img, x0 - 2, y, trim[4]!); setPx(img, x0 - 1, y, trim[2]!); setPx(img, x0 + w, y, trim[3]!); setPx(img, x0 + w + 1, y, trim[1]!); }
  stoneBand(img, x0 - 3, top - 4, w + 6, 2, trim);
  // fanlight
  const fan = 6;
  for (let y = top; y < top + fan; y++) for (let x = x0; x < x0 + w; x++) {
    const ray = Math.floor(Math.atan2(top + fan - y, x - x0 - w / 2) / (Math.PI / 5));
    setPx(img, x, y, (y === top + fan - 1 || ray % 2 === 0) ? SASH[3]! : pick(GLASS, 0.6 - (y - top) * 0.06, x, y, 0.3));
  }
  // door leaf with 4 panels, lit left stile
  for (let y = top + fan; y <= bottom; y++) for (let x = x0; x < x0 + w; x++) {
    const lx = x - x0;
    const ly = y - top - fan;
    const dh = bottom - top - fan;
    let t = 0.55 - (lx / w) * 0.2;
    const inPanel = (lx >= 2 && lx < w / 2 - 1) || (lx >= w / 2 + 1 && lx < w - 2);
    const panelRow = ly >= 2 && ly < dh * 0.45 - 1 ? 0 : ly >= dh * 0.45 + 2 && ly < dh - 3 ? 1 : -1;
    if (inPanel && panelRow >= 0) t -= 0.18;
    if (lx === 0) t += 0.3;
    setPx(img, x, y, pick(pal, t, x, y, 0.3));
  }
  // brass knob + letter slot
  setPx(img, x0 + w - 4, top + fan + Math.floor((bottom - top - fan) / 2), rgb("#f2c650"));
  hline(img, x0 + Math.floor(w / 2) - 2, x0 + Math.floor(w / 2) + 1, top + fan + Math.floor((bottom - top - fan) * 0.55), rgb("#c89a3a"));
}

/** Front stoop: `steps` stone steps rising from the ground to the door sill, with iron railings. */
function stoop(img: RgbaImage, cx: number, doorW: number, steps: number, withRail = true): void {
  const bottom = img.height - 1;
  for (let s = 0; s < steps; s++) {
    const y = bottom - (s + 1) * 3 + 1;
    const half = Math.floor(doorW / 2) + 2 + (steps - 1 - s) * 2;
    for (let yy = y; yy < y + 3; yy++) for (let x = cx - half; x <= cx + half; x++) {
      const t = yy === y ? 0.95 : yy === y + 2 ? 0.3 : 0.6 - (x - cx + half) / (half * 8);
      setPx(img, x, yy, pick(STONE, t, x, yy, 0.25));
    }
  }
  if (!withRail) return;
  const top = bottom - steps * 3 - 9;
  for (const s of [-1, 1]) {
    const half = Math.floor(doorW / 2) + 2 + (steps - 1) * 2;
    const xa = cx + s * half;
    for (let y = top; y <= bottom - 1; y++) {
      const k = (y - top) / (bottom - 1 - top);
      const x = Math.round(cx + s * (Math.floor(doorW / 2) + 2) + s * k * (half - Math.floor(doorW / 2) - 2));
      setPx(img, x, y, IRON[1]!);
    }
    vline(img, xa, bottom - 9, bottom - 1, IRON[0]!);
    setPx(img, xa, bottom - 10, IRON[3]!);
  }
}

/** Striped canvas awning: slopes out over a shop front with a scalloped valance. */
function awning(img: RgbaImage, x0: number, x1: number, y0: number, depth: number, stripes: [Rgb[], Rgb[]]): void {
  for (let x = x0; x <= x1; x++) {
    const sw = Math.floor((x - x0) / 6) % 2;
    const pal = stripes[sw]!;
    for (let y = y0; y < y0 + depth; y++) {
      const v = (y - y0) / depth;
      setPx(img, x, y, pick(pal, 0.82 - v * 0.38 - (x === x0 ? -0.1 : 0), x, y, 0.3));
    }
    // valance
    const scallop = Math.round(1.5 + 1.5 * Math.sin(((x - x0) % 6) / 6 * Math.PI));
    for (let y = y0 + depth; y < y0 + depth + 3 + scallop; y++) setPx(img, x, y, pick(pal, 0.38, x, y, 0.3));
    setPx(img, x, y0 + depth, pal[5]!);
  }
  hline(img, x0, x1, y0, IRON[3]!);
  // shadow cast under the valance onto the shop front
  shade(img, x0, y0 + depth + 6, x1 - x0 + 1, 3, 0.4);
}

// ---------------- rowhouse builder ----------------

export interface RowhouseSpec {
  w: number;
  storeys: 2 | 3 | 4;
  brick: BrickColor;
  roof: "mansard" | "gable" | "flat";
  dormers?: number;
  chimney?: "left" | "right";
  bay?: boolean;
  /** Shop front on the ground floor with a striped awning. */
  shop?: { awning: "red" | "teal"; sign: Rgb[] };
  door: keyof typeof DOOR_COLORS;
  doorSide: "left" | "right";
  trim?: "stone" | "white";
  arches?: boolean;
  seed: number;
}

export const GROUND_FLOOR = 64;
export const STOREY = 44;
const CORNICE_H = 8;
const ROOF_H: Record<RowhouseSpec["roof"], number> = { mansard: 26, gable: 30, flat: 6 };
const CHIMNEY_RISE = 8;

/** Tallest a brick-town building may be: fits an 18-row map over a 3-row ground (240 px). */
export const MAX_BUILDING_H = 240;

export function rowhouseHeight(s: Pick<RowhouseSpec, "storeys" | "roof" | "chimney">): number {
  return GROUND_FLOOR + (s.storeys - 1) * STOREY + CORNICE_H + ROOF_H[s.roof] + (s.chimney ? CHIMNEY_RISE : 0);
}

export function rowhouse(spec: RowhouseSpec): RgbaImage {
  const { w } = spec;
  const h = rowhouseHeight(spec);
  const img = createImage(w, h);
  const pal = BRICK[spec.brick];
  const trim = spec.trim === "white" ? WHITE : STONE;
  const bottom = h - 1;
  const groundTop = h - GROUND_FLOOR;
  const facadeTop = groundTop - (spec.storeys - 1) * STOREY;
  const corniceY = facadeTop - CORNICE_H;
  const roofTop = corniceY - ROOF_H[spec.roof];

  // ---- walls (full width: party walls on both edges) ----
  brickWall(img, 0, facadeTop, w, h - facadeTop, pal, spec.seed);
  // stone water table + plinth
  for (let y = bottom - 3; y <= bottom; y++) hline(img, 0, w - 1, y, y === bottom - 3 ? STONE[4]! : y === bottom ? STONE[0]! : STONE[2]!);
  // string course between ground floor and the upper storeys
  stoneBand(img, 0, groundTop - 2, w, 3, trim);

  // bay layout: door bay + window bays on a regular rhythm
  const bays = Math.max(2, Math.round((w - 8) / 24));
  const bayW = (w - 8) / bays;
  const bayX = (i: number) => Math.round(4 + bayW * i + bayW / 2);
  const doorBay = spec.doorSide === "left" ? 0 : bays - 1;

  // ---- upper storeys ----
  for (let s = 1; s < spec.storeys; s++) {
    const top = groundTop - s * STOREY;
    const winH = s === 1 ? 26 : s === 2 ? 24 : 20;
    for (let i = 0; i < bays; i++) {
      const cx = bayX(i);
      const ww = 10;
      if (spec.bay && s <= 2 && i !== doorBay && bays >= 3) continue; // bay window drawn below
      sashWindow(img, cx - ww / 2, top + 10, ww, winH, spec.seed * 31 + s * 7 + i, { arch: spec.arches, trim });
    }
    if (s < spec.storeys - 1) stoneBand(img, 0, top - 1, w, 1, trim);
  }

  // ---- bay window (two storeys, projecting, three facets) ----
  if (spec.bay && bays >= 3) {
    const nonDoor = [...Array(bays).keys()].filter((i) => i !== doorBay);
    const bx0 = bayX(nonDoor[0]!) - 13;
    const bx1 = bayX(nonDoor[nonDoor.length - 1]!) + 13;
    const btop = groundTop - Math.min(2, spec.storeys - 1) * STOREY + 4;
    const bbot = bottom - 4;
    for (let y = btop; y <= bbot; y++) for (let x = bx0; x <= bx1; x++) {
      const u = (x - bx0) / (bx1 - bx0);
      // brick facets: the left facet faces the light, the right one turns away
      const b = getBrick(pal, x, y, spec.seed + 2);
      setPx(img, x, y, u < 0.2 ? mix(b, STONE[5]!, 0.18) : u > 0.8 ? mix(b, SHADOW, 0.28) : b);
    }
    for (let fl = 0; fl < Math.min(2, spec.storeys - 1) + 1; fl++) {
      const yTop = btop + 6 + fl * STOREY;
      const yH = fl === Math.min(2, spec.storeys - 1) ? 22 : 24;
      if (yTop + yH > bbot - 6) continue;
      const fw = bx1 - bx0;
      const side = Math.round(fw * 0.2);
      sashWindow(img, bx0 + 2, yTop, side - 3, yH, spec.seed + fl * 3, { trim });
      sashWindow(img, bx0 + side + 3, yTop, fw - 2 * side - 5, yH, spec.seed + fl * 3 + 1, { trim });
      sashWindow(img, bx1 - side + 2, yTop, side - 3, yH, spec.seed + fl * 3 + 2, { trim });
      // panel under each window row
      if (fl < Math.min(2, spec.storeys - 1)) stoneBand(img, bx0, yTop + yH + 6, fw + 1, 2, trim);
    }
    // bay cap: small cornice + copper roof
    for (let y = btop - 5; y < btop; y++) hline(img, bx0 - 1 + (btop - y), bx1 + 1 - (btop - y), y, pick(ramp("#2e5a50", "#3e7464", "#5a9480", "#86b8a0"), 0.3 + (btop - y) * 0.15, bx0, y, 0.3));
    hline(img, bx0 - 2, bx1 + 2, btop, trim[5]!);
    vline(img, bx0, btop, bbot, trim[5]!);
    vline(img, bx1, btop, bbot, trim[0]!);
  }

  // ---- ground floor: shop front or residential door + windows ----
  const doorW = 12;
  const doorCx = bayX(doorBay);
  if (spec.shop) {
    const signTop = groundTop + 2;
    // sign band
    const sp = spec.shop.sign;
    for (let y = signTop; y < signTop + 9; y++) hline(img, 2, w - 3, y, y === signTop ? sp[4]! : y === signTop + 8 ? sp[0]! : sp[2]!);
    // abstract gilt lettering: blocks of "letters" (no real words)
    const r = rng(spec.seed + 77);
    let lx = 8;
    while (lx < w - 12) {
      const len = 2 + Math.floor(r() * 3);
      for (let k = 0; k < len; k++) {
        const gx = lx + k * 4;
        if (gx > w - 10) break;
        vline(img, gx, signTop + 3, signTop + 5, rgb("#f2d27a"));
        if (r() > 0.4) setPx(img, gx + 1, signTop + 3, rgb("#f2d27a"));
        if (r() > 0.5) setPx(img, gx + 1, signTop + 5, rgb("#f2d27a"));
      }
      lx += len * 4 + 4;
    }
    // shop front frame (painted)
    const fp = spec.shop.sign;
    const fTop = signTop + 10;
    for (let y = fTop; y < bottom - 3; y++) {
      setPx(img, 2, y, fp[4]!); setPx(img, 3, y, fp[2]!);
      setPx(img, w - 4, y, fp[3]!); setPx(img, w - 3, y, fp[1]!);
    }
    // display windows on panelled stall risers; recessed door on doorSide
    const dx0 = spec.doorSide === "left" ? 5 : w - 5 - doorW - 2;
    const winRanges: Array<[number, number]> = spec.doorSide === "left" ? [[dx0 + doorW + 3, w - 6]] : [[5, dx0 - 2]];
    for (const [a, b] of winRanges) {
      // night: shop windows are lit (one window per range; the frames drawn below stay dark)
      const shop = maskStart(img, "window-lit");
      for (let y = fTop + 12; y < bottom - 12; y++) for (let x = a; x <= b; x++) {
        const v = (y - fTop) / (bottom - fTop);
        let c = pick(GLASS, 0.55 - v * 0.3 + (x - a < 3 ? 0.15 : 0), x, y, 0.4);
        // goods on shelves behind the glass
        if ((y - fTop) % 10 >= 6 && hash(Math.floor(x / 3), Math.floor(y / 10), spec.seed) > 0.4) c = mix(c, pick(WARM_LIGHT, 0.6, x, y, 0.4), 0.5);
        setPx(img, x, y, c);
      }
      maskEnd(shop);
      for (let x = a; x <= b; x++) { setPx(img, x, fTop + 11, fp[4]!); setPx(img, x, bottom - 12, fp[4]!); }
      for (let y = bottom - 11; y < bottom - 3; y++) for (let x = a; x <= b; x++) setPx(img, x, y, pick(fp, (x - a) % 10 < 2 ? 0.75 : 0.42, x, y, 0.3));
      for (let x = a + 8; x < b; x += Math.max(10, Math.floor((b - a) / 3))) vline(img, x, fTop + 12, bottom - 13, fp[3]!);
    }
    // recessed door (dark, glazed upper half)
    for (let y = fTop + 4; y < bottom - 3; y++) for (let x = dx0; x < dx0 + doorW + 2; x++) {
      const upper = y < fTop + 24;
      setPx(img, x, y, upper && x > dx0 + 1 && x < dx0 + doorW ? pick(GLASS, 0.45, x, y, 0.3) : pick(DOOR_COLORS[spec.door]!, 0.45 - (x - dx0) * 0.02, x, y, 0.3));
    }
    vline(img, dx0, fTop + 4, bottom - 4, SHADOW);
    setPx(img, dx0 + doorW - 1, fTop + 30, rgb("#f2c650"));
    awning(img, 1, w - 2, fTop, 9, spec.shop.awning === "red" ? [RED_PAINT, WHITE] : [TEAL, WHITE]);
  } else {
    const steps = 3;
    const doorBottom = bottom - steps * 3 - 1;
    frontDoor(img, doorCx - doorW / 2, groundTop + 8, doorW, doorBottom, DOOR_COLORS[spec.door]!, trim);
    stoop(img, doorCx, doorW, steps);
    // parlour windows (tall) on the other bays; basement grille below
    for (let i = 0; i < bays; i++) {
      if (i === doorBay || (spec.bay && bays >= 3)) continue;
      const cx = bayX(i);
      sashWindow(img, cx - 5, groundTop + 10, 10, 30, spec.seed * 7 + i, { arch: spec.arches, trim, lit: hash(i, 3, spec.seed) > 0.8 });
      for (let x = cx - 5; x < cx + 5; x++) for (let y = bottom - 10; y < bottom - 4; y++) setPx(img, x, y, (x + y) % 3 === 0 ? IRON[3]! : IRON[0]!);
    }
  }

  // ---- cornice + roof ----
  if (spec.roof === "flat") {
    // parapet above the cornice
    brickWall(img, 0, roofTop, w, corniceY - roofTop, pal, spec.seed + 1);
    stoneBand(img, 0, roofTop, w, 2, trim);
  } else if (spec.roof === "mansard") {
    slateBand(img, roofTop + 2, corniceY - 1, w, (y) => Math.max(0, Math.round((corniceY - 1 - y) * 0.12)), spec.seed);
    hline(img, 0, w - 1, roofTop + 1, IRON[2]!);
    hline(img, 1, w - 2, roofTop, IRON[4]!);
    // iron cresting on the ridge
    for (let x = 2; x < w - 2; x += 4) { setPx(img, x, roofTop - 1, IRON[3]!); setPx(img, x, roofTop - 2, IRON[1]!); }
  } else {
    // gable: steeper slate slope behind a centred front gable with a round vent
    slateBand(img, roofTop + 8, corniceY - 1, w, (y) => Math.max(0, Math.round((corniceY - 1 - y) * 0.2)), spec.seed);
    const cx = Math.floor(w / 2);
    const gh = corniceY - roofTop;
    for (let k = 0; k < gh; k++) {
      const half = Math.round((k / gh) * (w * 0.36));
      const y = roofTop + k;
      for (let dx = -half; dx <= half; dx++) {
        const edge = half - Math.abs(dx);
        const c = edge < 2 ? (dx < 0 ? trim[5]! : trim[1]!) : getBrick(pal, cx + dx, y, spec.seed);
        setPx(img, cx + dx, y, c);
      }
    }
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const d = Math.hypot(dx, dy);
      if (d <= 3.4) setPx(img, cx + dx, roofTop + Math.round(gh * 0.55) + dy, d > 2.3 ? trim[4]! : (dx + dy) % 2 ? SHADOW : SASH[1]!);
    }
  }
  cornice(img, corniceY, trim, w);
  if (spec.roof !== "flat") {
    const n = spec.dormers ?? 0;
    for (let i = 0; i < n; i++) dormer(img, Math.round(((i + 0.5) / n) * w), corniceY - 1, 12, 15, trim, spec.seed + 40 + i);
  }
  if (spec.chimney) {
    const cxp = spec.chimney === "left" ? 3 : w - 11;
    chimney(img, cxp, roofTop - CHIMNEY_RISE + (spec.roof === "gable" ? 6 : 0), corniceY - 2, pal, spec.seed + 5);
  }

  // ---- party walls: a lit pilaster on the left, a shadowed joint on the right ----
  for (let y = facadeTop; y < bottom - 3; y++) {
    setPx(img, 0, y, mix(getPx(img, 0, y), STONE[5]!, 0.22));
    setPx(img, w - 1, y, mix(getPx(img, w - 1, y), SHADOW, 0.5));
  }
  // downpipe on the right party wall
  for (let y = corniceY + 3; y < bottom - 3; y++) { setPx(img, w - 3, y, IRON[3]!); setPx(img, w - 2, y, IRON[1]!); }
  selOutline(img, 0.4);
  return img;
}

function getBrick(pal: Rgb[], x: number, y: number, seed: number): Rgb {
  const course = Math.floor(y / 3);
  if (y % 3 === 2) return mix(pal[3]!, STONE[3]!, 0.45);
  const id = Math.floor((x + (course % 2 ? 3 : 0)) / 6);
  return pick(pal, 0.5 + (hash(id, course, seed) - 0.5) * 0.3, x, y, 0.25);
}

/** The modular rowhouse catalogue: part id → spec. Widths on the 16 px grid. */
export const ROWHOUSES: Record<string, { name: string; spec: RowhouseSpec; recolorBase: string; tags: string[] }> = {
  prop_bld_brick_row2_red: {
    name: "Brick rowhouse · 2 storeys, red, gable",
    spec: { w: 64, storeys: 2, brick: "red", roof: "gable", chimney: "right", door: "green", doorSide: "left", seed: 11 },
    recolorBase: "#9c3a26", tags: ["rowhouse", "red", "gable"],
  },
  prop_bld_brick_row3_brown: {
    name: "Brick rowhouse · 3 storeys, brown, mansard",
    spec: { w: 64, storeys: 3, brick: "brown", roof: "mansard", dormers: 1, chimney: "left", door: "black", doorSide: "right", arches: true, seed: 23 },
    recolorBase: "#74482e", tags: ["rowhouse", "brown", "mansard", "dormer"],
  },
  prop_bld_brick_row3_cream_bay: {
    name: "Brick rowhouse · 3 storeys, cream, bay window",
    spec: { w: 80, storeys: 3, brick: "cream", roof: "flat", bay: true, door: "blue", doorSide: "left", trim: "white", seed: 37 },
    recolorBase: "#c6b898", tags: ["rowhouse", "cream", "bay-window", "cornice"],
  },
  prop_bld_brick_row4_tan: {
    name: "Brick rowhouse · 4 storeys, tan, mansard",
    spec: { w: 80, storeys: 4, brick: "tan", roof: "mansard", dormers: 2, chimney: "right", door: "red", doorSide: "right", seed: 41 },
    recolorBase: "#b68658", tags: ["rowhouse", "tan", "mansard", "dormer", "tall"],
  },
  prop_bld_brick_row3_red_bay: {
    name: "Brick rowhouse · 3 storeys, red, bay + mansard",
    spec: { w: 80, storeys: 3, brick: "red", roof: "mansard", dormers: 2, bay: true, door: "oak", doorSide: "right", trim: "white", seed: 53 },
    recolorBase: "#9c3a26", tags: ["rowhouse", "red", "bay-window", "mansard", "dormer"],
  },
  prop_bld_brick_row2_brown: {
    name: "Brick rowhouse · 2 storeys, brown, flat cornice",
    spec: { w: 64, storeys: 2, brick: "brown", roof: "flat", door: "green", doorSide: "right", arches: true, seed: 67 },
    recolorBase: "#74482e", tags: ["rowhouse", "brown", "cornice"],
  },
  prop_bld_brick_shop_red: {
    name: "Brick shop · 3 storeys, red/white awning",
    spec: { w: 80, storeys: 3, brick: "red", roof: "mansard", dormers: 2, door: "black", doorSide: "left", shop: { awning: "red", sign: DARK_PAINT }, trim: "white", seed: 71 },
    recolorBase: "#9c3a26", tags: ["shop", "awning", "red", "mansard"],
  },
  prop_bld_brick_shop_teal: {
    name: "Brick shop · 2 storeys, tan, teal awning",
    spec: { w: 96, storeys: 2, brick: "tan", roof: "flat", door: "oak", doorSide: "right", shop: { awning: "teal", sign: TEAL }, seed: 83 },
    recolorBase: "#b68658", tags: ["shop", "awning", "teal", "tan", "cafe"],
  },
  prop_bld_brick_shop_cream: {
    name: "Brick shop · 4 storeys, cream, teal awning",
    spec: { w: 96, storeys: 4, brick: "cream", roof: "gable", door: "blue", doorSide: "left", shop: { awning: "teal", sign: DARK_PAINT }, trim: "white", arches: true, seed: 97 },
    recolorBase: "#c6b898", tags: ["shop", "awning", "teal", "cream", "gable", "tall"],
  },
};

// ---------------- street dressing ----------------

/** Street tree with a full, layered canopy and an iron tree grate. 64×112 */
function streetTree(): RgbaImage {
  const w = 64;
  const h = 112;
  const img = createImage(w, h);
  // trunk + a few limbs
  for (let y = 52; y < h - 2; y++) {
    const flare = y > h - 8 ? h - 8 - y : 0;
    for (let x = 30 + flare; x <= 34 - flare; x++) setPx(img, x, y, pick(BARK, 0.85 - (x - 30) * 0.18 + (hash(x, y >> 1, 3) - 0.5) * 0.2, x, y, 0.3));
  }
  for (let i = 0; i < 14; i++) { setPx(img, 30 - Math.round(i * 0.8), 60 - i, BARK[3]!); setPx(img, 34 + Math.round(i * 0.7), 62 - i, BARK[1]!); }
  const r = rng(5);
  const puffs: Array<[number, number, number]> = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    puffs.push([32 + Math.cos(a) * 17 + (r() - 0.5) * 4, 40 + Math.sin(a) * 18 * 0.85 + (r() - 0.5) * 4, 11 + r() * 4]);
  }
  puffs.push([24, 30, 14], [40, 28, 13], [32, 18, 13], [32, 44, 15]);
  foliage(img, puffs, STREET_LEAF, 17, { light: [24, 26, 34] });
  // tree grate + soil
  for (let x = 20; x < 45; x++) { setPx(img, x, h - 2, (x % 3 === 0) ? IRON[0]! : IRON[3]!); setPx(img, x, h - 1, IRON[1]!); }
  selOutline(img, 0.4);
  return img;
}

/** Brick planter box with flowers. 32×24 */
function planter(): RgbaImage {
  const img = createImage(32, 24);
  for (let y = 12; y < 24; y++) for (let x = 2; x < 30; x++) setPx(img, x, y, getBrick(BRICK.red, x, y, 9));
  stoneBand(img, 1, 11, 30, 2);
  foliage(img, [[8, 9, 5], [16, 7, 6], [24, 9, 5]], STREET_LEAF, 23, { flatBottom: 11 });
  const r = rng(2);
  for (let i = 0; i < 14; i++) { const fx = 4 + Math.floor(r() * 24); const fy = 3 + Math.floor(r() * 8); if (alphaAt(img, fx, fy)) setPx(img, fx, fy, FLOWERS[i % FLOWERS.length]!); }
  selOutline(img, 0.4);
  return img;
}

/** Victorian cast-iron lamp post with a lantern head. 16×88 */
function lampPost(): RgbaImage {
  const img = createImage(16, 88);
  const cx = 7;
  for (let y = 16; y < 84; y++) { setPx(img, cx, y, IRON[4]!); setPx(img, cx + 1, y, IRON[1]!); }
  for (let y = 76; y < 88; y++) { const half = y > 84 ? 4 : 2 + (y > 80 ? 1 : 0); hline(img, cx - half + 1, cx + half, y, pick(IRON, 0.7 - (y - 76) * 0.03, cx, y, 0.3)); }
  hline(img, cx - 2, cx + 3, 20, IRON[3]!);
  // lantern: cap, glass, base
  for (let y = 2; y < 6; y++) hline(img, cx - (y - 1), cx + 1 + (y - 1), y, IRON[y < 4 ? 3 : 1]!);
  for (let y = 6; y < 15; y++) for (let x = cx - 3; x <= cx + 4; x++) setPx(img, x, y, x === cx - 3 || x === cx + 4 ? IRON[2]! : pick(ramp("#c8b070", "#e8d28e", "#fff0c0"), 0.8 - (y - 6) * 0.06, x, y, 0.4));
  hline(img, cx - 3, cx + 4, 15, IRON[2]!);
  setPx(img, cx, 0, IRON[3]!); setPx(img, cx, 1, IRON[2]!);
  markRect(img, cx - 2, 6, 6, 9, "light"); // night: the lantern glass
  selOutline(img, 0.4);
  return img;
}

/** Red fire hydrant. 12×18 */
function hydrant(): RgbaImage {
  const img = createImage(12, 18);
  for (let y = 4; y < 18; y++) {
    const half = y < 6 ? 2 : y > 15 ? 4 : 3;
    for (let dx = -half; dx < half; dx++) setPx(img, 6 + dx, y, pick(RED_PAINT, 0.85 - (dx + half) / (half * 2) * 0.6, 6 + dx, y, 0.3));
  }
  for (let y = 1; y < 4; y++) hline(img, 4, 7, y, RED_PAINT[y === 1 ? 5 : 3]!);
  rect(img, 1, 8, 2, 3, RED_PAINT[3]!); rect(img, 9, 8, 2, 3, RED_PAINT[1]!);
  hline(img, 2, 9, 16, IRON[2]!); hline(img, 2, 9, 17, IRON[1]!);
  setPx(img, 5, 9, WHITE[4]!);
  selOutline(img, 0.4);
  return img;
}

/** Bus stop: glass shelter on a steel frame with a bench, timetable and a sign pole. 64×64 */
function busStop(): RgbaImage {
  const img = createImage(64, 64);
  // sign pole
  for (let y = 4; y < 64; y++) { setPx(img, 56, y, STEEL_C[4]!); setPx(img, 57, y, STEEL_C[1]!); }
  for (let y = 2; y < 14; y++) for (let x = 51; x < 63; x++) {
    const d = Math.hypot(x - 56.5, y - 7.5);
    if (d < 6) setPx(img, x, y, d > 4.6 ? WHITE[4]! : rgb("#d23a2e"));
  }
  rect(img, 54, 6, 6, 3, WHITE[5]!);
  rect(img, 52, 15, 10, 6, rgb("#1e3a6e")); hline(img, 53, 60, 17, WHITE[4]!); hline(img, 53, 58, 19, WHITE[3]!);
  // shelter roof + frame
  for (let y = 10; y < 14; y++) hline(img, 0, 46, y, pick(STEEL_C, y === 10 ? 0.95 : 0.4, 0, y, 0.2));
  for (const px of [2, 44]) for (let y = 14; y < 64; y++) { setPx(img, px, y, STEEL_C[4]!); setPx(img, px + 1, y, STEEL_C[2]!); }
  // glass back panel with a poster
  for (let y = 14; y < 56; y++) for (let x = 4; x < 44; x++) blendPx(img, x, y, mix(GLASS[5]!, rgb("#ffffff"), 0.2), Math.abs((x - 4) - (y - 14) * 0.5 - 8) < 2 ? 150 : 70);
  for (let y = 18; y < 42; y++) for (let x = 30; x < 42; x++) setPx(img, x, y, y < 24 ? rgb("#2a6aa8") : pick(ramp("#e8d06a", "#f6e6a0"), 0.3 + (x - 30) * 0.05, x, y, 0.4));
  markRect(img, 30, 18, 12, 24, "window-lit"); // night: the backlit poster
  // bench
  hline(img, 6, 28, 48, rgb("#9a6a3a")); hline(img, 6, 28, 49, rgb("#6a4626"));
  for (const bx of [8, 26]) vline(img, bx, 50, 63, STEEL_C[1]!);
  selOutline(img, 0.4);
  return img;
}
const STEEL_C = ramp("#1e2430", "#343c4a", "#525c6c", "#7a8494", "#a8b0bc", "#d8dee6");

/** Car side view helper: body silhouette by column (roof profile), windows, wheels. */
function car(w: number, h: number, body: Rgb[], kind: "hatch" | "sedan"): RgbaImage {
  const img = createImage(w, h);
  const wheelR = 5;
  const groundY = h - 1;
  const sill = groundY - 4;
  const belt = sill - 9;
  // roof profile per column
  const roofAt = (x: number): number | null => {
    const u = x / (w - 1);
    if (kind === "hatch") {
      if (u < 0.2 || u > 0.94) return null;
      const front = 0.2 + 0.2; // windscreen
      if (u < front) return Math.round(belt - ((u - 0.2) / 0.2) * 11);
      if (u > 0.86) return Math.round(belt - 11 + ((u - 0.86) / 0.08) * 6);
      return belt - 11;
    }
    if (u < 0.24 || u > 0.8) return null;
    if (u < 0.38) return Math.round(belt - ((u - 0.24) / 0.14) * 10);
    if (u > 0.66) return Math.round(belt - 10 + ((u - 0.66) / 0.14) * 10);
    return belt - 10;
  };
  // lower body
  for (let x = 1; x < w - 1; x++) {
    const u = x / (w - 1);
    const nose = kind === "hatch" ? (u < 0.08 ? Math.round((0.08 - u) * 40) : u > 0.97 ? 2 : 0) : (u < 0.06 ? Math.round((0.06 - u) * 50) : u > 0.95 ? Math.round((u - 0.95) * 60) : 0);
    for (let y = belt + nose; y <= sill; y++) {
      let t = 0.55 - (y - belt) * 0.025;
      if (y === belt + nose) t = 0.95;
      if (y === belt + 4) t -= 0.12; // swage line
      setPx(img, x, y, pick(body, t, x, y, 0.3));
    }
  }
  // cabin
  for (let x = 0; x < w; x++) {
    const top = roofAt(x);
    if (top === null) continue;
    for (let y = top; y < belt; y++) setPx(img, x, y, y === top ? body[5]! : body[3]!);
  }
  // glass inset
  for (let x = 0; x < w; x++) {
    const top = roofAt(x);
    if (top === null) continue;
    for (let y = top + 2; y < belt - 1; y++) {
      const l = roofAt(x - 2);
      const r = roofAt(x + 2);
      if (l === null || r === null || y < l + 2 || y < r + 2) continue;
      setPx(img, x, y, pick(GLASS, 0.75 - (y - top) * 0.06 + (Math.abs(x - y * 1.2 - w * 0.2) % 14 < 2 ? 0.2 : 0), x, y, 0.3));
    }
  }
  // pillars
  const pillars = kind === "hatch" ? [0.5, 0.74] : [0.52];
  for (const p of pillars) { const px = Math.round(p * (w - 1)); for (let y = belt - 12; y < belt; y++) if (alphaAt(img, px, y)) { setPx(img, px, y, body[1]!); setPx(img, px + 1, y, body[2]!); } }
  // door seams, handle, lights
  for (const p of pillars) vline(img, Math.round(p * (w - 1)), belt, sill - 1, body[1]!);
  hline(img, Math.round(pillars[0]! * (w - 1)) - 5, Math.round(pillars[0]! * (w - 1)) - 2, belt + 2, body[5]!);
  for (let y = belt + 1; y < belt + 4; y++) { setPx(img, w - 2, y, rgb("#fff2c0")); setPx(img, 1, y, rgb("#d02a2a")); }
  // bumpers
  hline(img, 0, 4, sill, IRON[2]!); hline(img, w - 5, w - 1, sill, IRON[2]!);
  // wheels
  for (const u of [0.2, 0.8]) {
    const cx = Math.round(u * (w - 1));
    const cy = groundY - wheelR;
    for (let y = cy - wheelR - 1; y <= cy + wheelR; y++) for (let x = cx - wheelR - 1; x <= cx + wheelR + 1; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d <= wheelR + 1.2 && y < cy - 1) setPx(img, x, y, IRON[0]!); // arch
      if (d <= wheelR) setPx(img, x, y, d > wheelR - 1.6 ? IRON[1]! : d > 2.2 ? STEEL_C[3]! : STEEL_C[5]!);
    }
  }
  selOutline(img, 0.4, false);
  // soft contact shadow
  for (let x = 2; x < w - 2; x++) blendPx(img, x, groundY, SHADOW, 120);
  return img;
}
const redHatch = () => car(56, 30, RED_PAINT, "hatch");
const darkSedan = () => car(72, 28, DARK_PAINT, "sedan");

/**
 * Road strip seen from the side of the street: curb face, gutter, a parking lane, a dashed centre
 * line and the far lane. 128×42; tiles seamlessly along x (pattern period divides 128).
 * Place it on the front layer with `groundOffset: 48` so it covers a 3-row ground below the sidewalk.
 */
export const ROAD_H = 42;
function roadStrip(): RgbaImage {
  const w = 128;
  const img = createImage(w, ROAD_H);
  for (let y = 0; y < ROAD_H; y++) for (let x = 0; x < w; x++) {
    let c: Rgb;
    if (y < 4) c = pick(CONCRETE, y === 0 ? 0.95 : 0.7 - y * 0.1, x, y, 0.2); // curb face
    else if (y === 4) c = CONCRETE[0]!;
    else if (y < 8) c = pick(CONCRETE, 0.35 + (hash(x, y, 3) - 0.5) * 0.1, x, y, 0.2); // gutter
    else {
      const grain = hash(x, y, 7);
      let t = 0.5 + (vnoise(x, y, 8, 11, w) - 0.5) * 0.25 + (grain > 0.92 ? 0.25 : grain < 0.06 ? -0.2 : 0);
      t -= clamp01((y - 8) / 6) * 0.1;
      c = pick(ASPHALT, t, x, y, 0.4);
    }
    setPx(img, x, y, c);
  }
  // curb joints every 32 px
  for (let x = 8; x < w; x += 32) vline(img, x, 0, 3, CONCRETE[1]!);
  // tyre-polished parking lane + dashed centre line (dash 16 / gap 16 → period 32)
  for (let x = 0; x < w; x++) {
    if (x % 32 < 16) { hline(img, x, x, 32, rgb("#f2e6b0")); hline(img, x, x, 33, rgb("#c8bc8a")); }
    if (hash(x, 1, 5) > 0.6) setPx(img, x, 24, ASPHALT[4]!);
  }
  // a storm drain grate and an old patch
  for (let x = 40; x < 52; x++) for (let y = 5; y < 8; y++) setPx(img, x, y, (x % 2) ? IRON[0]! : IRON[2]!);
  for (let y = 14; y < 20; y++) for (let x = 84; x < 100; x++) setPx(img, x, y, pick(ASPHALT, 0.25 + (hash(x, y, 2) - 0.5) * 0.1, x, y, 0.3));
  return img;
}

// ---------------- parallax layers ----------------

/** Hazy city skyline with church spires, a clock tower and water towers. Loops every W px. */
function citySpires(): RgbaImage {
  const img = createImage(W, H);
  const haze = rgb("#b8d2e8");
  const back = ramp("#7c96b4", "#8aa4c0", "#9ab2cc", "#aac0d6");
  const front = ramp("#5e7898", "#6c86a6", "#7c96b4", "#90a8c4", "#a4bad2");
  // back roofline
  const r = rng(61);
  const roof = (x: number, base: number, seed: number) => base - Math.floor(vnoise(x, 0, 24, seed, W) * 22) - (hash(Math.floor(x / 12), 0, seed) > 0.7 ? 6 : 0);
  for (let x = 0; x < W; x++) {
    const top = roof(x, 196, 3);
    for (let y = top; y < H; y++) setPx(img, x, y, pick(back, 0.6 - (y - top) * 0.004 + (y === top ? 0.3 : 0), x, y, 0.4));
  }
  // spires (loop-safe placement)
  const spire = (cx: number, base: number, tw: number, th: number, sh: number, pal: Rgb[]) => {
    for (let y = base - th; y < base; y++) for (let dx = -tw; dx <= tw; dx++) setWrap(img, cx + dx, y, pick(pal, dx < 0 ? 0.7 : 0.35, wrapX(cx + dx), y, 0.3));
    for (let k = 0; k < sh; k++) {
      const half = Math.round((k / sh) * tw);
      for (let dx = -half; dx <= half; dx++) setWrap(img, cx + dx, base - th - sh + k, pick(pal, dx < 0 ? 0.8 : 0.3, wrapX(cx + dx), base - th - sh + k, 0.3));
    }
    for (const yy of [base - th + 6, base - th + 14]) for (let dx = -1; dx <= 0; dx++) setWrap(img, cx + dx, yy, pal[0]!);
  };
  spire(70, 190, 5, 42, 34, back);
  spire(300, 196, 4, 30, 26, back);
  spire(420, 188, 6, 30, 20, back);
  // clock tower
  for (let y = 120; y < 200; y++) for (let dx = -8; dx <= 8; dx++) setPx(img, 190 + dx, y, pick(front, dx < -2 ? 0.75 : 0.45, 190 + dx, y, 0.3));
  for (let k = 0; k < 14; k++) { const half = 9 - Math.round(k * 0.6); hline(img, 190 - half, 190 + half, 120 - k, front[k < 4 ? 1 : 2]!); }
  for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) if (Math.hypot(dx, dy) < 4.3) setPx(img, 190 + dx, 134 + dy, Math.hypot(dx, dy) > 3.2 ? front[1]! : rgb("#e8eef2"));
  // front roofline with water towers + chimneys
  for (let x = 0; x < W; x++) {
    const top = roof(x, 220, 9);
    for (let y = top; y < H; y++) {
      let c = pick(front, 0.5 - (y - top) * 0.005 + (y === top ? 0.35 : 0), x, y, 0.4);
      if (y > top + 4 && (x % 9 === 3 || x % 9 === 5) && (y - top) % 11 < 5 && hash(Math.floor(x / 9), Math.floor((y - top) / 11), 4) > 0.45) c = front[4]!;
      setPx(img, x, y, c);
    }
  }
  for (const wx of [120, 360]) {
    const top = roof(wx, 220, 9);
    for (let y = top - 16; y < top - 6; y++) for (let dx = -5; dx <= 5; dx++) setPx(img, wx + dx, y, pick(front, dx < 0 ? 0.6 : 0.3, wx + dx, y, 0.3));
    for (let k = 0; k < 4; k++) hline(img, wx - 5 + k, wx + 5 - k, top - 17 - k, front[1]!);
    for (const lx of [wx - 4, wx + 4]) for (let y = top - 6; y < top; y++) setPx(img, lx, y, front[0]!);
  }
  // atmospheric haze toward the bottom of the far layer
  for (let y = 150; y < H; y++) for (let x = 0; x < W; x++) if (alphaAt(img, x, y) && bayer(x, y) < clamp01((y - 200) / 60) * 0.5) setPx(img, x, y, mix(getPx(img, x, y), haze, 0.35));
  void r;
  return img;
}

/** Wooden utility poles every 240 px with sagging power lines and a transformer. Loops every W px. */
function utilityPoles(): RgbaImage {
  const img = createImage(W, H);
  const wood = ramp("#2a1e16", "#3e2c20", "#56402c", "#6e5438", "#8a6c48");
  const poles = [100, 340];
  const wireYs = [58, 64, 74];
  // wires: catenary between consecutive poles (wrapping) — drawn first so the poles cover the ends
  for (let i = 0; i < poles.length; i++) {
    const a = poles[i]!;
    const b = poles[(i + 1) % poles.length]! + (i + 1 === poles.length ? W : 0);
    for (const wy of wireYs) for (let x = a; x <= b; x++) {
      const u = (x - a) / (b - a);
      const sag = Math.round(4 * u * (1 - u) * 12);
      setWrap(img, x, wy + sag, rgb("#20242c"));
    }
  }
  for (const px of poles) {
    for (let y = 50; y < H; y++) { setPx(img, px - 1, y, wood[4]!); setPx(img, px, y, wood[2]!); setPx(img, px + 1, y, wood[1]!); }
    for (const [cy, half] of [[57, 12], [73, 9]] as const) { hline(img, px - half, px + half, cy, wood[3]!); hline(img, px - half, px + half, cy + 1, wood[0]!); }
    for (const dx of [-11, -5, 5, 11]) { setPx(img, px + dx, 56, rgb("#c8d0d8")); }
    // transformer can
    for (let y = 82; y < 98; y++) for (let x = px + 3; x < px + 11; x++) setPx(img, x, y, pick(ramp("#4a525c", "#6a747e", "#8c96a0", "#b0b8c0"), x < px + 5 ? 0.9 : 0.4, x, y, 0.3));
    hline(img, px + 3, px + 10, 81, rgb("#2a3038"));
    // street sign on the pole
    rect(img, px - 9, 128, 18, 6, rgb("#1e6e46")); hline(img, px - 8, px + 6, 130, rgb("#e6f2e6"));
  }
  return img;
}

export const BRICK_DRAW = {
  streetTree, planter, lampPost, hydrant, busStop, redHatch, darkSedan, roadStrip, citySpires, utilityPoles,
} satisfies Record<string, () => RgbaImage>;
void H;
