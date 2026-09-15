import mongoose from 'mongoose';
import Trigger from '../models/Trigger.js';
import Sequence from '../models/Sequence.js';
import AutomatedAction from '../models/AutomatedAction.js';
import AutomationLog from '../models/AutomationLog.js';

// --- TRIGGERS ---
export const getTriggers = async (req, res) => {
    try {
        const triggers = await Trigger.find({ companyId: req.user?.companyId }).sort({ priority: 1 });
        res.status(200).json(triggers);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const createTrigger = async (req, res) => {
    try {
        const trigger = new Trigger({ ...req.body, createdBy: req.user?.id, companyId: req.user?.companyId });
        await trigger.save();
        res.status(201).json(trigger);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const updateTrigger = async (req, res) => {
    try {
        const trigger = await Trigger.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.status(200).json(trigger);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const deleteTrigger = async (req, res) => {
    try {
        await Trigger.findByIdAndDelete(req.params.id);
        res.status(200).json({ message: 'Trigger deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// --- SEQUENCES ---
export const getSequences = async (req, res) => {
    try {
        const sequences = await Sequence.find({ companyId: req.user?.companyId });
        res.status(200).json(sequences);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const createSequence = async (req, res) => {
    try {
        const seq = new Sequence({ ...req.body, createdBy: req.user?.id, companyId: req.user?.companyId });
        await seq.save();
        res.status(201).json(seq);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const getSequenceById = async (req, res) => {
    try {
        const seq = await Sequence.findOne({ _id: req.params.id, companyId: req.user?.companyId });
        if (!seq) return res.status(404).json({ error: 'Sequence not found' });
        res.status(200).json(seq);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const updateSequence = async (req, res) => {
    try {
        const seq = await Sequence.findOneAndUpdate(
            { _id: req.params.id, companyId: req.user?.companyId },
            req.body,
            { new: true }
        );
        if (!seq) return res.status(404).json({ error: 'Sequence not found' });
        res.status(200).json(seq);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const deleteSequence = async (req, res) => {
    try {
        const seq = await Sequence.findOneAndDelete({ _id: req.params.id, companyId: req.user?.companyId });
        if (!seq) return res.status(404).json({ error: 'Sequence not found' });
        res.status(200).json({ message: 'Sequence deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// --- AUTOMATED ACTIONS ---
export const getAutomatedActions = async (req, res) => {
    try {
        const query = {};
        if (req.user?.companyId) query.companyId = req.user.companyId;

        const actions = await AutomatedAction.find(query).lean();

        // === ENTERPRISE: Resolve invokedByTrigger → human-readable name ===
        // invokedByTrigger is a Mixed field — it may be:
        //   (a) a valid ObjectId stored as ObjectId
        //   (b) a valid ObjectId stored as string
        //   (c) a plain string name (legacy, before trigger dropdown was added)
        //   (d) null / empty
        // Strategy: collect all valid ObjectIds → single batch query → build lookup map.
        // Non-ObjectId strings are treated as already-readable names (pass-through).

        const triggerIdSet = new Set();
        for (const a of actions) {
            const raw = a.invokedByTrigger;
            if (raw && mongoose.Types.ObjectId.isValid(String(raw))) {
                triggerIdSet.add(String(raw));
            }
        }

        // Single batch query — O(1) DB round-trip regardless of list size
        const triggerNameMap = {};
        if (triggerIdSet.size > 0) {
            const foundTriggers = await Trigger
                .find({ _id: { $in: [...triggerIdSet] } })
                .select('_id name')
                .lean();
            for (const t of foundTriggers) {
                triggerNameMap[t._id.toString()] = t.name;
            }
        }

        const enriched = actions.map(a => {
            const raw = a.invokedByTrigger;
            let invokedByTriggerName = null;

            if (!raw) {
                invokedByTriggerName = null; // not linked to any trigger
            } else if (mongoose.Types.ObjectId.isValid(String(raw))) {
                // ObjectId — resolve from map; if deleted trigger, mark clearly
                invokedByTriggerName = triggerNameMap[String(raw)] || `Deleted Trigger (${String(raw).slice(-6)})`;
            } else {
                // Legacy plain-string name — already readable, pass through
                invokedByTriggerName = String(raw);
            }

            return { ...a, invokedByTriggerName };
        });

        res.status(200).json(enriched);
    } catch (error) {
        console.error('[AutomatedActions] getAutomatedActions error:', error);
        res.status(500).json({ error: error.message });
    }
};

export const createAutomatedAction = async (req, res) => {
    try {
        const action = new AutomatedAction({ ...req.body, createdBy: req.user?.id, companyId: req.user?.companyId });
        await action.save();
        res.status(201).json(action);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const updateAutomatedAction = async (req, res) => {
    try {
        const action = await AutomatedAction.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!action) return res.status(404).json({ error: 'Action not found' });
        res.status(200).json(action);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const deleteAutomatedAction = async (req, res) => {
    try {
        const action = await AutomatedAction.findByIdAndDelete(req.params.id);
        if (!action) return res.status(404).json({ error: 'Action not found' });
        res.status(200).json({ message: 'Automated Action deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// --- AUDIT LOGS ---
export const getAuditLogs = async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 100, 500);
        const page = parseInt(req.query.page) || 1;
        const skip = (page - 1) * limit;

        const query = {};
        if (req.user?.companyId) query.companyId = req.user.companyId;

        // Fetch logs from AutomationLog collection (real DB, not in-memory)
        const [logs, total] = await Promise.all([
            AutomationLog.find(query)
                .sort({ executedAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            AutomationLog.countDocuments(query)
        ]);

        // === ENTERPRISE: Batch-resolve ruleId → human-readable action/trigger names ===
        const ruleIdsByType = { Trigger: new Set(), AutomatedAction: new Set(), Sequence: new Set(), ScoringRule: new Set() };
        for (const log of logs) {
            if (log.ruleId && log.ruleType && ruleIdsByType[log.ruleType]) {
                ruleIdsByType[log.ruleType].add(log.ruleId.toString());
            }
        }

        const nameMap = {};

        // Resolve Trigger names
        if (ruleIdsByType.Trigger.size > 0) {
            const triggers = await Trigger.find({ _id: { $in: [...ruleIdsByType.Trigger] } }).select('_id name').lean();
            triggers.forEach(t => { nameMap[t._id.toString()] = t.name; });
        }

        // Resolve AutomatedAction names
        if (ruleIdsByType.AutomatedAction.size > 0) {
            const actions = await AutomatedAction.find({ _id: { $in: [...ruleIdsByType.AutomatedAction] } }).select('_id name').lean();
            actions.forEach(a => { nameMap[a._id.toString()] = a.name; });
        }

        // Resolve Sequence names
        if (ruleIdsByType.Sequence.size > 0) {
            const sequences = await Sequence.find({ _id: { $in: [...ruleIdsByType.Sequence] } }).select('_id name').lean();
            sequences.forEach(s => { nameMap[s._id.toString()] = s.name; });
        }

        // Enrich logs with resolved names
        const enriched = logs.map(log => ({
            _id: log._id,
            timestamp: log.executedAt,
            actionName: log.ruleId ? (nameMap[log.ruleId.toString()] || `${log.ruleType} (${log.ruleId.toString().slice(-6)})`) : (log.ruleType || 'Unknown'),
            ruleType: log.ruleType,
            entityId: log.targetEntityId,
            targetModule: log.targetModule,
            success: log.status === 'success',
            status: log.status,
            details: log.details,
            executionTime: log.details?.executionTime || null
        }));

        res.status(200).json({ logs: enriched, total, page, limit });
    } catch (error) {
        console.error('[AutomatedActions] getAuditLogs error:', error);
        res.status(500).json({ error: error.message });
    }
};
