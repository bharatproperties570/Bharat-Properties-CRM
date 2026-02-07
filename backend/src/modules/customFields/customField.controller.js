import CustomField from "./customField.model.js";
import { AppError } from "../../middlewares/error.middleware.js";

/**
 * Get custom fields by module
 */
export const getCustomFieldsByModule = async (req, res, next) => {
    try {
        const { module } = req.params;
        const { active = 'true' } = req.query;

        const query = { module };
        if (active !== undefined) query.active = active === 'true';

        const fields = await CustomField.find(query).sort({ order: 1 });

        res.status(200).json({
            success: true,
            count: fields.length,
            data: fields
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get all custom fields
 */
export const getAllCustomFields = async (req, res, next) => {
    try {
        const fields = await CustomField.find().sort({ module: 1, order: 1 });

        res.status(200).json({
            success: true,
            count: fields.length,
            data: fields
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Create custom field
 */
export const createCustomField = async (req, res, next) => {
    try {
        const field = await CustomField.create(req.body);

        res.status(201).json({
            success: true,
            data: field
        });
    } catch (error) {
        if (error.code === 11000) {
            next(new AppError('Custom field with this name already exists for this module', 400));
        } else {
            next(error);
        }
    }
};

/**
 * Update custom field
 */
export const updateCustomField = async (req, res, next) => {
    try {
        const field = await CustomField.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        );

        if (!field) {
            throw new AppError('Custom field not found', 404);
        }

        res.status(200).json({
            success: true,
            data: field
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Delete custom field
 */
export const deleteCustomField = async (req, res, next) => {
    try {
        const field = await CustomField.findByIdAndDelete(req.params.id);

        if (!field) {
            throw new AppError('Custom field not found', 404);
        }

        res.status(200).json({
            success: true,
            message: 'Custom field deleted successfully'
        });
    } catch (error) {
        next(error);
    }
};
