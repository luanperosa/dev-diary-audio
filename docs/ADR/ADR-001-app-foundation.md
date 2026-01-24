📄 ADR-001 — Electron App Foundation, Audio Recording and Local Storage

Status: Implemented
Date: 2026-01-23
Implementation Date: 2026-01-23
Phase: Phase 1 — Foundation (MVP)

Context

We are building a cross-platform desktop application focused on long-running audio recording sessions for developer workflow documentation.

The first phase (MVP foundation) must:

Run on Linux, macOS, and Windows

Allow continuous audio recording (hours)

Persist audio locally on disk

Avoid browser limitations related to timeouts and memory

Keep the architecture simple and extensible for future AI processing

At this stage, no transcription or AI processing is required.

Decision
Platform

Use ElectronJS as the desktop application framework.

Rationale:

Cross-platform support

Direct access to OS capabilities

Stable audio APIs via Chromium

Good fit for long-running background tasks

Audio Recording Strategy

Audio recording will be handled in the renderer process using browser media APIs.

Recording is continuous, with no hard time limit.

Audio is captured from the default system microphone.

Key constraints:

Recording must be stable for multi-hour sessions

Recording logic must be decoupled from future transcription logic

Local Audio Storage

Recorded audio is persisted locally on disk.

Audio files are saved in a dedicated app directory.

File naming must be deterministic (timestamp-based).

Example (conceptual):

/recordings
  /2026-01-23
    session-09-00/
      recording.webm


Rationale:

Long recordings should not stay in memory

Local persistence enables:

Crash recovery

Reprocessing

Offline usage

Aligns with privacy-first principles

Audio Format

Use WebM container with Opus codec (browser MediaRecorder limitation).

Audio is post-processed with ffmpeg to fix metadata and enable seeking.

Format choice rationale:

MediaRecorder API does not support WAV output natively

WebM/Opus is the most widely supported format in Chromium

Opus codec provides excellent quality for speech

ffmpeg remuxing (`-c copy`) fixes metadata without re-encoding

Resulting files are seekable and transcription-friendly

Audio quality settings:

Mono (1 channel) - sufficient for speech

44.1 kHz sample rate

Echo cancellation and noise suppression enabled

Auto Gain Control disabled (preserves natural volume)

Chunking Strategy
WebM format instead of WAV (MediaRecorder limitation)

Requires ffmpeg for optimal seekability

Slightly larger disk usage compared to compressed formats

No real-time
Chunks are immediately appended to a single file on disk.

No audio data is accumulated in renderer process memory.

Implementation:

MediaRecorder configured with 60-second timeslice

Each chunk sent to main process via IPC

Main process appends chunks using `fs.appendFileSync()`

Single continuous file per session

On recording stop, ffmpeg remuxes file to fix WebM metadata

Benefits:

Supports multi-hour recordings without memory issues

Crash recovery - partial recordings preserved

Aligns with "long recordings should not stay in memory" principle

Single file output simplifies future transcription pipeline

ffmpeg Dependency

ffmpeg is required for post-processing (optional but recommended).

The application gracefully degrades if ffmpeg is not installed:

Audio still records and saves successfully

Warning displayed to user about seekability limitations

Files may not be seekable in media players

Installation check performed on startup

Compression and optimization are explicitly deferred.

Consequences
Positive

Stable foundation for long recordings

No dependency on external services

Works fully offline

Simple mental model for future features

Clear separation between:

Recording

Storage

Processing (future)

Trade-offs

Larger disk usage due to uncompressed audio

No real-time feedback or waveform visualization

No transcription yet

Transcription (local or API)

Developer diary generation

UI polish beyond functional layout

Performance optimizations

Advanced audio processingn

UI polish

Performance optimizations

These concerns will be addressed in future ADRs.

## Implementation Status

**Status: Fully Implemented (2026-01-23)**

### Completed Features

✅ Audio recording with MediaRecorder API
✅ 60-second chunking with disk appending
✅ Single file per session output
✅ ffmpeg post-processing for metadata
✅ Recordings list UI organized by date
✅ Graceful degradation without ffmpeg
✅ Session-based directory structure
✅ Mono audio (44.1kHz) with echo cancellation and noise suppression
✅ Content Security Policy compliant

### Files Involved
- [main.js](../../main.js) - IPC handlers for recording, ffmpeg checks, file operations
- [renderer.js](../../renderer.js) - MediaRecorder logic, UI management
- [preload.js](../../preload.js) - Context bridge for audio API
- [index.html](../../index.html) - Basic UI structure

### Storage Structure
```
~/.config/dev-diary-audio/recordings/
  └── 2026-01-24/
      ├── session-09-30-15/
      │   └── recording.webm
      ├── session-14-20-30/
      │   └── recording.webm
      └── transcript-2026-01-24.txt  (added in Phase 1.5)
```

## Notes

This ADR intentionally prioritizes reliability and simplicity over feature richness.

Foundation is stable and production-ready. Subsequent ADRs build on this:
- **ADR-002**: Local transcription with Whisper
- **ADR-003**: Developer diary generation via OpenAI API