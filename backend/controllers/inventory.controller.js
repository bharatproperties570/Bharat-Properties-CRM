import Inventory from "../models/Inventory.js";
import Lead from "../models/Lead.js";
import Lookup from "../models/Lookup.js";
import User from "../models/User.js";
import SystemSetting from "../models/SystemSetting.js";
import Contact from "../models/Contact.js";
import Team from "../models/Team.js";
import { paginate } from "../utils/pagination.js";
import mongoose from "mongoose";
import Deal from "../models/Deal.js";
import DuplicationRule from "../models/DuplicationRule.js";


// ROBUST FILTER RESOLUTION (Handle both Names and IDs)
const escapeRegExp = (string) => {
    if (!string) return '';
    return String(string).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

const populateFields = [
    { path: "owners", select: "name phones emails title personalAddress" },
    {
        path: "associates.contact",
        model: 'Contact',
        select: "name phones emails title"
    },
    { path: "projectId" },
    { path: "category" },
    { path: "subCategory" },
    { path: "status" },
    { path: "unitType" },
    { path: "facing" },
    { path: "direction" },
    { path: "orientation" },
    { path: "sizeConfig" },
    { path: "roadWidth" },
    { path: "intent" },
    { path: "team", select: "name" },
    { path: "assignedTo", select: "fullName name team" },
    { path: "address.city" },
    { path: "address.tehsil" },
    { path: "address.state" },
    { path: "address.locality" },
    { path: "address.area" },
    { path: "address.location" }
];

export const getInventory = async (req, res) => {
    try {
        const { page = 1, limit = 10, search = "", category, subCategory, unitType, status, project, block, location, area, contactId, statusCategory } = req.query;

        let query = {};

        // Support for block/location filtering
        if (block || location) {
            query.block = block || location;
        }

        // Support for project name filtering via 'area' (used in some modals)
        if (area && !project) {
            query.projectName = area;
        }

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

        const resolveFilter = async (type, value) => {
            if (!value) return null;
            if (mongoose.Types.ObjectId.isValid(value)) return value;
            const lookup = await Lookup.findOne({ lookup_type: type, lookup_value: { $regex: new RegExp(`^${escapeRegExp(value)}$`, 'i') } });
            return lookup ? lookup._id : null;
        };

        if (category) query.category = await resolveFilter('Category', category);
        if (subCategory) query.subCategory = await resolveFilter('SubCategory', subCategory);
        if (unitType) query.unitType = await resolveFilter('Size', unitType);
        if (status) query.status = await resolveFilter('Status', status);
        if (project) {
            const projectConditions = [
                { projectId: mongoose.Types.ObjectId.isValid(project) ? project : undefined },
                { projectName: project }
            ].filter(c => c.projectId || c.projectName);

            if (query.$or) {
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
            { path: "associates.contact", select: "name phones" },
            { path: "projectId" },
            { path: "category" },
            { path: "subCategory" },
            { path: "status" },
            { path: "unitType" },
            { path: "facing" },
            { path: "direction" },
            { path: "orientation" },
            { path: "sizeConfig" },
            { path: "roadWidth" },
            { path: "team", select: "name" },
            { path: "assignedTo", select: "fullName" },
            { path: "address.city" },
            { path: "address.tehsil" },
            { path: "address.state" },
            { path: "address.locality" },
            { path: "address.area" },
            { path: "address.location" }
        ];

        // Fetch counts for Active and InActive
        // Note: In a real production system, these "Active/InActive" rules would be lookups or business rules.
        // For now, we define Active as 'Available' and InActive as 'Sold Out', 'Rented Out', 'Inactive'.

        const activeStatusNames = ['Available', 'Active', 'Interested / Warm', 'Interested / Hot', 'Request Call Back', 'Busy / Driving', 'Market Feedback', 'General Inquiry', 'Blocked', 'Booked', 'Interested'];
        const inactiveStatusNames = ['Sold Out', 'Rented Out', 'Not Interested', 'Inactive', 'Wrong Number / Invalid', 'Switch Off / Unreachable'];

        const [activeStatusDocs, inactiveStatusDocs] = await Promise.all([
            Lookup.find({ lookup_type: 'Status', lookup_value: { $in: activeStatusNames } }),
            Lookup.find({ lookup_type: 'Status', lookup_value: { $in: inactiveStatusNames } })
        ]);

        const activeStatusIds = activeStatusDocs.map(d => d._id);
        const inactiveStatusIds = inactiveStatusDocs.map(d => d._id);

        const [activeCount, inactiveCount] = await Promise.all([
            Inventory.countDocuments({
                ...query,
                $or: [
                    { status: { $in: activeStatusIds } },
                    { status: { $in: activeStatusNames } } // Fallback for string statuses
                ]
            }),
            Inventory.countDocuments({
                ...query,
                $or: [
                    { status: { $in: inactiveStatusIds } },
                    { status: { $in: inactiveStatusNames } } // Fallback for string statuses
                ]
            })
        ]);

        // Apply Status Category Filter if requested
        if (statusCategory === 'Active') {
            const activeCondition = {
                $or: [
                    { status: { $in: activeStatusIds } },
                    { status: { $in: activeStatusNames } }
                ]
            };
            if (query.$or) {
                query = { $and: [query, activeCondition] };
            } else {
                query = { ...query, ...activeCondition };
            }
        } else if (statusCategory === 'InActive') {
            const inactiveCondition = {
                $or: [
                    { status: { $in: inactiveStatusIds } },
                    { status: { $in: inactiveStatusNames } }
                ]
            };
            if (query.$or) {
                query = { $and: [query, inactiveCondition] };
            } else {
                query = { ...query, ...inactiveCondition };
            }
        }

        // Enhanced: Category-based counts for list view footer
        const categories = await Lookup.find({ lookup_type: 'Category' });
        const categoryCounts = await Promise.all(categories.map(async (cat) => {
            const count = await Inventory.countDocuments({
                ...query,
                $or: [
                    { category: cat._id },
                    { category: cat._id.toString() },
                    { category: cat.lookup_value }
                ]
            });
            return { name: cat.lookup_value, count };
        }));

        const results = await paginate(Inventory, query, Number(page), Number(limit), { createdAt: -1 }, populateFields);

        // Professional Fix: Add hasDeal flag to each inventory item for UI highlighting
        const inventoryIds = results.records.map(item => item._id);
        const deals = await mongoose.model('Deal').find({ inventoryId: { $in: inventoryIds } }, 'inventoryId').lean();
        const dealInventoryIds = new Set(deals.map(d => d.inventoryId.toString()));

        results.records = results.records.map(item => {
            const itemObj = item.toObject ? item.toObject() : item;
            return {
                ...itemObj,
                hasDeal: dealInventoryIds.has(item._id.toString())
            };
        });

        res.status(200).json({
            success: true,
            activeCount: activeCount || 0,
            inactiveCount: inactiveCount || 0,
            categoryStats: categoryCounts,
            ...results
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const getInventoryById = async (req, res) => {
    try {

        const inventory = await Inventory.findById(req.params.id).populate(populateFields);
        if (!inventory) {
            return res.status(404).json({ success: false, error: "Inventory item not found" });
        }

        const deals = await mongoose.model('Deal').find({ inventoryId: inventory._id }).lean();
        res.status(200).json({ success: true, data: { ...inventory.toObject(), deals } });
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
        if (data.subCategory) data.subCategory = await resolveLookup('SubCategory', data.subCategory);
        if (data.unitType) data.unitType = await resolveLookup('Size', data.unitType);
        if (data.status) data.status = await resolveLookup('Status', data.status); else data.status = await resolveLookup('Status', 'Inactive');
        if (data.facing) data.facing = await resolveLookup('Facing', data.facing);
        if (data.direction) data.direction = await resolveLookup('Direction', data.direction);
        if (data.orientation) data.orientation = await resolveLookup('Orientation', data.orientation);
        if (data.intent) data.intent = await resolveLookup('Intent', data.intent);
        if (data.assignedTo) data.assignedTo = await resolveUser(data.assignedTo);
        if (data.team) data.team = await resolveTeam(data.team);

        if (data.owners) data.owners = sanitizeIds(data.owners);
        if (data.associates) {
            data.associates = data.associates.map(assoc => {
                if (typeof assoc === 'string') return { contact: assoc };
                if (assoc.id || assoc.contact) {
                    return {
                        contact: assoc.contact || assoc.id,
                        relationship: assoc.relationship
                    };
                }
                return assoc;
            });
        }

        let inventory = await Inventory.create(data);
        inventory = await inventory.populate(populateFields);
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
        if (data.subCategory) data.subCategory = await resolveLookup('SubCategory', data.subCategory);
        if (data.unitType) data.unitType = await resolveLookup('Size', data.unitType);
        if (data.status) data.status = await resolveLookup('Status', data.status); else data.status = await resolveLookup('Status', 'Inactive');
        if (data.facing) data.facing = await resolveLookup('Facing', data.facing);
        if (data.direction) data.direction = await resolveLookup('Direction', data.direction);
        if (data.orientation) data.orientation = await resolveLookup('Orientation', data.orientation);
        if (data.intent) data.intent = await resolveLookup('Intent', data.intent);
        if (data.assignedTo) data.assignedTo = await resolveUser(data.assignedTo);
        if (data.team) data.team = await resolveTeam(data.team);

        if (data.owners) data.owners = sanitizeIds(data.owners);
        if (data.associates) {
            data.associates = data.associates.map(assoc => {
                if (typeof assoc === 'string') return { contact: assoc };
                if (assoc.id || assoc.contact) {
                    return {
                        contact: assoc.contact || assoc.id,
                        relationship: assoc.relationship
                    };
                }
                return assoc;
            });
        }

        const inventory = await Inventory.findByIdAndUpdate(req.params.id, data, {
            new: true,
            runValidators: true,
        }).populate([
            { path: "owners", select: "name phones" },
            { path: "associates.contact", select: "name phones" },
            { path: "projectId" },
            { path: "category" },
            { path: "subCategory" },
            { path: "status" },
            { path: "unitType" },
            { path: "facing" },
            { path: "direction" },
            { path: "orientation" },
            { path: "sizeConfig" },
            { path: "roadWidth" },
            { path: "assignedTo", select: "fullName" }
        ]);

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
            const interestedLeadsCount = await Lead.countDocuments({ interestedInventory: inventoryId });
            return res.status(200).json({ success: true, count: leads.length, data: leads, interestedCount: interestedLeadsCount });
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

    // Handle array or comma-separated string (for multi-intents)
    if (Array.isArray(value)) {
        return await Promise.all(value.map(val => resolveLookup(type, val)));
    }
    if (typeof value === 'string' && value.includes(',')) {
        return await resolveLookup(type, value.split(',').map(v => v.trim()).filter(Boolean));
    }

    if (mongoose.Types.ObjectId.isValid(value)) return value;
    const escapedValue = escapeRegExp(value);
    let lookup = await Lookup.findOne({ lookup_type: type, lookup_value: { $regex: new RegExp(`^${escapedValue}$`, 'i') } });
    if (!lookup) {
        lookup = await Lookup.create({ lookup_type: type, lookup_value: value });
    }
    return lookup._id;
};

/**
 * Professional Resolver for Size Labels
 * Matches by Project and Block to ensure correct configuration is picked
 */
export const resolveSizeLookup = async (value, projectName, blockName) => {
    if (!value) return null;
    if (mongoose.Types.ObjectId.isValid(value)) {
        const lookup = await Lookup.findById(value).lean();
        return { id: value, metadata: lookup?.metadata };
    }

    const escapedValue = escapeRegExp(value);
    const query = {
        lookup_type: 'Size',
        lookup_value: { $regex: new RegExp(`^${escapedValue}$`, 'i') }
    };

    // If multiple matches exist, prioritize by Project and Block
    const lookups = await Lookup.find(query).lean();
    if (lookups.length === 0) {
        const newLookup = await Lookup.create({ lookup_type: 'Size', lookup_value: value });
        return { id: newLookup._id, metadata: null };
    }

    if (lookups.length === 1) return { id: lookups[0]._id, metadata: lookups[0].metadata };

    // More than one match - filter by project/block
    let matched = lookups.find(l =>
        l.metadata?.project?.toLowerCase() === projectName?.toLowerCase() &&
        l.metadata?.block?.toLowerCase() === blockName?.toLowerCase()
    );

    if (!matched) {
        matched = lookups.find(l => l.metadata?.project?.toLowerCase() === projectName?.toLowerCase());
    }

    const final = matched || lookups[0];
    return { id: final._id, metadata: final.metadata };
};

// Helper to resolve User (By Name or Email)
const resolveUser = async (identifier) => {
    if (!identifier) return null;
    if (mongoose.Types.ObjectId.isValid(identifier)) return identifier;

    const escapedIdentifier = escapeRegExp(identifier);
    const user = await User.findOne({
        $or: [
            { fullName: { $regex: new RegExp(`^${escapedIdentifier}$`, 'i') } },
            { email: identifier.toLowerCase() },
            { name: { $regex: new RegExp(`^${escapedIdentifier}$`, 'i') } }
        ]
    });
    return user ? user._id : null;
};

// Helper to resolve Team (By Name)
const resolveTeam = async (identifier) => {
    if (!identifier) return null;
    if (mongoose.Types.ObjectId.isValid(identifier)) return identifier;

    const escapedIdentifier = escapeRegExp(identifier);
    const team = await Team.findOne({
        name: { $regex: new RegExp(`^${escapedIdentifier}$`, 'i') }
    });
    return team ? team._id : null;
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

        console.log(`[IMPORT] Received ${data.length} items for import`);

        // Fetch property sizes from Lookups for auto-populating area details
        const sizeLookups = await Lookup.find({ lookup_type: 'Size' }).lean();
        const systemSizes = sizeLookups.map(l => ({
            name: l.lookup_value,
            id: l._id,
            ...l.metadata
        }));

        const restructuredData = [];

        for (let i = 0; i < data.length; i++) {
            const item = data[i];
            try {
                const result = {
                    // Ensure project names and IDs are handled consistently
                    projectName: item.projectName || item.project || item['Project Name'],
                    projectId: item.projectId,
                    unitNo: item.unitNo || item.unitNumber || item['Unit No'] || item['Unit No*'],
                    unitNumber: item.unitNo || item.unitNumber || item['Unit No'] || item['Unit No*'],
                    builtupType: item.builtupType || item['Builtup Type'],

                    // Pricing mapping
                    price: {
                        value: parseFloat(item.price || item.value || item['Price'] || item['Asking Price'] || 0),
                        currency: item.currency || 'INR'
                    },
                    totalCost: {
                        value: parseFloat(item.totalCost || item.total_cost || item['Total Cost'] || 0),
                        currency: item.currency || 'INR'
                    },
                    allInclusivePrice: {
                        value: parseFloat(item.allInclusivePrice || item.all_inclusive_price || item['All Inclusive Price'] || 0),
                        currency: item.currency || 'INR'
                    },

                    // Size & Specs mapping
                    size: {
                        value: parseFloat(item.size || item.plotArea || item['Size'] || item['Plot Area'] || 0),
                        unit: item.sizeUnit || item.unit || item['Size Unit'] || 'Sq.Ft.'
                    },
                    sizeUnit: item.sizeUnit || item.unit || item['Size Unit'] || 'Sq.Ft.',
                    builtUpArea: {
                        value: parseFloat(item.builtUpArea || item.builtup_area || item['Builtup Area'] || item['Covered Area'] || 0),
                        unit: item.sizeUnit || item.unit || item['Size Unit'] || 'Sq.Ft.'
                    },
                    carpetArea: {
                        value: parseFloat(item.carpetArea || item.carpet_area || item['Carpet Area'] || 0),
                        unit: item.sizeUnit || item.unit || item['Size Unit'] || 'Sq.Ft.'
                    },
                    totalSaleableArea: {
                        value: parseFloat(item.totalSaleableArea || item.saleableArea || item.total_saleable_area || item['Total Saleable Area'] || 0),
                        unit: item.sizeUnit || item.unit || item['Size Unit'] || 'Sq.Ft.'
                    },
                    length: parseFloat(item.length || item.plotLength || item['Length'] || item['Plot Length'] || 0),
                    width: parseFloat(item.width || item.plotWidth || item['Width'] || item['Plot Width'] || 0),
                    floor: item.floor || item['Floor'],
                    block: item.block || item['Block'],
                    ownership: item.ownership || item['Ownership'],

                    // Construction Details
                    occupationDate: item.occupationDate || item['Occupation Date'],
                    possessionStatus: item.possessionStatus || item['Possession Status'],
                    furnishType: item.furnishType || item['Furnish Type'],
                    furnishedItems: item.furnishedItems || item['Furnished Items'],

                    // Location Details
                    address: {
                        hNo: item.hNo || item['H No'],
                        street: item.street || item['Street'],
                        locality: await resolveLookup('Area', item.locality || item['Locality']),
                        area: await resolveLookup('Area', item.area || item['Area']),
                        location: await resolveLookup('Area', item.location || item['Location']),
                        city: await resolveLookup('City', item.city || item['City']),
                        tehsil: await resolveLookup('Tehsil', item.tehsil || item['Tehsil']),
                        postOffice: item.postOffice || item['Post Office'],
                        pinCode: item.pinCode || item['Pin Code'] || item['Post Code'],
                        state: await resolveLookup('State', item.state || item['State']),
                        country: item.country || item['Country'] || 'India'
                    },
                    latitude: item.lat || item.latitude || item['Latitude'],
                    longitude: item.lng || item.longitude || item['Longitude'],

                    ownerName: item.ownerName || item['Owner Name'],
                    ownerPhone: item.ownerPhone || item['Owner Phone'],
                    ownerEmail: item.ownerEmail || item['Owner Email'],
                    ownerAddress: item.ownerAddress || item['Owner Address'],

                    team: await resolveTeam(item.team || item['Team']),
                    visibleTo: item.visibleTo || item['Visible To'] || 'Everyone'
                };

                // Resolve Lookups
                result.category = await resolveLookup('Category', item.category || item.type || item['Category'] || item['Property Category']);
                result.subCategory = await resolveLookup('SubCategory', item.subCategory || item['SubCategory'] || item['Property Category']);
                result.unitType = await resolveLookup('UnitType', item.unitType || item['Unit Type']);

                // Professional Size Alignment with Project/Block matching
                const sizeResult = await resolveSizeLookup(
                    item.sizeLabel || item.sizeConfig || item['Size Label'] || item['Size Label*'],
                    result.projectName,
                    result.block
                );
                result.sizeConfig = sizeResult?.id;
                result.status = await resolveLookup('Status', item.status || item['Status'] || 'Inactive');

                // Auto-populate Dimensions/Area from Size Metadata if missing in CSV
                if (sizeResult?.metadata) {
                    const meta = sizeResult.metadata;
                    if (!result.length && meta.length) result.length = parseFloat(meta.length);
                    if (!result.width && meta.width) result.width = parseFloat(meta.width);
                    if (result.size.value === 0 && meta.totalArea) {
                        result.size.value = parseFloat(meta.totalArea);
                        result.size.unit = meta.resultMetric || result.sizeUnit;
                    }
                    // Also populate saleable/covered if applicable
                    if (result.totalSaleableArea.value === 0 && meta.saleableArea) result.totalSaleableArea.value = parseFloat(meta.saleableArea);
                    if (result.builtUpArea.value === 0 && meta.coveredArea) result.builtUpArea.value = parseFloat(meta.coveredArea);
                    if (result.carpetArea.value === 0 && meta.carpetArea) result.carpetArea.value = parseFloat(meta.carpetArea);
                }

                // Mapping orientation/facing fields
                result.facing = await resolveLookup('Facing', item.facing || item['Facing'] || item['Orientation']);
                result.direction = await resolveLookup('Direction', item.direction || item['Direction'] || item['Orientation']);
                result.orientation = await resolveLookup('Orientation', item.orientation || item['Orientation']);
                result.roadWidth = await resolveLookup('RoadWidth', item.roadWidth || item['Road Width'] || item['RoadWidth']);
                result.intent = await resolveLookup('Intent', item.intent || item['Intent']);

                // Resolve User for AssignedTo
                result.assignedTo = await resolveUser(item.assignedTo);

                // Handle Owner Creation/Linking
                if (item.ownerName || item.ownerPhone || item.ownerEmail) {
                    try {
                        const query = [];
                        if (item.ownerPhone) query.push({ 'phones.number': { $regex: escapeRegExp(item.ownerPhone), $options: 'i' } });
                        if (item.ownerEmail) query.push({ 'emails.address': { $regex: escapeRegExp(item.ownerEmail), $options: 'i' } });

                        let contact = null;
                        if (query.length > 0) {
                            contact = await Contact.findOne({ $or: query });
                        }
                        if (!contact && item.ownerName) {
                            contact = await Contact.findOne({ name: { $regex: new RegExp(`^${escapeRegExp(item.ownerName)}$`, 'i') } });
                        }

                        if (!contact) {
                            const newContactData = {
                                name: item.ownerName || 'Unknown Owner',
                                phones: item.ownerPhone ? [{ number: item.ownerPhone, type: 'Personal' }] : [],
                                emails: item.ownerEmail ? [{ address: item.ownerEmail, type: 'Personal' }] : [],
                                source: await resolveLookup('Source', 'Data Import')
                            };
                            contact = await Contact.create(newContactData);
                        }

                        result.owners = [contact._id];
                    } catch (err) {
                        console.error(`[IMPORT] Error linking owner for item index ${i}:`, err);
                    }
                }

                // AUTO-POPULATE FROM SYSTEM SIZES
                if (item.sizeLabel) {
                    result.sizeLabel = item.sizeLabel;
                    const currentProjectName = result.projectName;
                    // Find matching size by Label, Project, and Block
                    const matchedSize = systemSizes.find(s =>
                        s.name === item.sizeLabel &&
                        (s.project === currentProjectName || s.project === 'Global')
                    );

                    if (matchedSize) {
                        // Overwrite if matched
                        if (matchedSize.unitType) result.unitType = await resolveLookup('Size', matchedSize.unitType);
                        result.builtUpArea = matchedSize.coveredArea || matchedSize.saleableArea; // Fallback
                        result.carpetArea = matchedSize.carpetArea;
                        result.superArea = matchedSize.saleableArea || matchedSize.totalArea;
                        if (matchedSize.category) result.category = await resolveLookup('Category', matchedSize.category);
                        if (matchedSize.subCategory) result.subCategory = await resolveLookup('SubCategory', matchedSize.subCategory);

                        // If plot type, use totalArea and resultMetric
                        if (matchedSize.totalArea) {
                            result.size = {
                                value: parseFloat(matchedSize.totalArea),
                                unit: matchedSize.resultMetric
                            };
                            result.sizeUnit = matchedSize.resultMetric;
                            result.dimensions = `${matchedSize.width || ''} x ${matchedSize.length || ''}`;
                        }
                    }
                }

                restructuredData.push(result);
                if (i % 50 === 0) console.log(`[IMPORT] Processed ${i}/${data.length} items`);
            } catch (itemErr) {
                console.error(`[IMPORT] Critical error in item restructuring at index ${i}:`, itemErr);
            }
        }

        console.log(`[IMPORT] Restructuring complete. Preparing bulk operations for ${restructuredData.length} documents...`);

        const bulkOps = restructuredData.map(item => ({
            updateOne: {
                filter: {
                    projectName: item.projectName,
                    block: item.block,
                    $or: [
                        { unitNo: item.unitNo },
                        { unitNumber: item.unitNo }
                    ]
                },
                update: { $set: item },
                upsert: true
            }
        }));

        const result = await Inventory.bulkWrite(bulkOps, { ordered: false });

        const successCount = (result.upsertedCount || 0) + (result.modifiedCount || 0);
        const newCount = result.upsertedCount || 0;
        const updatedCount = result.modifiedCount || 0;

        console.log(`[IMPORT] Bulk write complete. New: ${newCount}, Updated: ${updatedCount}`);

        res.status(200).json({
            success: true,
            message: `Import complete: ${newCount} added, ${updatedCount} updated.`,
            successCount: successCount,
            newCount,
            updatedCount,
            errorCount: 0
        });
    } catch (error) {
        console.error("Inventory Import Fatal Error:", error);
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
        const { items } = req.body; // Array of { unitNo, projectId, projectName, block }
        if (!items || !Array.isArray(items)) {
            return res.status(400).json({ success: false, error: "Invalid items provided" });
        }

        // Fetch active rules for Inventory from settings
        const inventoryRules = await DuplicationRule.find({
            entityType: 'Inventory',
            isActive: true
        }).lean();

        // Default: If no rules, check UnitNo + (Project + Block)
        const queryItems = items.map(item => {
            const conditions = [];

            // Standard real-estate identity: Project + Block + Unit
            const identityMatch = {
                $and: [
                    { $or: [{ unitNo: item.unitNo }, { unitNumber: item.unitNo }] },
                    { $or: [{ projectId: item.projectId }, { projectName: item.projectName || item.project }] },
                    { block: item.block }
                ]
            };
            conditions.push(identityMatch);

            // Add custom rules if defined in settings
            inventoryRules.forEach(rule => {
                const ruleFieldQueries = rule.fields.map(field => {
                    const value = item[field];
                    if (!value) return null;
                    return { [field]: value };
                }).filter(Boolean);

                if (ruleFieldQueries.length > 0) {
                    conditions.push(rule.matchType === 'all'
                        ? { $and: ruleFieldQueries }
                        : { $or: ruleFieldQueries }
                    );
                }
            });

            return { $or: conditions };
        });

        const query = { $or: queryItems };
        const duplicates = await Inventory.find(query, 'unitNo unitNumber projectId projectName block').lean();

        res.status(200).json({
            success: true,
            duplicates: duplicates.map(d => ({
                unitNo: d.unitNo || d.unitNumber,
                projectId: d.projectId,
                projectName: d.projectName,
                block: d.block
            }))
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};
