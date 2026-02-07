import jwt from "jsonwebtoken";
import config from "../config/env.js";
import { AppError } from "./error.middleware.js";

export const authenticate = (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(" ")[1];

        if (!token) {
            throw new AppError("No token provided", 401);
        }

        const decoded = jwt.verify(token, config.jwtSecret);
        req.user = decoded;
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

        if (!roles.includes(req.user.role)) {
            return next(new AppError("Not authorized to access this resource", 403));
        }

        next();
    };
};
