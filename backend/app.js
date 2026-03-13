import express from "express";
import cors from "cors";
import compression from "compression";
import cookieParser from "cookie-parser";
import mongoSanitize from "express-mongo-sanitize";
import rateLimit from "express-rate-limit";

// Route Imports
import authRoutes from "./routes/auth.routes.js";
import userRoutes from "./routes/user.routes.js";
import leadRoutes from "./routes/lead.routes.js";
import contactRoutes from "./routes/contact.routes.js";
import inventoryRoutes from "./routes/inventory.routes.js";
import projectRoutes from "./routes/project.routes.js";
import lookupRoutes from "./routes/lookup.routes.js";
import activityRoutes from "./routes/activity.routes.js";
import fieldRuleRoutes from "./routes/fieldRule.routes.js";
import distributionRuleRoutes from "./routes/distributionRule.routes.js";
import systemSettingRoutes from "./routes/systemSetting.routes.js";
import roleRoutes from "./routes/role.routes.js";
import dealRoutes from "./routes/deal.routes.js";
import companyRoutes from "./routes/company.routes.js";
import uploadRoutes from "./routes/upload.routes.js";
import teamRoutes from "./routes/team.routes.js";
import bookingRoutes from "./routes/booking.routes.js";
import collectorRateRoutes from "./routes/collectorRate.routes.js";
import valuationRoutes from "./routes/valuation.routes.js";
import duplicationRuleRoutes from "./routes/duplicationRule.routes.js";
import dashboardRoutes from "./routes/dashboard.routes.js";
import emailRoutes from "./routes/email.routes.js";
import enrichmentRoutes from "./src/modules/prospectingEnrichment/enrichment.routes.js";
import leadFormRoutes from "./routes/leadForm.routes.js";
import dealFormRoutes from "./routes/dealForm.routes.js";
import feedbackFormRoutes from "./routes/feedbackForm.routes.js";
import parsingRoutes from "./src/modules/parsing/parsingRule.routes.js";
import intakeRoutes from "./src/modules/intake/intake.routes.js";
import stageEngineRoutes from "./routes/stage.routes.js";
import smsRoutes from "./src/modules/sms/sms.routes.js";
import activityCompletionRoutes from "./src/modules/activity/activityCompletion.routes.js";
import stageTransitionRoutes from "./src/modules/rules/stageTransition.routes.js";

const app = express();

const allowedOrigins = [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:8081",
    "http://192.168.1.10:3000",
    "http://192.168.1.10:8081",
    "https://bharat-properties-crm.vercel.app",
    "https://api.bharatproperties.co",
    "https://crm.bharatproperties.com"
];

const envOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : [];
const combinedOrigins = [...new Set([...allowedOrigins, ...envOrigins])];

// Simple CORS for development/production
app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);

        if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
            return callback(null, true);
        }

        if (combinedOrigins.indexOf(origin) !== -1 || origin === process.env.FRONTEND_URL) {
            return callback(null, true);
        }

        // Check for Vercel preview URLs
        if (origin.endsWith('.vercel.app')) {
            return callback(null, true);
        }

        return callback(null, false);
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    credentials: true
}));

app.use(compression());
app.use(express.json({ limit: "10mb" }));
app.use(cookieParser());
app.use(mongoSanitize());

// Global Rate Limiting
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 1000,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: "Too many requests from this IP, please try again later." }
});
app.use("/api", globalLimiter);

// Health Check Endpoint
app.get("/api/health", (req, res) => {
    res.status(200).json({
        success: true,
        message: "API is healthy and reachable",
        timestamp: new Date().toISOString(),
        env: process.env.NODE_ENV || 'development'
    });
});

// Request Logger
app.use((req, res, next) => {
    if (process.env.NODE_ENV !== 'production') {
        try {
            console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url.split('?')[0]}`);
        } catch (err) { }
    }
    next();
});

// Route Definitions
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/teams", teamRoutes);
app.use("/api/roles", roleRoutes);
app.use("/api/leads", leadRoutes);
app.use("/api/contacts", contactRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/deals", dealRoutes);
app.use("/api/lookup", lookupRoutes);
app.use("/api/lookups", lookupRoutes);
app.use("/api/activities", activityRoutes);
app.use("/api/field-rules", fieldRuleRoutes);
app.use("/api/distribution-rules", distributionRuleRoutes);
app.use("/api/system-settings", systemSettingRoutes);
app.use("/api/companies", companyRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/collector-rates", collectorRateRoutes);
app.use("/api/valuation", valuationRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/duplication-rules", duplicationRuleRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/email", emailRoutes);
app.use("/api/enrichment", enrichmentRoutes);
app.use("/api/lead-forms", leadFormRoutes);
app.use("/api/deal-forms", dealFormRoutes);
app.use("/api/feedback-forms", feedbackFormRoutes);
app.use("/api/parsing-rules", parsingRoutes);
app.use("/api/intake", intakeRoutes);
app.use("/api/stage-engine", stageEngineRoutes);
app.use("/api/sms-gateway", smsRoutes);
app.use("/api/activities", activityCompletionRoutes);
app.use("/api/rules/stage-transitions", stageTransitionRoutes);

import fs from 'fs';
import path from 'path';

// Error Handling
app.use((err, req, res, next) => {
    if (err.isDuplicateMerge) {
        return res.status(200).json({
            success: true,
            message: "Duplicate detected. Incoming data merged into existing lead.",
            data: err.mergedLead
        });
    }
    console.error(err.stack);
    const logPath = path.join(process.cwd(), 'error.log');
    try {
        fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${req.method} ${req.url}\n${err.stack}\n\n`);
    } catch (fsErr) { }
    res.status(500).json({ success: false, message: "Internal Server Error", error: err.message });
});

export default app;
