import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import config, { validateInterviewConfig, isEnabled } from '../config/index.js';
import { createSessionLogger } from '../utils/logger.js';
import { SessionError, SessionNotFoundError } from '../utils/errors.js';
import { GeminiService } from './GeminiService.js';
import { RecorderService } from './RecorderService.js';
import { getStorageService } from './StorageService.js';
import { getQueueService } from './QueueService.js';
import { ToolHandler } from '../tools/index.js';

/**
 * Session states
 */
export const SessionState = {
  INITIALIZING: 'initializing',
  CONFIGURING: 'configuring',
  CONNECTING: 'connecting',
  ACTIVE: 'active',
  ENDING: 'ending',
  ENDED: 'ended',
  ERROR: 'error',
};

/**
 * Interview Session - represents a single interview session
 */
export class Session extends EventEmitter {
  /**
   * @param {object} options
   * @param {string} options.sessionId - Unique session ID
   * @param {WebSocket} options.clientWs - Client WebSocket connection
   * @param {string} options.clientIp - Client IP address
   */
  constructor(options = {}) {
    super();
    
    this.sessionId = options.sessionId || randomUUID();
    this.clientWs = options.clientWs;
    this.clientIp = options.clientIp;
    this.logger = createSessionLogger(this.sessionId);
    
    // State
    this.state = SessionState.INITIALIZING;
    this.interviewConfig = null;
    this.interviewId = null;
    
    // Services
    this.geminiService = null;
    this.recorderService = null;
    this.toolHandler = null;
    this.storageService = getStorageService();
    this.queueService = getQueueService();
    
    // Session metadata
    this.startTime = Date.now();
    this.endTime = null;
    this.endReason = null;
    this.evaluation = null;
    this.resumptionToken = null;
    
    // Timeout
    this.maxDuration = config.DEFAULT_MAX_DURATION * 1000;
    this.durationTimeout = null;
  }
  
  /**
   * Configure interview session
   * @param {object} interviewConfig - Interview configuration
   */
  async configure(interviewConfig) {
    if (this.state !== SessionState.INITIALIZING && this.state !== SessionState.CONFIGURING) {
      throw new SessionError('Session already configured');
    }
    
    this.state = SessionState.CONFIGURING;
    
    try {
      // Validate config
      const validated = validateInterviewConfig(interviewConfig);
      this.interviewConfig = validated;
      this.interviewId = validated.interviewId;
      
      // Set max duration
      if (validated.maxDuration) {
        this.maxDuration = validated.maxDuration * 1000;
      }
      
      this.logger.info({ 
        interviewId: this.interviewId,
        maxDuration: this.maxDuration / 1000 
      }, 'Interview configured');
      
      // Initialize services
      await this.initializeServices();
      
      // Connect to Gemini
      await this.connect();
      
    } catch (error) {
      this.state = SessionState.ERROR;
      this.logger.error({ error: error.message }, 'Configuration failed');
      throw error;
    }
  }
  
  /**
   * Initialize session services
   */
  async initializeServices() {
    const { systemPrompt, evaluationSchema } = this.interviewConfig;
    
    // Create tool handler
    this.toolHandler = new ToolHandler({
      sessionId: this.sessionId,
      interviewId: this.interviewId,
      evaluationSchema,
      queueService: this.queueService,
      storageService: this.storageService,
    });
    
    // Listen to tool events
    this.toolHandler.on('callEnded', (data) => this.handleCallEnded(data));
    this.toolHandler.on('evaluationSubmitted', (data) => this.handleEvaluationSubmitted(data));
    
    // Create Gemini service
    this.geminiService = new GeminiService({
      sessionId: this.sessionId,
      systemPrompt,
      resumptionToken: this.resumptionToken,
      tools: this.toolHandler.getToolDefinitions(),
    });
    
    // Wire up Gemini events
    this.setupGeminiEvents();
    
    // Create recorder if enabled
    if (isEnabled('recording')) {
      this.recorderService = new RecorderService({
        sessionId: this.sessionId,
        interviewId: this.interviewId,
      });
    }
  }
  
