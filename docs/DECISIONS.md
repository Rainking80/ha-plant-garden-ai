# Decisions

Short records of decisions that are not obvious from the code. Newest last.

## D-001 Minimum Home Assistant version 2026.9.0 (2026-11-08)

**Context.** The plan called for "current minus about six months" (2026.5). HA 2026.9
replaced voluptuous with `probatio` as its validation engine; HA aliases `import
voluptuous` to probatio for backwards compatibility, and type hints such as
`ConfigFlow.async_show_form(data_schema=...)` now expect probatio types.

**Decision.** Support HA ≥ 2026.9.0 and use `import probatio` everywhere.

**Alternatives.** Keep `import voluptuous` for 2026.5–2026.8 compatibility: works at
runtime through the alias, but mypy fights the types on every schema and the alias is
a compatibility shim that will eventually go away. Rejected.

## D-002 One garden per installation (2026-11-08, revised in M1)

`single_config_entry: true`. One panel, one data set. Data is **not** keyed by the
config entry id: removing and re-adding the integration must not orphan years of
photos. Should multiple gardens ever be needed, a `garden_id` will be introduced
with a migration.

## D-003 Development on WSL2 / devcontainer, venv outside the repo (2026-11-08)

Home Assistant and `pytest-homeassistant-custom-component` do not run on Windows. The
repo lives on a Windows drive, so the venv sits in `~/.venvs/ha-plant-garden` (ext4)
for speed. Node is installed per user in WSL; nothing is installed system-wide.

## D-004 Frontend bundle is committed (2026-11-08)

HACS installs the repository content as is; there is no build step on the user's
machine. The Vite build output in `custom_components/plant_garden/frontend/` is
committed and CI fails if it does not match the sources. Cache busting uses a content
hash of the bundle, so a rebuilt bundle is picked up even without a version bump.

**Alternative.** `zip_release` with a CI-built asset: cleaner git history, but
installing a branch or commit through HACS would then ship without a frontend.

## D-005 Version lives in manifest.json (2026-11-08)

`manifest.json` is the single source of truth; `frontend/package.json` and
`pyproject.toml` must match (`scripts/check_versions.py`, enforced in CI and on
release). The panel reads the version from the backend (`plant_garden/info`), so there
is no separate frontend constant.

## D-006 No HA-internal frontend components (2026-11-08)

Custom panels cannot rely on `ha-*` elements being loaded. The panel uses its own
elements, inline MDI SVG paths (`@mdi/js`) and HA theme CSS variables.

## D-007 Brand icons inside the integration (2026-11-08)

HA's `brands` integration serves `brand/icon.png` etc. from a custom integration
(verified in HA 2026.10 source). Older HA versions simply show the generic
placeholder; no submission to the home-assistant/brands repository is needed.

## D-008 Panel visible to all users (2026-11-08)

The garden is a household tool, so `require_admin=False`. Admin-only functions
(settings, API keys, costs) will be protected per WebSocket command with
`require_admin`. Every authenticated user may create, edit and delete plants.

## D-009 Store for plants, SQLite for growing records (2026-11-08)

Plants are few and edited as a whole → HA `Store` (JSON, versioned). Photos and
measurements grow without bound and are queried per plant and in aggregate (photo
count, latest size) → SQLite in WAL mode under `<config>/plant_garden/`, schema
versioned with `PRAGMA user_version`. Later time series (irrigation events, weather,
water balance, AI usage) go into the same database. The recorder database is not
used: it belongs to HA and is purged.

## D-010 Photo pipeline (2026-11-08)

The browser reads the EXIF capture time and downsizes large photos before upload
(phones produce 5–10 MB files). The server never trusts the client: it decodes with
Pillow, rejects unknown formats and huge pixel counts, applies EXIF orientation,
writes three variants **without any metadata** (GPS must not leak into backups or
AI requests) and names files by generated ULIDs only. Preset photo tags
(`development`, `problem`, `flowering`, `harvest`) are stored language-neutral
because later features (problem diagnosis) rely on them.

## D-011 Photo downloads: signed URLs, 403 instead of 401 (2026-11-08)

