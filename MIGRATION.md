# Frontend TypeScript Migration

This frontend has been migrated from JavaScript to TypeScript. Here's what changed:

## Project Structure

```
pluto/
├── src/                       # TypeScript source files
│   ├── background.ts          # Service worker
│   ├── db-client.ts           # Database client
│   └── popup/
│       ├── popup.ts           # Popup UI logic
│       ├── popup.html         # Popup HTML template
│       ├── popup.css          # Popup styles
│       └── dev-mock.ts        # Development mock
├── dist/                      # Compiled JavaScript output
│   ├── background.js
│   ├── db-client.js
│   └── popup/
│       ├── popup.js
│       ├── popup.html
│       ├── popup.css
│       └── dev-mock.js
├── scripts/
│   └── copy-assets.js         # Build script for copying static assets
├── tsconfig.json              # TypeScript configuration
├── package.json               # NPM dependencies and scripts
└── manifest.json              # Chrome extension manifest (updated to use dist/)
```

## Setup & Building

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Build TypeScript:**
   ```bash
   npm run build
   ```

3. **Watch mode (for development):**
   ```bash
   npm run watch
   ```

4. **Clean build artifacts:**
   ```bash
   npm run clean
   ```

## Key Changes from JavaScript

### Type Safety
- All files now have proper TypeScript type annotations
- Interfaces defined for Chrome API objects, messages, and data structures
- Strict mode enabled in tsconfig.json

### File Structure
- JavaScript files moved from root and `popup/` to `src/` directory
- Compiled output goes to `dist/` directory
- HTML and CSS files are copied during build process

### Chrome Extension Integration
- Service worker paths updated in `manifest.json` to point to `dist/background.js`
- Popup page updated to reference compiled JavaScript files
- Type definitions for Chrome APIs included

### Build System
- Uses TypeScript compiler (`tsc`)
- Custom build script copies static assets to dist
- Source maps generated for debugging

## Loading into Chrome

1. Ensure you've run `npm run build` to generate dist files
2. Open `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked"
5. Select the project root directory
6. Chrome will look for manifest.json and load the compiled code from dist/

## Development Workflow

1. Make changes to `.ts` files in `src/`
2. Run `npm run watch` to automatically compile on save
3. In Chrome extensions page, click the refresh icon on the Pluto extension
4. Test your changes in the popup

## Files Migrated

- `background.js` → `src/background.ts`
- `popup/popup.js` → `src/popup/popup.ts`
- `popup/dev-mock.js` → `src/popup/dev-mock.ts`
- `db-client.js` → `src/db-client.ts`
- Static files (HTML, CSS) remain in `src/popup/` and are copied to `dist/popup/` during build

## Notes

- The `db-client.ts` is compiled but currently unused in the popup (the background service worker has its own client logic)
- Development mock (`dev-mock.ts`) is useful for testing the UI without a running backend
- All async/await and Promise-based code is fully typed
