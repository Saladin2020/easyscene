import { readFileSync } from "node:fs";
import { access, mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { DEFAULT_CONFIG, type EasySceneConfig, type PartMeta, type SceneDoc, type SceneSummary, type WorkspaceSummary } from "../shared/types.js";
import { demoScenes } from "./demoScenes.js";
import { partDir, writeSampleParts } from "./sampleParts.js";

const CONFIG_NAME = "easyscene.config.json";
/** Folders the user picked; writes outside the workspace must be under one. */
const ALLOWED_DIRS_NAME = "easyscene.allowed-dirs.json";
const SAFE_ID = /^[a-z0-9_-]+$/;

/** Scene ids become file names, so only allow `a-z 0-9 _ -`. */
export function assertSafeId(id: unknown, label = "scene id"): string {
  if (typeof id !== "string" || !SAFE_ID.test(id)) {
    throw new Error(`Invalid ${label} ${JSON.stringify(id)} (use a-z, 0-9, _ or -)`);
  }
  return id;
}

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

export function resolveWorkspace(cwd = process.cwd()): string {
  return path.resolve(cwd);
}

export async function initWorkspace(cwd = process.cwd(), options?: { forceSamples?: boolean }): Promise<string> {
  const root = resolveWorkspace(cwd);
  const partsDir = path.join(root, "parts");
  const scenesDir = path.join(root, "scenes");
  await mkdir(partsDir, { recursive: true });
  await mkdir(scenesDir, { recursive: true });
  await mkdir(path.join(root, "exports"), { recursive: true });

  const configPath = path.join(root, CONFIG_NAME);
  if (!(await exists(configPath)) || options?.forceSamples) {
    await writeFile(configPath, `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`);
  }
  const hasParts = (await readdir(partsDir)).some((f) => !f.startsWith("CREDITS"));
  if (!hasParts || options?.forceSamples) await writeSampleParts(root);
  else await writeSampleParts(root, { onlyMissing: true }); // new sample parts after an upgrade; existing folders untouched

  const hasScenes = (await readdir(scenesDir)).some((f) => f.endsWith(".json"));
  if (!hasScenes || options?.forceSamples) {
    for (const demo of demoScenes()) {
      await writeFile(path.join(scenesDir, `${demo.id}.json`), `${JSON.stringify(demo, null, 2)}\n`);
    }
  }
  return root;
}

export async function loadConfig(root: string): Promise<EasySceneConfig> {
  const configPath = path.join(root, CONFIG_NAME);
  if (!(await exists(configPath))) return DEFAULT_CONFIG;
  const parsed = JSON.parse(await readFile(configPath, "utf8")) as Partial<EasySceneConfig>;
  return {
    ...DEFAULT_CONFIG,
    ...parsed,
    viewport: { ...DEFAULT_CONFIG.viewport, ...parsed.viewport },
    character: { ...DEFAULT_CONFIG.character, ...parsed.character },
  };
}

export async function loadParts(root: string): Promise<PartMeta[]> {
  const partsRoot = path.join(root, "parts");
  if (!(await exists(partsRoot))) return [];
  const parts: PartMeta[] = [];
  for (const kindDir of await readdir(partsRoot, { withFileTypes: true })) {
    if (!kindDir.isDirectory()) continue;
    const kindPath = path.join(partsRoot, kindDir.name);
    for (const partDirent of await readdir(kindPath, { withFileTypes: true })) {
      if (!partDirent.isDirectory()) continue;
      const metaPath = path.join(kindPath, partDirent.name, "part.json");
      if (!(await exists(metaPath))) continue;
      try {
        parts.push(JSON.parse(await readFile(metaPath, "utf8")) as PartMeta);
      } catch {
        // skip corrupt part.json
      }
    }
  }
  const order = { background: 0, tileset: 1, prop: 2 } as const;
  return parts.sort((a, b) => order[a.kind] - order[b.kind] || a.id.localeCompare(b.id));
}

export function partImagePath(root: string, part: PartMeta): string {
  return path.join(partDir(root, part), part.image);
}

/** Resolve a folder without access checks (absolute stays absolute; relative is under the workspace). */
export function resolvePath(root: string, dir: string | undefined, fallbackRel: string): string {
  const raw = (dir ?? "").trim() || fallbackRel;
  return path.isAbsolute(raw) ? path.normalize(raw) : path.resolve(root, raw);
}

function isInside(base: string, target: string): boolean {
  const norm = (p: string) => (process.platform === "win32" ? path.resolve(p).toLowerCase() : path.resolve(p));
  const rel = path.relative(norm(base), norm(target));
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/** Workspace + picked folders + `EASYSCENE_ALLOWED_DIRS` (path-delimiter separated). */
export function allowedRoots(root: string): string[] {
  const roots = [path.resolve(root)];
  try {
    const saved = JSON.parse(readFileSync(path.join(root, ALLOWED_DIRS_NAME), "utf8")) as unknown;
    if (Array.isArray(saved)) roots.push(...saved.filter((d): d is string => typeof d === "string"));
  } catch {
    // none yet
  }
  const env = process.env.EASYSCENE_ALLOWED_DIRS;
  if (env) roots.push(...env.split(path.delimiter).filter(Boolean));
  return roots;
}

export function isAllowedPath(root: string, target: string): boolean {
  return allowedRoots(root).some((r) => isInside(r, path.resolve(target)));
}

/** Remember a folder the user explicitly picked so later saves/exports may use it. */
export async function allowDir(root: string, dir: string): Promise<void> {
  const resolved = path.resolve(dir);
  if (isAllowedPath(root, resolved)) return;
  const file = path.join(root, ALLOWED_DIRS_NAME);
  let saved: string[] = [];
  try {
    saved = JSON.parse(await readFile(file, "utf8")) as string[];
  } catch {
    saved = [];
  }
  await writeFile(file, `${JSON.stringify([...saved, resolved], null, 2)}\n`);
}

/** Resolve a folder for reading/writing scenes or exports; must be inside an allowed root. */
export function resolveOutDir(root: string, dir: string | undefined, fallbackRel: string): string {
  const resolved = resolvePath(root, dir, fallbackRel);
  if (!isAllowedPath(root, resolved)) {
    throw new Error(
      `Folder not allowed: ${resolved}. Use the workspace, pick it in the UI, or add it to EASYSCENE_ALLOWED_DIRS.`,
    );
  }
  return resolved;
}

export function summarizeScene(doc: SceneDoc): SceneSummary {
  return {
    id: doc.id,
    name: doc.name,
    width: doc.width,
    height: doc.height,
    layers: doc.layers.length,
    props: doc.props.length,
    updatedAt: doc.updatedAt,
  };
}

export async function loadScenes(root: string, dir?: string): Promise<SceneDoc[]> {
  const scenesDir = resolveOutDir(root, dir, "scenes");
  if (!(await exists(scenesDir))) return [];
  const out: SceneDoc[] = [];
  for (const file of (await readdir(scenesDir)).filter((f) => f.endsWith(".json"))) {
    try {
      const doc = JSON.parse(await readFile(path.join(scenesDir, file), "utf8")) as SceneDoc;
      if (doc?.format === "easyscene/1" && doc.id) out.push(doc);
    } catch {
      // skip corrupt JSON
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, "th"));
}

export async function loadScene(root: string, id: string, dir?: string): Promise<SceneDoc> {
  assertSafeId(id);
  const file = path.join(resolveOutDir(root, dir, "scenes"), `${id}.json`);
  if (!(await exists(file))) throw new Error(`Scene not found: ${id}`);
  return JSON.parse(await readFile(file, "utf8")) as SceneDoc;
}

export async function saveScene(root: string, doc: SceneDoc, dir?: string): Promise<{ scene: SceneDoc; path: string }> {
  assertSafeId(doc.id);
  const scenesDir = resolveOutDir(root, dir, "scenes");
  await mkdir(scenesDir, { recursive: true });
  const now = new Date().toISOString();
  const next: SceneDoc = { ...doc, createdAt: doc.createdAt ?? now, updatedAt: now };
  const outPath = path.join(scenesDir, `${doc.id}.json`);
  await writeFile(outPath, `${JSON.stringify(next, null, 2)}\n`);
  return { scene: next, path: outPath };
}

export async function deleteScene(root: string, id: string, dir?: string): Promise<boolean> {
  assertSafeId(id);
  try {
    await unlink(path.join(resolveOutDir(root, dir, "scenes"), `${id}.json`));
    return true;
  } catch {
    return false;
  }
}

export async function getWorkspaceSummary(root: string): Promise<WorkspaceSummary> {
  const [config, parts, scenes] = await Promise.all([loadConfig(root), loadParts(root), loadScenes(root)]);
  return {
    root,
    config,
    parts,
    scenes: scenes.map(summarizeScene),
    scenesDir: path.join(root, "scenes"),
    exportsDir: path.join(root, "exports"),
  };
}
