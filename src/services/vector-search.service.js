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

      // Generate embedding for query - PASS TENANT
      const queryEmbedding = await embeddingService.generateEmbedding(queryText, tenant);

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
   */
  async fallbackTextSearch(tenantId, queryText, options = {}) {
    try {
      const { limit = VECTOR_SEARCH.limit, sectionType = null } = options;

      logger.info({ tenantId, queryText }, 'Using fallback text search');

      // Build query for simple text matching
      const query = { tenantId };
      if (sectionType) {
        query.sectionType = sectionType;
      }

      // Try text search first if index exists
      try {
        const textQuery = { 
          ...query,
          $text: { $search: queryText }
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
      const keywords = queryText.toLowerCase().split(/\s+/).filter(k => k.length > 2);
      const regexPattern = keywords.map(k => `(?=.*${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`).join('');
      
      const results = await this.chunksCollection
        .find({
          ...query,
          $or: [
            { text: { $regex: regexPattern, $options: 'i' } },
            { sectionTitle: { $regex: regexPattern, $options: 'i' } },
            ...keywords.map(keyword => ({
              text: { $regex: keyword, $options: 'i' }
            }))
          ]
        })
        .limit(limit * 2)
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
        
        keywords.forEach(keyword => {
          const matches = (textLower.match(new RegExp(keyword, 'gi')) || []).length;
          score += matches * 0.15; // Each match adds to score
        });
        
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
