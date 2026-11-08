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
AI suggestions (M2) into "entered by you".
