import Project from "../models/Project.js";

export const getProjects = async (req, res) => {
    try {
        const projects = await Project.find().lean();
        res.json({ success: true, data: projects });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const addProject = async (req, res) => {
    try {
        const project = await Project.create(req.body);
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
        const project = await Project.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!project) return res.status(404).json({ success: false, error: "Project not found" });
        res.json({ success: true, data: project });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const deleteProject = async (req, res) => {
    try {
        const project = await Project.findByIdAndDelete(req.params.id);
        if (!project) return res.status(404).json({ success: false, error: "Project not found" });
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
