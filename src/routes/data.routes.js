import dataService from '../services/data.service.js';
import documentParserService from '../services/document-parser.service.js';
import { registerDataSchema } from '../schemas/validation.js';

/**
 * Data ingestion routes
 */
export default async function dataRoutes(fastify, options) {
  
  // Get supported file formats
  fastify.get('/formats', async (request, reply) => {
    return reply.send({
      success: true,
      formats: documentParserService.constructor.getSupportedFormats(),
      maxFileSize: documentParserService.constructor.MAX_FILE_SIZE,
      maxFiles: 10
    });
  });

  // Upload and parse documents
  fastify.post('/upload', {
    preHandler: [fastify.authenticate, fastify.rateLimiter]
  }, async (request, reply) => {
    try {
      // Use parts() iterator to handle file upload properly
      const parts = request.parts();
      const files = [];
      
      // Collect all uploaded files
      for await (const part of parts) {
        if (part.type === 'file') {
          // Read the file into a buffer
          const chunks = [];
          for await (const chunk of part.file) {
            chunks.push(chunk);
          }
          const buffer = Buffer.concat(chunks);
          
          files.push({
            filename: part.filename,
            mimetype: part.mimetype,
            buffer: buffer
          });
        }
      }
      
      if (files.length === 0) {
        return reply.code(400).send({
          error: 'No files uploaded',
          message: 'Please upload at least one file'
        });
      }

      const results = [];
      const errors = [];

      // Process each file
      for (const file of files) {
        try {
          // Validate buffer
          if (!file.buffer || file.buffer.length === 0) {
            throw new Error('File is empty or could not be read');
          }
          
          // Parse document
          const parsed = await documentParserService.parseDocument(
            file.buffer,
            file.mimetype,
            file.filename
          );

          // Register the extracted content
          const section = {
            type: 'document',
            title: file.filename,
            content: parsed.content,
            metadata: {
              ...parsed.metadata,
              originalFilename: file.filename,
              fileSize: file.buffer.length,
              uploadedAt: new Date().toISOString()
            }
          };

          const result = await dataService.registerData(
            request.tenantId,
            [section],
            request.tenant.limits
          );

          results.push({
            filename: file.filename,
            sectionId: result.sections[0].sectionId,
            chunkCount: result.sections[0].chunkCount,
            contentLength: parsed.cleanedLength,
            success: true
          });
        } catch (error) {
          errors.push({
            filename: file.filename,
            error: error.message
          });
        }
      }

      const statusCode = errors.length === 0 ? 201 : (results.length > 0 ? 207 : 400);

      return reply.code(statusCode).send({
        success: errors.length === 0,
        uploaded: results.length,
        failed: errors.length,
        results,
        errors: errors.length > 0 ? errors : undefined,
        message: `Successfully uploaded ${results.length} of ${files.length} files`
      });
    } catch (error) {
      return reply.code(500).send({
        error: 'Upload failed',
        message: error.message
      });
    }
  });

  // List all data items (for frontend data registry)
  fastify.get('/', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    try {
      const { page = 1, limit = 20 } = request.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);
      
      const result = await dataService.listSections(
        request.tenantId,
        skip,
        parseInt(limit)
      );
      
      return reply.send({
        success: true,
        data: result.sections,
        total: result.total,
        page: parseInt(page),
        limit: parseInt(limit)
      });
    } catch (error) {
      return reply.code(500).send({
        error: 'Failed to list data',
        message: error.message
      });
    }
  });

  // Register single data item (for frontend)
  fastify.post('/register', {
    preHandler: [fastify.authenticate, fastify.rateLimiter]
  }, async (request, reply) => {
    try {
      const { title, content, metadata } = request.body;
      
      // Wrap in sections format that the service expects
      const sections = [{
        type: 'general',
        title,
        content,
        metadata: metadata || {}
      }];
      
      const result = await dataService.registerData(
        request.tenantId,
        sections,
        request.tenant.limits
      );
      
      return reply.code(201).send({
        success: true,
        data: result.sections[0], // Return the first section
        message: 'Data registered successfully'
      });
    } catch (error) {
      return reply.code(400).send({
        error: 'Data registration failed',
        message: error.message
      });
    }
  });

  // Update data item
  fastify.put('/:id', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const { title, content, metadata } = request.body;
      
      const section = await dataService.getSection(request.tenantId, id);
      
      if (!section) {
        return reply.code(404).send({
          error: 'Data not found'
        });
      }
      
      // Update the section
      const updatedSection = await dataService.updateSection(
        request.tenantId,
        id,
        { title, content, metadata }
      );
      
      return reply.send({
        success: true,
        data: updatedSection,
        message: 'Data updated successfully'
      });
    } catch (error) {
      return reply.code(500).send({
        error: 'Failed to update data',
        message: error.message
      });
    }
  });

  // Delete data item
  fastify.delete('/:id', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      await dataService.deleteSection(request.tenantId, id);
      
      return reply.send({
        success: true,
        message: 'Data deleted successfully'
      });
    } catch (error) {
      return reply.code(500).send({
        error: 'Failed to delete data',
        message: error.message
      });
    }
  });

  // Register data sections (original bulk endpoint)
  fastify.post('/bulk', {
    preHandler: [fastify.authenticate, fastify.rateLimiter]
  }, async (request, reply) => {
    try {
      const { sections } = registerDataSchema.parse(request.body);
      const result = await dataService.registerData(
        request.tenantId,
        sections,
        request.tenant.limits
      );
      
      return reply.code(201).send({
        success: true,
        data: result,
        message: 'Data registered and embeddings generated successfully'
      });
    } catch (error) {
      if (error.name === 'ZodError') {
        return reply.code(400).send({
          error: 'Validation error',
          details: error.errors
        });
      }
      
      return reply.code(400).send({
        error: 'Data registration failed',
        message: error.message
      });
    }
  });

  // List all sections
  fastify.get('/sections', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    try {
      const { skip = 0, limit = 50 } = request.query;
      const result = await dataService.listSections(
        request.tenantId,
        parseInt(skip),
        parseInt(limit)
      );
      
      return reply.send({
        success: true,
        data: result
      });
    } catch (error) {
      return reply.code(500).send({
        error: 'Failed to list sections',
        message: error.message
      });
    }
  });

  // Get specific section
  fastify.get('/sections/:sectionId', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    try {
      const { sectionId } = request.params;
      const section = await dataService.getSection(request.tenantId, sectionId);
      
      return reply.send({
        success: true,
        data: section
      });
    } catch (error) {
      return reply.code(404).send({
        error: 'Section not found',
        message: error.message
      });
    }
  });

  // Delete section
  fastify.delete('/sections/:sectionId', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    try {
      const { sectionId } = request.params;
      const result = await dataService.deleteSection(request.tenantId, sectionId);
      
      return reply.send({
        success: true,
        data: result,
        message: 'Section deleted successfully'
      });
    } catch (error) {
      return reply.code(500).send({
        error: 'Failed to delete section',
        message: error.message
      });
    }
  });

  // Get sections by type
  fastify.get('/sections/type/:type', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    try {
      const { type } = request.params;
      const sections = await dataService.getSectionsByType(request.tenantId, type);
      
      return reply.send({
        success: true,
        data: sections
      });
    } catch (error) {
      return reply.code(500).send({
        error: 'Failed to get sections',
        message: error.message
      });
    }
  });
}
