/**
 * Night version of a side-view scene, made from the day art (no extra parts to draw):
 *   sky        → the bg_sky_night part (moon, stars, milky way) when the workspace has it, else a moonlit grade
 *   layers     → moonlit grade (far bands a bit darker and bluer)
 *   tiles      → moonlit grade
 *   props      → moonlit grade that keeps relative contrast (signs stay readable, just dim); glass panes become
 *                warm lit windows (seeded per part, some stay dark), lamps / bulbs / lanterns stay bright
 *   glow       → one map-sized warm halo layer (synthetic front prop "__night_glow") around every light
 *   characters → tinted to match (nightSprite)
 * Pure and deterministic: same scene → same pixels. Day rendering never goes through here.
 */
import { applyColor, createImage, type RgbaImage } from "./raster.js";
import type { CharacterSprite, SceneAssets } from "./render.js";
import type { BackgroundPart, PartMeta, PropPart, SceneDoc } from "./types.js";
import { mapSize } from "./render.js";

export const NIGHT_SKY_PART = "bg_sky_night";
export const NIGHT_GLOW_PART = "__night_glow";
/** Multiply + add of the moonlit grade (also used for the player tint in the Godot / Pixi runtimes). */
export const NIGHT_MUL = [0.3, 0.34, 0.52] as const;
const NIGHT_ADD = [4, 6, 16] as const;
export const NIGHT_CHARACTER_TINT = [0.62, 0.66, 0.9] as const;

type Px = RgbaImage["data"];

function gradeInto(d: Px, i: number, k = 1): void {
  for (let c = 0; c < 3; c++) {
    const m = 1 - (1 - NIGHT_MUL[c]!) * k;
    d[i + c] = Math.min(255, Math.round(d[i + c]! * m + NIGHT_ADD[c]! * k));
  }
}

/** Moonlit grade of a whole image (k = strength, 1 = normal night). */
export function nightGrade(img: RgbaImage, k = 1): RgbaImage {
  const out = { width: img.width, height: img.height, data: new Uint8Array(img.data) };
  for (let i = 0; i < out.data.length; i += 4) if (out.data[i + 3]) gradeInto(out.data, i, k);
  return out;
}

