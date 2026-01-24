ADR-003 — Developer Diary Generation via OpenAI API

Status: Implemented
Date: 2026-01-24
Phase: Phase 2 — Intelligence Layer
Implementation Date: 2026-01-24

Context

The application already supports:

Long audio recordings

Daily local audio storage

Local transcription using Whisper CLI

Generation of a raw daily transcript stored locally

The next step is to transform this raw transcript into a structured Developer Diary, summarizing the developer’s daily work.

Constraints:

The diary is generated after transcription

The transcription is the single source of truth

Diary generation is on-demand, not automatic

The solution should be simple, replaceable, and API-driven

Decision

## Diary Generation Strategy

Use OpenAI API to generate the Developer Diary

Work with adapters to enable switching API providers in the future

Send the full daily transcript as input

Use a single prompt to generate the diary

Persist the result locally as a text file

**Rationale:**

- Diary generation benefits from strong reasoning models
- Token volume is manageable (text, not audio)
- API usage is predictable and low-frequency
- Avoids running a large LLM locally at this stage

## Trigger Model

Diary generation is triggered manually via the frontend:

- Button labeled "Generate Developer Diary"
- The action is available only after a transcript exists for the day
- This keeps transcription and diary generation clearly separated

## Input Data

Input to the API:

- The merged daily transcript (raw text)
- A predefined system/user prompt

The transcript is sent as-is, without cleanup or preprocessing.

## Prompt Strategy

Use a stable prompt template focused on:

- Summary of the day
- Tasks worked on
- Technical decisions
- Problems encountered
- Next steps

Prompt engineering is intentionally kept simple and centralized.

## Output Format

API response is expected to return:

- Plain text (Markdown-compatible)

The output is saved as `diary.txt` in the same directory as:

- `transcript.txt`
- `transcript.json`

Example structure:
```
~/.config/dev-diary-audio/recordings/2026-01-24/
  ├── transcript.txt
  ├── transcript.json
  └── diary.txt
```

## Frontend Behavior

UI provides a button:

“Generate developer diary” (after the diary.txt was generated we can hide this button)

this button is only visible if the transcription.txt was already created

While generation is running:

Show loading indicator

Disable repeated actions

After completion:

Display diary content inside a textarea (just like was done with the transcription.txt)

Diary is visible and persistent across app restarts (just like was done with the transcription.txt, the diary.txt is kept under the .config/dev-diary-audio/recordings/<day-folder>)

No autosave, versioning, or formatting tools are included at this stage.

## Process Responsibilities

### Renderer Process

- User interaction
- Trigger diary generation
- Display loading state and errors
- Render diary content in textarea

### Main Process

- Read daily transcript file
- Build API request payload
- Call OpenAI API
- Handle errors and retries
- Persist diary output to disk

### OpenAI API (External)

- Generate structured diary text
- No long-term state
- No storage responsibility

## Error Handling

If API call fails:

- Error message is shown to the user
- No files are overwritten
- User can retry manually

If transcript file is missing:

- Diary generation button is disabled or hidden

**Security:**

- API keys are never exposed to the renderer process
- API keys are stored in a `.env` file that is never version controlled
- Add `.env` to `.gitignore` immediately

## Consequences

### Positive

- Clear separation between transcription and reasoning
- Simple, deterministic workflow
- Easy to swap API provider later
- Diary output is reusable and editable
- Low API cost

### Trade-offs

- Requires internet connection
- Depends on third-party API availability
- Diary quality depends on prompt quality

These trade-offs are acceptable for Phase 2.

Out of Scope

Local LLM diary generation

Diary versioning or history
## Out of Scope

- Local LLM diary generation
- Diary versioning or history
- Multiple diary formats
- Automatic diary generation
- Prompt customization UI
- Analytics or insights

These features may be addressed in future phases.

## Implementation Notes

- The OpenAI API model to use: `gpt-4o` or `gpt-4o-mini` (configurable)
- Maximum token limit for API calls should be configured
- API timeout should be set (e.g., 60 seconds)
- Use `dotenv` package for environment variable management

## Implementation Tasks

**Status: All tasks completed on 2026-01-24**

1. ✅ **Environment setup for API integration**
   - Installed dotenv package
   - Created .env.example file with OpenAI configuration
   - .env already in .gitignore

2. ✅ **Create API adapter abstraction layer**
   - Created `lib/api/adapter.js` with base adapter interface
   - Created `lib/api/openai-adapter.js` implementing OpenAI-specific logic
   - Supports future swap to other providers

3. ✅ **Implement diary prompt template**
   - Created `lib/prompts/diary-prompt.js` with system and user prompt templates
   - Focuses on: summary, tasks, technical decisions, problems, next steps

4. ✅ **Add IPC handler for diary generation**
   - Implemented `generate-diary` handler in main.js
   - Reads transcript files (supports flexible naming)
   - Calls OpenAI adapter with error handling
   - Saves diary.txt to disk
   - Returns proper success/error responses

5. ✅ **Expose diary API in preload.js**
   - Added to contextBridge: `generateDiary`, `readDiary`, `checkDiaryExists`

6. ✅ **Update UI for diary generation**
   - Shows "Generate Developer Diary" button only when transcript exists
   - Shows toggle button when diary exists
   - Displays diary in formatted textarea
   - Loading states and status messages implemented

7. ✅ **Implement diary file reading on day selection**
   - Modified `list-recordings` to include diary data
   - Diary loads automatically when browsing days
   - Toggle functionality implemented

8. ✅ **Add error handling and user feedback**
   - Handles all API failure scenarios
   - User-friendly error messages
   - Retry functionality
   - Fixed JSON encoding issue with Buffer

9. ✅ **Create .env.example and documentation**
   - Created .env.example with full configuration

10. ✅ **Test end-to-end diary generation flow**
    - Successfully tested and working

## Technical Implementation Details

### File Structure
```
lib/
  api/
    adapter.js          # Base adapter interface
    openai-adapter.js   # OpenAI implementation
  prompts/
    diary-prompt.js     # Centralized prompts
```

### Key Implementation Decisions

1. **Buffer Encoding Fix**: Used `Buffer.from()` for proper Content-Length calculation to fix JSON parsing errors
2. **Flexible Transcript Reading**: Supports both `transcript.txt` and `transcript-<date>.txt` naming patterns
3. **UI Pattern**: Follows same pattern as transcript feature (toggle button when exists, generate button when doesn't)
4. **Auto-reload**: After generation, UI reloads to show toggle button
5. **Day Path Passing**: Added `path` property to recordings data structure for correct IPC calls

### Known Limitations & Future Work

- UI needs refinement and styling improvements
- Code needs cleanup and better organization
- Persistence layer could be optimized
- No versioning or history of diary entries
- README documentation not yet added
- Architecture could be improved with better separation of concerns

## Notes

This ADR intentionally treats the Developer Diary as a derived artifact, not a source of truth.

The raw transcript remains the canonical record of the day.
