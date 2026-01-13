import { useState, useRef, useCallback, useEffect } from 'react'

export function useWebSocket({
  url,
  onSessionCreated = () => {},
  onConnected = () => {},
  onDisconnected = () => {},
  onAudio = () => {},
  onTranscript = () => {},
  onTurnComplete = () => {},
  onInterrupted = () => {},
  onCallEnded = () => {},
  onEvaluationSubmitted = () => {},
  onMaxDurationReached = () => {},
  onError = () => {},
  onGoAway = () => {},
  onSessionResumable = () => {}
}) {
  const [connectionState, setConnectionState] = useState('disconnected')
  const wsRef = useRef(null)
  const sessionTokenRef = useRef(null)
  const sessionIdRef = useRef(null)

  const connect = useCallback((resumptionToken = null) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return
    }

    setConnectionState('connecting')

    try {
      wsRef.current = new WebSocket(url)

      wsRef.current.onopen = () => {
        setConnectionState('connected')
        console.log('WebSocket connected to server')
        
        // If we have a resumption token, send it
        if (resumptionToken) {
          wsRef.current.send(JSON.stringify({
            type: 'resume',
            token: resumptionToken
          }))
        }
      }

      wsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          
          switch (data.type) {
            case 'session_created':
              console.log('📋 Session created:', data.sessionId)
              sessionIdRef.current = data.sessionId
              onSessionCreated(data.sessionId)
              break
              
            case 'connected':
              console.log('✅ Connected to Gemini')
              onConnected()
              break
              
            case 'disconnected':
              console.log('❌ Disconnected from Gemini')
              if (data.resumptionToken) {
                sessionTokenRef.current = data.resumptionToken
              }
              onDisconnected(data.resumptionToken)
              break
              
            case 'audio':
              console.log(`🎵 Audio: ${data.data.length} chars, ${data.mimeType}`)
              onAudio(data.data, data.mimeType)
              break
              
            case 'transcript':
              console.log(`💬 ${data.role}: "${data.text}" (final: ${data.isFinal})`)
              onTranscript(data.text, data.isFinal, data.role)
              break
              
            case 'turn_complete':
              console.log('✅ Turn complete')
              onTurnComplete()
              break
              
            case 'interrupted':
              console.log('⚡ Interrupted')
              onInterrupted()
              break
              
            case 'call_ended':
              console.log('📞 Call ended:', data.reason)
              onCallEnded(data.reason, data.summary, data.endedBy)
              break
              
            case 'evaluation_submitted':
              console.log('📊 Evaluation submitted')
              onEvaluationSubmitted(data.evaluation)
              break
              
            case 'max_duration_reached':
              console.log('⏱️ Max duration reached')
              onMaxDurationReached()
              break
              
            case 'error':
              console.error('❌ Error:', data.message)
              onError(data.message)
              break
              
            case 'go_away':
              console.warn('⚠️ Go Away:', data.reason, 'Time left:', data.timeLeft)
              onGoAway(data)
              break
              
            case 'session_resumable':
              console.log('📌 Session resumable, token received')
              sessionTokenRef.current = data.token
              onSessionResumable(data.token)
              break
              
            default:
              console.log('Unknown message type:', data.type, data)
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error)
        }
      }

      wsRef.current.onclose = (event) => {
        setConnectionState('disconnected')
        console.log('WebSocket closed:', event.code, event.reason)
        onDisconnected(sessionTokenRef.current)
      }

      wsRef.current.onerror = (error) => {
        console.error('WebSocket error:', error)
        onError('Connection error')
      }
    } catch (error) {
      console.error('Failed to create WebSocket:', error)
      setConnectionState('disconnected')
      onError('Failed to connect')
    }
  }, [url, onSessionCreated, onConnected, onDisconnected, onAudio, onTranscript, 
      onTurnComplete, onInterrupted, onCallEnded, onEvaluationSubmitted, 
      onMaxDurationReached, onError, onGoAway, onSessionResumable])

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    setConnectionState('disconnected')
  }, [])

  const sendAudio = useCallback((base64Audio) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'audio',
        data: base64Audio
      }))
    }
  }, [])

  const sendText = useCallback((text) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'text',
        text: text
      }))
    }
  }, [])

  const sendInterrupt = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'interrupt'
      }))
    }
  }, [])

  const sendMessage = useCallback((message) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message))
    }
  }, [])

  // Resume session with stored token
  const resume = useCallback(() => {
    if (sessionTokenRef.current) {
      connect(sessionTokenRef.current)
    } else {
      connect()
    }
  }, [connect])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect()
    }
  }, [disconnect])

  return {
    connect,
    disconnect,
    resume,
    sendAudio,
    sendText,
    sendInterrupt,
    sendMessage,
    connectionState,
    isConnected: connectionState === 'connected',
    sessionToken: sessionTokenRef.current,
    sessionId: sessionIdRef.current
  }
}
