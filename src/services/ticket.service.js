import { ObjectId } from 'mongodb';
import mongodb from '../db/mongodb.js';
import pino from 'pino';
import emailService from './email.service.js';

const logger = pino();

/**
 * Ticket Service - Production-ready support ticketing system
 */
class TicketService {
  constructor() {
    this.collectionName = 'tickets';
  }

  /**
   * Get tickets collection
   */
  getCollection() {
    const db = mongodb.getDb();
    return db.collection(this.collectionName);
  }

  /**
   * Generate unique ticket number
   */
  async generateTicketNumber() {
    const prefix = 'TKT';
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `${prefix}-${timestamp}-${random}`;
  }

  /**
   * Create a new support ticket
   */
  async createTicket(tenantId, ticketData) {
    try {
      const collection = this.getCollection();
      const ticketNumber = await this.generateTicketNumber();

      const ticket = {
        tenantId: tenantId, // Store as string, not ObjectId
        ticketNumber,
        name: ticketData.name || null,
        email: ticketData.email,
        message: ticketData.message,
        sessionId: ticketData.sessionId || null,
        status: 'open', // open, in_progress, resolved, closed
        priority: ticketData.priority || 'medium', // low, medium, high
        responses: [],
        metadata: {
          userAgent: ticketData.userAgent || null,
          ipAddress: ticketData.ipAddress || null,
          pageUrl: ticketData.pageUrl || null,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await collection.insertOne(ticket);
      const createdTicket = await collection.findOne({ _id: result.insertedId });

      // Send email notification to support team
      try {
        const tenantsCollection = mongodb.getDb().collection('tenants');
        const tenant = await tenantsCollection.findOne({ tenantId: tenantId });
        
        if (tenant) {
          await emailService.sendNewTicketNotification(createdTicket, tenant);
          
          // Send confirmation email to customer
          await emailService.sendTicketConfirmationToCustomer(createdTicket, tenant);
        }
      } catch (emailError) {
        logger.error({ 
          error: emailError.message, 
          ticketId: createdTicket._id 
        }, 'Failed to send ticket notification email');
        // Don't fail ticket creation if email fails
      }

      logger.info({ 
        ticketId: createdTicket._id, 
        ticketNumber: createdTicket.ticketNumber,
        tenantId 
      }, 'Support ticket created');

      return createdTicket;
    } catch (error) {
      logger.error({ error: error.message, tenantId }, 'Failed to create ticket');
      throw error;
    }
  }

  /**
   * Get tickets for a tenant
   */
  async getTicketsByTenant(tenantId, filters = {}) {
    try {
      const collection = this.getCollection();
      const query = { tenantId: tenantId }; // Use string, not ObjectId

      // Debug: Log what we're querying for
      logger.info({ 
        queryTenantId: tenantId, 
        queryTenantIdType: typeof tenantId,
        filters 
      }, 'Querying tickets with tenantId');

      // Debug: Get a sample document to see what format tenantId is stored in
      const sampleDoc = await collection.findOne({});
      if (sampleDoc) {
        logger.info({ 
          sampleTenantId: sampleDoc.tenantId, 
          sampleTenantIdType: typeof sampleDoc.tenantId,
          sampleTicketNumber: sampleDoc.ticketNumber
        }, 'Sample ticket document from database');
      }

      // Debug: Count total documents in collection
      const totalDocs = await collection.countDocuments({});
      logger.info({ totalDocs }, 'Total tickets in database');

      // Apply filters
      if (filters.status) {
        query.status = filters.status;
      }
      if (filters.priority) {
        query.priority = filters.priority;
      }
      if (filters.email) {
        query.email = filters.email;
      }

      const tickets = await collection
        .find(query)
        .sort({ createdAt: -1 })
        .limit(filters.limit || 100)
        .skip(filters.skip || 0)
        .toArray();

      const total = await collection.countDocuments(query);

      logger.info({ 
        ticketsFound: tickets.length, 
        total,
        query 
      }, 'Tickets query result');

      return { tickets, total };
    } catch (error) {
      logger.error({ error: error.message, tenantId }, 'Failed to get tickets');
      throw error;
    }
  }

  /**
   * Get a single ticket by ID
   */
  async getTicketById(ticketId, tenantId) {
    try {
      const collection = this.getCollection();
      const ticket = await collection.findOne({
        _id: new ObjectId(ticketId),
        tenantId: tenantId, // Use string, not ObjectId
      });

      if (!ticket) {
        throw new Error('Ticket not found');
      }

      return ticket;
    } catch (error) {
      logger.error({ error: error.message, ticketId }, 'Failed to get ticket');
      throw error;
    }
  }

  /**
   * Update ticket status
   */
  async updateTicketStatus(ticketId, tenantId, status) {
    try {
      const collection = this.getCollection();
      const validStatuses = ['open', 'in_progress', 'resolved', 'closed'];

      if (!validStatuses.includes(status)) {
        throw new Error(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
      }

      const result = await collection.findOneAndUpdate(
        { 
          _id: new ObjectId(ticketId), 
          tenantId: tenantId // Use string, not ObjectId
        },
        { 
          $set: { 
            status,
            updatedAt: new Date(),
            ...(status === 'resolved' && { resolvedAt: new Date() }),
            ...(status === 'closed' && { closedAt: new Date() }),
          } 
        },
        { returnDocument: 'after' }
      );

      if (!result) {
        throw new Error('Ticket not found');
      }

      logger.info({ ticketId, status }, 'Ticket status updated');
      return result;
    } catch (error) {
      logger.error({ error: error.message, ticketId }, 'Failed to update ticket status');
      throw error;
    }
  }

  /**
   * Update ticket priority
   */
  async updateTicketPriority(ticketId, tenantId, priority) {
    try {
      const collection = this.getCollection();
      const validPriorities = ['low', 'medium', 'high'];

      if (!validPriorities.includes(priority)) {
        throw new Error(`Invalid priority. Must be one of: ${validPriorities.join(', ')}`);
      }

      const result = await collection.findOneAndUpdate(
        { 
          _id: new ObjectId(ticketId), 
          tenantId: tenantId // Use string, not ObjectId
        },
        { 
          $set: { 
            priority,
            updatedAt: new Date(),
          } 
        },
        { returnDocument: 'after' }
      );

      if (!result) {
        throw new Error('Ticket not found');
      }

      logger.info({ ticketId, priority }, 'Ticket priority updated');
      return result;
    } catch (error) {
      logger.error({ error: error.message, ticketId }, 'Failed to update ticket priority');
      throw error;
    }
  }

  /**
   * Add a response to a ticket
   */
  async addTicketResponse(ticketId, tenantId, responseData) {
    try {
      const collection = this.getCollection();
      
      const response = {
        id: new ObjectId(),
        message: responseData.message,
        respondedBy: responseData.respondedBy || 'Support Team',
        isInternal: responseData.isInternal || false,
        respondedAt: new Date(),
      };

      const result = await collection.findOneAndUpdate(
        { 
          _id: new ObjectId(ticketId), 
          tenantId: tenantId // Use string, not ObjectId
        },
        { 
          $push: { responses: response },
          $set: { 
            status: 'in_progress',
            updatedAt: new Date(),
          } 
        },
        { returnDocument: 'after' }
      );

      if (!result) {
        throw new Error('Ticket not found');
      }

      // Send email notification to customer (if not internal note)
      if (!responseData.isInternal) {
        try {
          const tenantsCollection = mongodb.getDb().collection('tenants');
          const tenant = await tenantsCollection.findOne({ tenantId: tenantId });
          
          if (tenant) {
            await emailService.sendTicketResponseNotification(result, tenant);
          }
        } catch (emailError) {
          logger.error({ 
            error: emailError.message, 
            ticketId 
          }, 'Failed to send response notification email');
          // Don't fail response creation if email fails
        }
      }

      logger.info({ ticketId, responseId: response.id }, 'Ticket response added');
      return result;
    } catch (error) {
      logger.error({ error: error.message, ticketId }, 'Failed to add ticket response');
      throw error;
    }
  }

  /**
   * Get ticket statistics for a tenant
   */
  async getTicketStats(tenantId) {
    try {
      const collection = this.getCollection();
      const query = { tenantId: tenantId }; // Use string, not ObjectId

      const [total, open, inProgress, resolved, closed] = await Promise.all([
        collection.countDocuments(query),
        collection.countDocuments({ ...query, status: 'open' }),
        collection.countDocuments({ ...query, status: 'in_progress' }),
        collection.countDocuments({ ...query, status: 'resolved' }),
        collection.countDocuments({ ...query, status: 'closed' }),
      ]);

      // Get priority breakdown
      const priorityStats = await collection
        .aggregate([
          { $match: query },
          { $group: { _id: '$priority', count: { $sum: 1 } } },
        ])
        .toArray();

      const priority = {
        low: 0,
        medium: 0,
        high: 0,
      };

      priorityStats.forEach((stat) => {
        priority[stat._id] = stat.count;
      });

      // Get recent activity (last 7 days)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const recentTickets = await collection.countDocuments({
        ...query,
        createdAt: { $gte: sevenDaysAgo },
      });

      // Average response time for resolved tickets
      const resolvedTickets = await collection
        .find({ 
          ...query, 
          status: { $in: ['resolved', 'closed'] },
          resolvedAt: { $exists: true },
        })
        .toArray();

      let avgResponseTime = null;
      if (resolvedTickets.length > 0) {
        const totalTime = resolvedTickets.reduce((sum, ticket) => {
          const responseTime = ticket.resolvedAt - ticket.createdAt;
          return sum + responseTime;
        }, 0);
        avgResponseTime = Math.round(totalTime / resolvedTickets.length / 1000 / 60); // in minutes
      }

      return {
        total,
        byStatus: {
          open,
          inProgress,
          resolved,
          closed,
        },
        byPriority: priority,
        recentTickets,
        avgResponseTime, // in minutes
      };
    } catch (error) {
      logger.error({ error: error.message, tenantId }, 'Failed to get ticket stats');
      throw error;
    }
  }

  /**
   * Delete a ticket (soft delete by marking as closed)
   */
  async deleteTicket(ticketId, tenantId) {
    try {
      const collection = this.getCollection();
      
      const result = await collection.findOneAndUpdate(
        { 
          _id: new ObjectId(ticketId), 
          tenantId: tenantId // Use string, not ObjectId
        },
        { 
          $set: { 
            status: 'closed',
            deletedAt: new Date(),
            updatedAt: new Date(),
          } 
        },
        { returnDocument: 'after' }
      );

      if (!result) {
        throw new Error('Ticket not found');
      }

      logger.info({ ticketId }, 'Ticket deleted');
      return result;
    } catch (error) {
      logger.error({ error: error.message, ticketId }, 'Failed to delete ticket');
      throw error;
    }
  }

  /**
   * Search tickets by email or message content
   */
  async searchTickets(tenantId, searchQuery, filters = {}) {
    try {
      const collection = this.getCollection();
      const query = {
        tenantId: tenantId, // Use string, not ObjectId
        $or: [
          { email: { $regex: searchQuery, $options: 'i' } },
          { message: { $regex: searchQuery, $options: 'i' } },
          { name: { $regex: searchQuery, $options: 'i' } },
          { ticketNumber: { $regex: searchQuery, $options: 'i' } },
        ],
      };

      // Apply additional filters
      if (filters.status) {
        query.status = filters.status;
      }
      if (filters.priority) {
        query.priority = filters.priority;
      }

      const tickets = await collection
        .find(query)
        .sort({ createdAt: -1 })
        .limit(filters.limit || 50)
        .toArray();

      return tickets;
    } catch (error) {
      logger.error({ error: error.message, tenantId }, 'Failed to search tickets');
      throw error;
    }
  }
}

export default new TicketService();
