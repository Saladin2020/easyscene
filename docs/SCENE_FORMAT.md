# Scene format (`easyscene/1`)

A scene is one JSON file in `scenes/<id>.json`. Agents and humans can both edit it; every save goes back through `composeScene`, which drops unknown parts (with warnings) and normalizes the grid.

```jsonc
{
  "format": "easyscene/1",
  "id": "forest_evening",            // a-z 0-9 _ - (file name)
  "name": "Forest evening",
  "tileSize": 16,
  "width": 72, "height": 17,          // tiles → 1152×272 px
  "viewport": { "width": 480, "height": 270 },
  "layers": [                         // back → front, max 5
    { "part": "bg_sky_dusk", "scroll": 0.03 },
    { "part": "bg_far_mountains", "scroll": 0.2, "color": "#6a4f8a", "offsetY": -42 },
    { "part": "bg_mid_forest", "scroll": 0.45, "tint": "#ff9a6a", "tintAmount": 0.25, "offsetY": -42 }
  ],
  "tileset": "tiles_grass",
  "tiles": [                          // `height` rows of `width` codes
    "........................",
    "....=====...............",
    "................/##\\....",
    "###############/####\\###"
  ],
  "props": [
    { "part": "prop_house", "x": 150, "y": 224 },          // x = left edge, y = baseline (px)
    { "part": "prop_bush", "x": 980, "y": 224, "layer": "front", "flipX": true }
  ],
  "collision": [{ "x": 500, "y": 150, "w": 32, "h": 8, "oneWay": true }],
  "characters": [                     // optional: Easy Sprite side-view sheets placed in the scene
    { "sheet": "/path/to/farmer_side.png", "x": 64, "facing": "right", "anim": "walk",
      "patrol": { "minX": 24, "maxX": 110, "speed": 26 } },
    { "sheet": "/path/to/vendor_side.png", "x": 156, "facing": "front", "frame": "idle", "layer": "front" }
  ]
}
```

## Characters

`characters` is an optional, additive field: the format stays `easyscene/1`, and readers that don't know the field just ignore it. The legacy single `"character": { "sheet", "x" }` is still read and is drawn before `characters`.

| Field | Default | Meaning |
| --- | --- | --- |
| `sheet` | — | Easy Sprite native sheet (`.png`). A sibling `<stem>.json` export (`easysprite.native`) supplies `frames`, `directions` and `frameSize`. Without one, Easy Scene assumes the side-view layout: 30 frames, rows `right left front`. |
| `name` | sheet stem | label for exported node / file names |
| `x` | `96` | left edge of the 48px frame (world px) |
| `y` | ground | baseline (feet) in world px. Default: the first solid or slope tile under the frame's centre. |
| `facing` | `right` | `right` · `left` · `front`. A sheet with no `left` row uses `right` mirrored. |
| `anim` | `idle` | `idle` · `walk` (walk0 walk1 walk2 walk1) |
| `frame` | `idle` / `walk0` | still pose for PNG previews and the idle animation: frame name (`wave0`, `sit`) or column |
| `groundRow` | detected | sole row inside the frame: the lowest opaque row of the idle frame. Easy Sprite side sheets → `47`. Earlier versions assumed `44`, which buried feet by 3px. |
| `layer` | `main` | `back` = behind back props · `main` = in front of tiles, behind front props · `front` = over front props |
| `patrol` | — | `{ minX, maxX, speed? }`: walks back and forth in Pixi (`update(dt)`) and Godot (`character_patrol.gd`). The baseline follows the ground in Pixi. In Godot it stays at the start height. |

CLI: `--character path[:x[:facing[:anim[:frame]]]]`, repeatable (`hero.png::left` keeps the default `x`). Put patrols, `layer`, `y` or `groundRow` in a `--input` JSON.

## Tile codes

