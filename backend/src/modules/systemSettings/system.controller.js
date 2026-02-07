import SystemSetting from "./system.model.js";
import { AppError } from "../../middlewares/error.middleware.js";

/**
 * Get all system settings
 */
export const getSystemSettings = async (req, res, next) => {
    try {
        const { category, isPublic } = req.query;

        const query = {};
        if (category) query.category = category;
        if (isPublic !== undefined) query.isPublic = isPublic === 'true';

        const settings = await SystemSetting.find(query).sort({ category: 1, key: 1 });

        res.status(200).json({
            success: true,
            count: settings.length,
            data: settings
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get setting by key
 */
export const getSettingByKey = async (req, res, next) => {
    try {
        const { key } = req.params;

        const setting = await SystemSetting.findOne({ key });

        if (!setting) {
            throw new AppError('Setting not found', 404);
        }

        res.status(200).json({
            success: true,
            data: setting
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Create or update system setting
 */
export const upsertSystemSetting = async (req, res, next) => {
    try {
        const { key } = req.body;

        const setting = await SystemSetting.findOneAndUpdate(
            { key },
            req.body,
            { new: true, upsert: true, runValidators: true }
        );

        res.status(200).json({
            success: true,
            data: setting
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Delete system setting
 */
export const deleteSystemSetting = async (req, res, next) => {
    try {
        const { key } = req.params;

        const setting = await SystemSetting.findOneAndDelete({ key });

        if (!setting) {
            throw new AppError('Setting not found', 404);
        }

        res.status(200).json({
            success: true,
            message: 'Setting deleted successfully'
        });
    } catch (error) {
        next(error);
    }
};
