import { useState, useRef, useCallback, useEffect } from 'react'

export function useAudioRecorder({ onAudioData, onStarted = () => {} }) {
  const [isRecording, setIsRecording] = useState(false)
  const [isSupported, setIsSupported] = useState(true)
  
  const mediaStreamRef = useRef(null)
  const audioContextRef = useRef(null)
  const processorRef = useRef(null)
  const sourceRef = useRef(null)

  // Check browser support
  useEffect(() => {
    const supported = !!(navigator.mediaDevices?.getUserMedia && 
                        (window.AudioContext || window.webkitAudioContext))
    setIsSupported(supported)
  }, [])

  const startRecording = useCallback(async () => {
    try {
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      })

      mediaStreamRef.current = stream

      // Create audio context with 16kHz sample rate (required by Gemini)
      const AudioContext = window.AudioContext || window.webkitAudioContext
      audioContextRef.current = new AudioContext({ sampleRate: 16000 })

      // Create source from microphone
      sourceRef.current = audioContextRef.current.createMediaStreamSource(stream)

      // Create script processor for raw audio access
      // Note: ScriptProcessorNode is deprecated but AudioWorklet requires more setup
      const bufferSize = 4096
      processorRef.current = audioContextRef.current.createScriptProcessor(bufferSize, 1, 1)

      processorRef.current.onaudioprocess = (event) => {
        const inputData = event.inputBuffer.getChannelData(0)
        
        // Convert Float32Array to Int16Array (PCM 16-bit)
        const pcmData = new Int16Array(inputData.length)
        for (let i = 0; i < inputData.length; i++) {
          // Clamp values between -1 and 1, then scale to Int16 range
          const sample = Math.max(-1, Math.min(1, inputData[i]))
          pcmData[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff
        }

        // Convert to base64
        const base64 = arrayBufferToBase64(pcmData.buffer)
        onAudioData(base64)
      }

      // Connect the audio graph
      sourceRef.current.connect(processorRef.current)
      processorRef.current.connect(audioContextRef.current.destination)

      setIsRecording(true)
      onStarted()
      console.log('Recording started')

    } catch (error) {
      console.error('Failed to start recording:', error)
      throw error
    }
  }, [onAudioData, onStarted])

  const stopRecording = useCallback(() => {
    // Stop the media stream tracks
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop())
      mediaStreamRef.current = null
    }

    // Disconnect and clean up audio nodes
    if (processorRef.current) {
      processorRef.current.disconnect()
      processorRef.current = null
    }

    if (sourceRef.current) {
      sourceRef.current.disconnect()
      sourceRef.current = null
    }

    // Close the audio context
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }

    setIsRecording(false)
    console.log('Recording stopped')
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopRecording()
    }
  }, [stopRecording])

  return {
    startRecording,
    stopRecording,
    isRecording,
    isSupported
  }
}

// Helper function to convert ArrayBuffer to base64
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

