import WebSocket from 'ws';

const GEMINI_LIVE_URL = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent';
const MODEL = 'models/gemini-2.5-flash-native-audio-preview-12-2025';

export class GeminiLiveClient {
  constructor(options) {
    this.apiKey = options.apiKey;
    this.onAudio = options.onAudio || (() => {});
    this.onTranscript = options.onTranscript || (() => {});
    this.onInterrupted = options.onInterrupted || (() => {});
    this.onTurnComplete = options.onTurnComplete || (() => {});
    this.onError = options.onError || (() => {});
    this.onConnected = options.onConnected || (() => {});
    this.onDisconnected = options.onDisconnected || (() => {});
    
    this.ws = null;
    this.isConnected = false;
    this.setupComplete = false;
    
    this.config = {
      systemInstruction: "You are a helpful AI assistant. Be concise and conversational.",
      voiceName: "Puck" // Options: Puck, Charon, Kore, Fenrir, Aoede
    };
  }

  connect() {
    const url = `${GEMINI_LIVE_URL}?key=${this.apiKey}`;
    
    this.ws = new WebSocket(url);
    
    this.ws.on('open', () => {
      console.log('🔌 WebSocket connected to Gemini');
      this.isConnected = true;
      this.sendSetup();
    });

    this.ws.on('message', (data) => {
      this.handleMessage(data);
    });

    this.ws.on('close', (code, reason) => {
      console.log(`WebSocket closed: ${code} - ${reason}`);
      this.isConnected = false;
      this.setupComplete = false;
      this.onDisconnected();
    });

    this.ws.on('error', (error) => {
      console.error('Gemini WebSocket error:', error);
      this.onError(error);
    });
  }

  sendSetup() {
    const setupMessage = {
      setup: {
        model: MODEL,
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: this.config.voiceName
              }
            }
          }
        },
        systemInstruction: {
          parts: [{ text: this.config.systemInstruction }]
        }
      }
    };

    this.send(setupMessage);
    console.log('📤 Sent setup message');
  }

  handleMessage(data) {
    try {
      const message = JSON.parse(data.toString());
      
      // Handle setup complete
      if (message.setupComplete) {
        console.log('✅ Setup complete');
        this.setupComplete = true;
        this.onConnected();
        return;
      }

      // Handle server content (audio/text responses)
      if (message.serverContent) {
        const content = message.serverContent;
        
        // Check if interrupted
        if (content.interrupted) {
          this.onInterrupted();
          return;
        }

        // Handle turn complete
        if (content.turnComplete) {
          this.onTurnComplete();
          return;
        }

        // Handle model turn with parts
        if (content.modelTurn && content.modelTurn.parts) {
          for (const part of content.modelTurn.parts) {
            // Handle audio response
            if (part.inlineData && part.inlineData.mimeType?.includes('audio')) {
              const audioData = part.inlineData.data;
              // Decode first few bytes to check if it's valid PCM
              const decoded = Buffer.from(audioData, 'base64');
              const samples = [];
              for (let i = 0; i < Math.min(10, decoded.length / 2); i++) {
                samples.push(decoded.readInt16LE(i * 2));
              }
              console.log(`🔊 Audio: ${part.inlineData.mimeType}, ${audioData.length} base64 chars, ${decoded.length} bytes, first samples: [${samples.join(', ')}]`);
              this.onAudio(audioData, part.inlineData.mimeType);
            }
            
            // Handle text response
            if (part.text) {
              console.log(`📝 Transcript: ${part.text}`);
              this.onTranscript(part.text, false);
            }
          }
        }
      }

      // Handle tool calls if needed
      if (message.toolCall) {
        console.log('Tool call received:', message.toolCall);
      }

    } catch (error) {
      console.error('Error parsing Gemini message:', error);
    }
  }

  sendAudio(base64Audio) {
    if (!this.isConnected || !this.setupComplete) {
      console.warn('Cannot send audio: not connected or setup not complete');
      return;
    }

    const message = {
      realtimeInput: {
        mediaChunks: [{
          mimeType: "audio/pcm;rate=16000",
          data: base64Audio
        }]
      }
    };

    this.send(message);
  }

  sendText(text) {
    if (!this.isConnected || !this.setupComplete) {
      console.warn('Cannot send text: not connected or setup not complete');
      return;
    }

    const message = {
      clientContent: {
        turns: [{
          role: "user",
          parts: [{ text }]
        }],
        turnComplete: true
      }
    };

    this.send(message);
  }

  interrupt() {
    // Send end of turn to interrupt
    if (this.isConnected && this.setupComplete) {
      const message = {
        clientContent: {
          turnComplete: true
        }
      };
      this.send(message);
    }
  }

  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    // Reconnect with new config if already connected
    if (this.isConnected) {
      this.disconnect();
      this.connect();
    }
  }

  send(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
    this.setupComplete = false;
  }
}

