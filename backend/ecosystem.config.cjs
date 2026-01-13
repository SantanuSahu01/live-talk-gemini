/**
 * PM2 Ecosystem Configuration
 * 
 * Usage:
 *   pm2 start ecosystem.config.cjs
 *   pm2 start ecosystem.config.cjs --env production
 *   pm2 reload ecosystem.config.cjs
 *   pm2 logs ai-interview
 */

module.exports = {
  apps: [
    {
      name: 'ai-interview',
      script: './src/index.js',
      cwd: __dirname,
      
      // Process management
      instances: 1,  // WebSocket requires single instance per port
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      
      // Logging
      log_date_format: 'YYYY-MM-DD HH:mm:ss.SSS',
      error_file: './logs/error.log',
      out_file: './logs/out.log',
      merge_logs: true,
      
      // Graceful shutdown
      kill_timeout: 10000,
      wait_ready: true,
      listen_timeout: 10000,
      
      // Environment - Development
      env: {
        NODE_ENV: 'development',
        PORT: 8080,
        HOST: '0.0.0.0',
        LOG_LEVEL: 'debug',
        LOG_PRETTY: 'true',
        RECORDING_ENABLED: 'true',
        S3_ENABLED: 'false',
        RABBITMQ_ENABLED: 'false',
      },
      
      // Environment - Production
      env_production: {
        NODE_ENV: 'production',
        PORT: 8080,
        HOST: '0.0.0.0',
        LOG_LEVEL: 'info',
        LOG_PRETTY: 'false',
        RECORDING_ENABLED: 'true',
        // S3 and RabbitMQ should be configured via .env file
      },
      
      // Environment - Staging
      env_staging: {
        NODE_ENV: 'staging',
        PORT: 8080,
        HOST: '0.0.0.0',
        LOG_LEVEL: 'debug',
        LOG_PRETTY: 'false',
        RECORDING_ENABLED: 'true',
      },
    },
  ],
  
  // Deployment configuration (optional)
  deploy: {
    production: {
      user: 'deploy',
      host: 'your-server.com',
      ref: 'origin/main',
      repo: 'git@github.com:your-org/ai-interview.git',
      path: '/var/www/ai-interview',
      'pre-deploy-local': '',
      'post-deploy': 'cd backend && npm install && pm2 reload ecosystem.config.cjs --env production',
      'pre-setup': '',
    },
  },
};

