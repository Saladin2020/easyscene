/**
 * Exporters: PNG layers · Godot 4 (.tscn + TileSet .tres) · PixiJS JSON.
 * Everything is nearest-neighbour; Godot projects set the default texture filter to Nearest.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { RgbaImage } from "../shared/raster.js";
import { layerImage, layerWorldY, mapSize, propImage, propLayerOf, renderParallaxStrip, renderProps, renderScene, renderTilemap, type CharacterSprite, type SceneAssets } from "../shared/render.js";
import { ATLAS_COLUMNS, atlasIndex, mergeRuns, resolveTile, tileShape } from "../shared/tiles.js";
import type { BackgroundPart, CollisionRect, ExportPresetId, PropPart, SceneDoc, TilesetPart } from "../shared/types.js";
import { characterSprite, loadAssets, loadCharacterSheet } from "./compose.js";
import { encodePng } from "./png.js";
import { assertSafeId, loadScene, resolveOutDir } from "./workspace.js";

export interface ExportOptions {
  sceneId?: string;
  scene?: SceneDoc;
  preset?: ExportPresetId;
  /** Parent folder; a `<base>-<preset>/` folder is created inside. */
  dir?: string;
  baseName?: string;
  scenesDir?: string;
  /** Easy Sprite side-view sheet drawn into preview PNGs. */
  character?: string;
  /** CLI only: allow reading the character sheet from any path. */
  trustedCharacter?: boolean;
  godot?: { parallax?: "parallax2d" | "legacy" };
}

export interface ExportResult {
  preset: ExportPresetId;
  dir: string;
  paths: string[];
  warnings: string[];
}

class Files {
  paths: string[] = [];
  constructor(readonly dir: string) {}
  async png(rel: string, img: RgbaImage) {
    return this.write(rel, encodePng(img));
  }
  async text(rel: string, body: string) {
    return this.write(rel, body);
  }
  private async write(rel: string, data: Buffer | string) {
    const file = path.join(this.dir, rel);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, data);
    this.paths.push(file);
    return file;
  }
}

const slug = (s: string) => s.replace(/[^a-zA-Z0-9_]+/g, "_");
const pascal = (s: string) => s.split(/[^a-zA-Z0-9]+/).filter(Boolean).map((w) => w[0]!.toUpperCase() + w.slice(1)).join("") || "Scene";
const num = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 1000) / 1000));

/** Stable file stem for a prop image variant (same part with different colors → different files). */
function propVariantKey(p: SceneDoc["props"][number]): string {
  const extra = [p.color, p.tint, p.tint ? p.tintAmount ?? 0.35 : undefined].filter((v) => v !== undefined).join("_");
  return extra ? `${p.part}_${slug(extra).replace(/^_+/, "").toLowerCase()}` : p.part;
}

/** All collision boxes in px: merged solid runs, one-way runs, prop boxes and hand-drawn rects. */
export function collisionSummary(doc: SceneDoc, assets: SceneAssets) {
  const ts = doc.tileSize;
  const solid = mergeRuns(doc.tiles, ts, "#");
  const oneWay = mergeRuns(doc.tiles, ts, "=");
  const slopes: Array<{ x: number; y: number; size: number; rises: "right" | "left"; points: number[] }> = [];
  doc.tiles.forEach((row, y) =>
    [...row].forEach((c, x) => {
      if (c !== "/" && c !== "\\") return;
      const shape = tileShape(c, ts)!;
      slopes.push({
        x: x * ts,
        y: y * ts,
        size: ts,
        rises: c === "/" ? "right" : "left",
        points: shape.points.flatMap(([px, py]) => [x * ts + px, y * ts + py]),
      });
    }),
  );
  const extra: CollisionRect[] = [...doc.collision];
  doc.props.forEach((p) => {
    const meta = assets.meta(p.part) as PropPart | undefined;
    if (!meta?.collision) return;
    const c = meta.collision;
    const cx = p.flipX ? meta.width - c.x - c.w : c.x;
    extra.push({ x: p.x + cx, y: p.y - meta.height + c.y, w: c.w, h: c.h });
  });
  return {
    solid: [...solid, ...extra.filter((r) => !r.oneWay)],
    oneWay: [...oneWay, ...extra.filter((r) => r.oneWay)],
    slopes,
    extra,
  };
}

