export default function RecordingControls({ isRecording, status, onStart, onStop }) {
  return (
    <div>
      <div>
        <button onClick={onStart} disabled={isRecording}>Record</button>
        <button onClick={onStop} disabled={!isRecording}>Stop</button>
      </div>
      <p id="recordingStatus">{status}</p>
    </div>
  )
}
