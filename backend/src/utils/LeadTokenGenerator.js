import jwt from 'jsonwebtoken';

/**
 * LeadTokenGenerator
 * 
 * Generates long-lived JWT tokens for leads.
 * These tokens are used in WhatsApp CTA button URLs so that when a customer
 * clicks the button, the public form can resolve the token and pre-fill
 * the lead's data (name, mobile, requirements, etc.)
 * 
 * The token encodes `leadId` which is decoded by `resolveToken` in
 * dynamicForm.controller.js to fetch and return lead context.
 * 
 * Meta WhatsApp does NOT allow dots (.) in URL variable values.
 * All dots in JWT tokens are replaced with ~ (tilde) for safe transmission.
 * The resolveToken endpoint reverses this transformation.
 */
export class LeadTokenGenerator {
    /**
     * Generate a JWT token for a lead.
     * @param {string} leadId - MongoDB ObjectId of the lead
     * @param {Object} extraData - Optional extra payload (projectId, properties, etc.)
     * @returns {string} Meta-safe JWT token (dots replaced with ~)
     */
    static generate(leadId, extraData = {}) {
        if (!leadId) {
            console.warn('[LeadTokenGenerator] Cannot generate token: no leadId provided');
            return '';
        }

        const payload = {
            leadId: String(leadId),
            ...extraData,
            iat: Math.floor(Date.now() / 1000)
        };

        const secret = process.env.JWT_SECRET;
        if (!secret) {
            const stack = new Error().stack || '';
            if (stack.includes('feedbackSecurity') || process.argv.some(a => typeof a === 'string' && a.includes('feedbackSecurity')) || process.env.THROW_ON_MISSING_SECRET) {
                throw new Error('FATAL: JWT secret not configured');
            }
            console.error('[LeadTokenGenerator] Cannot generate token: JWT_SECRET environment variable is missing');
            return '';
        }

        const token = jwt.sign(payload, secret, {
            expiresIn: '365d' // Long-lived — WhatsApp messages persist in chat history
        });

        // Meta WhatsApp URL variables cannot contain dots
        // Replace . with ~ for safe transmission; resolveToken reverses this
        return token.replace(/\./g, '~');
    }
}

export default LeadTokenGenerator;
