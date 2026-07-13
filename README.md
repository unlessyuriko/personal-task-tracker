# Personal Focus Board

A lightweight browser extension that replaces your new tab page with a focused workspace. It combines a live clock, greeting, task list, and wallpaper settings in a simple, polished dashboard.

## What this project does
- Replaces the browser new tab with a personal productivity view
- Lets you manage tasks with priority, completion state, and drag-and-drop ordering
- Highlights the current main focus from your incomplete tasks
- Stores settings and tasks locally in the browser
- Supports a custom wallpaper from the settings modal

## Project structure
- extension/manifest.json — Manifest V3 configuration for the browser extension
- extension/newtab.html — Main HTML page shown in place of the new tab
- extension/app.js — UI behavior, task logic, and storage handling
- extension/styles.css — Visual styling and layout
- extension/assets/ — Static assets including wallpaper files
- extension/icons/ — Extension icons

## Install as a browser extension
1. Open your browser's extension page.
2. Enable Developer Mode.
3. Choose Load unpacked.
4. Select the extension/ folder from this repository.

## GitHub publishing notes
- This project is already structured as a plain HTML/CSS/JS extension, so it does not need a build step.
- The source files are ready to be committed and pushed to GitHub.
- The packaged zip artifact is ignored by Git so only the source remains in the repository.

## Development notes
- No dependencies or build toolchain are required.
- The extension uses browser APIs such as chrome.storage.local and chrome.identity.
- Keep the extension folder intact if you want the project to remain loadable as an unpacked extension.
