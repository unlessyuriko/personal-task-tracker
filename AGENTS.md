# AGENTS.md

## Project overview
This repository contains a browser extension called Personal Focus Board. It overrides the new tab page with a productivity dashboard that includes:
- a live clock and greeting
- a task manager with priorities and drag-and-drop ordering
- a main-focus display driven by the current task list
- optional wallpaper and name settings stored in extension storage

## Web app (webapp/)
- Lavo, a lavender web-app version of the tracker: webapp/index.html, styles.css, app.js (plain HTML/CSS/JS, no build, no login).
- Data is stored in the browser's localStorage under the key `lavo.v1`; it can import the old extension's JSON backups.
- Must be served over http(s); run `node serve.js` and open http://localhost:5173 (opening the file directly can block storage).
- Check with: `node --check webapp/app.js`

## Important project facts
- The extension source lives in the extension/ folder.
- The extension is built with plain HTML, CSS, and JavaScript; there is no build step.
- The extension must remain compatible with Chrome/Edge Manifest V3.
- Core extension APIs used include chrome.storage.local and chrome.identity.

## File map
- extension/manifest.json: Manifest V3 configuration
- extension/newtab.html: Extension page structure
- extension/app.js: UI logic, storage, task behavior, settings
- extension/styles.css: Layout and styling
- extension/assets/: wallpaper and other static assets
- extension/icons/: extension icons

## Working guidelines
- Preserve the browser extension behavior when editing files.
- Keep paths relative to the extension folder.
- Avoid adding a bundler or framework unless explicitly requested.
- If you change the UI structure, keep IDs used by app.js intact.
- If you change settings or storage keys, update both the storage logic and the UI accordingly.

## Verification
Before claiming the project is ready, verify the following:
- manifest.json is valid JSON
- app.js has no syntax errors

Example checks:
- python -m json.tool extension/manifest.json > /dev/null
- node --check extension/app.js
