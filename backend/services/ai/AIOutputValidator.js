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
            }).unknown(false),

            CONVERSATION_INTENT: Joi.object({
                intent: Joi.string().valid('RESPOND_USER', 'ESCALATE_HUMAN', 'CAPTURE_LEAD', 'MARKETING_SEND').required(),
                content: Joi.string().allow('').required(),
                confidence: Joi.number().min(0).max(1).required(),
                requestedAction: Joi.string().valid('SEND_WHATSAPP', 'SEND_EMAIL', 'NONE').allow(null).default('NONE')
            }).unknown(false),

            ADDRESS_RESULT: Joi.object({
                location: Joi.string().allow('', null).required(),
                city: Joi.string().allow('', null).required(),
                state: Joi.string().allow('', null).required(),
                country: Joi.string().allow('', null).required(),
                houseNumber: Joi.string().allow('', null).optional(),
                buildingName: Joi.string().allow('', null).optional(),
                street: Joi.string().allow('', null).optional(),
                locality: Joi.string().allow('', null).optional(),
                tehsil: Joi.string().allow('', null).optional(),
                postOffice: Joi.string().allow('', null).optional(),
                pincode: Joi.string().allow('', null).optional()
            }).unknown(false),

            ADDRESS_CONFLICT_RESOLUTION_RESULT: Joi.object({
                'Address PINCODE': Joi.string().valid('KEEP', 'UPDATE', 'MANUAL').optional(),
                'Address STATE': Joi.string().valid('KEEP', 'UPDATE', 'MANUAL').optional(),
                'Address CITY': Joi.string().valid('KEEP', 'UPDATE', 'MANUAL').optional(),
                'Address AREA': Joi.string().valid('KEEP', 'UPDATE', 'MANUAL').optional(),
                'Address LOCATION': Joi.string().valid('KEEP', 'UPDATE', 'MANUAL').optional(),
                'Address STREET': Joi.string().valid('KEEP', 'UPDATE', 'MANUAL').optional()
            }).unknown(false),

            LEAD_PROFILE_RESULT: Joi.object({
                requirement: Joi.string().valid('Buy', 'Rent', 'Investment').allow(null).required(),
                budgetMin: Joi.number().allow(null).required(),
                budgetMax: Joi.number().allow(null).required(),
                location: Joi.string().allow('', null).required(),
                summary: Joi.string().allow('', null).required(),
                propertyType: Joi.array().items(Joi.string()).optional(),
                softSignals: Joi.array().items(Joi.string()).optional(),
                suggestedWeights: Joi.object({
                    location: Joi.number().optional(),
                    budget: Joi.number().optional(),
                    type: Joi.number().optional()
                }).optional()
            }).unknown(false),

            TEXT_GENERATION_RESULT: Joi.object({
                content: Joi.string().max(50000).required()
            }).unknown(false),

            EMAIL_CONTENT_RESULT: Joi.object({
                subject: Joi.string().max(500).required(),
                body: Joi.string().max(50000).required()
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

    static validateDocumentExtraction(rawOutput) {
        const parsed = this._parseRawJSON(rawOutput);
        const { error, value } = this.SCHEMAS.DOCUMENT_EXTRACTION.validate(parsed, { abortEarly: false, stripUnknown: false });
        if (error) throw new AIValidationError('Document Extraction Schema Mismatch', { errors: error.details.map(d => d.message) });
        return value;
    }

    static validateConversationIntent(rawOutput) {
        const parsed = this._parseRawJSON(rawOutput);
        const { error, value } = this.SCHEMAS.CONVERSATION_INTENT.validate(parsed, { abortEarly: false, stripUnknown: false });
        if (error) throw new AIValidationError('Conversation Intent Schema Mismatch', { errors: error.details.map(d => d.message) });
        return value;
    }

    static validateAddressResult(rawOutput) {
        const parsed = this._parseRawJSON(rawOutput);
        const { error, value } = this.SCHEMAS.ADDRESS_RESULT.validate(parsed, { abortEarly: false, stripUnknown: false });
        if (error) throw new AIValidationError('Address Schema Mismatch', { errors: error.details.map(d => d.message) });
        return value;
    }

    static validateAddressConflictResolutionResult(rawOutput) {
        const parsed = this._parseRawJSON(rawOutput);
        const { error, value } = this.SCHEMAS.ADDRESS_CONFLICT_RESOLUTION_RESULT.validate(parsed, { abortEarly: false, stripUnknown: false });
        if (error) throw new AIValidationError('Address Conflict Resolution Schema Mismatch', { errors: error.details.map(d => d.message) });
        return value;
    }

    static validateLeadProfileResult(rawOutput) {
        const parsed = this._parseRawJSON(rawOutput);
        const { error, value } = this.SCHEMAS.LEAD_PROFILE_RESULT.validate(parsed, { abortEarly: false, stripUnknown: false });
        if (error) throw new AIValidationError('Lead Profile Schema Mismatch', { errors: error.details.map(d => d.message) });
        return value;
    }

    static validateTextGenerationResult(rawOutput) {
        let contentObj;
        if (typeof rawOutput === 'string') {
            try {
                contentObj = this._parseRawJSON(rawOutput);
                if (typeof contentObj !== 'object' || !contentObj.content) {
                    contentObj = { content: rawOutput };
                }
            } catch (err) {
                contentObj = { content: rawOutput };
            }
        } else {
            contentObj = rawOutput;
        }

        const { error, value } = this.SCHEMAS.TEXT_GENERATION_RESULT.validate(contentObj, { abortEarly: false, stripUnknown: false });
        if (error) throw new AIValidationError('Text Generation Schema Mismatch', { errors: error.details.map(d => d.message) });
        return value;
    }

    static validateEmailContentResult(rawOutput) {
        const parsed = this._parseRawJSON(rawOutput);
        const { error, value } = this.SCHEMAS.EMAIL_CONTENT_RESULT.validate(parsed, { abortEarly: false, stripUnknown: false });
        if (error) throw new AIValidationError('Email Content Schema Mismatch', { errors: error.details.map(d => d.message) });
        return value;
    }
}

export default AIOutputValidator;