`<img>` cannot send an Authorization header, so photo URLs are signed with
`async_sign_path` (24 h). HA counts a 401 as a failed login; a panel left open
overnight would then request expired URLs and could get its own IP banned when
IP banning is configured. The file view therefore checks authentication itself
(like HA's brands integration): 401 only when a bad bearer token was sent, 403
otherwise. The panel also refreshes data older than one hour every 15 minutes and
when the tab becomes visible.

## D-012 Edits send only changed fields (2026-11-08)

Every field the backend receives is recorded with source `user`. The form therefore
sends only fields that changed; otherwise saving a plant would silently turn all
AI suggestions (M6) into "entered by you".

## D-013 Integration via HACS, not a Home Assistant app (2026-11-08)

**Context.** A second design proposed a Home Assistant app (add-on) with ingress,
FastAPI backend, `/data/garden.json` and photos in `/media`.

**Decision.** Stay a custom integration distributed via HACS.

**Reasons.** HACS was a requirement, and apps cannot be installed through HACS. Apps
only run on HA OS / Supervised; integrations run on every installation type. Plants
as entities with long-term statistics, a to-do list, actions and events are native
to an integration; an app would need MQTT discovery as a workaround. The app's
advantages (own process, ingress auth for images) are covered by executor jobs and
signed URLs (D-011).

**Adopted from the proposal:** georeferenced coordinates, official aerial imagery
via WMS, view/edit modes, sensor markers, timer remaining time, Pl@ntNet organs and
attribution, to-do list import, GPS position suggestion, plan before AI.

## D-014 AI: HA AI Task plus a few direct providers (2026-11-08)

`ai_task.generate_data` accepts image attachments and a `structure`, but returns only
`conversation_id` and `data` – no token usage (checked in HA 2026.10 source). Using
it exclusively would make the requested token/cost page impossible.

**Decision.** Offer HA AI Task as the zero-configuration option (costs shown as
unknown) and direct providers with exact usage tracking: one OpenAI-compatible
implementation (OpenAI, OpenRouter, Ollama, …), Anthropic, Gemini, plus Pl@ntNet for
identification. Fewer providers than originally planned, each one tested with
fixtures. Photos reach `ai_task` through an own media source platform (it only needs
a local path), so they stay in `<config>/plant_garden/`.

## D-015 Irrigation zones are display and tracking only (2026-11-08)

No start/stop buttons in the plan for now; the integration never switches anything.
Starting zones via a user-chosen script is listed as a later candidate.

## D-016 Garden plan before AI (2026-11-08)

The plan is the centrepiece and gives visible value without any API key; the AI
milestone depends on keys and provider terms (Pl@ntNet third-party use) that are
being clarified. New order: M2 plan editor, M3 backgrounds and markers, M4 zones,
M5 weather and water balance, M6 AI, M7 assistant, M8 release.

## D-017 Plan coordinates (2026-11-08)

Origin is `zone.home`, stored when the plan is created so that moving "home" later
does not shift the garden; the user can move it explicitly (D-022). Units are
metres, x east, y south (SVG direction), the plan is north-up. The viewport (centre and width in metres) is stored per device,
not with the garden, so a wall tablet and a phone do not fight over it; it never
changes object positions.

## D-018 Aerial imagery: verified state services only (2026-11-08)

Presets are added only after three checks: `GetCapabilities` lists the layer, a
real `GetMap` in EPSG:3857 returns an image, and the attribution matches the licence
text in the capabilities. 12 states passed (BB/BE, BY, BW, HB, HE, MV, NI, NW, RP,
SL, SH, TH). Saxony (licence only behind a generic terms page), Saxony-Anhalt (no
licence stated) and Hamburg (404) are not presets; any WMS can be added by hand.
The browser loads images directly (no proxy, no CORS needed for `<image>`); the
service therefore sees the viewed area, which the dialog states. Licences asking
for the "year of retrieval" get the current year.

## D-019 Replaced background images are deleted on the next start (2026-11-08)

Deleting the old file immediately would break undo in the panel. Unused files in
`<config>/plant_garden/backgrounds/` are removed when the integration starts.

## D-020 Photo GPS only as a suggestion (2026-11-08)

The browser reads GPS from JPEG EXIF to offer "place where the photo was taken"
(within 1 km of home). The position is stored only if the user accepts; the GPS
data itself is never stored (the server strips all metadata).

## D-021 The canvas ignores unrelated Home Assistant updates (2026-11-08)

HA passes a new `hass` object on every state change in the house. The canvas only
re-renders when the language changes; marker values arrive as a separate `states`
object that changes only when one of the marker entities changes.

## D-022 The garden's location can be moved; the plan reaches 10 km (2026-11-08)

Not every garden is at Home Assistant's home location (allotments, a second
property), and drawing far from the origin failed with a raw schema error.
`layout/set_origin` moves the origin. By default every stored coordinate is
reprojected so that everything keeps its place on the map (the panel keeps the
view on the same spot); with `move_content` the coordinates stay and the drawing
travels with the origin. Undo moves it back.