const lum = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;
function hash(a: number, b: number, s: number): number {
  let h = (a * 374761393 + b * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function strHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export interface LightPoint {
  x: number;
  y: number;
  /** halo radius px */
  r: number;
  /** 0..1 */
  a: number;
}

export interface NightProp {
  image: RgbaImage;
  lights: LightPoint[];
}

/** Night version of one prop image + its light points (prop-local px). */
export function nightProp(img: RgbaImage, partId: string, meta?: PartMeta): NightProp {
  const { width: w, height: h, data: src } = img;
  const out = new Uint8Array(src);
  const lights: LightPoint[] = [];
  const seed = strHash(partId);
  const lantern = /lantern/.test(partId);
  const lampish = /lamp|lantern|pole|shrine|mini_mart|noodle|roti|halal|stall|bus_stop/.test(partId);
  const building = (meta as PropPart | undefined)?.category === "building" || /prop_bld_|house|hut/.test(partId);
  const kind = new Uint8Array(w * h); // 0 plain · 1 glass · 2 emissive
  for (let p = 0; p < w * h; p++) {
    const i = p * 4;
    if (src[i + 3]! < 8) continue;
    const r = src[i]!, g = src[i + 1]!, b = src[i + 2]!;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const L = lum(r, g, b);
    // light sources: bright warm bulbs (anywhere), saturated red/yellow on lanterns
    if ((r >= 225 && g >= 165 && b <= 170 && r - b >= 60 && (lampish || L > 235)) || (lantern && r > 150 && g < 110 && b < 110)) kind[p] = 2;
    // glass: cool, mid-tone, a little saturated
    else if (building && b >= r + 12 && b >= g - 8 && mx - mn >= 16 && L > 22 && L < 215) kind[p] = 1;
  }
  // big bright patches are paint or sign boards, not bulbs: back to plain (they get the dim grade)
  {
    const seen = new Uint8Array(w * h);
    const st: number[] = [];
    for (let p = 0; p < w * h; p++) {
      if (kind[p] !== 2 || seen[p]) continue;
      const cells: number[] = [];
      seen[p] = 1;
      st.push(p);
      while (st.length) {
        const q = st.pop()!;
        cells.push(q);
        const qx = q % w, qy = (q / w) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nx = qx + dx, ny = qy + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const n = ny * w + nx;
          if (kind[n] === 2 && !seen[n]) {
            seen[n] = 1;
            st.push(n);
          }
        }
      }
      if (cells.length > (lantern ? 400 : 40)) for (const q of cells) kind[q] = 0;
    }
  }
  // dithered paint splits into many small patches: a real bulb is small and alone (density in a 9×9 window)
  if (!lantern) {
    const sat = new Int32Array((w + 1) * (h + 1));
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) sat[(y + 1) * (w + 1) + x + 1] = (kind[y * w + x] === 2 ? 1 : 0) + sat[y * (w + 1) + x + 1]! + sat[(y + 1) * (w + 1) + x]! - sat[y * (w + 1) + x]!;
    const box = (x0: number, y0: number, x1: number, y1: number) => sat[y1 * (w + 1) + x1]! - sat[y0 * (w + 1) + x1]! - sat[y1 * (w + 1) + x0]! + sat[y0 * (w + 1) + x0]!;
    const drop: number[] = [];
    for (let p = 0; p < w * h; p++) {
      if (kind[p] !== 2) continue;
      const x = p % w, y = (p / w) | 0;
      const x0 = Math.max(0, x - 4), y0 = Math.max(0, y - 4), x1 = Math.min(w, x + 5), y1 = Math.min(h, y + 5);
      if (box(x0, y0, x1, y1) / ((x1 - x0) * (y1 - y0)) > 0.3) drop.push(p);
    }
    for (const p of drop) kind[p] = 0;
  }
  // glass components → lit windows (seeded per part; about 6 in 10 lit)
  const comp = new Int32Array(w * h).fill(-1);
  let nComp = 0;
  const stack: number[] = [];
  for (let p = 0; p < w * h; p++) {
    if (kind[p] !== 1 || comp[p]! >= 0) continue;
    const cells: number[] = [];
    comp[p] = nComp;
    stack.push(p);
    let x0 = w, y0 = h, x1 = 0, y1 = 0;
    while (stack.length) {
      const q = stack.pop()!;
      cells.push(q);
      const qx = q % w, qy = (q / w) | 0;
      x0 = Math.min(x0, qx); x1 = Math.max(x1, qx); y0 = Math.min(y0, qy); y1 = Math.max(y1, qy);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = qx + dx, ny = qy + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const n = ny * w + nx;
        if (kind[n] === 1 && comp[n]! < 0) {
          comp[n] = nComp;
          stack.push(n);
        }
      }
    }
    const paneSized = cells.length <= 420 && x1 - x0 < 44 && y1 - y0 < 44; // shutters / painted walls are not panes
    const lit = cells.length >= 6 && paneSized && hash(nComp, x0 + y0 * 7, seed) < 0.62;
    for (const q of cells) {
      const i = q * 4;
      if (!lit) {
        gradeInto(out, i, 1.1);
        continue;
      }
      const qy = (q / w) | 0;
      const t = y1 > y0 ? (qy - y0) / (y1 - y0) : 0.5;
      const v = 0.7 + 0.3 * (lum(src[i]!, src[i + 1]!, src[i + 2]!) / 255);
      out[i] = Math.min(255, Math.round((255 - 10 * t) * v));
      out[i + 1] = Math.min(255, Math.round((206 - 40 * t) * v));
      out[i + 2] = Math.min(255, Math.round((112 - 40 * t) * v));
      kind[q] = 3;
    }
    if (lit) lights.push({ x: (x0 + x1 + 1) / 2, y: (y0 + y1 + 1) / 2, r: Math.min(14, 4 + Math.sqrt(cells.length) * 0.9), a: Math.min(0.5, 0.18 + cells.length / 400) });
    nComp++;
  }
  // everything else: moonlit grade; emissive pixels keep their colour (a touch warmer)
  const emissive: number[] = [];
  for (let p = 0; p < w * h; p++) {
    const i = p * 4;
    if (!src[i + 3]) continue;
    if (kind[p] === 2) {
      out[i] = Math.min(255, src[i]! + 12);
      out[i + 1] = Math.min(255, src[i + 1]! + 4);
      emissive.push(p);
    } else if (kind[p] === 0) gradeInto(out, i, 1);
  }
  // light points from emissive pixels on a 6 px grid
  const cellsE = new Map<number, number>();
  for (const p of emissive) {
    const k = Math.floor((p % w) / 6) + Math.floor(p / w / 6) * 1000;
    cellsE.set(k, (cellsE.get(k) ?? 0) + 1);
  }
  for (const [k, n] of cellsE) {
    if (n < 2) continue;
    lights.push({ x: (k % 1000) * 6 + 3, y: Math.floor(k / 1000) * 6 + 3, r: lantern ? 12 : 16, a: Math.min(0.55, 0.15 + n * 0.03) });
  }
  return { image: { width: w, height: h, data: out }, lights };
}

