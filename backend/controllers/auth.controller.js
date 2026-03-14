import User from "../models/User.js";
import BlacklistedToken from "../models/BlacklistedToken.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import emailService from "../services/email.service.js";

export const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user) return res.status(401).json({ success: false, message: "Invalid credentials" });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(401).json({ success: false, message: "Invalid credentials" });

        const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "15m" });
        const refreshToken = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "7d" });

        // Record login activity
        await user.recordLogin(req.ip, req.get('user-agent'));

        const isProd = process.env.NODE_ENV === "production";
        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: isProd,
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });

        res.json({ success: true, token, user: { id: user._id, name: user.name, role: user.role } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const register = async (req, res) => {
    try {
        const { name, email, password, role } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = await User.create({ name, email, password: hashedPassword, role });
        res.json({ success: true, data: { id: user._id, name: user.name } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const refresh = async (req, res) => {
    try {
        const refreshToken = req.cookies.refreshToken;
        if (!refreshToken) return res.status(401).json({ success: false, message: "No refresh token provided" });

        const isBlacklisted = await BlacklistedToken.findOne({ token: refreshToken });
        if (isBlacklisted) return res.status(401).json({ success: false, message: "Invalidated token" });

        jwt.verify(refreshToken, process.env.JWT_SECRET, async (err, decoded) => {
            if (err) return res.status(403).json({ success: false, message: "Refresh token expired or invalid" });

            const newAccessToken = jwt.sign({ id: decoded.id, role: decoded.role }, process.env.JWT_SECRET, { expiresIn: "15m" });
            const newRefreshToken = jwt.sign({ id: decoded.id, role: decoded.role }, process.env.JWT_SECRET, { expiresIn: "7d" });

            await BlacklistedToken.create({ token: refreshToken }).catch(() => null);

            const isProd = process.env.NODE_ENV === "production";
            res.cookie('refreshToken', newRefreshToken, {
                httpOnly: true,
                secure: isProd,
                sameSite: 'strict',
                maxAge: 7 * 24 * 60 * 60 * 1000
            });

            res.json({ success: true, token: newAccessToken });
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const logout = async (req, res) => {
    try {
        const refreshToken = req.cookies.refreshToken;
        const authHeader = req.headers.authorization;
        const accessToken = authHeader && authHeader.split(" ")[1];

        if (refreshToken) {
            await BlacklistedToken.create({ token: refreshToken }).catch(() => null);
            res.clearCookie('refreshToken');
        }
        if (accessToken) {
            await BlacklistedToken.create({ token: accessToken }).catch(() => null);
        }

        res.json({ success: true, message: "Logged out successfully" });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email });

        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        // Generate reset token
        const resetToken = crypto.randomBytes(32).toString("hex");
        const hashedToken = crypto.createHash("sha256").update(resetToken).digest("hex");

        user.resetPasswordToken = hashedToken;
        user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
        await user.save();

        const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password/${resetToken}`;

        const message = `You are receiving this email because you (or someone else) have requested the reset of a password. Please click on the following link, or paste this into your browser to complete the process: \n\n ${resetUrl}`;

        try {
            await emailService.sendEmail(
                user.email,
                "Password Reset Request",
                message,
                `<h3>Password Reset Request</h3><p>You requested a password reset. Click the link below to reset your password:</p><a href="${resetUrl}">${resetUrl}</a>`
            );
            res.json({ success: true, message: "Email sent" });
        } catch (err) {
            user.resetPasswordToken = undefined;
            user.resetPasswordExpires = undefined;
            await user.save();
            return res.status(500).json({ success: false, message: "Email could not be sent" });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const resetPassword = async (req, res) => {
    try {
        const resetPasswordToken = crypto.createHash("sha256").update(req.params.token).digest("hex");

        const user = await User.findOne({
            resetPasswordToken,
            resetPasswordExpires: { $gt: Date.now() }
        });

        if (!user) {
            return res.status(400).json({ success: false, message: "Invalid or expired token" });
        }

        const { password } = req.body;
        user.password = await bcrypt.hash(password, 10);
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        user.passwordHistory.push({ hash: user.password, changedAt: new Date() });
        user.lastPasswordChange = new Date();
        
        await user.save();

        res.json({ success: true, message: "Password reset successful" });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};
