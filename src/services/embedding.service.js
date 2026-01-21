import openaiService from './openai.service.js';
import pino from 'pino';

const logger = pino();

/**
 * Embedding Service - Production OpenAI embeddings
 */
class EmbeddingService {
  constructor() {
    this.initialized = false;
  }

  initialize() {
    openaiService.initialize();
    this.initialized = true;
    logger.info('Embedding service initialized with OpenAI');
  }

  /**
   * Generate embedding for a single text
   */
  async generateEmbedding(text, tenant) {
    if (!tenant) {
      throw new Error('Tenant object is required for embedding generation');
    }

    try {
      const result = await openaiService.generateEmbedding(text, tenant);
      return result.embedding;
    } catch (error) {
      logger.error({ 
        error: error.message, 
        tenantId: tenant.tenantId 
      }, 'Failed to generate embedding');
      throw error;
    }
  }

  /**
   * Generate embeddings for multiple texts in batch
   */
  async generateEmbeddings(texts, tenant) {
    if (!tenant) {
      throw new Error('Tenant object is required for embedding generation');
    }

    try {
      const result = await openaiService.generateEmbeddings(texts, tenant);
      return result.embeddings;
    } catch (error) {
      logger.error({ 
        error: error.message, 
        tenantId: tenant.tenantId 
      }, 'Failed to generate batch embeddings');
      throw error;
    }
  }
}

export default new EmbeddingService();
