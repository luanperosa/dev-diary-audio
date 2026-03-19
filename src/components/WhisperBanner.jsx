export default function WhisperBanner({ instructions }) {
  return (
    <div style={{
      padding: '10px',
      margin: '10px 0',
      borderRadius: '5px',
      backgroundColor: '#fff3cd',
      border: '1px solid #ffc107',
      color: '#856404',
    }}>
      <strong>⚠️ Whisper not installed</strong>
      <p style={{ margin: '5px 0', fontSize: '0.9em' }}>{instructions}</p>
    </div>
  )
}
