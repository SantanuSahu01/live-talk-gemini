# AI Interview Platform

Production-ready AI interview platform powered by Google Gemini Live API. Features real-time voice conversations, dynamic interview configuration, AI-controlled call flow, automatic recording, and enterprise integrations.

## Features

- **Real-time Voice Conversations** - Bidirectional audio streaming with Gemini 2.5 Flash
- **Dynamic Interview Configuration** - Customizable system prompts and evaluation criteria
- **AI-Controlled Call Flow** - AI can end calls and submit evaluations using function tools
- **Automatic Recording** - Mixed stereo WAV recording with timestamped transcripts
- **Enterprise Integrations** - S3 upload and RabbitMQ event publishing
- **Production Ready** - PM2 process management, Nginx reverse proxy, health checks

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│     Browser     │────▶│     Nginx       │────▶│   Backend       │
│   (React/Vite)  │◀────│  (WebSocket)    │◀────│   (Node.js)     │
└─────────────────┘     └─────────────────┘     └────────┬────────┘
                                                         │
                               ┌─────────────────────────┼─────────────────────────┐
                               │                         │                         │
                               ▼                         ▼                         ▼
                        ┌─────────────┐          ┌─────────────┐          ┌─────────────┐
                        │ Gemini Live │          │     S3      │          │  RabbitMQ   │
                        │    API      │          │   Storage   │          │   Events    │
                        └─────────────┘          └─────────────┘          └─────────────┘
```

## Project Structure

```
live-talk-gemini/
├── backend/
│   ├── src/
│   │   ├── index.js              # Entry point
│   │   ├── server.js             # WebSocket server
│   │   ├── config/               # Configuration
│   │   ├── services/             # Core services
│   │   │   ├── SessionManager.js
│   │   │   ├── GeminiService.js
│   │   │   ├── RecorderService.js
│   │   │   ├── StorageService.js
│   │   │   └── QueueService.js
│   │   ├── tools/                # Gemini function tools
│   │   │   ├── endCall.js
│   │   │   └── submitEvaluation.js
│   │   ├── handlers/             # Message handlers
│   │   └── utils/                # Utilities
│   ├── ecosystem.config.cjs      # PM2 configuration
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── App.jsx               # Main application
│   │   ├── hooks/                # React hooks
│   │   └── components/           # UI components
│   └── package.json
├── nginx/
│   └── ai-interview.conf         # Nginx configuration
└── package.json                  # Root package
```

## Quick Start

### Prerequisites

- Node.js 18+
- Gemini API Key ([Get one here](https://ai.google.dev/))

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd live-talk-gemini

# Install all dependencies
npm run install:all

# Set up environment
cp backend/env.example backend/.env
# Edit backend/.env and add your GEMINI_API_KEY
```

### Development

```bash
# Start both frontend and backend
npm run dev

# Or start separately
npm run dev:backend   # Backend on http://localhost:8080
npm run dev:frontend  # Frontend on http://localhost:5173
```

### Production with PM2

```bash
cd backend

# Start with PM2
npm run pm2:start

# Monitor
pm2 monit

# View logs
npm run pm2:logs

# Restart
npm run pm2:restart

# Stop
npm run pm2:stop
```

## Configuration

### Environment Variables

Create `backend/.env`:

```env
# Required
GEMINI_API_KEY=your_api_key_here

# Server
NODE_ENV=production
PORT=8080
HOST=0.0.0.0

# Optional: AWS S3
S3_ENABLED=true
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
S3_BUCKET=your-bucket

# Optional: RabbitMQ
RABBITMQ_ENABLED=true
RABBITMQ_URL=amqp://localhost:5672
RABBITMQ_EXCHANGE=interview

# Recording
RECORDING_ENABLED=true
RECORDING_DIR=./recordings

# Logging
LOG_LEVEL=info
LOG_PRETTY=false
```

### Interview Configuration

Configure interviews dynamically via WebSocket:

