/**
 * Backward compatibility: the demo scenes load and export (png, godot, pixi) byte for byte as before the
 * overworld town work (fingerprints in fixtures/compat-master.json, written by scripts/compat-golden.mts
 * from master). Town-only data (exits, town, <id>.scene.json) is only written for scenes that have it.
 * The full old-vs-new comparison over studio projects is scripts/compat-check.py.
 */
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { exportScene } from "../src/lib/export.js";
import { loadScene } from "../src/lib/workspace.js";
import { tempWorkspace } from "./helpers.js";

const golden: Record<string, Record<string, string>> = JSON.parse(await readFile(new URL("./fixtures/compat-master.json", import.meta.url), "utf8"));
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
let root: string;
let cleanup: () => Promise<void>;
beforeAll(async () => ({ root, cleanup } = await tempWorkspace()));
afterAll(() => cleanup?.());

describe("backward compatibility with scenes from before the overworld work", () => {
  it.each(Object.keys(golden))("%s loads and exports exactly as before", async (id) => {
    const doc = await loadScene(root, id);
    const files: Record<string, string> = { "scene.normalized": sha(Buffer.from(JSON.stringify(doc))) };
    for (const preset of ["png", "godot", "pixi"] as const) {
      const res = await exportScene(root, { sceneId: id, preset, dir: path.join(root, "compat") });
      for (const e of await readdir(res.dir, { recursive: true, withFileTypes: true })) {
        if (!e.isFile()) continue;
        const f = path.join(e.parentPath, e.name);
        files[`${preset}/${path.relative(res.dir, f).split(path.sep).join("/")}`] = sha(await readFile(f));
      }
    }
    expect(files).toEqual(golden[id]);
  }, 120_000);

  it("night: false (and the night code path existing at all) leaves every export exactly as before", async () => {
    const id = "lantern_night";
    const files: Record<string, string> = { "scene.normalized": sha(Buffer.from(JSON.stringify(await loadScene(root, id)))) };
    for (const preset of ["png", "godot", "pixi"] as const) {
      const res = await exportScene(root, { sceneId: id, preset, dir: path.join(root, "compat-night-off"), night: false });
      for (const e of await readdir(res.dir, { recursive: true, withFileTypes: true })) {
        if (!e.isFile()) continue;
        const f = path.join(e.parentPath, e.name);
        files[`${preset}/${path.relative(res.dir, f).split(path.sep).join("/")}`] = sha(await readFile(f));
      }
    }
    expect(files).toEqual(golden[id]);
  }, 120_000);
});
