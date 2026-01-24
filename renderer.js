// UI Elements
const recordBtn = document.getElementById('recordBtn')
const stopBtn = document.getElementById('stopBtn')
const statusElement = document.getElementById('recordingStatus')
const information = document.getElementById('info')
const recordingsList = document.getElementById('recordingsList')
const whisperStatusDiv = document.getElementById('whisperStatus')

// Display version info
information.innerText = `This app is using Chrome (v${versions.chrome()}), Node.js (v${versions.node()}), and Electron (v${versions.electron()})`

// Check Whisper installation on startup
async function checkWhisperInstallation() {
  try {
    console.log('[renderer] Checking Whisper installation...')
    const result = await window.audioAPI.checkWhisper()
    console.log('[renderer] Whisper check result:', result)
    
    if (!result.installed) {
      // Build and show warning banner
      whisperStatusDiv.innerHTML = `
        <div style="padding: 10px; margin: 10px 0; border-radius: 5px; background-color: #fff3cd; border: 1px solid #ffc107; color: #856404;">
          <strong>⚠️ Whisper not installed</strong>
          <p style="margin: 5px 0; font-size: 0.9em;">${result.instructions}</p>
        </div>
      `
      whisperStatusDiv.style.display = 'block'
      console.log('[renderer] Showing Whisper not installed warning')
    } else {
      // Whisper is installed, keep div hidden
      whisperStatusDiv.style.display = 'none'
      console.log('[renderer] Whisper installed:', result.version)
    }
  } catch (error) {
    console.error('[renderer] Error checking Whisper installation:', error)
  }
}

// Run checks on startup
checkWhisperInstallation()

// Recording state
let isRecording = false
let mediaRecorder = null
let audioStream = null
let currentSessionPath = null
let currentFilename = null

// Get or create audio stream from microphone
async function getAudioStream() {
  if (audioStream) {
    return audioStream
  }
  
  try {
    audioStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,           // Mono (sufficient for speech)
        sampleRate: 44100,         // CD quality
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: false     // Disabled to prevent automatic volume adjustment
      }
    })
    
    // Monitor stream track ending (microphone disconnect)
    audioStream.getTracks()[0].addEventListener('ended', () => {
      statusElement.innerText = 'Error: Microphone disconnected'
      stopRecording()
    })
    
    return audioStream
  } catch (error) {
    throw error
  }
}

// Setup MediaRecorder with event handlers
function setupMediaRecorder(stream) {
  // Determine best MIME type
  let mimeType = 'audio/webm'
  if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
    mimeType = 'audio/webm;codecs=opus'
  }
  
  mediaRecorder = new MediaRecorder(stream, { mimeType })
  
  // Save each chunk immediately to disk as it arrives
  mediaRecorder.ondataavailable = async (event) => {
    if (event.data.size > 0) {
      try {
        const arrayBuffer = await event.data.arrayBuffer()
        
        // Append chunk to the same file
        const result = await window.audioAPI.appendAudioChunk(
          arrayBuffer,
          currentSessionPath,
          currentFilename
        )
        
        if (result.success) {
          console.log(`Chunk appended: ${event.data.size} bytes. Total: ${result.totalSize} bytes (${(result.totalSize / 1024 / 1024).toFixed(2)} MB)`)
        } else {
          console.error('Failed to append chunk:', result.error)
          statusElement.innerText = `Error: Failed to save chunk`
        }
      } catch (error) {
        console.error('Error processing chunk:', error)
      }
    }
  }
  
  // Handle recording stop
  mediaRecorder.onstop = async () => {
    console.log('Recording stopped.')
    
    const fullPath = `${currentSessionPath}/${currentFilename}`
    
    // Only remux if ffmpeg is available
    if (ffmpegAvailable) {
      statusElement.innerText = 'Processing audio with ffmpeg...'
      const result = await window.audioAPI.remuxAudio(fullPath)
      
      if (result.success) {
        statusElement.innerText = `Saved: ${result.path}`
        console.log('Audio processed successfully:', result.path)
      } else {
        statusElement.innerText = `Warning: Saved but ffmpeg failed (${result.error})`
        console.error('FFmpeg remux failed:', result.error)
      }
    } else {
      statusElement.innerText = `Saved (without ffmpeg): ${fullPath}`
      console.warn('⚠️ Audio saved but not processed (ffmpeg not available)')
      console.warn('File may not be seekable. Install ffmpeg to fix.')
    }
    
    // Reload recordings list
    loadRecordingsList()
  }
  
  // Handle errors
  mediaRecorder.onerror = (event) => {
    console.error('MediaRecorder error:', event.error)
    statusElement.innerText = `Error: ${event.error.name}`
    stopRecording()
  }
}

