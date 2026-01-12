import mongodb from '../db/mongodb.js';
import embeddingService from './embedding.service.js';
import { generateId, chunkText } from '../utils/helpers.js';
import { CHUNK_CONFIG } from '../utils/constants.js';
import pino from 'pino';

const logger = pino();

class DataService {
  constructor() {
    this.sectionsCollection = null;
    this.chunksCollection = null;
  }

  initialize() {
    const db = mongodb.getDb();
    this.sectionsCollection = db.collection('sections');
    this.chunksCollection = db.collection('chunks');
  }

  /**
   * Register data sections and generate embeddings
   */
  async registerData(tenantId, sections, limits) {
    try {
      // Check section limit
      const currentCount = await this.sectionsCollection.countDocuments({ tenantId });
      
      if (currentCount + sections.length > limits.sectionsPerTenant) {
        throw new Error(
          `Section limit exceeded. Your plan allows ${limits.sectionsPerTenant} sections. ` +
          `Current: ${currentCount}, Attempting to add: ${sections.length}`
        );
      }

      const results = [];
      let totalChunks = 0;

      // Process each section
      for (const section of sections) {
        // Validate content
        if (!section.content || section.content.trim().length === 0) {
          throw new Error(`Section "${section.title}" has empty content`);
        }

        const sectionId = generateId.section();
        
        // Chunk the content
        const chunks = chunkText(
          section.content,
          CHUNK_CONFIG.size,
          CHUNK_CONFIG.overlap
        );

        // Validate chunks
        if (!chunks || chunks.length === 0) {
          throw new Error(`Section "${section.title}" produced no chunks. Content may be too short or invalid.`);
        }

        // Generate embeddings for all chunks
        logger.info({ sectionId, chunkCount: chunks.length }, 'Generating embeddings');
        const embeddings = await embeddingService.generateEmbeddings(chunks);

        // Create section document
        const sectionDoc = {
          tenantId,
          sectionId,
          type: section.type,
          title: section.title,
          content: section.content,
          metadata: section.metadata || {},
          chunkCount: chunks.length,
          status: 'completed',
          createdAt: new Date(),
          updatedAt: new Date()
        };

        await this.sectionsCollection.insertOne(sectionDoc);

        // Create chunk documents with embeddings
        const chunkDocs = chunks.map((text, index) => ({
          tenantId,
          sectionId,
          chunkId: generateId.chunk(),
          sectionType: section.type,
          sectionTitle: section.title,
          text,
          embedding: embeddings[index],
          position: index,
          metadata: section.metadata || {},
          createdAt: new Date()
        }));

        // Only insert if we have chunks
        if (chunkDocs.length > 0) {
          await this.chunksCollection.insertMany(chunkDocs);
        }

        totalChunks += chunks.length;

        results.push({
          sectionId,
          type: section.type,
          title: section.title,
          chunkCount: chunks.length,
          status: 'completed'
        });

        logger.info({ sectionId, chunkCount: chunks.length }, 'Section processed');
      }

      return {
        sectionsCreated: sections.length,
        chunksCreated: totalChunks,
        sections: results
      };
    } catch (error) {
      logger.error({ error: error.message, tenantId }, 'Failed to register data');
      throw error;
    }
  }

