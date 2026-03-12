import mongodb from '../db/mongodb.js';
import embeddingService from './embedding.service.js';
import { VECTOR_SEARCH } from '../utils/constants.js';
import pino from 'pino';

const logger = pino();

class VectorSearchService {
  constructor() {
    this.chunksCollection = null;
  }

  initialize() {
    this.chunksCollection = mongodb.getDb().collection('chunks');
  }

  /**
   * Expand query for better matching
   * For "who is X" queries, also search for "X", "about X", etc.
   * For technology questions, add synonyms and related terms
   */
  expandQuery(queryText) {
    const queryLower = queryText.toLowerCase().trim();
    
    // Technology synonym mapping - expands tech names to include related terms
    const techSynonyms = {
      'react': ['react', 'react.js', 'reactjs', 'frontend', 'mern'],
      'docker': ['docker', 'containerization', 'container', 'devops'],
      'node': ['node', 'node.js', 'nodejs', 'backend', 'mern'],
      'mongodb': ['mongodb', 'mongo', 'database', 'nosql', 'mern'],
      'express': ['express', 'express.js', 'expressjs', 'backend', 'api', 'mern'],
      'aws': ['aws', 'amazon web services', 'cloud', 'ec2', 's3'],
      'flutter': ['flutter', 'mobile', 'ios', 'android', 'dart'],
      'graphql': ['graphql', 'api', 'query language'],
      'typescript': ['typescript', 'ts', 'javascript', 'typed'],
      'next': ['next', 'next.js', 'nextjs', 'react', 'ssr'],
      'kubernetes': ['kubernetes', 'k8s', 'container orchestration', 'devops'],
      'redis': ['redis', 'cache', 'in-memory', 'database']
    };
    
    // Check for technology questions (Does X know Y?, Is X familiar with Y?)
    const techQuestionMatch = queryLower.match(/(?:does|do|is|can)\s+(?:\w+\s+)?(?:know|familiar|experienced|work\s+with|use)\s+(.+?)(?:\?|$)/i);
    if (techQuestionMatch) {
      const tech = techQuestionMatch[1].trim();
      // Check if we have synonyms for this technology
      for (const [key, synonyms] of Object.entries(techSynonyms)) {
        if (tech.includes(key)) {
          return `${queryText} ${synonyms.join(' ')} skills technologies tech stack expertise`;
        }
      }
      // Generic expansion if no specific synonym found
      return `${queryText} ${tech} skills technologies expertise proficient experienced`;
    }
    
    // Extract entity name from "who is" questions
    const whoIsMatch = queryLower.match(/who\s+(?:is|are)\s+(.+?)(?:\?|$)/);
    if (whoIsMatch) {
      const entityName = whoIsMatch[1].trim();
      return `${queryText} ${entityName} about ${entityName} introduction ${entityName}`;
    }
    
    // Extract entity from "tell me about" questions
    const tellMeMatch = queryLower.match(/tell\s+me\s+(?:about|regarding)\s+(.+?)(?:\?|$)/);
    if (tellMeMatch) {
      const entityName = tellMeMatch[1].trim();
      return `${queryText} ${entityName} about ${entityName} introduction ${entityName}`;
    }
    
    // Extract entity from "what is" questions
    const whatIsMatch = queryLower.match(/what\s+(?:is|are)\s+(.+?)(?:\?|$)/);
    if (whatIsMatch) {
      const entityName = whatIsMatch[1].trim();
      return `${queryText} ${entityName} about ${entityName}`;
    }
    
    return queryText;
  }

