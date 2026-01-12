import { nanoid } from 'nanoid';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

/**
 * Generate unique IDs for various entities
 */
export const generateId = {
  tenant: () => `ten_${nanoid(21)}`,
  apiKey: () => `sk_${nanoid(32)}`,
  section: () => `sec_${nanoid(21)}`,
  chunk: () => `chk_${nanoid(21)}`,
  job: () => `job_${nanoid(21)}`
};

/**
 * Hash API key for secure storage
 */
export const hashApiKey = (apiKey) => {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
};

/**
 * Split text into chunks with overlap
 */
export const chunkText = (text, chunkSize = 500, overlap = 50) => {
  const words = text.split(/\s+/);
  const chunks = [];
  
  for (let i = 0; i < words.length; i += chunkSize - overlap) {
    const chunk = words.slice(i, i + chunkSize).join(' ');
    if (chunk.trim().length > 0) {
      chunks.push(chunk.trim());
    }
  }
  
  return chunks;
};

/**
 * Estimate token count (rough approximation)
 */
export const estimateTokens = (text) => {
  return Math.ceil(text.length / 4);
};

/**
 * Create error response
 */
export const createError = (statusCode, message, details = null) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (details) error.details = details;
  return error;
};

/**
 * Async delay utility
 */
export const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Retry logic with exponential backoff
 */
export const retryWithBackoff = async (fn, maxRetries = 3, initialDelay = 1000) => {
  let lastError;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i < maxRetries - 1) {
        const delayTime = initialDelay * Math.pow(2, i);
        await delay(delayTime);
      }
    }
  }
  
  throw lastError;
};

/**
 * Hash a password using bcrypt
 */
export function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

/**
 * Compare password with hash
 */
export function comparePassword(password, hash) {
  return bcrypt.compareSync(password, hash);
}

/**
 * Generate JWT token
 */
export function generateToken(payload, expiresIn = '7d') {
  const secret = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
  return jwt.sign(payload, secret, { expiresIn });
}

/**
 * Verify JWT token
 */
export function verifyToken(token) {
  const secret = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
  try {
    return jwt.verify(token, secret);
  } catch (error) {
    throw new Error('Invalid or expired token');
  }
}
