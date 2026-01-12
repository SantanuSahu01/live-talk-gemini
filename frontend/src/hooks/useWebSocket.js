import { useState, useRef, useCallback, useEffect } from 'react'

export function useWebSocket({
  url,
  onConnected = () => {},
  onDisconnected = () => {},
  onAudio = (data, mimeType) => {},
  onTranscript = () => {},
  onTurnComplete = () => {},
  onInterrupted = () => {},
  onError = () => {}
}) {
  const [connectionState, setConnectionState] = useState('disconnected')
  const wsRef = useRef(null)
  const reconnectTimeoutRef = useRef(null)

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return
    }

    setConnectionState('connecting')

    try {
      wsRef.current = new WebSocket(url)

      wsRef.current.onopen = () => {
        setConnectionState('connected')
        console.log('WebSocket connected')
      }

      wsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          
          switch (data.type) {
            case 'connected':
              onConnected()
              break
            case 'disconnected':
              onDisconnected()
              break
            case 'audio':
              console.log(`🎵 Received audio from server: ${data.data.length} bytes, mime: ${data.mimeType}`)
              onAudio(data.data, data.mimeType)
              break
            case 'transcript':
              onTranscript(data.text, data.isFinal)
              break
            case 'turn_complete':
              onTurnComplete()
              break
            case 'interrupted':
              onInterrupted()
              break
            case 'error':
              onError(data.message)
              break
            default:
              console.log('Unknown message type:', data.type)
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error)
        }
      }

      wsRef.current.onclose = (event) => {
        setConnectionState('disconnected')
        console.log('WebSocket closed:', event.code, event.reason)
        onDisconnected()
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
  }, [url, onConnected, onDisconnected, onAudio, onTranscript, onTurnComplete, onInterrupted, onError])

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }

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

  const sendMessage = useCallback((type, payload = {}) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type,
        ...payload
      }))
    }
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect()
    }
  }, [disconnect])

  return {
    connect,
    disconnect,
    sendAudio,
    sendMessage,
    connectionState,
    isConnected: connectionState === 'connected'
  }
}

