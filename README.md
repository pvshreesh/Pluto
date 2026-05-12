# Pluto: A Calm Browser Memory and Continuity Layer

This repository is now a `pnpm` + Turborepo monorepo for Pluto's extension and backend apps.

## Monorepo Layout

- `apps/extension-ts` - TypeScript browser extension (primary extension codebase)
- `apps/legacy-js` - Legacy JavaScript extension codebase
- `apps/server-node` - Node.js backend (Postgres + Neo4j + embeddings)
- `apps/server-python` - Python backend (FastAPI)
- `plan.md` - MVP execution plan
- `SETUP.md` - setup and runtime instructions

## Workspace Commands

From the repo root:

```bash
pnpm install
pnpm build
pnpm build:extension
pnpm dev
pnpm dev:extension
pnpm dev:node
pnpm dev:python
pnpm test
pnpm test:python
pnpm migrate
pnpm migrate:node
pnpm migrate:python
```

## App-Specific Commands

### TypeScript extension

```bash
cd apps/extension-ts
pnpm install
pnpm build
# chrome://extensions -> Load unpacked -> select apps/extension-ts
```

### Node backend

```bash
cd apps/server-node
pnpm install
pnpm run migrate
pnpm start
```

### Python backend

```bash
cd apps/server-python
make dev
# or: make test / make migrate
```

## Notes

- `apps/extension-ts/manifest.json` points at built assets in `apps/extension-ts/dist`.
- `apps/legacy-js` is preserved as a separate app for comparison or phased retirement.
- Turborepo orchestrates scripts across apps; Python tasks are wired via `make`.
