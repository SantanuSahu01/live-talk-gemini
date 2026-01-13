import 'dotenv/config';
import { configSchema, interviewConfigSchema, createEvaluationSchema } from './schema.js';

/**
 * Load and validate configuration from environment variables
 */
function loadConfig() {
  const result = configSchema.safeParse(process.env);
  
  if (!result.success) {
    console.error('❌ Configuration validation failed:');
    for (const error of result.error.errors) {
      console.error(`   - ${error.path.join('.')}: ${error.message}`);
    }
    process.exit(1);
  }
  
  return result.data;
}

// Load config once at startup
const config = loadConfig();

// Freeze to prevent accidental modification
Object.freeze(config);

/**
 * Validate interview configuration
 * @param {object} data - Interview config from client
 * @returns {object} Validated config
 * @throws {Error} If validation fails
 */
export function validateInterviewConfig(data) {
  const result = interviewConfigSchema.safeParse(data);
  
  if (!result.success) {
    const errors = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
    throw new Error(`Invalid interview config: ${errors.join(', ')}`);
  }
  
  return result.data;
}

/**
 * Validate evaluation data against schema
 * @param {object} data - Evaluation data from tool
 * @param {object} evaluationFields - Schema definition from interview config
 * @returns {object} Validated evaluation
 * @throws {Error} If validation fails
 */
export function validateEvaluation(data, evaluationFields) {
  const schema = createEvaluationSchema(evaluationFields);
  const result = schema.safeParse(data);
  
  if (!result.success) {
    const errors = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
    throw new Error(`Invalid evaluation: ${errors.join(', ')}`);
  }
  
  return result.data;
}

/**
 * Get configuration value
 * @param {string} key - Config key
 * @returns {any} Config value
 */
export function get(key) {
  return config[key];
}

/**
 * Check if running in production
 * @returns {boolean}
 */
export function isProduction() {
  return config.NODE_ENV === 'production';
}

/**
 * Check if a feature is enabled
 * @param {string} feature - Feature name (s3, rabbitmq, recording)
 * @returns {boolean}
 */
export function isEnabled(feature) {
  switch (feature) {
    case 's3':
    case 'storage':
      return config.S3_ENABLED && !!config.S3_BUCKET && !!config.S3_ACCESS_KEY;
    case 'rabbitmq':
    case 'queue':
      return config.RABBITMQ_ENABLED;
    case 'recording':
      return config.RECORDING_ENABLED;
    default:
      return false;
  }
}

// Export full config for direct access
export { config };

export default config;

