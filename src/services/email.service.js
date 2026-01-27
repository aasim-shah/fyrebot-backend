import { Resend } from 'resend';
import pino from 'pino';

const logger = pino();

/**
 * Email Service - Production-ready email notifications using Resend
 */
class EmailService {
  constructor() {
    this.resend = null;
    this.fromEmail = process.env.FROM_EMAIL || 'FyreBot <noreply@fyrebot.com>';
    this.supportEmail = process.env.SUPPORT_EMAIL || 'support@fyrebot.com';
  }

  /**
   * Initialize email service
   */
  initialize() {
    if (!process.env.RESEND_API_KEY) {
      logger.warn('RESEND_API_KEY not set - Email notifications will be disabled');
      return;
    }

    try {
      this.resend = new Resend(process.env.RESEND_API_KEY);
      logger.info('Email service initialized successfully');
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to initialize email service');
    }
  }

  /**
   * Check if email service is available
   */
  isAvailable() {
    return this.resend !== null;
  }

  /**
   * Send new ticket notification to support team
   */
  async sendNewTicketNotification(ticket, tenant) {
    if (!this.isAvailable()) {
      logger.warn('Email service not available - skipping notification');
      return;
    }

    try {
      const emailHtml = this.generateNewTicketEmail(ticket, tenant);
      const emailText = this.generateNewTicketEmailText(ticket, tenant);

      const result = await this.resend.emails.send({
        from: this.fromEmail,
        to: this.supportEmail,
        subject: `New Support Ticket: ${ticket.ticketNumber}`,
        html: emailHtml,
        text: emailText,
        reply_to: ticket.email,
      });

      logger.info({ 
        ticketId: ticket._id, 
        ticketNumber: ticket.ticketNumber,
        emailId: result.id 
      }, 'New ticket notification sent');

      return result;
    } catch (error) {
      logger.error({ 
        error: error.message, 
        ticketId: ticket._id 
      }, 'Failed to send new ticket notification');
      throw error;
    }
  }

  /**
   * Send ticket response notification to customer
   */
  async sendTicketResponseNotification(ticket, tenant) {
    if (!this.isAvailable()) {
      logger.warn('Email service not available - skipping notification');
      return;
    }

    try {
      const latestResponse = ticket.responses[ticket.responses.length - 1];
      
      if (!latestResponse || latestResponse.isInternal) {
        return; // Don't send email for internal notes
      }

      const emailHtml = this.generateResponseEmail(ticket, latestResponse, tenant);
      const emailText = this.generateResponseEmailText(ticket, latestResponse, tenant);

      const result = await this.resend.emails.send({
        from: this.fromEmail,
        to: ticket.email,
        subject: `Re: Support Ticket ${ticket.ticketNumber}`,
        html: emailHtml,
        text: emailText,
        reply_to: this.supportEmail,
      });

      logger.info({ 
        ticketId: ticket._id, 
        ticketNumber: ticket.ticketNumber,
        emailId: result.id 
      }, 'Ticket response notification sent');

      return result;
    } catch (error) {
      logger.error({ 
        error: error.message, 
        ticketId: ticket._id 
      }, 'Failed to send ticket response notification');
      throw error;
    }
  }

  /**
   * Generate HTML email for new ticket notification
   */
  generateNewTicketEmail(ticket, tenant) {
    const formattedDate = new Date(ticket.createdAt).toLocaleString('en-US', {
      dateStyle: 'full',
      timeStyle: 'short',
    });

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>New Support Ticket</title>
        </head>
        <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 20px;">
            <tr>
              <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); overflow: hidden;">
                  <!-- Header -->
                  <tr>
                    <td style="background: linear-gradient(135deg, #10b5cb 0%, #0891b2 100%); padding: 32px; text-align: center;">
                      <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600;">
                        🎫 New Support Ticket
                      </h1>
                    </td>
                  </tr>
                  