/** Warm halo layer for the whole map from every prop's lights. */
export function nightGlow(doc: SceneDoc, props: Array<{ x: number; y: number; w: number; h: number; flipX?: boolean; lights: LightPoint[] }>): RgbaImage {
  const { width, height } = mapSize(doc);
  const acc = new Float32Array(width * height);
  for (const p of props) {
    for (const l of p.lights) {
      const cx = p.x + (p.flipX ? p.w - l.x : l.x);
      const cy = p.y - p.h + l.y;
      const r = l.r;
      for (let y = Math.max(0, Math.floor(cy - r)); y < Math.min(height, Math.ceil(cy + r)); y++) {
        for (let x = Math.max(0, Math.floor(cx - r)); x < Math.min(width, Math.ceil(cx + r)); x++) {
          const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / r;
          if (d < 1) acc[y * width + x]! += l.a * (1 - d) * (1 - d);
        }
      }
    }
  }
  const out = createImage(width, height);
  for (let p = 0; p < acc.length; p++) {
    const a = Math.min(0.55, acc[p]!);
    if (a < 0.02) continue;
    // 2-level dither-free quantisation keeps the pixel look
    const q = Math.round(a * 20) / 20;
    out.data[p * 4] = 255;
    out.data[p * 4 + 1] = 196;
    out.data[p * 4 + 2] = 110;
    out.data[p * 4 + 3] = Math.round(q * 255);
  }
  return out;
}

export interface NightScene {
  doc: SceneDoc;
  assets: SceneAssets;
}

/**
 * The night scene: a doc with the glow prop appended and assets that hand out night images. Feed both to
 * renderScene / the exporters exactly like the day pair.
 */
/**
 * The night sky part loops every W px, so a wide level would show its moon several times. Return a 2W-wide
 * loop: the sky as is, then the sky with the moon (and its halo) painted over with moon-free sky.
 */
export function skyOneMoon(sky: RgbaImage): RgbaImage {
  const { width: w, height: h } = sky;
  // the moon = the densest patch of bright pixels in the upper sky (stars are single bright pixels)
  const bright: Array<[number, number]> = [];
  for (let y = 0, ymax = Math.floor(h * 0.55); y < ymax; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (sky.data[i]! > 230 && sky.data[i + 1]! > 225 && sky.data[i + 2]! > 190) bright.push([x, y]);
  }
  let best = -1, bx = 0, by = 0;
  for (const [x, y] of bright) {
    let n = 0;
    for (const [u, v] of bright) if (Math.abs(u - x) <= 12 && Math.abs(v - y) <= 12) n++;
    if (n > best) { best = n; bx = x; by = y; }
  }
  const out = createImage(w * 2, h);
  for (let y = 0; y < h; y++) {
    out.data.set(sky.data.subarray(y * w * 4, (y + 1) * w * 4), y * w * 2 * 4);
    out.data.set(sky.data.subarray(y * w * 4, (y + 1) * w * 4), (y * w * 2 + w) * 4);
  }
  if (best < 30) return out; // no moon: plain double loop
  const r = 34;
  const bx0 = bx - r, bx1 = bx + r, by0 = Math.max(0, by - r), by1 = Math.min(h - 1, by + r);
  const shift = bx1 - bx0 + 8;
  for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) {
    const sx = (((x - shift) % w) + w) % w, dx = (((x % w) + w) % w) + w;
    const si = (y * w + sx) * 4, di = (y * w * 2 + dx) * 4;
    for (let c = 0; c < 4; c++) out.data[di + c] = sky.data[si + c]!;
  }
  return out;
}

