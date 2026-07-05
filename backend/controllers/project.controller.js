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
        const { sortBy, sortOrder, page, limit, search, developerId } = req.query;
        const visibilityFilter = await getVisibilityFilter(req.user);

        // Professional Search Logic
        let query = { ...visibilityFilter };
        
        if (developerId && mongoose.Types.ObjectId.isValid(developerId)) {
            query.developerId = developerId;
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
        // 🔒 Enterprise Isolation: Auto-tag with creator's department and teams
        if (req.user) {
            if (req.user.department && !data.department) data.department = req.user.department;
            if (req.user.teams && req.user.teams.length > 0 && (!data.teams || data.teams.length === 0)) {
                data.teams = req.user.teams.map(t => t._id || t);
            }
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
        const newBlocks = req.body.blocks || [];
        const blockNameChanges = [];

        newBlocks.forEach(newBlock => {
            if (newBlock._id) {
                const oldBlock = oldBlocks.find(ob => ob._id.toString() === newBlock._id.toString());
                if (oldBlock && oldBlock.name !== newBlock.name) {
                    blockNameChanges.push({ oldName: oldBlock.name, newName: newBlock.name });
                }
            }
        });

        // 3. Update the project
        const project = await Project.findOneAndUpdate({ _id: req.params.id, ...visibilityFilter }, req.body, { new: true }).populate(projectPopulateFields);

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
        const project = await Project.findOneAndDelete({ _id: req.params.id, ...visibilityFilter });
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
