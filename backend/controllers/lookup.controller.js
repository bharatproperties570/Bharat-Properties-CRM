import Lookup from "../models/Lookup.js";

export const getLookups = async (req, res) => {
    try {
        const { category } = req.query;
        const query = category ? { category } : {};
        const lookups = await Lookup.find(query).lean();
        res.json({ success: true, data: lookups });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const addLookup = async (req, res) => {
    try {
        const lookup = await Lookup.create(req.body);
        res.json({ success: true, data: lookup });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};