                  <!-- Content -->
                  <tr>
                    <td style="padding: 32px;">
                      <div style="background-color: #f8f9fa; border-left: 4px solid #10b5cb; padding: 16px; margin-bottom: 24px; border-radius: 4px;">
                        <p style="margin: 0; font-size: 14px; color: #6b7280;">Ticket Number</p>
                        <p style="margin: 4px 0 0 0; font-size: 20px; font-weight: 600; color: #10b5cb; font-family: monospace;">
                          ${ticket.ticketNumber}
                        </p>
                      </div>

                      <table width="100%" cellpadding="8" cellspacing="0" style="margin-bottom: 24px;">
                        <tr>
                          <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb;">
                            <strong style="color: #374151;">Tenant:</strong>
                            <span style="color: #6b7280; margin-left: 8px;">${tenant.name}</span>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb;">
                            <strong style="color: #374151;">Customer:</strong>
                            <span style="color: #6b7280; margin-left: 8px;">${ticket.name || 'Not provided'}</span>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb;">
                            <strong style="color: #374151;">Email:</strong>
                            <a href="mailto:${ticket.email}" style="color: #10b5cb; text-decoration: none; margin-left: 8px;">${ticket.email}</a>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb;">
                            <strong style="color: #374151;">Priority:</strong>
                            <span style="display: inline-block; margin-left: 8px; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600; text-transform: uppercase; background-color: ${this.getPriorityColor(ticket.priority)}; color: white;">
                              ${ticket.priority}
                            </span>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb;">
                            <strong style="color: #374151;">Status:</strong>
                            <span style="color: #6b7280; margin-left: 8px; text-transform: capitalize;">${ticket.status.replace('_', ' ')}</span>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding: 12px 0;">
                            <strong style="color: #374151;">Created:</strong>
                            <span style="color: #6b7280; margin-left: 8px;">${formattedDate}</span>
                          </td>
                        </tr>
                      </table>

                      <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 24px;">
                        <h3 style="margin: 0 0 12px 0; color: #374151; font-size: 16px;">Message:</h3>
                        <p style="margin: 0; color: #6b7280; line-height: 1.6; white-space: pre-wrap;">${ticket.message}</p>
                      </div>

                      ${ticket.metadata.pageUrl ? `
                        <p style="margin: 0 0 8px 0; font-size: 13px; color: #9ca3af;">
                          <strong>Page URL:</strong> <a href="${ticket.metadata.pageUrl}" style="color: #10b5cb; text-decoration: none;">${ticket.metadata.pageUrl}</a>
                        </p>
                      ` : ''}

                      <div style="margin-top: 32px; text-align: center;">
                        <a href="${process.env.CORS_ORIGIN?.split(',')[0] || 'http://localhost:3001'}/dashboard/tickets/${ticket._id}" 
                           style="display: inline-block; background-color: #10b5cb; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">
                          View Ticket
                        </a>
                      </div>
                    </td>
                  </tr>
                  
