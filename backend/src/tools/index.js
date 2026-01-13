import { EventEmitter } from 'events';
import { createSessionLogger } from '../utils/logger.js';
import { ToolError } from '../utils/errors.js';
import endCallTool, { handleEndCall } from './endCall.js';
import submitEvaluationTool, { handleSubmitEvaluation, createEvaluationTool } from './submitEvaluation.js';

/**
 * Tool Registry - manages all available tools
 */
class ToolRegistry {
  constructor() {
    this.tools = new Map();
    this.handlers = new Map();
    
    // Register default tools
    this.register('end_call', endCallTool.definition, handleEndCall);
    this.register('submit_evaluation', submitEvaluationTool.definition, handleSubmitEvaluation);
  }
  
  /**
   * Register a tool
   * @param {string} name - Tool name
   * @param {object} definition - Tool definition for Gemini
   * @param {Function} handler - Handler function
   */
  register(name, definition, handler) {
    this.tools.set(name, definition);
    this.handlers.set(name, handler);
  }
  
  /**
   * Get tool definition
   * @param {string} name - Tool name
   * @returns {object|null}
   */
  getDefinition(name) {
    return this.tools.get(name) || null;
  }
  
  /**
   * Get handler
   * @param {string} name - Tool name
   * @returns {Function|null}
   */
  getHandler(name) {
    return this.handlers.get(name) || null;
  }
  
  /**
   * Get all tool definitions
   * @returns {Array}
   */
  getAllDefinitions() {
    return Array.from(this.tools.values());
  }
  
  /**
   * Check if tool exists
   * @param {string} name - Tool name
   * @returns {boolean}
   */
  has(name) {
    return this.tools.has(name);
  }
}

// Singleton registry
export const toolRegistry = new ToolRegistry();

/**
 * ToolHandler - handles tool calls from Gemini for a session
 */
export class ToolHandler extends EventEmitter {
  /**
   * @param {object} options
   * @param {string} options.sessionId - Session ID
   * @param {string} options.interviewId - Interview ID
   * @param {object} options.evaluationSchema - Custom evaluation schema
   * @param {object} options.queueService - Queue service for publishing
   * @param {object} options.storageService - Storage service
   */
  constructor(options = {}) {
    super();
    
    this.sessionId = options.sessionId;
    this.interviewId = options.interviewId;
    this.queueService = options.queueService || null;
    this.storageService = options.storageService || null;
    this.logger = createSessionLogger(this.sessionId, { component: 'tools' });
    
    // Create custom evaluation tool if schema provided
    this.customTools = new Map();
    if (options.evaluationSchema) {
      const customEvalTool = createEvaluationTool(options.evaluationSchema);
      this.customTools.set('submit_evaluation', customEvalTool);
    }
  }
  
  /**
   * Get tool definitions for this session
   * @returns {Array}
   */
  getToolDefinitions() {
    const definitions = [];
    
    for (const [name, def] of toolRegistry.tools) {
      // Use custom definition if available
      if (this.customTools.has(name)) {
        definitions.push(this.customTools.get(name));
      } else {
        definitions.push(def);
      }
    }
    
    return definitions;
  }
  
  /**
   * Handle a tool call
   * @param {object} toolCall - Tool call from Gemini
   * @returns {Promise<object>} Tool response
   */
  async handleToolCall(toolCall) {
    const { id, name, args } = toolCall;
    
    this.logger.info({ toolName: name, callId: id }, 'Handling tool call');
    
    // Get handler
    const handler = toolRegistry.getHandler(name);
    if (!handler) {
      const error = new ToolError(`Unknown tool: ${name}`, name);
      this.logger.error({ toolName: name }, 'Unknown tool');
      return { error: error.message };
    }
    
    // Create execution context
    const context = {
      sessionId: this.sessionId,
      interviewId: this.interviewId,
      logger: this.logger,
      queueService: this.queueService,
      storageService: this.storageService,
      emit: (event, data) => this.emit(event, data)
    };
    
    try {
      const result = await handler(args, context);
      this.logger.info({ toolName: name, success: true }, 'Tool call completed');
      return result;
    } catch (error) {
      this.logger.error({ 
        toolName: name, 
        error: error.message 
      }, 'Tool call failed');
      return { error: error.message };
    }
  }
}

/**
 * Create tool handler for a session
 * @param {object} options - Handler options
 * @returns {ToolHandler}
 */
export function createToolHandler(options) {
  return new ToolHandler(options);
}

export { createEvaluationTool };
export default { toolRegistry, ToolHandler, createToolHandler };

