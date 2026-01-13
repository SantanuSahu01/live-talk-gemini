import fs from 'fs';
import path from 'path';

/**
 * Audio sample rates
 */
export const SAMPLE_RATES = {
  USER_INPUT: 16000,    // 16kHz from client microphone
  GEMINI_OUTPUT: 24000, // 24kHz from Gemini
  MIXED: 24000,         // 24kHz for mixed output
};

/**
 * Create a WAV file header
 * @param {number} dataLength - Length of audio data in bytes
 * @param {number} sampleRate - Sample rate in Hz
 * @param {number} numChannels - Number of audio channels (1=mono, 2=stereo)
 * @param {number} bitsPerSample - Bits per sample (usually 16)
 * @returns {Buffer} WAV header buffer
 */
export function createWavHeader(dataLength, sampleRate, numChannels = 1, bitsPerSample = 16) {
  const header = Buffer.alloc(44);
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  
  // RIFF header
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataLength, 4);
  header.write('WAVE', 8);
  
  // fmt subchunk
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);              // Subchunk1Size (16 for PCM)
  header.writeUInt16LE(1, 20);               // AudioFormat (1 = PCM)
  header.writeUInt16LE(numChannels, 22);     // NumChannels
  header.writeUInt32LE(sampleRate, 24);      // SampleRate
  header.writeUInt32LE(byteRate, 28);        // ByteRate
  header.writeUInt16LE(blockAlign, 32);      // BlockAlign
  header.writeUInt16LE(bitsPerSample, 34);   // BitsPerSample
  
  // data subchunk
  header.write('data', 36);
  header.writeUInt32LE(dataLength, 40);
  
  return header;
}

/**
 * Convert base64 PCM data to Buffer
 * @param {string} base64Data - Base64 encoded PCM data
 * @returns {Buffer} PCM buffer
 */
export function base64ToPcm(base64Data) {
  return Buffer.from(base64Data, 'base64');
}

/**
 * Convert Buffer to base64
 * @param {Buffer} buffer - Buffer to convert
 * @returns {string} Base64 string
 */
export function pcmToBase64(buffer) {
  return buffer.toString('base64');
}

/**
 * Resample audio from one sample rate to another using linear interpolation
 * @param {Buffer} input - Input PCM buffer (16-bit signed)
 * @param {number} fromRate - Source sample rate
 * @param {number} toRate - Target sample rate
 * @returns {Buffer} Resampled PCM buffer
 */
export function resamplePcm(input, fromRate, toRate) {
  if (fromRate === toRate) {
    return input;
  }
  
  const ratio = toRate / fromRate;
  const inputSamples = input.length / 2;
  const outputSamples = Math.floor(inputSamples * ratio);
  const output = Buffer.alloc(outputSamples * 2);
  
  for (let i = 0; i < outputSamples; i++) {
    const srcPos = i / ratio;
    const srcIndex = Math.floor(srcPos);
    const frac = srcPos - srcIndex;
    
    let sample;
    if (srcIndex + 1 < inputSamples) {
      const s0 = input.readInt16LE(srcIndex * 2);
      const s1 = input.readInt16LE((srcIndex + 1) * 2);
      sample = Math.round(s0 + frac * (s1 - s0));
    } else {
      sample = input.readInt16LE(srcIndex * 2);
    }
    
    output.writeInt16LE(Math.max(-32768, Math.min(32767, sample)), i * 2);
  }
  
  return output;
}

/**
 * Mix two mono audio buffers into stereo (left and right channels)
 * @param {Buffer} left - Left channel PCM (16-bit)
 * @param {Buffer} right - Right channel PCM (16-bit)
 * @returns {Buffer} Stereo PCM buffer
 */