  /**
   * List all sections for a tenant
   */
  async listSections(tenantId, skip = 0, limit = 50) {
    try {
      const sections = await this.sectionsCollection
        .find({ tenantId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .project({
          sectionId: 1,
          type: 1,
          title: 1,
          chunkCount: 1,
          status: 1,
          createdAt: 1,
          metadata: 1,
          _id: 0
        })
        .toArray();

      const total = await this.sectionsCollection.countDocuments({ tenantId });

      return {
        sections,
        total,
        skip,
        limit
      };
    } catch (error) {
      logger.error({ error: error.message, tenantId }, 'Failed to list sections');
      throw error;
    }
  }

  /**
   * Get a specific section
   */
  async getSection(tenantId, sectionId) {
    try {
      const section = await this.sectionsCollection.findOne(
        { tenantId, sectionId },
        { projection: { _id: 0 } }
      );

      if (!section) {
        throw new Error('Section not found');
      }

      return section;
    } catch (error) {
      logger.error({ error: error.message, tenantId, sectionId }, 'Failed to get section');
      throw error;
    }
  }

  /**
   * Update a section
   */
  async updateSection(tenantId, sectionId, updates) {
    try {
      const { title, content, metadata } = updates;
      
      // If content is being updated, regenerate embeddings
      if (content) {
        // Validate content
        if (content.trim().length === 0) {
          throw new Error('Content cannot be empty');
        }

        // Delete old chunks
        await this.chunksCollection.deleteMany({ tenantId, sectionId });
        
        // Chunk the new content
        const chunks = chunkText(
          content,
          CHUNK_CONFIG.size,
          CHUNK_CONFIG.overlap
        );

        // Validate chunks
        if (!chunks || chunks.length === 0) {
          throw new Error('Content is too short or invalid to create chunks');
        }

        // Generate new embeddings
        logger.info({ sectionId, chunkCount: chunks.length }, 'Regenerating embeddings');
        const embeddings = await embeddingService.generateEmbeddings(chunks);

        // Get section to preserve type and title
        const section = await this.getSection(tenantId, sectionId);

        // Create new chunk documents
        const chunkDocs = chunks.map((text, index) => ({
          tenantId,
          sectionId,
          chunkId: generateId.chunk(),
          sectionType: section.type,
          sectionTitle: title || section.title,
          text,
          embedding: embeddings[index],
          position: index,
          metadata: metadata || section.metadata || {},
          createdAt: new Date()
        }));

        // Only insert if we have chunks
        if (chunkDocs.length > 0) {
          await this.chunksCollection.insertMany(chunkDocs);
        }

        // Update section with new content and chunk count
        const updateDoc = {
          content,
          chunkCount: chunks.length,
          updatedAt: new Date()
        };
        
        if (title) updateDoc.title = title;
        if (metadata) updateDoc.metadata = metadata;

        await this.sectionsCollection.updateOne(
          { tenantId, sectionId },
          { $set: updateDoc }
        );
      } else {
        // Only update metadata/title without regenerating embeddings
        const updateDoc = { updatedAt: new Date() };
        if (title) updateDoc.title = title;
        if (metadata) updateDoc.metadata = metadata;

        await this.sectionsCollection.updateOne(
          { tenantId, sectionId },
          { $set: updateDoc }
        );
      }

      return await this.getSection(tenantId, sectionId);
    } catch (error) {
      logger.error({ error: error.message, tenantId, sectionId }, 'Failed to update section');
      throw error;
    }
  }

  /**
   * Get sections by type
   */
  async getSectionsByType(tenantId, type) {
    try {
      const sections = await this.sectionsCollection
        .find({ tenantId, type })
        .sort({ createdAt: -1 })
        .project({
          sectionId: 1,
          title: 1,
          chunkCount: 1,
          createdAt: 1,
          _id: 0
        })
        .toArray();

      return sections;
    } catch (error) {
      logger.error({ error: error.message, tenantId, type }, 'Failed to get sections by type');
      throw error;
    }
  }

  /**
   * Delete a section and its chunks
   */
  async deleteSection(tenantId, sectionId) {
    try {
      // Delete chunks first
      const chunksResult = await this.chunksCollection.deleteMany({ tenantId, sectionId });
      
      // Delete section
      const sectionResult = await this.sectionsCollection.deleteOne({ tenantId, sectionId });

      if (sectionResult.deletedCount === 0) {
        throw new Error('Section not found');
      }

      logger.info({ tenantId, sectionId, chunksDeleted: chunksResult.deletedCount }, 'Section deleted');

      return {
        sectionId,
        chunksDeleted: chunksResult.deletedCount
      };
    } catch (error) {
      logger.error({ error: error.message, tenantId, sectionId }, 'Failed to delete section');
      throw error;
    }
  }

  /**
   * Get statistics for a tenant
   */
  async getStats(tenantId) {
    try {
      const totalSections = await this.sectionsCollection.countDocuments({ tenantId });
      const totalChunks = await this.chunksCollection.countDocuments({ tenantId });

      const sectionsByType = await this.sectionsCollection.aggregate([
        { $match: { tenantId } },
        { $group: { _id: '$type', count: { $sum: 1 } } }
      ]).toArray();

      return {
        totalSections,
        totalChunks,
        sectionsByType: sectionsByType.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {})
      };
    } catch (error) {
      logger.error({ error: error.message, tenantId }, 'Failed to get stats');
      throw error;
    }
  }
}

export default new DataService();
