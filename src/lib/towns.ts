import { composeAndSave } from "./compose.js";
import { exportScene, type ExportResult } from "./export.js";
import { loadParts } from "./workspace.js";
import { townInput, type TownSceneSpec } from "../shared/townGen.js";
import type { ExportPresetId } from "../shared/types.js";

export interface ComposedTown {
  scene: string;
  kind: string;
  path: string;
  width: number;
  warnings: string[];
  exports: ExportResult[];
}

/** Compose (and optionally export) one side-view street per town spec. Used by the CLI and the MCP server. */
export async function composeTowns(
  root: string,
  specs: TownSceneSpec[],
  opts: { scenesDir?: string; export?: string; out?: string; godotParallax?: string; trustedPaths?: boolean; night?: boolean },
): Promise<ComposedTown[]> {
  const parts = await loadParts(root);
  const done: ComposedTown[] = [];
  for (const spec of specs) {
    const res = await composeAndSave(root, townInput(parts, spec), opts.scenesDir);
    const exports: ExportResult[] = [];
    if (opts.export) {
      const presets = (opts.export === "all" ? ["png", "godot", "pixi"] : String(opts.export).split(",")) as ExportPresetId[];
      for (const preset of presets) {
        exports.push(await exportScene(root, { scene: res.scene, preset, dir: opts.out, trustedCharacter: opts.trustedPaths ?? true, godot: { parallax: opts.godotParallax as "parallax2d" | "legacy" | undefined }, ...(opts.night ? { night: true } : {}) }));
      }
    }
    done.push({ scene: res.scene.id, kind: spec.kind, path: res.path, width: res.scene.width, warnings: res.warnings, exports });
  }
  return done;
}
