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

## D-002 One garden per installation (2026-11-08)

`single_config_entry: true`. One panel, one data set. Storage will still be keyed by
config entry id, so multiple gardens can be added later without migration pain.

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
`require_admin`.
