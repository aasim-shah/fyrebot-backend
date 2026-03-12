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
    
    // Pricing and billing queries
    const pricingQueries = ['price', 'pricing', 'cost', 'how much', 'subscription', 'plan', 'billing', 'payment', 'refund', 'cancel subscription', 'upgrade', 'downgrade'];
    if (pricingQueries.some(q => queryLower.includes(q))) {
      return 'PRICING';
    }
    
    // Features and capabilities
    const featureQueries = ['feature', 'can i', 'does it support', 'is there a way', 'how to use', 'capability', 'functionality'];
    if (featureQueries.some(q => queryLower.includes(q))) {
      return 'FEATURES';
    }
    
    // Account and profile management
    const accountQueries = ['account', 'profile', 'login', 'sign in', 'sign up', 'register', 'password', 'reset password', 'forgot password', 'email', 'change email', 'delete account'];
    if (accountQueries.some(q => queryLower.includes(q))) {
      return 'ACCOUNT';
    }
    
    // Troubleshooting and errors
    const troubleshootingQueries = ['not working', 'broken', 'error', 'issue', 'problem', 'bug', 'crash', 'freeze', 'stuck', 'won\'t load', 'can\'t connect', 'failed'];
    if (troubleshootingQueries.some(q => queryLower.includes(q))) {
      return 'TROUBLESHOOTING';
    }
    
    // VPN specific queries
    const vpnQueries = ['vpn', 'connect to server', 'server location', 'connection speed', 'disconnect', 'ip address', 'encryption', 'protocol', 'kill switch', 'dns leak'];
    if (vpnQueries.some(q => queryLower.includes(q))) {
      return 'VPN';
    }
    
    // GPS/Location specific queries
    const gpsQueries = ['gps', 'location', 'navigation', 'directions', 'route', 'map', 'coordinates', 'tracking', 'find location', 'nearest', 'distance', 'eta'];
    if (gpsQueries.some(q => queryLower.includes(q))) {
      return 'GPS_LOCATION';
    }
    
    // Security and privacy
    const securityQueries = ['security', 'privacy', 'safe', 'secure', 'data protection', 'encryption', 'two factor', '2fa', 'authentication', 'permissions'];
    if (securityQueries.some(q => queryLower.includes(q))) {
      return 'SECURITY';
    }
    
    // Installation and setup
    const setupQueries = ['install', 'setup', 'configure', 'get started', 'download', 'requirements', 'compatibility', 'system requirements'];
    if (setupQueries.some(q => queryLower.includes(q))) {
      return 'SETUP';
    }
    
    // Device and platform compatibility
    const compatibilityQueries = ['device', 'platform', 'ios', 'android', 'windows', 'mac', 'linux', 'browser', 'version', 'compatible'];
    if (compatibilityQueries.some(q => queryLower.includes(q))) {
      return 'COMPATIBILITY';
    }
    
    // Performance and speed
    const performanceQueries = ['slow', 'speed', 'performance', 'lag', 'latency', 'optimize', 'improve performance', 'faster'];
    if (performanceQueries.some(q => queryLower.includes(q))) {
      return 'PERFORMANCE';
    }
    
    // Contact and support
    const supportQueries = ['contact', 'support', 'help', 'customer service', 'reach out', 'speak to someone', 'live chat', 'phone number', 'email support'];
    if (supportQueries.some(q => queryLower.includes(q))) {
      return 'SUPPORT';
    }
    
    // Updates and changelog
    const updateQueries = ['update', 'new version', 'latest version', 'changelog', 'what\'s new', 'release notes'];
    if (updateQueries.some(q => queryLower.includes(q))) {
      return 'UPDATES';
    }
    
    // Work experience queries - needs more results
    const workQueries = ['work experience', 'job history', 'employment', 'career', 'previous work', 'work background', 'professional background', 'worked before', 'worked at', 'companies worked', 'job', 'position'];
    if (workQueries.some(q => queryLower.includes(q))) {
      return 'WORK_EXPERIENCE';
    }
    
    // Skills and technology queries - needs comprehensive search
    const skillQueries = ['know', 'familiar with', 'experience with', 'skills', 'technologies', 'tech stack', 'expertise', 'proficient', 'can you', 'do you know', 'does he know', 'does she know'];
    if (skillQueries.some(q => queryLower.includes(q))) {
      return 'SKILLS_TECH';
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

      // Determine search parameters based on query type
      let searchLimit = 3;
      let minScore = 0.50; // Lowered from 0.60 for better recall
      let maxContextTokens = 1500;
      
      if (queryType === 'WORK_EXPERIENCE') {
        searchLimit = 6; // Get more results for work experience
        minScore = 0.45; // Lower threshold for work experience
        maxContextTokens = 2500; // More context for comprehensive answers
      } else if (queryType === 'SKILLS_TECH') {
        searchLimit = 5; // Get more results for skills/tech queries
        minScore = 0.40; // Lower threshold to catch all relevant mentions
        maxContextTokens = 2000; // Enough context for skill lists
      }

      // For KNOWLEDGE queries, use RAG pipeline with timeout
      const searchStart = Date.now();
      const searchResults = await vectorSearchService.search(tenantId, tenant, query, {
        limit: searchLimit,
        minScore: minScore
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
      const context = this.buildContext(searchResults, maxContextTokens);

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
      const maxResponseTokens = queryType === 'WORK_EXPERIENCE' ? 800 : (queryType === 'SKILLS_TECH' ? 600 : 500);
      const result = await openaiService.chatCompletion(messages, tenant, {
        maxTokens: Math.min(tenant.limits.tokensPerRequest, maxResponseTokens),
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
      const confidence = avgScore > 0.75 ? 'high' : avgScore > 0.50 ? 'medium' : 'low';

      const responseData = {
        answer: response,
        confidence,
        sources: searchResults.map(r => ({
          sectionId: r.sectionId,
          title: r.sectionTitle,
          type: r.sectionType,
          score: r.score
        })),
        queryType: queryType === 'WORK_EXPERIENCE' ? 'KNOWLEDGE' : queryType
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
        chatMs: chatTime,
        queryType
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
- Answer questions using the information provided in the context below
- Be concise, helpful, and professional
- **IMPORTANT**: If the context contains ANY related information that can answer the question, use it - don't be overly strict about exact keyword matches
- For skill/technology questions (e.g., "Does X know React?"): Look for mentions in skill lists, tech stacks, technologies, frameworks, tools, or project descriptions - if the technology is listed ANYWHERE in the context, the answer is YES
- For work history questions (e.g., "Where did X work?"): Look for company names, job titles, employment dates, positions, or any career information
- For experience questions: Check skills sections, project descriptions, or any mention of the topic
- If the context has general information about a topic, provide that information even if it doesn't match the exact question wording
- Be smart about extracting information - if someone asks "Does X know React?" and you see "MERN Stack Developer" or "React.js" anywhere in the context, that's a YES
- If the context is completely unrelated or truly has no relevant information, acknowledge that you don't have specific information
- Format your responses clearly with proper markdown when appropriate
- For lists, use bullet points or numbered lists
- Maintain a friendly and professional tone`;
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
