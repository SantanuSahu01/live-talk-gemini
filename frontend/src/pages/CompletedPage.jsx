import { useParams, useNavigate } from 'react-router-dom'
import { useInterview } from '@/context/InterviewContext'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { CheckCircle2, Clock, XCircle, AlertTriangle, Download, RotateCcw, User, Bot } from 'lucide-react'

const reasonConfig = {
  completed: {
    icon: CheckCircle2,
    title: 'Interview Completed',
    message: 'Thank you for completing the interview!',
    color: 'text-green-500',
    bgColor: 'bg-green-500/10',
  },
  candidate_request: {
    icon: XCircle,
    title: 'Interview Ended',
    message: 'You have ended the interview.',
    color: 'text-yellow-500',
    bgColor: 'bg-yellow-500/10',
  },
  client_request: {
    icon: XCircle,
    title: 'Interview Ended',
    message: 'You have ended the interview.',
    color: 'text-yellow-500',
    bgColor: 'bg-yellow-500/10',
  },
  time_limit: {
    icon: Clock,
    title: 'Time Limit Reached',
    message: 'The interview time limit has been reached.',
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
  },
  technical_issue: {
    icon: AlertTriangle,
    title: 'Technical Issue',
    message: 'The interview ended due to a technical issue.',
    color: 'text-red-500',
    bgColor: 'bg-red-500/10',
  },
}

export default function CompletedPage() {
  const { interviewId } = useParams()
  const navigate = useNavigate()
  const { endReason, endSummary, evaluation, transcripts } = useInterview()

  const config = reasonConfig[endReason] || reasonConfig.completed
  const Icon = config.icon

  const startNewInterview = () => {
    navigate(`/interview/${crypto.randomUUID()}`)
  }

  const downloadTranscript = () => {
    const data = {
      interviewId,
      completedAt: new Date().toISOString(),
      reason: endReason,
      summary: endSummary,
      evaluation,
      transcripts: transcripts.map(t => ({
        role: t.role,
        text: t.text,
        timestamp: t.timestamp,
      })),
    }
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `interview-${interviewId?.slice(0, 8)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="w-full max-w-2xl space-y-6">
        {/* Header Card */}
        <Card className="glass text-center">
          <CardHeader>
            <div className={`mx-auto w-20 h-20 rounded-full ${config.bgColor} flex items-center justify-center mb-4`}>
              <Icon className={`w-10 h-10 ${config.color}`} />
            </div>
            <CardTitle className="text-2xl">{config.title}</CardTitle>
            <CardDescription>{config.message}</CardDescription>
          </CardHeader>
        </Card>

        {/* Summary */}
        {endSummary && (
          <Card className="glass">
            <CardHeader>
              <CardTitle className="text-lg">Interview Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">{endSummary}</p>
            </CardContent>
          </Card>
        )}

        {/* Evaluation */}
        {evaluation && (
          <Card className="glass">
            <CardHeader>
              <CardTitle className="text-lg">Evaluation</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Scores */}
              <div className="grid gap-4 sm:grid-cols-3">
                {evaluation.overallScore && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Overall</span>
                      <span className="font-medium">{evaluation.overallScore}/10</span>
                    </div>
                    <Progress value={evaluation.overallScore * 10} />
                  </div>
                )}
                {evaluation.technicalSkills && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Technical</span>
                      <span className="font-medium">{evaluation.technicalSkills}/10</span>
                    </div>
                    <Progress value={evaluation.technicalSkills * 10} />
                  </div>
                )}
                {evaluation.communication && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Communication</span>
                      <span className="font-medium">{evaluation.communication}/10</span>
                    </div>
                    <Progress value={evaluation.communication * 10} />
                  </div>
                )}
              </div>

              {/* Recommendation */}
              {evaluation.recommendation && (
                <>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Recommendation</span>
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                      evaluation.recommendation === 'strong_hire' ? 'bg-green-500/10 text-green-500' :
                      evaluation.recommendation === 'hire' ? 'bg-blue-500/10 text-blue-500' :
                      evaluation.recommendation === 'no_hire' ? 'bg-red-500/10 text-red-500' :
                      'bg-muted text-muted-foreground'
                    }`}>
                      {evaluation.recommendation.replace(/_/g, ' ').toUpperCase()}
                    </span>
                  </div>
                </>
              )}

              {/* Summary */}
              {evaluation.summary && (
                <>
                  <Separator />
                  <p className="text-muted-foreground text-sm">{evaluation.summary}</p>
                </>
              )}

              {/* Strengths & Areas for Improvement */}
              {(evaluation.strengths?.length > 0 || evaluation.areasForImprovement?.length > 0) && (
                <>
                  <Separator />
                  <div className="grid gap-4 sm:grid-cols-2">
                    {evaluation.strengths?.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium text-green-500 mb-2">Strengths</h4>
                        <ul className="space-y-1 text-sm text-muted-foreground">
                          {evaluation.strengths.map((s, i) => (
                            <li key={i} className="flex items-start gap-2">
                              <span className="text-green-500">•</span>
                              {s}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {evaluation.areasForImprovement?.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium text-yellow-500 mb-2">Areas for Improvement</h4>
                        <ul className="space-y-1 text-sm text-muted-foreground">
                          {evaluation.areasForImprovement.map((a, i) => (
                            <li key={i} className="flex items-start gap-2">
                              <span className="text-yellow-500">•</span>
                              {a}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Transcript Preview */}
        {transcripts.length > 0 && (
          <Card className="glass">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Conversation ({transcripts.length})</CardTitle>
                <Button variant="ghost" size="sm" onClick={downloadTranscript}>
                  <Download className="w-4 h-4 mr-2" />
                  Download
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 max-h-48 overflow-y-auto">
                {transcripts.slice(-5).map(t => (
                  <div key={t.id} className="flex gap-3 text-sm">
                    <div className={`w-6 h-6 rounded-full shrink-0 flex items-center justify-center ${
                      t.role === 'user' ? 'bg-primary/20' : 'bg-accent/20'
                    }`}>
                      {t.role === 'user' ? (
                        <User className="w-3 h-3 text-primary" />
                      ) : (
                        <Bot className="w-3 h-3 text-accent" />
                      )}
                    </div>
                    <p className="text-muted-foreground">
                      {t.text.slice(0, 150)}{t.text.length > 150 ? '...' : ''}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Button variant="gradient" size="lg" className="flex-1" onClick={startNewInterview}>
            <RotateCcw className="w-4 h-4 mr-2" />
            Start New Interview
          </Button>
        </div>

        {/* Footer */}
        <div className="text-center text-sm text-muted-foreground">
          <p>Interview ID: {interviewId}</p>
          <p>Your recording and transcript have been saved.</p>
        </div>
      </div>
    </div>
  )
}
