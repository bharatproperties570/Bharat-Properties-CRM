import DuplicationRule from "../models/DuplicationRule.js";
import Contact from "../models/Contact.js";
import Lead from "../models/Lead.js";
import Project from "../models/Project.js";
import Inventory from "../models/Inventory.js";

export const getDuplicationRules = async (req, res, next) => {
    try {
        const rules = await DuplicationRule.find().sort({ createdAt: -1 });
        res.json({ success: true, data: rules });
    } catch (error) {
        next(error);
    }
};

export const createDuplicationRule = async (req, res, next) => {
    try {
        const rule = await DuplicationRule.create({
            ...req.body,
            createdBy: req.user?._id
        });
        res.status(201).json({ success: true, data: rule });
    } catch (error) {
        next(error);
    }
};

export const updateDuplicationRule = async (req, res, next) => {
    try {
        const rule = await DuplicationRule.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!rule) return res.status(404).json({ success: false, error: "Rule not found" });
        res.json({ success: true, data: rule });
    } catch (error) {
        next(error);
    }
};

export const deleteDuplicationRule = async (req, res, next) => {
    try {
        const rule = await DuplicationRule.findByIdAndDelete(req.params.id);
        if (!rule) return res.status(404).json({ success: false, error: "Rule not found" });
        res.json({ success: true, message: "Rule deleted successfully" });
    } catch (error) {
        next(error);
    }
};

export const checkDuplicates = async (req, res, next) => {
    try {
        const { entityType, data } = req.body;
        if (!entityType || !data) {
            return res.status(400).json({ success: false, error: "entityType and data are required" });
        }

        const modelMap = {
            Contact: Contact,
            Lead: Lead,
            Project: Project,
            Inventory: Inventory
        };

        const TargetModel = modelMap[entityType];
        if (!TargetModel) {
            return res.status(400).json({ success: false, error: "Invalid entityType" });
        }

        // --- 1. Identify Cross-Entity Checks ---
        const entitiesToCheck = [entityType];
        if (entityType === 'Lead') entitiesToCheck.push('Contact');
        if (entityType === 'Contact') entitiesToCheck.push('Lead');

        let allDuplicates = [];
        let blockActionFound = false;

        for (const currentEntity of entitiesToCheck) {
            const CurrentModel = modelMap[currentEntity];

            // Fetch rules for this specific entity type
            const activeRules = await DuplicationRule.find({ entityType: currentEntity, isActive: true });
            if (activeRules.length === 0) continue;

            const ruleQueries = activeRules.map(rule => {
                const fieldQueries = rule.fields.map(field => {
                    // Smart value extraction: handles nested objects and arrays
                    let keys = field.split('.');
                    let value = data;
                    for (const key of keys) {
                        if (Array.isArray(value)) {
                            // If we encounter an array in the data (like phones or emails from frontend), 
                            // we extract the property from the first element for the "search" value.
                            value = value[0]?.[key];
                        } else {
                            value = value?.[key];
                        }
                    }

                    if (!value) return null;

                    // --- 2. Data Standardization (Phone) ---
                    if (field.includes('phone') || field.includes('mobile')) {
                        // Strip +91, 0, spaces, dashes
                        const normalizedValue = value.replace(/^(\+91|0)/, '').replace(/[\s-]/g, '');
                        // Create a regex that matches the number with optional prefixes
                        return { [field]: { $regex: new RegExp(normalizedValue.slice(-10)), $options: 'i' } };
                    }

                    if (['unitNumber', 'unitNo', 'reraNumber', 'project', 'block'].includes(field)) {
                        return { [field]: value };
                    }
                    return { [field]: { $regex: value, $options: 'i' } };
                }).filter(Boolean);

                if (fieldQueries.length === 0) return null;
                return {
                    query: rule.matchType === 'all' ? { $and: fieldQueries } : { $or: fieldQueries },
                    actionType: rule.actionType || 'Warning'
                };
            }).filter(Boolean);

            if (ruleQueries.length === 0) continue;

            // Execute queries
            for (const { query, actionType } of ruleQueries) {
                const fullQuery = { ...query };
                if (data._id && currentEntity === entityType) {
                    fullQuery._id = { $ne: data._id }; // Exclude self
                }

                const matches = await CurrentModel.find(fullQuery).limit(5).lean();
                if (matches.length > 0) {
                    matches.forEach(m => {
                        m.matchedEntityType = currentEntity; // Tag the source
                        m.matchAction = actionType;
                    });
                    allDuplicates = [...allDuplicates, ...matches];
                    if (actionType === 'Block') blockActionFound = true;
                }
            }
        }

        res.json({
            success: true,
            data: allDuplicates,
            blockAction: blockActionFound
        });

    } catch (error) {
        console.error(`[ERROR] checkDuplicates for ${req.body.entityType} failed:`, error);
        next(error);
    }
};

export const checkDocument = async (req, res, next) => {
    try {
        const { documentType, documentNo, excludeEntityId, entityType } = req.body;

        if (!documentType || !documentNo) {
            return res.status(400).json({ success: false, error: "Document Type and Number are required" });
        }

        // Models to check
        const modelsToCheck = [Contact, Lead];
        // Note: Project/Inventory usually don't have personal documents like PAN/Aadhar, 
        // but if they do, add them here.

        let isDuplicate = false;
        let existingEntityType = '';

        for (const Model of modelsToCheck) {
            const query = {
                'documents': {
                    $elemMatch: {
                        documentType: documentType,
                        documentNo: { $regex: new RegExp(`^${documentNo}$`, 'i') } // Exact match, case insensitive
                    }
                }
            };

            if (excludeEntityId) {
                query._id = { $ne: excludeEntityId };
            }

            const exists = await Model.findOne(query).select('_id').lean();
            if (exists) {
                isDuplicate = true;
                existingEntityType = Model.modelName;
                break;
            }
        }

        res.json({ success: true, isDuplicate, existingEntityType });

    } catch (error) {
        next(error);
    }
};