Plan coordinates stay limited to ±10 km (`PLAN_EXTENT_M`): the plan uses one
Mercator scale factor for the whole garden, which is exact at the origin and off
by about 0.3 % at 10 km north or south. If reprojecting would push anything past
the limit, nothing changes and the backend answers `out_of_range`. The panel checks
the limit before saving and explains it; in edit mode it offers "move location
here" once the view is more than 1 km away (photo GPS suggestions also stop there).

## D-023 Irrigation zones are shapes of kind `zone` (2026-11-08)

A zone needs everything a drawn area has (rectangle, circle or polygon, moving,
handles, undo, locking, label), so it is a `Shape` with `kind: "zone"` and an
`irrigation` block (linked entity, optional timer and water meter, emitter type,
rate, efficiency, manual include/exclude). It is drawn in its own layer between
the areas and the plants and can be hidden per device. Circle sectors for
sprinklers with a spray angle are not built yet; a polygon covers them.

Rates: `rate_mm_h` (precipitation rate over the zone) or `flow_l_min` (spread over
the zone area, `PR = Q · 60 / A`); drippers (`drip`) use litres per hour per plant.
Default application efficiencies: rotor 75 %, spray 65 %, drip line 85 %, drippers
90 %, by hand 80 % (sprinklers about 75 % and drip about 90 % after FAO, Irrigation
Water Management Training Manual 4; spray heads lose more to wind and evaporation
than rotors). Every value can be overridden per zone.

Alternatives: a separate zone list with its own editor (duplicates all geometry
editing), zones as a property of beds (one bed often has several zones and vice
versa).

## D-024 How a zone run turns into water per plant (2026-11-08)

- **Footprint** of a plant: the areas linked to it (lawn, hedge …), otherwise its
  crown circle at its position. Plants without either, and removed plants, get no
  water from zones.
- **Coverage**: the share of the footprint inside the zone, from a 16 × 16 grid of
  sample points (backend `geometry.py` and panel `util/coverage.ts` use the same
  grid, so the plan shows what the backend counts). Included plants count fully,
  excluded ones not at all. Overlapping zones add up.
- **Area zones**: depth = delivered litres × efficiency / zone area; a plant gets
  depth × its share, in litres over its footprint area. **Drippers**: each reached
  plant gets its drippers' litres × efficiency.
- **Delivered litres**: rate × run time, or the difference of the zone's water meter
  (litres or m³) at start and end. The meter is only used for runs seen live; runs
  found in the recorder history and runs where the meter went backwards fall back
  to the estimate. A zone without any rate records the run time only.
- **Runs**: `on`, `open` and `opening` count as running. Switching for less than
  5 s is ignored (test clicks). `unavailable`/`unknown` ends a run as "uncertain".
  A run counts for the local day it started on. Open runs survive restarts; on
  start the recorder history since the last check fills gaps, each zone run is
  stored once (`zone_id`, start) so repeated catch-ups cannot double count.
- A run longer than the configured limit (option, default 6 h) raises a repair
  issue that disappears when the zone stops. The integration never switches.

## D-025 Plant and zone devices; watering is logged per device (2026-11-08)

Every plant and every zone is a device below a "garden" service device, linked
with `via_device_id` (HA 2026.9+ deprecates `via_device`). Devices and their
sensors appear and disappear with plants and zones; the entity name comes from
the device (plant name, zone label or the linked entity's name). M4 adds the
irrigation sensors only (water received in L as `total_increasing` for long-term
statistics, water today in mm, last watering; zone run time and litres today);
the other per-plant sensors from the spec follow with the features they report
on (water balance in M5, tasks and problems in M7).

The action `plant_garden.log_watering` targets devices (plants: litres each, zones:
minutes), because automations know devices, not internal plant ids.
