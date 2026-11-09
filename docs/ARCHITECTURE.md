# Architecture

Status: **M8 in progress** (diagnostics, backup platform, repairs and the user
guide are done; screenshots and the 0.1.0 release wait for the user's review of
M2 to M7 in a real browser and a live test of M6/M7 with real API keys).
This document describes what exists today and is updated with every milestone.
The target picture is in [AGENT_SYSTEM_PROMPT.md](AGENT_SYSTEM_PROMPT.md).

## Overview

```
Browser (HA frontend)                              Home Assistant core
┌──────────────────────────────────┐  WebSocket   ┌─────────────────────────────────────────┐
│ <plant-garden-panel>  (Lit)      │ ───────────▶ │ websocket_api.py   plant_garden/*        │
│  ├ GardenStore (list + live sub) │ ◀─ events ── │        │                                 │
│  ├ pg-plants-view                │              │        ▼                                 │
│  └ pg-plant-detail               │  HTTP POST   │ garden.py  GardenManager ──┬─ storage.py │ HA Store (JSON)
│      ├ upload (prepareImage) ────┼────────────▶ │ http.py    upload / file   ├─ database.py│ SQLite
│      └ <img src=signed URL> ─────┼────────────▶ │                            └─ photos.py  │ files
└──────────────────────────────────┘              │ panel.py   static path + sidebar panel  │
                                                  └─────────────────────────────────────────┘
```

## Backend (`custom_components/plant_garden/`)

