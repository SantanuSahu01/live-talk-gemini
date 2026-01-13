import { useState, useEffect, useRef, useCallback } from 'react'
import { useWebSocket } from './hooks/useWebSocket'
import { useAudioRecorder } from './hooks/useAudioRecorder'
import { useAudioPlayer } from './hooks/useAudioPlayer'
import './App.css'

// Interview configuration modal
function ConfigModal({ isOpen, onSubmit, onClose }) {
  const [config, setConfig] = useState({
    interviewId: crypto.randomUUID(),
    systemPrompt: 'You are a friendly AI interviewer. Conduct a brief interview to assess the candidate\'s communication skills and problem-solving abilities. Ask 2-3 questions, then provide feedback.',
    maxDuration: 600, // 10 minutes
  })

  if (!isOpen) return null

  const handleSubmit = (e) => {
    e.preventDefault()
    onSubmit(config)
  }

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <h2>Configure Interview</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>System Prompt</label>
            <textarea
              value={config.systemPrompt}
              onChange={(e) => setConfig({ ...config, systemPrompt: e.target.value })}
              rows={4}
              placeholder="Instructions for the AI interviewer..."
            />
          </div>
          <div className="form-group">
            <label>Max Duration (seconds)</label>
            <input
              type="number"
              value={config.maxDuration}
              onChange={(e) => setConfig({ ...config, maxDuration: parseInt(e.target.value) })}
              min={60}
              max={3600}
            />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary">Start Interview</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Call ended modal (shown when AI ends the call)
function CallEndedModal({ isOpen, reason, summary, evaluation, onClose }) {
  if (!isOpen) return null

  const reasonLabels = {
    completed: 'Interview Completed',
    candidate_request: 'Ended by Request',
    technical_issue: 'Technical Issue',
    time_limit: 'Time Limit Reached',
  }

  return (
    <div className="modal-overlay">
      <div className="modal call-ended-modal">
        <div className="modal-header ended">
          <div className="ended-icon">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <polyline points="22,4 12,14.01 9,11.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h2>{reasonLabels[reason] || 'Interview Ended'}</h2>
        </div>
        
        <div className="modal-content">
          {summary && (
            <div className="summary-section">
              <h3>Summary</h3>
              <p>{summary}</p>
            </div>
          )}
          
          {evaluation && (
            <div className="evaluation-section">
              <h3>Evaluation</h3>
              <div className="evaluation-grid">
                {evaluation.overallScore && (
                  <div className="eval-item">
                    <span className="eval-label">Overall Score</span>
                    <span className="eval-value score">{evaluation.overallScore}/10</span>
                  </div>
                )}
                {evaluation.recommendation && (
                  <div className="eval-item">
                    <span className="eval-label">Recommendation</span>
                    <span className={`eval-value recommendation ${evaluation.recommendation}`}>
                      {evaluation.recommendation.replace(/_/g, ' ')}
                    </span>
                  </div>
                )}
              </div>
              {evaluation.summary && (
                <p className="eval-summary">{evaluation.summary}</p>
              )}
            </div>
          )}
        </div>
        
        <div className="modal-actions">
          <button className="btn-primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}

function App() {
  const [sessionId, setSessionId] = useState(null)
  const [isConnected, setIsConnected] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const [isConfigured, setIsConfigured] = useState(false)
  const [transcripts, setTranscripts] = useState([])
  const [status, setStatus] = useState('Click to configure and start')
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [goAwayWarning, setGoAwayWarning] = useState(null)
  const [showConfigModal, setShowConfigModal] = useState(false)
  const [showCallEndedModal, setShowCallEndedModal] = useState(false)
  const [callEndData, setCallEndData] = useState(null)
  const [evaluation, setEvaluation] = useState(null)
  
  const transcriptsRef = useRef(null)
  const isConnectedRef = useRef(false)
  const currentUserTranscriptRef = useRef('')
  const currentAssistantTranscriptRef = useRef('')

  const { playAudio, stopPlayback } = useAudioPlayer({
    onEnded: () => setIsSpeaking(false)
  })

  const { sendAudio, connect, disconnect, sendMessage, sendInterrupt } = useWebSocket({
    url: 'ws://localhost:8080/ws',
    onSessionCreated: (id) => {
      setSessionId(id)
      setStatus('Session created • Configure to start')
    },
    onConnected: () => {
      setIsConnected(true)
      isConnectedRef.current = true
      setStatus('Connected • Listening...')
      startRecording()
    },
    onDisconnected: (resumptionToken) => {
      setIsConnected(false)
      isConnectedRef.current = false
      setIsStreaming(false)
      setIsConfigured(false)
      setStatus(resumptionToken ? 'Disconnected (can resume)' : 'Disconnected')
      setIsSpeaking(false)
      stopRecording()
      stopPlayback()
    },
    onAudio: (audioData, mimeType) => {
      setIsSpeaking(true)
      playAudio(audioData, mimeType)
    },
    onTranscript: (text, isFinal, role) => {
      if (role === 'user') {
        if (isFinal) {
          setTranscripts(prev => [
            ...prev.filter(t => t.id !== 'user-current'),
            { id: `user-${Date.now()}`, role: 'user', text: text, isFinal: true }
          ])
          currentUserTranscriptRef.current = ''
        } else {
          currentUserTranscriptRef.current = text
          setTranscripts(prev => {
            const filtered = prev.filter(t => t.id !== 'user-current')
            return [...filtered, { id: 'user-current', role: 'user', text: text, isFinal: false }]
          })
        }
      } else {
        if (isFinal) {
          setTranscripts(prev => [
            ...prev.filter(t => t.id !== 'assistant-current'),
            { id: `assistant-${Date.now()}`, role: 'assistant', text: text, isFinal: true }
          ])
          currentAssistantTranscriptRef.current = ''
        } else {
          currentAssistantTranscriptRef.current += text
          setTranscripts(prev => {
            const filtered = prev.filter(t => t.id !== 'assistant-current')
            return [...filtered, { id: 'assistant-current', role: 'assistant', text: currentAssistantTranscriptRef.current, isFinal: false }]
          })
        }
      }
    },
    onTurnComplete: () => {
      setIsSpeaking(false)
      currentAssistantTranscriptRef.current = ''
    },
    onInterrupted: () => {
      setIsSpeaking(false)
      stopPlayback()
      currentAssistantTranscriptRef.current = ''
    },
    onCallEnded: (reason, summary, endedBy) => {
      setCallEndData({ reason, summary, endedBy })
      setShowCallEndedModal(true)
      setStatus('Interview ended')
      stopRecording()
      stopPlayback()
    },
    onEvaluationSubmitted: (evalData) => {
      setEvaluation(evalData)
    },
    onError: (message) => {
      setStatus(`Error: ${message}`)
    },
    onGoAway: (info) => {
      setGoAwayWarning(`Session ending: ${info.reason}. Time left: ${info.timeLeft || 'unknown'}`)
      setTimeout(() => setGoAwayWarning(null), 10000)
    },
    onMaxDurationReached: () => {
      setStatus('Time limit reached')
      setCallEndData({ reason: 'time_limit', summary: 'Interview time limit was reached.' })
      setShowCallEndedModal(true)
    },
    onSessionResumable: (token) => {
      console.log('Session can be resumed with token')
    }
  })

  const { startRecording, stopRecording, isSupported } = useAudioRecorder({
    onAudioData: (base64Audio) => {
      if (isConnectedRef.current) {
        sendAudio(base64Audio)
      }
    },
    onStarted: () => {
      setIsStreaming(true)
      setStatus('🎤 Live • Streaming...')
    }
  })

  // Auto-scroll transcripts
  useEffect(() => {
    if (transcriptsRef.current) {
      transcriptsRef.current.scrollTop = transcriptsRef.current.scrollHeight
    }
  }, [transcripts])

  const handleStartInterview = useCallback((config) => {
    setShowConfigModal(false)
    setStatus('Connecting...')
    
    // Connect first, then send config
    connect()
    
    // Send config after connection
    setTimeout(() => {
      sendMessage({
        type: 'config',
        config: config
      })
      setIsConfigured(true)
    }, 500)
  }, [connect, sendMessage])

  const handleQuickStart = useCallback(() => {
    // Quick start with default config
    const defaultConfig = {
      interviewId: crypto.randomUUID(),
      systemPrompt: 'You are a helpful and friendly AI assistant. Be concise and conversational.',
      maxDuration: 1800,
    }
    handleStartInterview(defaultConfig)
  }, [handleStartInterview])

  const handleEndCall = useCallback(() => {
    sendMessage({ type: 'end_call', reason: 'client_request' })
    stopRecording()
    setIsStreaming(false)
    disconnect()
  }, [sendMessage, stopRecording, disconnect])

  const handleClear = () => {
    setTranscripts([])
    currentUserTranscriptRef.current = ''
    currentAssistantTranscriptRef.current = ''
  }

  const handleInterrupt = () => {
    sendInterrupt()
    stopPlayback()
  }

  const handleCloseCallEndedModal = () => {
    setShowCallEndedModal(false)
    setCallEndData(null)
    setEvaluation(null)
    disconnect()
  }

  return (
    <div className="app">
      {/* Background Effects */}
      <div className="bg-gradient" />
      <div className="bg-grid" />
      
      {/* Modals */}
      <ConfigModal 
        isOpen={showConfigModal} 
        onSubmit={handleStartInterview}
        onClose={() => setShowConfigModal(false)}
      />
      
      <CallEndedModal
        isOpen={showCallEndedModal}
        reason={callEndData?.reason}
        summary={callEndData?.summary}
        evaluation={evaluation}
        onClose={handleCloseCallEndedModal}
      />
      
      {/* GoAway Warning */}
      {goAwayWarning && (
        <div className="go-away-warning">
          ⚠️ {goAwayWarning}
        </div>
      )}
      
      {/* Header */}
      <header className="header">
        <div className="header-content">
          <div className="logo">
            <div className="logo-icon">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <span className="logo-text">AI Interview</span>
          </div>
          
          <div className="status-indicator">
            <span className={`status-dot ${isStreaming ? 'streaming' : isConnected ? 'connected' : ''}`} />
            <span className="status-text">{status}</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="main">
        {/* Transcript Panel */}
        <div className="transcript-panel">
          <div className="panel-header">
            <h2>Conversation</h2>
            <div className="panel-actions">
              {isSpeaking && (
                <button className="interrupt-btn" onClick={handleInterrupt}>
                  Stop
                </button>
              )}
              {transcripts.length > 0 && (
                <button className="clear-btn" onClick={handleClear}>
                  Clear
                </button>
              )}
            </div>
          </div>
          
          <div className="transcripts" ref={transcriptsRef}>
            {transcripts.length === 0 && !isStreaming ? (
              <div className="empty-state">
                <div className="empty-icon">
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <p>Start an AI Interview</p>
                <span>Configure your interview or quick start below</span>
              </div>
            ) : transcripts.length === 0 && isStreaming ? (
              <div className="empty-state streaming">
                <div className="live-indicator">
                  <div className="live-dot" />
                  <span>LIVE</span>
                </div>
                <p>Listening...</p>
                <span>Start speaking to begin the interview</span>
              </div>
            ) : (
              transcripts.map((item) => (
                <div 
                  key={item.id} 
                  className={`transcript-item ${item.role} ${!item.isFinal ? 'interim' : ''} animate-fade-in`}
                >
                  <div className="transcript-role">
                    {item.role === 'user' ? '👤 You' : '✨ AI'}
                    {!item.isFinal && <span className="typing-indicator">...</span>}
                  </div>
                  <div className="transcript-text">{item.text}</div>
                </div>
              ))
            )}
            
            {isSpeaking && (
              <div className="speaking-indicator animate-fade-in">
                <div className="sound-waves">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="wave" style={{ animationDelay: `${i * 0.1}s` }} />
                  ))}
                </div>
                <span>AI is speaking...</span>
              </div>
            )}
          </div>
        </div>

        {/* Control Panel */}
        <div className="control-panel">
          {!isSupported && (
            <div className="warning-banner">
              ⚠️ Audio recording is not supported in this browser
            </div>
          )}
          
          <div className="controls">
            {!isStreaming ? (
              <div className="start-buttons">
                <button 
                  className="config-button"
                  onClick={() => setShowConfigModal(true)}
                  disabled={!isSupported}
                >
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2"/>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" stroke="currentColor" strokeWidth="2"/>
                  </svg>
                  Configure
                </button>
                <button 
                  className="mic-button"
                  onClick={handleQuickStart}
                  disabled={!isSupported}
                >
                  <div className="mic-icon">
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <line x1="12" y1="19" x2="12" y2="23" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <line x1="8" y1="23" x2="16" y2="23" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  Quick Start
                </button>
              </div>
            ) : (
              <button 
                className="mic-button streaming"
                onClick={handleEndCall}
              >
                <div className="mic-icon">
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/>
                  </svg>
                </div>
                <div className="streaming-ring" />
              </button>
            )}
            
            <div className="control-labels">
              {isStreaming ? (
                <span className="streaming-text">🔴 Live • Click to End Interview</span>
              ) : (
                <span>Configure or Quick Start Interview</span>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="footer">
        <p>AI Interview Platform • Powered by Gemini 2.5 Flash</p>
      </footer>
    </div>
  )
}

export default App