// ---------------------------------------------------------------- Godot

/** TileMapLayer `tile_map_data` bytes (format 0: u16 version, then 12 bytes per cell, little-endian). */
export function encodeTileMapData(doc: SceneDoc): Uint8Array {
  const cells: Array<[number, number, number, number]> = [];
  for (let y = 0; y < doc.height; y++) {
    for (let x = 0; x < doc.width; x++) {
      const t = resolveTile(doc.tiles, x, y);
      if (t) cells.push([x, y, t.col, t.row]);
    }
  }
  const buf = new Uint8Array(2 + cells.length * 12);
  const dv = new DataView(buf.buffer);
  dv.setUint16(0, 0, true);
  cells.forEach(([x, y, ax, ay], i) => {
    const o = 2 + i * 12;
    dv.setInt16(o, x, true);
    dv.setInt16(o + 2, y, true);
    dv.setUint16(o + 4, 0, true); // source id
    dv.setUint16(o + 6, ax, true);
    dv.setUint16(o + 8, ay, true);
    dv.setUint16(o + 10, 0, true); // alternative
  });
  return buf;
}

/** Decode `encodeTileMapData` (used by tests and handy for debugging). */
export function decodeTileMapData(bytes: Uint8Array): Array<{ x: number; y: number; atlas: [number, number] }> {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = [];
  for (let o = 2; o + 12 <= bytes.length; o += 12) {
    out.push({ x: dv.getInt16(o, true), y: dv.getInt16(o + 2, true), atlas: [dv.getUint16(o + 6, true), dv.getUint16(o + 8, true)] as [number, number] });
  }
  return out;
}

export function buildTileSetTres(tileset: TilesetPart, texturePath: string): string {
  const ts = tileset.tileSize;
  const h = ts / 2;
  const lines: string[] = [];
  // terrain + platform + slopes: every atlas cell we use gets a tile and its collision polygon
  const codeFor = (col: number, row: number): string | null => {
    if (row < 4) return "#";
    if (row === 4) return "=";
    if (row === 5 && col === 0) return "/";
    if (row === 5 && col === 1) return "\\";
    return null;
  };
  for (let row = 0; row < tileset.rows; row++) {
    for (let col = 0; col < tileset.columns; col++) {
      const code = codeFor(col, row);
      if (!code) continue;
      const key = `${col}:${row}/0`;
      lines.push(`${key} = 0`);
      const shape = tileShape(code, ts);
      if (!shape) continue;
      const pts = shape.points.map(([x, y]) => `${num(x - h)}, ${num(y - h)}`).join(", ");
      lines.push(`${key}/physics_layer_0/polygon_0/points = PackedVector2Array(${pts})`);
      if (shape.oneWay) lines.push(`${key}/physics_layer_0/polygon_0/one_way = true`);
    }
  }
  return `[gd_resource type="TileSet" load_steps=3 format=3]

[ext_resource type="Texture2D" path="${texturePath}" id="1_tiles"]

[sub_resource type="TileSetAtlasSource" id="TileSetAtlasSource_main"]
texture = ExtResource("1_tiles")
texture_region_size = Vector2i(${ts}, ${ts})
${lines.join("\n")}

[resource]
tile_size = Vector2i(${ts}, ${ts})
physics_layer_0/collision_layer = 1
sources/0 = SubResource("TileSetAtlasSource_main")
`;
}

interface GodotFiles {
  layers: Array<{ res: string; width: number; height: number }>;
  props: string[];
  tileset: string;
  /** Optional preview script on the Camera2D (arrow keys pan the level). */
  cameraScript?: string;
}

const CAMERA_PAN_GD = `extends Camera2D
## Easy Scene preview camera: arrow keys pan across the level so you can check the parallax.
## Delete this script (or the Camera2D) once your player has its own camera.

@export var speed := 140.0

func _process(delta: float) -> void:
	var dir := Input.get_axis("ui_left", "ui_right")
	if dir == 0.0:
		return
	var half := get_viewport_rect().size.x * 0.5 / zoom.x
	position.x = clamp(position.x + dir * speed * delta, limit_left + half, limit_right - half)
`;

