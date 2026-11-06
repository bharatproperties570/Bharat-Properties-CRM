import Project from "../models/Project.js";
import mongoose from "mongoose";
import { getVisibilityFilter } from "../utils/visibility.js";

const projectPopulateFields = [
    { path: 'owner', select: 'fullName email name' },
    { path: 'assign', select: 'fullName email name' },
    { path: 'team', select: 'name' },
    { path: 'teams', select: 'name' },
    { path: 'status', select: 'lookup_value' },
    { path: 'parkingType', select: 'lookup_value' },
    { path: 'unitType', select: 'lookup_value' },
    { path: 'category', select: 'lookup_value' },
    { path: 'subCategory', select: 'lookup_value' }
];

import { paginate } from "../utils/pagination.js";

export const getProjects = async (req, res) => {
    try {
        const { sortBy, sortOrder, page, limit, search, developerId, status } = req.query;
        const visibilityFilter = await getVisibilityFilter(req.user);

        // Professional Search Logic
        let query = {};
        
        if (developerId && mongoose.Types.ObjectId.isValid(developerId)) {
            query.developerId = developerId;
        }

        // 🎯 [ENTERPRISE SUMMARY FOOTER FILTER] Project Status Filtering
        if (status && status !== 'total' && status !== 'all') {
            const LookupModel = mongoose.model('Lookup');
            const statusLookups = await LookupModel.find({
                lookup_type: 'ProjectStatus',
                lookup_value: new RegExp(`^${status}$`, 'i')
            }).select('_id lookup_value').lean();
            const statusIds = statusLookups.map(l => l._id);
            const statusCondition = [
                { status: { $in: statusIds } },
                { status: new RegExp(`^${status}$`, 'i') }
            ];
            if (query.$or) {
                query.$and = (query.$and || []).concat([{ $or: query.$or }, { $or: statusCondition }]);
                delete query.$or;
            } else {
                query.$or = statusCondition;
            }
        }

        if (search) {
            const searchRegex = new RegExp(search, 'i');
            query.$or = [
                { name: searchRegex },
                { reraNumber: searchRegex },
                { 'address.locality': searchRegex },
                { 'address.area': searchRegex },
                { 'address.city': searchRegex },
                { developerName: searchRegex }
            ];
        }

        if (Object.keys(visibilityFilter).length > 0) {
            query = { $and: [visibilityFilter, Object.keys(query).length > 0 ? query : {}] };
        }

        // Professional Sorting Engine
        const finalSortBy = sortBy || 'updatedAt';
        const finalSortOrder = parseInt(sortOrder) || -1;
        const sortOption = { [finalSortBy]: finalSortOrder };

        // Secondary alphabetical sort for consistency
        if (!sortOption.name) sortOption.name = 1;

        const results = await paginate(
            Project, 
            query, 
            Number(page) || 1, 
            Number(limit) || 25, 
            sortOption, 
            projectPopulateFields
        );

        // manual hydration removed in favor of .populate()

        res.json({ 
            success: true, 
            data: results.records, 
            totalCount: results.totalCount,
            totalPages: results.totalPages,
            currentPage: results.currentPage
        });
    } catch (error) {
        console.error("[Project Controller] Error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

export const getProjectById = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ success: false, error: "Invalid Project ID format" });
        }
        // [SECURITY] Enforce visibility — scoped users cannot bypass via direct ID lookup
        const visibilityFilter = await getVisibilityFilter(req.user);
        const project = await Project.findOne({
            _id: req.params.id,
            ...visibilityFilter
        }).populate(projectPopulateFields).lean();

        if (!project) return res.status(404).json({ success: false, error: "Project not found or access denied" });

        // --- MANUAL HYDRATION (Mixed Fields) ---
        const projectObj = project;
        const fieldsToHydrate = ['status', 'parkingType', 'unitType'];
        const arrayFields = ['category', 'subCategory'];
        const Lookup = mongoose.model('Lookup');

        for (const f of fieldsToHydrate) {
            if (projectObj[f] && mongoose.Types.ObjectId.isValid(projectObj[f])) {
                const lookup = await Lookup.findById(projectObj[f]).select('lookup_value').lean();
                if (lookup) projectObj[f] = lookup;
            }
        }
        for (const f of arrayFields) {
            if (Array.isArray(projectObj[f])) {
                projectObj[f] = await Promise.all(projectObj[f].map(async (val) => {
                    if (val && mongoose.Types.ObjectId.isValid(val)) {
                        const lookup = await Lookup.findById(val).select('lookup_value').lean();
                        return lookup || val;
                    }
                    return val;
                }));
            }
        }

        res.json({ success: true, data: projectObj });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const addProject = async (req, res) => {
    try {
        const data = { ...req.body };
        if (!data.name || typeof data.name !== 'string' || !data.name.trim()) {
            return res.status(400).json({ success: false, error: "Project Name is required" });
        }
        // 🔒 Enterprise RBAC & Visibility Synchronization
        if (data.team && (!data.teams || data.teams.length === 0)) {
            data.teams = Array.isArray(data.team) ? data.team : [data.team];
        } else if (data.teams && (!data.team || data.team.length === 0)) {
            data.team = Array.isArray(data.teams) ? data.teams : [data.teams];
        }

        // Auto-tag with creator's department and teams ONLY if not explicitly provided
        if (req.user) {
            if (req.user.department && !data.department) data.department = req.user.department;
            if ((!data.teams || data.teams.length === 0) && (!data.team || data.team.length === 0)) {
                if (req.user.teams && req.user.teams.length > 0) {
                    const creatorTeams = req.user.teams.map(t => t._id || t);
                    data.teams = creatorTeams;
                    data.team = creatorTeams;
                }
            }
        }

        // Standardize visibleTo to canonical 3 pillars ('Private', 'Team', 'Everyone')
        if (!data.visibleTo) {
            data.visibleTo = 'Team';
        } else if (data.visibleTo === 'All Users' || data.visibleTo === 'Public') {
            data.visibleTo = 'Everyone';
        }

        let project = await Project.create(data);
        project = await Project.findById(project._id).populate(projectPopulateFields);
        res.json({ success: true, data: project });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({ success: false, error: "Project with this name already exists" });
        }
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(val => val.message);
            return res.status(400).json({ success: false, error: messages.join(', ') });
        }
        res.status(500).json({ success: false, error: error.message });
    }
};

