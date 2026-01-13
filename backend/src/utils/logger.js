import pino from 'pino';
import config from '../config/index.js';

/**
 * Create the main application logger
 */
const createLogger = () => {
  const options = {
    level: config.LOG_LEVEL,
    base: {
      env: config.NODE_ENV,
      service: 'ai-interview',
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label) => ({ level: label }),
    },
  };
  
  // Use pino-pretty in development for readable logs
  if (config.LOG_PRETTY && config.NODE_ENV !== 'production') {
    return pino({
      ...options,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss.l',
          ignore: 'pid,hostname,env,service',
          messageFormat: '{sessionId} {msg}',
        },
      },
    });
  }
  
  // JSON logs in production
  return pino(options);
};

// Create main logger instance
const logger = createLogger();

/**
 * Create a child logger with session context
 * @param {string} sessionId - Session identifier
 * @param {object} extra - Additional context
 * @returns {object} Child logger
 */
export function createSessionLogger(sessionId, extra = {}) {
  return logger.child({
    sessionId,
    ...extra,
  });
}

/**
 * Create a child logger for a specific service
 * @param {string} service - Service name
 * @returns {object} Child logger
 */
export function createServiceLogger(service) {
  return logger.child({ component: service });
}

/**
 * Log an event with structured data
 * @param {string} event - Event name
 * @param {object} data - Event data
 * @param {string} level - Log level
 */
export function logEvent(event, data = {}, level = 'info') {
  logger[level]({ event, ...data });
}

/**
 * Log performance timing
 * @param {string} operation - Operation name
 * @param {number} startTime - Start time from Date.now()
 * @param {object} extra - Additional context
 */
export function logTiming(operation, startTime, extra = {}) {
  const duration = Date.now() - startTime;
  logger.info({
    event: 'timing',
    operation,
    durationMs: duration,
    ...extra,
  });
}

/**
 * Log error with full context
 * @param {Error} error - Error object
 * @param {object} context - Additional context
 */
export function logError(error, context = {}) {
  logger.error({
    event: 'error',
    error: {
      message: error.message,
      name: error.name,
      stack: error.stack,
      code: error.code,
    },
    ...context,
  });
}

/**
 * Middleware to log WebSocket connections
 * @param {string} sessionId - Session ID
 * @param {string} clientIp - Client IP address
 */
export function logConnection(sessionId, clientIp) {
  logger.info({
    event: 'ws_connect',
    sessionId,
    clientIp,
  });
}

/**
 * Log WebSocket disconnection
 * @param {string} sessionId - Session ID
 * @param {number} code - Close code
 * @param {string} reason - Close reason
 */
export function logDisconnection(sessionId, code, reason) {
  logger.info({
    event: 'ws_disconnect',
    sessionId,
    code,
    reason,
  });
}

export { logger };
export default logger;

