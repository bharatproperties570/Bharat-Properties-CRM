import mongoose from 'mongoose';
import Trigger from '../models/Trigger.js';
import Sequence from '../models/Sequence.js';
import AutomatedAction from '../models/AutomatedAction.js';
import AutomationLog from '../models/AutomationLog.js';

// --- TRIGGERS ---
export const getTriggers = async (req, res) => {
    try {
        const companyId = req.user?.companyId || req.user?.tenantId;
        const filter = companyId ? { companyId } : {};
        const triggers = await Trigger.find(filter).sort({ priority: 1 });
        res.status(200).json(triggers);
    } catch (error) {
        console.error('[getTriggers] Error:', error);
        res.status(500).json({ error: error.message });
    }
};

export const createTrigger = async (req, res) => {
    try {
        const userId = req.user?._id || req.user?.id;
        const companyId = req.user?.companyId || req.user?.tenantId || undefined;
        const triggerData = { ...req.body };
        
        const trigger = new Trigger({
            ...triggerData,
            createdBy: userId,
            ...(companyId ? { companyId } : {})
        });
        await trigger.save();
        res.status(201).json(trigger);
    } catch (error) {
        console.error('[createTrigger] Error:', error);
        res.status(400).json({ error: error.message });
    }
};

export const updateTrigger = async (req, res) => {
    try {
        const trigger = await Trigger.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!trigger) return res.status(404).json({ error: 'Trigger not found' });
        res.status(200).json(trigger);
    } catch (error) {
        console.error('[updateTrigger] Error:', error);
        res.status(400).json({ error: error.message });
    }
};

export const deleteTrigger = async (req, res) => {
    try {
        const trigger = await Trigger.findByIdAndDelete(req.params.id);
        if (!trigger) return res.status(404).json({ error: 'Trigger not found' });
        res.status(200).json({ message: 'Trigger deleted successfully' });
    } catch (error) {
        console.error('[deleteTrigger] Error:', error);
        res.status(500).json({ error: error.message });
    }
};

// --- SEQUENCES ---
export const getSequences = async (req, res) => {
    try {
        const companyId = req.user?.companyId || req.user?.tenantId;
        const filter = companyId ? { companyId } : {};
        const sequences = await Sequence.find(filter).sort({ createdAt: -1 });
        res.status(200).json(sequences);
    } catch (error) {
        console.error('[getSequences] Error:', error);
        res.status(500).json({ error: error.message });
    }
};

const cleanSequencePayload = (data) => {
    const cleaned = { ...data };
    if (Array.isArray(cleaned.steps)) {
        cleaned.steps = cleaned.steps.map(s => {
            const step = { ...s };
            if (step.action) {
                step.action = { ...step.action };
                if (!step.action.automatedActionId || step.action.automatedActionId === '') {
                    delete step.action.automatedActionId;
                }
            }
            return step;
        });
    }
    if (Array.isArray(cleaned.linkedTriggers)) {
        cleaned.linkedTriggers = cleaned.linkedTriggers.filter(id => id && id !== '');
    }
    return cleaned;
};

export const createSequence = async (req, res) => {
    try {
        const userId = req.user?._id || req.user?.id;
        const companyId = req.user?.companyId || req.user?.tenantId || undefined;
        const seqData = cleanSequencePayload(req.body);

        const seq = new Sequence({
            ...seqData,
            createdBy: userId,
            ...(companyId ? { companyId } : {})
        });
        await seq.save();
        res.status(201).json(seq);
    } catch (error) {
        console.error('[createSequence] Error:', error);
        res.status(400).json({ error: error.message });
    }
};

export const getSequenceById = async (req, res) => {
    try {
        const companyId = req.user?.companyId || req.user?.tenantId;
        const filter = { _id: req.params.id, ...(companyId ? { companyId } : {}) };
        const seq = await Sequence.findOne(filter);
        if (!seq) return res.status(404).json({ error: 'Sequence not found' });
        res.status(200).json(seq);
    } catch (error) {
        console.error('[getSequenceById] Error:', error);
        res.status(500).json({ error: error.message });
    }
};

export const updateSequence = async (req, res) => {
    try {
        const companyId = req.user?.companyId || req.user?.tenantId;
        const filter = { _id: req.params.id, ...(companyId ? { companyId } : {}) };
        const seqData = cleanSequencePayload(req.body);
        const seq = await Sequence.findOneAndUpdate(
            filter,
            seqData,
            { new: true }
        );
        if (!seq) return res.status(404).json({ error: 'Sequence not found' });
        res.status(200).json(seq);
    } catch (error) {
        console.error('[updateSequence] Error:', error);
        res.status(400).json({ error: error.message });
    }
};

export const deleteSequence = async (req, res) => {
    try {
        const companyId = req.user?.companyId || req.user?.tenantId;
        const filter = { _id: req.params.id, ...(companyId ? { companyId } : {}) };
        const seq = await Sequence.findOneAndDelete(filter);
        if (!seq) return res.status(404).json({ error: 'Sequence not found' });
        res.status(200).json({ message: 'Sequence deleted successfully' });
    } catch (error) {
        console.error('[deleteSequence] Error:', error);
        res.status(500).json({ error: error.message });
    }
};

