# Development

`web/` is the UI (React, Vite). `server/` is the API, media serving and Watch Party sync (Node 24, SQLite, ffmpeg).

Install Node.js 24 and FFmpeg (including `ffprobe`) before running locally.

```bash
npm --prefix web ci && npm --prefix server ci
npm --prefix web run build && npm --prefix server run build
cd server && RECORDINGS_DIR=<recordings> CACHE_DIR=<cache> npm start
```

`npm --prefix web run dev` runs the UI alone against `VITE_API_TARGET` (default `http://127.0.0.1:8080`). `npm test` in each folder runs the tests.

- The API reference at `/docs` on a running server explains how to use everything, including the principle Markdown. Its source is `server/openapi.json`; update it when behavior changes.
- Every UI string goes through `t("English text")` and has a Japanese entry in `web/src/lib/i18n.js`.
- The server logs one JSON object per line (`docker compose logs app`). The `event` field says what happened.

## New recordings

A recording is finished when its MP4 is complete: OBS writes the index and closes the file the moment recording stops. A file that never becomes complete, such as one left by a crash, counts as finished after 30 seconds without changes.

The server looks at the folder every 10 seconds. For a finished recording it extracts each player's audio, detects match ends and makes seek bar thumbnails, in that order. All of it stops while any recording is being written, so it never competes with the game. Open pages are told about every change over `/sync/stream` and update themselves.

A recording's start time is the creation time OBS stores in the file. For a file without one, it is the time in the file name, read in the `TZ` zone (default `UTC`).

## Match end detection

Detection reads the keyframes of the game screen: the whole picture for a single-track recording, the top-left cell for a grid. It looks at two spots at the bottom of the Apex Legends screen:

- the red button of the "return to lobby" hint, which is shown from the moment the squad is eliminated
- the hint bar next to it, which turns black on the result screens

A match end is either that button staying on for several frames, or the bar turning black with the button showing up shortly before or after. Ends closer than 150 seconds to the previous one are dropped.

The spots are tuned for a 16:9 screen with the Japanese UI and a gamepad. Other setups need different coordinates in `server/src/detect.ts`.

## Landing page and guides

Guide sources live in `docs/en/` and `docs/ja/` with matching file names. Each topic owns its instructions; the README and landing page link to them.

Install guide dependencies with `npm --prefix docs ci`. Run `npm --prefix web run dev:docs` alongside `npm --prefix web run dev:pages -- --port 4173` to preview both at `http://127.0.0.1:4173/apex-hanseikai/`.

`npm --prefix web run build:pages` builds the landing page and VitePress guides together into `site-dist/`, ready for GitHub Pages.

Shared screenshots, diagrams and the OBS preset live in `docs/public/`. The landing page and guides reuse those assets. Pushes to `main` run the tests and publish `site-dist/` to GitHub Pages.
