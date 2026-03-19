# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run start    # Start Vite dev server + Electron (runs both concurrently)
npm run package  # Build React (vite build) then package with electron-forge
npm run make     # Build React then create platform-specific installers
```

There are no tests configured (`npm test` exits with error).

## Architecture

This is an **Electron desktop app** with a strict main/renderer process separation:

- **`main.js`** — Main process. All IPC handlers live here. Handles file I/O, spawns external processes (ffmpeg, whisper CLI), and manages the OpenAI API call via the adapter. In dev it loads `http://localhost:5173`; in production it loads `dist/index.html`. Must stay **CommonJS** (`require`) — Electron's main process does not support ESM.
- **`preload.js`** — Context bridge. Exposes `window.audioAPI` and `window.versions` to the renderer. All renderer→main communication must go through these exposed methods. Also must stay **CommonJS**.
- **`src/`** — React frontend (Vite/ESM). Entry point is `src/main.jsx` → `src/App.jsx` → components.
- **`renderer.js`** — Dead code, leftover from before the React migration. Ignore it.

### IPC Communication Pattern

The renderer calls `window.audioAPI.*` methods (defined in `preload.js`), which invoke IPC channels handled in `main.js`. Adding a new feature requires touching all three files: add the handler in `main.js`, expose it in `preload.js`, call it from `src/` React code.

### React Frontend Structure

- `src/App.jsx` — All recording state + logic. Uses `useRef` for mutable imperative handles (MediaRecorder, AudioStream, session path). Passes `onRefresh` down to reload the recordings list after transcription/diary generation.
- `src/components/DayCard.jsx` — Manages per-day state (transcript/diary visibility, transcription progress, diary generation). Contains the multi-step transcription flow.
- `src/components/RecordingsList.jsx`, `RecordingControls.jsx`, `WhisperBanner.jsx` — Presentational components.

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

Uses an adapter pattern in `lib/api/`:
- `adapter.js` — Abstract base class with `generateDiary()`, `validate()`, `getName()`
- `openai-adapter.js` — Concrete implementation using Node's built-in `https` module (no SDK dependency)
- `lib/prompts/diary-prompt.js` — Prompt templates (used by `main.js`, overriding the adapter's built-in defaults)

To add a new AI provider, extend `APIAdapter` and instantiate it in the `generate-diary` IPC handler in `main.js`.

### Configuration

Requires a `.env` file at the project root (copy from `.env.example`):
```env
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
OPENAI_MAX_TOKENS=4000
OPENAI_TEMPERATURE=0.7
```

External CLI dependencies required at runtime: **ffmpeg** and **whisper** (Python `openai-whisper` package, model hardcoded to `small`).
