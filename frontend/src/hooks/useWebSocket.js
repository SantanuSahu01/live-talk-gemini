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
          
          switch (message.type) {
            case 'session_created':
              onSessionCreated(message.sessionId)
              break
              
            case 'connected':
              onConnected()
              break
              
            case 'disconnected':
              onDisconnected(message.resumptionToken)
              break
              
            case 'audio':
              onAudio(message.data, message.mimeType)
              break
              
            case 'transcript':
              onTranscript(message.text, message.isFinal, message.role)
              break
              
            case 'turn_complete':
              onTurnComplete()
              break
              
            case 'interrupted':
              onInterrupted()
              break
              
            case 'call_ended':
              onCallEnded(message.reason, message.summary)
              break
              
            case 'evaluation_submitted':
              onEvaluationSubmitted(message.evaluation)
              break
              
            case 'max_duration_reached':
              onMaxDurationReached()
              break
              
            case 'error':
              onError(message.message)
              break
              
            case 'go_away':
              onGoAway(message)
              break
              
            case 'session_resumable':
              onSessionResumable(message.token)
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
        onDisconnected()
      }

      wsRef.current.onerror = (error) => {
        console.error('WebSocket error:', error)
        onError('Connection error occurred')
      }
    } catch (error) {
      console.error('Failed to connect WebSocket:', error)
      onError('Failed to connect')
    }
  }, [url, onSessionCreated, onConnected, onDisconnected, onAudio, onTranscript, 
      onTurnComplete, onInterrupted, onCallEnded, onEvaluationSubmitted, 
      onMaxDurationReached, onError, onGoAway, onSessionResumable])

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
