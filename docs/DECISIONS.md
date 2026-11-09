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

## D-026 Weather sources, priorities and the water balance (2026-11-08)

- **Sources**: Open-Meteo (worldwide, no key), Bright Sky (DWD observations and
  MOSMIX forecasts, Germany, no key) and the user's own Home Assistant sensors
  (long-term statistics, forecast via `weather.get_forecasts`). Each is a config
  subentry of type `weather`. OpenWeatherMap, Visual Crossing and Tomorrow.io need
  keys and are not built yet; the provider layer takes them without changes
  elsewhere.
- **No automatic calls**: nothing is fetched until the user adds a source; the
  panel explains how. Adding a service shows which rounded location (about 1 km)
  it receives and tests the connection.
- **Priority per value**: own sensors first, then services in the order they were
  added; a later source only fills values the earlier ones lack. ET₀ comes from a
  source when it has one, otherwise Penman-Monteith (with whatever humidity, wind
  and radiation exist; FAO-56 fallbacks for missing ones) or Hargreaves-Samani.
- **Storage**: merged past days are stored in SQLite (`weather_daily`, one JSON row
  per day) and refetched for the last 30 days every hour, so gaps after downtime
  close by themselves. The balance itself is recomputed from stored weather and
  irrigation (deterministic, cheap) instead of being stored.
- **Bucket**: starts at field capacity on the first stored day (at most a year
  back). K: WUCOLS landscape coefficients, lawn 0.8, vegetables FAO-56 stages from
  the planting date. TAW from FAO-56 soil water by texture and root depth per
  category; pots use potting mix and 25 cm. Rain: first 2 mm intercepted, 80 % of
  the rest effective; plants under houses, greenhouses and roofs (or with location
  greenhouse/covered) get none. Defaults and sources in `water_defaults.json`;
  values marked as assumptions are ours.
- **Advice**: a plant needs water when Dr > RAW. A zone is recommended when a
  plant it reaches needs water and the expected effective rain of the next two days
  (weighted by probability) does not cover it; the run time refills the thirstiest
  plant (area zones: depth rate x share; drippers: litres), capped at 4 h.
- **Frost**: the coldest forecast night below a plant's minimum temperature.

## D-027 AI providers over plain HTTP, one usage format (2026-11-08)

- **Providers** are config subentries of type `ai`: Home Assistant's own AI task
  entities (`ai_task.generate_data`), OpenAI-compatible endpoints (OpenAI,
  OpenRouter, Ollama, LM Studio, any URL), Anthropic, Google Gemini and Pl@ntNet.
  No vendor SDKs: each provider is a small aiohttp client with HA's session. The
  options pick one provider for photos and one for text; without a choice the
  first suitable one is used.
- **Keys** live only in the subentry data. They are tested before saving, never
  sent to the panel (masked `sk-…abcd`), logged or written to diagnostics.
- **Usage** is normalised per call to input without cache, cache reads, cache
  writes, output, reasoning (included in output) and images, because the
  providers count differently: Anthropic reports `input_tokens` without cached
  tokens; OpenAI and Gemini include cached tokens in the prompt count, so the
  cached part is subtracted; Gemini bills thinking tokens as output; OpenRouter
  reports the cost itself (used as is, marked "provider"). `ai_task` reports no
  tokens: those calls are counted and timed, their cost is "unknown".
- **Prices** come with the integration (`ai/pricing_defaults.json`, USD per million
  tokens, as of 2026-11-08, source per provider) and can be overridden per model on
  the tech page. Dated model ids match their base id (`claude-opus-5-5-20261101`
  → `claude-opus-5-5`). Local models have no price until the user enters one.
- **Budget**: a monthly limit in the display currency (USD → EUR rate in the
  options). A repair notice at 80 % and at 100 %; optionally further calls are
  refused (`budget_exceeded`). The check uses the estimate of the planned call.
- **Retries**: 429 and 5xx twice with `Retry-After` (max 30 s); an answer that is
  not valid JSON is repaired once with the error message. Pl@ntNet is never
  retried because failed requests also use up the daily credits.