// Stop recording and cleanup
function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop()
  }
  
  isRecording = false
  recordBtn.disabled = false
  stopBtn.disabled = true
}

// Cleanup audio stream
function cleanupAudioStream() {
  if (audioStream) {
    audioStream.getTracks().forEach(track => track.stop())
    audioStream = null
  }
}

// Check ffmpeg availability on startup
let ffmpegAvailable = false

async function checkFfmpegAvailability() {
  const result = await window.audioAPI.checkFfmpeg()
  ffmpegAvailable = result.installed
  
  if (!result.installed) {
    console.warn('⚠️ ffmpeg not found. Audio files may not be seekable in media players.')
    console.warn('Install ffmpeg: sudo apt install ffmpeg')
    statusElement.innerText = 'Warning: ffmpeg not installed (audio may not be seekable)'
  } else {
    console.log('✓ ffmpeg detected:', result.version)
    statusElement.innerText = 'Ready'
  }
}

// Load and display recordings list
async function loadRecordingsList() {
  const result = await window.audioAPI.listRecordings()
  
  if (!result.success) {
    recordingsList.innerHTML = '<p>Error loading recordings</p>'
    return
  }
  
  const recordings = result.recordings
  const dates = Object.keys(recordings)
  
  if (dates.length === 0) {
    recordingsList.innerHTML = '<p>No recordings yet</p>'
    return
  }
  
  let html = ''
  
  for (const date of dates) {
    const dayData = recordings[date]
    
    // Use new data structure: dayData.sessions and dayData.transcript
    const sessions = dayData.sessions || []
    const transcript = dayData.transcript
    const diary = dayData.diary
    const dayPath = dayData.path // Get the day path for IPC calls
    
    if (sessions.length > 0) {
      html += `<br><hr><h2>${date}</h2>`
      
      for (const session of sessions) {
        const sizeInMB = (session.size / 1024 / 1024).toFixed(2)
        const time = session.sessionName.replace('session-', '')
        html += `<p>${time} - ${session.filename} (${sizeInMB} MB)</p>`
      }
      
      // Transcription section for this day
      html += `<div style="margin-top: 15px; padding: 10px; background-color: #f8f9fa; border-radius: 5px;">`
      
      // Check if transcript already exists
      if (transcript) {
        html += `<p style="color: #28a745; margin: 5px 0;"><strong>✓ Transcript available</strong></p>`
        html += `<button class="toggle-transcript-btn" data-date="${date}" style="margin: 5px 0;">Hide Transcript</button>`
        html += `<div id="transcript-${date}" style="display: block; margin-top: 10px;">
                   <textarea readonly style="width: 100%; height: 300px; font-family: monospace; font-size: 0.9em; padding: 10px;">${transcript.content}</textarea>
                 </div>`
        
        // Developer Diary section (only shown if transcript exists)
        html += `<div style="margin-top: 15px; padding: 10px; background-color: #e7f3ff; border-radius: 5px;">`
        html += `<h4 style="margin: 5px 0;">Developer Diary</h4>`
        
        // Check if diary already exists
        if (diary) {
          html += `<p style="color: #28a745; margin: 5px 0;"><strong>✓ Diary available</strong></p>`
          html += `<button class="toggle-diary-btn" data-date="${date}" style="margin: 5px 0;">Hide Diary</button>`
          html += `<div id="diary-${date}" style="display: block; margin-top: 10px;">
                     <textarea readonly style="width: 100%; height: 300px; font-family: sans-serif; font-size: 0.95em; padding: 10px; line-height: 1.5;">${diary.content}</textarea>
                   </div>`
        } else {
          html += `<button class="generate-diary-btn" data-date="${date}" data-path="${dayPath}" style="margin: 5px 0;">Generate Developer Diary</button>`
          html += `<p id="diary-status-${date}" style="margin: 5px 0; font-size: 0.9em;"></p>`
        }
        
        html += `</div>`
      } else {
        html += `<button class="generate-transcript-btn" data-date="${date}">Generate Transcription for ${date}</button>`
        html += `<p id="status-${date}" style="margin: 5px 0; font-size: 0.9em;"></p>`
      }
      
      html += `</div>`
    }
  }
  
  recordingsList.innerHTML = html
  
  // Attach event listeners after rendering
  attachTranscriptionEventListeners()
  attachDiaryEventListeners()
}

