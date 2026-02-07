import FieldRule from "../models/FieldRule.js";

export const getFieldRules = async (req, res) => {
    try {
        const { module } = req.query;
        const query = module ? { module } : {};
        const rules = await FieldRule.find(query).lean();
        res.json(rules);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const createFieldRule = async (req, res) => {
    try {
        const rule = await FieldRule.create(req.body);
        res.status(201).json(rule);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const updateFieldRule = async (req, res) => {
    try {
        const { id } = req.params;
        const rule = await FieldRule.findByIdAndUpdate(id, req.body, { new: true });
        if (!rule) return res.status(404).json({ message: "Rule not found" });
        res.json(rule);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const deleteFieldRule = async (req, res) => {
    try {
        const { id } = req.params;
        await FieldRule.findByIdAndDelete(id);
        res.json({ message: "Rule deleted" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
