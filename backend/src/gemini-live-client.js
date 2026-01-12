import WebSocket from 'ws';

const GEMINI_LIVE_URL = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent';
const MODEL = 'models/gemini-2.5-flash-native-audio-preview-12-2025';

export class GeminiLiveClient {
  constructor(options) {
    this.apiKey = options.apiKey;
    
    // Callbacks
    this.onAudio = options.onAudio || (() => {});
    this.onTranscript = options.onTranscript || (() => {});
    this.onInputTranscript = options.onInputTranscript || (() => {});
    this.onInterrupted = options.onInterrupted || (() => {});
    this.onTurnComplete = options.onTurnComplete || (() => {});
    this.onError = options.onError || (() => {});
    this.onConnected = options.onConnected || (() => {});
    this.onDisconnected = options.onDisconnected || (() => {});
    this.onGoAway = options.onGoAway || (() => {});
    this.onSessionResumable = options.onSessionResumable || (() => {});
    
    this.ws = null;
    this.isConnected = false;
    this.setupComplete = false;
    
    // Session management
    this.sessionResumptionToken = null;
    this.lastSessionResumptionToken = options.resumptionToken || null;
    
    // Configuration
    this.config = {
      systemInstruction: options.systemInstruction || "You are a helpful and friendly AI assistant. Be concise and conversational.",
      voiceName: options.voiceName || "Puck" // Options: Puck, Charon, Kore, Fenrir, Aoede
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
        },
        // Enable output audio transcription (what Gemini says as text)
        outputAudioTranscription: {},
        // Enable input audio transcription (what user says as text)
        inputAudioTranscription: {},
        // Session resumption for handling disconnects
        sessionResumption: {
          // If we have a previous token, use it to resume
          ...(this.lastSessionResumptionToken && { handle: this.lastSessionResumptionToken })
        },
        // Context window compression for longer sessions (15min+ for audio)
        contextWindowCompression: {
          triggerTokens: 25000,
          slidingWindow: {
            targetTokens: 12500
          }
        }
      }
    };

    this.send(setupMessage);
    console.log('📤 Sent setup message with transcription and session resumption enabled');
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

      // Handle session resumption update
      if (message.sessionResumptionUpdate) {
        const update = message.sessionResumptionUpdate;
        if (update.newHandle) {
          this.sessionResumptionToken = update.newHandle;
          console.log('🔄 Session resumption token updated');
          this.onSessionResumable(update.newHandle);
        }
        if (update.resumable !== undefined) {
          console.log(`📌 Session resumable: ${update.resumable}`);
        }
        return;
      }

      // Handle goAway message (server requesting graceful disconnect)
      if (message.goAway) {
        console.log('⚠️ GoAway received - server requesting disconnect');
        console.log(`   Time left: ${message.goAway.timeLeft || 'unknown'}`);
        this.onGoAway({
          timeLeft: message.goAway.timeLeft,
          reason: message.goAway.reason || 'Server requested disconnect'
        });
        return;
      }

      // Handle server content (audio/text responses)
      if (message.serverContent) {
        const content = message.serverContent;
        
        // Check if generation is complete
        if (content.generationComplete) {
          console.log('🏁 Generation complete');
          this.onTurnComplete();
          return;
        }

        // Check if interrupted
        if (content.interrupted) {
          console.log('⚡ Response interrupted by user');
          this.onInterrupted();
          return;
        }

        // Handle turn complete
        if (content.turnComplete) {
          console.log('✅ Turn complete');
          this.onTurnComplete();
          return;
        }

        // Handle input transcription (what the user said)
        if (content.inputTranscription) {
          const text = content.inputTranscription.text;
          const isFinal = content.inputTranscription.isFinal || false;
          console.log(`👤 User transcript: "${text}" (final: ${isFinal})`);
          this.onInputTranscript(text, isFinal);
        }

        // Handle output transcription (what Gemini said)
        if (content.outputTranscription) {
          const text = content.outputTranscription.text;
          const isFinal = content.outputTranscription.isFinal || false;
          console.log(`🤖 Gemini transcript: "${text}" (final: ${isFinal})`);
          this.onTranscript(text, isFinal);
        }

        // Handle model turn with parts (audio and text)
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
              console.log(`🔊 Audio: ${part.inlineData.mimeType}, ${decoded.length} bytes, samples: [${samples.slice(0, 5).join(', ')}...]`);
              this.onAudio(audioData, part.inlineData.mimeType);
            }
            
            // Handle text response (fallback, usually transcription handles this)
            if (part.text) {
              console.log(`📝 Text part: ${part.text}`);
              this.onTranscript(part.text, false);
            }
          }
        }
      }

      // Handle tool calls if needed
      if (message.toolCall) {
        console.log('🔧 Tool call received:', JSON.stringify(message.toolCall, null, 2));
        // TODO: Implement tool call handling
      }

      // Handle tool call cancellation
      if (message.toolCallCancellation) {
        console.log('❌ Tool call cancelled:', message.toolCallCancellation);
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

  // Send activity signals (for voice activity detection)
  sendActivityStart() {
    if (this.isConnected && this.setupComplete) {
      this.send({ activityStart: {} });
    }
  }

  sendActivityEnd() {
    if (this.isConnected && this.setupComplete) {
      this.send({ activityEnd: {} });
    }
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

  // Get session resumption token for reconnecting
  getResumptionToken() {
    return this.sessionResumptionToken;
  }
}
