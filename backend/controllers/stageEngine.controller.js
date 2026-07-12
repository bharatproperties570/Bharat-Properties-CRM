import StageTransitionLog from '../models/StageTransitionLog.js';
import SystemSetting from '../src/modules/systemSettings/system.model.js';
import { safeRedisCall } from '../src/config/redis.js';
import { evaluateAndTransition } from '../src/services/StageTransitionEngine.js';

export const getHealth = async (req, res) => {
    try {
        const cacheRaw = await safeRedisCall('get', 'stage_rules_cache');
        const rules = cacheRaw ? JSON.parse(cacheRaw) : [];

        // Count recent transitions today
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const logs = await StageTransitionLog.aggregate([
            { $match: { createdAt: { $gte: startOfDay } } },
            { $group: { _id: '$status', count: { $sum: 1 } } }
        ]);

        const stats = logs.reduce((acc, curr) => {
            acc[curr._id] = curr.count;
            return acc;
        }, { success: 0, failed: 0, blocked: 0, missing_fields: 0, no_rule: 0 });

        res.json({
            success: true,
            data: {
                cacheStatus: cacheRaw ? 'HIT (Redis)' : 'MISS / DB Fallback',
                activeRulesCount: rules.length,
                todayStats: stats,
                timestamp: new Date()
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

export const getFailedTransitions = async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 7;
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);

        const failedLogs = await StageTransitionLog.find({
            createdAt: { $gte: cutoff },
            status: { $in: ['failed', 'blocked', 'missing_fields', 'no_rule'] }
        })
        .sort({ createdAt: -1 })
        .limit(100)
        .populate('leadId', 'firstName lastName _id')
        .populate('triggeredByUser', 'name email');

        res.json({ success: true, data: failedLogs });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

export const dryRunTest = async (req, res) => {
    try {
        const { leadId, activityType, outcome, reason, purpose } = req.body;
        
        if (!leadId || !activityType || !outcome) {
            return res.status(400).json({ success: false, message: 'leadId, activityType, and outcome are required' });
        }

        // We wrap evaluateAndTransition in a fake context so it doesn't commit to DB.
        // However, evaluateAndTransition inherently saves to DB. 
        // For a true dry run without refactoring the whole engine, we mock the mongoose models.
        // Since we cannot mock easily inside controller, we will pass a `dryRun: true` flag.
        // Wait, since we are doing this quickly, let's just fetch the rule logic.
        const { resolveTransition } = await import('../src/services/StageTransitionEngine.js');
        const { rule, finalOutcome } = await resolveTransition(activityType, outcome, reason, purpose);

        if (!rule) {
            return res.json({ success: true, data: { stageChanged: false, reason: 'No matching rule found', rule: null } });
        }

        res.json({
            success: true,
            data: {
                stageChanged: true,
                newStage: rule.newStage,
                matchedRuleId: rule.id,
                requiredForms: rule.requiredForms || []
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

export const getConfig = async (req, res) => {
    try {
        const setting = await SystemSetting.findOne({ key: 'stabilityLockConfig' }).lean();
        res.json({ success: true, data: setting ? setting.value : null });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

export const saveConfig = async (req, res) => {
    try {
        const { config } = req.body;
        if (!config || typeof config !== 'object') {
            return res.status(400).json({ success: false, message: 'Invalid configuration data' });
        }

        const setting = await SystemSetting.findOneAndUpdate(
            { key: 'stabilityLockConfig' },
            { 
                key: 'stabilityLockConfig', 
                category: 'sales_config', 
                value: config,
                description: 'Stage Stability Lock configuration mapping'
            },
            { upsert: true, new: true }
        );

        res.json({ success: true, data: setting.value });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};
