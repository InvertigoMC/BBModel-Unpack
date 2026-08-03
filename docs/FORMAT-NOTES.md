# `.bbmodel` format research notes

These notes document the structure of Blockbench project files and the conversion rules this
extension implements. They were derived by reading the Blockbench source (the authoritative
"specification" — the format has no separate formal schema) and the Microsoft Bedrock schema
documentation, as of August 2026.

**Primary sources**

- Blockbench project codec: [`js/formats/bbmodel.js`](https://github.com/JannisX11/blockbench/blob/master/js/formats/bbmodel.js)
- Bedrock geometry codec: [`js/formats/bedrock/bedrock.js`](https://github.com/JannisX11/blockbench/blob/master/js/formats/bedrock/bedrock.js)
- Bedrock animation codec: [`js/formats/bedrock/bedrock_animation.js`](https://github.com/JannisX11/blockbench/blob/master/js/formats/bedrock/bedrock_animation.js)
- Keyframe compiler: [`js/animations/keyframe.js`](https://github.com/JannisX11/blockbench/blob/master/js/animations/keyframe.js)
- Animation controllers: [`js/animations/animation_controllers.js`](https://github.com/JannisX11/blockbench/blob/master/js/animations/animation_controllers.js)
- Bedrock geometry schema 1.12.0: [Microsoft Learn — minecraftSchema_geometry_1.12.0](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/schemasreference/schemas/minecraftschema_geometry_1.12.0)

## 1. The container

A `.bbmodel` is one JSON document (UTF-8, sometimes with a BOM). Top-level layout as written by
the current codec (`meta.format_version` `"5.0"`; older files go back to `"3.x"`):

| Key | Content |
| --- | --- |
| `meta` | `format_version` (container version, **not** a Minecraft version), `model_format` (`bedrock`, `java_block`, `free`, `bedrock_old`, …), `box_uv` |
| `name`, `model_identifier` | project name; identifier used for `geometry.<id>` (older files use `geometry_name`) |
| `resolution` | `{width, height}` texture resolution |
| `visible_box` | `[width, height, offsetY]` → Bedrock `visible_bounds_*` |
| `elements[]` | flat list of cubes / meshes / locators / null objects / texture meshes (`type`, legacy entries without `type` are cubes). Cubes: `from`, `to`, `origin` (pivot), `rotation`, `inflate`, `box_uv`, `uv_offset`, `faces.{north…down}` with `uv: [x1,y1,x2,y2]`, `texture` (index into `textures`, `null` = untextured face), per-face `rotation`, `material_name` |
| `outliner[]` | the bone tree. **≤ 4.x:** group objects appear inline (name, origin, rotation, children…). **5.0+:** group data lives in a flat top-level `groups[]` array and the outliner holds `{uuid, isOpen, children}` references; element leaves are uuid strings in both eras |
| `textures[]` | metadata + embedded image as `source: "data:image/png;base64,…"`; may instead reference `path` / `relative_path`; flipbook fields `frame_time`, `frame_order`, `frame_interpolate`; optional editing `layers[]` with `data_url` |
| `animations[]` | per animation: `loop` (`once`/`loop`/`hold`), `length`, `snapping`, Molang fields (`anim_time_update`, `blend_weight`, `start_delay`, `loop_delay`), `animators` keyed by group uuid (plus the special `effects` animator) with `keyframes[]` (`channel`, `time`, `interpolation`, `data_points[]` of `{x,y,z}` numbers **or Molang strings**, bezier handle arrays) |
| `animation_controllers[]` | `states[]` with `animations[]` (`{uuid, key, blend_value}`), `transitions[]` (`{target: state-uuid, condition}`), `on_entry`/`on_exit` scripts, blend settings, `initial_state` (a state uuid) |
| `display` | Java item/block display transforms per slot (vanilla format, copied verbatim) |
| misc | `texture_groups`, `collections`, `animation_variable_placeholders`, `reference_images`/`backgrounds`, `overrides`, `export_options`; backups add `history`, `editor_state` |

**Legacy migrations** (mirroring Blockbench `processCompatibility()`):

- missing `meta.model_format` → `bedrock_old` if `meta.bone_rig`, else `java_block`
- top-level `cubes[]` → `elements[]`
- `geometry_name` → `model_identifier`
- box-UV files older than 4.5: `shade: false` on an element means `mirror_uv: true`
- files older than 3.2 store outliner Z rotation inverted
- a file starting with `<lz>` is an LZUTF8-compressed backup (this extension detects and explains
  it rather than decoding; re-save in Blockbench)

## 2. Geometry conversion (Blockbench → Bedrock `geo.json`)

Blockbench model space mirrors Bedrock's X axis. The exporter therefore rewrites:

| Bedrock output | Formula |
| --- | --- |
| cube `origin` | `[-to.x, from.y, from.z]` (`-(from.x + size.x)` in Blockbench code) |
| cube `size` | `to - from` |
| cube `pivot` (only when rotated) | element `origin` with X negated |
| cube `rotation` | `[-x, -y, z]` |
| bone `pivot` | group `origin` with X negated |
| bone `rotation` | `[-x, -y, z]` |
| locator value | `position` with X negated; `{offset, rotation: [-x,-y,z], ignore_inherited_scale}` when rotated; null objects use a `_null_` name prefix |

UV: box-UV cubes write `uv: uv_offset` (plus `mirror` when the cube differs from the bone's
`mirror_uv`); per-face cubes write `uv: {face: {uv: [x1,y1], uv_size: [x2-x1, y2-y1]}}` with the
**up/down faces flipped to the opposite corner** (`uv += uv_size; uv_size *= -1`), and omit faces
whose `texture` is `null`. Per-face `rotation` becomes `uv_rotation`.

Structure: root-level loose elements are collected into a synthetic `bb_main` bone; `parent` is
set only when the parent is a group; `export: false` groups are skipped unless they still have
exported descendants. `format_version` is `1.12.0`, raised to `1.16.0` if any bone uses
`bedrock_binding` and `1.21.0` if any face uses UV rotation.

Description block: `identifier: "geometry." + (model_identifier || geometry_name || "unknown")`,
`texture_width/height` from `resolution`, `visible_bounds_width/height` and
`visible_bounds_offset: [0, y, 0]` from `visible_box`.

**Not representable:** free-form meshes (Bedrock's `poly_mesh` is experimental and Blockbench does
not export it) — the extractor counts and reports them in a warning.

## 3. Animation conversion

File wrapper: `{format_version: "1.8.0", animations: {<name>: …}}`.

- `loop`: `"loop"` → `true`, `"hold"` → `"hold_on_last_frame"`, `"once"` → omitted.
- Keyframe keys are timecodes snapped to the animation's `snapping` grid (1–120 fps, default 24),
  trimmed to 4 decimals, always with a decimal part (`"1.0"`).
- Values: numbers and numeric strings become numbers; other strings are Molang and stay strings
  (newlines stripped). **Position X and rotation X/Y are negated on export** (the imports invert
  them, so `.bbmodel` stores the Blockbench-space values). For Molang, Blockbench rewrites the
  expression term-by-term; this extension wraps it as `-(expr)` — semantically identical, flagged
  in a warning.
- `catmullrom` keyframes emit `{pre?, post, lerp_mode: "catmullrom"}` (`pre` when the keyframe is
  first-but-not-at-zero or follows a non-catmullrom keyframe).
- A keyframe **after a `step` keyframe** emits `{pre: <held value>, post: <new value>}` — that is
  how Bedrock represents the jump.
- Two-data-point keyframes emit `{pre, post}`.
- Bezier interpolation does not exist in Bedrock: segments touching a bezier keyframe are baked
  into sampled keyframes on the snapping grid (cubic curve sampled like Blockbench does).
- A channel with a single simple keyframe collapses to a bare value; uniform scale collapses to a
  single number.
- Effect animator: `sound_effects` / `particle_effects` (`{effect, locator?, bind_to_actor: false?,
  pre_effect_script?}`) and `timeline` (script lines, `;`-terminated unless they start with `/`).

## 4. Animation controllers

File wrapper: `{format_version: "1.19.0", animation_controllers: {<name>: …}}` (matching
Blockbench). `initial_state` is omitted when the initial state is named `default`. States write
`animations` (string key or `{key: blendExpression}`), `transitions` as
`[{<targetStateName>: condition}]` (uuid resolved to the state's name), `on_entry`/`on_exit`
Molang lines, `blend_transition` (number or curve object) and `blend_via_shortest_path`.

## 5. Textures

Embedded textures are byte-exact PNGs after base64 decoding — no image processing is involved.
Flipbook settings map approximately to Java `.mcmeta` (`frametime`, `frames`, `interpolate`).
Editor-side flags like `particle` and `render_mode` stay in the `.bbmodel` (they have no extracted
counterpart). Textures that exist only as `path` references are reported; `relative_path`
references are resolved next to the model and copied when present.