- **Log**: every call is a row (`ai_usage`) with tokens, cost, latency, status and
  error; prompts and answers only with the debug option. After the retention (90
  days by default) rows are folded into daily totals, so totals stay complete.
- **Code layout**: the AI layer is a sub-package (`ai/`, `ai/providers/`). Ruff's
  TID252 (no relative parent imports) is switched off below the package root, as
  `from ..const import …` is clearer there than absolute imports of our own
  package.

## D-028 Identification: Pl@ntNet proposes, the language model decides (2026-11-08)

- **Flow**: the user picks 1 to 3 photos and says what each shows (leaf, flower,
  fruit, bark, whole plant). Pl@ntNet (if set up) gets the original JPEGs and
  returns species candidates; the language model gets the medium WebPs (1024 px),
  the candidates, the season and what is already known about the plant, and
  answers with a strict JSON schema (candidates with confidence and reason,
  health, size estimate with its basis, care hints, questions). Without Pl@ntNet
  the model decides alone and the panel says that this is less accurate.
- **Never over user values**: the result becomes one suggestion per field. Fields
  the user entered show "AI sees this differently" and stay; everything else is
  taken over only on "accept", with source `ai`, confidence and model. Size
  estimates become measurements with source `ai`; an age becomes an age reference.
- **No AI without a user action**: identification starts from the plant page or
  the action `plant_garden.identify_plant`; automatic identification after an
  upload is not built (it would be an option, off by default).
- **Pl@ntNet terms**: the free plan (500 identifications per day) asks for no
  attribution, but we show "candidates from Pl@ntNet" anyway. Whether a personal
  key may be used inside a third-party app is not stated in the terms (not
  verified with Pl@ntNet); the README tells users to use their own key under their
  own account.

## D-029 Assistant data: tasks, problems, questions, chat (2026-11-09)

- **Storage**: tasks, problems with their log, questions of the assistant and the
  chat history are SQLite tables (schema 5), owned by `care.py`; tips are small
  and live in the Store `plant_garden.assistant`. Deleting a plant deletes all of
  them.
- **Tasks**: kinds water, fertilise, prune, repot, pest check, harvest, photo,
  other. A repeating task is completed as it is and gets a *new* task for the
  next date, counted from the day it was done (care work follows what really
  happened, not a calendar). `months` limit a task to a season; a date outside
  moves to the 1st of the next allowed month. Done tasks stay visible for 30
  days.
- **To-do list**: one `todo` entity "Garden tasks" mirrors the tasks both ways.
  Items are "Plant: title"; an item added in Home Assistant whose prefix names a
  plant is linked to it. Ticking an item off completes the task (with repetition),
  deleting it deletes the task.
- **Due events**: `plant_garden_task_due` fires once per task and due date, at
  start and every day at 07:00 local time. `plant_garden_problem_detected` fires
  when a problem is opened.
- **Problems**: opened by "Report a problem" or by a photo tagged `problem` (it
  joins the newest active problem of the plant instead, if there is one). Status
  open, treating, watching, resolved; every change, note, action and diagnosis is
  a log line. Completing a task linked to a problem logs it as an action.
- **Questions** in both directions: the user's questions about a plant are the
  plant's chat (its "question history"); the assistant's questions to the user
  (from tips) are stored separately, never asked twice while open, answered or
  skipped in the panel.
- **Plan**: a plant gets a violet dotted ring when a pruning task is due within 7
  days and a red dot while a problem is active; the info card lists open tasks,
  the problem and open questions.
- **Entities**: per plant "open tasks" and the binary sensor "problem"; "health"
  (the plant status) exists but is disabled by default. Height and the latest
  photo as entities follow later.

## D-030 Assistant AI: context, streaming, diagnosis, tips (2026-11-09)

- **Context builder** (`ai/context.py`): compact JSON - month and hemisphere, the
  average temperatures and rain of the last 30 days from the stored weather (no
  coordinates), the plant profile with the source of every value that is not the
  user's own, measurements, the soil water balance of 14 days, irrigation, open
  problems and tasks. Plants are referred to by short refs (`p1`, `p2`), mapped
  back afterwards. The plant's notes are never sent (the AI dialog promises it);
  a diagnosis does send the problem's title and log, which the user wrote for it.
  The JSON is shortened in a fixed order (weather, irrigation, measurements, water
  days, tasks, plants, problems, climate) until it fits the per-feature budget
  (options, default 2500 / 4000 / 3000 estimated tokens for diagnosis, tips,
  chat). The static instructions come first, so providers can cache them.