  /**
   * Perform vector similarity search
   * Note: Requires Atlas Search vector index named 'vector_index'
   */
  async search(tenantId, tenant, queryText, options = {}) {
    try {
      const {
        limit = VECTOR_SEARCH.limit,
        minScore = VECTOR_SEARCH.similarityThreshold,
        sectionType = null
      } = options;

      // Expand query for better matching
      const expandedQuery = this.expandQuery(queryText);
      logger.debug({ original: queryText, expanded: expandedQuery }, 'Query expansion');

      // Generate embedding for query - PASS TENANT
      const queryEmbedding = await embeddingService.generateEmbedding(expandedQuery, tenant);

      // Build match filter for tenant isolation
      const matchFilter = { tenantId };
      if (sectionType) {
        matchFilter.sectionType = sectionType;
      }

      // Perform vector search using MongoDB Atlas Search
      const results = await this.chunksCollection.aggregate([
        {
          $vectorSearch: {
            index: 'vector_index',
            path: 'embedding',
            queryVector: queryEmbedding,
            numCandidates: VECTOR_SEARCH.numCandidates,
            limit: limit * 3, // Increased from limit * 2 to get more candidates for re-ranking
            filter: matchFilter
          }
        },
        {
          $addFields: {
            score: { $meta: 'vectorSearchScore' }
          }
        },
        {
          $match: {
            score: { $gte: minScore }
          }
        },
        {
          $project: {
            chunkId: 1,
            sectionId: 1,
            sectionType: 1,
            sectionTitle: 1,
            text: 1,
            metadata: 1,
            score: 1,
            _id: 0
          }
        }
      ]).toArray();

      logger.info({ 
        tenantId, 
        resultsCount: results.length,
        minScore 
      }, 'Vector search completed');

      // If vector search returns 0 results, fall back to text search
      if (results.length === 0) {
        logger.info('Vector search returned 0 results, falling back to text search');
        return await this.fallbackTextSearch(tenantId, queryText, options);
      }

      // Apply intelligent re-ranking based on query and file names
      const rerankedResults = this.reRankResults(results, queryText);
      
      // Return top results after re-ranking
      return rerankedResults.slice(0, limit);
    } catch (error) {
      logger.error({ error: error.message, tenantId }, 'Vector search failed');
      
      // Fallback to simple text search if vector search fails
      logger.info('Falling back to text search');
      return await this.fallbackTextSearch(tenantId, queryText, options);
    }
  }

  /**
   * Re-rank search results based on query-to-filename relevance
   * Boosts results where the filename/title matches the query topic
   */
  reRankResults(results, queryText) {
    const queryLower = queryText.toLowerCase();
    
    // Define topic keywords and their associated file patterns
    const topicBoosts = [
      {
        keywords: ['who is', 'who are', 'about', 'introduction', 'tell me about'],
        filePatterns: ['introduction', 'intro', 'about', 'overview', 'profile', '01_intro', '00_intro'],
        boost: 0.40
      },
      {
        keywords: ['work experience', 'job history', 'employment', 'career', 'professional background'],
        filePatterns: ['work_experience', 'work experience', 'employment', 'career', '11_work'],
        boost: 0.35
      },
      {
        keywords: ['pricing', 'payment', 'cost', 'price', 'fee'],
        filePatterns: ['pricing', 'payment', 'cost', '05_pricing'],
        boost: 0.30
      },
      {
        keywords: ['portfolio', 'project', 'case study', 'work samples'],
        filePatterns: ['portfolio', 'project', '06_portfolio'],
        boost: 0.30
      },
      {
        keywords: ['contact', 'booking', 'schedule', 'appointment'],
        filePatterns: ['contact', 'booking', '07_contact'],
        boost: 0.30
      },
      {
        keywords: ['technology', 'tech stack', 'framework', 'tools'],
        filePatterns: ['technology', 'tech', 'stack', '08_technology'],
        boost: 0.30
      },
      {
        keywords: ['policy', 'terms', 'conditions', 'legal'],
        filePatterns: ['policy', 'terms', 'conditions', '09_policies'],
        boost: 0.30
      },
      {
        keywords: ['faq', 'question', 'help', 'troubleshoot'],
        filePatterns: ['faq', 'troubleshoot', '10_faqs'],
        boost: 0.30
      }
    ];
    
    const scoredResults = results.map(result => {
      let boostScore = 0;
      const titleLower = result.sectionTitle.toLowerCase();
      
      // Check if query matches any topic and if the file is relevant to that topic
      for (const topic of topicBoosts) {
        const queryMatchesTopic = topic.keywords.some(kw => queryLower.includes(kw));
        const fileMatchesTopic = topic.filePatterns.some(pattern => titleLower.includes(pattern));
        
        if (queryMatchesTopic && fileMatchesTopic) {
          boostScore = topic.boost;
          logger.debug({ 
            title: result.sectionTitle, 
            boost: boostScore,
            reason: 'topic-file match'
          }, 'Boosting result');
          break;
        }
      }
      
      // Apply boost to the score
      const finalScore = Math.min(result.score + boostScore, 1.0);
      
      return {
        ...result,
        score: finalScore,
        originalScore: result.score,
        boosted: boostScore > 0
      };
    });
    
    // Sort by final score
    const sortedResults = scoredResults.sort((a, b) => b.score - a.score);
    
    logger.info({ 
      totalResults: sortedResults.length,
      boostedCount: sortedResults.filter(r => r.boosted).length
    }, 'Re-ranking completed');
    
    return sortedResults;
  }

