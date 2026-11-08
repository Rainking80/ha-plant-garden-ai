# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

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

### Security

- Expired photo links answer 403 instead of 401, so an open panel cannot trigger
  Home Assistant's IP ban.
