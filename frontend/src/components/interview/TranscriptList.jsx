import { useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { User, Bot, MessageSquare } from 'lucide-react'

export default function TranscriptList({ 
  transcripts = [], 
  currentUserText = '',
  currentAssistantText = '',
}) {
  const scrollRef = useRef(null)

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [transcripts, currentUserText, currentAssistantText])

  const formatTime = (timestamp) => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }

  const hasContent = transcripts.length > 0 || currentUserText || currentAssistantText

  if (!hasContent) {
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
      {/* Chat History */}
      {transcripts.map((item) => (
        <div 
          key={item.id}
          className="flex gap-3 animate-in fade-in duration-300"
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
            </div>
            <p className="text-sm text-foreground/90 break-words whitespace-pre-wrap">
              {item.text}
            </p>
          </div>
        </div>
      ))}

      {/* Live User Input */}
      {currentUserText && (
        <div className="flex gap-3 animate-in slide-in-from-bottom-2 duration-200">
          <div className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center shadow-sm bg-primary/10 ring-2 ring-primary/30">
            <User className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-medium text-primary">You</span>
              <span className="text-xs text-muted-foreground">now</span>
            </div>
            <p className="text-sm text-foreground/80 break-words whitespace-pre-wrap">
              {currentUserText}
            </p>
          </div>
        </div>
      )}

      {/* Live Assistant Response */}
      {currentAssistantText && (
        <div className="flex gap-3 animate-in slide-in-from-bottom-2 duration-200">
          <div className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center shadow-sm bg-accent/10 ring-2 ring-accent/30">
            <Bot className="w-4 h-4 text-accent" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-medium text-accent">AI Interviewer</span>
              <span className="text-xs text-muted-foreground">now</span>
            </div>
            <p className="text-sm text-foreground/80 break-words whitespace-pre-wrap">
              {currentAssistantText}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
