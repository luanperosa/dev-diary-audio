# Developer Diary Audio Recorder

A cross-platform Electron desktop application for continuous, multi-hour audio recording sessions with AI-powered transcription and developer diary generation.

## 🎯 What is this?

This app helps developers document their workflow by:

1. **Recording** long audio sessions (hours if needed) of their work commentary
2. **Transcribing** the audio locally using Whisper AI (automatic language detection)
3. **Generating** structured developer diary reports summarizing daily work

Privacy-first, offline-capable, and optimized for daily developer use.

## ✨ Features

- ✅ **Long-duration audio recording** - Record for hours without memory issues
- ✅ **Chunk-based persistence** - Audio saved directly to disk in 60-second chunks
- ✅ **Local transcription** - Powered by Whisper CLI with automatic language detection
- ✅ **Mixed-language support** - Handles Portuguese, English, and other languages seamlessly
- ✅ **Developer diary generation** - AI-powered daily summaries via OpenAI API
- ✅ **Offline-first** - Recording and transcription work without internet
- ✅ **Cross-platform** - Linux, macOS, Windows support via Electron

## 📋 Requirements

### Core Dependencies

- **Node.js** 16+ and npm
- **Electron** (installed via npm)
- **ffmpeg** (optional but recommended for audio post-processing)

### For Transcription

- **Whisper CLI** - Required for local transcription feature

### For Diary Generation

- **OpenAI API key** - Required for developer diary generation

## 🚀 Installation

### 1. Clone and Install

```bash
git clone <repository-url>
cd dev-diary-audio
npm install
```

### 2. Install ffmpeg

ffmpeg fixes WebM metadata to enable seeking in media players.

**Ubuntu/Debian:**
```bash
sudo apt install ffmpeg
```

**macOS:**
```bash
brew install ffmpeg
```

**Windows:**
Download from [ffmpeg.org](https://ffmpeg.org/download.html) and add to PATH.

### 3. Install Whisper CLI (Required for Transcription)

Whisper requires Python 3.8+.

**Install Python**
```bash
sudo apt install python3 python3-venv python3-pip
```

**Create a venv**
```bash
mkdir whisper-local
cd whisper-local
python3 -m venv .venv
source .venv/bin/activate
```

**Install via pip:**
```bash
pip install --upgrade pip
pip install openai-whisper
```

**Verify installation:**
```bash
whisper --help
```

**Note:** Whisper also requires ffmpeg (see step 2 above).

For more details, see the [official Whisper repository](https://github.com/openai/whisper).

### 4. Configure OpenAI API (Required for Diary Generation)

Create a `.env` file in the project root:

```bash
cp .env.example .env
```

Edit `.env` and add your OpenAI API key:

```env
OPENAI_API_KEY=your-api-key-here
OPENAI_MODEL=gpt-4o-mini
OPENAI_MAX_TOKENS=4000
OPENAI_TEMPERATURE=0.7
```

**Get an API key:** [platform.openai.com/api-keys](https://platform.openai.com/api-keys)

## 🎮 Usage

### Running the App

```bash
npm run start
```

### Recording Audio

1. Click **"Start Recording"** button
2. Grant microphone permissions when prompted
3. Speak naturally - the app handles long sessions automatically
4. Click **"Stop Recording"** when done

Audio is saved to: `~/.config/dev-diary-audio/recordings/YYYY-MM-DD/session-HH-MM-SS/`

### Transcribing Recordings

1. Browse to a date with recordings
2. Click **"Generate Transcription for [date]"**
3. Wait for Whisper to process all audio files (this may take time for long recordings)
4. Transcript appears automatically when complete

Transcripts are saved as: `recordings/YYYY-MM-DD/transcript-YYYY-MM-DD.txt`

### Generating Developer Diary

1. Ensure a transcript exists for the day
2. Click **"Generate Developer Diary"**
3. Wait for OpenAI API to generate the diary
4. Diary appears automatically when complete

Diaries are saved as: `recordings/YYYY-MM-DD/diary.txt`

## 📦 Building Distributables

### Package without installer
```bash
npm run package
```

### Create platform-specific installers
```bash
npm run make
```

This creates `.deb`, `.rpm`, `.zip`, or Windows installers depending on your platform.

## 📁 File Locations

### Development
- **Recordings:** `~/.config/dev-diary-audio/recordings/` (Linux)
- **Recordings:** `~/Library/Application Support/dev-diary-audio/recordings/` (macOS)
- **Recordings:** `%APPDATA%/dev-diary-audio/recordings/` (Windows)

### Directory Structure
```
recordings/
  └── 2026-01-24/
      ├── session-09-30-15/
      │   ├── recording.webm
      │   └── recording.json (Whisper output)
      ├── session-14-20-30/
      │   ├── recording.webm
      │   └── recording.json
      ├── transcript-2026-01-24.txt
      └── diary.txt
```

## 🏗️ Architecture

### Audio Recording Pipeline
1. **Renderer process:** MediaRecorder API captures from microphone
2. **60-second chunks:** Automatic flushing prevents memory buildup
3. **IPC to main:** Chunks sent via `append-audio-chunk` handler
4. **Main process:** Immediately appends to disk using `fs.appendFileSync()`
5. **Post-processing:** ffmpeg remuxes WebM for better compatibility

### Audio Settings
- **Format:** WebM (Opus codec)
- **Channels:** Mono (sufficient for speech)
- **Sample Rate:** 44.1 kHz
- **Enhancements:** Echo cancellation, noise suppression enabled

### Transcription Flow
1. Whisper processes each recording independently
2. Outputs JSON with timestamped segments
3. App merges all segments chronologically
4. Single daily transcript file created

### Diary Generation Flow
1. Reads daily transcript
2. Sends to OpenAI API with specialized prompt
3. Returns structured summary of developer's day
4. Saves locally as plain text

### Key Files
- [main.js](main.js) - IPC handlers, file operations, external process execution
- [renderer.js](renderer.js) - MediaRecorder logic, UI state management
- [preload.js](preload.js) - Secure communication bridge between main and renderer

## 📖 Documentation

See the `docs/ADR/` directory for detailed architectural decision records

## ⚠️ Known Limitations

- Transcription cannot be cancelled once started
- No real-time transcription progress updates
- Whisper model hardcoded to 'small' (balance of speed/accuracy)
- Diary generation requires internet connection
- No versioning or history of diary entries

## 🤝 Contributing

This is currently a personal developer tool. Future contributions may be welcome as the project evolves.

## 📄 License

MIT

## 🙏 Acknowledgments

- [Whisper](https://github.com/openai/whisper) by OpenAI for excellent speech-to-text
- [Electron](https://www.electronjs.org/) for cross-platform desktop app framework
- [ffmpeg](https://ffmpeg.org/) for audio processing utilities
