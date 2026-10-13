import ContactGroup from "../models/ContactGroup.js";
import Contact from "../models/Contact.js";

export const getGroups = async (req, res) => {
    try {
        const groups = await ContactGroup.find().sort({ name: 1 }).lean();
        const stats = await Contact.aggregate([
            { $match: { isDeleted: { $ne: true }, groups: { $exists: true, $ne: [] } } },
            { $unwind: "$groups" },
            {
                $group: {
                    _id: "$groups",
                    count: { $sum: 1 },
                    memberIds: { $addToSet: { $toString: "$_id" } }
                }
            }
        ]);
        const statMap = new Map(stats.map(s => [String(s._id), s]));
        const enriched = groups.map(g => {
            const st = statMap.get(String(g._id));
            return {
                ...g,
                memberCount: st ? st.count : 0,
                memberIds: st ? st.memberIds : []
            };
        });
        res.json({ success: true, data: enriched });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const createGroup = async (req, res) => {
    try {
        const { name, description, category, color } = req.body;
        const group = await ContactGroup.create({
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
        const group = await ContactGroup.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json({ success: true, data: group });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const deleteGroup = async (req, res) => {
    try {
        const group = await ContactGroup.findById(req.params.id);
        if (group.isSystem) {
            return res.status(403).json({ success: false, message: "Cannot delete system groups" });
        }
        
        // Remove group from all contacts
        await Contact.updateMany(
            { groups: req.params.id },
            { $pull: { groups: req.params.id } }
        );
        
        await group.deleteOne();
        res.json({ success: true, message: "Group deleted successfully" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Bulk Assign Contacts to Group
export const bulkAssign = async (req, res) => {
    try {
        const { contactIds, groupIds, action } = req.body; // action: 'add' or 'remove'
        
        if (action === 'add') {
            await Contact.updateMany(
                { _id: { $in: contactIds } },
                { $addToSet: { groups: { $each: groupIds } } }
            );
        } else {
            await Contact.updateMany(
                { _id: { $in: contactIds } },
                { $pullAll: { groups: groupIds } }
            );
        }
        
        res.json({ success: true, message: "Bulk assignment successful" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
