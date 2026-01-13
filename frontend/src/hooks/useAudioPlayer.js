import { useRef, useCallback, useEffect } from 'react'

const SAMPLE_RATE = 24000
const BUFFER_SIZE = 7680
const INITIAL_BUFFER_TIME = 0.1  // 100ms buffer before starting
const SCHEDULE_AHEAD_TIME = 0.2 // Schedule 200ms ahead

export function useAudioPlayer({
  onEnded = () => {},
  onAudioLevel = () => {},
}) {
  const audioContextRef = useRef(null)
  const gainNodeRef = useRef(null)
  const analyserRef = useRef(null)
  const audioQueueRef = useRef([])
  const isPlayingRef = useRef(false)
  const isStreamCompleteRef = useRef(false)
  const scheduledTimeRef = useRef(0)
  const checkIntervalRef = useRef(null)
  const endOfQueueSourceRef = useRef(null)
  const animationRef = useRef(null)
  
  const onAudioLevelRef = useRef(onAudioLevel)
  const onEndedRef = useRef(onEnded)

  useEffect(() => {
    onAudioLevelRef.current = onAudioLevel
    onEndedRef.current = onEnded
  }, [onAudioLevel, onEnded])

  // Initialize audio context
  const initContext = useCallback(() => {
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      audioContextRef.current = new AudioContext({ sampleRate: SAMPLE_RATE })
      
      gainNodeRef.current = audioContextRef.current.createGain()
      gainNodeRef.current.connect(audioContextRef.current.destination)
      
      analyserRef.current = audioContextRef.current.createAnalyser()
      analyserRef.current.fftSize = 256
      analyserRef.current.connect(gainNodeRef.current)
      
      console.log('[AudioPlayer] Context created at', audioContextRef.current.sampleRate, 'Hz')
    }
    
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume()
    }
    
    return audioContextRef.current
  }, [])

  // Convert PCM16 Uint8Array to Float32Array
  const processPCM16Chunk = useCallback((chunk) => {
    const float32Array = new Float32Array(chunk.length / 2)
    const dataView = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength)
    
    for (let i = 0; i < chunk.length / 2; i++) {
      const int16 = dataView.getInt16(i * 2, true) // little-endian
      float32Array[i] = int16 / 32768
    }
    return float32Array
  }, [])

  // Create AudioBuffer from Float32Array
  const createAudioBuffer = useCallback((audioData) => {
    const context = audioContextRef.current
    const audioBuffer = context.createBuffer(1, audioData.length, SAMPLE_RATE)
    audioBuffer.getChannelData(0).set(audioData)
    return audioBuffer
  }, [])

  // Analyze audio level
  const analyzeLevel = useCallback(() => {
    if (!analyserRef.current || !isPlayingRef.current) return

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount)
    analyserRef.current.getByteFrequencyData(dataArray)
    
    let sum = 0
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i]
    }
    onAudioLevelRef.current(sum / dataArray.length / 255)
    
    animationRef.current = requestAnimationFrame(analyzeLevel)
  }, [])

  // Schedule next buffer for playback
  const scheduleNextBuffer = useCallback(() => {
    const context = audioContextRef.current
    if (!context) return

    // Schedule multiple buffers ahead to prevent gaps
    while (
      audioQueueRef.current.length > 0 &&
      scheduledTimeRef.current < context.currentTime + SCHEDULE_AHEAD_TIME
    ) {
      const audioData = audioQueueRef.current.shift()
      const audioBuffer = createAudioBuffer(audioData)
      const source = context.createBufferSource()

      // Track the last source to detect when queue empties
      if (audioQueueRef.current.length === 0) {
        if (endOfQueueSourceRef.current) {
          endOfQueueSourceRef.current.onended = null
        }
        endOfQueueSourceRef.current = source
        source.onended = () => {
          if (!audioQueueRef.current.length && endOfQueueSourceRef.current === source) {
            endOfQueueSourceRef.current = null
            onEndedRef.current()
          }
        }
      }

      source.buffer = audioBuffer
      source.connect(analyserRef.current)

      // Never schedule in the past
      const startTime = Math.max(scheduledTimeRef.current, context.currentTime)
      source.start(startTime)
      scheduledTimeRef.current = startTime + audioBuffer.duration
    }

    // Handle empty queue
    if (audioQueueRef.current.length === 0) {
      if (isStreamCompleteRef.current) {
        isPlayingRef.current = false
        if (checkIntervalRef.current) {
          clearInterval(checkIntervalRef.current)
          checkIntervalRef.current = null
        }
        if (animationRef.current) {
          cancelAnimationFrame(animationRef.current)
          animationRef.current = null
        }
      } else {
        // Keep checking for new audio
        if (!checkIntervalRef.current) {
          checkIntervalRef.current = setInterval(() => {
            if (audioQueueRef.current.length > 0) {
              scheduleNextBuffer()
            }
          }, 100)
        }
      }
    } else {
      // Schedule next check
      const nextCheckTime = (scheduledTimeRef.current - context.currentTime) * 1000
      setTimeout(() => scheduleNextBuffer(), Math.max(0, nextCheckTime - 50))
    }
  }, [createAudioBuffer, analyzeLevel])

  // Add PCM16 audio chunk to queue
  const playAudio = useCallback((base64Data, mimeType) => {
    const context = initContext()
    
    // Reset stream complete flag
    isStreamCompleteRef.current = false

    // Decode base64 to Uint8Array
    const binaryString = atob(base64Data)
    const chunk = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      chunk[i] = binaryString.charCodeAt(i)
    }

    // Process PCM16 to Float32
    let processingBuffer = processPCM16Chunk(chunk)

    // Split into buffer-sized chunks
    while (processingBuffer.length >= BUFFER_SIZE) {
      const buffer = processingBuffer.slice(0, BUFFER_SIZE)
      audioQueueRef.current.push(buffer)
      processingBuffer = processingBuffer.slice(BUFFER_SIZE)
    }

    // Add remaining samples
    if (processingBuffer.length > 0) {
      audioQueueRef.current.push(processingBuffer)
    }

    // Start playing if not already
    if (!isPlayingRef.current) {
      isPlayingRef.current = true
      // Add initial buffer delay before starting
      scheduledTimeRef.current = context.currentTime + INITIAL_BUFFER_TIME
      scheduleNextBuffer()
      
      // Start level analysis
      if (!animationRef.current) {
        analyzeLevel()
      }
    }
  }, [initContext, processPCM16Chunk, scheduleNextBuffer, analyzeLevel])

  // Stop playback
  const stopPlayback = useCallback(() => {
    isPlayingRef.current = false
    isStreamCompleteRef.current = true
    audioQueueRef.current = []
    
    if (audioContextRef.current) {
      scheduledTimeRef.current = audioContextRef.current.currentTime
    }

    if (checkIntervalRef.current) {
      clearInterval(checkIntervalRef.current)
      checkIntervalRef.current = null
    }

    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current)
      animationRef.current = null
    }

    // Fade out gain
    if (gainNodeRef.current && audioContextRef.current) {
      gainNodeRef.current.gain.linearRampToValueAtTime(
        0,
        audioContextRef.current.currentTime + 0.1
      )

      setTimeout(() => {
        if (gainNodeRef.current && audioContextRef.current) {
          gainNodeRef.current.disconnect()
          gainNodeRef.current = audioContextRef.current.createGain()
          gainNodeRef.current.connect(audioContextRef.current.destination)
          if (analyserRef.current) {
            analyserRef.current.disconnect()
            analyserRef.current.connect(gainNodeRef.current)
          }
        }
      }, 200)
    }
  }, [])

  // Get current audio level
  const getAudioLevel = useCallback(() => {
    if (!analyserRef.current) return 0
    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount)
    analyserRef.current.getByteFrequencyData(dataArray)
    let sum = 0
    for (let i = 0; i < dataArray.length; i++) sum += dataArray[i]
    return sum / dataArray.length / 255
  }, [])

  // Cleanup
  useEffect(() => {
    return () => {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current)
      }
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
      if (audioContextRef.current?.state !== 'closed') {
        audioContextRef.current?.close()
      }
    }
  }, [])

  return { playAudio, stopPlayback, getAudioLevel }
}
