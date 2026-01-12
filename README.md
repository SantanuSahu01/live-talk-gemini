# Live Talk with Gemini

A real-time voice conversation application powered by Google's Gemini 2.5 Flash Native Audio API. Talk naturally with AI using bidirectional audio streaming.

![Live Talk with Gemini](https://img.shields.io/badge/Powered%20by-Gemini%202.5-blue)

## 🌟 Features

- **Real-time Voice Conversation**: Bidirectional audio streaming with Gemini Live API
- **Low Latency**: WebSocket-based communication for minimal delay
- **Modern UI**: Beautiful, responsive interface built with React and Vite
- **Transcripts**: View conversation history with both user and AI responses
- **Multiple Voices**: Choose from different AI voice options

## 🏗️ Architecture

```
┌─────────────────┐     WebSocket      ┌──────────────────┐     WebSocket     ┌─────────────────┐
│                 │ ◄──────────────────►│                  │◄─────────────────►│                 │
│    Frontend     │    Audio/Events    │     Backend       │    Audio/Text    │   Gemini Live   │
│   (Vite/React)  │                    │    (Node.js)      │                   │       API       │
│                 │                    │                   │                   │                 │
└─────────────────┘                    └──────────────────┘                   └─────────────────┘
```

## 📋 Prerequisites

- Node.js 18+ 
- A Google AI Studio API key (get one at https://aistudio.google.com/apikey)

## 🚀 Quick Start

### 1. Clone and Install

```bash
# Install all dependencies (root, backend, and frontend)
npm run install:all
```

### 2. Configure Environment

Create a `.env` file in the `backend` directory:

```bash
cd backend
cp .env.example .env
# Edit .env and add your Gemini API key
```

```env
GEMINI_API_KEY=your_api_key_here
PORT=8080
```

### 3. Start the Servers

```bash
# Run both backend and frontend concurrently
npm run dev
```

Or run them separately:

```bash
npm run dev:backend   # Start backend only
npm run dev:frontend  # Start frontend only
```

### 4. Open the App

Navigate to http://localhost:5173 in your browser.

## 🎤 How to Use

1. Click the microphone button to start a live session
2. Audio streams continuously to Gemini in real-time
3. Speak naturally - Gemini will respond when you pause
4. Click again to end the session
5. View transcripts in the conversation panel

## 🛠️ Configuration

### Voice Options

You can change the AI voice in `backend/src/gemini-live-client.js`:

```javascript
this.config = {
  systemInstruction: "You are a helpful AI assistant.",
  voiceName: "Puck" // Options: Puck, Charon, Kore, Fenrir, Aoede
};
```

### System Instructions

Customize the AI's personality by modifying the `systemInstruction` in the same file.

## 📁 Project Structure

```
live-talk-gemini/
├── backend/
│   ├── package.json
│   ├── .env.example
│   └── src/
│       ├── index.js              # WebSocket server
│       └── gemini-live-client.js # Gemini API integration
├── frontend/
│   ├── package.json
│   ├── vite.config.js
│   ├── index.html
│   └── src/
│       ├── main.jsx
│       ├── App.jsx              # Main application
│       ├── App.css              # Application styles
│       ├── index.css            # Global styles
│       └── hooks/
│           ├── useWebSocket.js    # WebSocket connection
│           ├── useAudioRecorder.js # Microphone input
│           └── useAudioPlayer.js   # Audio playback
└── README.md
```

## 🔧 Technical Details

### Audio Format

- **Input (Client → Gemini)**: PCM 16-bit, 16kHz, mono
- **Output (Gemini → Client)**: PCM 16-bit, 24kHz, mono

### WebSocket Messages

**Client → Server:**
```json
{ "type": "audio", "data": "<base64-encoded-pcm>" }
{ "type": "config", "config": { "voiceName": "Puck" } }
{ "type": "interrupt" }
```

**Server → Client:**
```json
{ "type": "connected" }
{ "type": "audio", "data": "<base64-encoded-pcm>" }
{ "type": "transcript", "text": "...", "isFinal": true }
{ "type": "turn_complete" }
{ "type": "interrupted" }
{ "type": "error", "message": "..." }
```

## 🐛 Troubleshooting

### "Audio recording not supported"
- Use a modern browser (Chrome, Edge, Firefox)
- Ensure you're on HTTPS or localhost

### Connection Issues
- Check if both backend and frontend servers are running
- Verify your API key is correctly set in `.env`
- Check the backend console for error messages

### No Audio Output
- Click anywhere on the page first (browser autoplay policy)
- Check your system audio output

## 📄 License

MIT

## 🙏 Acknowledgments

- [Google Gemini API](https://ai.google.dev/)
- [Vite](https://vitejs.dev/)
- [React](https://react.dev/)