  /**
   * Set up Gemini event handlers
   */
  setupGeminiEvents() {
    const gemini = this.geminiService;
    
    gemini.on('ready', () => {
      this.state = SessionState.ACTIVE;
      this.startDurationTimeout();
      this.sendToClient({ type: 'connected' });
      
      // Start recording
      if (this.recorderService) {
        this.recorderService.start();
      }
      
      // Publish started event
      this.queueService.publishInterviewStarted({
        interviewId: this.interviewId,
        sessionId: this.sessionId,
      }).catch(() => {});
    });
    
    gemini.on('audio', ({ data, mimeType }) => {
      // Record audio
      if (this.recorderService) {
        this.recorderService.addGeminiAudio(data);
      }
      
      // Send to client
      this.sendToClient({
        type: 'audio',
        data,
        mimeType,
      });
    });
    
    gemini.on('inputTranscript', ({ text, isFinal }) => {
      // Record transcript
      if (this.recorderService) {
        this.recorderService.addUserTranscript(text, isFinal);
      }
      
      // Send to client
      this.sendToClient({
        type: 'transcript',
        role: 'user',
        text,
        isFinal,
      });
    });
    
    gemini.on('outputTranscript', ({ text, isFinal }) => {
      // Record transcript
      if (this.recorderService) {
        this.recorderService.addAssistantTranscript(text, isFinal);
      }
      
      // Send to client
      this.sendToClient({
        type: 'transcript',
        role: 'assistant',
        text,
        isFinal,
      });
    });
    
    gemini.on('turnComplete', () => {
      this.sendToClient({ type: 'turn_complete' });
    });
    
    gemini.on('interrupted', () => {
      this.sendToClient({ type: 'interrupted' });
    });
    
    gemini.on('toolCall', async (toolCall) => {
      const response = await this.toolHandler.handleToolCall(toolCall);
      gemini.sendToolResponse(toolCall.id, response, !!response.error);
    });
    
    gemini.on('goAway', ({ timeLeft, reason }) => {
      this.sendToClient({ type: 'go_away', timeLeft, reason });
    });
    
    gemini.on('sessionResumable', ({ token }) => {
      this.resumptionToken = token;
      this.sendToClient({ type: 'session_resumable', token });
    });
    
    gemini.on('error', (error) => {
      this.logger.error({ error: error.message }, 'Gemini error');
      this.sendToClient({ type: 'error', message: error.message });
    });
    
    gemini.on('disconnected', () => {
      if (this.state === SessionState.ACTIVE) {
        this.sendToClient({ type: 'disconnected' });
      }
    });
  }
  
  /**
   * Connect to Gemini
   */
  async connect() {
    this.state = SessionState.CONNECTING;
    
    try {
      await this.geminiService.connect();
    } catch (error) {
      this.state = SessionState.ERROR;
      throw error;
    }
  }
  
  /**
   * Resume session with token
   * @param {string} token - Resumption token
   */
  async resume(token) {
    if (this.geminiService) {
      this.geminiService.disconnect();
    }
    
    this.resumptionToken = token;
    await this.initializeServices();
    await this.connect();
  }
  
  /**
   * Handle incoming audio from client
   * @param {string} base64Audio - Base64 encoded PCM audio
   */
  handleAudio(base64Audio) {
    if (this.state !== SessionState.ACTIVE) {
      return;
    }
    
    // Record audio
    if (this.recorderService) {
      this.recorderService.addUserAudio(base64Audio);
    }
    
    // Send to Gemini
    if (this.geminiService) {
      this.geminiService.sendAudio(base64Audio);
    }
  }
  
  /**
   * Handle text message from client
   * @param {string} text - Text message
   */
  handleText(text) {
    if (this.state !== SessionState.ACTIVE) {
      return;
    }
    
    if (this.geminiService) {
      this.geminiService.sendText(text);
    }
  }
  
  /**
   * Handle activity start signal
   */
  handleActivityStart() {
    if (this.geminiService) {
      this.geminiService.sendActivityStart();
    }
  }
  
  /**
   * Handle activity end signal
   */
  handleActivityEnd() {
    if (this.geminiService) {
      this.geminiService.sendActivityEnd();
    }
  }
  
  /**
   * Interrupt Gemini response
   */
  interrupt() {
    if (this.geminiService) {
      this.geminiService.interrupt();
    }
  }
  
  /**
   * Handle AI-initiated call end
   * @param {object} data - Call end data
   */
  handleCallEnded(data) {
    this.endReason = data.reason;
    
    // Notify client
    this.sendToClient({
      type: 'call_ended',
      reason: data.reason,
      summary: data.summary,
      endedBy: 'ai',
    });
    
    // End session after brief delay (let client receive message)
    setTimeout(() => {
      this.end('ai_ended');
    }, 2000);
  }
  
  /**
   * Handle evaluation submitted
   * @param {object} data - Evaluation data
   */
  handleEvaluationSubmitted(data) {
    this.evaluation = data.evaluation;
    
    // Notify client
    this.sendToClient({
      type: 'evaluation_submitted',
      evaluation: data.evaluation,
    });
  }
  
  /**
   * End the interview
   * @param {string} reason - End reason
   */
  async endCall(reason = 'client_request') {
    await this.end(reason);
  }
  
