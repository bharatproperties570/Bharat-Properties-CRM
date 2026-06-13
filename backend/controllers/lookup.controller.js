import mongoose from "mongoose";
import Lookup from "../models/Lookup.js";
import Lead from "../models/Lead.js";
import Contact from "../models/Contact.js";
import Inventory from "../models/Inventory.js";


export const getLookups = async (req, res) => {
    const { lookup_type, parent_lookup_id, ids } = req.query;
    try {
        
        // 🚀 ENTERPRISE: Batch fetch by IDs (used by live resolution cache in frontend)
        if (ids && ids.trim()) {
            const idArray = ids.split(',').map(id => id.trim()).filter(id => mongoose.Types.ObjectId.isValid(id));
            if (idArray.length === 0) {
                return res.json({ status: "success", data: [] });
            }
            const lookupsByIds = await Lookup.find({
                _id: { $in: idArray.map(id => new mongoose.Types.ObjectId(id)) }
            }).lean();
            console.log(`[LOOKUP_FETCH] Batch ID fetch: ${idArray.length} requested, ${lookupsByIds.length} found`);
            return res.json({ status: "success", data: lookupsByIds });
        }

        // 🚀 SENIOR OPTIMIZATION: Prevent "Massive Dump" if both type and parent_lookup_id are missing
        if ((!lookup_type || lookup_type === 'undefined' || lookup_type === 'null') && !parent_lookup_id) {
            console.warn(`[LOOKUP_FETCH] Blocked unfiltered request to prevent server overload.`);
            return res.json({ status: "success", data: [] });
        }

        console.log(`[LOOKUP_FETCH] Request received for type: ${lookup_type}${parent_lookup_id ? ' | Parent: ' + parent_lookup_id : ''}`);

        const query = {};
        if (lookup_type) {
            const types = String(lookup_type).split(',').map(t => t.trim()).filter(Boolean);
            
            if (types.length > 0) {
                // Multi-type support with Case-Insensitive Regex for both raw and normalized types
                const regexes = types.flatMap(t => [
                    new RegExp(`^${t.replace(/\s+/g, '')}$`, 'i'),
                    new RegExp(`^${t}$`, 'i')
                ]);
                query.lookup_type = { $in: regexes };
            }
        }

        if (parent_lookup_id && parent_lookup_id !== "null" && parent_lookup_id !== "undefined") {
            if (mongoose.Types.ObjectId.isValid(parent_lookup_id)) {
                query.parent_lookup_id = new mongoose.Types.ObjectId(parent_lookup_id);
            } else {
                console.warn(`[LOOKUP_FETCH] Skipping invalid parent_lookup_id: ${parent_lookup_id}`);
            }
        } else if (parent_lookup_id === "null" || parent_lookup_id === null) {
            query.parent_lookup_id = null;
        }

        const lookups = await Lookup.find(query)
            .sort({ order: 1, lookup_value: 1 })
            .lean();

        // 🚀 ENTERPRISE HEALING: If parent_lookup_value is missing/null but parent_lookup_id is present, resolve it dynamically
        const parentIdsToResolve = lookups
            .filter(l => l.parent_lookup_id && !l.parent_lookup_value)
            .map(l => l.parent_lookup_id);

        if (parentIdsToResolve.length > 0) {
            const parents = await Lookup.find({ _id: { $in: parentIdsToResolve } })
                .select('_id lookup_value')
                .lean();
            const parentMap = {};
            parents.forEach(p => {
                parentMap[String(p._id)] = p.lookup_value;
            });

            // Update in-memory returned list and write-back to MongoDB in background to fix database permanently
            const writeBackOps = [];
            lookups.forEach(l => {
                if (l.parent_lookup_id && !l.parent_lookup_value) {
                    const resolvedName = parentMap[String(l.parent_lookup_id)];
                    if (resolvedName) {
                        l.parent_lookup_value = resolvedName;
                        writeBackOps.push(
                            Lookup.updateOne({ _id: l._id }, { $set: { parent_lookup_value: resolvedName } })
                        );
                    }
                }
            });
            if (writeBackOps.length > 0) {
                Promise.all(writeBackOps).catch(err => console.error("[HEAL_DB] Background update failed:", err));
            }
        }

        console.log(`[LOOKUP_FETCH] Success: Found ${lookups.length} records for ${lookup_type}`);
        res.json({ status: "success", data: lookups });
    } catch (error) {
        console.error(`[LOOKUP_FETCH] Error fetching lookups for ${lookup_type}:`, error);
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
        if (req.body.parent_lookup_id) {
            const parent = await Lookup.findById(req.body.parent_lookup_id);
            if (parent) {
                req.body.parent_lookup_value = parent.lookup_value;
            }
        }
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
        const results = {
            successCount: 0,
            errorCount: 0,
            errors: []
        };

        try {
            const { data, lookup_type } = req.body;
            if (!data || !Array.isArray(data)) {
                return res.status(400).json({ success: false, error: "Invalid data provided" });
            }

            const type = lookup_type || 'generic';

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
            if (type === 'Size') {
                // Professional Size Duplicate Prevention
                const filteredToCreate = [];
                for (const candidate of lookupsToCreate) {
                    const existing = await Lookup.findOne({
                        lookup_type: 'Size',
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
        const lookup = await Lookup.findById(id);
        if (!lookup) return res.status(404).json({ status: "error", message: "Lookup not found" });

        // 1. If parent_lookup_id is updated, sync the new parent_lookup_value
        if (req.body.parent_lookup_id && String(req.body.parent_lookup_id) !== String(lookup.parent_lookup_id)) {
            const parent = await Lookup.findById(req.body.parent_lookup_id);
            if (parent) {
                req.body.parent_lookup_value = parent.lookup_value;
            }
        }

        // 2. If the current lookup is renamed, update the parent_lookup_value reference in all child lookups
        if (req.body.lookup_value && req.body.lookup_value !== lookup.lookup_value) {
            await Lookup.updateMany({ parent_lookup_id: id }, { parent_lookup_value: req.body.lookup_value });
        }

        Object.assign(lookup, req.body);
        await lookup.save();
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
        if (type === 'Size') {
            // Complex multi-field duplicate check for sizes
            for (const val of values) {
                // val is expected to be an object for 'size' type
                const query = {
                    lookup_type: 'Size',
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

/**
 * @desc    Merge a duplicate lookup or Move (re-parent) a lookup
 * @route   POST /lookups/merge-or-move
 * @access  Private
 */
export const mergeOrMoveLookup = async (req, res) => {
    try {
        const { action, sourceId, targetId } = req.body;
        if (!action || !sourceId || !targetId) {
            return res.status(400).json({ status: "error", message: "Missing required parameters: action, sourceId, targetId" });
        }

        if (!mongoose.Types.ObjectId.isValid(sourceId) || !mongoose.Types.ObjectId.isValid(targetId)) {
            return res.status(400).json({ status: "error", message: "Invalid sourceId or targetId format" });
        }

        const sourceLookup = await Lookup.findById(sourceId);
        if (!sourceLookup) {
            return res.status(404).json({ status: "error", message: "Source lookup not found" });
        }

        if (action === 'move' || action === 'convert') {
            const targetParent = await Lookup.findById(targetId);
            if (!targetParent) {
                return res.status(404).json({ status: "error", message: "Target parent lookup not found" });
            }

            const oldType = sourceLookup.lookup_type;
            const newType = (action === 'convert' && req.body.newType) ? req.body.newType : oldType;
            
            const typeToFieldMap = {
                'City': 'city',
                'Tehsil': 'tehsil',
                'Location': 'location',
                'State': 'state',
                'PostOffice': 'postOffice',
                'Pincode': 'pincode',
                'Country': 'country'
            };

            const oldField = typeToFieldMap[oldType];
            const newField = typeToFieldMap[newType];
            const parentField = typeToFieldMap[targetParent.lookup_type];

            if (!oldField || !newField) {
                return res.status(400).json({ status: "error", message: `Unsupported lookup type` });
            }

            // 1. Update sourceLookup Type and Parent
            sourceLookup.lookup_type = newType;
            sourceLookup.parent_lookup_id = targetParent._id;
            sourceLookup.parent_lookup_value = targetParent.lookup_value;
            await sourceLookup.save();

            // 2. Re-parent children if converting types that affect hierarchy
            if (oldType === 'City' && (newType === 'Tehsil' || newType === 'Location' || newType === 'PostOffice')) {
                await Lookup.updateMany(
                    { parent_lookup_id: sourceLookup._id },
                    { $set: { parent_lookup_id: targetParent._id, parent_lookup_value: targetParent.lookup_value } }
                );
            } else if (oldType === 'State' && newType === 'City') {
                await Lookup.updateMany(
                    { parent_lookup_id: sourceLookup._id },
                    { $set: { parent_lookup_id: targetParent._id, parent_lookup_value: targetParent.lookup_value } }
                );
            }

            // 3. Migrate CRM Data to fix hierarchy consistency
            const Contact = mongoose.model('Contact');
            const Lead = mongoose.model('Lead');
            const Inventory = mongoose.model('Inventory');

            const updateAddressHierarchies = async (Model, prefix = '') => {
                const oldF = prefix ? `${prefix}.${oldField}` : oldField;
                const newF = prefix ? `${prefix}.${newField}` : newField;
                const parentF = prefix && parentField ? `${prefix}.${parentField}` : parentField;

                const updateObj = { [newF]: sourceLookup._id };
                if (parentField) updateObj[parentF] = targetParent._id;
                if (oldField !== newField && oldField !== parentField) updateObj[oldF] = null;

                await Model.updateMany({ [oldF]: sourceLookup._id }, { $set: updateObj });
            };

            await updateAddressHierarchies(Contact, 'personalAddress');
            await updateAddressHierarchies(Contact, 'correspondenceAddress');
            await updateAddressHierarchies(Inventory, 'address');

            // Leads
            const leadOldField = oldField === 'pincode' ? 'locPincode' : oldField;
            const leadNewField = newField === 'pincode' ? 'locPincode' : newField;
            if (leadOldField === 'location' || leadOldField === 'locPincode') {
                const leadUpdate = {};
                if (leadNewField === 'location' || leadNewField === 'locPincode') leadUpdate[leadNewField] = sourceLookup._id;
                if (leadOldField !== leadNewField) leadUpdate[leadOldField] = null;
                if (Object.keys(leadUpdate).length > 0) {
                    await Lead.updateMany({ [leadOldField]: sourceLookup._id }, { $set: leadUpdate });
                }
            }

            const actionText = action === 'convert' ? 'Converted' : 'Moved';
            console.log(`[LOOKUPS] ${actionText} ${oldType} ${sourceLookup._id} ("${sourceLookup.lookup_value}") to ${newType} under ${targetParent._id}`);
            return res.json({ status: "success", message: `Successfully ${actionText.toLowerCase()} "${sourceLookup.lookup_value}" to ${newType} under "${targetParent.lookup_value}".` });
        }

        if (action === 'merge') {
            const targetLookup = await Lookup.findById(targetId);
            if (!targetLookup) {
                return res.status(404).json({ status: "error", message: "Target lookup not found" });
            }

            if (sourceLookup.lookup_type !== targetLookup.lookup_type) {
                // Special exception: Allow Location to merge into Tehsil (re-link to Tehsil and clear Location field in Contacts)
                if (sourceLookup.lookup_type === 'Location' && targetLookup.lookup_type === 'Tehsil') {
                    // Update child lookups pointing to the source location as parent
                    await Lookup.updateMany(
                        { parent_lookup_id: sourceLookup._id },
                        { $set: { parent_lookup_id: targetLookup._id, parent_lookup_value: targetLookup.lookup_value } }
                    );

                    const Contact = mongoose.model('Contact');
                    // Update Contacts: personalAddress set tehsil=target, location=null
                    await Contact.updateMany(
                        { "personalAddress.location": sourceLookup._id },
                        { $set: { "personalAddress.tehsil": targetLookup._id, "personalAddress.location": null } }
                    );
                    // correspondenceAddress
                    await Contact.updateMany(
                        { "correspondenceAddress.location": sourceLookup._id },
                        { $set: { "correspondenceAddress.tehsil": targetLookup._id, "correspondenceAddress.location": null } }
                    );

                    // Delete source lookup
                    await Lookup.deleteOne({ _id: sourceLookup._id });

                    console.log(`[LOOKUPS] Merged Location ${sourceLookup._id} ("${sourceLookup.lookup_value}") into Tehsil ${targetLookup._id} ("${targetLookup.lookup_value}")`);
                    return res.json({ status: "success", message: `Successfully merged Location "${sourceLookup.lookup_value}" into Tehsil "${targetLookup.lookup_value}" and re-linked contacts.` });
                }
                
                return res.status(400).json({ status: "error", message: `Cannot merge different lookup types: "${sourceLookup.lookup_type}" and "${targetLookup.lookup_type}"` });
            }

            // Standard merge of same types (State->State, City->City, Location->Location, etc.)
            
            // 1. Update parent ID of any child lookups pointing to source
            await Lookup.updateMany(
                { parent_lookup_id: sourceLookup._id },
                { $set: { parent_lookup_id: targetLookup._id, parent_lookup_value: targetLookup.lookup_value } }
            );

            // 2. Update Contacts
            const Contact = mongoose.model('Contact');
            const contactFields = ['location', 'tehsil', 'postOffice', 'city', 'state', 'pincode', 'country', 'locality', 'area'];
            for (const field of contactFields) {
                await Contact.updateMany(
                    { [`personalAddress.${field}`]: sourceLookup._id },
                    { $set: { [`personalAddress.${field}`]: targetLookup._id } }
                );
                await Contact.updateMany(
                    { [`correspondenceAddress.${field}`]: sourceLookup._id },
                    { $set: { [`correspondenceAddress.${field}`]: targetLookup._id } }
                );
            }

            // 3. Update Leads
            const Lead = mongoose.model('Lead');
            const leadFields = ['location', 'locPincode', 'requirement', 'subRequirement', 'budget', 'source', 'subSource', 'campaign', 'status', 'stage', 'sequence'];
            for (const field of leadFields) {
                await Lead.updateMany(
                    { [field]: sourceLookup._id },
                    { $set: { [field]: targetLookup._id } }
                );
            }

            const arrayLeadFields = ['propertyType', 'subType', 'unitType', 'sizeType', 'facing', 'roadWidth', 'direction'];
            for (const field of arrayLeadFields) {
                await Lead.updateMany(
                    { [field]: sourceLookup._id },
                    { $set: { [`${field}.$`]: targetLookup._id } }
                );
            }

            // 4. Update Inventory
            const Inventory = mongoose.model('Inventory');
            const inventoryAddrFields = ['city', 'tehsil', 'state', 'postOffice', 'pincode', 'locality', 'location', 'area', 'country'];
            for (const field of inventoryAddrFields) {
                await Inventory.updateMany(
                    { [`address.${field}`]: sourceLookup._id },
                    { $set: { [`address.${field}`]: targetLookup._id } }
                );
            }

            const inventoryCatFields = ['category', 'subCategory', 'unitType', 'sizeConfig', 'status', 'sizeType', 'facing', 'direction', 'roadWidth', 'orientation', 'builtupType'];
            for (const field of inventoryCatFields) {
                await Inventory.updateMany(
                    { [field]: sourceLookup._id },
                    { $set: { [field]: targetLookup._id } }
                );
            }

            // 5. Delete source lookup
            await Lookup.deleteOne({ _id: sourceLookup._id });

            console.log(`[LOOKUPS] Merged ${sourceLookup.lookup_type} ${sourceLookup._id} ("${sourceLookup.lookup_value}") into ${targetLookup._id} ("${targetLookup.lookup_value}")`);
            return res.json({ status: "success", message: `Successfully merged "${sourceLookup.lookup_value}" into "${targetLookup.lookup_value}" across all records.` });
        }

        return res.status(400).json({ status: "error", message: `Unsupported action: "${action}"` });

    } catch (error) {
        console.error("[LOOKUPS_MERGE_MOVE_ERROR]", error);
        res.status(500).json({ status: "error", message: error.message });
    }
};

