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
import notificationRoutes from "./routes/notification.routes.js";
import searchRoutes from "./routes/search.routes.js";
import salesGoalRoutes from "./routes/salesGoal.routes.js";
import notificationSettingRoutes from "./routes/notificationSetting.routes.js";
import publicRoutes from "./routes/public.routes.js";
import googleSettingsRoutes from "./routes/googleSettings.routes.js";
import webhookRoutes from "./routes/webhook.routes.js";
import marketingRoutes from "./routes/marketing.routes.js";
import integrationSettingsRoutes from "./routes/integrationSettings.routes.js";
import conversationRoutes from "./routes/conversation.routes.js";
import aiAgentRoutes from "./routes/aiAgent.routes.js";

const app = express();

// CORS configuration moved to middleware function below

// combinedOrigins was unused

// Robust CORS Mirror
app.use(cors({
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        
        const isAllowed = 
            origin.includes('bharatproperties') || 
            origin.includes('localhost') || 
            origin.includes('127.0.0.1') || 
            origin.includes('192.168.') ||
            origin.endsWith('.loca.lt') ||
            origin.endsWith('.vercel.app');

        if (isAllowed) {
            callback(null, true);
        } else {
            callback(null, false);
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-API-KEY', 'X-Requested-With', 'bypass-tunnel-reminder'],
    credentials: true,
    preflightContinue: false,
    optionsSuccessStatus: 204
}));

app.use(compression());
app.use(express.json({ limit: "10mb" }));
app.use(cookieParser());
app.use(mongoSanitize());

// Trust proxy for rate limiting behind reverse proxies (like Vercel)
app.set('trust proxy', 1);

// Global Rate Limiting
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 500000, // Temporarily huge for verification
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
            if (process.stdout.writable) {
                console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url.split('?')[0]}`);
            }
        } catch (err) {
            // Silently ignore logging errors to avoid crashing the request
        }
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
// app.use("/api/activities", activityRoutes); // Moved below for better grouping
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
app.use("/api/activities", activityRoutes); // Standard activities
app.use("/api/activities/completion", activityCompletionRoutes); // Specialized completion logic
app.use("/api/rules/stage-transitions", stageTransitionRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/sales-goals", salesGoalRoutes);
app.use("/api/notification-settings", notificationSettingRoutes);
app.use("/api/public", publicRoutes);
app.use("/api/settings/google", googleSettingsRoutes);
app.use("/api/webhooks", webhookRoutes);   // Marketing automation webhooks
app.use("/api/marketings", marketingRoutes); // Marketing Suite AI Agent Stats
app.use("/api/settings/ai", integrationSettingsRoutes);
app.use("/api/settings/ai-agents", aiAgentRoutes);
app.use("/api/conversations", conversationRoutes);

import fs from 'fs';
import path from 'path';

// Error Handling
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
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
    } catch (fsErr) {
        console.error('Failed to log error to file:', fsErr);
    }
    res.status(500).json({ success: false, message: "Internal Server Error", error: err.message });
});

export default app;
