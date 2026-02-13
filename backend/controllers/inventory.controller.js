import Inventory from "../models/Inventory.js";
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
        if (project) query.projectId = project;

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

export const addInventory = async (req, res) => {
    try {
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
        const { leadId } = req.query;
        // Logic for matching inventory with lead requirements would go here
        res.status(200).json({ success: true, data: [] });
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
                errors: error.writeErrors.map(e => ({ item: e.errmsg, error: "Duplicate or Validation Error" }))
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
