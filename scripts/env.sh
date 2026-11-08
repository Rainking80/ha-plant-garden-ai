#!/usr/bin/env bash
# Shared environment for the dev scripts. Source it, do not execute it.
# The virtualenv lives outside the repo so that it also works fast when the
# repo sits on a Windows drive mounted into WSL (/mnt/...).
export PATH="$HOME/.local/bin:$PATH"
export UV_PROJECT_ENVIRONMENT="${UV_PROJECT_ENVIRONMENT:-$HOME/.venvs/ha-plant-garden}"
export UV_LINK_MODE=copy
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export REPO_ROOT
