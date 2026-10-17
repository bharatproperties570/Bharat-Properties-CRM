import Trigger from '../models/Trigger.js';
import Sequence from '../models/Sequence.js';
import AutomatedAction from '../models/AutomatedAction.js';

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
        const actions = await AutomatedAction.find(filter).sort({ createdAt: -1 });
        res.status(200).json(actions);
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
