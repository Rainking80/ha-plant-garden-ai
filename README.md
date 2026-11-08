# Plant Garden for Home Assistant

> **Status: early development (0.1.0).** Plants, photos, growth measurements, the garden plan editor, aerial imagery, irrigation tracking, the water balance and AI identification with a cost page are built and in review; the assistant (tasks, diagnosis, tips) follows (see [roadmap](#roadmap)).

Plant Garden turns Home Assistant into a garden planner and plant journal:

- **Garden plan** – a to-scale plan from above, on official aerial imagery where available, your own sketch or a drawn layout; drag plants into place, see irrigation zones and sensor values, hover or tap a plant to see its photos, water statistics, tasks and problems.
- **Plants & photos** – document growth and problems with photos for every plant; height and age are tracked over time.
- **Irrigation tracking** – link drawn zones to your existing `valve`/`switch` entities; every run is attributed to the plants it waters.
- **Water balance** – rain and evapotranspiration (from your sensors, a weather API or computed with FAO-56) per plant, daily.
- **AI assistant** – plant identification, diagnosis of problem photos and care tips. Use an AI you already set up in Home Assistant (AI Task, no extra key) or bring your own key for any OpenAI-compatible API (OpenAI, OpenRouter, Ollama …), Anthropic Claude or Google Gemini, plus Pl@ntNet for identification – with a page that shows tokens and costs.

Plant Garden never switches your valves; it only reads their state and offers recommendations as entities for your own automations.

Photos are stored in `<config>/plant_garden/` (three sizes per photo, metadata such as GPS removed) and are therefore part of your Home Assistant backups.

Aerial imagery comes directly from the state survey offices (Berlin/Brandenburg, Bavaria, Baden-Württemberg, Bremen, Hesse, Mecklenburg-Western Pomerania, Lower Saxony, North Rhine-Westphalia, Rhineland-Palatinate, Saarland, Schleswig-Holstein, Thuringia) under their open licences; the attribution is shown on the plan. Your browser loads the images from these services, which therefore see the map area you view.

## Requirements

- Home Assistant **2026.9.0** or newer
- [HACS](https://hacs.xyz)

## Installation (HACS custom repository)

1. HACS → ⋮ → **Custom repositories** → add `https://github.com/Rainking80/ha-plant-maintainance`, category **Integration**.
2. Install **Plant Garden**, restart Home Assistant.
3. **Settings → Devices & services → Add integration → Plant Garden**, choose a name for your garden.
4. Open the new sidebar entry.

## AI providers and costs

AI is optional and only runs when you start it (for example "Identify" on a plant
page or the action `plant_garden.identify_plant`). Add a provider under
**Settings → Devices & services → Plant Garden → Add AI provider**:

- **Home Assistant AI task** – an AI you already set up in Home Assistant, no
  extra key. Home Assistant does not report tokens, so these calls are counted
  but their cost shows as unknown.
- **OpenAI-compatible** – OpenAI, OpenRouter, Ollama, LM Studio or any compatible
  URL; **Anthropic Claude**; **Google Gemini** – with your own API key.
- **Pl@ntNet** – species candidates for identification (free key with 500
  identifications per day at [my.plantnet.org](https://my.plantnet.org)). Use a
  key from your own account; failed requests count against the daily limit too.

What is sent: the photos you choose (re-encoded, all metadata such as GPS
removed), the plant's name, category, location type and the names you entered,
the month and the hemisphere – never your location. Keys stay in Home Assistant
and are shown masked only.

The **Tech** tab (administrators) shows requests, tokens and costs per day,
model, feature and plant, a request log with CSV export, and the price table
(as of 2026-11-08, editable per model). A monthly budget in the integration
options warns at 80 % and can stop further calls.

## Roadmap

| Milestone | Content | State |
|---|---|---|
| M0 | Scaffolding, CI, dev environment, sidebar panel | ✅ |
| M1 | Plants, photos, growth measurements | ✅ |
| M2 | Garden plan editor: layout, plants by drag and drop, view/edit mode | 🧪 built, in review |
| M3 | Aerial imagery (WMS), own background image, sensor markers | 🧪 built, in review |
| M4 | Irrigation zones linked to HA entities (display and tracking) | 🧪 built, in review |
| M5 | Weather, evapotranspiration, water balance | 🧪 built, in review |
| M6 | AI: HA AI Task, OpenAI-compatible, Claude, Gemini, Pl@ntNet; token & cost page | 🧪 built, in review |
| M7 | Assistant: tasks, problems, questions, tips | |
| M8 | Polish & release | |

## Development

Home Assistant does not run natively on Windows; use Linux, WSL2 or the devcontainer.

```bash
bash scripts/setup              # Python venv (outside the repo) + npm packages
bash scripts/test               # backend tests with coverage
bash scripts/test-min-version   # backend tests against the oldest supported HA
bash scripts/lint               # ruff, mypy, eslint, prettier, tsc (--fix to apply fixes)
bash scripts/develop            # local HA with the demo garden on http://localhost:8123
bash scripts/smoke              # end-to-end check against a throw-away HA
cd frontend && npm run dev      # rebuild the panel on every change
```

Alternatively `docker compose up` starts Home Assistant with the integration mounted.

Architecture and design decisions: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/DECISIONS.md](docs/DECISIONS.md).

## Deutsch

Plant Garden ist ein Gartenplaner und Pflanzentagebuch für Home Assistant: Grundriss zeichnen, Pflanzen und Bewässerungszonen per Drag-and-drop platzieren, Fotos dokumentieren, Wasserbilanz aus Regen, Verdunstung und Bewässerung, dazu ein KI-Assistent mit eigenem API-Key und einer Übersicht über Tokens und Kosten. Installation über HACS als benutzerdefiniertes Repository (siehe oben), mindestens Home Assistant 2026.9.0.

## License

MIT
