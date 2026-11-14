/**
 * Easy Sprite characters inside a scene. Pure helpers shared by the renderer, the exporters,
 * the CLI and the web editor: sheet layout, frame lookup, sole-row detection, arg parsing.
 */
import type { RgbaImage } from "./raster.js";
import {
  CHARACTER_ANIMS,
  CHARACTER_FACINGS,
  DEFAULT_CONFIG,
  type CharacterAnim,
  type CharacterFacing,
  type CharacterLayer,
  type SceneCharacter,
  type SceneDoc,
} from "./types.js";

/** Easy Sprite's locked 30-frame grid (column order of every native sheet). */
export const EASYSPRITE_FRAMES = [
  "idle", "walk0", "walk1", "walk2", "run0", "run1", "run2", "run3", "jump0", "jump1",
  "wave0", "wave1", "carry0", "carry1", "farm0", "farm1", "cheer0", "cheer1", "attack0", "attack1",
  "hurt0", "hurt1", "fall0", "fall1", "sleep0", "sleep1", "tired0", "tired1", "sit", "crouch",
] as const;

export const DEFAULT_CHARACTER_X = 96;

/** Layout of one sheet: from the Easy Sprite export JSON when available, else side-view defaults. */
export interface SheetLayout {
  frameSize: number;
  frames: string[];
  directions: string[];
  view?: string;
}

export function defaultLayout(img?: { width: number; height: number }): SheetLayout {
  const fs = DEFAULT_CONFIG.character.frameSize;
  const rows = img ? Math.max(1, Math.floor(img.height / fs)) : 3;
  const dirs = rows >= 4 ? ["front", "right", "back", "left"] : [...DEFAULT_CONFIG.character.rows].slice(0, rows);
  return { frameSize: fs, frames: [...EASYSPRITE_FRAMES], directions: dirs, view: rows >= 4 ? "topdown" : "side" };
}

/** Read an `easysprite.native` export JSON (or anything with frames/directions). Returns undefined when unusable. */
export function layoutFromMeta(meta: unknown): SheetLayout | undefined {
  if (!meta || typeof meta !== "object") return undefined;
  const m = meta as Record<string, unknown>;
  const frames = Array.isArray(m.frames) && m.frames.every((f) => typeof f === "string") ? (m.frames as string[]) : undefined;
  const directions = Array.isArray(m.directions) && m.directions.every((f) => typeof f === "string") ? (m.directions as string[]) : undefined;
  if (!frames?.length || !directions?.length) return undefined;
  const frameSize = typeof m.frameSize === "number" && m.frameSize > 0 ? m.frameSize : DEFAULT_CONFIG.character.frameSize;
  return { frameSize, frames, directions, ...(typeof m.view === "string" ? { view: m.view } : {}) };
}

/**
 * Lowest opaque row of one frame: where the soles are. Easy Sprite side sheets stand on row 47
 * (feet outline), top-down on row 45. Undefined for an empty frame.
 */
export function detectGroundRow(img: RgbaImage, frameSize = 48, col = 0, row = 0): number | undefined {
  const x0 = col * frameSize;
  const y0 = row * frameSize;
  if (x0 + frameSize > img.width || y0 + frameSize > img.height) return undefined;
  for (let y = frameSize - 1; y >= 0; y--) {
    for (let x = 0; x < frameSize; x++) {
      if (img.data[((y0 + y) * img.width + x0 + x) * 4 + 3]! > 0) return y;
    }
  }
  return undefined;
}

export function frameColumn(layout: SheetLayout, frame: string | number | undefined, fallback = 0): number {
  if (typeof frame === "number" && Number.isInteger(frame) && frame >= 0) return frame;
  if (typeof frame === "string") {
    if (/^\d+$/.test(frame)) return Number(frame);
    const i = layout.frames.indexOf(frame);
    if (i >= 0) return i;
  }
  return fallback;
}

/** Walk cycle columns (walk0 walk1 walk2 walk1), falling back to the config's walkFrames. */
export function walkColumns(layout: SheetLayout): number[] {
  const idx = ["walk0", "walk1", "walk2", "walk1"].map((f) => layout.frames.indexOf(f));
  return idx.every((i) => i >= 0) ? idx : [...DEFAULT_CONFIG.character.walkFrames];
}

/** Row for a facing; `left` missing from the sheet is drawn as the mirrored `right` row. */
export function facingRow(layout: SheetLayout, facing: CharacterFacing): { row: number; flipX: boolean } {
  const i = layout.directions.indexOf(facing);
  if (i >= 0) return { row: i, flipX: false };
  if (facing === "left") {
    const r = layout.directions.indexOf("right");
    if (r >= 0) return { row: r, flipX: true };
  }
  return { row: 0, flipX: false };
}

/** Column drawn in a still image: explicit frame, else idle (or walk0 when walking). */
export function stillColumn(layout: SheetLayout, ch: Pick<SceneCharacter, "frame" | "anim">): number {
  if (ch.frame !== undefined) return frameColumn(layout, ch.frame, 0);
  return ch.anim === "walk" ? frameColumn(layout, "walk0", 1) : frameColumn(layout, "idle", 0);
}