| Module | Responsibility |
|---|---|
| `__init__.py` | `async_setup`: static path, HTTP views, WebSocket commands (once per HA run). `async_setup_entry`: creates the `GardenManager` (DB errors → `ConfigEntryNotReady`), registers the panel. `async_unload_entry`: removes the panel, flushes and closes storage. |
| `config_flow.py` | One step: garden name. `single_config_entry` limits it to one garden. Options: warning limit for long zone runs; AI: provider for photos and for text, monthly budget (warn at 80 %, optionally stop), USD → EUR rate, debug log (store prompts), log retention. Subentry types `weather` and `ai` (`ai/flow.py`). |
| `models.py` | Dataclasses and enums: `Plant` (with per-field provenance `sources`, plan `position`, `crown_diameter_m` and the care profile `care_water` / `care_fertilize` / `care_prune`), `AgeReference`, `Photo`, `Measurement`, `Point`, `Shape`/`ShapeKind`, `GeoPoint`, `Layout`. Explicit `as_dict`/`from_dict`. |
| `garden.py` | `GardenManager`: the only way to read or change data. Validates/normalises fields, records provenance, coordinates Store + SQLite + files, sets the plan origin from `zone.home` once (moving it later reprojects everything), notifies subscribers (`GardenChange` with `kind` plant / plant_removed / layout). |
| `storage.py` | `GardenStore` (HA `Store`, key `plant_garden.garden`, version 1.2 with step-wise migrations; 1.2 added the layout). Holds plants and layout. Writes are delayed by 2 s to batch edits. |
| `database.py` | `GardenDatabase`: SQLite in WAL mode, schema migrations via `PRAGMA user_version`. Tables `photos`, `measurements`. Blocking; always called through the executor; a lock serialises access. |
| `photos.py` | `process_image` (Pillow, executor): validates format/pixel count, reads EXIF capture time, applies EXIF orientation, strips all metadata, renders `original` (≤2560 px JPEG), `medium` (1024 px WebP), `thumb` (360 px WebP). `process_background` (≤4096 px JPEG). `PhotoFiles` / `BackgroundFiles` write atomically; IDs must be ULIDs (no path tricks). |
| `http.py` | `POST /api/plant_garden/photos` (multipart: plant_id, file, taken_at, tags, note; 20 MB limit), `GET /api/plant_garden/photos/{id}/{variant}`, `POST /api/plant_garden/backgrounds`, `GET /api/plant_garden/backgrounds/{id}`; file views check auth themselves (see D-011). |
| `serialize.py` | JSON shapes for the panel; signs photo URLs (`async_sign_path`, 24 h). |
| `websocket_api.py` | Commands below; `garden_command` decorator maps `NotFoundError` → `not_found`, `ValueError` → `invalid_format`, missing entry → `not_loaded`. |
| `panel.py` | Serves `frontend/` under `/plant_garden_static`, registers the panel with a content-hash cache buster. |
| `geometry.py` | Point-in-shape, areas and bounds of all geometry types (also sprinkler sectors and drip lines), footprints of plants (linked areas or crown circle), zone coverage on a 16 × 16 sample grid (same as the panel's `util/coverage.ts`) and `precipitation_rate` of a zone (rate, flow per metre of a drip line, or flow over the area). |
| `irrigation.py` | `IrrigationTracker`: follows the entities linked to zones (`async_track_state_change_event`), persists open runs (Store `plant_garden.irrigation`), fills gaps from the recorder history on start, ignores runs under 5 s, marks runs ended by `unavailable` as uncertain, raises a repair issue for runs longer than the option `max_runtime_hours` and one for zones whose linked entities no longer exist (checked once HA has started and on layout changes), fires `plant_garden_irrigation_finished`. `distribute` turns a run into litres per plant (D-024). Zones on one valve that share a water meter split its reading by their estimated flow (D-036). Keeps the water summary for the panel and the sensors. |
| `sensor.py` | Sensors per plant (water received in L `total_increasing`, water today, last watering, soil water deficit), per zone (run time and litres today, recommended run time) and for the garden (ET₀ today, rain today, rain tomorrow, AI cost this month, AI tokens this month, AI requests today); per plant also open tasks and health (disabled by default). |
| `services.py` | Actions `plant_garden.log_watering` (plant devices: litres each; zone devices: minutes), `plant_garden.refresh_weather`, `plant_garden.identify_plant` (newest photos of a plant device, optional response), `plant_garden.ask_assistant` (answer as response), `plant_garden.create_task` and `plant_garden.add_photo` (file in an allowed folder or camera snapshot). |
| `et0.py` | FAO-56 Penman-Monteith (daily, with FAO fallbacks for missing humidity, wind, radiation) and Hargreaves-Samani; tested against the FAO-56 worked examples. |
| `water_balance.py`, `water_defaults.json` | Soil water bucket per plant (TAW, RAW, K, effective rain, shelter by roofs), defaults with sources (D-026). |
| `weather/` | Sources: `open_meteo.py`, `bright_sky.py` (hourly to daily), `home_assistant.py` (statistics + `weather.get_forecasts`); `base.py` `DailyWeather` with per-value merging. |
| `water.py` | `WaterCoordinator` (DataUpdateCoordinator, hourly): fetches all weather subentries (own sensors first), merges, fills ET₀, stores the days, recomputes every plant's bucket (also 3 s after plant, layout or irrigation changes) and its outlook over the 7 forecast days (`water_balance.outlook`: watering days with the forecast rain, D-037), frost warnings (3 days) and zone advice; notifies `water`. |
| `entity.py`, `binary_sensor.py` | Device handling shared by the platforms; binary sensors "needs water" and "problem" (plant) and "irrigation recommended" (zone). |
| `ai/base.py` | Provider contract: `AIRequest` (system, messages with images, JSON schema, max output tokens, feature, plant), `AIResponse`, normalised `Usage` (input without cache, cache read, cache write, output, reasoning, images), `AIError`/`AuthError`/`BudgetExceededError`. |
| `ai/http.py` | Plain aiohttp with HA's session: timeout, 2 retries on 429/5xx honouring `Retry-After` (max 30 s), 401/403 → `AuthError`. |
| `ai/providers/` | `anthropic.py` (Messages API, structured output, prompt caching), `openai_compat.py` (OpenAI, OpenRouter, Ollama, LM Studio, any compatible URL; presets), `gemini.py` (generateContent, response schema), `ha_ai_task.py` (`ai_task.generate_data` with photos as media-source attachments; HA reports no tokens), `plantnet.py` (species candidates, no retries because failed calls cost credits). Each maps its usage fields to `Usage` (D-027); the three HTTP language models also stream (`async_stream`, server-sent events via `http.async_stream`). |
| `ai/pricing.py`, `ai/pricing_defaults.json` | Prices per provider kind and model (USD per million tokens, as of 2026-11-08, with sources), prefix match for dated model ids, user overrides, cost of a call, rough estimate before a call. |
| `ai/schemas.py`, `ai/prompts/` | Strict JSON schema of an identification and its cleaning; versioned prompts (`identify-1`) in German and English. |
| `ai/service.py` | `AIService`: builds providers from subentries, budget check before every call, usage log, one JSON repair retry, Pl@ntNet first then the language model with the candidates, suggestions per field (never over user values), accept/reject, usage summary, daily purge of old log rows, status per provider (Store `plant_garden.ai`); a rejected key raises the repair issue `ai_auth_<subentry>` until the next successful call or test. |
| `ai/flow.py` | Subentry flow `ai`: Home Assistant AI task entity, OpenAI-compatible (preset, URL), Anthropic, Gemini or Pl@ntNet; the key is tested before saving, then the model is picked from the provider's list. |
| `media_source.py` | Media source `plant_garden`: plant photos (medium WebP) for `ai_task` attachments and HA's media browser. |
| `websocket_ai.py` | The `ai/*` and `tech/info` commands below. |
| `care.py` | `CareManager` and `CareTables` (SQLite schema 5): tasks (kinds, due date, repetition counted from completion, season months), problems with a log, questions of the assistant, chat history. Fires `plant_garden_task_due` (daily at 07:00 and at start, once per due date) and `plant_garden_problem_detected`; a photo tagged `problem` opens a problem or joins the active one (photo hook of the manager). Keeps per-plant counts for the plan and the sensors. No AI in here (D-029). |
| `todo.py` | To-do entity "Garden tasks": the tasks both ways ("Plant: title" links to a plant; ticking off completes and repeats). |
| `ai/context.py` | Compact, deterministically shortened JSON context per feature budget (D-030). |
| `ai/assistant.py` | `Assistant`: diagnosis of a problem (photos + context, follow-up photo task), tips with tasks to take over and questions, chat with streaming, opt-in weekly check (Mondays 08:00), photo comparison (by hand or after an upload, opens a problem when needed, D-040); tips and comparisons in Store `plant_garden.assistant`. Commands `assistant/compare`, `assistant/comparison`. |
| `alerts.py` | `garden_alerts` (rules: frost, heat, storm, heavy rain, fungal weather, slug weather) and `AlertNotifier` (recomputes after every water update, notifies new warnings once per kind: notification + event `plant_garden_weather_alert`; Store `plant_garden.alerts`). The current warnings go along with `water/summary` (D-039). |
| `ai/prompts/assistant.py` | Versioned prompts (`diagnose-1`, `tips-1`, `chat-1`, `digest-1`) in German and English with the shared rules of spec 6.4. |
| `diagnostics.py` | Config entry diagnostics: counts, options, subentries, storage, weather and AI status, recent AI errors; keys, coordinates, URLs, entity ids and prompts redacted. |
| `backup.py` | Backup platform: `async_pre_backup` checkpoints SQLite and saves the Store. |
| `websocket_care.py` | The `care/*`, `tasks/*`, `problems/*`, `questions/*` and `assistant/*` commands below; the chat is a subscription. |
| `ai/research.py`, `ai/wikipedia.py`, `ai/prompts/research.py`, `websocket_research.py` | `Researcher` (D-038): plant knowledge by web research (provider `async_research`: Claude web search, Gemini grounding, OpenRouter web plugin) or a Wikipedia article, put in order by a second structured call; opt-in schedule checked hourly, queue of plants without knowledge, failed plants wait 3 days; Store `plant_garden.research`. Commands `research/summary`, `research/run`, `research/delete`, `research/schedule` (admin). |
| `runtime.py` | `PlantGardenData` (manager, irrigation tracker, water coordinator, AI service) in `entry.runtime_data`; `get_manager`, `get_irrigation`, `get_water`, `get_ai`. |
| `brand/` | `icon.png`, `icon@2x.png` (generated by `scripts/generate_brand.py`). |

Validation uses `probatio` (HA's replacement for voluptuous since 2026.9).

### Data locations

| What | Where |
|---|---|
| Plants, plan origin, shapes, background settings, markers | `.storage/plant_garden.garden` (version 1.3) |
| Uploaded plan backgrounds | `<config>/plant_garden/backgrounds/<id>.jpg` (unused ones removed at start, D-019) |
| Photos and measurements (metadata), irrigation events and water per plant | `<config>/plant_garden/plant_garden.db` (schema 2) |
| Running zones, history checked up to | `.storage/plant_garden.irrigation` |
| Daily weather (merged, past days) | `<config>/plant_garden/plant_garden.db` table `weather_daily` (schema 3) |
| Weather sources | config subentries of type `weather` |
| AI providers (with their keys) | config subentries of type `ai` (keys never leave the backend; the panel and diagnostics see them masked) |
| AI usage log and daily totals | `<config>/plant_garden/plant_garden.db` tables `ai_usage`, `ai_usage_daily` (schema 4); rows older than the retention are folded into the daily totals |
| Own prices, last identification per plant, provider status | `.storage/plant_garden.ai` |
| Tasks, problems and their log, questions, chat | `<config>/plant_garden/plant_garden.db` tables `tasks`, `problems`, `problem_log`, `questions`, `chat` (schema 5) |
| Latest tips per plant and for the garden | `.storage/plant_garden.assistant` |
| Image files | `<config>/plant_garden/photos/<plant_id>/<photo_id>{.jpg,.medium.webp,.thumb.webp}` |

Nothing is keyed by config entry id: removing and re-adding the integration keeps the garden.

### WebSocket API (`plant_garden/…`)

| Command | Purpose |
|---|---|
| `info` | entry id, garden name, version, admin flag |
| `subscribe` | events `{kind, plant_id, shape_id}` on every change, kind one of plant, plant_removed, layout, irrigation, water, ai; clients refetch |
| `plants/list` | all plants incl. `age_months_now`, `photo_count`, `cover` (signed URLs), latest `height_cm`/`width_cm` |
| `plants/get` | plant + photos (newest first) + measurements (oldest first) |
| `plants/create`, `plants/update` | fields as in `models.EDITABLE_FIELDS`; every field sent is recorded with source `user` |
| `plants/delete` | also deletes photos (rows and files) and measurements |
| `plants/set_cover` | photo must belong to the plant; `null` = newest photo |
| `photos/update`, `photos/delete` | tags, note, taken_at |
| `measurements/add`, `measurements/update`, `measurements/delete` | height and/or width in cm; editing an AI estimate turns it into a user value |
| `plants/move` | set or clear the plan position of up to 1000 plants in one save |
| `layout/get` | origin (lat/lon) and shapes in drawing order (z) |
| `layout/shapes/save` | create or replace a shape; the client may choose the id (ULID) so that undoing a delete restores the same element |
| `layout/shapes/delete` | |
| `layout/set_background` | `{type: none}`, `{type: wms, preset \| url+layers+attribution, opacity}` (https only) or `{type: image, image_id, width_px, height_px, x, y, width_m, rotation, opacity}`; returns the layout, image backgrounds with a signed `url` |
| `layout/markers/save`, `layout/markers/delete` | entity markers `{id?, entity_id, x, y, label}` |
| `layout/set_origin` | `{latitude, longitude, move_content?}` moves the garden's location; without `move_content` all coordinates are reprojected so everything keeps its place on the map (error `out_of_range` if something would end up beyond 10 km); returns the layout |
| `irrigation/summary` | water per plant (today, total, last watering, last 14 days) and per zone (run time and litres today incl. a run in progress, last run, running since) |
| `irrigation/events` | newest events, optionally of one zone (`zone_id`) or reaching one plant (`plant_id`), with litres and mm per plant |
| `irrigation/log` | watering by hand: `{plants: [{plant_id, liters}], at?, note?}` |
| `irrigation/log_zone` | a zone run that was not seen: `{zone_id, minutes, end?}`; the same start twice is refused |
| `irrigation/delete` | removes an event and its water |
| `water/summary` | `configured`, source status, weather of the last 14 days and the forecast (with ET₀ method), soil water per plant (deficit, TAW, RAW, soil, needs water, frost, 14 days of the bucket, `outlook`: today and the forecast days with depletion and whether to water), advice per zone |
| `water/refresh` | fetches the weather now and returns the summary |
| `ai/status` | is a provider set up for photos, is Pl@ntNet there, display currency |
| `ai/estimate` | rough cost of an identification with n photos |
| `ai/identify` | `{plant_id, photos: [{photo_id, organ}]}` (1–3); errors `ai_error`, `budget_exceeded` |
| `ai/identification`, `ai/decide` | last result of a plant with its suggestions; take over or dismiss one (`{key, accept}`) |
| `ai/test` (admin) | test the connection of one provider |
| `ai/usage/summary`, `ai/usage/log` (admin) | totals today, month, overall; breakdowns by provider, model, feature, plant; cost per day and model; single calls with filters and paging |
| `ai/pricing/get`, `ai/pricing/set` (admin) | price table with sources; own price per model (`null` removes it) |
| `tech/info` (admin) | version, storage, entities, weather source status, providers (masked keys) |
| `care/summary` | per plant: open and overdue tasks, pruning due, active problem, open questions; garden totals |
| `tasks/list`, `tasks/create`, `tasks/update`, `tasks/complete`, `tasks/reopen`, `tasks/delete` | tasks of a plant or the garden (open and done in the last 30 days); `complete` answers with the next occurrence of a repeating task |
| `problems/list`, `problems/get`, `problems/create`, `problems/update`, `problems/log`, `problems/add_photo`, `problems/delete` | problems with their log |
| `problems/diagnose` | AI diagnosis (errors `ai_error`, `budget_exceeded`) |
| `questions/list`, `questions/answer` | questions of the assistant; answer or `dismiss` |
| `assistant/tips`, `assistant/tips/create`, `assistant/tips/decide` | last tips, new tips (AI), take a proposed task over or dismiss it |
| `assistant/chat` | subscription: `{delta}` events, then `{done, message}` or `{error, code}` |
| `assistant/chat/history`, `assistant/chat/clear` | conversation of a plant or the garden (last 200 messages kept) |

Plan coordinates are metres east (x) and south (y) of the origin (D-017, D-022),
at most 10 km (`const.PLAN_EXTENT_M`); `geo.py` mirrors the panel's projection
helpers in `util/wms.ts`. Shape
geometry is one of `rect` (centre, width, height, rotation in degrees clockwise),
`circle` (centre, radius), `polygon` (3–500 points), `sector` (a sprinkler:
position, reach, compass bearing of the arc's first edge and its angle, 360 for a
full circle) or `line` (a drip line: 2–500 points and the width of the wetted
strip), validated in `websocket_api.GEOMETRY` (D-036). Deleting a plant unlinks shapes that referenced it.

### Photo flow

1. Browser: `prepareImage` reads the EXIF capture time (`util/exif.ts`), downsizes to ≤2560 px and re-encodes as JPEG when needed (also converts HEIC where the browser can decode it).
2. `POST` multipart with `taken_at` → `GardenManager.async_add_photo` → `process_image` in the executor → files → SQLite row → change event.
3. Capture time priority: EXIF in the uploaded file → `taken_at` from the browser → upload time. Naive EXIF times are interpreted in the HA time zone; everything is stored in UTC.

## Frontend (`frontend/`)

- TypeScript (strict) + Lit 3, built by Vite 8 in library mode into **one ES module** in `custom_components/plant_garden/frontend/` (≈71 KB gzip).
- Routing: HA passes `route.path`; `""` → garden plan, `/plan/<id>` → plan centred on a plant, `/plants` → plant list, `/plants/<id>` → detail, `/water` → water and weather (`views/water-view.ts`: rain/ET₀ chart with forecast, soil water of every plant, zone advice, source status, refresh; a setup hint without sources), `/tech` → tech page (admins). Tabs switch between the views; "back" from a plant returns to whichever was used last. Navigation uses `history.pushState` + `location-changed`, so the browser back button and deep links work.
- Garden plan (`views/garden-view.ts` + `components/garden-canvas.ts`):
  - The canvas is one SVG whose user units are metres. **Pan and zoom never re-render Lit**: they set the `viewBox`, a `--mpp` (metres per pixel) CSS variable used for constant-size strokes, labels and handles, and redraw the grid path directly. Zoom-dependent minimum sizes re-render once zooming pauses.
  - Pointer Events for mouse, pen and touch (`touch-action: none`), two-finger pinch, wheel zoom around the cursor. View mode: drag pans, tap/hover shows the info card. Edit mode: drag moves plants and shapes, handles resize rectangles (also rotated), circles, polygon and drip line vertices (midpoints insert, double click removes), sprinkler arcs (ends: angle, middle: reach and direction) and crowns; tools draw rectangles, circles, polygons and freehand areas, place sprinklers (tap, or drag to aim) and lay drip lines point by point; snapping to a selectable grid (Alt disables).
  - Placing plants: tray in edit mode; mouse/pen drag a plant onto the plan, touch taps the plant and then its spot.
  - Every change is a `Command` in `util/history.ts` (undo/redo, Ctrl+Z/Y) that updates the store optimistically, calls the backend and rolls back with a message on failure.
  - The viewport and grid choice are stored per device in `localStorage` (`plant-garden.viewport.v1`, `plant-garden.snap.v1`); the first visit fits the whole garden.
  - Pure helpers with tests: `util/geometry.ts` (rotated rectangles, hit tests, areas, resizing, crown size defaults), `util/viewport.ts` (screen ↔ plan, zoom, fit, grid step, scale bar), `util/ulid.ts`.
  - Backgrounds (`util/wms.ts`, `components/background-dialog.ts`): verified WMS presets per state (D-018), suggestion by location, own WMS, or an uploaded picture with opacity, rotation, "move background" tool and two-point calibration (scales about the first point, `calibrateBackground`). WMS images are requested for the visible area plus 30 % margin after panning/zooming pauses, swapped in when loaded; the attribution is always shown. Drawn areas become semi-transparent over a backdrop.
  - Sensor markers (`util/markers.ts`, `components/entity-picker.ts`): any entity, icon by device class/domain, value with unit or translated state; info card with a 24 h sparkline (`history/history_during_period`) and HA's own more-info dialog (`hass-more-info` event).
  - Irrigation zones (`kind: "zone"`, D-023): own layer between areas and plants (can be hidden, `plant-garden.zones.v1`), dashed blue, animated while the linked entity runs (static with `prefers-reduced-motion`), remaining time of a linked `timer` (`finishes_at`). Edit mode: entity, timer and meter via the entity picker (domain-filtered), emitter, rate or flow, efficiency, reached plants with share and include/exclude. View mode: info card with state, rate, run time and litres today, reached plants (highlighted with a water ring). `util/coverage.ts` mirrors the backend coverage (D-024).
  - Soil water on the plan: amber dashed ring when a plant needs water, icy outer ring when frost is forecast below its limit; layer select "Plan / soil water deficit (crown halos green to red) / irrigation coverage (zones by mm/h, overlaps add up)", remembered per device (`plant-garden.layer.v1`).
  - The canvas ignores `hass` updates except language changes (D-021); states of markers, zone entities and timers arrive as one `states` object that changes only when one of them changes.
- To-do import (`components/todo-import.ts`): reads `todo/item/list`, preselects new names, guesses category and location, creates plants one by one.
- GPS suggestion (`util/exif.ts`, `util/upload.ts`): EXIF GPS → plan metres (`geoToPlan`), only within 1 km of home; offered in the create dialog and after uploads on the plant page (D-020).
- `state/garden-store.ts`: plants, layout and the water summary + backend subscription; debounced refresh on change events (`irrigation` events reload only the water summary); "stale" after 1 h. The panel refreshes stale data when the tab becomes visible and every 15 min, so signed URLs (24 h) never expire in an open panel.
- Components (`src/components/`): `PgElement` base (hass + cached `t`), plant card, plant form dialog (create/edit; sends only changed fields so provenance of untouched fields is kept), photo viewer (tags, note, cover, delete, keyboard navigation), growth chart (SVG, ResizeObserver), confirm dialog. Native `<dialog>` everywhere.
- Views (`src/views/`): plant list (search, status filter, empty state, FAB), plant detail (profile with provenance marks, notes, growth chart + measurements, water (`components/water-panel.ts`: today, total, 14-day bars, latest events with delete, "log watering"), AI identification (`components/ai-panel.ts`: pick 1–3 photos and what they show, cost estimate, result with confidence, Pl@ntNet attribution, suggestions to take over or dismiss one by one, questions), photo timeline by month, drag-and-drop upload).
- Assistant (M7): `views/tasks-view.ts` (`/tasks`: all tasks grouped by overdue / today / this week / later / undated / done, open problems of all plants; the tab shows the number of overdue tasks), `views/assistant-view.ts` (`/assistant`: garden questions, tips, chat). On the plant page `components/problems-panel.ts` (report with photos, status, diagnosis with causes, actions and warnings, log), `components/task-list.ts` (also the task dialog with repetition and season months) and `components/assistant-panel.ts` (questions, tips with tasks to take over, chat that shows the answer while it is written). `util/markdown.ts` renders AI text as a Markdown subset from Lit templates, never as HTML. The plan shows a violet dotted ring for pruning due and a red dot for an active problem; the info card lists tasks, problem and questions (`store.care`, reloaded on `care` events).
- Tech page (`views/tech-view.ts`, `/tech`, tab only for admins): AI cost, requests and tokens today / this month / overall, budget bar, stacked cost per day and model, breakdowns, request log with filters, paging and CSV export, providers with "test connection", price editor, storage, entities and weather sources.
- Theme: tokens on the panel root only (`styles/tokens.ts`, HA theme variables + nature palette, `dark` attribute); nested elements inherit them. Shared controls in `styles/shared.ts`.
- No HA-internal `ha-*` elements; icons from `@mdi/js`.
- i18n: `src/i18n/en.ts` defines keys, `de.ts` must match (tests check keys and placeholders).
- Tests: Vitest; pure logic in Node, components in happy-dom with a fake backend (`test/fixtures.ts`).

## Development environment

- Python venv in `~/.venvs/ha-plant-garden` (outside the repo). All scripts source `scripts/env.sh`.
- `scripts/develop`: HA with config dir `~/.ha-plant-garden-dev`, integration and `dev/*.yaml` symlinked; demo irrigation entities in `dev/demo_garden.yaml` (input booleans, a template switch, a timer that a demo automation starts with the lawn zone and that switches it off).
- `scripts/smoke`: throw-away HA; checks onboarding → config flow → panel → WebSocket → bundle → plant + photo upload + signed URLs (403 for unsigned) → measurement → plan (origin, shape, placement) → WMS background, uploaded background with signed URL, marker → move the garden location and back → irrigation zone on a REST-created entity: a 6 s run becomes an event with water for the plant and its sensor → delete.
- `scripts/demo.py`: prepares the dev instance (login `dev` with a random password on first run, long-lived token in the HA config dir), an invented demo garden, sensor markers and the aerial background.
- `scripts/test-min-version`: tests against HA 2026.9.0 in a separate venv.

## CI (`.github/workflows/`)

| Workflow | Jobs |
|---|---|
| `validate.yml` | hassfest, HACS action |
| `python.yml` | version check, ruff, mypy, pytest (pinned HA), pytest (minimum HA) |
| `frontend.yml` | prettier, eslint, tsc, vitest, build, committed bundle up to date |
| `release.yml` | on `v*` tags: runs both test workflows, checks versions against the tag, creates a GitHub release with the CHANGELOG section |
