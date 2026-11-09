# Plant Garden for Home Assistant

A garden planner and plant journal inside Home Assistant: draw your garden to
scale on aerial imagery, place your plants, document them with photos, see which
plant got how much water from your irrigation, follow the soil water of every
plant, keep care tasks in Home Assistant's to-do list – and, if you like, let an
AI identify plants, diagnose problems and give tips, with every token and cent on
record.

> **Status:** early development, version 0.1.0. All features below are built and
> tested; the first release is being prepared. Changes are listed in the
> [changelog](CHANGELOG.md).

Plant Garden never switches anything. It reads the state of your valves and
sensors and offers recommendations as entities for your own automations.

![The garden plan: lawn, terrace, beds, buildings, a beech hedge drawn as one plant, plants with their names, sprinklers watering the lawn and drip lines along the hedge and the beds; dashed amber outlines mark plants that need water](https://raw.githubusercontent.com/Rainking80/ha-plant-maintainance/main/docs/images/plan.png)

<sub>The demo garden in view mode, shown here without its aerial background.</sub>

## Features

**Garden plan**
- A to-scale plan of your garden in metres, anchored at its real location.
- Background: official aerial imagery of 12 German states (with the required
  attribution), any WMS service, or your own site plan or sketch, calibrated with
  two known points.
- Areas as rectangles, circles, polygons or drawn freehand: beds, raised beds,
  lawn, hedges, terrace, paths, buildings, greenhouses, roofs, ponds, the property
  boundary. Grid snapping, undo/redo, everything saved immediately.
- Plants as round photo avatars in their crown size – or drawn as an area, so a
  whole beech hedge or the lawn is one plant, not a hundred.
- Rings at a glance: needs water, frost expected, pruning due, open problem.
  Layers for the soil water deficit and the irrigation coverage.
- Markers that show live values of any Home Assistant entity (soil moisture,
  temperature, …) with a 24 h history.
- View mode for looking (nothing moves by accident), edit mode for changing;
  mouse, pen and touch.

**Plants and photos**
- Name, botanical name, variety, family, category, location, light, water need,
  frost limit, soil, root depth, status, tags, notes – every field marked with
  where it came from (you, the AI with its confidence, a default).
- Age from a planting date or an estimate ("about 3 years old in May 2026").
- Height and width as measurements over time, with a growth chart.
- Photos from file or camera, a timeline per plant. Capture dates are read from
  the photo; GPS and all other metadata are removed.
- A care profile per plant: watering, fertilising, pruning.
- One-time import of plant names from an existing to-do list.

**Irrigation (tracking, not switching)**
- Place sprinklers with their symbol and the area they water – drag the arc for
  angle and reach –, circular sprinklers, drip lines laid point by point as blue
  pipes, or draw any irrigation area.
- Link each to the `valve`, `switch`, `input_boolean` or `binary_sensor` that
  waters it, optionally a `timer` (remaining time on the plan) and a water meter
  (real litres instead of an estimate).
- Spray heads, rotors, drip lines, drippers per plant or by hand, with typical
  efficiencies.
- Every run becomes an event with litres per plant – also across restarts, with
  gaps filled from the recorder. Stuck valves raise a repair notice.
- Watering with a can is logged on the plant page or with an action.

![Edit mode: a sprinkler with a 165° arc over the lawn, its handles at both ends of the arc and in its middle, the plants it reaches ringed in blue, a drip line around a bed; on the right the sprinkler's reach, angle, direction, emitter and rate](https://raw.githubusercontent.com/Rainking80/ha-plant-maintainance/main/docs/images/irrigation.png)

**Weather and water balance**
- Weather from your own sensors, [Open-Meteo](https://open-meteo.com) (worldwide)
  or [Bright Sky](https://brightsky.dev) / German Weather Service (Germany).
- Evapotranspiration after FAO-56 (Penman-Monteith or Hargreaves) where no source
  provides it.
- A soil water bucket per plant from rain, evaporation, soil, root depth, water
  need and irrigation; "needs water" per plant and "irrigation recommended" with a
  run time per zone, taking expected rain into account.
- A week's outlook: which plants need water on which of the next seven days,
  with the forecast rain – shown as clouds of plants above the weather chart.

**Tasks and problems**
- Tasks (water, fertilise, prune, repot, check for pests, harvest, take a photo,
  other) with due date, repetition every N days or weeks and optional season
  months. They are also Home Assistant's to-do list **Garden tasks** – tick them
  off there or on your phone.
- Problems from "Report a problem" or a photo tagged `problem`, with status and a
  log of what was done.

**AI (optional)**
- Providers: an AI you already set up in Home Assistant (AI Task), any
  OpenAI-compatible API (OpenAI, OpenRouter, Ollama, LM Studio, custom URL),
  Anthropic Claude, Google Gemini, and Pl@ntNet for species candidates.
- Identification from 1–3 photos: species, size, age, care – every suggestion is
  taken over or dismissed on its own and never replaces what you entered.
- Diagnosis of a problem: symptoms, possible causes with confidence and evidence,
  what to do and how urgent, warnings.
- Tips for a plant or the whole garden, with tasks you take over in one click; a
  chat about the garden or one plant; an optional weekly garden check.
- Plant knowledge: the assistant researches care, pests, toxicity and more for
  each plant - on the web with Claude, Gemini or OpenRouter (with sources), else
  from Wikipedia - and keeps it on the plant page. You choose how often it
  researches on its own (off by default); a plant is researched only once.
- A **Tech** page for administrators: requests, tokens and costs per day, model,
  feature and plant, a request log with CSV export, editable prices, a monthly
  budget that warns and can stop.

**Moving and backups**
- All data lives in your Home Assistant configuration folder and is part of every
  Home Assistant backup.
- Export the garden as a JSON file and import it into another Home Assistant – at
  the same place on the map.

The interface is available in English and German.

| Plants | A plant's page | Water & weather |
|---|---|---|
| [![The plant list with photos, botanical names, age and status filters](https://raw.githubusercontent.com/Rainking80/ha-plant-maintainance/main/docs/images/plants.png)](https://raw.githubusercontent.com/Rainking80/ha-plant-maintainance/main/docs/images/plants.png) | [![A plant's page with its photo, details, growth and soil water](https://raw.githubusercontent.com/Rainking80/ha-plant-maintainance/main/docs/images/plant.png)](https://raw.githubusercontent.com/Rainking80/ha-plant-maintainance/main/docs/images/plant.png) | [![Rain and evaporation of the last two weeks with the forecast, and the soil water of every plant](https://raw.githubusercontent.com/Rainking80/ha-plant-maintainance/main/docs/images/water.png)](https://raw.githubusercontent.com/Rainking80/ha-plant-maintainance/main/docs/images/water.png) |

## Requirements

- Home Assistant **2026.9.0** or newer
- [HACS](https://hacs.xyz) for the recommended installation

## Installation

### With HACS (recommended)

1. In HACS, open the menu (⋮) → **Custom repositories**.
2. Add `https://github.com/Rainking80/ha-plant-maintainance` with the type
   **Integration**.
3. Search for **Plant Garden**, choose **Download** and restart Home Assistant.

### Manually

1. Download this repository (or the latest release) and copy the folder
   `custom_components/plant_garden` into the `custom_components` folder of your
   Home Assistant configuration (create it if it does not exist), for example with
   the Samba share, SSH or Studio Code Server add-on.
2. Restart Home Assistant.

To update, replace the folder and restart again.

### Set up

1. **Settings → Devices & services → Add integration → Plant Garden.**
2. Give your garden a name. A new sidebar entry **Plant Garden** appears.

## First steps

1. **Plants** tab: add your plants (name and category are enough to start).
2. **Garden plan** tab → **Edit**:
   - check the location: the plan starts at Home Assistant's home location; if
     your garden is elsewhere (an allotment), move the plan to it,
   - choose a background (aerial imagery is suggested where available),
   - draw the beds, lawn, hedges and buildings,
   - drag the plants from the list on the right onto the plan, or draw a plant as
     an area (✎ next to it).
3. For irrigation: in the edit tool bar under **Irrigation**, place sprinklers or
   drip lines (or draw an irrigation area), then link the valve that waters them.
4. For the water balance: **Settings → Devices & services → Plant Garden → Add
   weather source**.
5. Optional, for the AI: **Add AI provider** in the same place.

The [user guide](docs/USER_GUIDE.md) ([Deutsch](docs/USER_GUIDE.de.md)) explains
every part in detail.

## Configuration

Everything is set up in the user interface; there is no YAML.

**Weather sources** (Plant Garden → *Add weather source*): your own sensors (rain,
ET₀, temperature, humidity, wind, solar radiation, a weather entity for the
forecast), Open-Meteo or Bright Sky. Your own sensors win; services fill the gaps.
Nothing is fetched before you add a source, and the services only receive the
garden's location rounded to about 1 km.

**AI providers** (Plant Garden → *Add AI provider*):

| Provider | Key | Notes |
|---|---|---|
| Home Assistant AI Task | none | uses an AI already set up in Home Assistant; it reports no tokens, so costs show as unknown |
| Anthropic Claude | [platform.claude.com/settings/keys](https://platform.claude.com/settings/keys) | |
| OpenAI | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) | |
| Google Gemini | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) | |
| OpenRouter | [openrouter.ai/settings/keys](https://openrouter.ai/settings/keys) | reports the cost of every call itself |
| Ollama, LM Studio | none | local models; set a price of 0 on the Tech page |
| Pl@ntNet | [my.plantnet.org](https://my.plantnet.org) | species candidates; 500 free identifications a day, failed requests count too; use your own account |

Keys are checked when you add them and are only ever shown masked.

**Options** (Plant Garden → *Configure*): warning limit for long irrigation runs;
which AI to use for photos and for text; monthly AI budget (notice at 80 %,
optionally stop at 100 %); a fixed US dollar to euro rate; identify new plants
after a photo upload; weekly garden check; how much garden data the AI may
receive per feature; a debug log of prompts; how long single AI calls are kept.

## Entities, actions and events

| Device | Entities |
|---|---|
| each plant | water received (L, long-term statistics), water today (mm), last watering, soil water deficit (mm), open tasks, *needs water*, *problem*; health (disabled by default) |
| each irrigation zone | run time today (min), water today (L), recommended run time (min), *irrigation recommended* |
| the garden | ET₀ today, rain today, rain tomorrow, AI costs this month, AI tokens this month, AI requests today, the to-do list **Garden tasks** |

Actions: `plant_garden.log_watering`, `plant_garden.refresh_weather`,
`plant_garden.identify_plant`, `plant_garden.ask_assistant` (returns the answer),
`plant_garden.create_task`, `plant_garden.add_photo` (file in an allowed folder or
a camera snapshot).

Events: `plant_garden_irrigation_finished`, `plant_garden_task_due`,
`plant_garden_problem_detected`.

Example – a notification when a garden task is due:

```yaml
triggers:
  - trigger: event
    event_type: plant_garden_task_due
actions:
  - action: notify.mobile_app_phone
    data:
      message: "Garden: {{ trigger.event.data.title }}"
```

## Privacy and costs

- Everything stays in Home Assistant: `<config>/plant_garden/` (database, photos
  in three sizes, plan backgrounds) and `.storage/plant_garden.*`.
- Nothing is sent anywhere until you add a weather source or an AI provider, and
  the AI only runs when you start it (or the weekly check and the plant research,
  if you switch them on).
- AI providers receive only what a feature needs: the photos you choose
  (re-encoded, without metadata), plant details, the month and the hemisphere,
  and for tips, diagnosis and the chat a compact summary of soil water, weather,
  irrigation, tasks and problems. Never your location, your plant notes, names of
  people, entity ids or keys. The plant research sends the plant's name and
  botany; without web search, Wikipedia receives the plant's name.
- Aerial imagery is loaded by your browser directly from the survey offices,
  which therefore see the map area you look at.
- AI costs are usually a few cents per identification or diagnosis; every call is
  logged with tokens and costs on the Tech page, and a monthly budget can stop
  further calls.

## FAQ

- **Does it work without AI?** Yes. Plan, photos, irrigation, water balance and
  tasks need no AI provider.
- **Does it work outside Germany?** Yes. Aerial imagery presets exist for German
  states; elsewhere add your country's WMS service or upload a site plan. Weather
  comes from Open-Meteo worldwide.
- **My valves have no flow meter.** Enter the precipitation rate or the flow of
  the zone; Plant Garden estimates the litres from the run time.
- **How do I move my garden to another Home Assistant?** Tech tab → *Export as
  JSON*, then in the other Home Assistant Tech tab → *Import a file* (into an
  empty garden). Photos and history stay behind; they are in your backups.
- **How do I remove everything?** Remove the integration – the garden data is
  kept, so a re-install finds it. To delete it as well, stop Home Assistant and
  delete `<config>/plant_garden/` and `.storage/plant_garden.*`.
- **Where do I report a problem?** In the
  [issue tracker](https://github.com/Rainking80/ha-plant-maintainance/issues);
  please attach the diagnostics (integration menu → *Download diagnostics*), which
  contain no keys, coordinates or entity ids.

## Development

Home Assistant does not run natively on Windows; use Linux, WSL2 or the
devcontainer.

```bash
bash scripts/setup              # Python venv (outside the repo) + npm packages
bash scripts/test               # backend tests with coverage
bash scripts/test-min-version   # backend tests against the oldest supported HA
bash scripts/lint               # ruff, mypy, eslint, prettier, tsc (--fix to apply fixes)
bash scripts/develop            # local Home Assistant on http://localhost:8123
uv run python scripts/demo.py   # onboard it and fill a demo garden
bash scripts/smoke              # end-to-end check against a throw-away Home Assistant
cd frontend && npm run dev      # rebuild the panel on every change
```

Alternatively `docker compose up` starts Home Assistant with the integration
mounted. Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md); design
decisions: [docs/DECISIONS.md](docs/DECISIONS.md).

## Deutsch

Plant Garden ist ein Gartenplaner und Pflanzentagebuch für Home Assistant:

- den Garten maßstabsgetreu auf Luftbildern zeichnen,
- Pflanzen platzieren (auch als Fläche, etwa eine ganze Hecke),
- Fotos und Wachstum dokumentieren,
- Bewässerung pro Pflanze erfassen (ohne selbst zu schalten),
- Bodenwasser aus Regen und Verdunstung berechnen,
- Pflegeaufgaben in der To-do-Liste von Home Assistant verwalten,
- optional mit KI: Bestimmung, Diagnose, Tipps und Chat, mit Übersicht über Tokens
  und Kosten.

Die Oberfläche gibt es auf Deutsch und Englisch. Installation wie oben
beschrieben (HACS als benutzerdefiniertes Repository oder manuell), mindestens
Home Assistant 2026.9.0. Ausführliche Anleitung:
[docs/USER_GUIDE.de.md](docs/USER_GUIDE.de.md).

## Acknowledgements

Aerial imagery © the German state survey offices (attribution on the plan),
weather data from [Open-Meteo](https://open-meteo.com) (CC BY 4.0) and
[Bright Sky](https://brightsky.dev) / Deutscher Wetterdienst, species candidates
from [Pl@ntNet](https://plantnet.org).

## License

MIT
