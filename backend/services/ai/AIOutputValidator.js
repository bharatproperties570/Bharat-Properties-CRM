import Joi from 'joi';
import { AppError } from '../../src/middlewares/error.middleware.js';

export class AIValidationError extends AppError {
    constructor(message, details = {}) {
        super(`AI Output Validation Failed: ${message}`, 422);
        this.name = 'AIValidationError';
        this.details = details;
        this.isAIValidationError = true;
    }
}

class AIOutputValidator {
    static get SCHEMAS() {
        return {
            DOCUMENT_EXTRACTION: Joi.object({
                price: Joi.string().allow(null).required(),
                size: Joi.string().allow(null).required(),
                location: Joi.string().allow(null).required(),
                intent: Joi.string().valid('BUYER', 'SELLER', 'TENANT', 'LANDLORD').allow(null).required(),
                property_type: Joi.string().allow(null).required()
            }).unknown(false), // Reject unexpected fields for safety

            CONVERSATION_INTENT: Joi.object({
                intent: Joi.string().valid('RESPOND_USER', 'ESCALATE_HUMAN', 'CAPTURE_LEAD', 'MARKETING_SEND').required(),
                content: Joi.string().allow('').required(),
                confidence: Joi.number().min(0).max(1).required(),
                requestedAction: Joi.string().valid('SEND_WHATSAPP', 'SEND_EMAIL', 'NONE').allow(null).default('NONE')
            }).unknown(false)
        };
    }

    /**
     * Parses raw AI text which may contain markdown JSON blocks.
     */
    static _parseRawJSON(rawOutput) {
        if (typeof rawOutput !== 'string') {
            if (typeof rawOutput === 'object' && rawOutput !== null) return rawOutput;
            throw new AIValidationError('Raw output must be a string or object');
        }

        let content = rawOutput.trim();
        // Robust JSON block extractor
        if (content.includes('```')) {
            const match = content.match(/```(?:json)?([\s\S]*?)```/);
            if (match) {
                content = match[1].trim();
            }
        }

        try {
            const parsed = JSON.parse(content);
            // Defend against prototype pollution
            if (parsed && typeof parsed === 'object') {
                const checkPollution = (obj) => {
                    if (obj && typeof obj === 'object') {
                        if (Object.prototype.hasOwnProperty.call(obj, '__proto__') || 
                            Object.prototype.hasOwnProperty.call(obj, 'constructor') || 
                            Object.prototype.hasOwnProperty.call(obj, 'prototype')) {
                            throw new Error('Prototype pollution detected');
                        }
                        for (const key in obj) {
                            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                                checkPollution(obj[key]);
                            }
                        }
                    }
                };
                checkPollution(parsed);
            }
            return parsed;
        } catch (err) {
            throw new AIValidationError(`Invalid JSON structure: ${err.message}`, { rawContent: rawOutput.substring(0, 100) });
        }
    }

    /**
     * Validates and normalizes document extraction output.
     */
    static validateDocumentExtraction(rawOutput) {
        const parsed = this._parseRawJSON(rawOutput);
        const { error, value } = this.SCHEMAS.DOCUMENT_EXTRACTION.validate(parsed, { abortEarly: false, stripUnknown: false });
        
        if (error) {
            throw new AIValidationError('Document Extraction Schema Mismatch', { 
                errors: error.details.map(d => d.message)
            });
        }
        
        return value;
    }

    /**
     * Validates and normalizes live conversation AI output.
     */
    static validateConversationIntent(rawOutput) {
        const parsed = this._parseRawJSON(rawOutput);
        const { error, value } = this.SCHEMAS.CONVERSATION_INTENT.validate(parsed, { abortEarly: false, stripUnknown: false });
        
        if (error) {
            throw new AIValidationError('Conversation Intent Schema Mismatch', { 
                errors: error.details.map(d => d.message)
            });
        }
        
        return value;
    }
}

export default AIOutputValidator;