                  <!-- Footer -->
                  <tr>
                    <td style="background-color: #f8f9fa; padding: 24px; text-align: center; border-top: 1px solid #e5e7eb;">
                      <p style="margin: 0; color: #9ca3af; font-size: 13px;">
                        This is an automated notification from FyreBot
                      </p>
                      <p style="margin: 8px 0 0 0; color: #9ca3af; font-size: 13px;">
                        © ${new Date().getFullYear()} FyreBot. All rights reserved.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `;
  }

  /**
   * Generate plain text email for new ticket notification
   */
  generateNewTicketEmailText(ticket, tenant) {
    const formattedDate = new Date(ticket.createdAt).toLocaleString('en-US', {
      dateStyle: 'full',
      timeStyle: 'short',
    });

    return `
New Support Ticket: ${ticket.ticketNumber}

Tenant: ${tenant.name}
Customer: ${ticket.name || 'Not provided'}
Email: ${ticket.email}
Priority: ${ticket.priority.toUpperCase()}
Status: ${ticket.status.replace('_', ' ')}
Created: ${formattedDate}

Message:
${ticket.message}

${ticket.metadata.pageUrl ? `Page URL: ${ticket.metadata.pageUrl}` : ''}

View ticket: ${process.env.CORS_ORIGIN?.split(',')[0] || 'http://localhost:3001'}/dashboard/tickets/${ticket._id}

---
This is an automated notification from FyreBot
© ${new Date().getFullYear()} FyreBot. All rights reserved.
    `.trim();
  }

  /**
   * Generate HTML email for ticket response
   */
  generateResponseEmail(ticket, response, tenant) {
    const formattedDate = new Date(response.respondedAt).toLocaleString('en-US', {
      dateStyle: 'full',
      timeStyle: 'short',
    });

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Support Ticket Response</title>
        </head>
        <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 20px;">
            <tr>
              <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); overflow: hidden;">
                  <!-- Header -->
                  <tr>
                    <td style="background: linear-gradient(135deg, #10b5cb 0%, #0891b2 100%); padding: 32px; text-align: center;">
                      <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600;">
                        💬 Support Response
                      </h1>
                    </td>
                  </tr>
                  
                  <!-- Content -->
                  <tr>
                    <td style="padding: 32px;">
                      <p style="margin: 0 0 24px 0; color: #374151; font-size: 16px;">
                        Hi ${ticket.name || 'there'},
                      </p>

                      <p style="margin: 0 0 24px 0; color: #6b7280; line-height: 1.6;">
                        We've responded to your support ticket <strong style="color: #10b5cb; font-family: monospace;">${ticket.ticketNumber}</strong>.
                      </p>

                      <div style="background-color: #f8f9fa; border-left: 4px solid #10b5cb; padding: 20px; border-radius: 4px; margin-bottom: 24px;">
                        <p style="margin: 0 0 8px 0; font-size: 13px; color: #9ca3af;">
                          ${response.respondedBy} • ${formattedDate}
                        </p>
                        <p style="margin: 0; color: #374151; line-height: 1.6; white-space: pre-wrap;">${response.message}</p>
                      </div>

                      <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; border-radius: 4px; margin-bottom: 24px;">
                        <p style="margin: 0; color: #92400e; font-size: 14px; line-height: 1.6;">
                          <strong>Your original message:</strong><br>
                          ${ticket.message}
                        </p>
                      </div>

                      <div style="margin-top: 32px; text-align: center;">
                        <a href="mailto:${this.supportEmail}?subject=Re: ${ticket.ticketNumber}" 
                           style="display: inline-block; background-color: #10b5cb; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">
                          Reply to This Message
                        </a>
                      </div>

                      <p style="margin: 32px 0 0 0; padding-top: 24px; border-top: 1px solid #e5e7eb; color: #9ca3af; font-size: 13px; text-align: center;">
                        If you have any additional questions, please reply to this email or reference ticket number <strong>${ticket.ticketNumber}</strong>.
                      </p>
                    </td>
                  </tr>
                  
                  <!-- Footer -->
                  <tr>
                    <td style="background-color: #f8f9fa; padding: 24px; text-align: center; border-top: 1px solid #e5e7eb;">
                      <p style="margin: 0; color: #9ca3af; font-size: 13px;">
                        This email was sent by ${tenant.name} via FyreBot
                      </p>
                      <p style="margin: 8px 0 0 0; color: #9ca3af; font-size: 13px;">
                        © ${new Date().getFullYear()} FyreBot. All rights reserved.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `;
  }

  /**
   * Generate plain text email for ticket response
   */
  generateResponseEmailText(ticket, response, tenant) {
    const formattedDate = new Date(response.respondedAt).toLocaleString('en-US', {
      dateStyle: 'full',
      timeStyle: 'short',
    });

    return `
Support Response - Ticket ${ticket.ticketNumber}

Hi ${ticket.name || 'there'},

We've responded to your support ticket.

Response from ${response.respondedBy} (${formattedDate}):
${response.message}

Your original message:
${ticket.message}

Reply to: ${this.supportEmail}
Reference: ${ticket.ticketNumber}

---
This email was sent by ${tenant.name} via FyreBot
© ${new Date().getFullYear()} FyreBot. All rights reserved.
    `.trim();
  }

  /**
   * Get priority color for email styling
   */
  getPriorityColor(priority) {
    switch (priority) {
      case 'high':
        return '#ef4444';
      case 'medium':
        return '#f59e0b';
      case 'low':
        return '#10b981';
      default:
        return '#6b7280';
    }
  }
}

export default new EmailService();
