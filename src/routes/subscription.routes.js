import stripeService from '../services/stripe.service.js';

export default async function subscriptionRoutes(fastify, options) {
  /**
   * Create checkout session for Pro plan
   */
  fastify.post('/checkout', {
    preHandler: [fastify.authenticateJWT]
  }, async (request, reply) => {
    try {
      const { tenantId } = request;
      const { email } = request.tenant;
      const { successUrl, cancelUrl } = request.body;

      if (!successUrl || !cancelUrl) {
        return reply.code(400).send({
          error: 'Bad Request',
          message: 'successUrl and cancelUrl are required'
        });
      }

      const session = await stripeService.createCheckoutSession(
        tenantId,
        email,
        successUrl,
        cancelUrl
      );

      return {
        sessionId: session.id,
        url: session.url
      };
    } catch (error) {
      request.log.error(error);
      return reply.code(500).send({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  });

  /**
   * Create billing portal session
   */
  fastify.post('/billing-portal', {
    preHandler: [fastify.authenticateJWT]
  }, async (request, reply) => {
    try {
      const { tenantId } = request;
      const { returnUrl } = request.body;

      if (!returnUrl) {
        return reply.code(400).send({
          error: 'Bad Request',
          message: 'returnUrl is required'
        });
      }

      const session = await stripeService.createBillingPortalSession(tenantId, returnUrl);

      return {
        url: session.url
      };
    } catch (error) {
      request.log.error(error);
      return reply.code(500).send({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  });

  /**
   * Get subscription details
   */
  fastify.get('/subscription', {
    preHandler: [fastify.authenticateJWT]
  }, async (request, reply) => {
    try {
      const { tenantId } = request;
      const subscription = await stripeService.getSubscription(tenantId);

      return {
        subscription
      };
    } catch (error) {
      request.log.error(error);
      return reply.code(500).send({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  });

  /**
   * Cancel subscription
   */
  fastify.post('/cancel', {
    preHandler: [fastify.authenticateJWT]
  }, async (request, reply) => {
    try {
      const { tenantId } = request;
      await stripeService.cancelSubscription(tenantId);

      return {
        success: true,
        message: 'Subscription cancelled successfully'
      };
    } catch (error) {
      request.log.error(error);
      return reply.code(500).send({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  });

  /**
   * Stripe webhook endpoint
   * Use content parser: false to get raw body for signature verification
   */
  fastify.post('/webhook', {
    config: {
      rawBody: true
    },
    bodyLimit: 1048576 // 1MB for webhook payloads
  }, async (request, reply) => {
    try {
      const signature = request.headers['stripe-signature'];
      
      if (!signature) {
        return reply.code(400).send({
          error: 'Bad Request',
          message: 'Missing stripe-signature header'
        });
      }

      // Get raw body from request
      const payload = request.body;
      
      const event = stripeService.verifyWebhookSignature(
        typeof payload === 'string' ? payload : JSON.stringify(payload),
        signature
      );

      // Handle different webhook events
      switch (event.type) {
        case 'customer.subscription.created':
          await stripeService.handleSubscriptionCreated(event.data.object);
          break;
        
        case 'customer.subscription.updated':
          await stripeService.handleSubscriptionUpdated(event.data.object);
          break;
        
        case 'customer.subscription.deleted':
          await stripeService.handleSubscriptionDeleted(event.data.object);
          break;
        
        case 'invoice.payment_failed':
          await stripeService.handlePaymentFailed(event.data.object);
          break;
        
        default:
          request.log.info({ eventType: event.type }, 'Unhandled webhook event');
      }

      return { received: true };
    } catch (error) {
      request.log.error(error);
      return reply.code(400).send({
        error: 'Bad Request',
        message: error.message
      });
    }
  });

  /**
   * Get pricing plans
   */
  fastify.get('/plans', async (request, reply) => {
    return {
      plans: [
        {
          id: 'free',
          name: 'Free',
          price: 0,
          currency: 'USD',
          interval: 'month',
          features: {
            apiKeys: 1,
            dataFiles: 10,
            maxFileSize: '10MB',
            chatbots: 1
          },
          limits: {
            apiKeys: 1,
            dataFiles: 10,
            maxFileSize: 10 * 1024 * 1024
          }
        },
        {
          id: 'pro',
          name: 'Pro',
          price: 9.99,
          currency: 'USD',
          interval: 'month',
          features: {
            apiKeys: 4,
            dataFiles: 40,
            maxFileSize: '100MB',
            chatbots: 4
          },
          limits: {
            apiKeys: 4,
            dataFiles: 40,
            maxFileSize: 100 * 1024 * 1024
          },
          stripePriceId: process.env.STRIPE_PRO_PLAN_PRICE_ID
        }
      ]
    };
  });
}
