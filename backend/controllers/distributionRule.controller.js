import DistributionRule from "../models/DistributionRule.js";

export const getDistributionRules = async (req, res) => {
    try {
        const { entity } = req.query;
        const query = entity ? { entity } : {};
        const rules = await DistributionRule.find(query).lean();
        res.json(rules);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const createDistributionRule = async (req, res) => {
    try {
        const rule = await DistributionRule.create(req.body);
        res.status(201).json(rule);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const updateDistributionRule = async (req, res) => {
    try {
        const { id } = req.params;
        const rule = await DistributionRule.findByIdAndUpdate(id, req.body, { new: true });
        if (!rule) return res.status(404).json({ message: "Rule not found" });
        res.json(rule);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const deleteDistributionRule = async (req, res) => {
    try {
        const { id } = req.params;
        await DistributionRule.findByIdAndDelete(id);
        res.json({ message: "Rule deleted" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
