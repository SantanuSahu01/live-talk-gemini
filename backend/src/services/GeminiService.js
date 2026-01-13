import WebSocket from 'ws';
import { EventEmitter } from 'events';
import config from '../config/index.js';
import { createSessionLogger } from '../utils/logger.js';
import { GeminiError, GeminiConnectionError } from '../utils/errors.js';

const GEMINI_LIVE_URL = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent';

/**
 * Connection states
 */
export const ConnectionState = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  READY: 'ready',
  ERROR: 'error',
};

/**
 * GeminiService - Manages connection to Gemini Live API
 * Emits events for all Gemini responses and handles function tools
 */
export class GeminiService extends EventEmitter {
  /**
   * @param {object} options
   * @param {string} options.sessionId - Session identifier
   * @param {string} options.systemPrompt - System instruction for Gemini
   * @param {string} options.voiceName - Voice to use
   * @param {string} options.resumptionToken - Previous session token for resumption
   * @param {Array} options.tools - Function tools configuration
   */
  constructor(options = {}) {
    super();
    
    this.sessionId = options.sessionId;
    this.logger = createSessionLogger(this.sessionId, { component: 'gemini' });
    
    // Configuration
    this.systemPrompt = options.systemPrompt || 'You are a helpful AI assistant.';
    this.voiceName = options.voiceName || config.GEMINI_VOICE;
    this.model = options.model || config.GEMINI_MODEL;
    this.tools = options.tools || [];
    
    // State
    this.ws = null;
    this.state = ConnectionState.DISCONNECTED;
    this.setupComplete = false;
    
    // Session resumption
    this.resumptionToken = null;
    this.lastResumptionToken = options.resumptionToken || null;
    
    // Pending tool calls
    this.pendingToolCalls = new Map();
    
    // Reconnection
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 3;
    this.reconnectDelay = 1000;
  }

  /**
   * Connect to Gemini Live API
   * @returns {Promise<void>}
   */
  async connect() {
    if (this.state === ConnectionState.CONNECTING || this.state === ConnectionState.READY) {
      this.logger.warn('Already connected or connecting');
      return;
    }
    
    this.state = ConnectionState.CONNECTING;
    
    return new Promise((resolve, reject) => {
      const url = `${GEMINI_LIVE_URL}?key=${config.GEMINI_API_KEY}`;
      
      try {
        this.ws = new WebSocket(url);
        
        this.ws.on('open', () => {
          this.logger.info('WebSocket connected to Gemini');
          this.state = ConnectionState.CONNECTED;
          this.reconnectAttempts = 0;
          this.sendSetup();
        });
        
        this.ws.on('message', (data) => {
          this.handleMessage(data);
        });
        
        this.ws.on('close', (code, reason) => {
          this.logger.info({ code, reason: reason?.toString() }, 'WebSocket closed');
          this.handleClose(code, reason);
        });
        
        this.ws.on('error', (error) => {
          this.logger.error({ error: error.message }, 'WebSocket error');
          this.state = ConnectionState.ERROR;
          this.emit('error', new GeminiConnectionError(error.message, error));
          reject(error);
        });
        
        // Wait for setup complete
        const timeout = setTimeout(() => {
          if (!this.setupComplete) {
            reject(new GeminiConnectionError('Setup timeout'));
          }
        }, 30000);
        
        this.once('ready', () => {
          clearTimeout(timeout);
          resolve();
        });
        
      } catch (error) {
        this.state = ConnectionState.ERROR;
        reject(new GeminiConnectionError(error.message, error));
      }
    });
  }

