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
  async search(tenantId, queryText, options = {}) {
    try {
      const {
        limit = VECTOR_SEARCH.limit,
        minScore = VECTOR_SEARCH.similarityThreshold,
        sectionType = null
      } = options;

      // Generate embedding for query
      const queryEmbedding = await embeddingService.generateEmbedding(queryText);

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
            limit: limit * 2,
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
          $limit: limit
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

      return results;
    } catch (error) {
      logger.error({ error: error.message, tenantId }, 'Vector search failed');
      
      // Fallback to simple text search if vector search fails
      logger.info('Falling back to text search');
      return await this.fallbackTextSearch(tenantId, queryText, options);
    }
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

      // Sort by score and return top results
      const sortedResults = scoredResults
        .filter(r => r.score > 0.1) // Minimum relevance threshold
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
