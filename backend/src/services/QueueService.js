import amqplib from 'amqplib';
import config, { isEnabled } from '../config/index.js';
import { createServiceLogger } from '../utils/logger.js';
import { executeWithResilience, getCircuitBreaker } from '../utils/retry.js';
import { QueueError } from '../utils/errors.js';

const logger = createServiceLogger('queue');

/**
 * Routing keys for different event types
 */
const RoutingKeys = {
  INTERVIEW_STARTED: 'interview.started',
  INTERVIEW_ENDED: 'interview.ended',
  EVALUATION_SUBMITTED: 'interview.evaluation.submitted',
  RECORDING_READY: 'interview.recording.ready',
  ERROR: 'interview.error',
};

/**
 * QueueService - handles RabbitMQ message publishing
 */
class QueueService {
  constructor() {
    this.enabled = isEnabled('rabbitmq');
    this.connection = null;
    this.channel = null;
    this.exchange = config.RABBITMQ_EXCHANGE;
    this.connected = false;
    this.connecting = false;
    
    if (this.enabled) {
      logger.info({ exchange: this.exchange }, 'RabbitMQ enabled');
    } else {
      logger.info('RabbitMQ disabled');
    }
  }
  
  /**
   * Connect to RabbitMQ
   * @returns {Promise<void>}
   */
  async connect() {
    if (!this.enabled) {
      return;
    }
    
    if (this.connected || this.connecting) {
      return;
    }
    
    this.connecting = true;
    
    try {
      this.connection = await amqplib.connect(config.RABBITMQ_URL);
      this.channel = await this.connection.createChannel();
      
      // Declare exchange
      await this.channel.assertExchange(this.exchange, 'topic', {
        durable: true,
      });
      
      // Handle connection close
      this.connection.on('close', () => {
        logger.warn('RabbitMQ connection closed');
        this.connected = false;
        this.scheduleReconnect();
      });
      
      this.connection.on('error', (err) => {
        logger.error({ error: err.message }, 'RabbitMQ connection error');
      });
      
      this.connected = true;
      this.connecting = false;
      
      logger.info('Connected to RabbitMQ');
      
    } catch (error) {
      this.connecting = false;
      logger.error({ error: error.message }, 'Failed to connect to RabbitMQ');
      this.scheduleReconnect();
    }
  }
  
  /**
   * Schedule reconnection attempt
   */
  scheduleReconnect() {
    setTimeout(() => {
      if (!this.connected && !this.connecting) {
        logger.info('Attempting RabbitMQ reconnection');
        this.connect().catch(() => {});
      }
    }, 5000);
  }
  
  /**
   * Check if queue is available
   * @returns {boolean}
   */
  isAvailable() {
    return this.enabled && this.connected && this.channel !== null;
  }
  
  /**
   * Publish message to exchange
   * @param {string} routingKey - Routing key
   * @param {object} message - Message payload
   * @param {object} options - Publish options
   * @returns {Promise<boolean>}
   */
  async publish(routingKey, message, options = {}) {
    if (!this.enabled) {
      logger.debug({ routingKey }, 'RabbitMQ disabled, skipping publish');
      return false;
    }
    
    if (!this.isAvailable()) {
      logger.warn({ routingKey }, 'RabbitMQ not available');
      
      // Try to reconnect
      await this.connect();
      
      if (!this.isAvailable()) {
        throw new QueueError('RabbitMQ not available', 'publish');
      }
    }
    
    try {
      const result = await executeWithResilience('rabbitmq', async () => {
        const content = Buffer.from(JSON.stringify(message));
        
        const published = this.channel.publish(
          this.exchange,
          routingKey,
          content,
          {
            persistent: true,
            contentType: 'application/json',
            timestamp: Date.now(),
            ...options,
          }
        );
        
        if (!published) {
          throw new Error('Channel buffer full');
        }
        
        return published;
      }, {
        retry: {
          maxAttempts: 3,
          initialDelayMs: 500,
        },
        circuitBreaker: {
          failureThreshold: 5,
          resetTimeout: 30000,
        },
      });
      
      logger.debug({ routingKey }, 'Message published');
      return result;
      
    } catch (error) {
      logger.error({ routingKey, error: error.message }, 'Failed to publish message');
      throw new QueueError(`Failed to publish to ${routingKey}`, 'publish', error);
    }
  }
  
  /**
   * Publish interview started event
   * @param {object} data - Event data
   */
  async publishInterviewStarted(data) {
    return this.publish(RoutingKeys.INTERVIEW_STARTED, {
      event: 'interview.started',
      timestamp: new Date().toISOString(),
      ...data,
    });
  }
  
  /**
   * Publish interview ended event
   * @param {object} data - Event data
   */
  async publishInterviewEnded(data) {
    return this.publish(RoutingKeys.INTERVIEW_ENDED, {
      event: 'interview.ended',
      timestamp: new Date().toISOString(),
      ...data,
    });
  }
  
  /**
   * Publish evaluation submitted event
   * @param {object} evaluation - Evaluation data
   */
  async publishEvaluation(evaluation) {
    return this.publish(RoutingKeys.EVALUATION_SUBMITTED, {
      event: 'interview.evaluation.submitted',
      timestamp: new Date().toISOString(),
      ...evaluation,
    });
  }
  
  /**
   * Publish recording ready event
   * @param {object} data - Recording data
   */
  async publishRecordingReady(data) {
    return this.publish(RoutingKeys.RECORDING_READY, {
      event: 'interview.recording.ready',
      timestamp: new Date().toISOString(),
      ...data,
    });
  }
  
  /**
   * Publish error event
   * @param {object} data - Error data
   */
  async publishError(data) {
    return this.publish(RoutingKeys.ERROR, {
      event: 'interview.error',
      timestamp: new Date().toISOString(),
      ...data,
    });
  }
  
  /**
   * Close connection
   * @returns {Promise<void>}
   */
  async close() {
    try {
      if (this.channel) {
        await this.channel.close();
      }
      if (this.connection) {
        await this.connection.close();
      }
      this.connected = false;
      logger.info('RabbitMQ connection closed');
    } catch (error) {
      logger.error({ error: error.message }, 'Error closing RabbitMQ connection');
    }
  }
  
  /**
   * Get connection status
   * @returns {object}
   */
  getStatus() {
    return {
      enabled: this.enabled,
      connected: this.connected,
      exchange: this.exchange,
      circuitBreaker: getCircuitBreaker('rabbitmq')?.getState(),
    };
  }
}

// Singleton instance
let instance = null;

/**
 * Get queue service instance
 * @returns {QueueService}
 */
export function getQueueService() {
  if (!instance) {
    instance = new QueueService();
  }
  return instance;
}

/**
 * Initialize queue service (call on startup)
 * @returns {Promise<QueueService>}
 */
export async function initQueueService() {
  const service = getQueueService();
  await service.connect();
  return service;
}

export { QueueService, RoutingKeys };
export default getQueueService;

