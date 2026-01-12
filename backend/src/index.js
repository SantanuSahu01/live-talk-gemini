import 'dotenv/config';
import { WebSocketServer } from 'ws';
import { GeminiLiveClient } from './gemini-live-client.js';

const PORT = process.env.PORT || 8080;

const wss = new WebSocketServer({ port: PORT });

console.log(`🚀 WebSocket server running on ws://localhost:${PORT}`);

wss.on('connection', (clientWs, req) => {
  console.log('📱 Client connected');
  
  let geminiClient = null;
  let sessionResumptionToken = null;
  
  // Initialize Gemini Live connection
  geminiClient = new GeminiLiveClient({
    apiKey: process.env.GEMINI_API_KEY,
    
    // Audio response from Gemini
    onAudio: (audioData, mimeType) => {
      if (clientWs.readyState === clientWs.OPEN) {
        clientWs.send(JSON.stringify({
          type: 'audio',
          data: audioData,
          mimeType: mimeType
        }));
      }
    },
    
    // Output transcription (what Gemini is saying as text)
    onTranscript: (transcript, isFinal) => {
      if (clientWs.readyState === clientWs.OPEN) {
        clientWs.send(JSON.stringify({
          type: 'transcript',
          text: transcript,
          isFinal,
          role: 'assistant'
        }));
      }
    },
    
    // Input transcription (what user is saying as text)
    onInputTranscript: (transcript, isFinal) => {
      if (clientWs.readyState === clientWs.OPEN) {
        clientWs.send(JSON.stringify({
          type: 'transcript',
          text: transcript,
          isFinal,
          role: 'user'
        }));
      }
    },
    
    // Gemini's response was interrupted by user speaking
    onInterrupted: () => {
      if (clientWs.readyState === clientWs.OPEN) {
        clientWs.send(JSON.stringify({
          type: 'interrupted'
        }));
      }
    },
    
    // Gemini finished speaking
    onTurnComplete: () => {
      if (clientWs.readyState === clientWs.OPEN) {
        clientWs.send(JSON.stringify({
          type: 'turn_complete'
        }));
      }
    },
    
    // Error occurred
    onError: (error) => {
      console.error('Gemini error:', error);
      if (clientWs.readyState === clientWs.OPEN) {
        clientWs.send(JSON.stringify({
          type: 'error',
          message: error.message || 'Unknown error'
        }));
      }
    },
    
    // Successfully connected to Gemini
    onConnected: () => {
      console.log('✅ Connected to Gemini Live');
      if (clientWs.readyState === clientWs.OPEN) {
        clientWs.send(JSON.stringify({
          type: 'connected'
        }));
      }
    },
    
    // Disconnected from Gemini
    onDisconnected: () => {
      console.log('❌ Disconnected from Gemini Live');
      if (clientWs.readyState === clientWs.OPEN) {
        clientWs.send(JSON.stringify({
          type: 'disconnected',
          resumptionToken: sessionResumptionToken
        }));
      }
    },
    
    // Server requesting graceful disconnect (goAway)
    onGoAway: (info) => {
      console.log('⚠️ GoAway from Gemini:', info);
      if (clientWs.readyState === clientWs.OPEN) {
        clientWs.send(JSON.stringify({
          type: 'go_away',
          timeLeft: info.timeLeft,
          reason: info.reason
        }));
      }
    },
    
    // Session can be resumed with this token
    onSessionResumable: (token) => {
      sessionResumptionToken = token;
      if (clientWs.readyState === clientWs.OPEN) {
        clientWs.send(JSON.stringify({
          type: 'session_resumable',
          token: token
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
          
        case 'text':
          // Send text message to Gemini
          if (geminiClient) {
            geminiClient.sendText(data.text);
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
          
        case 'activity_start':
          // User started speaking
          if (geminiClient) {
            geminiClient.sendActivityStart();
          }
          break;
          
        case 'activity_end':
          // User stopped speaking
          if (geminiClient) {
            geminiClient.sendActivityEnd();
          }
          break;
          
        case 'resume':
          // Resume session with token
          if (geminiClient && data.token) {
            geminiClient.disconnect();
            geminiClient = new GeminiLiveClient({
              apiKey: process.env.GEMINI_API_KEY,
              resumptionToken: data.token,
              // ... copy all the callbacks
            });
            geminiClient.connect();
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

process.on('SIGINT', () => {
  console.log('\nShutting down...');
  wss.close(() => {
    process.exit(0);
  });
});
