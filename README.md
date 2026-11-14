<!-- easy-suite:header:start -->
<p align="center">
  <a href="#easy-suite"><img src="docs/brand/banner-scene.png" width="100%" alt="Easy Scene: Side-view parallax scenes, autotiles & props" /></a>
</p>

<p align="center">
  <b>Easy Scene</b> · ฉากเกมด้านข้าง พารัลแลกซ์ · Side-view parallax scenes, autotiles & props<br />
  <sub>Part of <a href="#easy-suite"><b>Easy Suite</b></a>: Thai-friendly pixel-art game dev tools for Godot 4.3+ and PixiJS v8</sub>
</p>

<p align="center">
  <a href="https://github.com/Saladin2020/easyscene/actions/workflows/ci.yml"><img src="https://github.com/Saladin2020/easyscene/actions/workflows/ci.yml/badge.svg" alt="CI" /></a> <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-2e2014?style=flat-square" alt="MIT license" /></a> <img src="https://img.shields.io/badge/Godot-4.3%2B-478cbf?style=flat-square&logo=godotengine&logoColor=white" alt="Godot 4.3+" /> <a href="#export"><img src="https://img.shields.io/badge/PixiJS-v8-e72264?style=flat-square" alt="PixiJS v8" /></a> <a href="docs/MCP.md"><img src="https://img.shields.io/badge/MCP-server-c45c26?style=flat-square" alt="MCP server" /></a> <img src="https://img.shields.io/badge/Thai-ready-f4ae3d?style=flat-square" alt="Thai-ready" />
</p>

<p align="center">
  <a href="https://github.com/Saladin2020/easysprite"><img src="docs/brand/logo-sprite-96.png" width="32" alt="Easy Sprite" title="Easy Sprite" /></a>
  <a href="https://github.com/Saladin2020/easyscene"><img src="docs/brand/logo-scene-96.png" width="40" alt="Easy Scene" title="Easy Scene (this repo)" /></a>
  <a href="https://github.com/Saladin2020/easydialogue"><img src="docs/brand/logo-dialogue-96.png" width="32" alt="Easy Dialogue" title="Easy Dialogue" /></a>
  <a href="https://github.com/Saladin2020/easytilemap"><img src="docs/brand/logo-tilemap-96.png" width="32" alt="Easy Tilemap" title="Easy Tilemap" /></a>
  <a href="https://github.com/Saladin2020/easyquest"><img src="docs/brand/logo-quest-96.png" width="32" alt="Easy Quest" title="Easy Quest" /></a>
  <a href="https://github.com/Saladin2020/easysfx"><img src="docs/brand/logo-sfx-96.png" width="32" alt="Easy SFX" title="Easy SFX" /></a>
  <a href="https://github.com/Saladin2020/easyui"><img src="docs/brand/logo-ui-96.png" width="32" alt="Easy UI" title="Easy UI" /></a>
</p>
<!-- easy-suite:header:end -->

# Easy Scene