// Attach event listeners to transcription buttons
function attachTranscriptionEventListeners() {
  // Generate/Regenerate transcription buttons
  document.querySelectorAll('.generate-transcript-btn').forEach(button => {
    button.addEventListener('click', (e) => {
      const date = e.target.getAttribute('data-date')
      generateTranscription(date)
    })
  })
  
  // Toggle transcript view buttons
  document.querySelectorAll('.toggle-transcript-btn').forEach(button => {
    button.addEventListener('click', (e) => {
      const date = e.target.getAttribute('data-date')
      toggleTranscript(date)
    })
  })
}

// Attach event listeners to diary buttons
function attachDiaryEventListeners() {
  // Generate diary buttons
  document.querySelectorAll('.generate-diary-btn').forEach(button => {
    button.addEventListener('click', (e) => {
      const date = e.target.getAttribute('data-date')
      const dayPath = e.target.getAttribute('data-path')
      generateDiary(date, dayPath)
    })
  })
  
  // Toggle diary view buttons
  document.querySelectorAll('.toggle-diary-btn').forEach(button => {
    button.addEventListener('click', (e) => {
      const date = e.target.getAttribute('data-date')
      toggleDiary(date)
    })
  })
}

// Generate developer diary from transcript
async function generateDiary(date, dayPath) {
  const statusEl = document.getElementById(`diary-status-${date}`)
  const generateBtn = document.querySelector(`.generate-diary-btn[data-date="${date}"]`)
  
  if (!statusEl || !generateBtn) return
  
  try {
    // Disable button and show loading
    generateBtn.disabled = true
    generateBtn.textContent = 'Generating...'
    statusEl.textContent = 'Calling OpenAI API to generate diary...'
    statusEl.style.color = '#007bff'
    
    // Call the generate-diary IPC handler
    const result = await window.audioAPI.generateDiary(dayPath)
    
    if (result.success) {
      statusEl.textContent = '✓ Diary generated successfully! Reloading...'
      statusEl.style.color = '#28a745'
      
      // Reload the recordings list to show the toggle button
      setTimeout(() => {
        loadRecordingsList()
      }, 1000)
    } else {
      // Show error
      statusEl.textContent = `Error: ${result.error}`
      statusEl.style.color = '#dc3545'
      
      // Re-enable button
      generateBtn.disabled = false
      generateBtn.textContent = 'Retry Generate Diary'
      generateBtn.style.backgroundColor = '#dc3545'
    }
  } catch (error) {
    console.error('Error generating diary:', error)
    statusEl.textContent = `Error: ${error.message}`
    statusEl.style.color = '#dc3545'
    
    // Re-enable button
    generateBtn.disabled = false
    generateBtn.textContent = 'Retry Generate Diary'
    generateBtn.style.backgroundColor = '#dc3545'
  }
}

// Toggle diary visibility
function toggleDiary(date) {
  const diaryDiv = document.getElementById(`diary-${date}`)
  const toggleBtn = document.querySelector(`.toggle-diary-btn[data-date="${date}"]`)
  
  if (diaryDiv && toggleBtn) {
    if (diaryDiv.style.display === 'none') {
      diaryDiv.style.display = 'block'
      toggleBtn.textContent = 'Hide Diary'
    } else {
      diaryDiv.style.display = 'none'
      toggleBtn.textContent = 'Show Diary'
    }
  }
}

// Run checks and load data on startup
checkFfmpegAvailability()
loadRecordingsList()

// Record button handler
recordBtn.addEventListener('click', async () => {
  try {
    // Prevent double-start
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      console.warn('Already recording')
      return
    }
    
    // Create session directory path (timestamp-based)
    const baseDir = await window.audioAPI.getRecordingPath()
    const now = new Date()
    const dateStr = now.toISOString().split('T')[0]
    const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-')
    currentSessionPath = `${baseDir}/${dateStr}/session-${timeStr}`
    currentFilename = 'recording.webm'
    
    // Get audio stream (requests permission if needed)
    statusElement.innerText = 'Requesting microphone access...'
    const stream = await getAudioStream()
    
    // Setup MediaRecorder
    setupMediaRecorder(stream)
    
    // Start recording with 60-second chunks (flushes to disk every minute)
    mediaRecorder.start(60000)
    
    // Update UI
    isRecording = true
    recordBtn.disabled = true
    stopBtn.disabled = false
    statusElement.innerText = 'Recording... (saving every 60s)'
    
    console.log('Recording started:', currentSessionPath)
  } catch (error) {
    // Handle permission and device errors
    let userMessage = 'Failed to start recording'
    
    if (error.name === 'NotAllowedError') {
      userMessage = 'Error: Microphone access denied'
    } else if (error.name === 'NotFoundError') {
      userMessage = 'Error: No microphone found'
    } else if (error.name === 'NotReadableError') {
      userMessage = 'Error: Microphone in use by another app'
    } else if (error.name === 'OverconstrainedError') {
      userMessage = 'Error: Audio constraints not supported'
    }
    
    statusElement.innerText = userMessage
    console.error('Recording error:', error)
    
    // Reset UI state
    recordBtn.disabled = false
    stopBtn.disabled = true
  }
})

