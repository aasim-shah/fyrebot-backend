import { z } from 'zod';

/**
 * Validation schemas for API requests
 */

export const registerTenantSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  businessName: z.string().min(2, 'Business name must be at least 2 characters').optional(),
  plan: z.enum(['free', 'pro', 'enterprise']).default('free'),
  metadata: z.record(z.any()).optional()
});

export const loginTenantSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required')
});

export const updateTenantSchema = z.object({
  businessName: z.string().min(2).optional(),
  metadata: z.record(z.any()).optional(),
  contactEmail: z.string().email().optional()
});

export const registerDataSchema = z.object({
  sections: z.array(z.object({
    type: z.enum(['faq', 'product', 'policy', 'general']),
    title: z.string().min(1, 'Title is required'),
    content: z.string().min(10, 'Content must be at least 10 characters'),
    metadata: z.record(z.any()).optional()
  })).min(1, 'At least one section is required')
});

export const chatQuerySchema = z.object({
  query: z.string().min(1, 'Query is required').max(500, 'Query too long'),
  sessionId: z.string().optional(),
  includeMetadata: z.boolean().optional().default(false)
});

export const updatePlanSchema = z.object({
  plan: z.enum(['free', 'pro', 'enterprise'])
});

export const vectorSearchSchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().min(1).max(20).optional().default(5),
  minScore: z.number().min(0).max(1).optional().default(0.70)
});
