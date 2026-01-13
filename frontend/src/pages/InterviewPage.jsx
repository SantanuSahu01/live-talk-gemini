import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useInterview, InterviewState } from '@/context/InterviewContext'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import AudioVisualizer from '@/components/interview/AudioVisualizer'
import TranscriptList from '@/components/interview/TranscriptList'
import Timer from '@/components/interview/Timer'
import { Pause, PhoneOff, AlertTriangle, User, Bot } from 'lucide-react'

export default function InterviewPage() {
  const { interviewId } = useParams()
  const navigate = useNavigate()
  const { 
    state,
    transcripts,
    currentUserText,
    currentAssistantText,
    isSpeaking,
    isRecording,
    userAudioLevel,
    assistantAudioLevel,
    goAwayWarning,
    endInterview,
    interrupt,
    clearTranscripts,
  } = useInterview()

  // Redirect if not in active interview
  useEffect(() => {
    if (state === InterviewState.IDLE) {
      navigate(`/interview/${interviewId}`)
    } else if (state === InterviewState.COMPLETED) {
      navigate(`/interview/${interviewId}/completed`)
    }
  }, [state, interviewId, navigate])

  return (
    <div className="flex-1 flex flex-col p-4 gap-4 max-w-7xl mx-auto w-full">
      {/* GoAway Warning */}
      {goAwayWarning && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-500">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span className="text-sm">
            {goAwayWarning.reason}
            {goAwayWarning.timeLeft && ` • Time remaining: ${goAwayWarning.timeLeft}`}
          </span>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 grid lg:grid-cols-[300px_1fr] gap-4 min-h-0">
        {/* Left Panel - Audio Visualizers */}
        <div className="flex flex-col gap-4">
          {/* User Visualizer */}
          <Card className="glass">
            <CardHeader className="py-3 px-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                    <User className="w-4 h-4 text-primary" />
                  </div>
                  <CardTitle className="text-sm font-medium">You</CardTitle>
                </div>
                {isRecording && (
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-xs text-red-500 font-medium">REC</span>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <AudioVisualizer 
                level={userAudioLevel} 
                isActive={isRecording}
                type="user"
              />
            </CardContent>
          </Card>

          <Separator className="lg:hidden" />

          {/* AI Visualizer */}
          <Card className="glass">
            <CardHeader className="py-3 px-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center">
                    <Bot className="w-4 h-4 text-accent" />
                  </div>
                  <CardTitle className="text-sm font-medium">AI Interviewer</CardTitle>
                </div>
                {isSpeaking && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-accent font-medium">Speaking</span>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <AudioVisualizer 
                level={assistantAudioLevel} 
                isActive={isSpeaking}
                type="assistant"
              />
            </CardContent>
          </Card>

          {/* Timer */}
          <Card className="glass">
            <CardContent className="p-4">
              <Timer />
            </CardContent>
          </Card>
        </div>

        {/* Right Panel - Transcripts */}
        <Card className="glass flex flex-col min-h-0">
          <CardHeader className="py-3 px-4 shrink-0">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">Conversation</CardTitle>
              {transcripts.length > 0 && (
                <Button variant="ghost" size="sm" onClick={clearTranscripts}>
                  Clear
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-0 flex-1 min-h-0">
            <TranscriptList 
              transcripts={transcripts}
              currentUserText={currentUserText}
              currentAssistantText={currentAssistantText}
            />
          </CardContent>
        </Card>
      </div>

      {/* Bottom Control Bar */}
      <Card className="glass shrink-0">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            {/* Recording Status */}
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${isRecording ? 'bg-red-500/10' : 'bg-muted'}`}>
              <span className={`w-2 h-2 rounded-full ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-muted-foreground'}`} />
              <span className={`text-sm font-medium ${isRecording ? 'text-red-500' : 'text-muted-foreground'}`}>
                {isRecording ? 'Recording' : 'Paused'}
              </span>
            </div>

            {/* Center Controls */}
            <div className="flex items-center gap-3">
              {isSpeaking && (
                <Button variant="secondary" onClick={interrupt}>
                  <Pause className="w-4 h-4 mr-2" />
                  Interrupt
                </Button>
              )}
              
              <Button variant="destructive" onClick={() => endInterview('client_request')}>
                <PhoneOff className="w-4 h-4 mr-2" />
                End Interview
              </Button>
            </div>

            {/* Status */}
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${state === InterviewState.ACTIVE ? 'bg-green-500' : 'bg-yellow-500'}`} />
              <span className="text-sm text-muted-foreground">
                {state === InterviewState.ACTIVE ? 'Live' : 'Connecting...'}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
