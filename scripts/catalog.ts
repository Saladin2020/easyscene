/**
 * Labeled contact sheet of part PNGs (used by render-docs and render-catalog).
 * Labels use a built-in 3×5 pixel font (a–z 0–9 _ - . space), so no font files are needed.
 */
import { readPng } from "../src/lib/png.js";
import { partImagePath } from "../src/lib/workspace.js";
import { createImage, type RgbaImage } from "../src/shared/raster.js";
import type { PartMeta } from "../src/shared/types.js";

// 3×5 glyphs, rows top→bottom concatenated, "#" = ink
const GLYPHS: Record<string, string> = {
  "a": ".#.#.#####.##.#",
  "b": "##.#.###.#.###.",
  "c": ".###..#..#...##",
  "d": "##.#.##.##.###.",
  "e": "####..##.#..###",
  "f": "####..##.#..#..",
  "g": ".###..#.##.#.##",
  "h": "#.##.#####.##.#",
  "i": "###.#..#..#.###",
  "j": "..#..#..##.#.#.",
  "k": "#.##.###.#.##.#",
  "l": "#..#..#..#..###",
  "m": "#.########.##.#",
  "n": "##.#.##.##.##.#",
  "o": ".#.#.##.##.#.#.",
  "p": "##.#.###.#..#..",
  "q": ".#.#.##.###..##",
  "r": "##.#.###.#.##.#",
  "s": ".###...#...###.",
  "t": "###.#..#..#..#.",
  "u": "#.##.##.##.####",
  "v": "#.##.##.##.#.#.",
  "w": "#.##.########.#",
  "x": "#.##.#.#.#.##.#",
  "y": "#.##.#.#..#..#.",
  "z": "###..#.#.#..###",
  "0": "####.##.##.####",
  "1": ".#.##..#..#.###",
  "2": "##...#.#.#..###",
  "3": "##...#.#...###.",
  "4": "#.##.####..#..#",
  "5": "####..##...###.",
  "6": ".###..####.####",
  "7": "###..#.#..#..#.",
  "8": "####.#####.####",
  "9": "####.####..###.",
  "_": "............###",
  "-": "......###......",
  ".": ".............#.",
  " ": "...............",
};

function fill(img: RgbaImage, x0: number, y0: number, w: number, h: number, c: [number, number, number, number]) {
  for (let y = Math.max(0, y0); y < Math.min(img.height, y0 + h); y++)
    for (let x = Math.max(0, x0); x < Math.min(img.width, x0 + w); x++) img.data.set(c, (y * img.width + x) * 4);
}

export function drawLabel(img: RgbaImage, text: string, x0: number, y0: number, color: [number, number, number, number] = [247, 235, 211, 255]) {
  let x = x0;
  for (const ch of text.toLowerCase()) {
    const g = GLYPHS[ch] ?? GLYPHS["."]!;
    for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) if (g[r * 3 + c] === "#") fill(img, x + c, y0 + r, 1, 1, color);
    x += 4;
  }
  return x - x0;
}

function blit(dst: RgbaImage, src: RgbaImage, dx: number, dy: number) {
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const si = (y * src.width + x) * 4;
      const a = src.data[si + 3]! / 255;
      if (!a) continue;
      const tx = dx + x, ty = dy + y;
      if (tx < 0 || ty < 0 || tx >= dst.width || ty >= dst.height) continue;
      const di = (ty * dst.width + tx) * 4;
      for (let k = 0; k < 3; k++) dst.data[di + k] = Math.round(src.data[si + k]! * a + dst.data[di + k]! * (1 - a));
      dst.data[di + 3] = 255;
    }
  }
}

/** Sheet of parts on a checker-free warm backdrop with a baseline under each and its id below. */
export async function renderCatalog(root: string, parts: PartMeta[], opts: { maxWidth?: number; title?: string } = {}): Promise<RgbaImage> {
  const maxW = opts.maxWidth ?? 960;
  const pad = 10;
  const items = await Promise.all(parts.map(async (p) => ({ p, img: await readPng(partImagePath(root, p)) })));
  // shelf packing, bottoms aligned per row (like a street)
  type Cell = { p: PartMeta; img: RgbaImage; x: number; w: number };
  const rows: { cells: Cell[]; h: number }[] = [];
  let row: { cells: Cell[]; h: number } = { cells: [], h: 0 };
  let x = pad;
  for (const { p, img } of items) {
    const w = Math.max(img.width, p.id.length * 4 - 1);
    if (x + w > maxW - pad && row.cells.length) {
      rows.push(row);
      row = { cells: [], h: 0 };
      x = pad;
    }
    row.cells.push({ p, img, x, w });
    row.h = Math.max(row.h, img.height);
    x += w + pad;
  }
  if (row.cells.length) rows.push(row);
  const titleH = opts.title ? 14 : 0;
  const rowH = (r: { h: number }) => r.h + 4 + 5 + 4 + 5 + pad; // art, baseline gap, id, dims
  const height = pad + titleH + rows.reduce((s, r) => s + rowH(r), 0);
  const out = createImage(maxW, height);
  fill(out, 0, 0, maxW, height, [52, 40, 30, 255]);
  if (opts.title) drawLabel(out, opts.title, pad, pad, [244, 174, 61, 255]);
  let y = pad + titleH;
  for (const r of rows) {
    const base = y + r.h;
    for (const c of r.cells) {
      fill(out, c.x - 2, y - 2, c.w + 4, r.h + 3, [66, 52, 40, 255]);
      blit(out, c.img, c.x, base - c.img.height);
      fill(out, c.x - 2, base + 1, c.w + 4, 1, [151, 128, 95, 255]);
      drawLabel(out, c.p.id, c.x, base + 4);
      drawLabel(out, `${c.p.width}x${c.p.height}`, c.x, base + 13, [151, 128, 95, 255]);
    }
    y += rowH(r);
  }
  return out;
}

export function upscale(img: RgbaImage, k: number): RgbaImage {
  const out = createImage(img.width * k, img.height * k);
  for (let y = 0; y < out.height; y++)
    for (let x = 0; x < out.width; x++) {
      const si = (Math.floor(y / k) * img.width + Math.floor(x / k)) * 4;
      out.data.set(img.data.subarray(si, si + 4), (y * out.width + x) * 4);
    }
  return out;
}
