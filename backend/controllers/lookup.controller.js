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
                const { label, value, lookup_value, order, ...rest } = item;

                const lookupObj = {
                    lookup_type: type,
                    lookup_value: label || value || lookup_value,
                    isActive: true,
                    order: Number(order) || 0,
                    metadata: rest // Store all other fields in metadata
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
            if (type === 'size') {
                // Professional Size Duplicate Prevention
                const filteredToCreate = [];
                for (const candidate of lookupsToCreate) {
                    const existing = await Lookup.findOne({
                        lookup_type: 'size',
                        lookup_value: candidate.lookup_value,
                        'metadata.project': candidate.metadata.project,
                        'metadata.block': candidate.metadata.block,
                        'metadata.category': candidate.metadata.category,
                        'metadata.subCategory': candidate.metadata.subCategory,
                        'metadata.unitType': candidate.metadata.unitType
                    });

                    if (!existing) {
                        filteredToCreate.push(candidate);
                    } else {
                        results.successCount--; // Already incremented in the loop
                        results.errorCount++;
                        results.errors.push({
                            item: candidate.lookup_value,
                            error: `Duplicate size in project '${candidate.metadata.project}', block '${candidate.metadata.block}'`
                        });
                    }
                }

                if (filteredToCreate.length > 0) {
                    await Lookup.insertMany(filteredToCreate, { ordered: false });
                }
            } else {
                await Lookup.insertMany(lookupsToCreate, { ordered: false });
            }
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
                errors: [
                    ...results.errors.map(e => ({
                        row: 'Pre-process',
                        name: e.item,
                        reason: e.error
                    })),
                    ...error.writeErrors.map(e => ({
                        row: e.index + 1,
                        name: req.body.data[e.index]?.label || req.body.data[e.index]?.lookup_value || 'Unknown',
                        reason: e.errmsg?.includes('duplicate key') ? 'Duplicate Value' : e.errmsg
                    }))
                ]
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

        let duplicates = [];
        if (type === 'size') {
            // Complex multi-field duplicate check for sizes
            for (const val of values) {
                // val is expected to be an object for 'size' type
                const query = {
                    lookup_type: 'size',
                    lookup_value: val.name || val.lookup_value,
                    'metadata.project': val.project,
                    'metadata.block': val.block,
                    'metadata.category': val.category,
                    'metadata.subCategory': val.subCategory,
                    'metadata.unitType': val.unitType
                };
                const match = await Lookup.findOne(query).lean();
                if (match) duplicates.push(match);
            }
        } else {
            // Standard check for other types
            duplicates = await Lookup.find({
                lookup_type: type,
                lookup_value: { $in: values }
            }, 'lookup_value').lean();
        }

        const existingValues = duplicates.map(d => d.lookup_value);

        res.status(200).json({
            success: true,
            duplicates: existingValues,
            details: duplicates.map(d => ({
                id: d._id,
                value: d.lookup_value,
                metadata: d.metadata
            }))
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};
