# Pluto Extension (Legacy JavaScript)

Legacy JavaScript version of the Pluto extension, kept as a separate app for compatibility and migration reference.

## Structure

- `background.js` - service worker
- `popup/` - popup UI assets and scripts
- `manifest.json` - extension manifest for legacy layout

## Load In Browser

1. Open `chrome://extensions`
2. Enable Developer Mode
3. Click Load unpacked
4. Select this directory: `apps/legacy-js`

## Notes

- This app is intentionally isolated from the TypeScript app.
- Prefer new feature work in `apps/extension-ts`.
