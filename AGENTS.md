# AGENTS.md

## MCP Task‑Manager
- Central queue. Manager `task_create` → workers `task_find_available` → `task_claim` → work → `task_report`.
- `.task/` stores JSON store (absolute path required). Ignored by repo.
- **Subtask rule**: create 1 → claim → work → report → repeat. Never pre‑create all subtasks.

## Core tools (high‑level)
- `task_create` / `task_claim` / `task_update` / `task_report` – lifecycle.
- `task_find_available` – workers fetch pending tasks.
- `task_list` / `task_tree` / `task_get` – monitoring.
- `task_pause` / `task_fail` / `task_cancel` – control.
- `task_stats` / `task_server_info` – diagnostics.

## Start server & run tests
```bash
# Start (absolute store path required)
node C:/Users/anhta/source/repos/tainguyenduc-com/mcp-server/taskmanager/server.js C:/absolute/path/to/.task
```
- `npm test` runs all modular tests (`test.js`).
- `node server.js <store>` overrides default store location.

## Important files to read first
- `README.md` (repo root)
- `taskmanager/docs/README.md` – detailed usage.
- `taskmanager/package.json` – scripts, Node version.

## Shortcut commands
- `npm test` → executes `node test.js` (all unit/e2e tests).
- `node server.js <store>` → custom JSON store path.

## Repo conventions
- All agents share **single JSON store** (`.task/tasks.json`).
- UUID = 36‑char standard (e.g., `1c69963b-cb65-4929-a7c8-1d1bc098776a`).
- `.task/` folder ignored – never commit.
- Tags used for routing (module name, layer, feature).
- `reportTo` defaults to `orchestrator`.
