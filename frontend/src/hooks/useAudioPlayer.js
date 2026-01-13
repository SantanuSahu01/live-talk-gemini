import { useRef, useCallback, useEffect } from 'react'

export function useAudioPlayer({
  onEnded = () => {},
  onAudioLevel = () => {},
}) {
  const audioContextRef = useRef(null)
  const analyserRef = useRef(null)
  const gainNodeRef = useRef(null)
  const queueRef = useRef([])
  const isPlayingRef = useRef(false)
  const nextPlayTimeRef = useRef(0)
  const animationRef = useRef(null)
  const onAudioLevelRef = useRef(onAudioLevel)
  const onEndedRef = useRef(onEnded)

  // Keep refs updated
  useEffect(() => {
    onAudioLevelRef.current = onAudioLevel
    onEndedRef.current = onEnded
  }, [onAudioLevel, onEnded])

  // Initialize audio context
  const initContext = useCallback(() => {
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      audioContextRef.current = new AudioContext({ sampleRate: 24000 })
      
      // Create gain node
      gainNodeRef.current = audioContextRef.current.createGain()
      gainNodeRef.current.connect(audioContextRef.current.destination)
      
      // Create analyser
      analyserRef.current = audioContextRef.current.createAnalyser()
      analyserRef.current.fftSize = 256
      analyserRef.current.connect(gainNodeRef.current)
    }
    
    // Resume if suspended
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume()
    }
    
    return audioContextRef.current
  }, [])

  // Analyze audio level
  const analyzeLevel = useCallback(() => {
    if (!analyserRef.current || !isPlayingRef.current) {
      return
    }

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount)
    analyserRef.current.getByteFrequencyData(dataArray)
    
    let sum = 0
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i]
    }
    const average = sum / dataArray.length / 255

    onAudioLevelRef.current(average)
    
    animationRef.current = requestAnimationFrame(analyzeLevel)
  }, [])

  // Play next chunk in queue
  const playNext = useCallback(async () => {
    if (queueRef.current.length === 0) {
      isPlayingRef.current = false
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
        animationRef.current = null
      }
      onEndedRef.current()
      return
    }

    const context = initContext()
    const chunk = queueRef.current.shift()

    try {
      // Decode base64 to PCM
      const binary = atob(chunk.data)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i)
      }

      // Convert 16-bit PCM to Float32
      const samples = bytes.length / 2
      const float32 = new Float32Array(samples)
      const view = new DataView(bytes.buffer)
      
      for (let i = 0; i < samples; i++) {
        const sample = view.getInt16(i * 2, true) // Little-endian
        float32[i] = sample / 32768
      }

      // Create audio buffer
      const audioBuffer = context.createBuffer(1, float32.length, 24000)
      audioBuffer.copyToChannel(float32, 0)

      // Create source
      const source = context.createBufferSource()
      source.buffer = audioBuffer
      source.connect(analyserRef.current)

      // Handle jitter - reset time if we're behind
      const currentTime = context.currentTime
      if (nextPlayTimeRef.current < currentTime) {
        nextPlayTimeRef.current = currentTime
      }

      // Schedule playback
      source.start(nextPlayTimeRef.current)
      nextPlayTimeRef.current += audioBuffer.duration

      // Start level analysis
      if (!animationRef.current) {
        analyzeLevel()
      }

      source.onended = () => {
        if (queueRef.current.length === 0) {
          playNext()
        }
      }

      // Continue processing queue
      if (queueRef.current.length > 0) {
        playNext()
      }

    } catch (error) {
      console.error('Error playing audio:', error)
      playNext()
    }
  }, [initContext, analyzeLevel])

  // Add audio to queue
  const playAudio = useCallback((base64Data, mimeType) => {
    queueRef.current.push({ data: base64Data, mimeType })

    if (!isPlayingRef.current) {
      isPlayingRef.current = true
      playNext()
    }
  }, [playNext])

  // Stop playback
  const stopPlayback = useCallback(() => {
    queueRef.current = []
    nextPlayTimeRef.current = 0
    isPlayingRef.current = false
    
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current)
      animationRef.current = null
    }
  }, [])

  // Get current audio level
  const getAudioLevel = useCallback(() => {
    if (!analyserRef.current) return 0
    
    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount)
    analyserRef.current.getByteFrequencyData(dataArray)
    
    let sum = 0
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i]
    }
    return sum / dataArray.length / 255
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close()
      }
    }
  }, [])

  return {
    playAudio,
    stopPlayback,
    getAudioLevel,
  }
}
