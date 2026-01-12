import Redis from 'ioredis';
import pino from 'pino';

const logger = pino();

class RedisClient {
  constructor() {
    this.client = null;
    this.isConnected = false;
  }

  async connect() {
    try {
      const url = process.env.REDIS_URL;
      if (!url) {
        logger.warn('REDIS_URL is not defined - running without Redis cache');
        return null;
      }

      this.client = new Redis(url, {
        maxRetriesPerRequest: 1,
        enableReadyCheck: false,
        retryStrategy(times) {
          if (times > 2) {
            logger.warn('Redis connection failed after retries - continuing without cache');
            return null; // Stop retrying
          }
          return Math.min(times * 50, 500);
        },
        lazyConnect: true,
      });

      this.client.on('connect', () => {
        this.isConnected = true;
        logger.info('Redis connected successfully');
      });

      this.client.on('error', (error) => {
        this.isConnected = false;
        logger.warn({ error: error.message }, 'Redis error - cache disabled');
      });

      this.client.on('close', () => {
        this.isConnected = false;
      });

      // Try to connect but don't fail if it doesn't work
      try {
        await this.client.connect();
        this.isConnected = true;
      } catch (error) {
        logger.warn('Redis not available - continuing without cache');
        this.client = null;
        this.isConnected = false;
      }

      return this.client;
    } catch (error) {
      logger.warn({ error: error.message }, 'Redis connection failed - running without cache');
      this.client = null;
      this.isConnected = false;
      return null;
    }
  }

  getClient() {
    return this.client;
  }

  async get(key) {
    if (!this.client || !this.isConnected) return null;
    try {
      return await this.client.get(key);
    } catch (error) {
      logger.debug({ error: error.message }, 'Redis get failed');
      return null;
    }
  }

  async set(key, value, ttl = null) {
    if (!this.client || !this.isConnected) return null;
    try {
      if (ttl) {
        return await this.client.set(key, value, 'EX', ttl);
      }
      return await this.client.set(key, value);
    } catch (error) {
      logger.debug({ error: error.message }, 'Redis set failed');
      return null;
    }
  }

  async del(key) {
    if (!this.client || !this.isConnected) return null;
    try {
      return await this.client.del(key);
    } catch (error) {
      logger.debug({ error: error.message }, 'Redis del failed');
      return null;
    }
  }

  async incr(key) {
    if (!this.client || !this.isConnected) return null;
    try {
      return await this.client.incr(key);
    } catch (error) {
      logger.debug({ error: error.message }, 'Redis incr failed');
      return null;
    }
  }

  async expire(key, seconds) {
    if (!this.client || !this.isConnected) return null;
    try {
      return await this.client.expire(key, seconds);
    } catch (error) {
      logger.debug({ error: error.message }, 'Redis expire failed');
      return null;
    }
  }

  async hset(key, field, value) {
    if (!this.client || !this.isConnected) return null;
    try {
      return await this.client.hset(key, field, value);
    } catch (error) {
      logger.debug({ error: error.message }, 'Redis hset failed');
      return null;
    }
  }

  async hget(key, field) {
    if (!this.client || !this.isConnected) return null;
    try {
      return await this.client.hget(key, field);
    } catch (error) {
      logger.debug({ error: error.message }, 'Redis hget failed');
      return null;
    }
  }

  async hgetall(key) {
    if (!this.client || !this.isConnected) return null;
    try {
      return await this.client.hgetall(key);
    } catch (error) {
      logger.debug({ error: error.message }, 'Redis hgetall failed');
      return null;
    }
  }

  async close() {
    if (this.client) {
      try {
        await this.client.quit();
        logger.info('Redis connection closed');
      } catch (error) {
        logger.debug('Redis close failed');
      }
    }
  }

  async healthCheck() {
    if (!this.client || !this.isConnected) return false;
    try {
      await this.client.ping();
      return true;
    } catch (error) {
      return false;
    }
  }
}

export default new RedisClient();
