import { useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { User, Bot, MessageSquare } from 'lucide-react'

export default function TranscriptList({ transcripts = [], isSpeaking = false }) {
  const scrollRef = useRef(null)

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [transcripts])

  const formatTime = (timestamp) => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }

  if (transcripts.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-8">
        <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
          <MessageSquare className="w-8 h-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-medium mb-1">Conversation</h3>
        <p className="text-sm text-muted-foreground">
          Start speaking to begin the interview
        </p>
      </div>
    )
  }

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto space-y-4 pr-2">
      {transcripts.map((item) => (
        <div 
          key={item.id}
          className={cn(
            "flex gap-3 animate-in slide-in-from-bottom-2 duration-300",
            !item.isFinal && "opacity-70"
          )}
        >
          {/* Avatar */}
          <div className={cn(
            "w-8 h-8 rounded-full shrink-0 flex items-center justify-center shadow-sm",
            item.role === 'user' ? "bg-primary/10" : "bg-accent/10"
          )}>
            {item.role === 'user' ? (
              <User className="w-4 h-4 text-primary" />
            ) : (
              <Bot className="w-4 h-4 text-accent" />
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={cn(
                "text-xs font-medium",
                item.role === 'user' ? "text-primary" : "text-accent"
              )}>
                {item.role === 'user' ? 'You' : 'AI Interviewer'}
              </span>
              <span className="text-xs text-muted-foreground">
                {formatTime(item.timestamp)}
              </span>
              {!item.isFinal && (
                <span className="text-xs text-muted-foreground italic">typing...</span>
              )}
            </div>
            <p className="text-sm text-foreground/90 break-words">
              {item.text}
            </p>
          </div>
        </div>
      ))}

      {/* Speaking Indicator */}
      {isSpeaking && (
        <div className="flex items-center gap-2 text-accent text-sm py-2">
          <div className="flex items-center gap-0.5 h-4">
            {[0, 1, 2, 3, 4].map((i) => (
              <div 
                key={i}
                className="w-0.5 h-full rounded-full bg-accent animate-sound-wave"
                style={{ animationDelay: `${i * 0.1}s` }}
              />
            ))}
          </div>
          <span>AI is speaking...</span>
        </div>
      )}
    </div>
  )
}
