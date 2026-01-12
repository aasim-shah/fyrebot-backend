import mongodb from '../db/mongodb.js';
import redis from '../db/redis.js';
import { generateId, hashApiKey, hashPassword, comparePassword, generateToken } from '../utils/helpers.js';
import { PLANS, CACHE_TTL } from '../utils/constants.js';
import pino from 'pino';

const logger = pino();

class TenantService {
  constructor() {
    this.collection = null;
  }

  initialize() {
    this.collection = mongodb.getDb().collection('tenants');
    // Create indexes
    this.collection.createIndex({ email: 1 }, { unique: true });
    this.collection.createIndex({ tenantId: 1 }, { unique: true });
  }

  /**
   * Register a new tenant with password
   */
  async register({ name, email, password, businessName, plan = 'free', metadata = {} }) {
    try {
      const tenantId = generateId.tenant();
      const apiKey = generateId.apiKey();
      const keyHash = hashApiKey(apiKey);
      const passwordHash = hashPassword(password);

      const tenant = {
        tenantId,
        name,
        email: email.toLowerCase(),
        passwordHash,
        businessName: businessName || name,
        plan,
        limits: PLANS[plan.toUpperCase()].limits,
        apiKeys: [{
          keyHash,
          name: 'Default Key',
          createdAt: new Date(),
          lastUsed: null
        }],
        metadata,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await this.collection.insertOne(tenant);
      
      // Generate JWT token
      const token = generateToken({ 
        tenantId, 
        email: tenant.email,
        plan: tenant.plan 
      });

      logger.info({ tenantId, email }, 'Tenant registered');

      return {
        tenant: {
          tenantId,
          name,
          email,
          businessName: tenant.businessName,
          plan,
          limits: tenant.limits
        },
        token,
        apiKey // Return API key only once for API-to-API usage
      };
    } catch (error) {
      if (error.code === 11000) {
        throw new Error('Email already registered');
      }
      logger.error({ error: error.message }, 'Failed to register tenant');
      throw error;
    }
  }

  /**
   * Login with email and password
   */
  async login(email, password) {
    try {
      const tenant = await this.collection.findOne({ 
        email: email.toLowerCase(), 
        status: 'active' 
      });

      if (!tenant) {
        throw new Error('Invalid email or password');
      }

      // Verify password
      const isValidPassword = comparePassword(password, tenant.passwordHash);
      
      if (!isValidPassword) {
        throw new Error('Invalid email or password');
      }

      // Generate JWT token
      const token = generateToken({ 
        tenantId: tenant.tenantId, 
        email: tenant.email,
        plan: tenant.plan 
      });

      logger.info({ tenantId: tenant.tenantId, email }, 'Tenant logged in');

      return {
        tenant: {
          tenantId: tenant.tenantId,
          name: tenant.name,
          email: tenant.email,
          businessName: tenant.businessName,
          plan: tenant.plan,
          limits: tenant.limits
        },
        token
      };
    } catch (error) {
      logger.error({ error: error.message, email }, 'Login failed');
      throw error;
    }
  }

  /**
   * Get tenant by ID
   */
  async getTenant(tenantId) {
    try {
      // Check cache first
      const cacheKey = `tenant:${tenantId}`;
      const cached = await redis.get(cacheKey);
      
      if (cached) {
        return JSON.parse(cached);
      }

      const tenant = await this.collection.findOne({ tenantId, status: 'active' });
      
      if (!tenant) {
        throw new Error('Tenant not found');
      }

      // Cache for 1 hour
      await redis.set(cacheKey, JSON.stringify(tenant), CACHE_TTL.tenant);
      
      return tenant;
    } catch (error) {
      logger.error({ error: error.message, tenantId }, 'Failed to get tenant');
      throw error;
    }
  }

  /**
   * Get tenant by API key
   */
  async getTenantByApiKey(apiKey) {
    try {
      const keyHash = hashApiKey(apiKey);
      
      // Check cache
      const cacheKey = `apikey:${keyHash}`;
      const cachedTenantId = await redis.get(cacheKey);
      
      if (cachedTenantId) {
        return await this.getTenant(cachedTenantId);
      }

      const tenant = await this.collection.findOne(
        { 'apiKeys.keyHash': keyHash, status: 'active' },
        { projection: { 'apiKeys.$': 1, tenantId: 1, email: 1, businessName: 1, plan: 1, limits: 1 } }
      );

      if (!tenant) {
        throw new Error('Invalid API key');
      }

      // Update last used
      await this.collection.updateOne(
        { tenantId: tenant.tenantId, 'apiKeys.keyHash': keyHash },
        { $set: { 'apiKeys.$.lastUsed': new Date() } }
      );

      // Cache API key to tenant mapping
      await redis.set(cacheKey, tenant.tenantId, CACHE_TTL.apiKey);

      return tenant;
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to validate API key');
      throw error;
    }
  }

  /**
   * Update tenant settings
   */
  async updateTenant(tenantId, updates) {
    try {
      const result = await this.collection.updateOne(
        { tenantId, status: 'active' },
        { 
          $set: { 
            ...updates,
            updatedAt: new Date()
          }
        }
      );

      if (result.matchedCount === 0) {
        throw new Error('Tenant not found');
      }

      // Invalidate cache
      await redis.del(`tenant:${tenantId}`);

      logger.info({ tenantId }, 'Tenant updated');
      
      return await this.getTenant(tenantId);
    } catch (error) {
      logger.error({ error: error.message, tenantId }, 'Failed to update tenant');
      throw error;
    }
  }

  /**
   * Change subscription plan
   */
  async changePlan(tenantId, newPlan) {
    try {
      const planConfig = PLANS[newPlan.toUpperCase()];
      if (!planConfig) {
        throw new Error('Invalid plan');
      }

      await this.collection.updateOne(
        { tenantId, status: 'active' },
        { 
          $set: { 
            plan: newPlan,
            limits: planConfig.limits,
            updatedAt: new Date()
          }
        }
      );

      // Invalidate cache
      await redis.del(`tenant:${tenantId}`);

      logger.info({ tenantId, newPlan }, 'Plan changed');
      
      return await this.getTenant(tenantId);
    } catch (error) {
      logger.error({ error: error.message, tenantId }, 'Failed to change plan');
      throw error;
    }
  }

  /**
   * Create new API key
   */
  async createApiKey(tenantId, name = 'API Key') {
    try {
      const apiKey = generateId.apiKey();
      const keyHash = hashApiKey(apiKey);

      await this.collection.updateOne(
        { tenantId, status: 'active' },
        { 
          $push: {
            apiKeys: {
              keyHash,
              name,
              createdAt: new Date(),
              lastUsed: null
            }
          }
        }
      );

      logger.info({ tenantId }, 'API key created');

      return { apiKey, name };
    } catch (error) {
      logger.error({ error: error.message, tenantId }, 'Failed to create API key');
      throw error;
    }
  }

  /**
   * Revoke API key
   */
  async revokeApiKey(tenantId, apiKey) {
    try {
      const keyHash = hashApiKey(apiKey);

      await this.collection.updateOne(
        { tenantId, status: 'active' },
        { $pull: { apiKeys: { keyHash } } }
      );

      // Invalidate cache
      await redis.del(`apikey:${keyHash}`);

      logger.info({ tenantId }, 'API key revoked');
    } catch (error) {
      logger.error({ error: error.message, tenantId }, 'Failed to revoke API key');
      throw error;
    }
  }

  /**
   * Soft delete tenant
   */
  async deleteTenant(tenantId) {
    try {
      await this.collection.updateOne(
        { tenantId },
        { 
          $set: { 
            status: 'deleted',
            deletedAt: new Date()
          }
        }
      );

      // Invalidate cache
      await redis.del(`tenant:${tenantId}`);

      logger.info({ tenantId }, 'Tenant deleted');
    } catch (error) {
      logger.error({ error: error.message, tenantId }, 'Failed to delete tenant');
      throw error;
    }
  }

  /**
   * Get tenant usage statistics
   */
  async getUsageStats(tenantId) {
    try {
      const tenant = await this.getTenant(tenantId);
      const planConfig = PLANS[tenant.plan.toUpperCase()];

      // Get current usage from Redis (real-time)
      const now = new Date();
      const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const usageKey = `usage:${tenantId}:${yearMonth}`;
      
      const usageData = await redis.hGetAll(usageKey);
      const queriesThisMonth = parseInt(usageData?.queries || '0', 10);
      const tokensThisMonth = parseInt(usageData?.tokens || '0', 10);

      // Get data sections count
      const dataSectionsCollection = mongodb.getDb().collection('data_sections');
      const sectionsCount = await dataSectionsCollection.countDocuments({ 
        tenantId, 
        status: 'active' 
      });

      return {
        plan: tenant.plan,
        limits: tenant.limits,
        usage: {
          queriesThisMonth,
          queriesLimit: tenant.limits.queriesPerMonth,
          tokensThisMonth,
          tokensLimit: tenant.limits.tokensPerQuery * tenant.limits.queriesPerMonth,
          sectionsCount,
          sectionsLimit: tenant.limits.dataSections,
          rateLimitPerMinute: tenant.limits.rateLimitPerMinute
        },
        percentages: {
          queries: planConfig.limits.queriesPerMonth > 0 
            ? Math.round((queriesThisMonth / planConfig.limits.queriesPerMonth) * 100) 
            : 0,
          sections: Math.round((sectionsCount / tenant.limits.dataSections) * 100)
        }
      };
    } catch (error) {
      logger.error({ error: error.message, tenantId }, 'Failed to get usage stats');
      throw error;
    }
  }

  /**
   * List API keys (returns only hints, not full keys)
   */
  async listApiKeys(tenantId) {
    try {
      const tenant = await this.getTenant(tenantId);
      
      return tenant.apiKeys.map((key, index) => ({
        id: key.keyHash.substring(0, 8), // Use part of hash as ID
        name: key.name,
        hint: `...${key.keyHash.slice(-4)}`, // Show last 4 chars of hash as hint
        createdAt: key.createdAt,
        lastUsed: key.lastUsed
      }));
    } catch (error) {
      logger.error({ error: error.message, tenantId }, 'Failed to list API keys');
      throw error;
    }
  }
}

export default new TenantService();
