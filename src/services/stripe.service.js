import Stripe from 'stripe';
import pino from 'pino';
import tenantService from './tenant.service.js';

const logger = pino();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

class StripeService {
  constructor() {
    this.stripe = stripe;
  }

  /**
   * Create a Stripe customer for a tenant
   */
  async createCustomer(tenantId, email, name) {
    try {
      const customer = await this.stripe.customers.create({
        email,
        name,
        metadata: {
          tenantId
        }
      });

      logger.info({ tenantId, customerId: customer.id }, 'Stripe customer created');
      return customer;
    } catch (error) {
      logger.error({ error: error.message, tenantId }, 'Failed to create Stripe customer');
      throw error;
    }
  }

  /**
   * Create a checkout session for Pro plan subscription
   */
  async createCheckoutSession(tenantId, email, successUrl, cancelUrl) {
    try {
      const tenant = await tenantService.getTenant(tenantId);
      
      // Create customer if doesn't exist
      let customerId = tenant.stripeCustomerId;
      if (!customerId) {
        const customer = await this.createCustomer(tenantId, email, tenant.name);
        customerId = customer.id;
        
        // Update tenant with customer ID
        await tenantService.updateTenant(tenantId, { stripeCustomerId: customerId });
      }

      const session = await this.stripe.checkout.sessions.create({
        customer: customerId,
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [
          {
            price: process.env.STRIPE_PRO_PLAN_PRICE_ID,
            quantity: 1,
          },
        ],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          tenantId
        },
        subscription_data: {
          metadata: {
            tenantId
          }
        }
      });

      logger.info({ tenantId, sessionId: session.id }, 'Checkout session created');
      return session;
    } catch (error) {
      logger.error({ error: error.message, tenantId }, 'Failed to create checkout session');
      throw error;
    }
  }

  /**
   * Create a billing portal session for managing subscription
   */
  async createBillingPortalSession(tenantId, returnUrl) {
    try {
      const tenant = await tenantService.getTenant(tenantId);
      
      if (!tenant.stripeCustomerId) {
        throw new Error('No Stripe customer found');
      }

      const session = await this.stripe.billingPortal.sessions.create({
        customer: tenant.stripeCustomerId,
        return_url: returnUrl,
      });

      logger.info({ tenantId, sessionId: session.id }, 'Billing portal session created');
      return session;
    } catch (error) {
      logger.error({ error: error.message, tenantId }, 'Failed to create billing portal session');
      throw error;
    }
  }

  /**
   * Handle subscription created webhook
   */
  async handleSubscriptionCreated(subscription) {
    try {
      const tenantId = subscription.metadata.tenantId;
      
      await tenantService.updateTenant(tenantId, {
        plan: 'pro',
        limits: {
          apiKeys: 4,
          dataFiles: 40,
          maxFileSize: 100 * 1024 * 1024, // 100MB
        },
        stripeSubscriptionId: subscription.id,
        stripeSubscriptionStatus: subscription.status,
        subscriptionStartDate: new Date(subscription.current_period_start * 1000),
        subscriptionEndDate: new Date(subscription.current_period_end * 1000)
      });

      logger.info({ tenantId, subscriptionId: subscription.id }, 'Subscription activated');
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to handle subscription created');
      throw error;
    }
  }

  /**
   * Handle subscription updated webhook
   */
  async handleSubscriptionUpdated(subscription) {
    try {
      const tenantId = subscription.metadata.tenantId;
      
      await tenantService.updateTenant(tenantId, {
        stripeSubscriptionStatus: subscription.status,
        subscriptionEndDate: new Date(subscription.current_period_end * 1000)
      });

      logger.info({ tenantId, subscriptionId: subscription.id }, 'Subscription updated');
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to handle subscription updated');
      throw error;
    }
  }

  /**
   * Handle subscription deleted/cancelled webhook
   */
  async handleSubscriptionDeleted(subscription) {
    try {
      const tenantId = subscription.metadata.tenantId;
      
      // Downgrade to free plan
      await tenantService.updateTenant(tenantId, {
        plan: 'free',
        limits: {
          apiKeys: 1,
          dataFiles: 10,
          maxFileSize: 10 * 1024 * 1024, // 10MB
        },
        stripeSubscriptionId: null,
        stripeSubscriptionStatus: 'canceled',
        subscriptionEndDate: new Date()
      });

      logger.info({ tenantId, subscriptionId: subscription.id }, 'Subscription cancelled - downgraded to free');
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to handle subscription deleted');
      throw error;
    }
  }

  /**
   * Handle payment failed webhook
   */
  async handlePaymentFailed(invoice) {
    try {
      const subscription = await this.stripe.subscriptions.retrieve(invoice.subscription);
      const tenantId = subscription.metadata.tenantId;
      
      await tenantService.updateTenant(tenantId, {
        stripeSubscriptionStatus: 'past_due'
      });

      logger.warn({ tenantId, invoiceId: invoice.id }, 'Payment failed');
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to handle payment failed');
      throw error;
    }
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(tenantId) {
    try {
      const tenant = await tenantService.getTenant(tenantId);
      
      if (!tenant.stripeSubscriptionId) {
        throw new Error('No active subscription found');
      }

      const subscription = await this.stripe.subscriptions.cancel(tenant.stripeSubscriptionId);
      
      logger.info({ tenantId, subscriptionId: subscription.id }, 'Subscription cancelled by user');
      return subscription;
    } catch (error) {
      logger.error({ error: error.message, tenantId }, 'Failed to cancel subscription');
      throw error;
    }
  }

  /**
   * Get subscription details
   */
  async getSubscription(tenantId) {
    try {
      const tenant = await tenantService.getTenant(tenantId);
      
      if (!tenant.stripeSubscriptionId) {
        return null;
      }

      const subscription = await this.stripe.subscriptions.retrieve(tenant.stripeSubscriptionId);
      
      return {
        id: subscription.id,
        status: subscription.status,
        currentPeriodStart: new Date(subscription.current_period_start * 1000),
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        cancelAtPeriodEnd: subscription.cancel_at_period_end
      };
    } catch (error) {
      logger.error({ error: error.message, tenantId }, 'Failed to get subscription');
      throw error;
    }
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(payload, signature) {
    try {
      return this.stripe.webhooks.constructEvent(
        payload,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (error) {
      logger.error({ error: error.message }, 'Invalid webhook signature');
      throw new Error('Invalid webhook signature');
    }
  }
}

export default new StripeService();