// --- AUTOMATED ACTIONS ---
export const getAutomatedActions = async (req, res) => {
    try {
        const companyId = req.user?.companyId || req.user?.tenantId;
        const filter = companyId ? { companyId } : {};
        const actions = await AutomatedAction.find(filter).sort({ createdAt: -1 }).lean();

        // Batch resolve invokedByTrigger IDs -> Trigger names
        const triggerIdSet = new Set();
        for (const a of actions) {
            const raw = a.invokedByTrigger;
            if (raw && mongoose.Types.ObjectId.isValid(String(raw))) {
                triggerIdSet.add(String(raw));
            }
        }

        const triggerNameMap = {};
        if (triggerIdSet.size > 0) {
            const foundTriggers = await Trigger.find({ _id: { $in: [...triggerIdSet] } })
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
                invokedByTriggerName = null;
            } else if (mongoose.Types.ObjectId.isValid(String(raw))) {
                invokedByTriggerName = triggerNameMap[String(raw)] || `Deleted Trigger (${String(raw).slice(-6)})`;
            } else {
                invokedByTriggerName = String(raw);
            }

            return { ...a, invokedByTriggerName };
        });

        res.status(200).json(enriched);
    } catch (error) {
        console.error('[getAutomatedActions] Error:', error);
        res.status(500).json({ error: error.message });
    }
};

export const createAutomatedAction = async (req, res) => {
    try {
        const actionData = { ...req.body };
        if (!actionData.name || actionData.name.trim() === '') {
            return res.status(400).json({ error: 'Action name is required' });
        }
        if (!actionData.invokedByTrigger || actionData.invokedByTrigger === '') {
            delete actionData.invokedByTrigger;
        }
        const userId = req.user?._id || req.user?.id;
        const companyId = req.user?.companyId || req.user?.tenantId || undefined;

        console.log(`[createAutomatedAction] Creating action "${actionData.name}" (Type: ${actionData.actionType}) by user ${userId}`);
        const action = new AutomatedAction({
            ...actionData,
            createdBy: userId,
            ...(companyId ? { companyId } : {})
        });
        await action.save();
        console.log(`[createAutomatedAction] Action created successfully with id ${action._id}`);
        res.status(201).json(action);
    } catch (error) {
        console.error('[createAutomatedAction] Error:', error);
        res.status(400).json({ error: error.message || 'Failed to create automated action' });
    }
};

export const updateAutomatedAction = async (req, res) => {
    try {
        const updateData = { ...req.body };
        if (updateData.invokedByTrigger === '') {
            updateData.invokedByTrigger = null;
        }
        const action = await AutomatedAction.findByIdAndUpdate(req.params.id, updateData, { new: true });
        if (!action) return res.status(404).json({ error: 'Action not found' });
        res.status(200).json(action);
    } catch (error) {
        console.error('[updateAutomatedAction] Error:', error);
        res.status(400).json({ error: error.message || 'Failed to update automated action' });
    }
};

export const deleteAutomatedAction = async (req, res) => {
    try {
        const action = await AutomatedAction.findByIdAndDelete(req.params.id);
        if (!action) return res.status(404).json({ error: 'Action not found' });
        res.status(200).json({ message: 'Automated Action deleted successfully' });
    } catch (error) {
        console.error('[deleteAutomatedAction] Error:', error);
        res.status(500).json({ error: error.message });
    }
};

// --- AUDIT LOGS ---
export const getAuditLogs = async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 100, 500);
        const page = parseInt(req.query.page) || 1;
        const skip = (page - 1) * limit;

        const companyId = req.user?.companyId || req.user?.tenantId;
        const query = companyId ? { $or: [{ companyId }, { tenantId: companyId }] } : {};

        // Fetch logs from AutomationLog collection (real DB, not in-memory)
        const [logs, total] = await Promise.all([
            AutomationLog.find(query)
                .sort({ executedAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            AutomationLog.countDocuments(query)
        ]);

        // Batch-resolve ruleId -> human-readable action/trigger/sequence names
        const ruleIdsByType = { Trigger: new Set(), AutomatedAction: new Set(), Sequence: new Set() };
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
        console.error('[getAuditLogs] Error:', error);
        res.status(500).json({ error: error.message });
    }
};

// --- SEQUENCE ENROLLMENT ---
export const enrollEntityInSequence = async (req, res) => {
    try {
        const { id } = req.params;
        const { entityId, module = 'deals' } = req.body;
        const companyId = req.user?.companyId || req.user?.tenantId;

        if (!id || !entityId) {
            return res.status(400).json({ error: 'sequenceId and entityId are required' });
        }

        const seq = await Sequence.findById(id);
        if (!seq) return res.status(404).json({ error: 'Sequence not found' });

        const { SequenceEngine } = await import('../src/utils/SequenceEngine.js');
        const result = await SequenceEngine.enroll(seq, { _id: entityId }, module || seq.module || 'deals', companyId);

        res.status(200).json({
            success: true,
            enrolled: !!result?.enrolled,
            alreadyEnrolled: !!result?.alreadyEnrolled,
            message: result?.alreadyEnrolled ? 'Entity is already actively enrolled in this sequence' : 'Enrolled successfully',
            data: result?.enrollment
        });
    } catch (error) {
        console.error('[enrollEntityInSequence] Error:', error);
        res.status(500).json({ error: error.message });
    }
};

export const getEntityEnrollments = async (req, res) => {
    try {
        const { entityId } = req.params;
        const SequenceEnrollment = (await import('../models/SequenceEnrollment.js')).default;
        const enrollments = await SequenceEnrollment.find({ entityId }).populate('sequenceId');
        res.status(200).json(enrollments);
    } catch (error) {
        console.error('[getEntityEnrollments] Error:', error);
        res.status(500).json({ error: error.message });
    }
};
