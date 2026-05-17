import { AppError } from "./error.middleware.js";
import User from "../../models/User.js";
import jwt from "jsonwebtoken";
import config from "../config/env.js";

export const authenticate = async (req, res, next) => {
    console.log(`[AUTH_AUDIT] Authenticating request: ${req.method} ${req.url}`);
    try {
        const token = req.headers.authorization?.split(" ")[1];

        if (!token) {
            throw new AppError("No token provided", 401);
        }

        const decoded = jwt.verify(token, config.jwtSecret);
        
        // 🚀 USER HYDRATION: Fetch full profile for Visibility Engine
        const user = await User.findById(decoded.id).populate('role teams').lean();
        if (!user) {
            throw new AppError("User account no longer exists", 401);
        }
        if (!user.isActive) {
            throw new AppError("User account is suspended", 403);
        }

        req.user = user;
        next();
    } catch (error) {
        if (error.name === "JsonWebTokenError") {
            next(new AppError("Invalid token", 401));
        } else if (error.name === "TokenExpiredError") {
            next(new AppError("Token expired", 401));
        } else {
            next(error);
        }
    }
};

export const authorize = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return next(new AppError("Not authenticated", 401));
        }

        const userRole = req.user.role?.name || req.user.role;
        const allowedRoles = roles.flat().map(r => String(r).toLowerCase());
        const currentUserRole = String(userRole || '').toLowerCase();

        if (!allowedRoles.includes(currentUserRole)) {
            return next(new AppError(`Access denied. Required: ${roles.flat().join(' or ')}`, 403));
        }

        next();
    };
};
