# Pluto Extension (TypeScript)

Primary browser extension codebase for Pluto.

## Structure

- `src/` - TypeScript source files
- `dist/` - compiled output used by Chrome extension runtime
- `manifest.json` - extension manifest (points to `dist/*`)
- `scripts/copy-assets.js` - copies popup HTML/CSS into `dist/popup`

## Commands

From repo root:

```bash
pnpm --filter @pluto/extension-ts build
pnpm --filter @pluto/extension-ts dev
```

Or from this directory:

```bash
pnpm build
pnpm dev
```

## Load In Browser

1. Build the extension (`pnpm build`)
2. Open `chrome://extensions`
3. Enable Developer Mode
4. Click Load unpacked
5. Select this directory: `apps/extension-ts`
