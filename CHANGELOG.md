# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Water & weather: the chart shows a week back and a week ahead with weekday and
  date. Above each coming day, the plants that need water then are grouped as
  circles in a cloud – worked out from the forecast evaporation and the forecast
  rain (weighted by its probability). The soil water list tells the next watering
  day, or "rain expected" for a thirsty plant the coming rain will refill. The
  weather is fetched seven days ahead instead of three.

- Plan: sprinklers, circular sprinklers and drip lines (edit tool bar →
  Irrigation). A sprinkler shows its symbol and the area it waters in transparent
  blue; drag the ends of the arc for the angle (45° to start) and its middle for
  reach and direction. A circular sprinkler has only a reach. A drip line is a blue
  pipe laid point by point; its points can be moved, added and removed, and its
  water can be given in L/h per metre. Each is an irrigation zone; several on one
  valve share a water meter in proportion to their flow.
- Move a garden to another Home Assistant: the Tech tab exports plan, plants,
  measurements and open tasks as JSON and imports such a file into an empty
  garden – at the same place on the map (no photos, history or keys).
- Plan: a button "Irrigation zone" in the edit tool bar (zones were hidden as an
  area kind in a drop-down).
- Plan: freehand drawing of areas, and every plant can be drawn as an area (a
  whole hedge or lawn instead of single plants) – it then shows the plant's name
  and status and opens the plant's card.
- M8 polish:
  - Diagnostics (integration menu → Download diagnostics): counts, settings,
    weather and AI status, recent AI errors – without keys, coordinates or entity
    ids.
  - Backups: the database is checkpointed before Home Assistant creates a backup.
  - Repairs: a rejected AI key and an irrigation zone whose linked entity no
    longer exists now appear under Settings → Repairs (and disappear when fixed).
  - User guide in English and German (`docs/USER_GUIDE.md`), FAQ, key links and
    how to delete all data in the README.
  - Care profile per plant (watering, fertilising, pruning hints): edit it in the
    plant form, see it on the plant page; an identification suggests it.
  - Option "identify new plants after a photo upload" (off by default; only
    plants without a botanical name).
- M7 garden assistant:
  - Tasks (water, fertilise, prune, repot, check for pests, harvest, take a photo,
    other) with due date, repetition every N days or weeks (from the day it was
    done) and optional season months; for one plant or the whole garden. New tab
    "Tasks" with overdue / today / this week / later, a count of overdue tasks on
    the tab, and all open problems.
  - The to-do list "Garden tasks" in Home Assistant shows the same tasks; ticking
    one off there completes it, items added there become tasks ("Rose: cut back"
    is linked to the rose). Events `plant_garden_task_due` and
    `plant_garden_problem_detected`, actions `plant_garden.create_task` and
    `plant_garden.add_photo` (file or camera snapshot).
  - Problems: "Report a problem" or tag a photo with `problem`; status, a log of
    what was done, and an AI diagnosis with symptoms, possible causes (type,
    confidence, evidence), what to do and how urgent, warnings, what to watch and
    what is missing. A follow-up photo becomes a task.
  - Tips for a plant or the garden that consider season, weather, soil water,
    tasks and problems; proposed jobs become tasks with one click. The assistant
    asks questions to improve the data (answer or skip them). Optional weekly
    garden check (off by default).
  - Chat with the assistant about the garden or one plant; the answer appears
    while it is written (Claude, OpenAI-compatible, Gemini). Also as action
    `plant_garden.ask_assistant`. Answers are shown as safe Markdown.
  - Plan: violet ring when pruning is due, red dot for an open problem, tasks,
    problem and questions on the info card. Sensors "open tasks" and "problem"
    per plant ("health" disabled by default).
  - Options: weekly check, how much garden data the AI may receive per feature.
