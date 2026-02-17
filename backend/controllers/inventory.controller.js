import Inventory from "../models/Inventory.js";
import Lead from "../models/Lead.js";
import { paginate } from "../utils/pagination.js";

export const getInventory = async (req, res) => {
    try {
        const { page = 1, limit = 10, search = "", category, subCategory, unitType, status, project } = req.query;

        let query = {};

        // Search in unitNo, unitNumber, ownerName, ownerPhone
        if (search) {
            query.$or = [
                { unitNo: { $regex: search, $options: "i" } },
                { unitNumber: { $regex: search, $options: "i" } },
                { ownerName: { $regex: search, $options: "i" } },
                { ownerPhone: { $regex: search, $options: "i" } },
                { description: { $regex: search, $options: "i" } },
                { projectName: { $regex: search, $options: "i" } }
            ];
        }

        // Apply filters
        if (category) query.category = category;
        if (subCategory) query.subCategory = subCategory;
        if (unitType) query.unitType = unitType;
        if (status) query.status = status;
        if (project) {
            query.$or = [
                ...(query.$or || []),
                { projectId: project },
                { projectName: project }
            ];
        }

        // Only populate fields that are reliably ObjectIds (Contact references)
        // category, status, etc. in Inventory seem to be stored as objects or strings already
        const populateFields = [
            { path: "owners", select: "name phones" },
            { path: "associates", select: "name phones" }
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
            { path: "projectId" }
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

        const inventory = await Inventory.create(req.body);
        res.status(201).json({ success: true, data: inventory });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

export const updateInventory = async (req, res) => {
    try {
        const inventory = await Inventory.findByIdAndUpdate(req.params.id, req.body, {
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

            const query = {
                $or: [
                    { project: inventory.projectId }, // Match by Project ID
                    { project: inventory.projectName }, // Match by Project Name string
                    { requirement: inventory.category }, // Match by Category
                    { subRequirement: inventory.subCategory } // Match by Sub-Category
                ]
            };

            const leads = await Lead.find(query).limit(50).sort({ updatedAt: -1 }).lean();
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

            if (query.$or.length === 0) return res.status(200).json({ success: true, data: [] });

            const inventories = await Inventory.find(query).limit(50).lean();
            return res.status(200).json({ success: true, count: inventories.length, data: inventories });
        }

        res.status(400).json({ success: false, error: "Either inventoryId or leadId is required" });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

import SystemSetting from "../models/SystemSetting.js";

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

        const restructuredData = data.map(item => {
            const result = {
                projectName: item.projectName,
                projectId: item.projectId,
                unitNo: item.unitNo,
                unitNumber: item.unitNo,
                unitType: item.unitType,
                category: item.category || item.type,
                subCategory: item.subCategory,
                builtupType: item.builtupType,
                block: item.block,
                size: item.size,
                sizeLabel: item.sizeLabel,
                direction: item.direction,
                facing: item.facing,
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

                // Owner Details
                ownerName: item.ownerName,
                ownerPhone: item.ownerPhone,
                ownerEmail: item.ownerEmail,
                ownerAddress: item.ownerAddress,

                // System Details
                assignedTo: item.assignedTo,
                team: item.team,
                status: item.status || 'Available',
                visibleTo: item.visibleTo || 'Everyone'
            };

            // AUTO-POPULATE FROM SYSTEM SIZES
            if (item.sizeLabel) {
                // Find matching size by Label, Project, and Block
                const matchedSize = systemSizes.find(s =>
                    s.name === item.sizeLabel &&
                    (s.project === item.projectName || s.project === 'Global')
                );

                if (matchedSize) {
                    result.unitType = matchedSize.sizeType || result.unitType;
                    result.builtUpArea = matchedSize.coveredArea || matchedSize.saleableArea; // Fallback
                    result.carpetArea = matchedSize.carpetArea;
                    result.superArea = matchedSize.saleableArea || matchedSize.totalArea;
                    result.category = matchedSize.category || result.category;
                    result.subCategory = matchedSize.subCategory || result.subCategory;

                    // If plot type, use totalArea and resultMetric
                    if (matchedSize.totalArea) {
                        result.size = matchedSize.totalArea;
                        result.sizeUnit = matchedSize.resultMetric;
                        result.dimensions = `${matchedSize.width || ''} x ${matchedSize.length || ''}`;
                    }
                }
            }

            return result;
        });

        await Inventory.insertMany(restructuredData, { ordered: false });

        res.status(200).json({
            success: true,
            message: `Successfully imported ${restructuredData.length} inventory items.`
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
