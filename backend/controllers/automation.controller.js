import Trigger from '../models/Trigger.js';
import Sequence from '../models/Sequence.js';
import AutomatedAction from '../models/AutomatedAction.js';

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

// --- AUTOMATED ACTIONS ---
export const getAutomatedActions = async (req, res) => {
    try {
        const actions = await AutomatedAction.find({ companyId: req.user?.companyId });
        res.status(200).json(actions);
    } catch (error) {
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