  /**
   * End session
   * @param {string} reason - End reason
   */
  async end(reason = 'normal') {
    if (this.state === SessionState.ENDED || this.state === SessionState.ENDING) {
      return;
    }
    
    this.state = SessionState.ENDING;
    this.endTime = Date.now();
    this.endReason = reason;
    
    this.logger.info({ reason }, 'Ending session');
    
    // Clear timeout
    if (this.durationTimeout) {
      clearTimeout(this.durationTimeout);
    }
    
    // Stop recording and save files
    let files = null;
    if (this.recorderService && this.recorderService.isActive()) {
      files = await this.recorderService.stop();
    }
    
    // Upload to S3
    if (files && this.storageService.isAvailable()) {
      try {
        const uploadResult = await this.storageService.uploadRecordings(
          this.interviewId,
          files
        );
        
        // Publish recording ready event
        await this.queueService.publishRecordingReady({
          interviewId: this.interviewId,
          sessionId: this.sessionId,
          files: uploadResult,
        });
      } catch (error) {
        this.logger.error({ error: error.message }, 'Failed to upload recordings');
      }
    }
    
    // Disconnect Gemini
    if (this.geminiService) {
      this.geminiService.disconnect();
    }
    
    // Publish ended event
    await this.queueService.publishInterviewEnded({
      interviewId: this.interviewId,
      sessionId: this.sessionId,
      reason,
      duration: (this.endTime - this.startTime) / 1000,
      hasEvaluation: !!this.evaluation,
    }).catch(() => {});
    
    this.state = SessionState.ENDED;
    this.emit('ended', { reason });
  }
  
  /**
   * Start max duration timeout
   */
  startDurationTimeout() {
    this.durationTimeout = setTimeout(() => {
      this.logger.warn('Max duration reached');
      this.sendToClient({
        type: 'max_duration_reached',
        message: 'Interview time limit reached',
      });
      this.end('time_limit');
    }, this.maxDuration);
  }
  
  /**
   * Send message to client
   * @param {object} message - Message to send
   */
  sendToClient(message) {
    if (this.clientWs && this.clientWs.readyState === 1) { // WebSocket.OPEN
      this.clientWs.send(JSON.stringify(message));
    }
  }
  
  /**
   * Get session info
   * @returns {object}
   */
  getInfo() {
    return {
      sessionId: this.sessionId,
      interviewId: this.interviewId,
      state: this.state,
      startTime: this.startTime,
      endTime: this.endTime,
      duration: this.endTime 
        ? (this.endTime - this.startTime) / 1000 
        : (Date.now() - this.startTime) / 1000,
      hasEvaluation: !!this.evaluation,
    };
  }
}

/**
 * SessionManager - manages all active sessions
 */
export class SessionManager {
  constructor() {
    this.sessions = new Map();
    this.logger = createSessionLogger('manager');
  }
  
  /**
   * Create new session
   * @param {object} options - Session options
   * @returns {Session}
   */
  createSession(options) {
    const session = new Session(options);
    
    this.sessions.set(session.sessionId, session);
    
    session.on('ended', () => {
      this.sessions.delete(session.sessionId);
      this.logger.info({ sessionId: session.sessionId }, 'Session removed');
    });
    
    this.logger.info({ 
      sessionId: session.sessionId,
      activeCount: this.sessions.size 
    }, 'Session created');
    
    return session;
  }
  
  /**
   * Get session by ID
   * @param {string} sessionId - Session ID
   * @returns {Session|null}
   */
  getSession(sessionId) {
    return this.sessions.get(sessionId) || null;
  }
  
  /**
   * Remove session
   * @param {string} sessionId - Session ID
   */
  removeSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.end('removed');
      this.sessions.delete(sessionId);
    }
  }
  
  /**
   * Get all active sessions
   * @returns {Array}
   */
  getActiveSessions() {
    return Array.from(this.sessions.values())
      .filter(s => s.state === SessionState.ACTIVE)
      .map(s => s.getInfo());
  }
  
  /**
   * Get session count
   * @returns {number}
   */
  getSessionCount() {
    return this.sessions.size;
  }
  
  /**
   * End all sessions (for graceful shutdown)
   * @param {string} reason - End reason
   */
  async endAllSessions(reason = 'shutdown') {
    const promises = Array.from(this.sessions.values()).map(session => 
      session.end(reason)
    );
    await Promise.allSettled(promises);
    this.sessions.clear();
  }
  
  /**
   * Get manager stats
   * @returns {object}
   */
  getStats() {
    const sessions = Array.from(this.sessions.values());
    
    return {
      total: sessions.length,
      active: sessions.filter(s => s.state === SessionState.ACTIVE).length,
      connecting: sessions.filter(s => s.state === SessionState.CONNECTING).length,
      ending: sessions.filter(s => s.state === SessionState.ENDING).length,
    };
  }
}

// Singleton instance
let manager = null;

/**
 * Get session manager instance
 * @returns {SessionManager}
 */
export function getSessionManager() {
  if (!manager) {
    manager = new SessionManager();
  }
  return manager;
}

export default { Session, SessionManager, getSessionManager, SessionState };

