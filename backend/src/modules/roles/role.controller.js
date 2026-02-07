import Role from "./role.model.js";
import { AppError } from "../../middlewares/error.middleware.js";

/**
 * Get all roles
 */
export const getRoles = async (req, res, next) => {
    try {
        const { active } = req.query;

        const query = {};
        if (active !== undefined) query.active = active === 'true';

        const roles = await Role.find(query).sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            count: roles.length,
            data: roles
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get single role
 */
export const getRole = async (req, res, next) => {
    try {
        const role = await Role.findById(req.params.id);

        if (!role) {
            throw new AppError('Role not found', 404);
        }

        res.status(200).json({
            success: true,
            data: role
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Create role
 */
export const createRole = async (req, res, next) => {
    try {
        const role = await Role.create(req.body);

        res.status(201).json({
            success: true,
            data: role
        });
    } catch (error) {
        if (error.code === 11000) {
            next(new AppError('Role with this name already exists', 400));
        } else {
            next(error);
        }
    }
};

/**
 * Update role
 */
export const updateRole = async (req, res, next) => {
    try {
        const role = await Role.findById(req.params.id);

        if (!role) {
            throw new AppError('Role not found', 404);
        }

        // Prevent updating system roles
        if (role.isSystem) {
            throw new AppError('Cannot update system roles', 403);
        }

        const updatedRole = await Role.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        );

        res.status(200).json({
            success: true,
            data: updatedRole
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Delete role
 */
export const deleteRole = async (req, res, next) => {
    try {
        const role = await Role.findById(req.params.id);

        if (!role) {
            throw new AppError('Role not found', 404);
        }

        // Prevent deleting system roles
        if (role.isSystem) {
            throw new AppError('Cannot delete system roles', 403);
        }

        await Role.findByIdAndDelete(req.params.id);

        res.status(200).json({
            success: true,
            message: 'Role deleted successfully'
        });
    } catch (error) {
        next(error);
    }
};
