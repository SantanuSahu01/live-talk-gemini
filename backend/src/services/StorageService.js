import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import fs from 'fs';
import path from 'path';
import config, { isEnabled } from '../config/index.js';
import { createServiceLogger } from '../utils/logger.js';
import { executeWithResilience } from '../utils/retry.js';
import { StorageError } from '../utils/errors.js';

const logger = createServiceLogger('storage');

/**
 * StorageService - handles file uploads to S3-compatible storage
 * Supports: AWS S3, DigitalOcean Spaces, MinIO, Backblaze B2, Cloudflare R2, etc.
 */
class StorageService {
  constructor() {
    this.enabled = isEnabled('s3');
    this.client = null;
    this.bucket = config.S3_BUCKET;
    this.region = config.S3_REGION;
    this.endpoint = config.S3_ENDPOINT;
    this.cdnUrl = config.S3_CDN_URL;
    
    if (this.enabled) {
      const clientConfig = {
        region: this.region,
        forcePathStyle: config.S3_FORCE_PATH_STYLE,
      };
      
      // Add custom endpoint for S3-compatible services
      if (this.endpoint) {
        clientConfig.endpoint = this.endpoint;
      }
      
      // Add credentials if provided
      if (config.S3_ACCESS_KEY) {
        clientConfig.credentials = {
          accessKeyId: config.S3_ACCESS_KEY,
          secretAccessKey: config.S3_SECRET_KEY,
        };
      }
      
      this.client = new S3Client(clientConfig);
      
      logger.info({ 
        bucket: this.bucket, 
        region: this.region,
        endpoint: this.endpoint || 'AWS S3 (default)',
        forcePathStyle: config.S3_FORCE_PATH_STYLE,
      }, 'S3-compatible storage initialized');
    } else {
      logger.info('S3 storage disabled');
    }
  }
  
  /**
   * Check if storage is available
   * @returns {boolean}
   */
  isAvailable() {
    return this.enabled && this.client !== null;
  }
  
  /**
   * Get public URL for an object
   * @param {string} key - Object key
   * @returns {string} Public URL
   */
  getPublicUrl(key) {
    // Use CDN URL if configured
    if (this.cdnUrl) {
      return `${this.cdnUrl.replace(/\/$/, '')}/${key}`;
    }
    
    // Custom endpoint (DigitalOcean Spaces, MinIO, etc.)
    if (this.endpoint) {
      const endpointUrl = new URL(this.endpoint);
      if (config.S3_FORCE_PATH_STYLE) {
        // Path-style: https://endpoint/bucket/key
        return `${this.endpoint}/${this.bucket}/${key}`;
      } else {
        // Virtual-hosted style: https://bucket.endpoint/key
        return `https://${this.bucket}.${endpointUrl.host}/${key}`;
      }
    }
    
    // AWS S3 default
    return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;
  }
  
  /**
   * Upload file to S3
   * @param {string} localPath - Local file path
   * @param {string} key - S3 object key
   * @param {object} options - Upload options
   * @returns {Promise<object>} Upload result with URL
   */
  async uploadFile(localPath, key, options = {}) {
    if (!this.isAvailable()) {
      logger.debug({ localPath, key }, 'S3 disabled, skipping upload');
      return { skipped: true, localPath };
    }
    
    const startTime = Date.now();
    
    try {
      const result = await executeWithResilience('s3', async () => {
        const fileStream = fs.createReadStream(localPath);
        const stats = fs.statSync(localPath);
        
        const command = new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: fileStream,
          ContentLength: stats.size,
          ContentType: options.contentType || this.getContentType(localPath),
          Metadata: options.metadata || {},
          ACL: options.acl, // Optional: 'private' or 'public-read'
        });
        
        await this.client.send(command);
        
        const url = this.getPublicUrl(key);
        
        return {
          success: true,
          url,
          key,
          bucket: this.bucket,
          size: stats.size,
        };
      }, {
        retry: {
          maxAttempts: 3,
          initialDelayMs: 1000,
        },
        circuitBreaker: {
          failureThreshold: 5,
          resetTimeout: 60000,
        },
      });
      
