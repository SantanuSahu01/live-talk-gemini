import { createSessionLogger } from '../utils/logger.js';
import { ValidationError } from '../utils/errors.js';

/**
 * Message types from client
 */
export const MessageType = {
  AUDIO: 'audio',
  TEXT: 'text',
  CONFIG: 'config',
  INTERRUPT: 'interrupt',
  ACTIVITY_START: 'activity_start',
  ACTIVITY_END: 'activity_end',
  RESUME: 'resume',
  END_CALL: 'end_call',
};

/**
 * MessageHandler - routes and validates client messages
 */
export class MessageHandler {
  /**
   * @param {object} options
   * @param {string} options.sessionId - Session ID
   * @param {object} options.session - Session instance
   */
  constructor(options = {}) {
    this.sessionId = options.sessionId;
    this.session = options.session;
    this.logger = createSessionLogger(this.sessionId, { component: 'message' });
  }
  
  /**
   * Handle incoming message from client
   * @param {string|Buffer} rawMessage - Raw message data
   * @returns {Promise<void>}
   */
  async handle(rawMessage) {
    let message;
    
    try {
      message = this.parseMessage(rawMessage);
    } catch (error) {
      this.logger.warn({ error: error.message }, 'Failed to parse message');
      return;
    }
    
    const { type } = message;
    
    switch (type) {
      case MessageType.AUDIO:
        await this.handleAudio(message);
        break;
        
      case MessageType.TEXT:
        await this.handleText(message);
        break;
        
      case MessageType.CONFIG:
        await this.handleConfig(message);
        break;
        
      case MessageType.INTERRUPT:
        await this.handleInterrupt();
        break;
        
      case MessageType.ACTIVITY_START:
        await this.handleActivityStart();
        break;
        
      case MessageType.ACTIVITY_END:
        await this.handleActivityEnd();
        break;
        
      case MessageType.RESUME:
        await this.handleResume(message);
        break;
        
      case MessageType.END_CALL:
        await this.handleEndCall(message);
        break;
        
      default:
        this.logger.warn({ type }, 'Unknown message type');
    }
  }
  
  /**
   * Parse raw message
   * @param {string|Buffer} rawMessage - Raw message
   * @returns {object} Parsed message
   */
  parseMessage(rawMessage) {
    const data = rawMessage.toString();
    
    try {
      return JSON.parse(data);
    } catch {
      throw new ValidationError('Invalid JSON message');
    }
  }
  
  /**
   * Handle audio message
   * @param {object} message - Audio message
   */
  async handleAudio(message) {
    const { data } = message;
    
    if (!data) {
      this.logger.warn('Audio message missing data');
      return;
    }
    
    if (this.session) {
      await this.session.handleAudio(data);
    }
  }
  
  /**
   * Handle text message
   * @param {object} message - Text message
   */
  async handleText(message) {
    const { text } = message;
    
    if (!text) {
      this.logger.warn('Text message missing text');
      return;
    }
    
    this.logger.debug({ textLength: text.length }, 'Text message received');
    
    if (this.session) {
      await this.session.handleText(text);
    }
  }
  
  /**
   * Handle config message (interview configuration)
   * @param {object} message - Config message
   */
  async handleConfig(message) {
    const { config } = message;
    
    if (!config) {
      this.logger.warn('Config message missing config');
      return;
    }
    
    this.logger.info('Config message received');
    
    if (this.session) {
      await this.session.configure(config);
    }
  }
  
  /**
   * Handle interrupt message
   */
  async handleInterrupt() {
    this.logger.debug('Interrupt requested');
    
    if (this.session) {
      this.session.interrupt();
    }
  }
  
  /**
   * Handle activity start signal
   */
  async handleActivityStart() {
    if (this.session) {
      this.session.handleActivityStart();
    }
  }
  
  /**
   * Handle activity end signal
   */
  async handleActivityEnd() {
    if (this.session) {
      this.session.handleActivityEnd();
    }
  }
  
  /**
   * Handle resume request
   * @param {object} message - Resume message
   */
  async handleResume(message) {
    const { token } = message;
    
    this.logger.info('Resume requested');
    
    if (this.session) {
      await this.session.resume(token);
    }
  }
  
  /**
   * Handle end call request from client
   * @param {object} message - End call message
   */
  async handleEndCall(message) {
    const { reason } = message;
    
    this.logger.info({ reason }, 'End call requested by client');
    
    if (this.session) {
      await this.session.endCall(reason || 'client_request');
    }
  }
}

/**
 * Create message handler for a session
 * @param {object} options - Handler options
 * @returns {MessageHandler}
 */
export function createMessageHandler(options) {
  return new MessageHandler(options);
}

export default { MessageHandler, createMessageHandler, MessageType };

