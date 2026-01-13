import 'dotenv/config';
import { WebSocketServer } from 'ws';
import { GeminiLiveClient } from './gemini-live-client.js';
import { CallRecorder } from './call-recorder.js';
import { randomUUID } from 'crypto';

const PORT = process.env.PORT || 8080;
const ENABLE_RECORDING = process.env.ENABLE_RECORDING !== 'false'; // Enable by default

const wss = new WebSocketServer({ port: PORT });

// Track all active clients
const clients = new Map();

console.log(`🚀 WebSocket server running on ws://localhost:${PORT}`);
console.log(`🎙️ Recording: ${ENABLE_RECORDING ? 'ENABLED' : 'DISABLED'}`);

// Log active clients count periodically
setInterval(() => {
  if (clients.size > 0) {
    console.log(`📊 Active clients: ${clients.size}`);
  }
}, 30000);

wss.on('connection', (clientWs, req) => {
  // Generate unique client ID
  const clientId = randomUUID().slice(0, 8);
  const clientIp = req.socket.remoteAddress;
  
  console.log(`📱 [${clientId}] Client connected from ${clientIp}`);
  console.log(`📊 Total clients: ${clients.size + 1}`);
  
  let geminiClient = null;
  let sessionResumptionToken = null;
  let callRecorder = null;
  
  // Initialize call recorder if enabled
  if (ENABLE_RECORDING) {
    callRecorder = new CallRecorder({
      clientId,
      outputDir: './recordings'
    });
  }
  
  // Store client info
  clients.set(clientId, {
    ws: clientWs,
    connectedAt: new Date(),
    ip: clientIp,
    recorder: callRecorder
  });

  // Helper to create Gemini client with all callbacks
  const createGeminiClient = (resumptionToken = null) => {
    return new GeminiLiveClient({
      apiKey: process.env.GEMINI_API_KEY,
      resumptionToken,
      
      // Audio response from Gemini
      onAudio: (audioData, mimeType) => {
        // Record Gemini audio with timing
        if (callRecorder && callRecorder.isActive()) {
          callRecorder.addGeminiAudio(audioData);
        }
        
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
        // Record transcript
        if (callRecorder && callRecorder.isActive()) {
          callRecorder.addTranscript('assistant', transcript, isFinal);
        }
        
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
        // Record transcript
        if (callRecorder && callRecorder.isActive()) {
          callRecorder.addTranscript('user', transcript, isFinal);
        }
        
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
        console.log(`⚡ [${clientId}] Response interrupted`);
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
        console.error(`❌ [${clientId}] Gemini error:`, error.message || error);
        if (clientWs.readyState === clientWs.OPEN) {
          clientWs.send(JSON.stringify({
            type: 'error',
            message: error.message || 'Unknown error'
          }));
        }
      },
      
      // Successfully connected to Gemini
      onConnected: () => {
        console.log(`✅ [${clientId}] Connected to Gemini Live`);
        
        // Start recording when Gemini connects
        if (callRecorder) {
          callRecorder.start();
        }
        
        if (clientWs.readyState === clientWs.OPEN) {
          clientWs.send(JSON.stringify({
            type: 'connected',
            recording: ENABLE_RECORDING
          }));
        }
      },
      
      // Disconnected from Gemini
      onDisconnected: () => {
        console.log(`❌ [${clientId}] Disconnected from Gemini Live`);
        
        // Stop recording and save files
        if (callRecorder && callRecorder.isActive()) {
          callRecorder.stop().then(files => {
            if (files && clientWs.readyState === clientWs.OPEN) {
              clientWs.send(JSON.stringify({
                type: 'recording_saved',
                files: files
              }));
            }
          });
        }
        
        if (clientWs.readyState === clientWs.OPEN) {
          clientWs.send(JSON.stringify({
            type: 'disconnected',
            resumptionToken: sessionResumptionToken
          }));
        }
      },
      
      // Server requesting graceful disconnect (goAway)
      onGoAway: (info) => {
        console.log(`⚠️ [${clientId}] GoAway from Gemini:`, info.reason);
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
  };

  // Initialize Gemini Live connection for this client
  geminiClient = createGeminiClient();
  geminiClient.connect();

  clientWs.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      
      switch (data.type) {
        case 'audio':
          // Record user audio
          if (callRecorder && callRecorder.isActive()) {
            callRecorder.addUserAudio(data.data);
          }
          
          // Relay audio to this client's Gemini session
          if (geminiClient) {
            geminiClient.sendAudio(data.data);
          }
          break;
          
        case 'text':
          // Send text message to Gemini
          if (geminiClient) {
            console.log(`💬 [${clientId}] Text: "${data.text}"`);
            geminiClient.sendText(data.text);
          }
          break;
          
        case 'config':
          // Update configuration
          if (geminiClient) {
            console.log(`⚙️ [${clientId}] Config update:`, data.config);
            geminiClient.updateConfig(data.config);
          }
          break;
          
        case 'interrupt':
          // Cancel current response
          if (geminiClient) {
            console.log(`🛑 [${clientId}] Interrupt requested`);
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
          if (data.token) {
            console.log(`🔄 [${clientId}] Resuming session`);
            if (geminiClient) {
              geminiClient.disconnect();
            }
            geminiClient = createGeminiClient(data.token);
            geminiClient.connect();
          }
          break;
          
        case 'get_recording_stats':
          // Get current recording stats
          if (callRecorder) {
            const stats = callRecorder.getStats();
            clientWs.send(JSON.stringify({
              type: 'recording_stats',
              stats: stats
            }));
          }
          break;
          
        default:
          console.log(`❓ [${clientId}] Unknown message type:`, data.type);
      }
    } catch (error) {
      console.error(`❌ [${clientId}] Error processing message:`, error.message);
    }
  });

  clientWs.on('close', async (code, reason) => {
    console.log(`📱 [${clientId}] Client disconnected (code: ${code})`);
    
    // Stop recording and save
    if (callRecorder && callRecorder.isActive()) {
      const files = await callRecorder.stop();
      if (files) {
        console.log(`💾 [${clientId}] Recording saved:`, Object.values(files).join(', '));
      }
    }
    
    // Cleanup Gemini connection
    if (geminiClient) {
      geminiClient.disconnect();
      geminiClient = null;
    }
    clients.delete(clientId);
    
    console.log(`📊 Total clients: ${clients.size}`);
  });

  clientWs.on('error', async (error) => {
    console.error(`❌ [${clientId}] WebSocket error:`, error.message);
    
    // Stop recording and save
    if (callRecorder && callRecorder.isActive()) {
      await callRecorder.stop();
    }
    
    // Cleanup
    if (geminiClient) {
      geminiClient.disconnect();
      geminiClient = null;
    }
    clients.delete(clientId);
  });
});

// Graceful shutdown - close all client connections and save recordings
const shutdown = async () => {
  console.log('\n🛑 Shutting down...');
  
  // Stop all recordings and notify clients
  const savePromises = [];
  
  clients.forEach((client, id) => {
    try {
      // Stop recording
      if (client.recorder && client.recorder.isActive()) {
        savePromises.push(client.recorder.stop());
      }
      
      // Notify client
      client.ws.send(JSON.stringify({
        type: 'server_shutdown',
        message: 'Server is shutting down'
      }));
      client.ws.close(1001, 'Server shutdown');
    } catch (e) {
      // Ignore errors during shutdown
    }
  });
  
  // Wait for all recordings to save
  await Promise.all(savePromises);
  
  wss.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
  
  // Force exit after 5 seconds
  setTimeout(() => {
    console.log('⚠️ Forcing exit');
    process.exit(1);
  }, 5000);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
