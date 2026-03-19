# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run start    # Start dev (electron-vite handles Vite dev server + Electron together)
npm run package  # Build with electron-vite then package with electron-forge
npm run make     # Build then create platform-specific installers
```

There are no tests configured (`npm test` exits with error).

## Architecture

This is an **Electron desktop app** using `electron-vite` for building and dev server management. The three processes map directly to the directory structure:

- **`src/main/index.js`** — Main process. All IPC handlers live here. Handles file I/O, spawns external processes (ffmpeg, whisper CLI), manages the OpenAI API call via the adapter. Must stay **CommonJS** (`require`) — Electron main process does not support ESM.
- **`src/preload/index.js`** — Context bridge. Exposes `window.audioAPI` and `window.versions`. Must stay **CommonJS**.
- **`src/renderer/`** — React frontend (Vite/ESM). Entry: `main.jsx` → `App.jsx` → components.
- **`renderer.js`** (root) — Dead code, leftover from before the React migration. Ignore it.

In dev, `electron-vite dev` sets `ELECTRON_RENDERER_URL` and main loads from it. In production, it loads `dist/renderer/index.html`. Build output goes to `dist/` (gitignored). The `out/` directory (also gitignored) is created by electron-forge during packaging.

### Build Details

`electron.vite.config.js` defines three build targets outputting to `dist/main/`, `dist/preload/`, and `dist/renderer/`. A custom `copyLibPlugin` copies `src/main/lib/` to `dist/main/lib/` after each build because electron-vite's SSR mode doesn't follow CJS `require()` into local files. The `externalizeDepsPlugin` keeps Node dependencies external for main and preload.

### IPC Communication Pattern

The renderer calls `window.audioAPI.*` methods (defined in `src/preload/index.js`), which invoke IPC channels in `src/main/index.js`. Adding a new feature requires touching all three: add handler in main, expose it in preload, call it from renderer React code.

### React Frontend Structure

- `src/renderer/App.jsx` — All recording state + logic. Uses `useRef` for mutable imperative handles (MediaRecorder, AudioStream, session path). Passes `onRefresh` down to reload recordings after transcription/diary generation.
- `src/renderer/components/DayCard.jsx` — Per-day state (transcript/diary visibility, transcription progress, diary generation). Contains the multi-step transcription flow.
- `src/renderer/components/RecordingsList.jsx`, `RecordingControls.jsx`, `WhisperBanner.jsx` — Presentational components.

### Audio Recording Pipeline

1. Renderer's MediaRecorder captures mic audio (WebM/Opus, mono, 44.1kHz) and flushes 60-second chunks via `append-audio-chunk` IPC
2. Main process appends chunks to disk immediately (`fs.appendFileSync`)
3. On stop, ffmpeg remuxes the WebM to fix metadata (enables seeking)
4. Files saved to: `<userData>/recordings/YYYY-MM-DD/session-HH-MM-SS/recording.webm`

### Transcription Pipeline

1. `transcribe-day` IPC scans session directories and returns a list of `.webm` files
2. Renderer calls `run-whisper-transcription` for each file sequentially
3. Whisper CLI outputs `.json` files (timestamped segments) alongside each `.webm`
4. `merge-transcripts` IPC reads all JSON files, sorts by session, and writes `transcript-YYYY-MM-DD.txt`

### Diary Generation

Uses an adapter pattern in `src/main/lib/api/`:
- `adapter.js` — Abstract base class with `generateDiary()`, `validate()`, `getName()`
- `openai-adapter.js` — Concrete implementation using Node's built-in `https` module (no SDK dependency)
- `src/main/lib/prompts/diary-prompt.js` — Prompt templates passed by the `generate-diary` IPC handler in `src/main/index.js`, overriding the adapter's built-in defaults

To add a new AI provider, extend `APIAdapter` and instantiate it in the `generate-diary` IPC handler in `src/main/index.js`.

### Configuration

Requires a `.env` file at the project root (copy from `.env.example`):
```env
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini       # default: gpt-4o-mini
OPENAI_MAX_TOKENS=2000          # default: 2000
```

Temperature is hardcoded to `0.7` in the adapter. The adapter also reads `OPENAI_TIMEOUT` (seconds, default `60`).

External CLI dependencies required at runtime: **ffmpeg** and **whisper** (Python `openai-whisper` package, model hardcoded to `small`).
