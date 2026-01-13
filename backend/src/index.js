/**
 * AI Interview Platform - Backend Entry Point
 */

import { startServer, stopServer } from './server.js';
import logger from './utils/logger.js';
import config from './config/index.js';

let httpServer = null;
let wss = null;

/**
 * Main startup function
 */
async function main() {
  logger.info({
    env: config.NODE_ENV,
    port: config.PORT,
    features: {
      recording: config.RECORDING_ENABLED,
      s3: config.S3_ENABLED,
      rabbitmq: config.RABBITMQ_ENABLED,
    }
  }, 'Starting AI Interview Platform');
  
  try {
    const servers = await startServer();
    httpServer = servers.httpServer;
    wss = servers.wss;
    
    logger.info('Server started successfully');
    
  } catch (error) {
    logger.fatal({ error: error.message }, 'Failed to start server');
    process.exit(1);
  }
}

/**
 * Graceful shutdown handler
 */
async function shutdown(signal) {
  logger.info({ signal }, 'Received shutdown signal');
  
  try {
    if (httpServer && wss) {
      await stopServer(httpServer, wss);
    }
    
    logger.info('Graceful shutdown complete');
    process.exit(0);
    
  } catch (error) {
    logger.error({ error: error.message }, 'Error during shutdown');
    process.exit(1);
  }
}

// Handle shutdown signals
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.fatal({ error: error.message, stack: error.stack }, 'Uncaught exception');
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled rejection');
});

// Start the application
main();
