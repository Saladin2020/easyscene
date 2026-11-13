/** CLI smoke test: compose a scene from flags and export all presets into a temp folder. */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const out = mkdtempSync(path.join(os.tmpdir(), "easyscene-smoke-"));
const run = (...args) => execFileSync("npx", ["tsx", "src/cli.ts", ...args], { encoding: "utf8" });
const res = JSON.parse(
  run("compose", "--id", "smoke_scene", "--layers", "bg_sky_dusk,bg_far_mountains,bg_mid_forest", "--hill", "10,4,2",
    "--platform", "4,3,3", "--prop", "prop_tree_pine@40", "--export", "all", "--out", out, "--json"),
);
console.log("exports", res.exports.map((e) => `${e.preset}:${e.paths.length}`).join(" "));
const tscn = readFileSync(path.join(out, "smoke_scene-godot", "smoke_scene.tscn"), "utf8");
console.log("tscn_ok", tscn.includes("TileMapLayer") && tscn.includes("Parallax2D"));
