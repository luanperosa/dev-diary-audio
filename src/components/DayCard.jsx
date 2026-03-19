import { useState } from 'react'

export default function DayCard({ date, dayData, onRefresh }) {
  const { sessions = [], transcript, diary, path: dayPath } = dayData

  const [transcriptVisible, setTranscriptVisible] = useState(true)
  const [diaryVisible, setDiaryVisible] = useState(true)
  const [transcriptStatus, setTranscriptStatus] = useState('')
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [diaryStatus, setDiaryStatus] = useState('')
  const [isGeneratingDiary, setIsGeneratingDiary] = useState(false)

  if (sessions.length === 0) return null

  async function handleGenerateTranscription() {
    setIsTranscribing(true)
    setTranscriptStatus(`Checking recordings for ${date}...`)

    const dayResult = await window.audioAPI.transcribeDay(date)
    if (!dayResult.success) {
      setTranscriptStatus(`Error: ${dayResult.error}`)
      setIsTranscribing(false)
      return
    }

    setTranscriptStatus(`Found ${dayResult.count} audio file(s). Starting transcription...`)

    let completedCount = 0
    const errors = []

    for (const file of dayResult.files) {
      setTranscriptStatus(
        `Transcribing ${file.session}/${file.filename} (${completedCount + 1}/${dayResult.count})...`
      )
      const result = await window.audioAPI.runWhisperTranscription(file.path)
      if (result.success) {
        completedCount++
      } else {
        errors.push(`${file.filename}: ${result.error}`)
      }
    }

    if (completedCount === 0) {
      setTranscriptStatus(`Error: All transcriptions failed. ${errors.join('; ')}`)
      setIsTranscribing(false)
      return
    }

    setTranscriptStatus('Merging transcripts...')
    const mergeResult = await window.audioAPI.mergeTranscripts(date)

    if (!mergeResult.success) {
      setTranscriptStatus(`Error merging: ${mergeResult.error}`)
      setIsTranscribing(false)
      return
    }

    setIsTranscribing(false)
    setTranscriptStatus('')
    onRefresh()
  }

  async function handleGenerateDiary() {
    setIsGeneratingDiary(true)
    setDiaryStatus('Calling OpenAI API to generate diary...')

    const result = await window.audioAPI.generateDiary(dayPath)

    if (result.success) {
      setDiaryStatus('✓ Diary generated successfully!')
      setTimeout(() => {
        setDiaryStatus('')
        setIsGeneratingDiary(false)
        onRefresh()
      }, 1000)
    } else {
      setDiaryStatus(`Error: ${result.error}`)
      setIsGeneratingDiary(false)
    }
  }

  return (
    <div>
      <hr />
      <h2>{date}</h2>

      {sessions.map(session => {
        const sizeInMB = (session.size / 1024 / 1024).toFixed(2)
        const time = session.sessionName.replace('session-', '')
        return (
          <p key={session.sessionName}>
            {time} — {session.filename} ({sizeInMB} MB)
          </p>
        )
      })}

      <div style={{ marginTop: '15px', padding: '10px', backgroundColor: '#f8f9fa', borderRadius: '5px' }}>
        {transcript ? (
          <>
            <p style={{ color: '#28a745', margin: '5px 0' }}>
              <strong>✓ Transcript available</strong>
            </p>
            <button onClick={() => setTranscriptVisible(v => !v)} style={{ margin: '5px 0' }}>
              {transcriptVisible ? 'Hide Transcript' : 'Show Transcript'}
            </button>

            {transcriptVisible && (
              <div style={{ marginTop: '10px' }}>
                <textarea
                  readOnly
                  value={transcript.content}
                  style={{
                    width: '100%',
                    height: '300px',
                    fontFamily: 'monospace',
                    fontSize: '0.9em',
                    padding: '10px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            )}

            <div style={{ marginTop: '15px', padding: '10px', backgroundColor: '#e7f3ff', borderRadius: '5px' }}>
              <h4 style={{ margin: '5px 0' }}>Developer Diary</h4>

              {diary ? (
                <>
                  <p style={{ color: '#28a745', margin: '5px 0' }}>
                    <strong>✓ Diary available</strong>
                  </p>
                  <button onClick={() => setDiaryVisible(v => !v)} style={{ margin: '5px 0' }}>
                    {diaryVisible ? 'Hide Diary' : 'Show Diary'}
                  </button>

                  {diaryVisible && (
                    <div style={{ marginTop: '10px' }}>
                      <textarea
                        readOnly
                        value={diary.content}
                        style={{
                          width: '100%',
                          height: '300px',
                          fontFamily: 'sans-serif',
                          fontSize: '0.95em',
                          padding: '10px',
                          lineHeight: '1.5',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>
                  )}
                </>
              ) : (
                <>
                  <button
                    onClick={handleGenerateDiary}
                    disabled={isGeneratingDiary}
                    style={{ margin: '5px 0' }}
                  >
                    {isGeneratingDiary ? 'Generating...' : 'Generate Developer Diary'}
                  </button>
                  {diaryStatus && (
                    <p style={{
                      margin: '5px 0',
                      fontSize: '0.9em',
                      color: diaryStatus.startsWith('Error') ? '#dc3545' : '#007bff',
                    }}>
                      {diaryStatus}
                    </p>
                  )}
                </>
              )}
            </div>
          </>
        ) : (
          <>
            <button
              onClick={handleGenerateTranscription}
              disabled={isTranscribing}
            >
              {isTranscribing ? 'Transcribing...' : `Generate Transcription for ${date}`}
            </button>
            {transcriptStatus && (
              <p style={{ margin: '5px 0', fontSize: '0.9em' }}>{transcriptStatus}</p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
