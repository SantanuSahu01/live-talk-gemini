import { useState, useEffect, useRef, useCallback } from 'react'
import { useWebSocket } from './hooks/useWebSocket'
import { useAudioRecorder } from './hooks/useAudioRecorder'
import { useAudioPlayer } from './hooks/useAudioPlayer'
import './App.css'

function App() {
  const [isConnected, setIsConnected] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const [transcripts, setTranscripts] = useState([])
  const [status, setStatus] = useState('Click to start')
  const [isSpeaking, setIsSpeaking] = useState(false)
  
  const transcriptsRef = useRef(null)
  const isConnectedRef = useRef(false)

  const { sendAudio, connect, disconnect } = useWebSocket({
    url: 'ws://localhost:8080',
    onConnected: () => {
      setIsConnected(true)
      isConnectedRef.current = true
      setStatus('Connected • Listening...')
      // Start recording immediately when connected
      startRecording()
    },
    onDisconnected: () => {
      setIsConnected(false)
      isConnectedRef.current = false
      setIsStreaming(false)
      setStatus('Click to start')
      setIsSpeaking(false)
      stopRecording()
    },
    onAudio: (audioData, mimeType) => {
      setIsSpeaking(true)
      playAudio(audioData, mimeType)
    },
    onTranscript: (text, isFinal) => {
      setTranscripts(prev => {
        const newTranscripts = [...prev]
        const lastIndex = newTranscripts.length - 1
        
        if (lastIndex >= 0 && !newTranscripts[lastIndex].isFinal && newTranscripts[lastIndex].role === 'assistant') {
          newTranscripts[lastIndex] = { 
            ...newTranscripts[lastIndex], 
            text: newTranscripts[lastIndex].text + text,
            isFinal 
          }
        } else {
          newTranscripts.push({ role: 'assistant', text, isFinal, timestamp: Date.now() })
        }
        return newTranscripts
      })
    },
    onTurnComplete: () => {
      setIsSpeaking(false)
    },
    onInterrupted: () => {
      setIsSpeaking(false)
    },
    onError: (message) => {
      setStatus(`Error: ${message}`)
    }
  })

  const { playAudio } = useAudioPlayer({
    onEnded: () => setIsSpeaking(false)
  })

  const { startRecording, stopRecording, isSupported } = useAudioRecorder({
    onAudioData: (base64Audio) => {
      // Always stream when connected
      if (isConnectedRef.current) {
        sendAudio(base64Audio)
      }
    },
    onStarted: () => {
      setIsStreaming(true)
      setStatus('🎤 Live • Streaming audio...')
    }
  })

  // Auto-scroll transcripts
  useEffect(() => {
    if (transcriptsRef.current) {
      transcriptsRef.current.scrollTop = transcriptsRef.current.scrollHeight
    }
  }, [transcripts])

  const handleToggleConnection = useCallback(async () => {
    if (isConnected) {
      // Disconnect
      stopRecording()
      setIsStreaming(false)
      disconnect()
    } else {
      // Connect - recording will start automatically in onConnected
      setStatus('Connecting...')
      connect()
    }
  }, [isConnected, connect, disconnect, stopRecording])

  const handleClear = () => {
    setTranscripts([])
  }

  return (
    <div className="app">
      {/* Background Effects */}
      <div className="bg-gradient" />
      <div className="bg-grid" />
      
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
            <span className="logo-text">Gemini Live</span>
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
            {transcripts.length > 0 && (
              <button className="clear-btn" onClick={handleClear}>
                Clear
              </button>
            )}
          </div>
          
          <div className="transcripts" ref={transcriptsRef}>
            {transcripts.length === 0 && !isStreaming ? (
              <div className="empty-state">
                <div className="empty-icon">
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <p>Start a conversation with Gemini</p>
                <span>Click the button below to begin live streaming</span>
              </div>
            ) : transcripts.length === 0 && isStreaming ? (
              <div className="empty-state streaming">
                <div className="live-indicator">
                  <div className="live-dot" />
                  <span>LIVE</span>
                </div>
                <p>Listening...</p>
                <span>Start speaking to Gemini</span>
              </div>
            ) : (
              transcripts.map((item, index) => (
                <div 
                  key={index} 
                  className={`transcript-item ${item.role} animate-fade-in`}
                >
                  <div className="transcript-role">
                    {item.role === 'user' ? '👤 You' : '✨ Gemini'}
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
                <span>Gemini is speaking...</span>
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
            <button 
              className={`mic-button ${isStreaming ? 'streaming' : ''} ${isConnected ? 'connected' : ''}`}
              onClick={handleToggleConnection}
              disabled={!isSupported}
            >
              <div className="mic-icon">
                {isStreaming ? (
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/>
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <line x1="12" y1="19" x2="12" y2="23" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <line x1="8" y1="23" x2="16" y2="23" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </div>
              {isStreaming && <div className="streaming-ring" />}
            </button>
            
            <div className="control-labels">
              {isStreaming ? (
                <span className="streaming-text">🔴 Live • Click to End</span>
              ) : (
                <span>Click to Start Live Session</span>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="footer">
        <p>Powered by Gemini 2.5 Flash • Built with 💜</p>
      </footer>
    </div>
  )
}

export default App