/** Every character in a scene: the legacy `character` first, then `characters`. */
export function sceneCharacters(doc: Pick<SceneDoc, "character" | "characters">): SceneCharacter[] {
  const out: SceneCharacter[] = [];
  if (doc.character?.sheet) out.push({ sheet: doc.character.sheet, ...(typeof doc.character.x === "number" ? { x: doc.character.x } : {}) });
  for (const c of doc.characters ?? []) if (c?.sheet) out.push(c);
  return out;
}

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Validate a character list from JSON / MCP / CLI. Drops bad entries with warnings, keeps only known fields. */
export function normalizeCharacters(list: readonly unknown[] | undefined): { characters: SceneCharacter[]; warnings: string[] } {
  const characters: SceneCharacter[] = [];
  const warnings: string[] = [];
  (list ?? []).forEach((raw, i) => {
    const c = raw as Partial<SceneCharacter> | null;
    if (!c || typeof c.sheet !== "string" || !c.sheet.trim()) {
      warnings.push(`Character ${i} has no sheet path — skipped`);
      return;
    }
    const out: SceneCharacter = { sheet: c.sheet.trim() };
    if (typeof c.name === "string" && c.name.trim()) out.name = c.name.trim();
    if (finite(c.x)) out.x = Math.round(c.x);
    if (finite(c.y)) out.y = Math.round(c.y);
    if (c.facing !== undefined) {
      if ((CHARACTER_FACINGS as readonly string[]).includes(c.facing)) out.facing = c.facing;
      else warnings.push(`Character ${i}: unknown facing "${String(c.facing)}" (right | left | front)`);
    }
    if (c.anim !== undefined) {
      if ((CHARACTER_ANIMS as readonly string[]).includes(c.anim)) out.anim = c.anim;
      else warnings.push(`Character ${i}: unknown anim "${String(c.anim)}" (idle | walk)`);
    }
    if ((typeof c.frame === "string" && c.frame.trim()) || (finite(c.frame) && c.frame >= 0)) out.frame = typeof c.frame === "string" ? c.frame.trim() : Math.round(c.frame as number);
    if (finite(c.groundRow) && c.groundRow >= 0) out.groundRow = Math.round(c.groundRow);
    if (c.layer !== undefined) {
      if (c.layer === "back" || c.layer === "main" || c.layer === "front") out.layer = c.layer as CharacterLayer;
      else warnings.push(`Character ${i}: unknown layer "${String(c.layer)}" (back | main | front)`);
    }
    if (c.patrol && finite(c.patrol.minX) && finite(c.patrol.maxX)) {
      const [a, b] = [Math.round(c.patrol.minX), Math.round(c.patrol.maxX)];
      out.patrol = { minX: Math.min(a, b), maxX: Math.max(a, b), ...(finite(c.patrol.speed) && c.patrol.speed >= 0 ? { speed: c.patrol.speed } : {}) };
    }
    characters.push(out);
  });
  return { characters, warnings };
}

/**
 * Parse the CLI form `path[:x[:facing[:anim[:frame]]]]`. Empty fields keep defaults (`hero.png::left`).
 * A Windows drive letter (`C:\\…`) stays part of the path.
 */
export function parseCharacterArg(arg: string): SceneCharacter {
  let parts = arg.split(":");
  if (parts.length > 1 && /^[a-zA-Z]$/.test(parts[0]!) && /^[\\/]/.test(parts[1] ?? "")) {
    parts = [`${parts[0]}:${parts[1]}`, ...parts.slice(2)];
  }
  const [sheet = "", x, facing, anim, frame] = parts;
  if (!sheet) throw new Error(`--character needs a sheet path: ${arg}`);
  const out: SceneCharacter = { sheet };
  if (x) {
    if (!/^-?\d+(\.\d+)?$/.test(x)) throw new Error(`--character x must be a number: ${arg}`);
    out.x = Math.round(Number(x));
  }
  if (facing) {
    if (!(CHARACTER_FACINGS as readonly string[]).includes(facing)) throw new Error(`--character facing must be right|left|front: ${arg}`);
    out.facing = facing as CharacterFacing;
  }
  if (anim) {
    if (!(CHARACTER_ANIMS as readonly string[]).includes(anim)) throw new Error(`--character anim must be idle|walk: ${arg}`);
    out.anim = anim as CharacterAnim;
  }
  if (frame) out.frame = /^\d+$/.test(frame) ? Number(frame) : frame;
  return out;
}

/** File-name-safe label for a character (name, else the sheet's stem). */
export function characterLabel(ch: Pick<SceneCharacter, "name" | "sheet">, index: number): string {
  const raw = ch.name ?? ch.sheet.split(/[\\/]/).pop()!.replace(/\.png$/i, "");
  return raw.replace(/[^a-zA-Z0-9_]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase() || `character_${index}`;
}
