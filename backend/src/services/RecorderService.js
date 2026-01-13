import fs from 'fs';
import path from 'path';
import config from '../config/index.js';
import { createSessionLogger } from '../utils/logger.js';
import { 
  SAMPLE_RATES, 
  base64ToPcm, 
  resamplePcm, 
  mixToStereo, 
  createSilence,
  saveAsWav,
  calculateDuration 
} from '../utils/audio.js';

/**
 * RecorderService - handles audio and transcript recording for interviews
 */
export class RecorderService {
  /**
   * @param {object} options
   * @param {string} options.sessionId - Session ID
   * @param {string} options.interviewId - Interview ID
   * @param {string} options.outputDir - Output directory for recordings
   */
  constructor(options = {}) {
    this.sessionId = options.sessionId;
    this.interviewId = options.interviewId;
    this.outputDir = options.outputDir || config.RECORDING_DIR;
    this.logger = createSessionLogger(this.sessionId, { component: 'recorder' });
    
    // Audio buffers
    this.userAudioChunks = [];
    this.geminiAudioChunks = [];
    
    // Transcripts
    this.transcripts = [];
    this.allTranscripts = []; // Including interim
    
    // Timing
    this.startTime = null;
    this.lastUserAudioTime = 0;
    this.lastGeminiAudioTime = 0;
    
    // State
    this.isRecording = false;
  }
  
  /**
   * Start recording
   */
  start() {
    if (this.isRecording) {
      return;
    }
    
    this.isRecording = true;
    this.startTime = Date.now();
    this.userAudioChunks = [];
    this.geminiAudioChunks = [];
    this.transcripts = [];
    this.allTranscripts = [];
    this.lastUserAudioTime = 0;
    this.lastGeminiAudioTime = 0;
    
    // Ensure output directory exists
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
    
    this.logger.info('Recording started');
  }
  
  /**
   * Check if recording is active
   * @returns {boolean}
   */
  isActive() {
    return this.isRecording;
  }
  
  /**
   * Add user audio chunk
   * @param {string} base64Audio - Base64 encoded PCM audio
   */
  addUserAudio(base64Audio) {
    if (!this.isRecording) return;
    
    const pcm = base64ToPcm(base64Audio);
    const currentTime = Date.now() - this.startTime;
    
    // Fill gap with silence if needed
    const gapMs = currentTime - this.lastUserAudioTime;
    if (gapMs > 100) {
      const silence = createSilence(gapMs, SAMPLE_RATES.USER_INPUT);
      this.userAudioChunks.push(silence);
    }
    
    this.userAudioChunks.push(pcm);
    this.lastUserAudioTime = currentTime + calculateDuration(pcm, SAMPLE_RATES.USER_INPUT);
  }
  
  /**
   * Add Gemini audio chunk
   * @param {string} base64Audio - Base64 encoded PCM audio
   */
  addGeminiAudio(base64Audio) {
    if (!this.isRecording) return;
    
    const pcm = base64ToPcm(base64Audio);
    const currentTime = Date.now() - this.startTime;
    
    // Fill gap with silence if needed
    const gapMs = currentTime - this.lastGeminiAudioTime;
    if (gapMs > 100) {
      const silence = createSilence(gapMs, SAMPLE_RATES.GEMINI_OUTPUT);
      this.geminiAudioChunks.push(silence);
    }
    
    this.geminiAudioChunks.push(pcm);
    this.lastGeminiAudioTime = currentTime + calculateDuration(pcm, SAMPLE_RATES.GEMINI_OUTPUT);
  }
  
  /**
   * Add transcript
   * @param {string} role - 'user' or 'assistant'
   * @param {string} text - Transcript text
   * @param {boolean} isFinal - Whether this is a final transcript
   */
  addTranscript(role, text, isFinal) {
    if (!this.isRecording) return;
    
    const timestamp = (Date.now() - this.startTime) / 1000;
    const entry = {
      role,
      text,
      timestamp,
      time: this.formatTime(timestamp),
      isFinal,
    };
    
    this.allTranscripts.push(entry);
    
    if (isFinal) {
      // Merge with previous if same role
      const last = this.transcripts[this.transcripts.length - 1];
      if (last && last.role === role && !last.isFinal) {
        last.text = text;
        last.isFinal = true;
      } else {
        this.transcripts.push({ ...entry });
      }
    }
  }
  
  /**
   * Add user transcript
   * @param {string} text - Transcript text
   * @param {boolean} isFinal - Whether final
   */
  addUserTranscript(text, isFinal) {
    this.addTranscript('user', text, isFinal);
  }
  
