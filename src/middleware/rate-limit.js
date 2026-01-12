import redis from '../db/redis.js';
import pino from 'pino';

const logger = pino();

/**
 * Rate limiting middleware using sliding window
 */
export async function rateLimiter(request, reply) {
  try {
    const tenant = request.tenant;
    if (!tenant) {
      return; // Skip if no tenant (shouldn't happen with auth middleware)
    }

    const tenantId = tenant.tenantId;
    const limits = tenant.limits;

    // Check per-minute limit
    const minuteKey = `ratelimit:${tenantId}:minute:${Math.floor(Date.now() / 60000)}`;
    const minuteCount = await redis.incr(minuteKey);
    
    if (minuteCount === 1) {
      await redis.expire(minuteKey, 60);
    }

    if (minuteCount > limits.requestsPerMinute) {
      return reply.code(429).send({
        error: 'Rate limit exceeded',
        message: `Rate limit: ${limits.requestsPerMinute} requests per minute`,
        retryAfter: 60
      });
    }

    // Check per-hour limit
    const hourKey = `ratelimit:${tenantId}:hour:${Math.floor(Date.now() / 3600000)}`;
    const hourCount = await redis.incr(hourKey);
    
    if (hourCount === 1) {
      await redis.expire(hourKey, 3600);
    }

    if (hourCount > limits.requestsPerHour) {
      return reply.code(429).send({
        error: 'Rate limit exceeded',
        message: `Rate limit: ${limits.requestsPerHour} requests per hour`,
        retryAfter: 3600
      });
    }

    // Add rate limit headers
    reply.header('X-RateLimit-Limit-Minute', limits.requestsPerMinute);
    reply.header('X-RateLimit-Remaining-Minute', Math.max(0, limits.requestsPerMinute - minuteCount));
    reply.header('X-RateLimit-Limit-Hour', limits.requestsPerHour);
    reply.header('X-RateLimit-Remaining-Hour', Math.max(0, limits.requestsPerHour - hourCount));

  } catch (error) {
    logger.error({ error: error.message }, 'Rate limiter error');
    // Don't block request on rate limiter errors
  }
}

/**
 * Check monthly usage limit
 */
export async function checkMonthlyLimit(request, reply) {
  try {
    const tenant = request.tenant;
    if (!tenant) {
      return;
    }

    const tenantId = tenant.tenantId;
    const limits = tenant.limits;

    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
    const monthKey = `usage:${tenantId}:month:${currentMonth}`;
    
    const monthlyUsage = await redis.get(monthKey);
    const usageCount = monthlyUsage ? parseInt(monthlyUsage) : 0;

    if (usageCount >= limits.apiCallsPerMonth) {
      return reply.code(429).send({
        error: 'Monthly limit exceeded',
        message: `Monthly limit of ${limits.apiCallsPerMonth} API calls exceeded. Please upgrade your plan.`,
        usage: {
          used: usageCount,
          limit: limits.apiCallsPerMonth
        }
      });
    }

    // Increment usage
    await redis.incr(monthKey);
    if (usageCount === 0) {
      // Set expiry for 60 days to handle month transitions
      await redis.expire(monthKey, 60 * 24 * 3600);
    }

  } catch (error) {
    logger.error({ error: error.message }, 'Monthly limit check error');
  }
}
