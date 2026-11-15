/**
 * Write test/fixtures/compat-master.json: sha256 of every file the demo scenes export (png, godot, pixi),
 * made by an OLDER checkout. Run from that checkout (APIs that existed before the overworld work only):
 *   git archive master | tar -x -C /tmp/es-old && cd /tmp/es-old && npm i
 *   npx tsx /path/to/easyscene/scripts/compat-golden.mts /path/to/easyscene/test/fixtures/compat-master.json
 * test/compat.test.ts re-exports them with this checkout and expects identical bytes.
 */
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const imp = (p: string) => import(path.join(process.cwd(), p));
const { initWorkspace, loadScene } = await imp("src/lib/workspace.ts");
const { exportScene } = await imp("src/lib/export.ts");
const root = await mkdtemp(path.join(os.tmpdir(), "es-golden-"));
await initWorkspace(root);
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const ids = (await readdir(path.join(root, "scenes"))).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)).sort();
const out: Record<string, Record<string, string>> = {};
for (const id of ids) {
  const doc = await loadScene(root, id);
  const files: Record<string, string> = { "scene.normalized": sha(Buffer.from(JSON.stringify(doc))) };
  for (const preset of ["png", "godot", "pixi"]) {
    const res = await exportScene(root, { sceneId: id, preset, dir: path.join(root, "golden") });
    for (const e of await readdir(res.dir, { recursive: true, withFileTypes: true })) {
      if (!e.isFile()) continue;
      const f = path.join(e.parentPath, e.name);
      files[`${preset}/${path.relative(res.dir, f)}`] = sha(await readFile(f));
    }
  }
  out[id] = files;
}
await writeFile(process.argv[2]!, `${JSON.stringify(out, null, 1)}\n`);
console.log(`wrote ${process.argv[2]} · ${ids.length} scenes`);
