import Lookup from "../models/Lookup.js";

export const getLookups = async (req, res) => {
    try {
        const { lookup_type, parent_lookup_id, parent_lookup_value } = req.query;
        const query = {};
        if (lookup_type) query.lookup_type = lookup_type;
        if (parent_lookup_id) query.parent_lookup_id = parent_lookup_id;
        if (parent_lookup_value) query.parent_lookup_value = parent_lookup_value;

        const lookups = await Lookup.find(query).sort({ order: 1, lookup_value: 1 }).lean();

        // Return format matching frontend expectation
        res.json({ status: "success", data: lookups });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
};

export const addLookup = async (req, res) => {
    try {
        const lookup = await Lookup.create(req.body);
        res.status(201).json({ status: "success", data: lookup });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
};

export const updateLookup = async (req, res) => {
    try {
        const { id } = req.params;
        const lookup = await Lookup.findByIdAndUpdate(id, req.body, { new: true });
        if (!lookup) return res.status(404).json({ status: "error", message: "Lookup not found" });
        res.json({ status: "success", data: lookup });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
};

export const deleteLookup = async (req, res) => {
    try {
        const { id } = req.params;
        await Lookup.findByIdAndDelete(id);
        res.json({ status: "success", message: "Lookup deleted" });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
};