- M6 AI layer:
  - AI providers in the integration settings ("Add AI provider"): Home
    Assistant's own AI task entities (no key), OpenAI-compatible APIs (OpenAI,
    OpenRouter, Ollama, LM Studio, any URL), Anthropic Claude, Google Gemini and
    Pl@ntNet. Keys are tested before saving and only ever shown masked; the model
    is picked from the provider's list.
  - Identify a plant from 1 to 3 photos (what each shows: leaf, flower, fruit,
    bark, whole plant) with a cost estimate before starting. Pl@ntNet proposes
    species, the language model decides with the season and what you already
    entered. The result shows confidence, health, a size estimate and questions;
    every suggestion is taken over or dismissed on its own and never replaces a
    value you entered. Also as action `plant_garden.identify_plant`.
  - Tech tab for administrators: requests, tokens and costs today, this month
    and overall, cost per day and model, breakdowns by provider, model, feature
    and plant, a request log with filters and CSV export, "test connection", the
    price table (as of 2026-11-08) with your own prices, storage and weather
    source status.
  - Options: provider for photos and for text, monthly budget (repair notice at
    80 % and 100 %, optionally stop), USD → EUR rate, debug log of prompts, log
    retention (older calls are kept as daily totals).
  - Sensors for the garden: AI cost this month, AI tokens this month, AI requests
    today. Plant photos are available as a media source.
- M5 weather and water balance:
  - Weather sources in the integration settings: Open-Meteo (worldwide), Bright
    Sky / German Weather Service (Germany) and your own sensors (rain, ET₀,
    temperature, humidity, wind, radiation, a weather entity for the forecast).
    Own sensors win, services fill the gaps; nothing is fetched until you add a
    source. Fetched hourly, the last 30 days again each time (gaps close by
    themselves), action `plant_garden.refresh_weather`.
  - ET₀ after FAO-56 Penman-Monteith or Hargreaves-Samani where a source has none
    (tested against the FAO-56 examples).
  - Soil water bucket per plant from soil, root depth, water need (WUCOLS), lawn
    and vegetable coefficients, effective rain (none under roofs), irrigation and
    watering; documented defaults with sources.
  - Plan: "needs water" and frost rings, soil water deficit and irrigation
    coverage heatmaps; info cards with soil water, frost and zone advice.
  - New tab "Water & weather": rain/ET₀ chart with forecast, soil water of every
    plant, zone advice, source status.
  - Sensors: soil water deficit and "needs water" per plant, recommended run time
    and "irrigation recommended" per zone (rain expected in the next two days
    counts), ET₀ today, rain today and tomorrow for the garden.
- M4 irrigation zones (display and tracking only, the integration never switches):
  - Draw zones as rectangles, circles or polygons and link a valve, switch, input
    boolean or binary sensor; optionally a timer (remaining time on the plan) and a
    water meter (real litres instead of an estimate).
  - Emitter type (spray heads, rotors, drip line, drippers per plant, by hand),
    precipitation rate or flow (converted over the area), efficiency with typical
    defaults.
  - The plan shows which plants a zone reaches and how much of each; plants can be
    added or excluded by hand. A running zone is animated (not with reduced motion).
  - Every run becomes an event with water per plant; runs survive restarts, gaps
    are filled from the recorder history, runs ending in "unavailable" are marked
    uncertain, very long runs raise a repair notice (limit in the options).
  - Plant page: water today, in total, the last 14 days as bars, latest events,
    "log watering" for the watering can.
  - Devices per plant and zone with sensors (water received in litres for the
    long-term statistics, water today, last watering, zone run time and litres
    today), the action `plant_garden.log_watering` and the event
    `plant_garden_irrigation_finished` for automations.
  - Demo garden: zones on the simulated valves, a timer that switches the lawn
    sprinkler off.
- Garden location: the plan can be moved to where the garden really is (e.g. an
  allotment away from home) – to the map centre, Home Assistant's home or pasted
  coordinates. Everything already drawn stays in place on the map or, if you
  choose, moves along; undo works. In edit mode the plan offers this as soon as
  you are more than 1 km away. Drawing more than 10 km from the location now
  explains what to do instead of showing a raw validation error.
