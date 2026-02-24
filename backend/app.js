import express from "express";
import cors from "cors";

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
        // Allow requests with no origin (native mobile apps, curl)
        if (!origin) return callback(null, true);
        // Allow any localhost origin in development (any port)
        if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
            return callback(null, true);
        }
        if (allowedOrigins.indexOf(origin) !== -1) {
            return callback(null, true);
        }
        return callback(new Error(`CORS: Origin ${origin} not allowed`), false);
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    credentials: true
}));
app.use(express.json({ limit: "10mb" }));

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

import fs from 'fs';
import path from 'path';

// Error Handling Middleware
app.use((err, req, res, next) => {
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