- **Diagnosis**: up to two photos of the problem and one older photo of the plant
  for comparison, strict JSON (symptoms; causes with type, confidence, evidence;
  actions with urgency and warnings; what to watch; missing information;
  follow-up days). A follow-up becomes a "take a photo" task. The plant's status
  is not changed by the AI.
- **Tips** for a plant or the garden, at most six, each optionally with a task the
  user takes over with one click (source `ai`); up to three questions to improve
  the data. The weekly check (opt-in, Mondays 08:00) is the same call as feature
  `digest`.
- **Chat** with streaming: a WebSocket subscription sends `delta` events while the
  provider writes, then `done` with the stored message. Anthropic, OpenAI-compatible
  and Gemini stream via server-sent events (retries only before the first byte);
  Home Assistant's AI task and JSON answers arrive as one piece. The last ten
  messages are sent along. Answers are rendered as a small Markdown subset built
  from Lit templates - never as HTML.
- All of it goes through `AIService.async_generate`: budget check, usage log,
  costs, one JSON repair retry. Nothing runs without a user action except the
  opt-in weekly check.

## D-031 Diagnostics, backups and repairs (2026-11-09)

- **Diagnostics** contain counts, options, subentries, storage sizes, weather and
  AI status and the last ten failed AI calls. Redacted: keys (fully, not even
  masked), coordinates, URLs, entity ids, file paths, prompts and answers - a
  diagnostics file is often posted publicly.
- **Backup platform**: `async_pre_backup` checkpoints the SQLite WAL and saves the
  Store, so a backup taken while the garden is in use restores consistently.
  Nothing has to be undone afterwards.
- **Repairs** instead of a reauth flow for AI keys: Home Assistant offers no reauth
  for config subentries, and a rejected key of one provider must not disable the
  garden. The issue names the provider, points to "New key or model" and is
  removed after the next successful call or connection test. A zone whose linked
  valve, timer or meter is neither a state nor in the entity registry gets an
  issue once Home Assistant has started (entities appear during start-up).

## D-032 Care profile and identification after upload (2026-11-09)

- **Care profile** (spec 4.1): three short text fields per plant - watering,
  fertilising, pruning - with the same provenance as every other field. An
  identification suggests them (prompt `identify-2`, schema fields `watering`,
  `fertilizing`, `pruning`); they are taken over one by one like all suggestions
  and never replace the user's own text. The assistant's context includes them
  (unlike the free notes).
- **Identification after upload** (spec 4.3, option, off by default): a new photo
  starts an identification with that photo only when the plant has no botanical
  name yet - once the species is known, further uploads would only cost money.
  It runs as a background task of the entry; failures are logged, not shown.

## D-033 Freehand areas and plants drawn as an area (2026-11-09)

- **Freehand tool** next to rectangle, circle and polygon: press, trace, let go.
  The stroke keeps a point every 3 screen pixels, is smoothed with
  Ramer-Douglas-Peucker to about 2.5 pixels (in metres at the current zoom), the
  end joins the start; strokes enclosing less than 0.05 m² are dropped. No grid
  snapping - the point of freehand is to follow what is really there. It is a
  separate tool so that dragging with the polygon tool still pans.
- **A plant as an area** (a beech hedge, the lawn, a row of vegetables): every
  plant in the tray can be drawn as an area; the new shape (kind from the
  category: hedge, lawn, else bed) is linked to the plant. Such a plant counts as
  placed, its footprint for irrigation is the area (as before for linked areas),
  its soil is the area's own soil or the bed under the area's middle, and a roof
  over that middle shelters it. On the plan the area shows the plant's name and
  the same status as a crown (needs water, pruning due, problem); in view mode
  hovering or tapping it opens the plant's card. One plant may have several
  areas; the individual plants of a hedge need not be drawn.
