/**
 * Pure helpers for placing, hitting and dragging Easy Sprite characters in the web editor.
 * Shared by the editor UI and unit tests; no DOM.
 */
import { DEFAULT_CHARACTER_X, sceneCharacters } from "./characters.js";
import { characterTop, DEFAULT_GROUND_ROW } from "./render.js";
import type { SceneCharacter, SceneDoc } from "./types.js";

export const CHARACTER_FRAME = 48;

export type EditorSelection = { kind: "prop"; index: number } | { kind: "character"; index: number };

export function characterList(doc: Pick<SceneDoc, "character" | "characters">): SceneCharacter[] {
  return sceneCharacters(doc);
}

/** World-pixel box of the 48×48 frame (top-left origin, feet on the surface or on `ch.y`). */
export function characterRect(
  doc: SceneDoc,
  ch: SceneCharacter,
  groundRow = ch.groundRow ?? DEFAULT_GROUND_ROW,
): { x: number; y: number; w: number; h: number } {
  const x = ch.x ?? DEFAULT_CHARACTER_X;
  const y = characterTop(doc, { x, y: ch.y, groundRow, frameSize: CHARACTER_FRAME });
  return { x, y, w: CHARACTER_FRAME, h: CHARACTER_FRAME };
}

/** Front-most character under the cursor (front layer, then main, then back; later entries on top). */
export function hitCharacter(
  doc: SceneDoc,
  list: readonly SceneCharacter[],
  px: number,
  py: number,
  groundRows?: readonly number[],
): number | null {
  const rank = (layer: SceneCharacter["layer"]) => (layer === "front" ? 0 : layer === "back" ? 2 : 1);
  const order = list.map((_, i) => i).sort((a, b) => {
    const d = rank(list[a]!.layer) - rank(list[b]!.layer);
    return d !== 0 ? d : b - a;
  });
  for (const i of order) {
    const r = characterRect(doc, list[i]!, groundRows?.[i] ?? list[i]!.groundRow ?? DEFAULT_GROUND_ROW);
    if (px >= r.x && px < r.x + r.w && py >= r.y && py < r.y + r.h) return i;
  }
  return null;
}

/**
 * Apply a drag. `dx`/`dy` are the grab offsets from the character's `x` and baseline
 * (`ch.y` or the ground under the feet). Horizontal always updates `x`.
 * With `free` (Shift), the baseline is stored as `y`; otherwise `y` is cleared so the
 * feet stay on the terrain (groundRow is unchanged — edit it in the inspector).
 */
export function dragCharacter(
  ch: SceneCharacter,
  worldX: number,
  worldY: number,
  grab: { dx: number; dy: number },
  opts: { free: boolean },
): SceneCharacter {
  const x = Math.round(worldX - grab.dx);
  if (opts.free) return { ...ch, x, y: Math.round(worldY - grab.dy) };
  const next: SceneCharacter = { ...ch, x };
  delete next.y;
  return next;
}

/** Baseline used when starting a drag (explicit `y`, else the ground under the frame centre). */
export function characterBaseline(doc: SceneDoc, ch: SceneCharacter, groundRow = ch.groundRow ?? DEFAULT_GROUND_ROW): number {
  return characterTop(doc, { x: ch.x ?? DEFAULT_CHARACTER_X, y: ch.y, groundRow, frameSize: CHARACTER_FRAME }) + groundRow + 1;
}

export function patchCharacter(list: readonly SceneCharacter[], index: number, patch: Partial<SceneCharacter>): SceneCharacter[] {
  return list.map((c, i) => {
    if (i !== index) return c;
    const next = { ...c, ...patch };
    if ("y" in patch && patch.y === undefined) delete next.y;
    if ("patrol" in patch && patch.patrol === undefined) delete next.patrol;
    if ("name" in patch && !patch.name) delete next.name;
    return next;
  });
}

export function removeCharacter(list: readonly SceneCharacter[], index: number): SceneCharacter[] {
  return list.filter((_, i) => i !== index);
}

/** Write the working list back onto a scene, dropping the legacy `character` field once edited. */
export function withCharacters(doc: SceneDoc, characters: SceneCharacter[]): SceneDoc {
  const next: SceneDoc = { ...doc };
  delete next.character;
  if (characters.length) next.characters = characters;
  else delete next.characters;
  return next;
}
