import ParsingRule from './parsingRule.model.js';
import ParsingRuleAudit from './parsingRuleAudit.model.js';
import { clearPatternsCache } from '../intake/intakeParser.js';

export const getRules = async (req, res) => {
    try {
        const query = {};
        if (req.user && req.user.tenantId) {
            query.$or = [
                { tenantId: req.user.tenantId },
                { tenantId: null },
                { tenantId: { $exists: false } }
            ];
        }
        const rules = await ParsingRule.find(query).sort({ createdAt: -1 });
        res.status(200).json({
            success: true,
            data: rules
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

export const addRule = async (req, res) => {
    try {
        const { type, value, category } = req.body;

        if (!type || !value) {
            return res.status(400).json({
                success: false,
                message: "Type and Value are required."
            });
        }

        const payload = {
            type,
            value,
            category,
            lastUpdatedBy: req.user ? req.user._id : null
        };
        if (req.user && req.user.tenantId) {
            payload.tenantId = req.user.tenantId;
        }

        const rule = await ParsingRule.create(payload);

        // Audit Logging
        try {
            await ParsingRuleAudit.create({
                tenantId: req.user?.tenantId || null,
                ruleId: rule._id,
                action: 'CREATE',
                newValue: rule.toObject(),
                changedBy: req.user ? req.user._id : null
            });
        } catch (auditErr) {
            console.error('[ParsingRuleAudit:Error] Failed to log rule creation:', auditErr);
        }

        clearPatternsCache(req.user?.tenantId);

        res.status(201).json({
            success: true,
            data: rule
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({
                success: false,
                message: "This parsing rule already exists."
            });
        }
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

export const deleteRule = async (req, res) => {
    try {
        const query = { _id: req.params.id };
        if (req.user && req.user.tenantId) {
            query.tenantId = req.user.tenantId;
        }
        const rule = await ParsingRule.findOneAndDelete(query);

        if (!rule) {
            return res.status(404).json({
                success: false,
                message: "Rule not found."
            });
        }

        // Audit Logging
        try {
            await ParsingRuleAudit.create({
                tenantId: req.user?.tenantId || null,
                ruleId: rule._id,
                action: 'DELETE',
                oldValue: rule.toObject(),
                changedBy: req.user ? req.user._id : null
            });
        } catch (auditErr) {
            console.error('[ParsingRuleAudit:Error] Failed to log rule deletion:', auditErr);
        }

        clearPatternsCache(req.user?.tenantId);

        res.status(200).json({
            success: true,
            data: {}
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

export const bulkAddRules = async (req, res) => {
    try {
        const { rules } = req.body;

        if (!Array.isArray(rules)) {
            return res.status(400).json({
                success: false,
                message: "Rules must be an array."
            });
        }

        const mappedRules = rules.map(rule => {
            const r = { ...rule };
            if (req.user && req.user.tenantId) {
                r.tenantId = req.user.tenantId;
            }
            return r;
        });

        let newRules;
        try {
            newRules = await ParsingRule.insertMany(mappedRules, { ordered: false });
        } catch (error) {
            // Handle partial success logging
            const insertedRules = error.insertedDocs || [];
            if (insertedRules.length > 0) {
                try {
                    const auditLogs = insertedRules.map(rule => ({
                        tenantId: req.user?.tenantId || null,
                        ruleId: rule._id,
                        action: 'CREATE',
                        newValue: rule instanceof ParsingRule ? rule.toObject() : rule,
                        changedBy: req.user ? req.user._id : null
                    }));
                    await ParsingRuleAudit.insertMany(auditLogs, { ordered: false });
                } catch (auditErr) {
                    console.error('[ParsingRuleAudit:Error] Failed to log partial bulk rule creation:', auditErr);
                }
            }
            clearPatternsCache(req.user?.tenantId);
            return res.status(400).json({
                success: false,
                message: error.message,
                partialData: error.insertedDocs
            });
        }

        // Handle full success logging
        try {
            const auditLogs = newRules.map(rule => ({
                tenantId: req.user?.tenantId || null,
                ruleId: rule._id,
                action: 'CREATE',
                newValue: rule.toObject(),
                changedBy: req.user ? req.user._id : null
            }));
            if (auditLogs.length > 0) {
                await ParsingRuleAudit.insertMany(auditLogs, { ordered: false });
            }
        } catch (auditErr) {
            console.error('[ParsingRuleAudit:Error] Failed to log bulk rule creation:', auditErr);
        }

        clearPatternsCache(req.user?.tenantId);

        res.status(201).json({
            success: true,
            data: newRules
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

export const clearCacheEndpoint = async (req, res) => {
    try {
        clearPatternsCache(req.user?.tenantId);
        res.status(200).json({
            success: true,
            message: "Parsing rules cache cleared successfully."
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

export const getAuditLogs = async (req, res) => {
    try {
        const query = {};
        if (req.user && req.user.tenantId) {
            query.tenantId = req.user.tenantId;
        } else {
            query.$or = [
                { tenantId: null },
                { tenantId: { $exists: false } }
            ];
        }

        const logs = await ParsingRuleAudit.find(query)
            .populate('changedBy', 'fullName email')
            .sort({ createdAt: -1 })
            .limit(100);

        res.status(200).json({
            success: true,
            data: logs
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};