  /**
   * Send setup message with configuration
   */
  sendSetup() {
    const setupMessage = {
      setup: {
        model: this.model,
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: this.voiceName
              }
            }
          }
        },
        systemInstruction: {
          parts: [{ text: this.systemPrompt }]
        },
        outputAudioTranscription: {},
        inputAudioTranscription: {},
        sessionResumption: this.lastResumptionToken 
          ? { handle: this.lastResumptionToken } 
          : {},
        contextWindowCompression: {
          triggerTokens: 25000,
          slidingWindow: {
            targetTokens: 12500
          }
        }
      }
    };
    
    // Add tools if configured
    if (this.tools.length > 0) {
      setupMessage.setup.tools = [{
        functionDeclarations: this.tools
      }];
    }
    
    this.send(setupMessage);
    this.logger.debug('Setup message sent');
  }

  /**
   * Handle incoming message from Gemini
   * @param {Buffer} data - Raw message data
   */
  handleMessage(data) {
    try {
      const message = JSON.parse(data.toString());
      
      // Setup complete
      if (message.setupComplete) {
        this.logger.info('Setup complete');
        this.setupComplete = true;
        this.state = ConnectionState.READY;
        this.emit('ready');
        return;
      }
      
      // Session resumption update
      if (message.sessionResumptionUpdate) {
        this.handleSessionResumption(message.sessionResumptionUpdate);
        return;
      }
      
      // GoAway - server requesting disconnect
      if (message.goAway) {
        this.handleGoAway(message.goAway);
        return;
      }
      
      // Tool call
      if (message.toolCall) {
        this.handleToolCall(message.toolCall);
        return;
      }
      
      // Tool call cancellation
      if (message.toolCallCancellation) {
        this.handleToolCallCancellation(message.toolCallCancellation);
        return;
      }
      
      // Server content (audio, transcripts, etc)
      if (message.serverContent) {
        this.handleServerContent(message.serverContent);
        return;
      }
      
    } catch (error) {
      this.logger.error({ error: error.message }, 'Error parsing message');
      this.emit('error', new GeminiError('Failed to parse message', error));
    }
  }

  /**
   * Handle server content (audio, transcripts)
   * @param {object} content - Server content object
   */
  handleServerContent(content) {
    // Generation complete
    if (content.generationComplete) {
      this.emit('turnComplete');
      return;
    }
    
    // Interrupted
    if (content.interrupted) {
      this.logger.debug('Response interrupted');
      this.emit('interrupted');
      return;
    }
    
    // Turn complete
    if (content.turnComplete) {
      this.emit('turnComplete');
      return;
    }
    
    // Input transcription (user speech)
    if (content.inputTranscription) {
      const { text, isFinal } = content.inputTranscription;
      this.emit('inputTranscript', { text, isFinal: isFinal || false });
    }
    
    // Output transcription (Gemini speech)
    if (content.outputTranscription) {
      const { text, isFinal } = content.outputTranscription;
      this.emit('outputTranscript', { text, isFinal: isFinal || false });
    }
    
    // Model turn with parts (audio)
    if (content.modelTurn && content.modelTurn.parts) {
      for (const part of content.modelTurn.parts) {
        if (part.inlineData && part.inlineData.mimeType?.includes('audio')) {
          const dataLen = part.inlineData.data?.length || 0;
          this.logger.debug({ 
            mimeType: part.inlineData.mimeType,
            dataLength: dataLen,
            dataSample: part.inlineData.data?.substring(0, 50)
          }, 'Audio chunk received from Gemini');
          
          this.emit('audio', {
            data: part.inlineData.data,
            mimeType: part.inlineData.mimeType
          });
        }
        
        if (part.text) {
          this.emit('outputTranscript', { text: part.text, isFinal: false });
        }
      }
    }
  }

  /**
   * Handle function tool call from Gemini
   * @param {object} toolCall - Tool call object
   */
  handleToolCall(toolCall) {
    const { functionCalls } = toolCall;
    
    if (!functionCalls || functionCalls.length === 0) {
      this.logger.warn('Empty tool call received');
      return;
    }
    
    for (const call of functionCalls) {
      const { id, name, args } = call;
      
      this.logger.info({ toolName: name, callId: id }, 'Tool call received');
      
      // Store pending call
      this.pendingToolCalls.set(id, { name, args, timestamp: Date.now() });
      
      // Emit for handler to process
      this.emit('toolCall', {
        id,
        name,
        args: typeof args === 'string' ? JSON.parse(args) : args
      });
    }
  }

  /**
   * Handle tool call cancellation
   * @param {object} cancellation - Cancellation object
   */
  handleToolCallCancellation(cancellation) {
    const { ids } = cancellation;
    
    for (const id of ids || []) {
      if (this.pendingToolCalls.has(id)) {
        this.logger.info({ callId: id }, 'Tool call cancelled');
        this.pendingToolCalls.delete(id);
        this.emit('toolCallCancelled', { id });
      }
    }
  }

  /**
   * Send tool response back to Gemini
   * @param {string} callId - Tool call ID
   * @param {object} response - Tool response
   * @param {boolean} isError - Whether this is an error response
   */
  sendToolResponse(callId, response, isError = false) {
    if (!this.pendingToolCalls.has(callId)) {
      this.logger.warn({ callId }, 'Unknown tool call ID');
      return;
    }
    
    const pending = this.pendingToolCalls.get(callId);
    this.pendingToolCalls.delete(callId);
    
    const message = {
      toolResponse: {
        functionResponses: [{
          id: callId,
          name: pending.name,
          response: isError 
            ? { error: response } 
            : { output: response }
        }]
      }
    };
    
    this.send(message);
    this.logger.debug({ callId, toolName: pending.name }, 'Tool response sent');
  }

  /**
   * Handle session resumption update
   * @param {object} update - Resumption update
   */
  handleSessionResumption(update) {
    if (update.newHandle) {
      this.resumptionToken = update.newHandle;
      this.emit('sessionResumable', { token: update.newHandle });
    }
    
    if (update.resumable !== undefined) {
      this.logger.debug({ resumable: update.resumable }, 'Session resumable status');
    }
  }

  /**
   * Handle goAway message
   * @param {object} goAway - GoAway message
   */
  handleGoAway(goAway) {
    this.logger.warn({ 
      timeLeft: goAway.timeLeft,
      reason: goAway.reason 
    }, 'GoAway received');
    
    this.emit('goAway', {
      timeLeft: goAway.timeLeft,
      reason: goAway.reason || 'Server requested disconnect'
    });
  }

  /**
   * Handle connection close
   * @param {number} code - Close code
   * @param {Buffer} reason - Close reason
   */
  handleClose(code, reason) {
    const wasReady = this.state === ConnectionState.READY;
    this.state = ConnectionState.DISCONNECTED;
    this.setupComplete = false;
    this.ws = null;
    
    this.emit('disconnected', { code, reason: reason?.toString() });
    
    // Attempt reconnection if was ready and not intentional close
    if (wasReady && code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
      this.attemptReconnect();
    }
  }

  /**
   * Attempt to reconnect with exponential backoff
   */
  async attemptReconnect() {
    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    
    this.logger.info({ 
      attempt: this.reconnectAttempts, 
      delayMs: delay 
    }, 'Attempting reconnection');
    
    await new Promise(resolve => setTimeout(resolve, delay));
    
    try {
      // Use resumption token if available
      if (this.resumptionToken) {
        this.lastResumptionToken = this.resumptionToken;
      }
      await this.connect();
    } catch (error) {
      this.logger.error({ error: error.message }, 'Reconnection failed');
    }
  }

  /**
   * Send audio data to Gemini
   * @param {string} base64Audio - Base64 encoded PCM audio
   */
  sendAudio(base64Audio) {
    if (this.state !== ConnectionState.READY) {
      return;
    }
    
    const message = {
      realtimeInput: {
        mediaChunks: [{
          mimeType: 'audio/pcm;rate=16000',
          data: base64Audio
        }]
      }
    };
    
    this.send(message);
  }

  /**
   * Send text message to Gemini
   * @param {string} text - Text message
   */
  sendText(text) {
    if (this.state !== ConnectionState.READY) {
      return;
    }
    
    const message = {
      clientContent: {
        turns: [{
          role: 'user',
          parts: [{ text }]
        }],
        turnComplete: true
      }
    };
    
    this.send(message);
  }

  /**
   * Send activity start signal
   */
  sendActivityStart() {
    if (this.state === ConnectionState.READY) {
      this.send({ activityStart: {} });
    }
  }

  /**
   * Send activity end signal
   */
  sendActivityEnd() {
    if (this.state === ConnectionState.READY) {
      this.send({ activityEnd: {} });
    }
  }

  /**
   * Interrupt Gemini's response
   */
  interrupt() {
    if (this.state === ConnectionState.READY) {
      this.send({ clientContent: { turnComplete: true } });
    }
  }

  /**
   * Send raw message to Gemini
   * @param {object} message - Message object
   */
  send(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  /**
   * Disconnect from Gemini
   */
  disconnect() {
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
    this.state = ConnectionState.DISCONNECTED;
    this.setupComplete = false;
    this.pendingToolCalls.clear();
  }

  /**
   * Get current connection state
   * @returns {string}
   */
  getState() {
    return this.state;
  }

  /**
   * Check if ready to send/receive
   * @returns {boolean}
   */
  isReady() {
    return this.state === ConnectionState.READY;
  }

  /**
   * Get session resumption token
   * @returns {string|null}
   */
  getResumptionToken() {
    return this.resumptionToken;
  }

  /**
   * Update tools configuration
   * @param {Array} tools - New tools configuration
   */
  updateTools(tools) {
    this.tools = tools;
  }
}

export default GeminiService;