```javascript
// Client sends config message after connection
ws.send(JSON.stringify({
  type: 'config',
  config: {
    interviewId: 'uuid-here',
    systemPrompt: 'You are interviewing for a Senior Engineer role...',
    evaluationSchema: {
      technicalSkills: 'number 1-10',
      communication: 'number 1-10',
      recommendation: 'string'
    },
    maxDuration: 1800  // 30 minutes
  }
}));
```

## API Reference

### WebSocket Endpoints

**Connect**: `ws://localhost:8080/ws`

### Client → Server Messages

| Type | Description |
|------|-------------|
| `config` | Configure interview settings |
| `audio` | Send audio data (base64 PCM 16kHz) |
| `text` | Send text message |
| `interrupt` | Interrupt AI response |
| `end_call` | End the interview |

### Server → Client Messages

| Type | Description |
|------|-------------|
| `session_created` | Session initialized |
| `connected` | Connected to Gemini |
| `audio` | Audio response (base64 PCM 24kHz) |
| `transcript` | Real-time transcript |
| `call_ended` | Interview ended by AI |
| `evaluation_submitted` | AI submitted evaluation |

### Health Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Basic health check |
| `GET /ready` | Readiness check |
| `GET /stats` | Session statistics |

## Gemini Function Tools

### end_call

AI can end the interview:

```javascript
{
  name: "end_call",
  parameters: {
    reason: "completed", // or "candidate_request", "technical_issue", "time_limit"
    summary: "Brief summary of the interview"
  }
}
```

### submit_evaluation

AI submits final evaluation:

```javascript
{
  name: "submit_evaluation",
  parameters: {
    overallScore: 8,
    recommendation: "hire",
    technicalSkills: 7,
    communication: 9,
    summary: "Strong candidate with excellent communication..."
  }
}
```

## RabbitMQ Events

When enabled, the following events are published:

| Routing Key | Description |
|------------|-------------|
| `interview.started` | Interview session started |
| `interview.ended` | Interview completed |
| `interview.evaluation.submitted` | AI evaluation received |
| `interview.recording.ready` | Recordings uploaded to S3 |

## Nginx Deployment

1. Copy nginx config:
```bash
sudo cp nginx/ai-interview.conf /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/ai-interview.conf /etc/nginx/sites-enabled/
```

2. Update server_name and SSL paths

3. Test and reload:
```bash
sudo nginx -t
sudo systemctl reload nginx
```

## Resilience Features

- **Retry with Backoff**: Automatic retries for S3 and RabbitMQ
- **Circuit Breaker**: Prevents cascade failures
- **Graceful Degradation**: Core functionality continues if integrations fail
- **Session Recovery**: Gemini session resumption support
- **Graceful Shutdown**: Clean session termination on SIGTERM

## Development

### Backend Structure

```
backend/src/
├── config/
│   ├── index.js      # Config loader
│   └── schema.js     # Zod validation
├── services/
│   ├── GeminiService.js      # Gemini API wrapper
│   ├── SessionManager.js     # Session lifecycle
│   ├── RecorderService.js    # Audio/transcript recording
│   ├── StorageService.js     # S3 uploads
│   └── QueueService.js       # RabbitMQ publishing
├── tools/
│   ├── index.js              # Tool registry
│   ├── endCall.js            # End call tool
│   └── submitEvaluation.js   # Evaluation tool
├── handlers/
│   ├── MessageHandler.js     # Client message routing
│   └── ToolHandler.js        # Tool call handling
└── utils/
    ├── logger.js     # Pino logger
    ├── errors.js     # Error classes
    ├── audio.js      # Audio utilities
    └── retry.js      # Retry/circuit breaker
```

### Adding New Tools

1. Create tool file in `backend/src/tools/`:

```javascript
export const myTool = {
  name: 'my_tool',
  description: 'What this tool does',
  parameters: {
    type: 'object',
    properties: {
      param1: { type: 'string', description: '...' }
    },
    required: ['param1']
  }
};

export async function handleMyTool(args, context) {
  const { param1 } = args;
  // Implementation
  return { success: true };
}
```

2. Register in `backend/src/tools/index.js`:

```javascript
import myTool from './myTool.js';
toolRegistry.register('my_tool', myTool.definition, myTool.handler);
```

## License

MIT
