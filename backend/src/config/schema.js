import { z } from 'zod';

/**
 * Environment configuration schema with Zod validation
 */
export const configSchema = z.object({
  // Server
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(8080),
  HOST: z.string().default('0.0.0.0'),
  
  // Gemini API
  GEMINI_API_KEY: z.string().min(1, 'GEMINI_API_KEY is required'),
  GEMINI_MODEL: z.string().default('models/gemini-2.5-flash-native-audio-preview-12-2025'),
  GEMINI_VOICE: z.enum(['Puck', 'Charon', 'Kore', 'Fenrir', 'Aoede']).default('Puck'),
  
  // S3-Compatible Storage (AWS S3, DigitalOcean Spaces, MinIO, Backblaze B2, etc.)
  S3_ENABLED: z.coerce.boolean().default(false),
  S3_ENDPOINT: z.string().optional(), // Custom endpoint for S3-compatible services
  S3_REGION: z.string().default('us-east-1'),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_FORCE_PATH_STYLE: z.coerce.boolean().default(false), // Required for MinIO and some providers
  S3_CDN_URL: z.string().optional(), // Optional CDN URL for public files
  
  // RabbitMQ
  RABBITMQ_URL: z.string().default('amqp://localhost:5672'),
  RABBITMQ_EXCHANGE: z.string().default('interview'),
  RABBITMQ_ENABLED: z.coerce.boolean().default(false),
  
  // Recording
  RECORDING_ENABLED: z.coerce.boolean().default(true),
  RECORDING_DIR: z.string().default('./recordings'),
  
  // Logging
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  LOG_PRETTY: z.coerce.boolean().default(true),
  
  // Interview defaults
  DEFAULT_MAX_DURATION: z.coerce.number().default(1800), // 30 minutes
  SESSION_TIMEOUT: z.coerce.number().default(300), // 5 minutes idle timeout
});

/**
 * Interview configuration schema (passed per session)
 */
export const interviewConfigSchema = z.object({
  interviewId: z.string().uuid(),
  systemPrompt: z.string().min(1),
  evaluationSchema: z.record(z.string()).optional(),
  maxDuration: z.number().positive().optional(),
  candidateName: z.string().optional(),
  position: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

/**
 * Evaluation result schema (dynamic based on interview config)
 */
export const createEvaluationSchema = (evaluationFields) => {
  if (!evaluationFields || Object.keys(evaluationFields).length === 0) {
    return z.object({
      overallScore: z.number().min(1).max(10),
      recommendation: z.enum(['strong_hire', 'hire', 'no_hire', 'strong_no_hire']),
      summary: z.string(),
      strengths: z.array(z.string()).optional(),
      weaknesses: z.array(z.string()).optional(),
    });
  }
  
  // Build dynamic schema from evaluation fields
  const schemaFields = {};
  for (const [key, type] of Object.entries(evaluationFields)) {
    if (type.includes('number')) {
      const rangeMatch = type.match(/(\d+)-(\d+)/);
      if (rangeMatch) {
        schemaFields[key] = z.number().min(parseInt(rangeMatch[1])).max(parseInt(rangeMatch[2]));
      } else {
        schemaFields[key] = z.number();
      }
    } else if (type === 'boolean') {
      schemaFields[key] = z.boolean();
    } else {
      schemaFields[key] = z.string();
    }
  }
  
  return z.object(schemaFields);
};

export default configSchema;

