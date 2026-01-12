import { MongoClient } from 'mongodb';
import pino from 'pino';

const logger = pino();

class MongoDB {
  constructor() {
    this.client = null;
    this.db = null;
  }

  async connect() {
    try {
      const uri = process.env.MONGODB_URI;
      if (!uri) {
        throw new Error('MONGODB_URI is not defined in environment variables');
      }

      this.client = new MongoClient(uri, {
        maxPoolSize: 10,
        minPoolSize: 2,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      });

      await this.client.connect();
      this.db = this.client.db();
      
      logger.info('MongoDB connected successfully');
      
      // Create collections and indexes
      await this.setupCollections();
      
      return this.db;
    } catch (error) {
      logger.error({ error: error.message }, 'MongoDB connection failed');
      throw error;
    }
  }

  async setupCollections() {
    try {
      // Tenants collection
      const tenantsCollection = this.db.collection('tenants');
      await tenantsCollection.createIndex({ email: 1 }, { unique: true });
      await tenantsCollection.createIndex({ tenantId: 1 }, { unique: true });
      await tenantsCollection.createIndex({ 'apiKeys.keyHash': 1 });

      // Sections collection
      const sectionsCollection = this.db.collection('sections');
      await sectionsCollection.createIndex({ tenantId: 1, sectionId: 1 }, { unique: true });
      await sectionsCollection.createIndex({ tenantId: 1 });

      // Chunks collection with vector search
      const chunksCollection = this.db.collection('chunks');
      await chunksCollection.createIndex({ tenantId: 1, sectionId: 1 });
      await chunksCollection.createIndex({ tenantId: 1, chunkId: 1 }, { unique: true });
      
      // Create vector search index (Atlas Search)
      // Note: This must be created manually in Atlas UI or via Atlas API
      // Index definition is documented in the README
      
      // Usage collection
      const usageCollection = this.db.collection('usage');
      await usageCollection.createIndex({ tenantId: 1, timestamp: -1 });
      await usageCollection.createIndex({ tenantId: 1, month: 1 });

      logger.info('MongoDB collections and indexes created');
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to setup collections');
      throw error;
    }
  }

  getDb() {
    if (!this.db) {
      throw new Error('Database not connected');
    }
    return this.db;
  }

  async close() {
    if (this.client) {
      await this.client.close();
      logger.info('MongoDB connection closed');
    }
  }

  async healthCheck() {
    try {
      await this.client.db('admin').command({ ping: 1 });
      return true;
    } catch (error) {
      logger.error({ error: error.message }, 'MongoDB health check failed');
      return false;
    }
  }
}

export default new MongoDB();
