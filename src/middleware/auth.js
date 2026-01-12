import tenantService from '../services/tenant.service.js';
import { verifyToken } from '../utils/helpers.js';

/**
 * JWT Authentication middleware
 */
export async function authenticateJWT(request, reply) {
  try {
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'JWT token is required. Provide it in the Authorization header as "Bearer <token>".'
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    const decoded = verifyToken(token);

    // Get tenant from database to ensure they still exist and are active
    const tenant = await tenantService.getTenant(decoded.tenantId);

    // Attach tenant to request
    request.tenant = tenant;
    request.tenantId = tenant.tenantId;
  } catch (error) {
    return reply.code(401).send({
      error: 'Unauthorized',
      message: 'Invalid or expired token'
    });
  }
}

/**
 * API Key Authentication middleware (for API-to-API calls)
 */
export async function authenticate(request, reply) {
  try {
    const apiKey = request.headers['x-api-key'];

    if (!apiKey) {
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'API key is required. Provide it in the X-API-Key header.'
      });
    }

    // Validate API key and get tenant
    const tenant = await tenantService.getTenantByApiKey(apiKey);

    // Attach tenant to request
    request.tenant = tenant;
    request.tenantId = tenant.tenantId;
  } catch (error) {
    return reply.code(401).send({
      error: 'Unauthorized',
      message: 'Invalid API key'
    });
  }
}

/**
 * Flexible authentication - supports both JWT and API Key
 */
export async function authenticateFlexible(request, reply) {
  const authHeader = request.headers.authorization;
  const apiKey = request.headers['x-api-key'];

  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authenticateJWT(request, reply);
  } else if (apiKey) {
    return authenticate(request, reply);
  } else {
    return reply.code(401).send({
      error: 'Unauthorized',
      message: 'Authentication required. Provide either a Bearer token or X-API-Key header.'
    });
  }
}

/**
 * Optional authentication (doesn't fail if no credentials)
 */
export async function optionalAuth(request, reply) {
  try {
    const authHeader = request.headers.authorization;
    const apiKey = request.headers['x-api-key'];

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const decoded = verifyToken(token);
      const tenant = await tenantService.getTenant(decoded.tenantId);
      request.tenant = tenant;
      request.tenantId = tenant.tenantId;
    } else if (apiKey) {
      const tenant = await tenantService.getTenantByApiKey(apiKey);
      request.tenant = tenant;
      request.tenantId = tenant.tenantId;
    }
  } catch (error) {
    // Silent fail for optional auth
  }
}
