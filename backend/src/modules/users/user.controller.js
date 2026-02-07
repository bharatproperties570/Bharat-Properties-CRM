import User from "./user.model.js";
import { AppError } from "../../middlewares/error.middleware.js";

/**
 * Get all users
 */
export const getUsers = async (req, res, next) => {
    try {
        const { status, department, search } = req.query;

        const query = {};

        if (status) query.status = status;
        if (department) query.department = department;
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } },
                { username: { $regex: search, $options: 'i' } }
            ];
        }

        const users = await User.find(query)
            .populate('roleId', 'name')
            .populate('managerId', 'name email')
            .select('-password')
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            count: users.length,
            data: users
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get single user
 */
export const getUser = async (req, res, next) => {
    try {
        const user = await User.findById(req.params.id)
            .populate('roleId')
            .populate('managerId', 'name email')
            .select('-password');

        if (!user) {
            throw new AppError('User not found', 404);
        }

        res.status(200).json({
            success: true,
            data: user
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Create user
 */
export const createUser = async (req, res, next) => {
    try {
        const user = await User.create(req.body);

        // Remove password from response
        user.password = undefined;

        res.status(201).json({
            success: true,
            data: user
        });
    } catch (error) {
        if (error.code === 11000) {
            const field = Object.keys(error.keyPattern)[0];
            next(new AppError(`User with this ${field} already exists`, 400));
        } else {
            next(error);
        }
    }
};

/**
 * Update user
 */
export const updateUser = async (req, res, next) => {
    try {
        // Don't allow password update through this endpoint
        delete req.body.password;

        const user = await User.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        ).select('-password');

        if (!user) {
            throw new AppError('User not found', 404);
        }

        res.status(200).json({
            success: true,
            data: user
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Delete user
 */
export const deleteUser = async (req, res, next) => {
    try {
        const user = await User.findByIdAndDelete(req.params.id);

        if (!user) {
            throw new AppError('User not found', 404);
        }

        res.status(200).json({
            success: true,
            message: 'User deleted successfully'
        });
    } catch (error) {
        next(error);
    }
};
