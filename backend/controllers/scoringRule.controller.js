import ScoringRule from '../models/ScoringRule.js';

// Get all scoring rules for the company
export const getScoringRules = async (req, res) => {
    try {
        const rules = await ScoringRule.find({ companyId: req.user?.companyId });
        res.status(200).json({ success: true, data: rules });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Create a new scoring rule
export const createScoringRule = async (req, res) => {
    try {
        const rule = new ScoringRule({
            ...req.body,
            companyId: req.user?.companyId
        });
        await rule.save();
        res.status(201).json({ success: true, data: rule });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Update an existing scoring rule
export const updateScoringRule = async (req, res) => {
    try {
        const rule = await ScoringRule.findOneAndUpdate(
            { _id: req.params.id, companyId: req.user?.companyId },
            req.body,
            { new: true, runValidators: true }
        );
        if (!rule) {
            return res.status(404).json({ success: false, message: 'Scoring rule not found' });
        }
        res.status(200).json({ success: true, data: rule });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Delete a scoring rule
export const deleteScoringRule = async (req, res) => {
    try {
        const rule = await ScoringRule.findOneAndDelete({
            _id: req.params.id,
            companyId: req.user?.companyId
        });
        if (!rule) {
            return res.status(404).json({ success: false, message: 'Scoring rule not found' });
        }
        res.status(200).json({ success: true, message: 'Scoring rule deleted' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