- M3 plan backgrounds and markers:
  - Official aerial imagery (orthophotos) of 12 German states as plan background,
    to scale, with the required source attribution; the matching state is
    suggested; any other WMS service can be added.
  - Own background picture (site plan, sketch): upload, opacity, rotation, move it
    into place and calibrate the scale by tapping two points with a known distance.
  - Sensor markers: place any Home Assistant entity on the plan with its live
    value; tap for a 24 h chart and Home Assistant's details dialog.
  - Import plants once from a Home Assistant to-do list (category guessed).
  - Photos with GPS suggest where a plant grows (only when you accept; GPS is
    never stored).
- M2 garden plan (new start page of the panel, tabs "Garden plan" / "Plants"):
  - To-scale plan in metres around your Home Assistant home location, north up,
    with grid, scale bar and "show everything".
  - View mode (tap or hover a plant for photo, age, height and a link to its
    details; nothing can be moved by accident) and edit mode.
  - Draw beds, raised beds, lawn, hedges, terraces, paths, buildings,
    greenhouses, roofs, ponds and the property boundary as rectangles (rotatable),
    circles or polygons; label them, set the soil of beds, link an area to a
    plant (e.g. lawn), lock elements, see their area.
  - Place plants by drag and drop from a tray (or tap plant, then spot on
    touch screens); plants show as photo circles in crown size with a status
    ring; crown size adjustable with a handle.
  - Undo/redo (also Ctrl+Z / Ctrl+Y), grid snapping (Alt for free placement),
    pinch and wheel zoom, live updates from other devices.
  - "Show on plan" button on the plant page.
- M1 plants and photos:
  - Plant list with search, status filter and an empty state; plant detail with
    profile, notes, growth chart, measurements and a photo timeline by month.
  - Create/edit dialog with botanical name, variety, category, location, light,
    water need (WUCOLS), soil, status, frost hardiness, root depth, tags, notes,
    planting date and age ("about N years old on <date>"); current age is computed.
  - Every plant field remembers where its value came from (you, AI, service).
  - Photo upload (button, multiple files, drag and drop, phone camera): browser
    downsizing, EXIF capture time, orientation fix, all metadata (GPS) removed,
    three sizes; tags (growth, problem, flowering, harvest, own tags), notes,
    cover photo, full-screen viewer with keyboard navigation.
  - Height/width measurements over time.
  - Live updates between open panels.
  - Storage: HA Store for plants, SQLite for photos and measurements, image files
    under `<config>/plant_garden/`; data survives removing and re-adding the
    integration.
- M0 scaffolding: config flow (one garden per installation), sidebar panel
  (German/English, light/dark theme), `plant_garden/info` WebSocket command, brand
  icons.
- Development environment: WSL2/devcontainer scripts, Docker Compose, demo garden
  with simulated irrigation entities, end-to-end smoke test.
- CI: hassfest, HACS validation, Python lint/types/tests (pinned and minimum HA
  version), frontend lint/tests/build with bundle check, tag-based releases.

### Fixed

- Water & weather: the soil water bars of plants with a "needs water" badge no
  longer shift; all rows share the same columns.
- The garden plan stayed empty in view mode inside Home Assistant (it collapsed to
  0 px height; only edit mode, whose side panel gave it a height, showed it). The
  plan now fills the window in both modes, the edit side panel scrolls on its own
  instead of the whole page, and "show everything" no longer zooms out to 5 km
  while the plan is not laid out yet.
- The dashed property boundary could hardly be selected (only its thin dashes
  reacted), so it could not be moved or deleted. It now has a wide invisible grip
  along its line; its inside stays free for panning.

### Security

- Expired photo links answer 403 instead of 401, so an open panel cannot trigger
  Home Assistant's IP ban.