**ฉากเกมด้านข้าง · หมู่บ้านอบอุ่น**  
Compose **side-view** 2D game scenes from modular parts — parallax backgrounds, **16px** autotiles, props — and export them to **Godot 4**, **PixiJS** or plain PNG. The sibling of [Easy Sprite](https://github.com/Saladin2020/easysprite): its 48px side-view characters walk straight into these scenes.

[![node](https://img.shields.io/badge/node-%3E%3D20-3f7d52?style=flat-square)](https://nodejs.org)

> You prep the art. Easy Scene only **selects · arranges · recolors · previews · exports**.  
> No AI art generation in-app.

<p align="center">
  <img src="docs/assets/ui-editor.png" width="900" alt="Easy Scene editor UI with live parallax preview" />
</p>

<p align="center">
  <img src="docs/assets/forest-evening.png" width="900" alt="Forest evening scene composed from the CLI" />
</p>

---

## Why it exists

Build a whole side-scroller level without hand-placing every layer: stack 3–5 parallax layers, paint ground with tiles that fix their own edges, drop in houses and trees, and get a Godot scene that already scrolls and collides.

| Parallax | Tiles | Props |
| --- | --- | --- |
| sky (day · dusk · night) · far clouds / mountains / temple hill · mid hills / forest / tropical town · near bushes, each with its own scroll factor, seamless loop, recolor / tint | ground (16-variant autotile) · one-way platforms · 45° slopes, in grass · grass-night · stone · sidewalk + laterite | grouped by category: **buildings** (Thai town set, Muslim kampung set, temple hall, Chinese-Thai shrine, stilt house) · **street** (power poles, flag pole, signposts, motorbike, dog, cat, lantern) · **nature** · **water** (pier, canal boat, kolek boats, stilt fishing hut) · **decor** |

<p align="center">
  <img src="docs/assets/forest-evening-parallax.png" width="420" alt="Three camera positions showing parallax depth with an Easy Sprite side-view walker" />
  <img src="docs/assets/tileset-grass.png" width="192" alt="Sample grass tileset atlas" />
</p>

<p align="center">
  <img src="docs/assets/village-day.png" width="720" alt="Village day demo scene" />
</p>

<p align="center">
  <img src="docs/assets/lantern-night.png" width="720" alt="Lantern night demo scene with the night sky and grass tileset" />
</p>

### Thai town street

Modular Thai-style buildings that chain into a town: noodle shop, mini mart (generic striped fascia, no brand), fruit stall, 2–3 floor shophouses (café, garage, pharmacy, gold shop) and a teak stilt house, plus power poles whose wires join pole to pole, a Thai flag pole, a Thai signpost, potted plants, flower boxes, a motorbike, a dog and a cat, a canal pier and a long-tail boat. The demo scene `thai_village_street` puts them in a row on the new `tiles_street` sidewalk, with `bg_far_temple_hill` and `bg_mid_tropical` behind and a canal at the end.

<p align="center">
  <img src="docs/assets/thai-village-street.png" width="900" alt="Thai village street demo: teak house, fruit stall, noodle shop, shophouses, mini mart, power poles and a canal with a pier" />
</p>

<p align="center">
  <img src="docs/assets/thai-town-catalog.png" width="900" alt="Labeled catalog of every sample prop, grouped by category" />
</p>

### Multicultural village: วัด · ศาลเจ้า · มัสยิด

Thai towns are shared by Buddhist, Muslim and Chinese-Thai neighbours, and the samples now build that street. The **Muslim kampung set** (southern Thai / Thai-Malay) adds a wooden mosque after Talo Mano in Narathiwat (`prop_bld_mosque_wooden`: raised chengal hall, two-tier clay-tile roof, carved star vents, wooden minaret with a small dome and crescent), a Malay raised house with sun-ray gable and foot-wash jar (`prop_bld_malay_house`), a roti + tea shop with teh tarik and a dove cage (`prop_bld_roti_teashop`), and a halal food stall with a generic green ฮาลาล plate (`prop_bld_halal_stall`, not any official certification mark). Next to them: a small temple hall (`prop_bld_wat_sala`) and a Chinese-Thai shrine (`prop_bld_chinese_shrine`). The fishing kampung adds painted kolek boats (`prop_kolek_boat`, เรือกอและ), a stilt fishing hut over the water (`prop_fisher_hut`) and a fish drying rack (`prop_fish_rack`).

The demo scene `harmony_town` puts the wat, the shrine, the noodle shop, the roti shop, the halal stall, the Malay house and the mosque on one street, then runs on to a beach with kolek boats. The cast below is Easy Sprite side-view: a monk, a hijab teacher, a Tadika girl, a kopiah boy, a kain pelekat fisher and neighbours.

<p align="center">
  <img src="docs/assets/harmony-scene.png" width="900" alt="harmony_town: temple hall, Chinese-Thai shrine, shops, Malay house and a wooden mosque on one street, a beach with kolek boats" />
</p>

Building rules (any `category: "building"` prop, yours too): width is a multiple of 16, the art reaches both edges of its footprint and the bottom row is the ground line. So a row chains with `x += width`; `streets` in a compose recipe does it for you (`--street 0:prop_bld_thai_house,prop_bld_noodle_shop,…` on the CLI), and in the editor a dragged building snaps to its neighbour's edge (Shift places freely). Thai sign text is pre-rasterized from **Kanit** (SIL OFL 1.1) by `scripts/gen-thai-signs.py`, so no font ships at runtime. `npx tsx scripts/render-catalog.ts <outDir>` renders the street, 3× crops and this catalog.

The samples share one light direction (top-left), hue-shifted ramps and dithered atmospheric haze on far layers, so you can mix any sky with any layer. Demo scenes: `village_day`, `forest_evening`, `lantern_night` (`bg_sky_night` + `tiles_grass_night`, with props tinted blue and lanterns left glowing), `thai_village_street` and `harmony_town` (multicultural street).

---

## Quick start

```bash
git clone https://github.com/Saladin2020/easyscene.git
cd easyscene
npm install
npm run init          # sample parts + demo scenes (first run)
npm run build
npm run desktop       # open the editor in your browser (http://127.0.0.1:8788)
```

Dev mode (API + Vite):

```bash
npm run dev
# API  http://127.0.0.1:8788
# UI   http://127.0.0.1:5174
```

---

## CLI

```bash
npx tsx src/cli.ts info
npx tsx src/cli.ts parts --kind background
npx tsx src/cli.ts parts --category building
npx tsx src/cli.ts compose --id forest_evening --name "Forest evening" --width 72 \
  --layers bg_sky_dusk,bg_far_clouds,bg_far_mountains,bg_mid_forest,bg_near_bushes \
  --color bg_far_mountains=#6a4f8a --tint bg_far_clouds=#ff9a7a@0.4 \
  --tint bg_mid_forest=#e08a8a@0.35 --tint bg_near_bushes=#ff9a6a@0.25 \
  --ground 3 --hill 30,6,2 --pit 46,3 --platform 19,3,5 --platform 44,3,6 \
  --prop prop_house@150 --prop prop_tree_pine@520,flip --prop prop_bush@980,front \
  --street 1200:prop_bld_noodle_shop,prop_bld_shophouse_2f \
  --character ../easysprite/exports/walker_side.png:96:right:walk \
  --character ../easysprite/exports/auntie_side.png:540:front \
  --export all --out ./my-exports
npx tsx src/cli.ts export --id forest_evening --preset godot --out ./my-exports
npx tsx src/cli.ts render --id forest_evening --mode parallax --out parallax.png
```

`compose` (alias `new`) also takes `--tiles-file rows.txt` for hand-drawn grids or `--input scene.json` for a full recipe. Folders you pass to `--out` / `--scenes-dir` are allowed for that run.

---

## Export

| Preset | You get |
| --- | --- |
| `png` | one PNG per parallax layer (recolored), `tilemap.png`, `props_back/front.png`, combined `*_preview.png`, `*_parallax.png` strip, scene JSON |
| `godot` | self-contained **Godot 4.3+** project folder: `<id>.tscn` with `Parallax2D` layers (`scroll_scale`, `repeat_size`), `TileMapLayer` + `<id>_tileset.tres` (physics polygons, one-way platforms), back/front props, extra `StaticBody2D` boxes, `Camera2D` with an arrow-key pan script, `project.godot` with Nearest filtering. `--godot-parallax legacy` emits `ParallaxBackground` / `ParallaxLayer` instead. |
| `pixi` | layer PNGs + tileset + props + `<id>.pixi.json` (scroll factors, loop widths, tile indices, merged collision rects, slopes) + a small `load-scene.js` for **PixiJS v8** |

Everything is nearest-neighbour. Scene JSON: [`docs/SCENE_FORMAT.md`](docs/SCENE_FORMAT.md).

### Easy Sprite characters

Put a whole cast of Easy Sprite **side-view** native sheets (1440×144 · rows `right left front` · 48px frames) into a scene. Each one has its own `x`, `facing`, `anim` (`idle` / `walk`), still `frame`, draw `layer` and optional `patrol`. Their feet snap onto the ground. The sole row is detected from the sheet: row 47 for Easy Sprite side sheets. If a sibling `<sheet>.json` export sits next to the PNG, Easy Scene reads the frame order and rows from it. In the web editor you can add, select, drag (x, feet on the terrain; Shift for a free baseline) and remove characters, and edit facing, anim, groundRow and patrol — it all round-trips through `characters[]`.

<p align="center">
  <img src="docs/assets/thai-village-cast.png" width="720" alt="Six Easy Sprite characters in the Thai village street: farmer, vendor, monk in a saffron robe, student, kid, elder" />
</p>

```bash
# --character path[:x[:facing[:anim[:frame]]]]  (repeatable; empty fields keep defaults)
npx tsx src/cli.ts compose --id thai_village_cast --input scenes/thai_village_street.json \
  --character cast/town_farmer.png:64:right:walk:walk1 \
  --character cast/town_vendor.png:156:front \
  --character cast/town_monk.png:248:right:walk \
  --character cast/town_elder.png:848:left:walk \
  --export all
npx tsx src/cli.ts render --id thai_village_cast --mode viewport --camera 160 --scale 3 --out cast@3x.png
```

| Export | Characters become |
| --- | --- |
| `png` | drawn into `*_preview.png` / `*_parallax.png` at their still frame |
| `pixi` | `characters/*.png` + `json.characters` (rows, `idle`/`walk` columns, fps, patrol). `load-scene.js` builds a `PIXI.AnimatedSprite` per character. Call `scene.update(dt)` each tick to move patrols. |
| `godot` | `assets/characters/*.png`, a `SpriteFrames` per sheet (`idle_<dir>`, `walk_<dir>`), an autoplaying `AnimatedSprite2D` per character under `Characters` / `CharactersBack` / `CharactersFront`, plus `character_patrol.gd` for patrols (Y follows hills and slopes, same rule as the PNG / Pixi exports) |

The old single `"character": { sheet, x }` field and a single `--character sheet.png` still work. The editor's parallax preview animates the placed cast and also has its own **Walker** sheet that follows the camera. Paths must be inside the workspace or `EASYSCENE_ALLOWED_DIRS`; the CLI may read any path you give it.

---

## Features

- Parallax builder: up to 5 layers, per-layer scroll factor, seamless horizontal looping, hue recolor (same algorithm as Easy Sprite) and multiply tint
- 16px side-view tiles: edge-aware autotile, one-way platforms with end caps, slopes, terrain builder (`groundHeight`, `hills`, `pits`, `platforms`)
- Modular buildings: `streets` chain a row of buildings edge to edge on the 16px grid; the props panel groups parts by category with a filter
- Editor: paint tiles on a grid, place / drag / flip / recolor props, live game-camera preview with play / scrub / speed
- Collision from tiles + prop boxes + hand-drawn rects
- **MCP** tools for agents — compose and export without clicking ([docs/MCP.md](docs/MCP.md))
- Local-only API (same guard as Easy Sprite), PWA icons and manifest

---

## Commands

```bash
npm run init
npm run serve            # http://127.0.0.1:8788
npm run desktop
npm run build
npm run mcp              # stdio MCP
npm run mcp:http         # http://127.0.0.1:8796/mcp  (any port: -- --port 18796)
npm run typecheck
npm test                 # vitest unit tests
npm run smoke            # MCP + CLI smoke tests (run npm run init first)
npm run icons            # re-bake favicon / PWA icons
npm run capture:ui       # headless Chrome screenshot of the running UI
npm run docs:images      # re-render the README art in docs/assets (-- --character sheet.png)
npm run catalog          # Thai town street + labeled prop catalog (-- <outDir> --character sheet.png)
```

### Security

Same rules as Easy Sprite: no CORS; loopback `Host` only on `127.0.0.1`; a token for any other host (`EASYSCENE_TOKEN`); scenes, exports and character sheets only inside the workspace or `EASYSCENE_ALLOWED_DIRS`; scene ids limited to `a-z 0-9 _ -`.

---

<!-- easy-suite:table:start -->
## Easy Suite

<img src="docs/brand/logo-suite-96.png" width="48" align="right" alt="Easy Suite" />

Seven small, local-first tools that share one look (teak, lantern gold, Kanit, 16/48px pixels), one
workflow (CLI · web editor · MCP server) and the same targets (**Godot 4.3+** and **PixiJS v8**).
ชุดเครื่องมือทำเกมพิกเซลสไตล์ไทย ใช้ร่วมกันได้ทั้งชุด

| | Tool | What it does | Repo |
|:-:|---|---|---|
| <img src="docs/brand/logo-sprite-96.png" width="40" alt="" /> | [**Easy Sprite**](https://github.com/Saladin2020/easysprite) | Compose modular 48px chibi characters (top-down + side-view) and export sheets. | [`easysprite`](https://github.com/Saladin2020/easysprite) |
| <img src="docs/brand/logo-scene-96.png" width="40" alt="" /> | **Easy Scene** ← you are here | Side-view levels: parallax layers, 16px autotiles, multicultural Thai town props. | [`easyscene`](https://github.com/Saladin2020/easyscene) |
| <img src="docs/brand/logo-dialogue-96.png" width="40" alt="" /> | [**Easy Dialogue**](https://github.com/Saladin2020/easydialogue) | Branching `.ezd` dialogue with Thai-safe text, portraits and choices. | [`easydialogue`](https://github.com/Saladin2020/easydialogue) |
| <img src="docs/brand/logo-tilemap-96.png" width="40" alt="" /> | [**Easy Tilemap**](https://github.com/Saladin2020/easytilemap) | Top-down 16px maps: blob-47 autotiles, objects, collision, spawns. | [`easytilemap`](https://github.com/Saladin2020/easytilemap) |
| <img src="docs/brand/logo-quest-96.png" width="40" alt="" /> | [**Easy Quest**](https://github.com/Saladin2020/easyquest) | Text `.ezq` quests: steps, flags, items, rewards, linked to dialogue. | [`easyquest`](https://github.com/Saladin2020/easyquest) |
| <img src="docs/brand/logo-sfx-96.png" width="40" alt="" /> | [**Easy SFX**](https://github.com/Saladin2020/easysfx) | Deterministic 8-bit SFX and 4-channel chiptune loops, typing blips. | [`easysfx`](https://github.com/Saladin2020/easysfx) |
| <img src="docs/brand/logo-ui-96.png" width="40" alt="" /> | [**Easy UI**](https://github.com/Saladin2020/easyui) | Nine-slice pixel UI kit: panels, bars, inventory, menus, 24 icons. | [`easyui`](https://github.com/Saladin2020/easyui) |

### Works with

- **Easy Sprite** side-view sheets walk straight in; the ground row is read from the sheet.
- **Easy Dialogue** renders its boxes over Easy Scene village backgrounds.
- **Easy SFX** and **Easy UI** add the sound bank and HUD on top of the exported Godot / PixiJS scene.
<!-- easy-suite:table:end -->

## License / credit

Easy Scene's code is released under the [MIT License](LICENSE) © 2026 Salahuddin Benno.

The sample parts are **original art generated by code** (`src/lib/sampleParts.ts`, seeded noise + shapes) — no third-party pixels — and are dedicated to the public domain (**CC0-1.0**). `npm run init` writes them with a `parts/CREDITS.md` manifest; every sample `part.json` carries `"sample": true`. Replace them with your own Aseprite art any time.

> หมายเหตุ: ตอนนี้ไฟล์ `.tscn` สร้างตามรูปแบบของ Godot 4.3 แต่ยังไม่เคยเปิดทดสอบใน Godot จริง ถ้าเจอปัญหาตอนนำเข้า ฝากเปิด issue ไว้ได้เลยครับ

---

<p align="center">
  <sub>teak · lanterns · parallax dreams</sub>
</p>
