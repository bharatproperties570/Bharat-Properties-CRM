import CompanyGroup from "../models/CompanyGroup.js";
import Company from "../models/Company.js";

export const getGroups = async (req, res) => {
    try {
        const groups = await CompanyGroup.find().sort({ name: 1 });
        res.json({ success: true, data: groups });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const createGroup = async (req, res) => {
    try {
        const { name, description, category, color } = req.body;
        const group = await CompanyGroup.create({
            name,
            description,
            category,
            color,
            createdBy: req.user?._id
        });
        res.status(201).json({ success: true, data: group });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const updateGroup = async (req, res) => {
    try {
        const group = await CompanyGroup.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json({ success: true, data: group });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const deleteGroup = async (req, res) => {
    try {
        const group = await CompanyGroup.findById(req.params.id);
        if (group.isSystem) {
            return res.status(403).json({ success: false, message: "Cannot delete system groups" });
        }
        
        // Remove group from all companies
        await Company.updateMany(
            { groups: req.params.id },
            { $pull: { groups: req.params.id } }
        );
        
        await group.deleteOne();
        res.json({ success: true, message: "Group deleted successfully" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Bulk Assign Companies to Group
export const bulkAssign = async (req, res) => {
    try {
        const { companyIds, groupIds, action } = req.body; // action: 'add' or 'remove'
        
        if (action === 'add') {
            await Company.updateMany(
                { _id: { $in: companyIds } },
                { $addToSet: { groups: { $each: groupIds } } }
            );
        } else {
            await Company.updateMany(
                { _id: { $in: companyIds } },
                { $pullAll: { groups: groupIds } }
            );
        }
        
        res.json({ success: true, message: "Bulk assignment successful" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
