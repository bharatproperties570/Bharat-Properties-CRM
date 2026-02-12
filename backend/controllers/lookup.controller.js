import Lookup from "../models/Lookup.js";

export const getLookups = async (req, res) => {
    try {
        const { lookup_type, parent_lookup_id, page = 1, limit = 1000 } = req.query;

        const query = {};
        if (lookup_type) query.lookup_type = lookup_type;
        if (parent_lookup_id !== undefined) query.parent_lookup_id = parent_lookup_id === "null" ? null : parent_lookup_id;

        const lookups = await Lookup.find(query)
            .sort({ order: 1, lookup_value: 1 })
            .lean();

        res.json({ status: "success", data: lookups });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
};

/**
 * @desc    Create a new lookup
 * @route   POST /lookups
 * @access  Private
 */
export const addLookup = async (req, res) => {
    try {
        const lookup = await Lookup.create(req.body);
        res.status(201).json({ status: "success", data: lookup });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
};

/**
 * @desc    Bulk import lookups (e.g., Sizes)
 * @route   POST /lookups/import
 * @access  Private
 */
export const importLookups = async (req, res) => {
    try {
        const { data, lookup_type } = req.body;
        if (!data || !Array.isArray(data)) {
            return res.status(400).json({ success: false, error: "Invalid data provided" });
        }

        const type = lookup_type || 'generic';

        const results = {
            successCount: 0,
            errorCount: 0,
            errors: []
        };

        const lookupsToCreate = [];

        for (const item of data) {
            try {
                const lookupObj = {
                    lookup_type: type,
                    lookup_value: item.label || item.value || item.lookup_value,
                    isActive: true,
                    order: Number(item.order) || 0
                };

                if (!lookupObj.lookup_value) {
                    throw new Error("Value/Label is required");
                }

                lookupsToCreate.push(lookupObj);
                results.successCount++;
            } catch (err) {
                results.errorCount++;
                results.errors.push({ item: item.label || 'Unknown', error: err.message });
            }
        }

        if (lookupsToCreate.length > 0) {
            await Lookup.insertMany(lookupsToCreate, { ordered: false });
        }

        res.status(200).json({
            success: true,
            message: `Imported ${results.successCount} lookups for type '${type}' with ${results.errorCount} errors.`,
            ...results
        });
    } catch (error) {
        if (error.writeErrors) {
            const realSuccessCount = req.body.data.length - error.writeErrors.length;
            return res.status(200).json({
                success: true,
                message: `Imported ${realSuccessCount} lookups. ${error.writeErrors.length} failed.`,
                successCount: realSuccessCount,
                errorCount: error.writeErrors.length,
                errors: error.writeErrors.map(e => ({ item: e.errmsg, error: "Duplicate or Validation Error" }))
            });
        }
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * @desc    Update lookup
 */
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

/**
 * @desc    Check for duplicate lookups by value and type
 * @route   POST /lookups/check-duplicates
 * @access  Private
 */
export const checkDuplicatesImport = async (req, res) => {
    try {
        const { values, lookup_type } = req.body;
        if (!values || !Array.isArray(values)) {
            return res.status(400).json({ success: false, error: "Invalid values provided" });
        }

        const type = lookup_type || 'generic';

        const duplicates = await Lookup.find({
            lookup_type: type,
            lookup_value: { $in: values }
        }, 'lookup_value').lean();

        const existingValues = duplicates.map(d => d.lookup_value);
        const matchedValues = values.filter(v => existingValues.includes(v));
        const uniqueMatched = [...new Set(matchedValues)];

        res.status(200).json({
            success: true,
            duplicates: uniqueMatched,
            details: duplicates.map(d => ({
                id: d._id,
                value: d.lookup_value
            }))
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};
