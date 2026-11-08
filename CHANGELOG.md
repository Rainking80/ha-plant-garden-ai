# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

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
