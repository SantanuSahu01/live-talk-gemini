import fs from 'fs';
import path from 'path';

/**
 * CallRecorder - Records both sides of a conversation
 * 
 * Audio:
 * - User audio: 16kHz, 16-bit, mono (input)
 * - Gemini audio: 24kHz, 16-bit, mono (output)
 * - Mixed: Stereo WAV (user left, Gemini right)
 * 
 * Transcripts:
 * - JSON array with timestamps relative to recording start
 */
export class CallRecorder {
  constructor(options = {}) {
    this.clientId = options.clientId || 'unknown';
    this.outputDir = options.outputDir || './recordings';
    
    // Audio settings
    this.userSampleRate = 16000;
    this.geminiSampleRate = 24000;
    this.mixedSampleRate = 24000;
    this.bitsPerSample = 16;
    this.channels = 1;
    
    // Buffers to store audio data
    this.userAudioChunks = [];
    this.geminiAudioChunks = [];
    
    // Transcripts array
    this.transcripts = [];
    
    // Timing for maintaining conversation sequence
    this.recordingStartTime = null;
    this.lastUserAudioTime = 0;
    this.lastGeminiAudioTime = 0;
    
    // Total samples recorded (for timing calculations)
    this.userSamplesRecorded = 0;
    this.geminiSamplesRecorded = 0;
    
    this.isRecording = false;
    this.sessionId = null;
    
    // Ensure output directory exists
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * Start recording a new session
   */
  start() {
    this.sessionId = `${this.clientId}_${Date.now()}`;
    this.recordingStartTime = Date.now();
    this.isRecording = true;
    
    // Reset buffers
    this.userAudioChunks = [];
    this.geminiAudioChunks = [];
    this.transcripts = [];
    this.userSamplesRecorded = 0;
    this.geminiSamplesRecorded = 0;
    this.lastUserAudioTime = 0;
    this.lastGeminiAudioTime = 0;
    
    console.log(`🎙️ [${this.clientId}] Recording started: ${this.sessionId}`);
    return this.sessionId;
  }

  /**
   * Add user audio chunk (from microphone)
   * @param {string} base64Audio - Base64 encoded PCM audio (16kHz)
   */
  addUserAudio(base64Audio) {
    if (!this.isRecording) return;
    
    const buffer = Buffer.from(base64Audio, 'base64');
    const currentTime = Date.now() - this.recordingStartTime;
    
    this.userAudioChunks.push(buffer);
    this.userSamplesRecorded += buffer.length / 2;
    this.lastUserAudioTime = currentTime;
  }

  /**
   * Add Gemini audio chunk (from AI response)
   * With silence filling for timing alignment
   * @param {string} base64Audio - Base64 encoded PCM audio (24kHz)
   */
  addGeminiAudio(base64Audio) {
    if (!this.isRecording) return;
    
    const buffer = Buffer.from(base64Audio, 'base64');
    const currentTime = Date.now() - this.recordingStartTime;
    
    // Calculate expected samples at this point in time
    const expectedSamples = Math.floor((currentTime / 1000) * this.geminiSampleRate);
    
    // If we're behind, fill with silence to maintain timing
    const silenceSamplesNeeded = expectedSamples - this.geminiSamplesRecorded;
    
    if (silenceSamplesNeeded > 0) {
      const silenceBuffer = Buffer.alloc(silenceSamplesNeeded * 2, 0);
      this.geminiAudioChunks.push(silenceBuffer);
      this.geminiSamplesRecorded += silenceSamplesNeeded;
    }
    
    // Add the actual audio
    this.geminiAudioChunks.push(buffer);
    this.geminiSamplesRecorded += buffer.length / 2;
    this.lastGeminiAudioTime = currentTime;
  }

  /**
   * Add a transcript entry
   * @param {string} role - 'user' or 'assistant'
   * @param {string} text - The transcript text
   * @param {boolean} isFinal - Whether this is a final transcript
   */
  addTranscript(role, text, isFinal) {
    if (!this.isRecording) return;
    
    const timestamp = Date.now() - this.recordingStartTime;
    const timestampSeconds = (timestamp / 1000).toFixed(2);
    
    // For interim transcripts, update the last one if same role and not final
    if (!isFinal) {
      const lastTranscript = this.transcripts[this.transcripts.length - 1];
      if (lastTranscript && lastTranscript.role === role && !lastTranscript.isFinal) {
        // Update existing interim transcript
        lastTranscript.text = text;
        lastTranscript.timestamp = parseFloat(timestampSeconds);
        lastTranscript.timestampMs = timestamp;
        return;
      }
    }
    
    // Add new transcript entry
    this.transcripts.push({
      role,
      text,
      isFinal,
      timestamp: parseFloat(timestampSeconds),
      timestampMs: timestamp,
      time: this.formatTime(timestamp)
    });
  }

  /**
   * Format milliseconds to MM:SS.mmm
   */
  formatTime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    const millis = ms % 1000;
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${millis.toString().padStart(3, '0')}`;
  }

  /**
   * Stop recording and save files
   * @returns {object} Paths to saved files
   */
  async stop() {
    if (!this.isRecording) {
      return null;
    }
    
    this.isRecording = false;
    const duration = (Date.now() - this.recordingStartTime) / 1000;
    
    console.log(`🎙️ [${this.clientId}] Recording stopped. Duration: ${duration.toFixed(1)}s`);
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const baseFilename = `${this.sessionId}_${timestamp}`;
    
    const files = {};
    
    try {
      // Save the stereo mix (user on left, Gemini on right)
      if (this.userAudioChunks.length > 0 || this.geminiAudioChunks.length > 0) {
        const mixedFilename = path.join(this.outputDir, `${baseFilename}.wav`);
        await this.saveStereoMix(mixedFilename);
        files.audio = mixedFilename;
        console.log(`💾 [${this.clientId}] Audio saved: ${mixedFilename}`);
      }
      
      // Save transcripts as JSON
      if (this.transcripts.length > 0) {
        const transcriptFilename = path.join(this.outputDir, `${baseFilename}.json`);
        this.saveTranscripts(transcriptFilename, duration);
        files.transcripts = transcriptFilename;
        console.log(`💾 [${this.clientId}] Transcripts saved: ${transcriptFilename}`);
      }
      
    } catch (error) {
      console.error(`❌ [${this.clientId}] Error saving recording:`, error);
    }
    
    // Clear buffers
    this.userAudioChunks = [];
    this.geminiAudioChunks = [];
    this.transcripts = [];
    
    return files;
  }

  /**
   * Save transcripts to JSON file
   */
  saveTranscripts(filename, duration) {
    // Filter to only keep final transcripts for cleaner output
    const finalTranscripts = this.transcripts.filter(t => t.isFinal);
    
    const data = {
      sessionId: this.sessionId,
      clientId: this.clientId,
      recordedAt: new Date().toISOString(),
      duration: parseFloat(duration.toFixed(2)),
      durationFormatted: this.formatTime(duration * 1000),
      transcriptCount: finalTranscripts.length,
      transcripts: finalTranscripts.map(t => ({
        role: t.role,
        text: t.text,
        timestamp: t.timestamp,
        time: t.time
      })),
      // Also include all transcripts (including interim) for debugging
      allTranscripts: this.transcripts.map(t => ({
        role: t.role,
        text: t.text,
        isFinal: t.isFinal,
        timestamp: t.timestamp,
        time: t.time
      }))
    };
    
    fs.writeFileSync(filename, JSON.stringify(data, null, 2));
  }

  /**
   * Save PCM data as WAV file
   */
  saveWav(filename, pcmBuffer, sampleRate) {
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);
    const dataSize = pcmBuffer.length;
    const fileSize = 36 + dataSize;
    
    const header = Buffer.alloc(44);
    
    header.write('RIFF', 0);
    header.writeUInt32LE(fileSize, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(numChannels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(bitsPerSample, 34);
    header.write('data', 36);
    header.writeUInt32LE(dataSize, 40);
    
    const wavBuffer = Buffer.concat([header, pcmBuffer]);
    fs.writeFileSync(filename, wavBuffer);
  }

  /**
   * Create stereo mix with user on left channel, Gemini on right
   */
  async saveStereoMix(filename) {
    const userBuffer = Buffer.concat(this.userAudioChunks);
    const geminiBuffer = Buffer.concat(this.geminiAudioChunks);
    
    // Resample user audio from 16kHz to 24kHz
    const resampledUser = this.resample(userBuffer, this.userSampleRate, this.geminiSampleRate);
    
    const userSamples = resampledUser.length / 2;
    const geminiSamples = geminiBuffer.length / 2;
    const maxSamples = Math.max(userSamples, geminiSamples);
    
    // Create stereo buffer (2 channels, 16-bit)
    const stereoBuffer = Buffer.alloc(maxSamples * 4);
    
    for (let i = 0; i < maxSamples; i++) {
      const userSample = i < userSamples ? resampledUser.readInt16LE(i * 2) : 0;
      const geminiSample = i < geminiSamples ? geminiBuffer.readInt16LE(i * 2) : 0;
      
      stereoBuffer.writeInt16LE(userSample, i * 4);
      stereoBuffer.writeInt16LE(geminiSample, i * 4 + 2);
    }
    
    this.saveWavStereo(filename, stereoBuffer, this.geminiSampleRate);
  }

  /**
   * Save stereo PCM data as WAV file
   */
  saveWavStereo(filename, pcmBuffer, sampleRate) {
    const numChannels = 2;
    const bitsPerSample = 16;
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);
    const dataSize = pcmBuffer.length;
    const fileSize = 36 + dataSize;
    
    const header = Buffer.alloc(44);
    
    header.write('RIFF', 0);
    header.writeUInt32LE(fileSize, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(numChannels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(bitsPerSample, 34);
    header.write('data', 36);
    header.writeUInt32LE(dataSize, 40);
    
    const wavBuffer = Buffer.concat([header, pcmBuffer]);
    fs.writeFileSync(filename, wavBuffer);
  }

  /**
   * Simple linear interpolation resampling
   */
  resample(buffer, fromRate, toRate) {
    if (buffer.length === 0) return Buffer.alloc(0);
    
    const ratio = fromRate / toRate;
    const inputSamples = buffer.length / 2;
    const outputSamples = Math.floor(inputSamples / ratio);
    const output = Buffer.alloc(outputSamples * 2);
    
    for (let i = 0; i < outputSamples; i++) {
      const srcIndex = i * ratio;
      const srcIndexFloor = Math.floor(srcIndex);
      const srcIndexCeil = Math.min(srcIndexFloor + 1, inputSamples - 1);
      const t = srcIndex - srcIndexFloor;
      
      const sample1 = buffer.readInt16LE(srcIndexFloor * 2);
      const sample2 = buffer.readInt16LE(srcIndexCeil * 2);
      const interpolated = Math.round(sample1 * (1 - t) + sample2 * t);
      
      output.writeInt16LE(interpolated, i * 2);
    }
    
    return output;
  }

  /**
   * Check if currently recording
   */
  isActive() {
    return this.isRecording;
  }

  /**
   * Get recording stats
   */
  getStats() {
    if (!this.isRecording) return null;
    
    const duration = (Date.now() - this.recordingStartTime) / 1000;
    return {
      sessionId: this.sessionId,
      duration: duration.toFixed(1),
      userChunks: this.userAudioChunks.length,
      geminiChunks: this.geminiAudioChunks.length,
      transcriptCount: this.transcripts.filter(t => t.isFinal).length,
      userDuration: (this.userSamplesRecorded / this.userSampleRate).toFixed(1),
      geminiDuration: (this.geminiSamplesRecorded / this.geminiSampleRate).toFixed(1)
    };
  }
}