export const updateProject = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ success: false, error: "Invalid Project ID format" });
        }
        const visibilityFilter = await getVisibilityFilter(req.user);

        // 1. Fetch old project to detect block name changes
        const oldProject = await Project.findOne({ _id: req.params.id, ...visibilityFilter }).lean();
        if (!oldProject) return res.status(404).json({ success: false, error: "Project not found or access denied" });

        // 2. Identify block name changes
        const oldBlocks = oldProject.blocks || [];
        const updateData = { ...req.body };
        const newBlocks = updateData.blocks || [];
        const blockNameChanges = [];

        newBlocks.forEach(newBlock => {
            if (newBlock._id) {
                const oldBlock = oldBlocks.find(ob => ob._id.toString() === newBlock._id.toString());
                if (oldBlock && oldBlock.name !== newBlock.name) {
                    blockNameChanges.push({ oldName: oldBlock.name, newName: newBlock.name });
                }
            }
        });

        // 🔒 Enterprise RBAC & Visibility Synchronization on Update
        if (updateData.team && (!updateData.teams || updateData.teams.length === 0)) {
            updateData.teams = Array.isArray(updateData.team) ? updateData.team : [updateData.team];
        } else if (updateData.teams && (!updateData.team || updateData.team.length === 0)) {
            updateData.team = Array.isArray(updateData.teams) ? updateData.teams : [updateData.teams];
        }
        if (updateData.visibleTo === 'All Users' || updateData.visibleTo === 'Public') {
            updateData.visibleTo = 'Everyone';
        }

        // 3. Update the project
        const project = await Project.findOneAndUpdate({ _id: req.params.id, ...visibilityFilter }, updateData, { new: true }).populate(projectPopulateFields);

        // 4. Cascade block name changes
        if (blockNameChanges.length > 0) {
            const Inventory = mongoose.model('Inventory');
            const Deal = mongoose.model('Deal');
            const Lookup = mongoose.model('Lookup');

            for (const change of blockNameChanges) {
                if (change.oldName && change.newName) {
                    // Update Inventory
                    await Inventory.updateMany(
                        { projectId: project._id, block: change.oldName },
                        { $set: { block: change.newName } }
                    );
                    
                    // Update Deals
                    await Deal.updateMany(
                        { projectId: project._id, block: change.oldName },
                        { $set: { block: change.newName } }
                    );

                    // Update Lookups (e.g. Size lookups bound to this block)
                    await Lookup.updateMany(
                        { 
                            lookup_type: 'Size', 
                            'metadata.projectId': String(project._id),
                            'metadata.block': change.oldName
                        },
                        { $set: { 'metadata.block': change.newName } }
                    );
                }
            }
        }

        res.json({ success: true, data: project });
    } catch (error) {
        console.error("Error updating project:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

export const deleteProject = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ success: false, error: "Invalid Project ID format" });
        }
        const visibilityFilter = await getVisibilityFilter(req.user);
        const project = await Project.softDeleteOne({ _id: req.params.id, ...visibilityFilter }, { userId: req.user?._id });
        if (!project) return res.status(404).json({ success: false, error: "Project not found or access denied" });
        res.json({ success: true, message: "Project deleted successfully" });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * @desc    Bulk import projects
 * @route   POST /projects/import
 * @access  Private
 */