  /**
   * Add assistant transcript
   * @param {string} text - Transcript text
   * @param {boolean} isFinal - Whether final
   */
  addAssistantTranscript(text, isFinal) {
    this.addTranscript('assistant', text, isFinal);
  }
  
  /**
   * Stop recording and save files
   * @returns {Promise<object>} Saved file paths
   */
  async stop() {
    if (!this.isRecording) {
      return null;
    }
    
    this.isRecording = false;
    const duration = (Date.now() - this.startTime) / 1000;
    
    this.logger.info({ duration }, 'Stopping recording');
    
    const files = {};
    const timestamp = new Date(this.startTime).toISOString().replace(/[:.]/g, '-');
    const baseFilename = `${this.interviewId}_${timestamp}`;
    
    try {
      // Save mixed stereo audio
      if (this.userAudioChunks.length > 0 || this.geminiAudioChunks.length > 0) {
        const audioPath = await this.saveMixedAudio(baseFilename);
        files.audio = audioPath;
      }
      
      // Save transcripts
      if (this.transcripts.length > 0) {
        const transcriptPath = this.saveTranscripts(baseFilename, duration);
        files.transcripts = transcriptPath;
      }
      
      this.logger.info({ files }, 'Recording saved');
      
    } catch (error) {
      this.logger.error({ error: error.message }, 'Error saving recording');
    }
    
    // Clear buffers
    this.userAudioChunks = [];
    this.geminiAudioChunks = [];
    
    return files;
  }
  
  /**
   * Save mixed stereo audio file
   * @param {string} baseFilename - Base filename
   * @returns {string} Saved file path
   */
  async saveMixedAudio(baseFilename) {
    // Combine chunks
    const userAudio = this.userAudioChunks.length > 0 
      ? Buffer.concat(this.userAudioChunks) 
      : Buffer.alloc(0);
    const geminiAudio = this.geminiAudioChunks.length > 0 
      ? Buffer.concat(this.geminiAudioChunks) 
      : Buffer.alloc(0);
    
    // Resample user audio to match Gemini (16kHz -> 24kHz)
    const userResampled = userAudio.length > 0 
      ? resamplePcm(userAudio, SAMPLE_RATES.USER_INPUT, SAMPLE_RATES.GEMINI_OUTPUT)
      : Buffer.alloc(0);
    
    // Mix to stereo (user left, gemini right)
    const stereoData = mixToStereo(userResampled, geminiAudio);
    
    const filename = `${baseFilename}_mixed.wav`;
    const filepath = path.join(this.outputDir, filename);
    
    saveAsWav(filepath, stereoData, SAMPLE_RATES.MIXED, 2);
    
    this.logger.info({ filepath, size: stereoData.length }, 'Mixed audio saved');
    
    return filepath;
  }
  
  /**
   * Save transcripts to JSON file
   * @param {string} baseFilename - Base filename
   * @param {number} duration - Recording duration in seconds
   * @returns {string} Saved file path
   */
  saveTranscripts(baseFilename, duration) {
    const filename = `${baseFilename}.json`;
    const filepath = path.join(this.outputDir, filename);
    
    const data = {
      interviewId: this.interviewId,
      sessionId: this.sessionId,
      recordedAt: new Date(this.startTime).toISOString(),
      duration,
      durationFormatted: this.formatTime(duration),
      transcriptCount: this.transcripts.length,
      transcripts: this.transcripts,
      allTranscripts: this.allTranscripts,
    };
    
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
    
    this.logger.info({ filepath, count: this.transcripts.length }, 'Transcripts saved');
    
    return filepath;
  }
  
  /**
   * Format seconds to HH:MM:SS.mmm
   * @param {number} seconds - Time in seconds
   * @returns {string} Formatted time
   */
  formatTime(seconds) {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
  }
  
  /**
   * Get recording stats
   * @returns {object}
   */
  getStats() {
    if (!this.isRecording) {
      return null;
    }
    
    const duration = (Date.now() - this.startTime) / 1000;
    
    return {
      duration,
      userAudioChunks: this.userAudioChunks.length,
      geminiAudioChunks: this.geminiAudioChunks.length,
      transcriptCount: this.transcripts.length,
    };
  }
}

/**
 * Create recorder service
 * @param {object} options - Recorder options
 * @returns {RecorderService}
 */
export function createRecorderService(options) {
  return new RecorderService(options);
}

export default RecorderService;

