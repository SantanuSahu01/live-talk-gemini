import 'dotenv/config';
import { WebSocketServer } from 'ws';
import { GeminiLiveClient } from './gemini-live-client.js';

const PORT = process.env.PORT || 8080;

const wss = new WebSocketServer({ port: PORT });

console.log(`🚀 WebSocket server running on ws://localhost:${PORT}`);

wss.on('connection', (clientWs, req) => {
  console.log('📱 Client connected');
  
  let geminiClient = null;
  
  // Initialize Gemini Live connection
  geminiClient = new GeminiLiveClient({
    apiKey: process.env.GEMINI_API_KEY,
    onAudio: (audioData, mimeType) => {
      if (clientWs.readyState === clientWs.OPEN) {
        console.log(`📤 Sending audio to client: ${audioData.length} bytes, mime: ${mimeType}`);
        clientWs.send(JSON.stringify({
          type: 'audio',
          data: audioData,
          mimeType: mimeType
        }));
      }
    },
    onTranscript: (transcript, isFinal) => {
      if (clientWs.readyState === clientWs.OPEN) {
        clientWs.send(JSON.stringify({
          type: 'transcript',
          text: transcript,
          isFinal
        }));
      }
    },
    onInterrupted: () => {
      if (clientWs.readyState === clientWs.OPEN) {
        clientWs.send(JSON.stringify({
          type: 'interrupted'
        }));
      }
    },
    onTurnComplete: () => {
      if (clientWs.readyState === clientWs.OPEN) {
        clientWs.send(JSON.stringify({
          type: 'turn_complete'
        }));
      }
    },
    onError: (error) => {
      console.error('Gemini error:', error);
      if (clientWs.readyState === clientWs.OPEN) {
        clientWs.send(JSON.stringify({
          type: 'error',
          message: error.message
        }));
      }
    },
    onConnected: () => {
      console.log('✅ Connected to Gemini Live');
      if (clientWs.readyState === clientWs.OPEN) {
        clientWs.send(JSON.stringify({
          type: 'connected'
        }));
      }
    },
    onDisconnected: () => {
      console.log('❌ Disconnected from Gemini Live');
      if (clientWs.readyState === clientWs.OPEN) {
        clientWs.send(JSON.stringify({
          type: 'disconnected'
        }));
      }
    }
  });

  geminiClient.connect();

  clientWs.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      
      switch (data.type) {
        case 'audio':
          // Relay audio to Gemini
          if (geminiClient) {
            geminiClient.sendAudio(data.data);
          }
          break;
          
        case 'config':
          // Update configuration
          if (geminiClient) {
            geminiClient.updateConfig(data.config);
          }
          break;
          
        case 'interrupt':
          // Cancel current response
          if (geminiClient) {
            geminiClient.interrupt();
          }
          break;
          
        default:
          console.log('Unknown message type:', data.type);
      }
    } catch (error) {
      console.error('Error processing client message:', error);
    }
  });

  clientWs.on('close', () => {
    console.log('📱 Client disconnected');
    if (geminiClient) {
      geminiClient.disconnect();
      geminiClient = null;
    }
  });

  clientWs.on('error', (error) => {
    console.error('Client WebSocket error:', error);
    if (geminiClient) {
      geminiClient.disconnect();
      geminiClient = null;
    }
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Shutting down...');
  wss.close(() => {
    process.exit(0);
  });
});