export function buildGodotTscn(
  doc: SceneDoc,
  assets: SceneAssets,
  files: GodotFiles,
  opts: { parallax?: "parallax2d" | "legacy" } = {},
): string {
  const legacy = opts.parallax === "legacy";
  const ext: string[] = [];
  const subs: string[] = [];
  const nodes: string[] = [];
  let extId = 0;
  const extByPath = new Map<string, string>();
  const addExt = (type: string, res: string) => {
    const known = extByPath.get(res);
    if (known) return known;
    const id = `${++extId}_${slug(path.basename(res, path.extname(res))).slice(0, 24)}`;
    ext.push(`[ext_resource type="${type}" path="${res}" id="${id}"]`);
    extByPath.set(res, id);
    return id;
  };
  const { width: mapW, height: mapH } = mapSize(doc);
  const rootName = pascal(doc.id);
  nodes.push(`[node name="${rootName}" type="Node2D"]`);

  // ---- parallax
  const parallaxParent = legacy ? "ParallaxBackground" : "Parallax";
  nodes.push(legacy ? `[node name="ParallaxBackground" type="ParallaxBackground" parent="."]` : `[node name="Parallax" type="Node2D" parent="."]`);
  doc.layers.forEach((layer, i) => {
    const f = files.layers[i]!;
    const meta = assets.meta(layer.part) as BackgroundPart | undefined;
    const tex = addExt("Texture2D", f.res);
    const name = `L${i}_${slug(meta?.band ?? "layer")}_${slug(layer.part)}`;
    const loop = meta?.loopWidth ?? f.width;
    const y = layerWorldY(doc, f, i);
    if (legacy) {
      nodes.push(`[node name="${name}" type="ParallaxLayer" parent="${parallaxParent}"]
motion_scale = Vector2(${num(layer.scroll)}, ${num(layer.scrollY ?? 1)})
motion_mirroring = Vector2(${loop}, 0)`);
    } else {
      nodes.push(`[node name="${name}" type="Parallax2D" parent="${parallaxParent}"]
scroll_scale = Vector2(${num(layer.scroll)}, ${num(layer.scrollY ?? 1)})
repeat_size = Vector2(${loop}, 0)
repeat_times = ${Math.max(2, Math.ceil(doc.viewport.width / loop) + 1)}`);
    }
    nodes.push(`[node name="Sprite2D" type="Sprite2D" parent="${parallaxParent}/${name}"]
texture = ExtResource("${tex}")
centered = false
position = Vector2(0, ${y})`);
  });

  // ---- props
  const propNode = (i: number, parent: string) => {
    const p = doc.props[i]!;
    const img = assets.meta(p.part);
    const tex = addExt("Texture2D", files.props[i]!);
    const h = img?.height ?? 0;
    return `[node name="P${i}_${slug(p.part)}" type="Sprite2D" parent="${parent}"]
texture = ExtResource("${tex}")
centered = false
position = Vector2(${p.x}, ${p.y - h})${p.flipX ? "\nflip_h = true" : ""}`;
  };
  nodes.push(`[node name="PropsBack" type="Node2D" parent="."]`);
  doc.props.forEach((_, i) => {
    if (propLayerOf(doc, assets, i) === "back") nodes.push(propNode(i, "PropsBack"));
  });

  // ---- tilemap
  const tsId = addExt("TileSet", files.tileset);
  const bytes = Array.from(encodeTileMapData(doc)).join(", ");
  nodes.push(`[node name="Tiles" type="TileMapLayer" parent="."]
tile_map_data = PackedByteArray(${bytes})
tile_set = ExtResource("${tsId}")`);

  // ---- extra collision (hand-drawn rects + prop boxes); tiles collide via the TileSet
  const col = collisionSummary(doc, assets);
  if (col.extra.length) {
    nodes.push(`[node name="Collision" type="StaticBody2D" parent="."]`);
    col.extra.forEach((r, i) => {
      const sid = `RectangleShape2D_${i}`;
      subs.push(`[sub_resource type="RectangleShape2D" id="${sid}"]\nsize = Vector2(${r.w}, ${r.h})`);
      nodes.push(`[node name="Box${i}" type="CollisionShape2D" parent="Collision"]
position = Vector2(${num(r.x + r.w / 2)}, ${num(r.y + r.h / 2)})
shape = SubResource("${sid}")${r.oneWay ? "\none_way_collision = true" : ""}`);
    });
  }

  nodes.push(`[node name="PropsFront" type="Node2D" parent="."]\nz_index = 10`);
  doc.props.forEach((_, i) => {
    if (propLayerOf(doc, assets, i) === "front") nodes.push(propNode(i, "PropsFront"));
  });

  const vw = doc.viewport.width;
  const vh = doc.viewport.height;
  const camScript = files.cameraScript ? addExt("Script", files.cameraScript) : null;
  nodes.push(`[node name="Camera2D" type="Camera2D" parent="."]${camScript ? `\nscript = ExtResource("${camScript}")` : ""}
position = Vector2(${Math.round(vw / 2)}, ${Math.round(mapH - vh / 2)})
limit_left = 0
limit_top = 0
limit_right = ${mapW}
limit_bottom = ${mapH}`);

  const loadSteps = ext.length + subs.length + 1;
  return [`[gd_scene load_steps=${loadSteps} format=3]`, ext.join("\n"), ...subs, ...nodes].filter(Boolean).join("\n\n") + "\n";
}

