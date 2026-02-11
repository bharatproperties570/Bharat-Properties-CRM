import Role from "../models/Role.js";

// Get all roles
export const getAllRoles = async (req, res) => {
    try {
        const roles = await Role.find();
        res.status(200).json({ success: true, count: roles.length, data: roles });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Get single role
export const getRoleById = async (req, res) => {
    try {
        const role = await Role.findById(req.params.id);
        if (!role) {
            return res.status(404).json({ success: false, message: "Role not found" });
        }
        res.status(200).json({ success: true, data: role });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Create role
export const createRole = async (req, res) => {
    try {
        const role = await Role.create(req.body);
        res.status(201).json({ success: true, data: role });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({ success: false, message: "Role already exists" });
        }
        res.status(400).json({ success: false, message: error.message });
    }
};

// Update role
export const updateRole = async (req, res) => {
    try {
        const role = await Role.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
            runValidators: true,
        });

        if (!role) {
            return res.status(404).json({ success: false, message: "Role not found" });
        }
        res.status(200).json({ success: true, data: role });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

// Delete role
export const deleteRole = async (req, res) => {
    try {
        const role = await Role.findById(req.params.id);
        if (!role) {
            return res.status(404).json({ success: false, message: "Role not found" });
        }

        if (role.isSystem) {
            return res.status(400).json({ success: false, message: "Cannot delete system roles" });
        }

        await role.deleteOne();
        res.status(200).json({ success: true, data: {} });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
