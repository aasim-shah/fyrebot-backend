import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import pino from 'pino';

// Database connections
import mongodb from './db/mongodb.js';
import redis from './db/redis.js';

// Middleware
import { authenticate, authenticateJWT, authenticateFlexible } from './middleware/auth.js';
import { rateLimiter, checkMonthlyLimit } from './middleware/rate-limit.js';

// Services
import tenantService from './services/tenant.service.js';
import embeddingService from './services/embedding.service.js';
import dataService from './services/data.service.js';
import vectorSearchService from './services/vector-search.service.js';
import chatService from './services/chat.service.js';

// Routes
import tenantRoutes from './routes/tenant.routes.js';
import dataRoutes from './routes/data.routes.js';
import chatRoutes from './routes/chat.routes.js';

const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true
    }
  }
});

// Create Fastify instance
const fastify = Fastify({
  logger: logger,
  requestIdHeader: 'x-request-id',
  requestIdLogLabel: 'reqId',
  disableRequestLogging: false,
  trustProxy: true
});

// Register plugins
await fastify.register(helmet, {
  contentSecurityPolicy: false
});

await fastify.register(cors, {
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
  credentials: true
});

// Register multipart for file uploads
await fastify.register(multipart, {
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 10
  }
});

// Decorate fastify with middleware
fastify.decorate('authenticate', authenticateFlexible); // Use flexible auth by default
fastify.decorate('authenticateJWT', authenticateJWT);
fastify.decorate('authenticateApiKey', authenticate);
fastify.decorate('rateLimiter', rateLimiter);
fastify.decorate('checkMonthlyLimit', checkMonthlyLimit);

// Health check endpoint
fastify.get('/health', async (request, reply) => {
  const mongoHealth = await mongodb.healthCheck();
  const redisHealth = await redis.healthCheck();
  
  const isHealthy = mongoHealth && redisHealth;
  const statusCode = isHealthy ? 200 : 503;
  
  return reply.code(statusCode).send({
    status: isHealthy ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    services: {
      mongodb: mongoHealth ? 'up' : 'down',
      redis: redisHealth ? 'up' : 'down'
    }
  });
});

// Root endpoint
fastify.get('/', async (request, reply) => {
  return {
    name: 'Chatbot SaaS API',
    version: '1.0.0',
    description: 'Multi-tenant chatbot platform with RAG',
    endpoints: {
      health: '/health',
      tenants: '/api/tenants',
      data: '/api/data',
      chat: '/api/chat'
    }
  };
});

// Register API routes
await fastify.register(tenantRoutes, { prefix: '/api/tenants' });
await fastify.register(dataRoutes, { prefix: '/api/data' });
await fastify.register(chatRoutes, { prefix: '/api/chat' });

// Global error handler
fastify.setErrorHandler((error, request, reply) => {
  logger.error({
    error: error.message,
    stack: error.stack,
    url: request.url,
    method: request.method
  }, 'Request error');

  const statusCode = error.statusCode || 500;
  
  return reply.code(statusCode).send({
    error: error.name || 'Internal Server Error',
    message: error.message || 'An unexpected error occurred',
    statusCode
  });
});

// Graceful shutdown
const gracefulShutdown = async (signal) => {
  logger.info(`Received ${signal}, starting graceful shutdown...`);
  
  try {
    await fastify.close();
    await mongodb.close();
    await redis.close();
    
    logger.info('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    logger.error({ error: error.message }, 'Error during shutdown');
    process.exit(1);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start server
async function start() {
  try {
    // Connect to databases
    logger.info('Connecting to databases...');
    await mongodb.connect();
    await redis.connect();
    
    // Initialize services
    logger.info('Initializing services...');
    tenantService.initialize();
    embeddingService.initialize();
    dataService.initialize();
    vectorSearchService.initialize();
    chatService.initialize();
    
    // Start server
    const port = process.env.PORT || 3000;
    const host = process.env.HOST || '0.0.0.0';
    
    await fastify.listen({ port, host });
    
    logger.info(`🚀 Server running at http://${host}:${port}`);
    logger.info(`📚 API documentation: http://${host}:${port}/`);
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to start server');
    process.exit(1);
  }
}

start();
