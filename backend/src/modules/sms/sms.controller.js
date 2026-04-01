import SmsProvider from './smsProvider.model.js';
import SmsTemplate from './smsTemplate.model.js';
import SmsLog from './smsLog.model.js';
import smsService from './sms.service.js';
import { AppError } from '../../middlewares/error.middleware.js';

const SENSITIVE_KEYS = {
    'Twilio': ['sid', 'token'],
    'SMSGatewayHub': ['apiKey'],
    'Custom HTTP': [] // User defined headers might be sensitive but hard to auto-detect without more complex logic
};

/**
 * Get all providers (with masked sensitive fields)
 */
export const getSmsProviders = async (req, res, next) => {
    try {
        const providers = await SmsProvider.find().sort({ provider: 1 });

        const maskedProviders = providers.map(p => {
            const providerObj = p.toObject();
            const sensitiveKeys = SENSITIVE_KEYS[p.provider] || [];

            // Mask sensitive fields in the config for frontend
            sensitiveKeys.forEach(key => {
                if (providerObj.config[key]) {
                    providerObj.config[key] = '••••••••••••••••';
                }
            });

            return providerObj;
        });

        res.status(200).json({
            success: true,
            data: maskedProviders
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Update or Create a provider configuration
 */
export const upsertSmsProvider = async (req, res, next) => {
    try {
        const { provider, config } = req.body;

        if (!provider || !config) {
            throw new AppError('Provider and config are required', 400);
        }

        const sensitiveKeys = SENSITIVE_KEYS[provider] || [];

        // Before encrypting, check if user sent masks. If they did, we don't update those fields.
        const existing = await SmsProvider.findOne({ provider });
        const finalConfig = { ...config };
        const keysToEncrypt = sensitiveKeys.filter(k => config[k] !== '••••••••••••••••');

        if (existing) {
            sensitiveKeys.forEach(key => {
                if (config[key] === '••••••••••••••••') {
                    finalConfig[key] = existing.config[key]; // Keep original encrypted value
                }
            });
        }

        // Encrypt new sensitive values
        const encryptedConfig = smsService.encryptConfig(finalConfig, keysToEncrypt);

        const updated = await SmsProvider.findOneAndUpdate(
            { provider },
            { config: encryptedConfig, status: 'Not Connected' },
            { new: true, upsert: true }
        );

        res.status(200).json({
            success: true,
            data: updated
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Activate a provider
 */
export const activateSmsProvider = async (req, res, next) => {
    try {
        const { provider } = req.params;

        const target = await SmsProvider.findOne({ provider });
        if (!target) {
            throw new AppError('Provider not found', 404);
        }

        target.isActive = true;
        await target.save();

        res.status(200).json({
            success: true,
            message: `${provider} is now the active SMS provider`
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Send a Test SMS
 */
export const testSmsConnection = async (req, res, next) => {
    try {
        const { provider, phone, message, config } = req.body;

        if (!provider || !phone || !message) {
            return res.status(200).json({ success: false, error: 'Provider, phone, and message are required' });
        }

        let finalConfig = config;

        // Mask Merging: If config exists and has masked values, pull them from the DB
        if (finalConfig) {
            const savedProvider = await SmsProvider.findOne({ provider });
            if (savedProvider && savedProvider.config) {
                const decryptedSaved = smsService._decryptConfig(savedProvider.config);
                for (const key in finalConfig) {
                    if (finalConfig[key] === '••••••••••••••••' && decryptedSaved[key]) {
                        finalConfig[key] = decryptedSaved[key];
                    }
                }
            }
        }

        // Execute test
        try {
            const testResult = await smsService.sendSMS(phone, `[TEST] ${message}`, { provider }, finalConfig);

            // Update status on success unconditionally
            const target = await SmsProvider.findOne({ provider });
            if (target) {
                target.status = 'Connected';
                target.lastTestedAt = new Date();
                await target.save();
            }

            res.status(200).json({
                success: true,
                data: testResult
            });
        } catch (smsError) {
            // Functional error during SMS sending (e.g. invalid credentials)
            console.warn('[Test SMS Functional Failure]', smsError.message);

            if (smsError.message && smsError.message.includes('Invalid template text')) {
                const target = await SmsProvider.findOne({ provider });
                if (target) {
                    target.status = 'Connected';
                    target.lastTestedAt = new Date();
                    await target.save();
                }

                return res.status(200).json({
                    success: true,
                    data: {
                        success: true,
                        provider,
                        warning: "Gateway connected successfully, but the random test string was blocked by DLT filtering. This confirms credentials are correct. Real messages using registered templates will be delivered."
                    }
                });
            }

            // Update status on failure unconditionally
            const target = await SmsProvider.findOne({ provider });
            if (target) {
                target.status = 'Error';
                await target.save();
            }

            return res.status(200).json({
                success: false,
                error: smsError.message
            });
        }
    } catch (error) {
        // Unexpected system error
        console.error('[Test SMS System Error]', error);
        next(error);
    }
};

/**
 * Send SMS (Production)
 */
export const sendSms = async (req, res, next) => {
    try {
        const { recipients, content, schedule } = req.body;

        if (!recipients || !recipients.length) {
            return res.status(400).json({ success: false, error: 'At least one recipient is required' });
        }
        if (!content || (!content.body && !content.templateId)) {
            return res.status(400).json({ success: false, error: 'Message body or templateId is required' });
        }

        // For now, we only handle direct send. Scheduling can be a future feature or handled via BullMQ.
        if (schedule && schedule.date) {
            console.warn('[sms.controller.js] Scheduling requested but not yet fully implemented synchronously');
            // Depending on architecture, you'd enqueue to a Job Queue here.
        }

        const results = {
            successCount: 0,
            failedCount: 0,
            errors: []
        };

        // Send to each recipient
        for (const recipient of recipients) {
            let phone = recipient.phone || recipient.mobile || (typeof recipient === 'string' ? recipient : null);

            if (!phone) {
                results.failedCount++;
                results.errors.push({ recipient, error: 'No valid phone number found' });
                continue;
            }

            try {
                if (content.templateId && !content.body) {
                    // Send via template if only ID is provided (if body is provided, UI already resolved template text)
                    await smsService.sendSMSWithTemplate(phone, content.templateId, { Name: recipient.name || '' }, { entityType: 'Contact', entityId: recipient._id || null });
                } else {
                    // Direct Send
                    let messageBody = content.body;

                    // Basic merge field replacement for 'Name'
                    if (messageBody && messageBody.includes('{{Name}}')) {
                        messageBody = messageBody.replace(/\{\{Name\}\}/g, recipient.name || 'User');
                    }
                    if (messageBody && messageBody.includes('{{Phone}}')) {
                        messageBody = messageBody.replace(/\{\{Phone\}\}/g, phone);
                    }

                    let msgContext = { entityType: 'Contact', entityId: recipient._id || null };
                    if (content.templateId) {
                        try {
                            const template = await SmsTemplate.findById(content.templateId);
                            if (template) {
                                msgContext.dltTemplateId = template.dltTemplateId;
                                msgContext.dltHeaderId = template.dltHeaderId;
                                msgContext.category = template.category;
                            }
                        } catch (e) { /* ignore cast errors */ }
                    }

                    await smsService.sendSMS(phone, messageBody, msgContext);
                }
                results.successCount++;
            } catch (err) {
                results.failedCount++;
                results.errors.push({ phone, error: err.message });
            }
        }

        return res.status(200).json({
            success: true,
            message: `Sent successfully to ${results.successCount}, failed for ${results.failedCount}`,
            data: results
        });

    } catch (error) {
        console.error('[Send SMS Error]', error);
        next(error);
    }
};

// --- Template Management ---

export const getSmsTemplates = async (req, res, next) => {
    try {
        const templates = await SmsTemplate.find().sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: templates });
    } catch (error) {
        next(error);
    }
};

export const upsertSmsTemplate = async (req, res, next) => {
    try {
        const { id, name, body, category, dltTemplateId, dltHeaderId, isActive } = req.body;
        let template;

        if (id) {
            template = await SmsTemplate.findByIdAndUpdate(id,
                { name, body, category, dltTemplateId, dltHeaderId, isActive },
                { new: true, runValidators: true }
            );
        } else {
            template = await SmsTemplate.create({ name, body, category, dltTemplateId, dltHeaderId, isActive });
        }

        res.status(200).json({ success: true, data: template });
    } catch (error) {
        next(error);
    }
};

export const deleteSmsTemplate = async (req, res, next) => {
    try {
        await SmsTemplate.findByIdAndDelete(req.params.id);
        res.status(200).json({ success: true, message: 'Template deleted' });
    } catch (error) {
        next(error);
    }
};

// --- Log Management ---

export const getSmsLogs = async (req, res, next) => {
    try {
        const { page = 1, limit = 50, status, provider } = req.query;
        const query = {};
        if (status) query.status = status;
        if (provider) query.provider = provider;

        const total = await SmsLog.countDocuments(query);
        const logs = await SmsLog.find(query)
            .sort({ createdAt: -1 })
            .skip((Number(page) - 1) * Number(limit))
            .limit(Number(limit));

        res.status(200).json({
            success: true,
            data: logs,
            pagination: {
                total,
                page: Number(page),
                limit: Number(limit),
                pages: Math.ceil(total / Number(limit))
            }
        });
    } catch (error) {
        next(error);
    }
};