function godotProject(doc: SceneDoc, mainScene: string, clear: RgbaImage | undefined): string {
  let clearLine = "";
  if (clear) {
    const [r, g, b] = [clear.data[0]!, clear.data[1]!, clear.data[2]!].map((v) => num(v / 255));
    clearLine = `\nenvironment/defaults/default_clear_color=Color(${r}, ${g}, ${b}, 1)`;
  }
  return `; Generated by Easy Scene — Godot 4.3+ (Parallax2D + TileMapLayer)
config_version=5

[application]

config/name="${doc.name.replace(/"/g, "'")}"
run/main_scene="${mainScene}"
config/features=PackedStringArray("4.3")

[display]

window/size/viewport_width=${doc.viewport.width}
window/size/viewport_height=${doc.viewport.height}
window/size/window_width_override=${doc.viewport.width * 3}
window/size/window_height_override=${doc.viewport.height * 3}
window/stretch/mode="viewport"

[rendering]

textures/canvas_textures/default_texture_filter=0
2d/snap/snap_2d_transforms_to_pixel=true${clearLine}
`;
}

// ---------------------------------------------------------------- main entry

export async function exportScene(root: string, opts: ExportOptions): Promise<ExportResult> {
  const preset = opts.preset ?? "png";
  if (!["png", "godot", "pixi"].includes(preset)) throw new Error(`Unknown preset ${preset}`);
  const doc = opts.scene ?? (await loadScene(root, assertSafeId(opts.sceneId), opts.scenesDir));
  assertSafeId(doc.id);
  const base = opts.baseName ? assertSafeId(opts.baseName, "base name") : doc.id;
  const parent = resolveOutDir(root, opts.dir, "exports");
  const outDir = path.join(parent, `${base}-${preset}`);
  const files = new Files(outDir);
  const warnings: string[] = [];
  const assets = await loadAssets(root, doc);

  for (const id of [doc.tileset, ...doc.layers.map((l) => l.part), ...doc.props.map((p) => p.part)]) {
    if (!assets.image(id)) warnings.push(`Missing part image: ${id}`);
  }

  let character: CharacterSprite | undefined;
  const sheetPath = opts.character ?? doc.character?.sheet;
  if (sheetPath) {
    try {
      const sheet = await loadCharacterSheet(root, sheetPath, { trusted: opts.trustedCharacter });
      character = characterSprite(sheet, opts.character ? 96 : doc.character?.x ?? 96);
    } catch (e) {
      warnings.push(`Character preview skipped: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const tilesetMeta = assets.meta(doc.tileset) as TilesetPart | undefined;
  const preview = renderScene(doc, assets, { character });
  const strip = renderParallaxStrip(doc, assets, 3, character);

  if (preset === "png") {
    for (let i = 0; i < doc.layers.length; i++) {
      const img = layerImage(doc, assets, i);
      const meta = assets.meta(doc.layers[i]!.part) as BackgroundPart | undefined;
      if (img) await files.png(`layer_${i}_${meta?.band ?? "bg"}_${doc.layers[i]!.part}.png`, img);
    }
    await files.png("tilemap.png", renderTilemap(doc, assets));
    await files.png("props_back.png", renderProps(doc, assets, "back"));
    await files.png("props_front.png", renderProps(doc, assets, "front"));
    await files.png(`${base}_preview.png`, preview);
    await files.png(`${base}_parallax.png`, strip);
    await files.text(`${base}.scene.json`, `${JSON.stringify(doc, null, 2)}\n`);
  }

  if (preset === "godot") {
    const layerFiles: GodotFiles["layers"] = [];
    for (let i = 0; i < doc.layers.length; i++) {
      const img = layerImage(doc, assets, i) ?? { width: 1, height: 1, data: new Uint8Array(4) };
      const rel = `assets/bg_${i}_${doc.layers[i]!.part}.png`;
      await files.png(rel, img);
      layerFiles.push({ res: `res://${rel}`, width: img.width, height: img.height });
    }
    const propFiles: string[] = [];
    const written = new Set<string>();
    for (let i = 0; i < doc.props.length; i++) {
      const rel = `assets/props/${propVariantKey(doc.props[i]!)}.png`;
      if (!written.has(rel)) {
        const img = propImage(doc, assets, i);
        if (img) await files.png(rel, img);
        written.add(rel);
      }
      propFiles.push(`res://${rel}`);
    }
    const atlas = assets.image(doc.tileset);
    if (atlas) await files.png("assets/tileset.png", atlas);
    const tsRes = `res://${base}_tileset.tres`;
    if (tilesetMeta) await files.text(`${base}_tileset.tres`, buildTileSetTres(tilesetMeta, "res://assets/tileset.png"));
    await files.text("camera_pan.gd", CAMERA_PAN_GD);
    const tscn = buildGodotScene(doc, assets, { layers: layerFiles, props: propFiles, tileset: tsRes, cameraScript: "res://camera_pan.gd" }, opts.godot);
    await files.text(`${base}.tscn`, tscn);
    await files.text("project.godot", godotProject(doc, `res://${base}.tscn`, layerImage(doc, assets, 0)));
    await files.png(`${base}_preview.png`, preview);
    await files.text(
      "README.txt",
      `Easy Scene export — ${doc.name}\n\nOpen this folder as a Godot 4.3+ project (project.godot) or copy it into your project.\nMain scene: ${base}.tscn (Parallax2D layers, TileMapLayer with ${base}_tileset.tres, props, Camera2D).\nPress F5, then the arrow keys to pan the preview camera (camera_pan.gd).\nIf you copy it into another project, keep the folder at res:// root or search/replace "res://" paths.\nTiles collide on physics layer 1; '=' platforms are one-way.\nTextures use Nearest filtering (project setting). Generated by Easy Scene; sample art is CC0.\n`,
    );
  }

  if (preset === "pixi") {
    const layers = [];
    for (let i = 0; i < doc.layers.length; i++) {
      const layer = doc.layers[i]!;
      const img = layerImage(doc, assets, i);
      const meta = assets.meta(layer.part) as BackgroundPart | undefined;
      if (!img) continue;
      const rel = `layers/${i}_${layer.part}.png`;
      await files.png(rel, img);
      layers.push({
        name: `${meta?.band ?? "layer"}_${layer.part}`,
        part: layer.part,
        band: meta?.band,
        image: rel,
        width: img.width,
        height: img.height,
        y: layerWorldY(doc, img, i),
        scrollFactor: { x: layer.scroll, y: layer.scrollY ?? 1 },
        loopWidth: meta?.loopWidth ?? img.width,
        repeatX: true,
      });
    }
    const atlas = assets.image(doc.tileset);
    if (atlas) await files.png("tileset.png", atlas);
    const data: number[] = [];
    for (let y = 0; y < doc.height; y++) for (let x = 0; x < doc.width; x++) {
      const t = resolveTile(doc.tiles, x, y);
      data.push(t ? atlasIndex(t) : -1);
    }
    const props = [];
    const written = new Set<string>();
    for (let i = 0; i < doc.props.length; i++) {
      const p = doc.props[i]!;
      const img = propImage(doc, assets, i);
      if (!img) continue;
      const rel = `props/${propVariantKey(p)}.png`;
      if (!written.has(rel)) {
        await files.png(rel, img);
        written.add(rel);
      }
      props.push({ part: p.part, image: rel, x: p.x, y: p.y - img.height, width: img.width, height: img.height, flipX: Boolean(p.flipX), layer: propLayerOf(doc, assets, i) });
    }
    const { width: pw, height: ph } = mapSize(doc);
    const col = collisionSummary(doc, assets);
    const json = {
      format: "easyscene-pixi/1",
      id: doc.id,
      name: doc.name,
      scaleMode: "nearest",
      tileSize: doc.tileSize,
      size: { tilesX: doc.width, tilesY: doc.height, width: pw, height: ph },
      viewport: doc.viewport,
      renderOrder: ["layers", "props.back", "tilemap", "characters", "props.front"],
      layers,
      tileset: { image: "tileset.png", tileSize: tilesetMeta?.tileSize ?? doc.tileSize, columns: tilesetMeta?.columns ?? ATLAS_COLUMNS, rows: tilesetMeta?.rows },
      tilemap: { width: doc.width, height: doc.height, data, codes: doc.tiles },
      props,
      collision: { solid: col.solid, oneWay: col.oneWay, slopes: col.slopes },
    };
    await files.text(`${base}.pixi.json`, `${JSON.stringify(json, null, 2)}\n`);
    await files.text("load-scene.js", PIXI_LOADER);
    await files.png(`${base}_preview.png`, preview);
  }

  return { preset, dir: outDir, paths: files.paths, warnings };
}

/** Kept as an alias so the name reads naturally next to buildTileSetTres. */
export const buildGodotScene = buildGodotTscn;


const PIXI_LOADER = `// Easy Scene → PixiJS v8 loader (ES module). Usage:
//   import { Application } from "pixi.js";
//   import { loadEasyScene } from "./load-scene.js";
//   const app = new Application(); await app.init({ width: 480, height: 270, antialias: false });
//   const scene = await loadEasyScene(PIXI, "./my_scene.pixi.json"); app.stage.addChild(scene.root);
//   app.ticker.add(() => scene.setCamera(cameraX, cameraY));
export async function loadEasyScene(PIXI, url) {
  const base = new URL(".", new URL(url, location.href)).href;
  const json = await (await fetch(url)).json();
  const tex = async (rel) => {
    const t = await PIXI.Assets.load(base + rel);
    t.source.scaleMode = "nearest";
    return t;
  };
  const root = new PIXI.Container();
  const layers = [];
  for (const l of json.layers) {
    const t = await tex(l.image);
    const s = new PIXI.TilingSprite({ texture: t, width: json.viewport.width, height: l.height });
    s.y = l.y;
    root.addChild(s);
    layers.push({ s, l });
  }
  const world = new PIXI.Container();
  root.addChild(world);
  const addProps = async (which) => {
    for (const p of json.props.filter((p) => p.layer === which)) {
      const s = new PIXI.Sprite(await tex(p.image));
      s.x = p.flipX ? p.x + p.width : p.x;
      s.y = p.y;
      if (p.flipX) s.scale.x = -1;
      world.addChild(s);
    }
  };
  await addProps("back");
  const atlas = await tex(json.tileset.image);
  const ts = json.tileset.tileSize;
  const tiles = new PIXI.Container();
  json.tilemap.data.forEach((idx, i) => {
    if (idx < 0) return;
    const frame = new PIXI.Rectangle((idx % json.tileset.columns) * ts, Math.floor(idx / json.tileset.columns) * ts, ts, ts);
    const s = new PIXI.Sprite(new PIXI.Texture({ source: atlas.source, frame }));
    s.x = (i % json.tilemap.width) * ts;
    s.y = Math.floor(i / json.tilemap.width) * ts;
    tiles.addChild(s);
  });
  world.addChild(tiles);
  const characters = new PIXI.Container();
  world.addChild(characters);
  await addProps("front");
  function setCamera(x, y = Math.max(0, json.size.height - json.viewport.height)) {
    world.x = -Math.round(x);
    world.y = -Math.round(y);
    for (const { s, l } of layers) {
      s.tilePosition.x = -Math.round(x * l.scrollFactor.x);
      s.y = Math.round(l.y - y * l.scrollFactor.y);
    }
  }
  setCamera(0);
  return { json, root, world, characters, setCamera };
}
`;
