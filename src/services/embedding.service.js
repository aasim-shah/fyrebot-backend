import Groq from 'groq-sdk';
import { retryWithBackoff } from '../utils/helpers.js';
import pino from 'pino';

const logger = pino();

class EmbeddingService {
  constructor() {
    this.groq = null;
    this.useMockEmbeddings = false;
  }

  initialize() {
    const apiKey = process.env.GROQ_API_KEY;
    
    // Check if we should use mock embeddings
    this.useMockEmbeddings = process.env.USE_MOCK_EMBEDDINGS === 'true';
    
    if (this.useMockEmbeddings) {
      logger.warn('🔶 Using MOCK embeddings - suitable for development only!');
      return;
    }
    
    if (!apiKey) {
      throw new Error('GROQ_API_KEY is not defined');
    }

    this.groq = new Groq({ apiKey });
    logger.info('Using Groq for embeddings (via text generation fallback)');
  }

  /**
   * Generate a mock embedding (for development/testing)
   */
  generateMockEmbedding(text) {
    // Generate a deterministic but unique embedding based on text content
    // This maintains some consistency for the same text
    const hash = text.split('').reduce((acc, char) => {
      return ((acc << 5) - acc) + char.charCodeAt(0);
    }, 0);
    
    // Generate a 768-dimensional embedding (matching standard dimension)
    const embedding = [];
    for (let i = 0; i < 768; i++) {
      // Use hash and index to generate pseudo-random but consistent values
      const seed = (hash + i) * 0.001;
      embedding.push(Math.sin(seed) * 0.5);
    }
    
    return embedding;
  }

  /**
   * Generate embedding for a single text
   * Note: Groq doesn't have native embedding API, so we use a simple text-based hash
   * For production, consider using a dedicated embedding service like OpenAI or Cohere
   */
  async generateEmbedding(text) {
    try {
      // Use mock embeddings if enabled OR if Groq doesn't support embeddings
      if (this.useMockEmbeddings) {
        return this.generateMockEmbedding(text);
      }

      // Since Groq doesn't provide embedding API, we'll use mock embeddings
      // In production, you should use a dedicated embedding service
      logger.warn('Using mock embeddings as Groq does not provide embedding API');
      return this.generateMockEmbedding(text);

    } catch (error) {
      logger.error({ error: error.message }, 'Failed to generate embedding');
      throw error;
    }
  }

  /**
   * Generate embeddings for multiple texts in batch
   */
  async generateEmbeddings(texts) {
    try {
      // Use mock embeddings
      if (this.useMockEmbeddings) {
        logger.info(`Generating ${texts.length} mock embeddings`);
        return texts.map(text => this.generateMockEmbedding(text));
      }

      // Since Groq doesn't provide embedding API, use mock embeddings
      logger.info(`Generating ${texts.length} embeddings using mock method`);
      return texts.map(text => this.generateMockEmbedding(text));

    } catch (error) {
      logger.error({ error: error.message }, 'Failed to generate batch embeddings');
      throw error;
    }
  }
}

export default new EmbeddingService();
