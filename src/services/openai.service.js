import OpenAI from 'openai';
import { DEFAULT_MODELS, OPENAI_MODELS } from '../utils/constants.js';
import { retryWithBackoff } from '../utils/helpers.js';
import pino from 'pino';

const logger = pino();

/**
 * OpenAI Service - Per-tenant OpenAI instances
 * Supports embeddings and chat completions with tenant-specific API keys
 */
class OpenAIService {
  constructor() {
    this.systemClient = null;
    this.tenantClients = new Map(); // Cache tenant clients
  }

  initialize() {
    // Initialize system-level OpenAI client (for fallback/testing)
    const systemApiKey = process.env.OPENAI_API_KEY;
    if (systemApiKey) {
      this.systemClient = new OpenAI({ apiKey: systemApiKey });
      logger.info('System OpenAI client initialized');
    } else {
      logger.warn('No system OpenAI API key found - tenant keys required');
    }
  }

  /**
   * Get or create OpenAI client for a tenant
   */
  getClient(tenant) {
    const apiKey = tenant.openaiApiKey || process.env.OPENAI_API_KEY;
    
    if (!apiKey) {
      throw new Error('No OpenAI API key available. Please add your OpenAI API key in settings.');
    }

    // Return cached client if exists
    const cacheKey = `${tenant.tenantId}_${apiKey.slice(-8)}`;
    if (this.tenantClients.has(cacheKey)) {
      return this.tenantClients.get(cacheKey);
    }

    // Create new client
    const client = new OpenAI({ apiKey });
    this.tenantClients.set(cacheKey, client);

    // Limit cache size
    if (this.tenantClients.size > 100) {
      const firstKey = this.tenantClients.keys().next().value;
      this.tenantClients.delete(firstKey);
    }

    logger.info({ tenantId: tenant.tenantId }, 'OpenAI client created for tenant');
    return client;
  }

  /**
   * Generate embedding for a single text
   */
  async generateEmbedding(text, tenant, model = null) {
    try {
      const client = this.getClient(tenant);
      const embeddingModel = model || tenant.embeddingModel || DEFAULT_MODELS.embedding;

      const response = await retryWithBackoff(async () => {
        return await client.embeddings.create({
          model: embeddingModel,
          input: text,
          encoding_format: 'float'
        });
      });

      const embedding = response.data[0].embedding;
      
      logger.info({ 
        tenantId: tenant.tenantId, 
        model: embeddingModel,
        dimensions: embedding.length,
        usage: response.usage.total_tokens
      }, 'Embedding generated');

      return {
        embedding,
        model: embeddingModel,
        tokens: response.usage.total_tokens
      };
    } catch (error) {
      logger.error({ 
        error: error.message, 
        tenantId: tenant.tenantId 
      }, 'Failed to generate embedding');
      throw new Error(`Embedding generation failed: ${error.message}`);
    }
  }

  /**
   * Generate embeddings for multiple texts in batch
   */
  async generateEmbeddings(texts, tenant, model = null) {
    try {
      const client = this.getClient(tenant);
      const embeddingModel = model || tenant.embeddingModel || DEFAULT_MODELS.embedding;

      // OpenAI supports batch embeddings (up to 2048 inputs)
      const response = await retryWithBackoff(async () => {
        return await client.embeddings.create({
          model: embeddingModel,
          input: texts,
          encoding_format: 'float'
        });
      });

      const embeddings = response.data.map(item => item.embedding);
      
      logger.info({ 
        tenantId: tenant.tenantId, 
        model: embeddingModel,
        count: embeddings.length,
        usage: response.usage.total_tokens
      }, 'Batch embeddings generated');

      return {
        embeddings,
        model: embeddingModel,
        tokens: response.usage.total_tokens
      };
    } catch (error) {
      logger.error({ 
        error: error.message, 
        tenantId: tenant.tenantId 
      }, 'Failed to generate batch embeddings');
      throw new Error(`Batch embedding generation failed: ${error.message}`);
    }
  }

  /**
   * Chat completion
   */
  async chatCompletion(messages, tenant, options = {}) {
    try {
      const client = this.getClient(tenant);
      const chatModel = tenant.chatModel || DEFAULT_MODELS.chat;

      const response = await retryWithBackoff(async () => {
        return await client.chat.completions.create({
          model: chatModel,
          messages: messages,
          temperature: options.temperature || 0.7,
          max_tokens: options.maxTokens || tenant.limits.tokensPerRequest,
          top_p: options.topP || 1,
          frequency_penalty: options.frequencyPenalty || 0,
          presence_penalty: options.presencePenalty || 0,
          stream: options.stream || false
        });
      });

      const content = response.choices[0]?.message?.content || "I couldn't generate a response.";
      
      logger.info({ 
        tenantId: tenant.tenantId, 
        model: chatModel,
        promptTokens: response.usage.prompt_tokens,
        completionTokens: response.usage.completion_tokens,
        totalTokens: response.usage.total_tokens
      }, 'Chat completion generated');

      return {
        content,
        model: chatModel,
        usage: response.usage,
        finishReason: response.choices[0].finish_reason
      };
    } catch (error) {
      logger.error({ 
        error: error.message, 
        tenantId: tenant.tenantId 
      }, 'Failed to generate chat completion');
      throw new Error(`Chat completion failed: ${error.message}`);
    }
  }

  /**
   * Validate API key
   */
  async validateApiKey(apiKey) {
    try {
      const client = new OpenAI({ apiKey });
      
      // Simple validation by listing models
      await client.models.list();
      
      return { valid: true };
    } catch (error) {
      logger.error({ error: error.message }, 'API key validation failed');
      return { 
        valid: false, 
        error: error.message 
      };
    }
  }

  /**
   * Get available models
   */
  getAvailableModels() {
    return {
      embedding: Object.values(OPENAI_MODELS.EMBEDDING),
      chat: Object.values(OPENAI_MODELS.CHAT)
    };
  }

  /**
   * Clear cached client for tenant
   */
  clearTenantClient(tenantId) {
    for (const [key, _] of this.tenantClients.entries()) {
      if (key.startsWith(tenantId)) {
        this.tenantClients.delete(key);
      }
    }
  }
}

export default new OpenAIService();
