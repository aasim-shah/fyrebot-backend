import Groq from 'groq-sdk';
import vectorSearchService from './vector-search.service.js';
import redis from '../db/redis.js';
import { retryWithBackoff, estimateTokens } from '../utils/helpers.js';
import pino from 'pino';

const logger = pino();

class ChatService {
  constructor() {
    this.groq = null;
  }

  initialize() {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new Error('GROQ_API_KEY is not defined');
    }

    this.groq = new Groq({ apiKey });
    logger.info('Using Groq for chat completion');
  }

  /**
   * Process chat query with RAG
   */
  async processQuery(tenantId, tenant, query, options = {}) {
    try {
      const { sessionId = null, includeMetadata = false } = options;

      // Perform vector search to get relevant context
      const searchResults = await vectorSearchService.search(tenantId, query, {
        limit: 5,
        minScore: 0.70
      });

      if (searchResults.length === 0) {
        return {
          answer: "I don't have enough information to answer that question. Please provide more context or rephrase your question.",
          confidence: 'low',
          sources: []
        };
      }

      // Build context from search results
      const context = searchResults
        .map((result, idx) => `[${idx + 1}] ${result.sectionTitle}: ${result.text}`)
        .join('\n\n');

      // Build prompt
      const systemPrompt = this.buildSystemPrompt(tenant.businessName);
      const userPrompt = this.buildUserPrompt(query, context);

      // Get chat history if session exists
      const history = sessionId ? await this.getHistory(sessionId) : [];

      // Build messages array for Groq
      const messages = [
        { role: 'system', content: systemPrompt },
        ...history,
        { role: 'user', content: userPrompt }
      ];

      // Generate response using Groq
      const result = await retryWithBackoff(async () => {
        return await this.groq.chat.completions.create({
          model: process.env.CHAT_MODEL || 'llama-3.3-70b-versatile',
          messages: messages,
          max_tokens: Math.min(tenant.limits.tokensPerRequest, 2048),
          temperature: 0.7,
        });
      });

      const response = result.choices[0]?.message?.content || "I couldn't generate a response.";

      // Save to history if session exists
      if (sessionId) {
        await this.saveToHistory(sessionId, query, response);
      }

      // Determine confidence based on search scores
      const avgScore = searchResults.reduce((sum, r) => sum + r.score, 0) / searchResults.length;
      const confidence = avgScore > 0.85 ? 'high' : avgScore > 0.70 ? 'medium' : 'low';

      const responseData = {
        answer: response,
        confidence,
        sources: searchResults.map(r => ({
          sectionId: r.sectionId,
          title: r.sectionTitle,
          type: r.sectionType,
          score: r.score
        }))
      };

      if (includeMetadata) {
        responseData.metadata = {
          searchResultsCount: searchResults.length,
          averageScore: avgScore,
          tokensUsed: estimateTokens(context + query + response)
        };
      }

      logger.info({ tenantId, confidence, sourcesCount: searchResults.length }, 'Chat query processed');

      return responseData;
    } catch (error) {
      logger.error({ error: error.message, tenantId }, 'Failed to process chat query');
      throw error;
    }
  }

  /**
   * Build system prompt
   */
  buildSystemPrompt(businessName) {
    return `You are a helpful AI assistant for ${businessName}. 
Your role is to answer customer questions accurately based on the provided context.

Guidelines:
- Answer questions using ONLY the information provided in the context
- Be concise and helpful
- If the context doesn't contain enough information, acknowledge the limitation
- Maintain a professional and friendly tone
- Do not make up information that isn't in the context`;
  }

  /**
   * Build user prompt with context
   */
  buildUserPrompt(query, context) {
    return `Context Information:
${context}

User Question: ${query}

Please provide a helpful answer based on the context above.`;
  }

  /**
   * Get conversation history
   */
  async getHistory(sessionId) {
    try {
      const historyKey = `session:${sessionId}`;
      const historyData = await redis.get(historyKey);
      
      if (!historyData) {
        return [];
      }

      return JSON.parse(historyData);
    } catch (error) {
      logger.error({ error: error.message, sessionId }, 'Failed to get history');
      return [];
    }
  }

  /**
   * Save to conversation history
   */
  async saveToHistory(sessionId, query, response) {
    try {
      const historyKey = `session:${sessionId}`;
      const history = await this.getHistory(sessionId);

      history.push(
        { role: 'user', content: query },
        { role: 'assistant', content: response }
      );

      // Keep only last 10 exchanges (20 messages)
      const trimmedHistory = history.slice(-20);

      await redis.set(historyKey, JSON.stringify(trimmedHistory), 3600); // 1 hour TTL

      logger.info({ sessionId, historyLength: trimmedHistory.length }, 'History saved');
    } catch (error) {
      logger.error({ error: error.message, sessionId }, 'Failed to save history');
    }
  }

  /**
   * Clear session history
   */
  async clearHistory(sessionId) {
    try {
      const historyKey = `session:${sessionId}`;
      await redis.del(historyKey);
      logger.info({ sessionId }, 'History cleared');
    } catch (error) {
      logger.error({ error: error.message, sessionId }, 'Failed to clear history');
    }
  }
}

export default new ChatService();
