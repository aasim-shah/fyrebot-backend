import chatService from '../services/chat.service.js';
import { chatQuerySchema } from '../schemas/validation.js';

/**
 * Chat routes
 */
export default async function chatRoutes(fastify, options) {
  
  // Process chat query
  fastify.post('/', {
    preHandler: [fastify.authenticate, fastify.rateLimiter, fastify.checkMonthlyLimit]
  }, async (request, reply) => {
    try {
      const data = chatQuerySchema.parse(request.body);
      
      const result = await chatService.processQuery(
        request.tenantId,
        request.tenant,
        data.query,
        {
          sessionId: data.sessionId,
          includeMetadata: data.includeMetadata
        }
      );
      
      return reply.send({
        success: true,
        data: result
      });
    } catch (error) {
      if (error.name === 'ZodError') {
        return reply.code(400).send({
          error: 'Validation error',
          details: error.errors
        });
      }
      
      return reply.code(500).send({
        error: 'Chat processing failed',
        message: error.message
      });
    }
  });

  // Clear session history
  fastify.delete('/session/:sessionId', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    try {
      const { sessionId } = request.params;
      await chatService.clearHistory(sessionId);
      
      return reply.send({
        success: true,
        message: 'Session history cleared'
      });
    } catch (error) {
      return reply.code(500).send({
        error: 'Failed to clear history',
        message: error.message
      });
    }
  });
}
