import tenantService from '../services/tenant.service.js';
import { registerTenantSchema, loginTenantSchema, updateTenantSchema, updatePlanSchema } from '../schemas/validation.js';

/**
 * Tenant routes
 */
export default async function tenantRoutes(fastify, options) {
  
  // Register new tenant
  fastify.post('/register', async (request, reply) => {
    try {
      const data = registerTenantSchema.parse(request.body);
      const result = await tenantService.register(data);
      
      return reply.code(201).send(result);
    } catch (error) {
      if (error.name === 'ZodError') {
        return reply.code(400).send({
          error: 'Validation error',
          details: error.errors
        });
      }
      
      return reply.code(400).send({
        error: 'Registration failed',
        message: error.message
      });
    }
  });

  // Login tenant
  fastify.post('/login', async (request, reply) => {
    try {
      const data = loginTenantSchema.parse(request.body);
      const result = await tenantService.login(data.email, data.password);
      
      return reply.send(result);
    } catch (error) {
      if (error.name === 'ZodError') {
        return reply.code(400).send({
          error: 'Validation error',
          details: error.errors
        });
      }
      
      return reply.code(401).send({
        error: 'Login failed',
        message: error.message
      });
    }
  });

  // Get current tenant info
  fastify.get('/me', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    try {
      const tenant = await tenantService.getTenant(request.tenantId);
      
      return reply.send({
        success: true,
        data: {
          tenantId: tenant.tenantId,
          email: tenant.email,
          businessName: tenant.businessName,
          plan: tenant.plan,
          limits: tenant.limits,
          status: tenant.status,
          createdAt: tenant.createdAt,
          metadata: tenant.metadata
        }
      });
    } catch (error) {
      return reply.code(500).send({
        error: 'Failed to get tenant info',
        message: error.message
      });
    }
  });

  // Update tenant settings
  fastify.patch('/me', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    try {
      const updates = updateTenantSchema.parse(request.body);
      const tenant = await tenantService.updateTenant(request.tenantId, updates);
      
      return reply.send({
        success: true,
        data: {
          tenantId: tenant.tenantId,
          email: tenant.email,
          businessName: tenant.businessName,
          plan: tenant.plan,
          metadata: tenant.metadata
        },
        message: 'Tenant updated successfully'
      });
    } catch (error) {
      if (error.name === 'ZodError') {
        return reply.code(400).send({
          error: 'Validation error',
          details: error.errors
        });
      }
      
      return reply.code(500).send({
        error: 'Update failed',
        message: error.message
      });
    }
  });

  // Change subscription plan
  fastify.post('/plan', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    try {
      const { plan } = updatePlanSchema.parse(request.body);
      const tenant = await tenantService.changePlan(request.tenantId, plan);
      
      return reply.send({
        success: true,
        data: {
          plan: tenant.plan,
          limits: tenant.limits
        },
        message: 'Plan updated successfully'
      });
    } catch (error) {
      if (error.name === 'ZodError') {
        return reply.code(400).send({
          error: 'Validation error',
          details: error.errors
        });
      }
      
      return reply.code(400).send({
        error: 'Plan change failed',
        message: error.message
      });
    }
  });

  // Create new API key
  fastify.post('/api-keys', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    try {
      const { name = 'API Key' } = request.body;
      const result = await tenantService.createApiKey(request.tenantId, name);
      
      return reply.code(201).send({
        success: true,
        data: result,
        message: 'API key created successfully. Save it securely - it will not be shown again.'
      });
    } catch (error) {
      return reply.code(500).send({
        error: 'Failed to create API key',
        message: error.message
      });
    }
  });

  // Delete tenant account
  fastify.delete('/me', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    try {
      await tenantService.deleteTenant(request.tenantId);
      
      return reply.send({
        success: true,
        message: 'Account deleted successfully'
      });
    } catch (error) {
      return reply.code(500).send({
        error: 'Delete failed',
        message: error.message
      });
    }
  });

  // Get usage statistics
  fastify.get('/usage', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    try {
      const stats = await tenantService.getUsageStats(request.tenantId);
      
      return reply.send({
        success: true,
        usage: {
          apiCallsThisMonth: stats.usage.queriesThisMonth,
          apiCallsLimit: stats.usage.queriesLimit,
          sectionsCount: stats.usage.sectionsCount,
          sectionsLimit: stats.usage.sectionsLimit,
          requestsPerMinuteLimit: stats.usage.rateLimitPerMinute
        }
      });
    } catch (error) {
      return reply.code(500).send({
        error: 'Failed to get usage statistics',
        message: error.message
      });
    }
  });

  // List API keys (shows only hints)
  fastify.get('/api-keys', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    try {
      const apiKeys = await tenantService.listApiKeys(request.tenantId);
      
      return reply.send({
        success: true,
        data: apiKeys
      });
    } catch (error) {
      return reply.code(500).send({
        error: 'Failed to list API keys',
        message: error.message
      });
    }
  });
}
