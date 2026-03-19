import DayCard from './DayCard'

export default function RecordingsList({ recordings, onRefresh }) {
  const dates = Object.keys(recordings)

  if (dates.length === 0) {
    return <p>No recordings yet</p>
  }

  return (
    <div>
      {dates.map(date => (
        <DayCard
          key={date}
          date={date}
          dayData={recordings[date]}
          onRefresh={onRefresh}
        />
      ))}
    </div>
  )
}