export function nightScene(dayDoc: SceneDoc, dayAssets: SceneAssets): NightScene {
  // recolored / tinted layers and props: bake the colour first (night must come after it), as synthetic parts
  const baked = new Map<string, { meta: PartMeta; image: RgbaImage | undefined }>();
  const bake = (part: string, c: { color?: string; tint?: string; tintAmount?: number }): string => {
    if (!c.color && !c.tint) return part;
    const id = `${part}__c_${[c.color ?? "", c.tint ?? "", c.tintAmount ?? ""].join("_")}`.replace(/[^a-zA-Z0-9_]+/g, "").toLowerCase();
    if (!baked.has(id)) {
      const meta = dayAssets.meta(part);
      const img = dayAssets.image(part);
      if (!meta) return part;
      baked.set(id, { meta: { ...meta, id, recolorBase: undefined } as PartMeta, image: img ? applyColor(img, { recolorBase: meta.recolorBase, color: c.color, tint: c.tint, tintAmount: c.tintAmount }) : undefined });
    }
    return id;
  };
  const strip = <T extends { part: string; color?: string; tint?: string; tintAmount?: number }>(x: T): T => {
    const part = bake(x.part, x);
    if (part === x.part) return x;
    const { color: _c, tint: _t, tintAmount: _a, ...rest } = x;
    return { ...rest, part } as T;
  };
  const doc: SceneDoc = { ...dayDoc, layers: dayDoc.layers.map(strip), props: dayDoc.props.map(strip) };
  const assets: SceneAssets = {
    meta: (id) => baked.get(id)?.meta ?? dayAssets.meta(id),
    image: (id) => (baked.has(id) ? baked.get(id)!.image : dayAssets.image(id)),
  };
  const cache = new Map<string, RgbaImage | undefined>();
  const propCache = new Map<string, NightProp>();
  const skyPart = assets.image(NIGHT_SKY_PART);
  const skyImg = skyPart ? skyOneMoon(skyPart) : undefined;
  const skyLayer = doc.layers.find((l) => (assets.meta(l.part) as BackgroundPart | undefined)?.band === "sky");
  const skySrc = skyLayer ? assets.image(skyLayer.part) : undefined;
  const skySwap = skyLayer && skyImg && skySrc && skyPart!.width === skySrc.width ? skyLayer.part : undefined;
  const prop = (id: string): NightProp | undefined => {
    if (propCache.has(id)) return propCache.get(id);
    const img = assets.image(id);
    if (!img) return undefined;
    const np = nightProp(img, id, assets.meta(id));
    propCache.set(id, np);
    return np;
  };
  const { width: mw, height: mh } = mapSize(doc);
  const glowProps = doc.props.flatMap((p) => {
    const np = prop(p.part);
    return np ? [{ x: p.x, y: p.y, w: np.image.width, h: np.image.height, flipX: p.flipX, lights: np.lights }] : [];
  });
  const glow = nightGlow(doc, glowProps);
  const glowMeta: PropPart = { id: NIGHT_GLOW_PART, kind: "prop", name: "Night glow", image: "glow.png", width: mw, height: mh, defaultLayer: "front", category: "decor" };
  const night: SceneAssets = {
    meta(id) {
      if (id === NIGHT_GLOW_PART) return glowMeta;
      if (id === skySwap) return { ...(assets.meta(id) as BackgroundPart), width: skyImg!.width, loopWidth: skyImg!.width };
      return assets.meta(id);
    },
    image(id) {
      if (id === NIGHT_GLOW_PART) return glow;
      if (cache.has(id)) return cache.get(id);
      const meta = assets.meta(id);
      let img: RgbaImage | undefined;
      if (meta?.kind === "background") {
        const bg = meta as BackgroundPart;
        const src = assets.image(id);
        if (id === skySwap) img = skyImg;
        else if (src) img = nightGrade(src, bg.band === "far" ? 1.15 : bg.band === "mid" ? 1.05 : 1);
      } else if (meta?.kind === "prop") img = prop(id)?.image;
      else {
        const src = assets.image(id);
        img = src ? nightGrade(src, 1) : undefined;
      }
      cache.set(id, img);
      return img;
    },
  };
  const nightDoc: SceneDoc = { ...doc, props: [...doc.props, { part: NIGHT_GLOW_PART, x: 0, y: mh, layer: "front" }] };
  return { doc: nightDoc, assets: night };
}

/** Tint a character sheet for night. */
export function nightSheet(sheet: RgbaImage): RgbaImage {
  const out = { width: sheet.width, height: sheet.height, data: new Uint8Array(sheet.data) };
  for (let i = 0; i < out.data.length; i += 4) {
    if (!out.data[i + 3]) continue;
    for (let c = 0; c < 3; c++) out.data[i + c] = Math.round(out.data[i + c]! * NIGHT_CHARACTER_TINT[c]!);
  }
  return out;
}

export function nightSprite(ch: CharacterSprite): CharacterSprite {
  return { ...ch, sheet: nightSheet(ch.sheet) };
}