export const importProjects = async (req, res) => {
    try {
        const { data } = req.body;
        if (!data || !Array.isArray(data)) {
            return res.status(400).json({ success: false, error: "Invalid data provided" });
        }

        const restructuredData = data.map(item => {
            if (!item.name) {
                throw new Error("Project Name is required");
            }

            return {
                name: item.name,
                developerName: item.developerName,
                reraNumber: item.reraNumber,
                description: item.description,
                category: item.category ? item.category.split(',').map(c => c.trim()) : [],
                subCategory: item.subCategory ? item.subCategory.split(',').map(c => c.trim()) : [],
                landArea: item.landArea,
                landAreaUnit: item.landAreaUnit,
                totalBlocks: item.totalBlocks,
                totalFloors: item.totalFloors,
                totalUnits: item.totalUnits,
                status: item.status || 'Upcoming',

                // Dates
                launchDate: item.launchDate ? new Date(item.launchDate) : undefined,
                possessionDate: item.possessionDate ? new Date(item.possessionDate) : undefined,

                // Location (Nested address object)
                address: {
                    hNo: item.hNo,
                    street: item.street,
                    locality: item.locality,
                    area: item.area,
                    city: item.city,
                    state: item.state,
                    pincode: item.pinCode,
                    country: 'India',
                    latitude: item.lat,
                    longitude: item.lng
                },

                // System Details
                team: item.team ? item.team.split(',').map(t => t.trim()) : [],
                visibleTo: item.visibleTo || 'Everyone'
            };
        });

        await Project.insertMany(restructuredData, { ordered: false });

        res.status(200).json({
            success: true,
            message: `Successfully imported ${restructuredData.length} projects.`
        });
    } catch (error) {
        if (error.writeErrors) {
            const realSuccessCount = req.body.data.length - error.writeErrors.length;
            return res.status(200).json({
                success: true,
                message: `Imported ${realSuccessCount} projects. ${error.writeErrors.length} failed.`,
                successCount: realSuccessCount,
                errorCount: error.writeErrors.length,
                errors: error.writeErrors.map(e => ({ item: e.errmsg, error: "Duplicate or Validation Error" }))
            });
        }
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * @desc    Check for duplicate projects by name
 * @route   POST /projects/check-duplicates
 * @access  Private
 */
export const checkDuplicatesImport = async (req, res) => {
    try {
        const { names } = req.body;
        if (!names || !Array.isArray(names)) {
            return res.status(400).json({ success: false, error: "Invalid names provided" });
        }

        const duplicates = await Project.find({ name: { $in: names } }, 'name').lean();
        const existingNames = duplicates.map(d => d.name);
        const matchedNames = names.filter(n => existingNames.includes(n));
        const uniqueMatched = [...new Set(matchedNames)];

        res.status(200).json({
            success: true,
            duplicates: uniqueMatched,
            details: duplicates.map(d => ({
                id: d._id,
                name: d.name
            }))
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * @desc    Get project-specific analytics (inventory, deals, sales velocity, price trends)
 * @route   GET /projects/:id/analytics
 * @access  Private
 */
export const getProjectAnalytics = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ success: false, error: "Invalid Project ID format" });
        }

        // Verify project exists and user has access
        const visibilityFilter = await getVisibilityFilter(req.user);
        const project = await Project.findOne({
            _id: req.params.id,
            ...visibilityFilter
        }).select('_id name pricing totalUnits').lean();

        if (!project) {
            return res.status(404).json({ success: false, error: "Project not found or access denied" });
        }

        const projectId = new mongoose.Types.ObjectId(req.params.id);
        const Inventory = mongoose.model('Inventory');
        const Deal = mongoose.model('Deal');
        const Lookup = mongoose.model('Lookup');
        const Booking = mongoose.model('Booking');

        const escapedProjectName = project?.name ? project.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '';

        // ── 1. Inventory Analytics (All units mapped to this project) ──
        const projectInvs = await Inventory.find({
            $or: [
                { projectId },
                ...(escapedProjectName ? [{ projectName: new RegExp(`^${escapedProjectName}$`, 'i') }] : [])
            ]
        }).select('_id status').populate({ path: 'status', select: 'lookup_value' }).lean();

        const projectInvIds = projectInvs.map(i => i._id);
        const inventoryTotal = projectInvs.length || Number(project?.totalUnits) || 0;

        // ── 2. Deal Analytics (Connected via projectId, projectName, or inventory units) ──
        const dealConditions = [
            { projectId },
            { projectId: String(req.params.id) },
            ...(escapedProjectName ? [{ projectName: new RegExp(`^${escapedProjectName}$`, 'i') }] : []),
            ...(projectInvIds.length > 0 ? [{ inventoryId: { $in: projectInvIds } }] : [])
        ];
        const allDeals = await Deal.find({ $or: dealConditions })
            .select('stage status price quotePrice ratePerUnit stageChangedAt updatedAt inventoryId')
            .lean();
        const dealIds = allDeals.map(d => d._id);

        // ── 3. Bookings Analytics (Connected via project inventory or deals) ──
        const bookingConditions = [];
        if (projectInvIds.length > 0) bookingConditions.push({ property: { $in: projectInvIds } });
        if (dealIds.length > 0) bookingConditions.push({ dealId: { $in: dealIds } });
        
        const allBookings = bookingConditions.length > 0
            ? await Booking.find({ $or: bookingConditions }).select('status totalDealAmount totalPaidAmount tokenAmount property dealId createdAt').lean()
            : [];

        // ── 4. Deal Stages Classification: Open, Quote, Negotiation, Closed (Won/Lost) ──
        const activeStages = ['Open', 'Quote', 'Negotiation'];
        const wonStages = ['Closed Won', 'Closed (Won)', 'Sold Out'];
        const lostStages = ['Closed Lost', 'Closed (Lost)', 'Cancelled'];

        let activeDeals = 0, closedWonDeals = 0, closedLostDeals = 0;
        let totalPipelineValue = 0;
        let totalDealValue = 0, ratePerUnitSum = 0, ratePerUnitCount = 0;

        const wonInventoryIds = new Set();

        for (const deal of allDeals) {
            const stage = deal.stage || 'Open';
            const status = deal.status || '';
            const price = Number(deal.price) || Number(deal.quotePrice) || 0;

            const isWon = wonStages.includes(stage) || (stage === 'Closed' && (status === 'Won' || status === 'Closed Won'));
            const isLost = lostStages.includes(stage) || (stage === 'Closed' && (status === 'Lost' || status === 'Unqualified' || status === 'Cancelled'));

            if (isWon) {
                closedWonDeals++;
                if (deal.inventoryId) wonInventoryIds.add(deal.inventoryId.toString());
            } else if (isLost) {
                closedLostDeals++;
            } else if (activeStages.includes(stage) || !isLost) {
                activeDeals++;
                totalPipelineValue += price;
            }

            if (price > 0) totalDealValue += price;
            if (deal.ratePerUnit && deal.ratePerUnit > 0) {
                ratePerUnitSum += deal.ratePerUnit;
                ratePerUnitCount++;
            }
        }

        // ── 5. Realized Revenue from Bookings ──
        const confirmedBookings = allBookings.filter(b => b.status !== 'Cancelled');
        const bookedInventoryIds = new Set();
        let totalRealizedRevenue = 0;

        for (const booking of confirmedBookings) {
            if (booking.property) bookedInventoryIds.add(booking.property.toString());
            const amount = Number(booking.totalPaidAmount) || Number(booking.totalDealAmount) || 0;
            totalRealizedRevenue += amount;
        }

        // Fallback: If no bookings yet but there are Closed Won deals, add won deal revenue
        if (totalRealizedRevenue === 0 && closedWonDeals > 0) {
            totalRealizedRevenue = allDeals
                .filter(d => wonStages.includes(d.stage) || (d.stage === 'Closed' && d.status === 'Won'))
                .reduce((sum, d) => sum + (Number(d.price) || 0), 0);
        }

        // ── 6. Units Sold: Bookings + Won Deals (Mark as Sold) + Status Sold ──
        const soldUnitIds = new Set([...bookedInventoryIds, ...wonInventoryIds]);
        for (const inv of projectInvs) {
            const statusStr = (inv.status && typeof inv.status === 'object' && inv.status.lookup_value)
                ? inv.status.lookup_value.toLowerCase()
                : (typeof inv.status === 'string' ? inv.status.toLowerCase() : '');
            if (statusStr.includes('sold')) {
                soldUnitIds.add(inv._id.toString());
            }
        }

        const sold = soldUnitIds.size;
        const available = Math.max(0, inventoryTotal - sold);
        const absorptionRate = inventoryTotal > 0 ? parseFloat(((sold / inventoryTotal) * 100).toFixed(1)) : 0;

        // ── 7. Market Insights: Avg Ticket Size & Stock Potential ──
        const validDeals = allDeals.filter(d => (Number(d.price) || 0) > 0);
        const avgDealValue = validDeals.length > 0
            ? Math.round(validDeals.reduce((sum, d) => sum + Number(d.price), 0) / validDeals.length)
            : (confirmedBookings.length > 0 && totalRealizedRevenue > 0
                ? Math.round(totalRealizedRevenue / confirmedBookings.length)
                : (project?.pricing?.basePrice?.amount ? Number(project.pricing.basePrice.amount) * 1000 : 0));

        const stockPotential = available * avgDealValue;
        const avgRatePerUnit = ratePerUnitCount > 0 ? Math.round(ratePerUnitSum / ratePerUnitCount) : 0;

        // ── Sales Velocity (last 12 months) ──
        const twelveMonthsAgo = new Date();
        twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
        twelveMonthsAgo.setDate(1);
        twelveMonthsAgo.setHours(0, 0, 0, 0);

        const salesVelocityAgg = await Deal.aggregate([
            {
                $match: {
                    $or: dealConditions,
                    stage: { $in: [...wonStages, 'Closed'] },
                    $expr: {
                        $gte: [{ $ifNull: ['$stageChangedAt', '$updatedAt'] }, twelveMonthsAgo]
                    }
                }
            },
            {
                $group: {
                    _id: {
                        $dateToString: {
                            format: '%Y-%m',
                            date: { $ifNull: ['$stageChangedAt', '$updatedAt'] }
                        }
                    },
                    count: { $sum: 1 },
                    value: { $sum: { $ifNull: ['$price', 0] } }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        const salesVelocity = salesVelocityAgg.map(item => ({
            month: item._id,
            count: item.count,
            value: item.value
        }));

        // ── Price Trend (last 12 months) ──
        const priceTrendAgg = await Deal.aggregate([
            {
                $match: {
                    $or: dealConditions,
                    ratePerUnit: { $gt: 0 },
                    $expr: {
                        $gte: [{ $ifNull: ['$stageChangedAt', '$updatedAt'] }, twelveMonthsAgo]
                    }
                }
            },
            {
                $group: {
                    _id: {
                        $dateToString: {
                            format: '%Y-%m',
                            date: { $ifNull: ['$stageChangedAt', '$updatedAt'] }
                        }
                    },
                    avgRate: { $avg: '$ratePerUnit' },
                    dealCount: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        const priceTrend = priceTrendAgg.map(item => ({
            month: item._id,
            avgRate: Math.round(item.avgRate),
            dealCount: item.dealCount
        }));

        // ── Stage Distribution ──
        const stageDistAgg = await Deal.aggregate([
            { $match: { $or: dealConditions } },
            {
                $group: {
                    _id: '$stage',
                    count: { $sum: 1 },
                    value: { $sum: { $ifNull: ['$price', 0] } }
                }
            },
            { $sort: { count: -1 } }
        ]);

        const stageDistribution = stageDistAgg.map(item => ({
            stage: item._id || 'Open',
            count: item.count,
            value: item.value
        }));

        res.json({
            success: true,
            data: {
                inventory: {
                    total: inventoryTotal,
                    available,
                    sold,
                    absorptionRate
                },
                deals: {
                    total: allDeals.length,
                    active: activeDeals,
                    closed: closedWonDeals,
                    cancelled: closedLostDeals,
                    totalPipelineValue,
                    totalRealizedRevenue,
                    avgDealValue,
                    stockPotential,
                    avgRatePerUnit
                },
                bookings: {
                    total: allBookings.length,
                    confirmed: confirmedBookings.length,
                    realizedRevenue: totalRealizedRevenue
                },
                salesVelocity,
                priceTrend,
                stageDistribution
            }
        });
    } catch (error) {
        console.error("[Project Analytics] Error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * @desc    Get leads interested in this project
 * @route   GET /projects/:id/leads
 * @access  Private
 */
export const getProjectLeads = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ success: false, error: "Invalid Project ID format" });
        }

        // Verify project exists and user has access
        const visibilityFilter = await getVisibilityFilter(req.user);
        const project = await Project.findOne({
            _id: req.params.id,
            ...visibilityFilter
        }).select('name').lean();

        if (!project) {
            return res.status(404).json({ success: false, error: "Project not found or access denied" });
        }

        const Lead = mongoose.model('Lead');
        const Lookup = mongoose.model('Lookup');
        const { page = 1, limit = 25 } = req.query;

        // Lead.projectName is an array of strings — this matches if the array contains the name
        const leadQuery = { projectName: project.name };

        const results = await paginate(
            Lead,
            leadQuery,
            Number(page),
            Number(limit),
            { updatedAt: -1 },
            [{ path: 'assignedTo', select: 'fullName email' }]
        );

        // Compute source distribution from ALL matching leads (not just current page)
        const sourceDistAgg = await Lead.aggregate([
            { $match: leadQuery },
            {
                $group: {
                    _id: '$source',
                    count: { $sum: 1 }
                }
            },
            { $sort: { count: -1 } }
        ]);

        // Resolve source lookup values
        const sourceDistribution = await Promise.all(sourceDistAgg.map(async (item) => {
            let sourceName = 'Unknown';
            if (item._id) {
                if (mongoose.Types.ObjectId.isValid(item._id)) {
                    const lookup = await Lookup.findById(item._id).select('lookup_value').lean();
                    if (lookup) sourceName = lookup.lookup_value;
                } else {
                    sourceName = String(item._id);
                }
            }
            return { source: sourceName, count: item.count };
        }));

        // Compute status distribution
        const statusDistAgg = await Lead.aggregate([
            { $match: leadQuery },
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 }
                }
            },
            { $sort: { count: -1 } }
        ]);

        // Resolve status lookup values
        const statusDistribution = await Promise.all(statusDistAgg.map(async (item) => {
            let statusName = 'Unknown';
            if (item._id) {
                if (mongoose.Types.ObjectId.isValid(item._id)) {
                    const lookup = await Lookup.findById(item._id).select('lookup_value').lean();
                    if (lookup) statusName = lookup.lookup_value;
                } else {
                    statusName = String(item._id);
                }
            }
            return { status: statusName, count: item.count };
        }));

        res.json({
            success: true,
            data: results.records,
            totalCount: results.totalCount,
            totalPages: results.totalPages,
            currentPage: results.currentPage,
            sourceDistribution,
            statusDistribution
        });
    } catch (error) {
        console.error("[Project Leads] Error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * @desc    Get activities related to this project's deals and leads
 * @route   GET /projects/:id/activities
 * @access  Private
 */
export const getProjectActivities = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ success: false, error: "Invalid Project ID format" });
        }

        // Verify project exists and user has access
        const visibilityFilter = await getVisibilityFilter(req.user);
        const project = await Project.findOne({
            _id: req.params.id,
            ...visibilityFilter
        }).select('name').lean();

        if (!project) {
            return res.status(404).json({ success: false, error: "Project not found or access denied" });
        }

        const Deal = mongoose.model('Deal');
        const Lead = mongoose.model('Lead');
        const Activity = mongoose.model('Activity');
        const { page = 1, limit = 25 } = req.query;

        const projectId = new mongoose.Types.ObjectId(req.params.id);

        // Get all deal IDs and their linked lead IDs for this project
        const projectDeals = await Deal.find({ projectId }).select('_id leadId leads').lean();
        const dealIds = projectDeals.map(d => d._id);

        // Collect lead IDs from deals
        const dealLeadIds = new Set();
        for (const deal of projectDeals) {
            if (deal.leadId) dealLeadIds.add(deal.leadId.toString());
            if (Array.isArray(deal.leads)) {
                deal.leads.forEach(lid => dealLeadIds.add(lid.toString()));
            }
        }

        // Also get leads directly interested in this project
        const projectLeads = await Lead.find({ projectName: project.name }).select('_id').lean();
        const directLeadIds = projectLeads.map(l => l._id);

        // Merge all lead IDs
        directLeadIds.forEach(lid => dealLeadIds.add(lid.toString()));
        const allLeadIds = Array.from(dealLeadIds)
            .filter(id => mongoose.Types.ObjectId.isValid(id))
            .map(id => new mongoose.Types.ObjectId(id));

        // Build activity query — match by entityType+entityId or details.dealId
        const activityConditions = [];

        if (dealIds.length > 0) {
            activityConditions.push({ entityType: 'Deal', entityId: { $in: dealIds } });
            activityConditions.push({ 'details.dealId': { $in: dealIds } });
        }

        if (allLeadIds.length > 0) {
            activityConditions.push({ entityType: 'Lead', entityId: { $in: allLeadIds } });
        }

        // If no deals or leads found, return empty
        if (activityConditions.length === 0) {
            return res.json({
                success: true,
                data: [],
                totalCount: 0,
                totalPages: 0,
                currentPage: 1
            });
        }

        const activityQuery = { $or: activityConditions };

        const results = await paginate(
            Activity,
            activityQuery,
            Number(page),
            Number(limit),
            { dueDate: -1, createdAt: -1 },
            [
                { path: 'createdBy', select: 'fullName' },
                { path: 'assignedTo', select: 'fullName' }
            ]
        );

        res.json({
            success: true,
            data: results.records,
            totalCount: results.totalCount,
            totalPages: results.totalPages,
            currentPage: results.currentPage
        });
    } catch (error) {
        console.error("[Project Activities] Error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};
