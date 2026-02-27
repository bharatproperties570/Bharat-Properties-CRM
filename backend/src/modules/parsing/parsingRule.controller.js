import ParsingRule from './parsingRule.model.js';

export const getRules = async (req, res) => {
    try {
        const rules = await ParsingRule.find().sort({ createdAt: -1 });
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

        const rule = await ParsingRule.create({
            type,
            value,
            category,
            lastUpdatedBy: req.user ? req.user._id : null
        });

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
        const rule = await ParsingRule.findByIdAndDelete(req.params.id);

        if (!rule) {
            return res.status(404).json({
                success: false,
                message: "Rule not found."
            });
        }

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

        const newRules = await ParsingRule.insertMany(rules, { ordered: false });

        res.status(201).json({
            success: true,
            data: newRules
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message,
            partialData: error.insertedDocs
        });
    }
};
