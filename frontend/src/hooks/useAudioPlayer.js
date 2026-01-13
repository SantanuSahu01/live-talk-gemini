import { useRef, useCallback, useEffect } from 'react'

const GEMINI_SAMPLE_RATE = 24000

export function useAudioPlayer({
  onEnded = () => {},
  onAudioLevel = () => {},
}) {
  const audioContextRef = useRef(null)
  const analyserRef = useRef(null)
  const gainNodeRef = useRef(null)
  const queueRef = useRef([])
  const isPlayingRef = useRef(false)
  const scheduledEndTimeRef = useRef(0)
  const animationRef = useRef(null)
  const onAudioLevelRef = useRef(onAudioLevel)
  const onEndedRef = useRef(onEnded)
  const activeSourcesRef = useRef([])
  const chunkCountRef = useRef(0)

  useEffect(() => {
    onAudioLevelRef.current = onAudioLevel
    onEndedRef.current = onEnded
  }, [onAudioLevel, onEnded])

  // Initialize context with browser's native sample rate
  const initContext = useCallback(() => {
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      // Let browser choose its native sample rate (usually 44100 or 48000)
      audioContextRef.current = new AudioContext()
      
      gainNodeRef.current = audioContextRef.current.createGain()
      gainNodeRef.current.gain.value = 1.0
      gainNodeRef.current.connect(audioContextRef.current.destination)
      
      analyserRef.current = audioContextRef.current.createAnalyser()
      analyserRef.current.fftSize = 256
      analyserRef.current.smoothingTimeConstant = 0.8
      analyserRef.current.connect(gainNodeRef.current)
      
      console.log('[AudioPlayer] Context created, browser sampleRate:', audioContextRef.current.sampleRate)
    }
    
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume()
    }
    
    return audioContextRef.current
  }, [])

  // Resample from input rate to output rate using linear interpolation
  const resample = useCallback((inputSamples, inputRate, outputRate) => {
    if (inputRate === outputRate) {
      return inputSamples
    }
    
    const ratio = inputRate / outputRate
    const outputLength = Math.ceil(inputSamples.length / ratio)
    const output = new Float32Array(outputLength)
    
    for (let i = 0; i < outputLength; i++) {
      const srcPos = i * ratio
      const srcIndex = Math.floor(srcPos)
      const frac = srcPos - srcIndex
      
      if (srcIndex + 1 < inputSamples.length) {
        // Linear interpolation
        output[i] = inputSamples[srcIndex] * (1 - frac) + inputSamples[srcIndex + 1] * frac
      } else if (srcIndex < inputSamples.length) {
        output[i] = inputSamples[srcIndex]
      }
    }
    
    return output
  }, [])

  // Analyze level for visualization
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

  // Play next chunk from queue
  const playNext = useCallback(() => {
    if (queueRef.current.length === 0) {
      const context = audioContextRef.current
      if (context && scheduledEndTimeRef.current <= context.currentTime) {
        isPlayingRef.current = false
        if (animationRef.current) {
          cancelAnimationFrame(animationRef.current)
          animationRef.current = null
        }
        onEndedRef.current()
      } else if (context) {
        setTimeout(playNext, 50)
      }
      return
    }

    const context = initContext()
    const chunk = queueRef.current.shift()
    chunkCountRef.current++
    const chunkNum = chunkCountRef.current

    try {
      // Decode base64 to bytes
      const binaryString = atob(chunk.data)
      const bytes = new Uint8Array(binaryString.length)
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i)
      }

      // Convert 16-bit signed PCM (little-endian) to Float32
      const numSamples = Math.floor(bytes.length / 2)
      const float32 = new Float32Array(numSamples)
      
      let maxSample = 0
      for (let i = 0; i < numSamples; i++) {
        const low = bytes[i * 2]
        const high = bytes[i * 2 + 1]
        let sample = (high << 8) | low
        if (sample >= 32768) sample -= 65536
        float32[i] = sample / 32768.0
        maxSample = Math.max(maxSample, Math.abs(float32[i]))
      }

      // Debug first 3 chunks
      if (chunkNum <= 3) {
        console.log(`[AudioPlayer] Chunk #${chunkNum}:`, {
          inputBytes: bytes.length,
          inputSamples: numSamples,
          inputRate: GEMINI_SAMPLE_RATE,
          outputRate: context.sampleRate,
          maxAmp: maxSample.toFixed(4),
          inputDurationMs: Math.round(numSamples / GEMINI_SAMPLE_RATE * 1000),
        })
      }

      // Skip very quiet chunks
      if (maxSample < 0.005) {
        playNext()
        return
      }

      // Resample from Gemini's 24kHz to browser's sample rate
      const outputRate = context.sampleRate
      const resampled = resample(float32, GEMINI_SAMPLE_RATE, outputRate)

      // Create audio buffer at browser's native sample rate
      const audioBuffer = context.createBuffer(1, resampled.length, outputRate)
      audioBuffer.copyToChannel(resampled, 0)

      // Create source and connect
      const source = context.createBufferSource()
      source.buffer = audioBuffer
      source.connect(analyserRef.current)

      // Schedule seamless playback
      const currentTime = context.currentTime
      const startTime = Math.max(scheduledEndTimeRef.current, currentTime)
      
      source.start(startTime)
      scheduledEndTimeRef.current = startTime + audioBuffer.duration

      activeSourcesRef.current.push(source)
      
      source.onended = () => {
        const idx = activeSourcesRef.current.indexOf(source)
        if (idx > -1) activeSourcesRef.current.splice(idx, 1)
        playNext()
      }

      if (!animationRef.current) {
        analyzeLevel()
      }

    } catch (error) {
      console.error('[AudioPlayer] Error:', error)
      playNext()
    }
  }, [initContext, resample, analyzeLevel])

  // Queue audio for playback
  const playAudio = useCallback((base64Data, mimeType) => {
    queueRef.current.push({ data: base64Data, mimeType })

    if (!isPlayingRef.current) {
      isPlayingRef.current = true
      playNext()
    }
  }, [playNext])

  // Stop all playback
  const stopPlayback = useCallback(() => {
    queueRef.current = []
    activeSourcesRef.current.forEach(s => { try { s.stop() } catch(e){} })
    activeSourcesRef.current = []
    scheduledEndTimeRef.current = 0
    isPlayingRef.current = false
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current)
      animationRef.current = null
    }
  }, [])

  // Get current level
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
      if (animationRef.current) cancelAnimationFrame(animationRef.current)
      activeSourcesRef.current.forEach(s => { try { s.stop() } catch(e){} })
      if (audioContextRef.current?.state !== 'closed') {
        audioContextRef.current?.close()
      }
    }
  }, [])

  return { playAudio, stopPlayback, getAudioLevel }
}
