import { useRef, useCallback, useEffect } from 'react'

// Parse sample rate from MIME type like "audio/pcm;rate=24000"
function parseSampleRate(mimeType) {
  if (!mimeType) return 24000
  const match = mimeType.match(/rate=(\d+)/)
  return match ? parseInt(match[1], 10) : 24000
}

// Convert base64 PCM (16-bit signed) to Float32 using DataView for correct byte handling
function base64ToFloat32(base64) {
  // Decode base64 to binary
  const binaryString = atob(base64)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  
  // Use DataView to read 16-bit signed integers (little-endian, which is standard for PCM)
  const dataView = new DataView(bytes.buffer)
  const numSamples = bytes.length / 2
  const float32Data = new Float32Array(numSamples)
  
  for (let i = 0; i < numSamples; i++) {
    // Read as signed 16-bit little-endian
    const sample = dataView.getInt16(i * 2, true) // true = little-endian
    // Normalize to -1.0 to 1.0
    float32Data[i] = sample / 32768.0
  }
  
  return float32Data
}

export function useAudioPlayer({ onEnded = () => {} }) {
  const audioContextRef = useRef(null)
  const nextPlayTimeRef = useRef(0)
  const isPlayingRef = useRef(false)

  // Get or create audio context
  const getContext = useCallback(async () => {
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      const AudioContext = window.AudioContext || window.webkitAudioContext
      audioContextRef.current = new AudioContext({ sampleRate: 24000 })
      console.log(`🎧 Created AudioContext at ${audioContextRef.current.sampleRate}Hz`)
    }
    
    // Resume if suspended (browser autoplay policy)
    if (audioContextRef.current.state === 'suspended') {
      console.log('🔄 Resuming AudioContext...')
      await audioContextRef.current.resume()
      console.log(`🎧 AudioContext resumed: ${audioContextRef.current.state}`)
    }
    
    return audioContextRef.current
  }, [])

  // Play a PCM chunk - scheduled for seamless playback
  const playChunk = useCallback(async (base64Audio, sampleRate) => {
    try {
      const audioContext = await getContext()
      
      // Convert base64 PCM to Float32
      const float32Data = base64ToFloat32(base64Audio)
      
      // Debug: check audio amplitude
      let maxVal = 0
      let minVal = 0
      for (let i = 0; i < float32Data.length; i++) {
        if (float32Data[i] > maxVal) maxVal = float32Data[i]
        if (float32Data[i] < minVal) minVal = float32Data[i]
      }
      
      const durationMs = (float32Data.length / sampleRate * 1000).toFixed(0)
      console.log(`🔈 Chunk: ${float32Data.length} samples, ${durationMs}ms, range: [${minVal.toFixed(4)}, ${maxVal.toFixed(4)}], ctxRate: ${audioContext.sampleRate}Hz`)

      // Create audio buffer
      const audioBuffer = audioContext.createBuffer(1, float32Data.length, sampleRate)
      audioBuffer.copyToChannel(float32Data, 0)

      // Create source
      const source = audioContext.createBufferSource()
      source.buffer = audioBuffer
      source.connect(audioContext.destination)

      // Handle jitter - if we're behind, catch up
      if (nextPlayTimeRef.current < audioContext.currentTime) {
        nextPlayTimeRef.current = audioContext.currentTime
      }

      // Schedule playback
      source.start(nextPlayTimeRef.current)
      
      // Update next play time
      nextPlayTimeRef.current += audioBuffer.duration
      
      isPlayingRef.current = true

      // Check when playback ends
      source.onended = () => {
        if (audioContext.currentTime >= nextPlayTimeRef.current - 0.01) {
          isPlayingRef.current = false
          onEnded()
        }
      }

    } catch (error) {
      console.error('❌ Error playing audio:', error)
    }
  }, [getContext, onEnded])

  // Main entry point
  const playAudio = useCallback((base64Audio, mimeType) => {
    const sampleRate = parseSampleRate(mimeType)
    console.log(`📥 Audio received: ${base64Audio.length} base64 chars`)
    playChunk(base64Audio, sampleRate)
  }, [playChunk])

  const stopPlayback = useCallback(() => {
    if (audioContextRef.current) {
      nextPlayTimeRef.current = audioContextRef.current.currentTime
    }
    isPlayingRef.current = false
    onEnded()
  }, [onEnded])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(() => {})
      }
    }
  }, [])

  return {
    playAudio,
    stopPlayback
  }
}
