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

        const token = jwt.sign(payload, process.env.JWT_SECRET || 'crm_secret_key', {
            expiresIn: '365d' // Long-lived — WhatsApp messages persist in chat history
        });

        // Meta WhatsApp URL variables cannot contain dots
        // Replace . with ~ for safe transmission; resolveToken reverses this
        return token.replace(/\./g, '~');
    }
}

export default LeadTokenGenerator;
