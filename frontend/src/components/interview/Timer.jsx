import { useState, useEffect } from 'react'
import { Clock } from 'lucide-react'

export default function Timer() {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(e => e + 1)
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  const formatTime = (seconds) => {
    const hrs = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div className="flex items-center justify-center gap-3">
      <Clock className="w-5 h-5 text-muted-foreground" />
      <span className="text-2xl font-mono font-medium tracking-wider tabular-nums">
        {formatTime(elapsed)}
      </span>
    </div>
  )
}