// Stop button handler
stopBtn.addEventListener('click', () => {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    statusElement.innerText = 'Stopping...'
    stopRecording()
  }
})

// Transcription: Generate transcription for selected date
async function generateTranscription(selectedDate) {
  const statusElement = document.getElementById(`status-${selectedDate}`)
  
  if (!selectedDate) {
    if (statusElement) statusElement.innerText = 'Error: No date provided'
    return
  }
  
  try {
    // Find and disable the button for this date
    const buttons = document.querySelectorAll(`button[onclick*="${selectedDate}"]`)
    buttons.forEach(btn => btn.disabled = true)
    
    if (statusElement) statusElement.innerText = `Checking recordings for ${selectedDate}...`
    
    // Step 1: Get list of audio files for this date
    const dayResult = await window.audioAPI.transcribeDay(selectedDate)
    
    if (!dayResult.success) {
      if (statusElement) statusElement.innerText = `Error: ${dayResult.error}`
      buttons.forEach(btn => btn.disabled = false)
      return
    }
    
    console.log(`[transcription] Found ${dayResult.count} files to transcribe`)
    if (statusElement) statusElement.innerText = `Found ${dayResult.count} audio file(s). Starting transcription...`
    
    // Step 2: Transcribe each audio file
    let completedCount = 0
    const errors = []
    
    for (const file of dayResult.files) {
      if (statusElement) statusElement.innerText = `Transcribing ${file.session}/${file.filename} (${completedCount + 1}/${dayResult.count})...`
      console.log(`[transcription] Processing: ${file.filename}`)
      
      const transcribeResult = await window.audioAPI.runWhisperTranscription(file.path)
      
      if (transcribeResult.success) {
        completedCount++
        console.log(`[transcription] Completed: ${file.filename}`)
      } else {
        console.error(`[transcription] Failed: ${file.filename}`, transcribeResult.error)
        errors.push(`${file.filename}: ${transcribeResult.error}`)
      }
    }
    
    if (completedCount === 0) {
      if (statusElement) statusElement.innerText = `Error: All transcriptions failed. ${errors.join('; ')}`
      buttons.forEach(btn => btn.disabled = false)
      return
    }
    
    // Step 3: Merge all transcripts into one file
    if (statusElement) statusElement.innerText = 'Merging transcripts...'
    const mergeResult = await window.audioAPI.mergeTranscripts(selectedDate)
    
    if (!mergeResult.success) {
      if (statusElement) statusElement.innerText = `Error merging transcripts: ${mergeResult.error}`
      buttons.forEach(btn => btn.disabled = false)
      return
    }
    
    console.log(`[transcription] Merged ${mergeResult.segmentCount} segments`)
    
    // Step 4: Reload the recordings list to show the new transcript
    await loadRecordingsList()
    
    console.log(`✓ Transcription complete for ${selectedDate}`)
    
  } catch (error) {
    console.error('[transcription] Unexpected error:', error)
    if (statusElement) statusElement.innerText = `Unexpected error: ${error.message}`
    const buttons = document.querySelectorAll(`button[onclick*="${selectedDate}"]`)
    buttons.forEach(btn => btn.disabled = false)
  }
}

// Toggle transcript visibility for a specific date
function toggleTranscript(date) {
  const transcriptDiv = document.getElementById(`transcript-${date}`)
  const button = document.querySelector(`.toggle-transcript-btn[data-date="${date}"]`)
  
  if (transcriptDiv && button) {
    if (transcriptDiv.style.display === 'none') {
      transcriptDiv.style.display = 'block'
      button.innerText = 'Hide Transcript'
    } else {
      transcriptDiv.style.display = 'none'
      button.innerText = 'View Transcript'
    }
  }
}