export function mixToStereo(left, right) {
  const samples = Math.max(left.length, right.length) / 2;
  const output = Buffer.alloc(samples * 4); // 2 channels * 2 bytes per sample
  
  for (let i = 0; i < samples; i++) {
    // Left channel
    const leftSample = i * 2 < left.length ? left.readInt16LE(i * 2) : 0;
    // Right channel  
    const rightSample = i * 2 < right.length ? right.readInt16LE(i * 2) : 0;
    
    output.writeInt16LE(leftSample, i * 4);      // Left
    output.writeInt16LE(rightSample, i * 4 + 2); // Right
  }
  
  return output;
}

/**
 * Create silence buffer for specified duration
 * @param {number} durationMs - Duration in milliseconds
 * @param {number} sampleRate - Sample rate
 * @returns {Buffer} Silence buffer
 */
export function createSilence(durationMs, sampleRate) {
  const samples = Math.floor((durationMs / 1000) * sampleRate);
  return Buffer.alloc(samples * 2); // 16-bit = 2 bytes per sample
}

/**
 * Calculate duration of PCM buffer
 * @param {Buffer} pcm - PCM buffer
 * @param {number} sampleRate - Sample rate
 * @param {number} bytesPerSample - Bytes per sample (default 2 for 16-bit)
 * @returns {number} Duration in milliseconds
 */
export function calculateDuration(pcm, sampleRate, bytesPerSample = 2) {
  const samples = pcm.length / bytesPerSample;
  return (samples / sampleRate) * 1000;
}

/**
 * Save audio buffer as WAV file
 * @param {string} filepath - Output file path
 * @param {Buffer} pcmData - PCM audio data
 * @param {number} sampleRate - Sample rate
 * @param {number} numChannels - Number of channels
 */
export function saveAsWav(filepath, pcmData, sampleRate, numChannels = 1) {
  const header = createWavHeader(pcmData.length, sampleRate, numChannels);
  const wavBuffer = Buffer.concat([header, pcmData]);
  
  const dir = path.dirname(filepath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  fs.writeFileSync(filepath, wavBuffer);
  return filepath;
}

/**
 * Append PCM data to buffer with proper timing
 */
export class TimedAudioBuffer {
  constructor(sampleRate) {
    this.sampleRate = sampleRate;
    this.chunks = [];
    this.startTime = null;
    this.lastTimestamp = 0;
  }
  
  /**
   * Start the buffer
   */
  start() {
    this.startTime = Date.now();
    this.lastTimestamp = 0;
    this.chunks = [];
  }
  
  /**
   * Add audio chunk with timing
   * @param {Buffer} pcmData - PCM data
   * @param {number} timestamp - Optional explicit timestamp
   */
  addChunk(pcmData, timestamp = null) {
    if (!this.startTime) {
      this.start();
    }
    
    const currentTime = timestamp ?? (Date.now() - this.startTime);
    
    // Fill gap with silence if needed
    if (currentTime > this.lastTimestamp) {
      const gapMs = currentTime - this.lastTimestamp;
      if (gapMs > 50) { // Only fill gaps > 50ms
        const silence = createSilence(gapMs, this.sampleRate);
        this.chunks.push(silence);
      }
    }
    
    this.chunks.push(pcmData);
    this.lastTimestamp = currentTime + calculateDuration(pcmData, this.sampleRate);
  }
  
  /**
   * Get combined buffer
   * @returns {Buffer}
   */
  getBuffer() {
    if (this.chunks.length === 0) {
      return Buffer.alloc(0);
    }
    return Buffer.concat(this.chunks);
  }
  
  /**
   * Get duration in milliseconds
   * @returns {number}
   */
  getDuration() {
    return calculateDuration(this.getBuffer(), this.sampleRate);
  }
  
  /**
   * Clear the buffer
   */
  clear() {
    this.chunks = [];
    this.startTime = null;
    this.lastTimestamp = 0;
  }
}

export default {
  SAMPLE_RATES,
  createWavHeader,
  base64ToPcm,
  pcmToBase64,
  resamplePcm,
  mixToStereo,
  createSilence,
  calculateDuration,
  saveAsWav,
  TimedAudioBuffer,
};

