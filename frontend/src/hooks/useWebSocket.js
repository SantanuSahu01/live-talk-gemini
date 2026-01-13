import { useRef, useCallback, useEffect } from 'react'

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
  onSessionResumable = () => {},
}) {
  const wsRef = useRef(null)
  const isConnectedRef = useRef(false)
  
  // Store callbacks in refs so they're always current
  const callbacksRef = useRef({
    onSessionCreated,
    onConnected,
    onDisconnected,
    onAudio,
    onTranscript,
    onTurnComplete,
    onInterrupted,
    onCallEnded,
    onEvaluationSubmitted,
    onMaxDurationReached,
    onError,
    onGoAway,
    onSessionResumable,
  })

  // Update refs when callbacks change
  useEffect(() => {
    callbacksRef.current = {
      onSessionCreated,
      onConnected,
      onDisconnected,
      onAudio,
      onTranscript,
      onTurnComplete,
      onInterrupted,
      onCallEnded,
      onEvaluationSubmitted,
      onMaxDurationReached,
      onError,
      onGoAway,
      onSessionResumable,
    }
  }, [onSessionCreated, onConnected, onDisconnected, onAudio, onTranscript, 
      onTurnComplete, onInterrupted, onCallEnded, onEvaluationSubmitted, 
      onMaxDurationReached, onError, onGoAway, onSessionResumable])

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    try {
      wsRef.current = new WebSocket(url)

      wsRef.current.onopen = () => {
        console.log('WebSocket connected')
        isConnectedRef.current = true
      }

      wsRef.current.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data)
          const cb = callbacksRef.current
          
          switch (message.type) {
            case 'session_created':
              cb.onSessionCreated(message.sessionId)
              break
              
            case 'connected':
              cb.onConnected()
              break
              
            case 'disconnected':
              cb.onDisconnected(message.resumptionToken)
              break
              
            case 'audio':
              cb.onAudio(message.data, message.mimeType)
              break
              
            case 'transcript':
              console.log('[WS] Transcript:', message.role, message.isFinal ? '(final)' : '(interim)', message.text?.substring(0, 50))
              cb.onTranscript(message.text, message.isFinal, message.role)
              break
              
            case 'turn_complete':
              cb.onTurnComplete()
              break
              
            case 'interrupted':
              cb.onInterrupted()
              break
              
            case 'call_ended':
              cb.onCallEnded(message.reason, message.summary)
              break
              
            case 'evaluation_submitted':
              cb.onEvaluationSubmitted(message.evaluation)
              break
              
            case 'max_duration_reached':
              cb.onMaxDurationReached()
              break
              
            case 'error':
              cb.onError(message.message)
              break
              
            case 'go_away':
              cb.onGoAway(message)
              break
              
            case 'session_resumable':
              cb.onSessionResumable(message.token)
              break
              
            default:
              console.log('Unknown message type:', message.type)
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error)
        }
      }

      wsRef.current.onclose = (event) => {
        console.log('WebSocket closed:', event.code, event.reason)
        isConnectedRef.current = false
        callbacksRef.current.onDisconnected()
      }

      wsRef.current.onerror = (error) => {
        console.error('WebSocket error:', error)
        callbacksRef.current.onError('Connection error occurred')
      }
    } catch (error) {
      console.error('Failed to connect WebSocket:', error)
      callbacksRef.current.onError('Failed to connect')
    }
  }, [url])

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
      isConnectedRef.current = false
    }
  }, [])

  const sendMessage = useCallback((message) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message))
    }
  }, [])

  const sendAudio = useCallback((base64Audio) => {
    sendMessage({
      type: 'audio',
      data: base64Audio,
    })
  }, [sendMessage])

  const sendInterrupt = useCallback(() => {
    sendMessage({
      type: 'interrupt',
    })
  }, [sendMessage])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect()
    }
  }, [disconnect])

  return {
    connect,
    disconnect,
    sendMessage,
    sendAudio,
    sendInterrupt,
    isConnected: isConnectedRef.current,
  }
}
