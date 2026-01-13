/**
 * Base application error
 */
export class AppError extends Error {
  constructor(message, code = 'INTERNAL_ERROR', statusCode = 500) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    Error.captureStackTrace(this, this.constructor);
  }
  
  toJSON() {
    return {
      error: this.name,
      code: this.code,
      message: this.message,
    };
  }
}

/**
 * Configuration error
 */
export class ConfigError extends AppError {
  constructor(message) {
    super(message, 'CONFIG_ERROR', 500);
  }
}

/**
 * Session error
 */
export class SessionError extends AppError {
  constructor(message, code = 'SESSION_ERROR') {
    super(message, code, 400);
  }
}

/**
 * Session not found
 */
export class SessionNotFoundError extends SessionError {
  constructor(sessionId) {
    super(`Session not found: ${sessionId}`, 'SESSION_NOT_FOUND');
    this.sessionId = sessionId;
  }
}

/**
 * Gemini API error
 */
export class GeminiError extends AppError {
  constructor(message, originalError = null) {
    super(message, 'GEMINI_ERROR', 502);
    this.originalError = originalError;
  }
}

/**
 * Gemini connection error
 */
export class GeminiConnectionError extends GeminiError {
  constructor(message, originalError = null) {
    super(message, originalError);
    this.code = 'GEMINI_CONNECTION_ERROR';
  }
}

/**
 * Tool execution error
 */
export class ToolError extends AppError {
  constructor(message, toolName) {
    super(message, 'TOOL_ERROR', 400);
    this.toolName = toolName;
  }
}

/**
 * Storage error (S3)
 */
export class StorageError extends AppError {
  constructor(message, operation, originalError = null) {
    super(message, 'STORAGE_ERROR', 500);
    this.operation = operation;
    this.originalError = originalError;
  }
}

/**
 * Queue error (RabbitMQ)
 */
export class QueueError extends AppError {
  constructor(message, operation, originalError = null) {
    super(message, 'QUEUE_ERROR', 500);
    this.operation = operation;
    this.originalError = originalError;
  }
}

/**
 * Validation error
 */
export class ValidationError extends AppError {
  constructor(message, field = null) {
    super(message, 'VALIDATION_ERROR', 400);
    this.field = field;
  }
}

/**
 * Rate limit error
 */
export class RateLimitError extends AppError {
  constructor(message = 'Rate limit exceeded') {
    super(message, 'RATE_LIMIT_ERROR', 429);
  }
}

/**
 * Interview error
 */
export class InterviewError extends AppError {
  constructor(message, code = 'INTERVIEW_ERROR') {
    super(message, code, 400);
  }
}

/**
 * Interview ended error (when trying to perform action on ended interview)
 */
export class InterviewEndedError extends InterviewError {
  constructor(interviewId) {
    super(`Interview has ended: ${interviewId}`, 'INTERVIEW_ENDED');
    this.interviewId = interviewId;
  }
}

/**
 * Wrap error for consistent handling
 * @param {Error} error - Original error
 * @param {string} context - Error context
 * @returns {AppError} Wrapped error
 */
export function wrapError(error, context) {
  if (error instanceof AppError) {
    return error;
  }
  
  const wrapped = new AppError(`${context}: ${error.message}`);
  wrapped.originalError = error;
  return wrapped;
}

export default {
  AppError,
  ConfigError,
  SessionError,
  SessionNotFoundError,
  GeminiError,
  GeminiConnectionError,
  ToolError,
  StorageError,
  QueueError,
  ValidationError,
  RateLimitError,
  InterviewError,
  InterviewEndedError,
  wrapError,
};

