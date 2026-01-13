import { useState, useRef, useCallback, useEffect } from 'react'

export function useAudioRecorder({
  onAudioData = () => {},
  onStarted = () => {},
  onStopped = () => {},
  onAudioLevel = () => {},
}) {
  const [isRecording, setIsRecording] = useState(false)
  const [isSupported, setIsSupported] = useState(true)
  
  const audioContextRef = useRef(null)
  const streamRef = useRef(null)
  const processorRef = useRef(null)
  const analyserRef = useRef(null)
  const animationRef = useRef(null)

  // Check browser support
  useEffect(() => {
    setIsSupported(
      typeof navigator !== 'undefined' &&
      navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === 'function' &&
      typeof AudioContext !== 'undefined'
    )
  }, [])

  // Analyze audio levels
  const analyzeLevel = useCallback(() => {
    if (!analyserRef.current) return

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount)
    analyserRef.current.getByteFrequencyData(dataArray)
    
    // Calculate average level
    let sum = 0
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i]
    }
    const average = sum / dataArray.length / 255

    onAudioLevel(average)
    
    if (isRecording) {
      animationRef.current = requestAnimationFrame(analyzeLevel)
    }
  }, [isRecording, onAudioLevel])

  const startRecording = useCallback(async () => {
    if (!isSupported || isRecording) return

    try {
      // Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        }
      })

      streamRef.current = stream

      // Create audio context
      audioContextRef.current = new AudioContext({ sampleRate: 16000 })
      const source = audioContextRef.current.createMediaStreamSource(stream)

      // Create analyser for level detection
      analyserRef.current = audioContextRef.current.createAnalyser()
      analyserRef.current.fftSize = 256
      source.connect(analyserRef.current)

      // Create processor for audio data
      processorRef.current = audioContextRef.current.createScriptProcessor(4096, 1, 1)
      
      processorRef.current.onaudioprocess = (event) => {
        const inputData = event.inputBuffer.getChannelData(0)
        
        // Convert to 16-bit PCM
        const pcmData = new Int16Array(inputData.length)
        for (let i = 0; i < inputData.length; i++) {
          const sample = Math.max(-1, Math.min(1, inputData[i]))
          pcmData[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF
        }

        // Convert to base64
        const uint8Array = new Uint8Array(pcmData.buffer)
        let binary = ''
        for (let i = 0; i < uint8Array.length; i++) {
          binary += String.fromCharCode(uint8Array[i])
        }
        const base64 = btoa(binary)

        onAudioData(base64)
      }

      source.connect(processorRef.current)
      processorRef.current.connect(audioContextRef.current.destination)

      setIsRecording(true)
      onStarted()
      
      // Start level analysis
      analyzeLevel()

    } catch (error) {
      console.error('Failed to start recording:', error)
      if (error.name === 'NotAllowedError') {
        setIsSupported(false)
      }
    }
  }, [isSupported, isRecording, onAudioData, onStarted, analyzeLevel])

  const stopRecording = useCallback(() => {
    // Stop animation
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current)
      animationRef.current = null
    }

    // Stop processor
    if (processorRef.current) {
      processorRef.current.disconnect()
      processorRef.current = null
    }

    // Stop stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }

    // Close audio context
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close()
      audioContextRef.current = null
    }

    analyserRef.current = null
    
    setIsRecording(false)
    onStopped()
    onAudioLevel(0)
  }, [onStopped, onAudioLevel])

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
    isSupported,
  }
}
