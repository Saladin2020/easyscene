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
  "character": { "sheet": "/path/to/easysprite_side.png", "x": 96 }   // optional, previews only
}
```

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

## Streets (compose input only)

`compose_scene` / `compose --input` also accept `streets: [{ x?, gap?, items: [id | { part, flipX?, color?, tint?, tintAmount?, layer?, gapBefore? }] }]`. Each street is expanded into ordinary entries in `props` (left to right, `x` snapped to the grid), so the saved scene format is unchanged. CLI: `--street <x>:<id>,<id>,…` (repeatable).

## Sample sets

| Set | Parts |
| --- | --- |
| Thai town | `prop_bld_noodle_shop` 128×112 · `prop_bld_mini_mart` 144×104 · `prop_bld_fruit_stall` 96×80 · `prop_bld_shophouse_2f` 112×160 · `prop_bld_shophouse_2f_closed` 112×144 · `prop_bld_shophouse_3f` 112×192 · `prop_bld_shophouse_3f_gold` 112×192 · `prop_bld_thai_house` 128×136 |
| Street | `prop_power_pole`, `prop_power_pole_end` 240×160 · `prop_flag_pole` · `prop_signpost_th` · `prop_motorbike` · `prop_street_dog` · `prop_cat` · `prop_lantern` · `prop_sign` |
| Nature / water | `prop_potted_plants` · `prop_flower_box` (front) · `prop_pier` (deck collision; height = 3 ground tiles) · `prop_canal_boat` |
| Backgrounds / tiles | `bg_far_temple_hill` · `bg_mid_tropical` · `tiles_street` (paving cap over laterite brick) |

A canal is a pit that runs off the map edge: the sky layer's water band shows through it. Set a boat's `y` a few px below the ground line so it floats.
