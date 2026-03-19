import { useState, useRef, useEffect, useCallback } from 'react'
import WhisperBanner from './components/WhisperBanner'
import RecordingControls from './components/RecordingControls'
import RecordingsList from './components/RecordingsList'

export default function App() {
  // Mutable refs — don't trigger re-renders
  const mediaRecorderRef = useRef(null)
  const audioStreamRef = useRef(null)
  const currentSessionPathRef = useRef(null)
  const currentFilenameRef = useRef(null)
  const ffmpegAvailableRef = useRef(false)

  const [isRecording, setIsRecording] = useState(false)
  const [status, setStatus] = useState('Initializing...')
  const [whisperInfo, setWhisperInfo] = useState({ installed: true, instructions: '' })
  const [recordings, setRecordings] = useState({})

  const loadRecordings = useCallback(async () => {
    const result = await window.audioAPI.listRecordings()
    if (result.success) {
      setRecordings(result.recordings)
    }
  }, [])

  useEffect(() => {
    window.audioAPI.checkFfmpeg().then(result => {
      ffmpegAvailableRef.current = result.installed
      setStatus(result.installed ? 'Ready' : 'Warning: ffmpeg not installed (audio may not be seekable)')
    })

    window.audioAPI.checkWhisper().then(result => {
      setWhisperInfo({ installed: result.installed, instructions: result.instructions || '' })
    })

    loadRecordings()
  }, [loadRecordings])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    setIsRecording(false)
  }, [])

  const startRecording = useCallback(async () => {
    if (mediaRecorderRef.current?.state === 'recording') return

    try {
      const baseDir = await window.audioAPI.getRecordingPath()
      const now = new Date()
      const dateStr = now.toISOString().split('T')[0]
      const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-')
      currentSessionPathRef.current = `${baseDir}/${dateStr}/session-${timeStr}`
      currentFilenameRef.current = 'recording.webm'

      setStatus('Requesting microphone access...')

      if (!audioStreamRef.current) {
        audioStreamRef.current = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            sampleRate: 44100,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: false,
          },
        })
        audioStreamRef.current.getTracks()[0].addEventListener('ended', () => {
          setStatus('Error: Microphone disconnected')
          stopRecording()
        })
      }

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm'

      const recorder = new MediaRecorder(audioStreamRef.current, { mimeType })
      mediaRecorderRef.current = recorder

      recorder.ondataavailable = async (event) => {
        if (event.data.size > 0) {
          const arrayBuffer = await event.data.arrayBuffer()
          const result = await window.audioAPI.appendAudioChunk(
            arrayBuffer,
            currentSessionPathRef.current,
            currentFilenameRef.current
          )
          if (!result.success) {
            setStatus('Error: Failed to save audio chunk')
          }
        }
      }

      recorder.onstop = async () => {
        const fullPath = `${currentSessionPathRef.current}/${currentFilenameRef.current}`
        if (ffmpegAvailableRef.current) {
          setStatus('Processing audio with ffmpeg...')
          const result = await window.audioAPI.remuxAudio(fullPath)
          setStatus(result.success
            ? `Saved: ${result.path}`
            : `Warning: Saved but ffmpeg failed (${result.error})`
          )
        } else {
          setStatus(`Saved (without ffmpeg): ${fullPath}`)
        }
        loadRecordings()
      }

      recorder.onerror = (event) => {
        setStatus(`Error: ${event.error.name}`)
        stopRecording()
      }

      recorder.start(60000)
      setIsRecording(true)
      setStatus('Recording... (saving every 60s)')
    } catch (error) {
      const messages = {
        NotAllowedError: 'Error: Microphone access denied',
        NotFoundError: 'Error: No microphone found',
        NotReadableError: 'Error: Microphone in use by another app',
        OverconstrainedError: 'Error: Audio constraints not supported',
      }
      setStatus(messages[error.name] || 'Failed to start recording')
      console.error('Recording error:', error)
    }
  }, [loadRecordings, stopRecording])

  return (
    <div style={{ padding: '20px', maxWidth: '900px', margin: '0 auto' }}>
      <h1>Developer Diary Audio Recorder</h1>

      {!whisperInfo.installed && (
        <WhisperBanner instructions={whisperInfo.instructions} />
      )}

      <RecordingControls
        isRecording={isRecording}
        status={status}
        onStart={startRecording}
        onStop={stopRecording}
      />

      <hr />
      <h2>Recordings</h2>
      <RecordingsList recordings={recordings} onRefresh={loadRecordings} />
    </div>
  )
}
