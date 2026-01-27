import ticketService from '../services/ticket.service.js';
import tenantService from '../services/tenant.service.js';
import { z } from 'zod';
import mongodb from '../db/mongodb.js';

/**
 * Ticket Routes - Support ticketing system endpoints
 */

// Validation schemas
const createTicketSchema = z.object({
  name: z.string().min(1).max(100).optional().nullable(),
  email: z.string().email(),
  message: z.string().min(10).max(2000),
  sessionId: z.string().optional().nullable(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  userAgent: z.string().optional().nullable(),
  ipAddress: z.string().optional().nullable(),
  pageUrl: z.string().url().optional().nullable(),
}).transform(data => {
  // Remove null values to keep the data clean
  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== null)
  );
});

const updateStatusSchema = z.object({
  status: z.enum(['open', 'in_progress', 'resolved', 'closed']),
});

const updatePrioritySchema = z.object({
  priority: z.enum(['low', 'medium', 'high']),
});

const addResponseSchema = z.object({
  message: z.string().min(1).max(2000),
  respondedBy: z.string().optional(),
  isInternal: z.boolean().optional(),
});

const ticketRoutes = async (fastify) => {
  /**
   * Create a new support ticket (Public endpoint - requires API key)
   */
  fastify.post('/tickets', async (request, reply) => {
    try {
      const apiKey = request.headers['x-api-key'];
      
      if (!apiKey) {
        return reply.code(401).send({ error: 'API key required' });
      }

      // Get tenant from API key using tenantService
      let tenant;
      try {
        tenant = await tenantService.getTenantByApiKey(apiKey);
      } catch (error) {
        return reply.code(401).send({ error: 'Invalid API key' });
      }

      if (!tenant) {
        return reply.code(401).send({ error: 'Invalid API key' });
      }

      // Validate request body
      const validatedData = createTicketSchema.parse(request.body);

      // Use the tenant's tenantId field (e.g., "ten_xxx"), not the MongoDB _id
      const ticket = await ticketService.createTicket(tenant.tenantId, validatedData);

      return reply.code(201).send({
        success: true,
        data: {
          ticket: {
            id: ticket._id,
            ticketNumber: ticket.ticketNumber,
            status: ticket.status,
            createdAt: ticket.createdAt,
          }
        }
      });
    } catch (error) {
      request.log.error(error);
      
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ 
          error: 'Validation error', 
          details: error.errors 
        });
      }
      
      return reply.code(500).send({ error: 'Failed to create ticket' });
    }
  });

  /**
   * Get all tickets for authenticated tenant
   */
  fastify.get('/tickets', {
    preHandler: fastify.authenticate,
  }, async (request, reply) => {
    try {
      const { status, priority, email, limit, skip, search } = request.query;

      // Debug logging
      request.log.info({ 
        tenantId: request.tenantId, 
        tenantIdType: typeof request.tenantId,
        filters: { status, priority, email, search }
      }, 'Fetching tickets for tenant');

      let tickets;
      let total;

      // If search query provided, use search
      if (search) {
        tickets = await ticketService.searchTickets(
          request.tenantId,
          search,
          { status, priority, limit: parseInt(limit) || 50 }
        );
        total = tickets.length;
      } else {
        // Otherwise, get with filters
        const result = await ticketService.getTicketsByTenant(
          request.tenantId,
          {
            status,
            priority,
            email,
            limit: parseInt(limit) || 100,
            skip: parseInt(skip) || 0,
          }
        );
        tickets = result.tickets;
        total = result.total;
      }

      return reply.send({
        success: true,
        tickets,
        total,
        limit: parseInt(limit) || 100,
        skip: parseInt(skip) || 0,
      });
    } catch (error) {
      request.log.error(error);
      return reply.code(500).send({ error: 'Failed to get tickets' });
    }
  });

  /**
   * Get ticket statistics
   */
  fastify.get('/tickets/stats', {
    preHandler: fastify.authenticate,
  }, async (request, reply) => {
    try {
      const stats = await ticketService.getTicketStats(request.tenantId);
      
      return reply.send({
        success: true,
        stats,
      });
    } catch (error) {
      request.log.error(error);
      return reply.code(500).send({ error: 'Failed to get ticket stats' });
    }
  });

  /**
   * Get a single ticket by ID
   */
  fastify.get('/tickets/:ticketId', {
    preHandler: fastify.authenticate,
  }, async (request, reply) => {
    try {
      const { ticketId } = request.params;
      
      const ticket = await ticketService.getTicketById(
        ticketId,
        request.tenantId
      );

      return reply.send({
        success: true,
        ticket,
      });
    } catch (error) {
      request.log.error(error);
      
      if (error.message === 'Ticket not found') {
        return reply.code(404).send({ error: 'Ticket not found' });
      }
      
      return reply.code(500).send({ error: 'Failed to get ticket' });
    }
  });

  /**
   * Update ticket status
   */
  fastify.patch('/tickets/:ticketId/status', {
    preHandler: fastify.authenticate,
  }, async (request, reply) => {
    try {
      const { ticketId } = request.params;
      const validatedData = updateStatusSchema.parse(request.body);

      const ticket = await ticketService.updateTicketStatus(
        ticketId,
        request.tenantId,
        validatedData.status
      );

      return reply.send({
        success: true,
        ticket,
      });
    } catch (error) {
      request.log.error(error);

      if (error instanceof z.ZodError) {
        return reply.code(400).send({ 
          error: 'Validation error', 
          details: error.errors 
        });
      }

      if (error.message === 'Ticket not found') {
        return reply.code(404).send({ error: 'Ticket not found' });
      }

      return reply.code(500).send({ error: 'Failed to update ticket status' });
    }
  });

  /**
   * Update ticket priority
   */
  fastify.patch('/tickets/:ticketId/priority', {
    preHandler: fastify.authenticate,
  }, async (request, reply) => {
    try {
      const { ticketId } = request.params;
      const validatedData = updatePrioritySchema.parse(request.body);

      const ticket = await ticketService.updateTicketPriority(
        ticketId,
        request.tenantId,
        validatedData.priority
      );

      return reply.send({
        success: true,
        ticket,
      });
    } catch (error) {
      request.log.error(error);

      if (error instanceof z.ZodError) {
        return reply.code(400).send({ 
          error: 'Validation error', 
          details: error.errors 
        });
      }

      if (error.message === 'Ticket not found') {
        return reply.code(404).send({ error: 'Ticket not found' });
      }

      return reply.code(500).send({ error: 'Failed to update ticket priority' });
    }
  });

  /**
   * Add a response to a ticket
   */
  fastify.post('/tickets/:ticketId/responses', {
    preHandler: fastify.authenticate,
  }, async (request, reply) => {
    try {
      const { ticketId } = request.params;
      const validatedData = addResponseSchema.parse(request.body);

      // Add tenant name as responder if not provided
      if (!validatedData.respondedBy) {
        const tenantsCollection = mongodb.getDb().collection('tenants');
        const tenant = await tenantsCollection.findOne({ 
          tenantId: request.tenantId 
        });
        validatedData.respondedBy = tenant?.name || 'Support Team';
      }

      const ticket = await ticketService.addTicketResponse(
        ticketId,
        request.tenantId,
        validatedData
      );

      return reply.send({
        success: true,
        ticket,
      });
    } catch (error) {
      request.log.error(error);

      if (error instanceof z.ZodError) {
        return reply.code(400).send({ 
          error: 'Validation error', 
          details: error.errors 
        });
      }

      if (error.message === 'Ticket not found') {
        return reply.code(404).send({ error: 'Ticket not found' });
      }

      return reply.code(500).send({ error: 'Failed to add response' });
    }
  });

  /**
   * Delete a ticket (soft delete)
   */
  fastify.delete('/tickets/:ticketId', {
    preHandler: fastify.authenticate,
  }, async (request, reply) => {
    try {
      const { ticketId } = request.params;

      const ticket = await ticketService.deleteTicket(
        ticketId,
        request.tenantId
      );

      return reply.send({
        success: true,
        message: 'Ticket deleted successfully',
        ticket,
      });
    } catch (error) {
      request.log.error(error);

      if (error.message === 'Ticket not found') {
        return reply.code(404).send({ error: 'Ticket not found' });
      }

      return reply.code(500).send({ error: 'Failed to delete ticket' });
    }
  });
};

export default ticketRoutes;
