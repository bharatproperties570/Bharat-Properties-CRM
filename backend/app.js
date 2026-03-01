import express from "express";
import cors from "cors";
import compression from "compression";
import cookieParser from "cookie-parser";
import mongoSanitize from "express-mongo-sanitize";
import rateLimit from "express-rate-limit";

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
import parsingRoutes from "./src/modules/parsing/parsingRule.routes.js";
import intakeRoutes from "./src/modules/intake/intake.routes.js";
import stageEngineRoutes from "./routes/stage.routes.js";
import smsRoutes from "./src/modules/sms/sms.routes.js";

const app = express();

const allowedOrigins = [
    // Web CRM (React dev server)
    "http://localhost:3000",
    "http://localhost:3001",
    // Expo Web (various ports)
    "http://localhost:8081",
    "http://localhost:8082",
    "http://localhost:8083",
    "http://localhost:19006",
    "http://localhost:19000",
    "http://localhost:19001",
    // LAN access from device
    "http://192.168.1.10:3000",
    "http://192.168.1.10:8081",
    "http://192.168.1.10:8082",
    "http://192.168.1.10:19006",
    // Production
    "https://bharat-properties-crm.vercel.app",
    "https://api.bharatproperties.co"
];

app.use(cors({
    origin: function (origin, callback) {
        // Strict Policy: No valid origin -> blocked gracefully
        if (!origin) {
            // console.warn('CORS: Blocked request missing Origin header');
            // If running in development via Vite Proxy, the proxy often drops the origin
            // Since this is required for local dev, let's explicitly permit undefined Origin 
            // ONLY if in non-production.
            if (process.env.NODE_ENV !== 'production') {
                return callback(null, true);
            }
            return callback(null, false);
        }

        // Allow Localhost explicitly for Developers
        if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
            return callback(null, true);
        }

        // Check Whitelist
        if (allowedOrigins.indexOf(origin) !== -1 || origin === process.env.FRONTEND_URL) {
            return callback(null, true);
        }

        console.warn(`CORS: Blocked unknown origin ${origin}`);
        return callback(null, false);
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    credentials: true
}));
app.use(compression());
app.use(express.json({ limit: "10mb" }));
app.use(cookieParser());

// Data Sanitization against NoSQL query injection
app.use(mongoSanitize());

// Global Rate Limiting
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    limit: 500, // limit each IP to 500 requests per windowMs
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: "Too many requests from this IP, please try again after 15 minutes" }
});
// Skip rate limiting for static/frontend serving if any, but since it"s an API server, apply globally to /api
app.use("/api", globalLimiter);

// Concise Request Logger for Performance
app.use((req, res, next) => {
    if (process.env.NODE_ENV !== 'production') {
        try {
            console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url.split('?')[0]}`);
        } catch (err) {
            // Silently ignore logging errors to prevent server crash (e.g. EPIPE)
        }
    }
    next();
});

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/teams", teamRoutes);
app.use("/api/roles", roleRoutes);
app.use("/api/leads", leadRoutes);
app.use("/api/contacts", contactRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/deals", dealRoutes);
app.use("/api/lookup", lookupRoutes); // This now supports legacy query params
app.use("/api/lookups", lookupRoutes); // Alias for RESTful style
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
app.use("/api/parsing-rules", parsingRoutes);
app.use("/api/intake", intakeRoutes);
app.use("/api/stage-engine", stageEngineRoutes);
app.use("/api/sms-gateway", smsRoutes);

import fs from 'fs';
import path from 'path';

// Error Handling Middleware
app.use((err, req, res, next) => {
    // Catch Duplicate Lead Merges gracefully
    if (err.isDuplicateMerge) {
        return res.status(200).json({
            success: true,
            message: "Duplicate detected. Incoming data merged into existing lead.",
            data: err.mergedLead
        });
    }

    try {
        console.error(err.stack);
    } catch (logErr) {
        // Ignore logging errors
    }
    const logPath = path.join(process.cwd(), 'error.log');
    const logMessage = `[${new Date().toISOString()}] ${req.method} ${req.url}\n${err.stack}\n\n`;
    try {
        fs.appendFileSync(logPath, logMessage);
    } catch (fsErr) {
        // Ignore file system errors
    }
    res.status(500).json({ success: false, message: "Internal Server Error", error: err.message });
});

export default app;
