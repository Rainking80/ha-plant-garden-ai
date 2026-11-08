# Plant Garden – notes for coding agents

Home Assistant custom integration (HACS) with a Lit sidebar panel: garden planner,
plant journal, irrigation tracking, water balance, AI assistant with token/cost page.

- **Full specification and milestones:** [docs/AGENT_SYSTEM_PROMPT.md](docs/AGENT_SYSTEM_PROMPT.md) – read it before starting work.
- **Current state:** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), decisions in [docs/DECISIONS.md](docs/DECISIONS.md), progress in [CHANGELOG.md](CHANGELOG.md).

## Running things

HA does not run on Windows. On the Windows dev machine every Python/Node command runs
inside WSL (Ubuntu); uv and Node live in `~/.local/bin` there. From Git Bash:

```bash
MSYS_NO_PATHCONV=1 wsl.exe -d Ubuntu --cd /mnt/d/Workspace/ha-plant-maintainance --exec bash -c 'bash scripts/test -q'
```

(`--exec` avoids a second round of shell parsing; PowerShell mangles nested quotes.)
Scripts: `setup`, `test`, `test-min-version`, `lint [--fix]`, `develop`, `smoke`.
Frontend: `cd frontend && npm run build|test|lint|typecheck|format`.

## Rules that are easy to get wrong

- Use `import probatio`, not voluptuous (HA ≥ 2026.9, see D-001).
- No blocking I/O in the event loop; files, Pillow, SQLite go through the executor.
- No vendor SDKs for AI/weather providers – plain HTTP via HA's aiohttp session.
- After frontend changes run `npm run build` and commit the bundle (CI checks it).
- Keep versions in sync: `manifest.json` = `frontend/package.json` = `pyproject.toml`.
- Verify HA APIs against the installed source in `~/.venvs/ha-plant-garden/lib/python3.14/site-packages/homeassistant`, not from memory.