  /**
   * Fallback text search if vector search is not available
   * Uses expanded query for better keyword matching
   */
  async fallbackTextSearch(tenantId, queryText, options = {}) {
    try {
      const { limit = VECTOR_SEARCH.limit, sectionType = null } = options;

      logger.info({ tenantId, queryText }, 'Using fallback text search');
      
      // Use expanded query for better keyword matching
      const expandedQuery = this.expandQuery(queryText);
      logger.debug({ original: queryText, expanded: expandedQuery }, 'Expanded query for text search');

      // Build query for simple text matching
      const query = { tenantId };
      if (sectionType) {
        query.sectionType = sectionType;
      }

      // Try text search first if index exists
      try {
        const textQuery = { 
          ...query,
          $text: { $search: expandedQuery }
        };

        const results = await this.chunksCollection
          .find(textQuery)
          .limit(limit)
          .project({
            chunkId: 1,
            sectionId: 1,
            sectionType: 1,
            sectionTitle: 1,
            text: 1,
            metadata: 1,
            score: { $meta: 'textScore' },
            _id: 0
          })
          .sort({ score: { $meta: 'textScore' } })
          .toArray();

        if (results.length > 0) {
          logger.info({ resultsCount: results.length }, 'Text search successful');
          return results;
        }
      } catch (textSearchError) {
        logger.debug('Text search index not available, using regex search');
      }

      // Fallback to regex search (works without any indexes)
      // Use expanded query to extract more keywords
      const keywords = expandedQuery.toLowerCase().split(/\s+/).filter(k => k.length > 2);
      
      // Extract entity name for better matching (e.g., "Aasim Shah" from "who is Aasim Shah")
      let entityKeywords = [];
      const whoIsMatch = queryText.toLowerCase().match(/who\s+(?:is|are)\s+(.+?)(?:\?|$)/);
      if (whoIsMatch) {
        const entityName = whoIsMatch[1].trim();
        entityKeywords = entityName.split(/\s+/).filter(k => k.length > 2);
        logger.info({ entityName, entityKeywords }, 'Extracted entity from query');
      }
      
      // Combine keywords with entity keywords for better matching
      const allKeywords = [...new Set([...keywords, ...entityKeywords])];
      const regexPattern = allKeywords.map(k => `(?=.*${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`).join('');
      
      const results = await this.chunksCollection
        .find({
          ...query,
          $or: [
            { text: { $regex: regexPattern, $options: 'i' } },
            { sectionTitle: { $regex: regexPattern, $options: 'i' } },
            ...allKeywords.map(keyword => ({
              text: { $regex: keyword, $options: 'i' }
            })),
            // Boost introduction/about sections
            { sectionTitle: { $regex: 'introduction|intro|about|overview', $options: 'i' } }
          ]
        })
        .limit(limit * 3)
        .project({
          chunkId: 1,
          sectionId: 1,
          sectionType: 1,
          sectionTitle: 1,
          text: 1,
          metadata: 1,
          _id: 0
        })
        .toArray();

      // Calculate simple relevance score based on keyword matches
      const scoredResults = results.map(result => {
        const textLower = (result.text + ' ' + result.sectionTitle).toLowerCase();
        let score = 0;
        
        // Score based on all keywords
        allKeywords.forEach(keyword => {
          const matches = (textLower.match(new RegExp(keyword, 'gi')) || []).length;
          score += matches * 0.15; // Each match adds to score
        });
        
        // Bonus for entity keywords (more important)
        entityKeywords.forEach(keyword => {
          const matches = (textLower.match(new RegExp(keyword, 'gi')) || []).length;
          score += matches * 0.10; // Additional bonus for entity name matches
        });
        
        // Bonus for introduction/about sections
        if (/introduction|intro|about|overview|profile/i.test(result.sectionTitle)) {
          score += 0.25;
        }
        
        // Normalize score to 0-1 range
        score = Math.min(score, 1.0);
        
        return { ...result, score };
      });

      // Sort by score and return top results - lowered threshold from 0.1 to 0.05
      const sortedResults = scoredResults
        .filter(r => r.score > 0.05) // Lower minimum relevance threshold for better recall
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

      logger.info({ 
        resultsCount: sortedResults.length,
        method: 'regex' 
      }, 'Regex search completed');

      return sortedResults;
    } catch (error) {
      logger.error({ error: error.message, tenantId }, 'Fallback text search failed');
      return [];
    }
  }

  /**
   * Get all chunks from a specific section
   */
  async getChunksBySection(tenantId, sectionId) {
    try {
      const chunks = await this.chunksCollection
        .find({ tenantId, sectionId })
        .sort({ position: 1 })
        .project({
          chunkId: 1,
          text: 1,
          position: 1,
          _id: 0
        })
        .toArray();

      return chunks;
    } catch (error) {
      logger.error({ error: error.message, tenantId, sectionId }, 'Failed to get chunks by section');
      throw error;
    }
  }
}

export default new VectorSearchService();
