import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useInterview } from '@/context/InterviewContext'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Slider } from '@/components/ui/slider'
import { Separator } from '@/components/ui/separator'
import { Mic, Clock, MessageSquare, Copy, Play, Settings } from 'lucide-react'

const interviewTypes = [
  {
    id: 'general',
    name: 'General',
    prompt: 'You are a professional AI interviewer. Conduct a friendly and professional interview. Ask about the candidate\'s background, skills, and experience. Be conversational and encouraging.',
  },
  {
    id: 'technical',
    name: 'Technical',
    prompt: 'You are a technical interviewer assessing programming and problem-solving skills. Ask about technical concepts, coding experience, and problem-solving approaches. Adapt questions based on the candidate\'s responses.',
  },
  {
    id: 'behavioral',
    name: 'Behavioral',
    prompt: 'You are a behavioral interviewer. Ask STAR-format questions about past experiences, teamwork, leadership, and handling challenges. Focus on specific examples and outcomes.',
  },
  {
    id: 'custom',
    name: 'Custom',
    prompt: '',
  },
]

export default function AgreementPage() {
  const { interviewId } = useParams()
  const navigate = useNavigate()
  const { startInterview, isAudioSupported } = useInterview()
  
  const [agreed, setAgreed] = useState(false)
  const [selectedType, setSelectedType] = useState('general')
  const [customPrompt, setCustomPrompt] = useState('')
  const [candidateName, setCandidateName] = useState('')
  const [duration, setDuration] = useState([15])
  const [copied, setCopied] = useState(false)

  const handleStart = () => {
    if (!agreed) return
    
    const type = interviewTypes.find(t => t.id === selectedType)
    const prompt = selectedType === 'custom' ? customPrompt : type?.prompt

    startInterview({
      systemPrompt: prompt,
      maxDuration: duration[0] * 60,
      candidateName,
    })
    
    navigate(`/interview/${interviewId}/session`)
  }

  const copyLink = async () => {
    await navigator.clipboard.writeText(window.location.href)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <Card className="w-full max-w-2xl glass">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center mb-4">
            <Mic className="w-8 h-8 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl gradient-text">AI Interview</CardTitle>
          <CardDescription>
            Interview ID: {interviewId?.slice(0, 8)}...
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Share Link */}
          <div className="space-y-2">
            <Label>Share this link</Label>
            <div className="flex gap-2">
              <Input 
                value={window.location.href} 
                readOnly 
                className="font-mono text-sm"
              />
              <Button variant="outline" size="icon" onClick={copyLink}>
                <Copy className={`w-4 h-4 ${copied ? 'text-green-500' : ''}`} />
              </Button>
            </div>
          </div>

          <Separator />

          {/* Configuration */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Your Name (optional)</Label>
              <Input
                id="name"
                value={candidateName}
                onChange={(e) => setCandidateName(e.target.value)}
                placeholder="Enter your name"
              />
            </div>

            <div className="space-y-2">
              <Label>Interview Type</Label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {interviewTypes.map(type => (
                  <Button
                    key={type.id}
                    variant={selectedType === type.id ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedType(type.id)}
                    className="justify-start"
                  >
                    {type.id === 'custom' && <Settings className="w-4 h-4 mr-1" />}
                    {type.name}
                  </Button>
                ))}
              </div>
            </div>

            {selectedType === 'custom' && (
              <div className="space-y-2">
                <Label>Custom Instructions</Label>
                <Textarea
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  placeholder="Enter custom interview instructions..."
                  rows={4}
                />
              </div>
            )}

            <div className="space-y-3">
              <div className="flex justify-between">
                <Label>Duration</Label>
                <span className="text-sm text-muted-foreground">{duration[0]} minutes</span>
              </div>
              <Slider
                value={duration}
                onValueChange={setDuration}
                min={5}
                max={60}
                step={5}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>5 min</span>
                <span>60 min</span>
              </div>
            </div>
          </div>

          <Separator />

          {/* Agreement */}
          <div className="space-y-4">
            <h3 className="font-semibold">Before You Begin</h3>
            <div className="space-y-3 text-sm text-muted-foreground">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Mic className="w-4 h-4 text-primary" />
                </div>
                <span>This interview will use your microphone for voice conversation</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Clock className="w-4 h-4 text-primary" />
                </div>
                <span>The session will be recorded for evaluation purposes</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <MessageSquare className="w-4 h-4 text-primary" />
                </div>
                <span>An AI will conduct the interview and provide feedback</span>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox 
                id="agree" 
                checked={agreed}
                onCheckedChange={setAgreed}
              />
              <Label htmlFor="agree" className="text-sm cursor-pointer">
                I understand and agree to proceed with the AI interview
              </Label>
            </div>
          </div>

          {/* Start Button */}
          <div className="space-y-3">
            {!isAudioSupported && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
                ⚠️ Audio recording is not supported in this browser
              </div>
            )}
            
            <Button
              variant="gradient"
              size="xl"
              className="w-full"
              disabled={!agreed || !isAudioSupported}
              onClick={handleStart}
            >
              <Play className="w-5 h-5" />
              Start Interview
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