      const duration = Date.now() - startTime;
      logger.info({ key, durationMs: duration }, 'File uploaded to storage');
      
      return result;
      
    } catch (error) {
      logger.error({ key, error: error.message }, 'Failed to upload to storage');
      throw new StorageError(`Failed to upload ${key}`, 'upload', error);
    }
  }
  
  /**
   * Upload buffer to S3
   * @param {Buffer} buffer - Data buffer
   * @param {string} key - S3 object key
   * @param {object} options - Upload options
   * @returns {Promise<object>} Upload result
   */
  async uploadBuffer(buffer, key, options = {}) {
    if (!this.isAvailable()) {
      logger.debug({ key }, 'S3 disabled, skipping upload');
      return { skipped: true };
    }
    
    try {
      const result = await executeWithResilience('s3', async () => {
        const command = new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: buffer,
          ContentType: options.contentType || 'application/octet-stream',
          Metadata: options.metadata || {},
          ACL: options.acl,
        });
        
        await this.client.send(command);
        
        const url = this.getPublicUrl(key);
        
        return {
          success: true,
          url,
          key,
          bucket: this.bucket,
          size: buffer.length,
        };
      }, {
        retry: { maxAttempts: 3 },
      });
      
      logger.info({ key, size: buffer.length }, 'Buffer uploaded to storage');
      return result;
      
    } catch (error) {
      logger.error({ key, error: error.message }, 'Failed to upload buffer');
      throw new StorageError(`Failed to upload ${key}`, 'upload', error);
    }
  }
  
  /**
   * Upload interview recordings
   * @param {string} interviewId - Interview ID
   * @param {object} files - Files to upload
   * @returns {Promise<object>} Upload results
   */
  async uploadRecordings(interviewId, files) {
    const results = {};
    const prefix = `interviews/${interviewId}`;
    
    // Upload audio file
    if (files.audio) {
      const key = `${prefix}/recording.wav`;
      results.audio = await this.uploadFile(files.audio, key, {
        contentType: 'audio/wav',
        metadata: { interviewId },
      });
    }
    
    // Upload transcripts
    if (files.transcripts) {
      const key = `${prefix}/transcripts.json`;
      results.transcripts = await this.uploadFile(files.transcripts, key, {
        contentType: 'application/json',
        metadata: { interviewId },
      });
    }
    
    return results;
  }
  
  /**
   * Generate presigned URL for download
   * @param {string} key - S3 object key
   * @param {number} expiresIn - Expiration in seconds
   * @returns {Promise<string>} Presigned URL
   */
  async getPresignedUrl(key, expiresIn = 3600) {
    if (!this.isAvailable()) {
      throw new StorageError('Storage not available', 'presign');
    }
    
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    
    const url = await getSignedUrl(this.client, command, { expiresIn });
    return url;
  }
  
  /**
   * Get content type from file extension
   * @param {string} filepath - File path
   * @returns {string} Content type
   */
  getContentType(filepath) {
    const ext = path.extname(filepath).toLowerCase();
    const types = {
      '.wav': 'audio/wav',
      '.mp3': 'audio/mpeg',
      '.json': 'application/json',
      '.txt': 'text/plain',
    };
    return types[ext] || 'application/octet-stream';
  }
  
  /**
   * Generate S3 key for interview
   * @param {string} interviewId - Interview ID
   * @param {string} filename - File name
   * @returns {string} S3 key
   */
  generateKey(interviewId, filename) {
    const date = new Date().toISOString().split('T')[0];
    return `interviews/${date}/${interviewId}/${filename}`;
  }
  
  /**
   * Get storage info
   * @returns {object}
   */
  getInfo() {
    return {
      enabled: this.enabled,
      bucket: this.bucket,
      region: this.region,
      endpoint: this.endpoint,
      cdnUrl: this.cdnUrl,
    };
  }
}

// Singleton instance
let instance = null;

/**
 * Get storage service instance
 * @returns {StorageService}
 */
export function getStorageService() {
  if (!instance) {
    instance = new StorageService();
  }
  return instance;
}

export { StorageService };
export default getStorageService;