| Code | Meaning | Collision |
| --- | --- | --- |
| `.` | empty | — |
| `#` | ground, autotiled from its 4 neighbours | full tile |
| `=` | one-way platform (end caps picked automatically) | top 4 px, one-way |
| `/` | slope rising to the right | triangle |
| `\` | slope rising to the left | triangle |

## Tileset atlas (4 × 6 tiles)

| Rows | Content |
| --- | --- |
| 0–3 | 16 ground variants, index = mask with N=1 · E=2 · S=4 · W=8 (bit set = neighbour is ground/slope). No N bit → grass top; no E/W/S bit → that edge. Off-map sides and bottom count as ground. |
| 4 | platform: single · left end · middle · right end |
| 5 | slope `/` · slope `\` · (2 spare) |

Draw your own tileset in Aseprite on this 64×96 grid (16 px tiles), drop it in `parts/tilesets/<id>/tileset.png` with a `part.json`, and every exporter picks it up.

## Layers

- `scroll` 0..1 — 0 sticks to the camera, 1 moves with the tilemap. Sky ≈ 0.05, far ≈ 0.2, mid ≈ 0.45, near ≈ 0.75.
- `scrollY` (default 1) — vertical factor.
- Layers are bottom-aligned to the map; non-sky layers are lifted to the ground line automatically (`offsetY`) so their bottom tucks 6 px under the grass.
- `color` remaps the part's `recolorBase` hue (Easy Sprite's hue-aware recolor). `tint` multiplies toward a hex by `tintAmount` (default 0.35).
- Every background part repeats seamlessly every `loopWidth` px (480 for the samples).

## Part folders

```text
parts/backgrounds/<id>/layer.png    + part.json  { kind: "background", band, loopWidth, defaultScroll, recolorBase }
parts/tilesets/<id>/tileset.png     + part.json  { kind: "tileset", tileSize, columns, rows }
parts/props/<id>/prop.png           + part.json  { kind: "prop", defaultLayer: "back"|"front", collision?, category?, tags? }
```

`category` (optional) groups props in the editor and in `list_parts`: `building` · `street` · `nature` · `water` · `decor` (the default when missing). Building props follow the modular rules: width a multiple of `tileSize`, art that reaches both footprint edges, bottom row = ground line. Then `x += width` chains them with no gap or overlap, and the editor snaps a dragged building to its neighbours (Shift = free).

## Exits and towns (optional)

```jsonc
"exits": [{ "side": "left", "to": "world", "at": "kampung_bunga" }],   // side: left | right; to: map or scene id; at: arrival point
"town": { "kind": "malay_kampung", "id": "kampung_bunga", "map": "world", "name": { "th": "กำปงบุหงา", "en": "Kampung Bunga", "ms": "Kampung Bunga" } }
```

Both are additive to `easyscene/1` and kept through save / normalize; exits with a bad side or no `to` are
dropped with a warning. `easyscene town` / `towns --from-overworld` fill them in. A runtime (e.g. the Easy
Tilemap overworld) leaves the scene when the player walks off an exit side. Exports carry them only when a
scene has them: the Godot export writes `<id>.scene.json` next to the `.tscn`, the Pixi export adds `exits` and
`town` to `<id>.pixi.json`. Scenes without exits export byte for byte as before (`test/compat.test.ts`).

## Night exports (optional)

Night is not stored in the scene: it is derived from the day art at render / export time (`render --night`,
`export --night`, MCP `night: true`). With `--night` an export also writes the night twin next to the day files:

| Preset | Night files |
| --- | --- |
| godot | `<base>_night.tscn`, `<base>_night_tileset.tres`, `<base>_night_preview.png`, art under `night/assets/` (same `project.godot`, `camera_pan.gd`) |
| pixi | `<base>_night.pixi.json` (`"lighting": "night"`, `"day": "<base>.pixi.json"`, same tiles / collision / exits / town), `<base>_night_preview.png`, art under `night/`; the day `<base>.pixi.json` gains `"night": "<base>_night.pixi.json"` |
| png | `<base>_night_preview.png`, `<base>_night_parallax.png`, layer / tilemap / props PNGs under `night/` |

The night scene adds one front prop, `__night_glow` (a map-sized semi-transparent warm halo around every light),
and recoloured parts are baked before the night grade (`<part>__c_<colour>…` image names). Exports without
`--night` are byte for byte the same as before (`test/compat.test.ts`, `test/night.test.ts`).

## Streets (compose input only)

`compose_scene` / `compose --input` also accept `streets: [{ x?, gap?, items: [id | { part, flipX?, color?, tint?, tintAmount?, layer?, gapBefore? }] }]`. Each street is expanded into ordinary entries in `props` (left to right, `x` snapped to the grid), so the saved scene format is unchanged. CLI: `--street <x>:<id>,<id>,…` (repeatable).

**Seeded streets.** A street can also carry `generate: { set: "brick_town", seed, count?, dress? }`. It appends `count` buildings (default 8, `0` = none) picked from the set after `items` (never the same building twice in a row), and unless `dress: false` it dresses the whole row: street trees, lamp posts and hydrants on the party walls, planters beside the doors, one bus stop in front of a shop, parked cars along the curb and the `prop_city_road` strip under the full length. The same seed always gives the same street. CLI: `--gen-street brick_town@<x>:<seed>[:<count>]` (repeatable).

**`groundOffset`** (compose input only): a prop without `y` stands `groundOffset` px *below* the ground surface under its centre. The road strip uses `48` (it fills a 3-row ground below the 6 px sidewalk lip) and parked cars use `30`; both are front-layer props, so they cover the tile fill but never a character standing on the sidewalk. The saved scene keeps a plain `y`.

## Sample sets

| Set | Parts |
| --- | --- |
| Thai town | `prop_bld_noodle_shop` 128×112 · `prop_bld_mini_mart` 144×104 · `prop_bld_fruit_stall` 96×80 · `prop_bld_shophouse_2f` 112×160 · `prop_bld_shophouse_2f_closed` 112×144 · `prop_bld_shophouse_3f` 112×192 · `prop_bld_shophouse_3f_gold` 112×192 · `prop_bld_thai_house` 128×136 |
| Street | `prop_power_pole`, `prop_power_pole_end` 240×160 · `prop_flag_pole` · `prop_signpost_th` · `prop_motorbike` · `prop_street_dog` · `prop_cat` · `prop_lantern` · `prop_sign` |
| Nature / water | `prop_potted_plants` · `prop_flower_box` (front) · `prop_pier` (deck collision; height = 3 ground tiles) · `prop_canal_boat` |
| Backgrounds / tiles | `bg_far_temple_hill` · `bg_mid_tropical` · `tiles_street` (paving cap over laterite brick) |
| Brick town buildings | `prop_bld_brick_row2_red` 64 · `prop_bld_brick_row3_brown` 64 · `prop_bld_brick_row2_brown` 64 · `prop_bld_brick_row3_cream_bay` 80 · `prop_bld_brick_row4_tan` 80 · `prop_bld_brick_row3_red_bay` 80 · `prop_bld_brick_shop_red` 80 · `prop_bld_brick_shop_teal` 96 · `prop_bld_brick_shop_cream` 96 (2–4 storeys; party walls opaque from the ground to at least 108 px on both edges) |
| Brick town street | `prop_street_tree` · `prop_planter_brick` · `prop_lamp_post_city` · `prop_fire_hydrant` · `prop_bus_stop` · `prop_car_hatch_red` · `prop_car_sedan_dark` · `prop_city_road` 128×42 (front, `groundOffset` 48) |
| Brick town backgrounds / tiles | `bg_sky_bright` · `bg_far_city_spires` · `bg_mid_utility_poles` · `tiles_city_sidewalk` (pale slabs over asphalt) |

A canal is a pit that runs off the map edge: the sky layer's water band shows through it. Set a boat's `y` a few px below the ground line so it floats.


## Walk and road bounds (Pixi export)

A canal or beach is a pit of empty tiles; a `prop_pier` or `prop_fisher_hut` adds a thin deck over that pit. The Pixi export then includes:

- `walk: { minX, maxX }` — solid ground plus pier / stilt decks. Runtimes should clamp side-view walking here so the player can stand on the pier but never in open water.
- `road: { minX, maxX }` — solid ground only, not under a pier or jetty. Parked or driving vehicles stay on the road.

Landlocked streets omit both fields (byte-for-byte with older exports). `composeScene` also snaps street vehicles that were placed on a pier or in water back onto the road.
