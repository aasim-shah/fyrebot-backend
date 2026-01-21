import openaiService from './openai.service.js';
import vectorSearchService from './vector-search.service.js';
import redis from '../db/redis.js';
import { retryWithBackoff, estimateTokens } from '../utils/helpers.js';
import pino from 'pino';

const logger = pino();

/**
 * Chat Service - Using OpenAI for production-ready chat completions
 */
class ChatService {
  constructor() {
    this.initialized = false;
  }

  initialize() {
    openaiService.initialize();
    this.initialized = true;
    logger.info('Chat service initialized with OpenAI');
  }

  /**
   * Classify query type for intelligent routing
   */
  classifyQuery(query) {
    const queryLower = query.toLowerCase().trim();
    
    // Greetings
    const greetings = ['hi', 'hello', 'hey', 'greetings', 'good morning', 'good afternoon', 'good evening'];
    if (greetings.some(g => queryLower === g || queryLower.startsWith(g + ' ') || queryLower.startsWith(g + ','))) {
      return 'GREETING';
    }
    
    // Simple acknowledgments
    const acknowledgments = ['ok', 'okay', 'thanks', 'thank you', 'got it', 'understood'];
    if (acknowledgments.some(a => queryLower === a)) {
      return 'ACKNOWLEDGMENT';
    }
    
    // Questions about the AI itself
    const metaQuestions = ['who are you', 'what are you', 'what can you do', 'how do you work'];
    if (metaQuestions.some(q => queryLower.includes(q))) {
      return 'META';
    }
    
    // Default to knowledge query (uses RAG)
    return 'KNOWLEDGE';
  }

  /**
   * Build context from search results with token limits
   */
  buildContext(searchResults, maxTokens = 2000) {
    let context = '';
    let estimatedTokens = 0;
    
    for (let i = 0; i < searchResults.length; i++) {
      const result = searchResults[i];
      const chunk = `[${i + 1}] ${result.sectionTitle}: ${result.text}`;
      const chunkTokens = Math.ceil(chunk.length / 4); // Rough estimate
      
      if (estimatedTokens + chunkTokens > maxTokens) {
        break; // Stop adding context if we exceed limit
      }
      
      context += chunk + '\n\n';
      estimatedTokens += chunkTokens;
    }
    
    return context.trim();
  }

  /**
   * Process chat query with RAG
   */
  async processQuery(tenantId, tenant, query, options = {}) {
    try {
      const { sessionId = null, includeMetadata = false } = options;

      // Classify query type
      const queryType = this.classifyQuery(query);

      // Handle non-knowledge queries directly
      if (queryType === 'GREETING') {
        return {
          answer: `Hello! I'm the AI assistant for ${tenant.businessName || tenant.name}. How can I help you today? Feel free to ask me any questions about our products, services, or policies.`,
          confidence: 'high',
          sources: [],
          queryType: 'GREETING'
        };
      }

      if (queryType === 'ACKNOWLEDGMENT') {
        return {
          answer: "You're welcome! Is there anything else I can help you with?",
          confidence: 'high',
          sources: [],
          queryType: 'ACKNOWLEDGMENT'
        };
      }

      if (queryType === 'META') {
        return {
          answer: `I'm an AI assistant trained on ${tenant.businessName || tenant.name}'s knowledge base. I can answer questions about our products, services, policies, and more. What would you like to know?`,
          confidence: 'high',
          sources: [],
          queryType: 'META'
        };
      }

      // For KNOWLEDGE queries, use RAG pipeline with timeout
      const searchStart = Date.now();
      const searchResults = await vectorSearchService.search(tenantId, tenant, query, {
        limit: 3, // Reduced from 5 to 3 for faster responses
        minScore: 0.60 // Lowered from 0.70 for more results
      });
      const searchTime = Date.now() - searchStart;

      if (searchResults.length === 0) {
        return {
          answer: "I don't have enough information in my knowledge base to answer that question accurately. Please provide more context, or feel free to ask about our products, services, or policies.",
          confidence: 'low',
          sources: [],
          queryType: 'KNOWLEDGE'
        };
      }

      // Build context with token limit
      const context = this.buildContext(searchResults, 1500); // Limit context to ~1500 tokens

      // Build messages (keep history short)
      const systemPrompt = this.buildSystemPrompt(tenant.businessName || tenant.name);
      const userPrompt = this.buildUserPrompt(query, context);

      // Get chat history if session exists (limit to last 4 messages)
      let history = sessionId ? await this.getHistory(sessionId) : [];
      history = history.slice(-4); // Keep only last 2 exchanges

      const messages = [
        { role: 'system', content: systemPrompt },
        ...history,
        { role: 'user', content: userPrompt }
      ];

      // Generate response using OpenAI with optimized settings
      const chatStart = Date.now();
      const result = await openaiService.chatCompletion(messages, tenant, {
        maxTokens: Math.min(tenant.limits.tokensPerRequest, 500), // Reduced from 2048
        temperature: 0.7
      });
      const chatTime = Date.now() - chatStart;

      const response = result.content;

      // Save to history if session exists
      if (sessionId) {
        await this.saveToHistory(sessionId, query, response);
      }

      // Determine confidence based on search scores
      const avgScore = searchResults.reduce((sum, r) => sum + r.score, 0) / searchResults.length;
      const confidence = avgScore > 0.80 ? 'high' : avgScore > 0.60 ? 'medium' : 'low';

      const responseData = {
        answer: response,
        confidence,
        sources: searchResults.map(r => ({
          sectionId: r.sectionId,
          title: r.sectionTitle,
          type: r.sectionType,
          score: r.score
        })),
        queryType: 'KNOWLEDGE'
      };

      if (includeMetadata) {
        responseData.metadata = {
          searchResultsCount: searchResults.length,
          averageScore: avgScore,
          tokensUsed: result.usage.total_tokens,
          model: result.model,
          timing: {
            searchMs: searchTime,
            chatMs: chatTime,
            totalMs: searchTime + chatTime
          }
        };
      }

      logger.info({ 
        tenantId, 
        confidence, 
        sourcesCount: searchResults.length,
        tokensUsed: result.usage.total_tokens,
        searchMs: searchTime,
        chatMs: chatTime
      }, 'Chat query processed');

      return responseData;
    } catch (error) {
      logger.error({ error: error.message, tenantId }, 'Failed to process chat query');
      
      // Return user-friendly error
      if (error.message.includes('API key')) {
        throw new Error('OpenAI API key is missing or invalid. Please update your API key in settings.');
      }
      
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
- Be concise, helpful, and professional
- If the context doesn't contain enough information, politely acknowledge the limitation
- Format your responses clearly with proper markdown when appropriate
- For lists, use bullet points or numbered lists
- For comparisons, consider using tables
- Maintain a friendly and professional tone
- Do not make up information that isn't in the context`;
  }

  /**
   * Build user prompt with context
   */
  buildUserPrompt(query, context) {
    return `Context Information:
${context}

User Question: ${query}

Please provide a helpful, well-formatted answer based on the context above.`;
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
