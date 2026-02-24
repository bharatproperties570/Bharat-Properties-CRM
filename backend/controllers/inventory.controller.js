import Inventory from "../models/Inventory.js";
import Lead from "../models/Lead.js";
import Lookup from "../models/Lookup.js";
import User from "../models/User.js";
import SystemSetting from "../models/SystemSetting.js";
import { paginate } from "../utils/pagination.js";
import mongoose from "mongoose";

export const getInventory = async (req, res) => {
    try {
        const { page = 1, limit = 10, search = "", category, subCategory, unitType, status, project, contactId } = req.query;

        let query = {};

        if (contactId) {
            query.$or = [
                { owners: contactId },
                { associates: contactId }
            ];
        }

        // Search in unitNo, unitNumber, ownerName, ownerPhone
        if (search) {
            const searchConditions = [
                { unitNo: { $regex: search, $options: "i" } },
                { unitNumber: { $regex: search, $options: "i" } },
                { ownerName: { $regex: search, $options: "i" } },
                { ownerPhone: { $regex: search, $options: "i" } },
                { description: { $regex: search, $options: "i" } },
                { projectName: { $regex: search, $options: "i" } }
            ];
            if (query.$or) {
                query.$and = [
                    { $or: query.$or },
                    { $or: searchConditions }
                ];
                delete query.$or;
            } else {
                query.$or = searchConditions;
            }
        }

        // Apply filters
        if (category) query.category = category;
        if (subCategory) query.subCategory = subCategory;
        if (unitType) query.unitType = unitType;
        if (status) query.status = status;
        if (project) {
            const projectConditions = [
                { projectId: project },
                { projectName: project }
            ];

            if (query.$or) {
                // If we already have $or (from search or contactId), we need to $and it with project conditions
                // This is getting complex, let's simplify by pushing to an $and array if multiple $ors exist
                if (!query.$and) query.$and = [];
                query.$and.push({ $or: query.$or });
                query.$and.push({ $or: projectConditions });
                delete query.$or;
            } else {
                query.$or = projectConditions;
            }
        }

        // Only populate fields that are reliably ObjectIds (Contact references)
        // category, status, etc. in Inventory seem to be stored as objects or strings already
        const populateFields = [
            { path: "owners", select: "name phones" },
            { path: "associates", select: "name phones" },
            { path: "category" },
            { path: "subCategory" },
            { path: "status" },
            { path: "facing" },
            { path: "intent" }
        ];

        const results = await paginate(Inventory, query, Number(page), Number(limit), { createdAt: -1 }, populateFields);

        res.status(200).json({
            success: true,
            ...results
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const getInventoryById = async (req, res) => {
    try {
        const populateFields = [
            { path: "owners", select: "name phones emails title personalAddress" },
            { path: "associates", select: "name phones emails title" },
            { path: "projectId" },
            { path: "category" },
            { path: "subCategory" },
            { path: "status" },
            { path: "facing" },
            { path: "intent" }
        ];

        const inventory = await Inventory.findById(req.params.id).populate(populateFields);

        if (!inventory) {
            return res.status(404).json({ success: false, error: "Inventory item not found" });
        }

        res.status(200).json({ success: true, data: inventory });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

const sanitizeIds = (ids) => {
    if (!ids || !Array.isArray(ids)) return ids;
    return ids.map(id => {
        if (typeof id === 'object' && id !== null && id.id) {
            return id.id;
        }
        return id;
    });
};

export const addInventory = async (req, res) => {
    try {
        const { projectName, block, unitNo, unitNumber } = req.body;
        const finalUnitNo = unitNo || unitNumber;

        if (projectName && block && finalUnitNo) {
            const existing = await Inventory.findOne({
                projectName,
                block,
                $or: [{ unitNo: finalUnitNo }, { unitNumber: finalUnitNo }]
            });

            if (existing) {
                return res.status(400).json({ success: false, error: "Duplicate Inventory: This Unit already exists in this Project/Block." });
            }
        }

        const data = { ...req.body };

        // Resolve Reference Fields to prevent CastErrors
        if (data.category) data.category = await resolveLookup('Category', data.category);
        if (data.subCategory) data.subCategory = await resolveLookup('Sub Category', data.subCategory);
        if (data.unitType) data.unitType = await resolveLookup('Unit Type', data.unitType);
        if (data.status) data.status = await resolveLookup('Status', data.status);
        if (data.facing) data.facing = await resolveLookup('Facing', data.facing);
        if (data.intent) data.intent = await resolveLookup('Intent', data.intent);
        if (data.assignedTo) data.assignedTo = await resolveUser(data.assignedTo);

        if (data.owners) data.owners = sanitizeIds(data.owners);
        if (data.associates) data.associates = sanitizeIds(data.associates);

        const inventory = await Inventory.create(data);
        res.status(201).json({ success: true, data: inventory });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

export const updateInventory = async (req, res) => {
    try {
        const data = { ...req.body };

        // Resolve Reference Fields to prevent CastErrors
        if (data.category) data.category = await resolveLookup('Category', data.category);
        if (data.subCategory) data.subCategory = await resolveLookup('Sub Category', data.subCategory);
        if (data.unitType) data.unitType = await resolveLookup('Unit Type', data.unitType);
        if (data.status) data.status = await resolveLookup('Status', data.status);
        if (data.facing) data.facing = await resolveLookup('Facing', data.facing);
        if (data.intent) data.intent = await resolveLookup('Intent', data.intent);
        if (data.assignedTo) data.assignedTo = await resolveUser(data.assignedTo);

        if (data.owners) data.owners = sanitizeIds(data.owners);
        if (data.associates) data.associates = sanitizeIds(data.associates);

        const inventory = await Inventory.findByIdAndUpdate(req.params.id, data, {
            new: true,
            runValidators: true,
        });

        if (!inventory) {
            return res.status(404).json({ success: false, error: "Inventory item not found" });
        }

        res.status(200).json({ success: true, data: inventory });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

export const deleteInventory = async (req, res) => {
    try {
        const inventory = await Inventory.findByIdAndDelete(req.params.id);

        if (!inventory) {
            return res.status(404).json({ success: false, error: "Inventory item not found" });
        }

        res.status(200).json({ success: true, data: {} });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const bulkDeleteInventory = async (req, res) => {
    try {
        const { ids } = req.body;
        if (!ids || !Array.isArray(ids)) {
            return res.status(400).json({ success: false, error: "Invalid IDs provided" });
        }
        await Inventory.deleteMany({ _id: { $in: ids } });
        res.status(200).json({ success: true, message: `${ids.length} items deleted successfully` });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const matchInventory = async (req, res) => {
    try {
        const { inventoryId, leadId } = req.query;

        // Case 1: Find matching leads for a specific property
        if (inventoryId) {
            const inventory = await Inventory.findById(inventoryId).lean();
            if (!inventory) {
                return res.status(404).json({ success: false, error: "Inventory not found" });
            }

            const queryConditions = [];

            // Safe Project match
            if (inventory.projectId && mongoose.Types.ObjectId.isValid(inventory.projectId)) {
                queryConditions.push({ project: inventory.projectId });
            }
            if (inventory.projectName) {
                // Also search in projectName array or string fields in Lead if applicable
                // Lead.project is an ObjectId, so we can't query it with a string name directly
                // unless the Lead model has a projectName field (it does: Lead.projectName [String])
                queryConditions.push({ projectName: inventory.projectName });
            }

            // Safe Category/Requirement match
            if (inventory.category && mongoose.Types.ObjectId.isValid(inventory.category)) {
                queryConditions.push({ requirement: inventory.category });
            }
            // If it's a string name, we might need to find the Lookup ID first or skip

            // Safe Sub-Category match
            if (inventory.subCategory && mongoose.Types.ObjectId.isValid(inventory.subCategory)) {
                queryConditions.push({ subRequirement: inventory.subCategory });
            }

            if (queryConditions.length === 0) {
                return res.status(200).json({ success: true, count: 0, data: [] });
            }

            const leads = await Lead.find({ $or: queryConditions }).limit(50).sort({ updatedAt: -1 }).lean();
            return res.status(200).json({ success: true, count: leads.length, data: leads });
        }

        // Case 2: Find matching inventory for a specific lead (Original placeholder intent)
        if (leadId) {
            const lead = await Lead.findById(leadId).lean();
            if (!lead) {
                return res.status(404).json({ success: false, error: "Lead not found" });
            }

            const query = {
                $or: []
            };
            if (lead.project) query.$or.push({ projectId: lead.project }, { projectName: lead.project });
            if (lead.requirement) query.$or.push({ category: lead.requirement });

            // Advanced matching based on property type and geography
            if (lead.propertyType && Array.isArray(lead.propertyType) && lead.propertyType.length > 0) {
                query.$or.push({ category: { $in: lead.propertyType } });
            }
            if (lead.location) {
                query.$or.push({ "address.locality": lead.location });
                query.$or.push({ "address.area": lead.location });
                query.$or.push({ "address.city": lead.location });
            }

            if (query.$or.length === 0) return res.status(200).json({ success: true, data: [] });

            const inventories = await Inventory.find(query).limit(50).sort({ createdAt: -1 }).lean();
            return res.status(200).json({ success: true, count: inventories.length, data: inventories });
        }

        res.status(400).json({ success: false, error: "Either inventoryId or leadId is required" });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// Helper to resolve lookup (Find or Create)
const resolveLookup = async (type, value) => {
    if (!value) return null;
    if (mongoose.Types.ObjectId.isValid(value)) return value;
    let lookup = await Lookup.findOne({ lookup_type: type, lookup_value: { $regex: new RegExp(`^${value}$`, 'i') } });
    if (!lookup) {
        lookup = await Lookup.create({ lookup_type: type, lookup_value: value });
    }
    return lookup._id;
};

// Helper to resolve User (By Name or Email)
const resolveUser = async (identifier) => {
    if (!identifier) return null;
    if (mongoose.Types.ObjectId.isValid(identifier)) return identifier;

    const user = await User.findOne({
        $or: [
            { fullName: { $regex: new RegExp(`^${identifier}$`, 'i') } },
            { email: identifier.toLowerCase() },
            { name: { $regex: new RegExp(`^${identifier}$`, 'i') } }
        ]
    });
    return user ? user._id : null;
};


/**
 * @desc    Bulk import inventory
 * @route   POST /inventory/import
 * @access  Private
 */
export const importInventory = async (req, res) => {
    try {
        const { data } = req.body;
        if (!data || !Array.isArray(data)) {
            return res.status(400).json({ success: false, error: "Invalid data provided" });
        }

        // Fetch property sizes for auto-populating area details
        const sizesSetting = await SystemSetting.findOne({ key: 'property_sizes' }).lean();
        const systemSizes = sizesSetting ? sizesSetting.value : [];

        const restructuredData = [];

        for (const item of data) {
            const result = {
                // Ensure project names and IDs are handled consistently
                projectName: item.projectName || item.project,
                projectId: item.projectId,
                unitNo: item.unitNo,
                unitNumber: item.unitNo,
                builtupType: item.builtupType,
                block: item.block,
                size: item.size,
                sizeLabel: item.sizeLabel,
                direction: item.direction,
                roadWidth: item.roadWidth,
                ownership: item.ownership,

                // Construction Details
                occupationDate: item.occupationDate,
                possessionStatus: item.possessionStatus,
                furnishType: item.furnishType,
                furnishedItems: item.furnishedItems,

                // Location Details (Nested address object)
                address: {
                    hNo: item.hNo,
                    street: item.street,
                    locality: item.locality,
                    area: item.area,
                    city: item.city,
                    tehsil: item.tehsil,
                    postOffice: item.postOffice,
                    pinCode: item.pinCode,
                    state: item.state,
                    country: item.country || 'India',
                    lat: item.lat,
                    lng: item.lng
                },

                // Plain fields
                ownerName: item.ownerName,
                ownerPhone: item.ownerPhone,
                ownerEmail: item.ownerEmail,
                ownerAddress: item.ownerAddress,

                // System Details
                team: item.team,
                visibleTo: item.visibleTo || 'Everyone'
            };

            // Resolve Lookups
            result.category = await resolveLookup('Category', item.category || item.type);
            result.subCategory = await resolveLookup('Sub Category', item.subCategory);
            result.unitType = await resolveLookup('Unit Type', item.unitType);
            result.status = await resolveLookup('Status', item.status || 'Available');
            result.facing = await resolveLookup('Facing', item.facing);
            result.intent = await resolveLookup('Intent', item.intent);

            // Resolve User for AssignedTo
            result.assignedTo = await resolveUser(item.assignedTo);

            // AUTO-POPULATE FROM SYSTEM SIZES
            if (item.sizeLabel) {
                const currentProjectName = result.projectName;
                // Find matching size by Label, Project, and Block
                const matchedSize = systemSizes.find(s =>
                    s.name === item.sizeLabel &&
                    (s.project === currentProjectName || s.project === 'Global')
                );

                if (matchedSize) {
                    // Overwrite if matched
                    if (matchedSize.sizeType) result.unitType = await resolveLookup('Unit Type', matchedSize.sizeType);
                    result.builtUpArea = matchedSize.coveredArea || matchedSize.saleableArea; // Fallback
                    result.carpetArea = matchedSize.carpetArea;
                    result.superArea = matchedSize.saleableArea || matchedSize.totalArea;
                    if (matchedSize.category) result.category = await resolveLookup('Category', matchedSize.category);
                    if (matchedSize.subCategory) result.subCategory = await resolveLookup('Sub Category', matchedSize.subCategory);

                    // If plot type, use totalArea and resultMetric
                    if (matchedSize.totalArea) {
                        result.size = matchedSize.totalArea;
                        result.sizeUnit = matchedSize.resultMetric;
                        result.dimensions = `${matchedSize.width || ''} x ${matchedSize.length || ''}`;
                    }
                }
            }

            restructuredData.push(result);
        }

        await Inventory.insertMany(restructuredData, { ordered: false });

        res.status(200).json({
            success: true,
            message: `Successfully imported ${restructuredData.length} inventory items.`,
            successCount: restructuredData.length,
            errorCount: 0
        });
    } catch (error) {
        if (error.writeErrors) {
            const realSuccessCount = (req.body.data?.length || 0) - error.writeErrors.length;
            return res.status(200).json({
                success: true,
                message: `Imported ${realSuccessCount} inventory items. ${error.writeErrors.length} failed.`,
                successCount: realSuccessCount,
                errorCount: error.writeErrors.length,
                errors: error.writeErrors.map(e => ({
                    row: e.index + 1,
                    name: `Unit ${req.body.data[e.index]?.unitNo || 'Unknown'}`,
                    reason: e.errmsg?.includes('duplicate key') ? 'Duplicate Unit Number in this Project' : e.errmsg
                }))
            });
        }
        if (error.name === 'ValidationError') {
            const errorDetails = Object.values(error.errors).map(err => ({
                row: 'N/A',
                name: 'Validation Error',
                reason: err.message
            }));
            return res.status(200).json({
                success: true,
                message: `Import failed: ${error.message}`,
                successCount: 0,
                errorCount: errorDetails.length,
                errors: errorDetails
            });
        }
        console.error("Inventory Import Error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * @desc    Check for duplicate inventory by unitNo and project
 * @route   POST /inventory/check-duplicates
 * @access  Private
 */
export const checkDuplicatesImport = async (req, res) => {
    try {
        const { items } = req.body; // Array of { unitNo, projectId }
        if (!items || !Array.isArray(items)) {
            return res.status(400).json({ success: false, error: "Invalid items provided" });
        }

        const query = {
            $or: items.map(item => ({
                $or: [
                    { unitNo: item.unitNo, projectId: item.projectId },
                    { unitNumber: item.unitNo, projectId: item.projectId }
                ]
            }))
        };

        const duplicates = await Inventory.find(query, 'unitNo unitNumber projectId').lean();

        res.status(200).json({
            success: true,
            duplicates: duplicates.map(d => ({
                unitNo: d.unitNo || d.unitNumber,
                projectId: d.projectId
            })),
            details: duplicates.map(d => ({
                id: d._id,
                unitNo: d.unitNo || d.unitNumber,
                projectId: d.projectId
            }))
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};
