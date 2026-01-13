import { WebSocketServer } from 'ws';
import http from 'http';
import config from './config/index.js';
import logger, { logConnection, logDisconnection } from './utils/logger.js';
import { getSessionManager } from './services/SessionManager.js';
import { initQueueService, getQueueService } from './services/QueueService.js';
import { MessageHandler } from './handlers/MessageHandler.js';
import { getCircuitBreakerStates } from './utils/retry.js';

/**
 * Create HTTP server for health checks
 * @returns {http.Server}
 */
function createHttpServer() {
  const server = http.createServer((req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }
    
    const url = new URL(req.url, `http://${req.headers.host}`);
    
    switch (url.pathname) {
      case '/health':
        handleHealthCheck(req, res);
        break;
        
      case '/ready':
        handleReadyCheck(req, res);
        break;
        
      case '/stats':
        handleStats(req, res);
        break;
        
      default:
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
    }
  });
  
  return server;
}

/**
 * Health check endpoint
 */
function handleHealthCheck(req, res) {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  }));
}

/**
 * Ready check endpoint
 */
function handleReadyCheck(req, res) {
  const sessionManager = getSessionManager();
  const queueService = getQueueService();
  
  const ready = {
    sessions: true,
    queue: queueService.isAvailable() || !config.RABBITMQ_ENABLED,
  };
  
  const isReady = Object.values(ready).every(Boolean);
  
  res.writeHead(isReady ? 200 : 503, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    status: isReady ? 'ready' : 'not_ready',
    checks: ready,
    timestamp: new Date().toISOString(),
  }));
}

/**
 * Stats endpoint
 */
function handleStats(req, res) {
  const sessionManager = getSessionManager();
  const queueService = getQueueService();
  
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    sessions: sessionManager.getStats(),
    queue: queueService.getStatus(),
    circuitBreakers: getCircuitBreakerStates(),
    memory: process.memoryUsage(),
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  }));
}

/**
 * Create WebSocket server
 * @param {http.Server} httpServer - HTTP server
 * @returns {WebSocketServer}
 */
function createWebSocketServer(httpServer) {
  const wss = new WebSocketServer({ 
    server: httpServer,
    path: '/ws',
  });
  
  const sessionManager = getSessionManager();
  
  wss.on('connection', (ws, req) => {
    // Get client info
    const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() 
      || req.headers['x-real-ip'] 
      || req.socket.remoteAddress;
    
    // Create session
    const session = sessionManager.createSession({
      clientWs: ws,
      clientIp,
    });
    
    logConnection(session.sessionId, clientIp);
    
    // Create message handler
    const messageHandler = new MessageHandler({
      sessionId: session.sessionId,
      session,
    });
    
    // Handle messages
    ws.on('message', async (data) => {
      try {
        await messageHandler.handle(data);
      } catch (error) {
        logger.error({ 
          sessionId: session.sessionId,
          error: error.message 
        }, 'Message handling error');
        
        ws.send(JSON.stringify({
          type: 'error',
          message: error.message,
        }));
      }
    });
    
    // Handle close
    ws.on('close', (code, reason) => {
      logDisconnection(session.sessionId, code, reason?.toString());
      session.end('client_disconnected');
    });
    
    // Handle errors
    ws.on('error', (error) => {
      logger.error({ 
        sessionId: session.sessionId,
        error: error.message 
      }, 'WebSocket error');
    });
    
    // Send session info to client
    ws.send(JSON.stringify({
      type: 'session_created',
      sessionId: session.sessionId,
    }));
  });
  
  wss.on('error', (error) => {
    logger.error({ error: error.message }, 'WebSocket server error');
  });
  
  return wss;
}

/**
 * Start the server
 * @returns {Promise<{httpServer: http.Server, wss: WebSocketServer}>}
 */
export async function startServer() {
  // Initialize queue service
  if (config.RABBITMQ_ENABLED) {
    await initQueueService();
  }
  
  // Create servers
  const httpServer = createHttpServer();
  const wss = createWebSocketServer(httpServer);
  
  // Start listening
  return new Promise((resolve, reject) => {
    httpServer.listen(config.PORT, config.HOST, () => {
      logger.info({ 
        port: config.PORT, 
        host: config.HOST,
        env: config.NODE_ENV 
      }, 'Server started');
      
      resolve({ httpServer, wss });
    });
    
    httpServer.on('error', reject);
  });
}

/**
 * Stop the server gracefully
 * @param {http.Server} httpServer - HTTP server
 * @param {WebSocketServer} wss - WebSocket server
 */
export async function stopServer(httpServer, wss) {
  logger.info('Shutting down server...');
  
  // End all sessions
  const sessionManager = getSessionManager();
  await sessionManager.endAllSessions('shutdown');
  
  // Close queue connection
  const queueService = getQueueService();
  await queueService.close();
  
  // Close WebSocket server
  await new Promise((resolve) => {
    wss.close(() => {
      logger.info('WebSocket server closed');
      resolve();
    });
  });
  
  // Close HTTP server
  await new Promise((resolve) => {
    httpServer.close(() => {
      logger.info('HTTP server closed');
      resolve();
    });
  });
  
  logger.info('Server shutdown complete');
}

export default { startServer, stopServer };

