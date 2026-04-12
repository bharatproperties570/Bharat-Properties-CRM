import BlacklistedToken from "../models/BlacklistedToken.js";
import User from "../models/User.js";
import jwt from "jsonwebtoken";

export const protect = async (req, res, next) => {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
        token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
        return res.status(401).json({ success: false, message: "Not authorized to access this route" });
    }

    try {
        const isBlacklisted = await BlacklistedToken.findOne({ token });
        if (isBlacklisted) {
            return res.status(401).json({ success: false, message: "Token has been revoked" });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // 🚀 USER HYDRATION: Fetch full profile for Visibility Engine
        const user = await User.findById(decoded.id).populate('role teams').lean();
        if (!user) {
            return res.status(401).json({ success: false, message: "User account no longer exists" });
        }
        if (!user.isActive) {
            return res.status(403).json({ success: false, message: "User account is suspended" });
        }

        req.user = user;
        next();
    } catch (err) {
        return res.status(401).json({ success: false, message: "Invalid token" });
    }
};

export const authorize = (...roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ success: false, message: "User role not authorized to access this route" });
        }
        next();
    };
};
