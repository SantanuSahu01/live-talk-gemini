import { createServiceLogger } from './logger.js';

const logger = createServiceLogger('retry');

/**
 * Default retry options
 */
const DEFAULT_OPTIONS = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  retryCondition: () => true,
  onRetry: null,
};

/**
 * Wait for specified milliseconds
 * @param {number} ms - Milliseconds to wait
 * @returns {Promise<void>}
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Calculate delay with exponential backoff and jitter
 * @param {number} attempt - Current attempt number (0-based)
 * @param {object} options - Retry options
 * @returns {number} Delay in milliseconds
 */
function calculateDelay(attempt, options) {
  const exponentialDelay = options.initialDelayMs * Math.pow(options.backoffMultiplier, attempt);
  const jitter = Math.random() * 0.3 * exponentialDelay; // 30% jitter
  const delay = Math.min(exponentialDelay + jitter, options.maxDelayMs);
  return Math.round(delay);
}

/**
 * Retry a function with exponential backoff
 * @param {Function} fn - Async function to retry
 * @param {object} options - Retry options
 * @returns {Promise<any>} Result of successful function call
 */
export async function retry(fn, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError;
  
  for (let attempt = 0; attempt < opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      // Check if we should retry
      if (!opts.retryCondition(error)) {
        throw error;
      }
      
      // Check if we have more attempts
      if (attempt >= opts.maxAttempts - 1) {
        break;
      }
      
      const delay = calculateDelay(attempt, opts);
      
      logger.warn({
        event: 'retry_attempt',
        attempt: attempt + 1,
        maxAttempts: opts.maxAttempts,
        delayMs: delay,
        error: error.message,
      });
      
      if (opts.onRetry) {
        opts.onRetry(error, attempt + 1, delay);
      }
      
      await sleep(delay);
    }
  }
  
  logger.error({
    event: 'retry_exhausted',
    maxAttempts: opts.maxAttempts,
    error: lastError?.message,
  });
  
  throw lastError;
}

/**
 * Circuit breaker state
 */
class CircuitBreaker {
  constructor(options = {}) {
    this.name = options.name || 'default';
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeout = options.resetTimeout || 60000; // 1 minute
    this.halfOpenRequests = options.halfOpenRequests || 1;
    
    this.state = 'CLOSED';
    this.failures = 0;
    this.lastFailure = null;
    this.halfOpenAttempts = 0;
  }
  
  /**
   * Check if circuit allows requests
   * @returns {boolean}
   */
  canExecute() {
    if (this.state === 'CLOSED') {
      return true;
    }
    
    if (this.state === 'OPEN') {
      // Check if we should transition to half-open
      if (Date.now() - this.lastFailure >= this.resetTimeout) {
        this.state = 'HALF_OPEN';
        this.halfOpenAttempts = 0;
        logger.info({ event: 'circuit_half_open', name: this.name });
        return true;
      }
      return false;
    }
    
    // HALF_OPEN - allow limited requests
    return this.halfOpenAttempts < this.halfOpenRequests;
  }
  
  /**
   * Record success
   */
  recordSuccess() {
    if (this.state === 'HALF_OPEN') {
      this.state = 'CLOSED';
      this.failures = 0;
      logger.info({ event: 'circuit_closed', name: this.name });
    }
    this.failures = 0;
  }
  
  /**
   * Record failure
   */
  recordFailure() {
    this.failures++;
    this.lastFailure = Date.now();
    
    if (this.state === 'HALF_OPEN') {
      this.state = 'OPEN';
      logger.warn({ event: 'circuit_reopened', name: this.name });
      return;
    }
    
    if (this.failures >= this.failureThreshold) {
      this.state = 'OPEN';
      logger.warn({
        event: 'circuit_opened',
        name: this.name,
        failures: this.failures,
      });
    }
  }
  
  /**
   * Execute function with circuit breaker
   * @param {Function} fn - Async function
   * @returns {Promise<any>}
   */
  async execute(fn) {
    if (!this.canExecute()) {
      const error = new Error(`Circuit breaker ${this.name} is OPEN`);
      error.code = 'CIRCUIT_OPEN';
      throw error;
    }
    
    if (this.state === 'HALF_OPEN') {
      this.halfOpenAttempts++;
    }
    
    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }
  
  /**
   * Get circuit state
   * @returns {object}
   */
  getState() {
    return {
      name: this.name,
      state: this.state,
      failures: this.failures,
      lastFailure: this.lastFailure,
    };
  }
}

// Circuit breakers for external services
const circuitBreakers = new Map();

/**
 * Get or create circuit breaker for a service
 * @param {string} name - Service name
 * @param {object} options - Circuit breaker options
 * @returns {CircuitBreaker}
 */
export function getCircuitBreaker(name, options = {}) {
  if (!circuitBreakers.has(name)) {
    circuitBreakers.set(name, new CircuitBreaker({ name, ...options }));
  }
  return circuitBreakers.get(name);
}

/**
 * Execute with retry and circuit breaker
 * @param {string} serviceName - Service name for circuit breaker
 * @param {Function} fn - Async function
 * @param {object} options - Combined options
 * @returns {Promise<any>}
 */
export async function executeWithResilience(serviceName, fn, options = {}) {
  const circuitBreaker = getCircuitBreaker(serviceName, options.circuitBreaker);
  
  return circuitBreaker.execute(() => 
    retry(fn, options.retry)
  );
}

/**
 * Get all circuit breaker states
 * @returns {Array<object>}
 */
export function getCircuitBreakerStates() {
  return Array.from(circuitBreakers.values()).map(cb => cb.getState());
}

export { CircuitBreaker };
export default { retry, CircuitBreaker, getCircuitBreaker, executeWithResilience };

