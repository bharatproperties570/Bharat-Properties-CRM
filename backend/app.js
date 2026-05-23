// CRM Backend - Enterprise Performance Edition
import express from "express";
import cors from "cors";
import compression from "compression";
import cookieParser from "cookie-parser";
import mongoSanitize from "express-mongo-sanitize";
import rateLimit from "express-rate-limit";
import { AppError } from "./src/middlewares/error.middleware.js";
import { cacheMiddleware, invalidateCache } from "./src/middleware/apiCache.js";

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
import socialRoutes from "./routes/social.routes.js";
import whatsappActionRoutes from "./routes/whatsapp.actions.routes.js";
import webhookRoutes from "./routes/webhook.routes.js";
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
import marketingRoutes from "./routes/marketing.routes.js";
import integrationSettingsRoutes from "./routes/integrationSettings.routes.js";
import conversationRoutes from "./routes/conversation.routes.js";
import aiAgentRoutes from "./routes/aiAgent.routes.js";
import dynamicFormRoutes from "./routes/dynamicForm.routes.js";
import companyGroupRoutes from "./routes/companyGroup.routes.js";
import contactGroupRoutes from "./routes/contactGroup.routes.js";
import portfolioRoutes from "./routes/portfolio.routes.js";
import discoveryRoutes from "./src/modules/discovery/discovery.routes.js";
import intakeWebhookRoutes from "./src/modules/webhooks/whatsapp.routes.js";
import whatsappWebhookV2 from "./routes/whatsapp_webhook.v2.js";

const app = express();

// CORS configuration moved to middleware function below

// combinedOrigins was unused

// Robust CORS Mirror
app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl)
        if (!origin) return callback(null, true);
        
        const isAllowed = 
            origin.includes('bharatproperties') || 
            origin.includes('localhost') || 
            origin.includes('127.0.0.1') || 
            origin.includes('192.168.') ||
            origin.includes('10.0.') || // Emulators
            origin.endsWith('.loca.lt') ||
            origin.endsWith('.vercel.app');

        if (isAllowed) {
            callback(null, true);
        } else {
            console.warn(`[CORS] Rejected Origin: ${origin}`);
            callback(null, false);
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-API-KEY', 'X-Requested-With', 'bypass-tunnel-reminder', 'Origin', 'Cache-Control', 'Pragma', 'Expires'],
    credentials: true,
    preflightContinue: false,
    optionsSuccessStatus: 204
}));

// 🛡️ Debug Middleware: Trace incoming multipart/form-data headers
app.use((req, res, next) => {
    if (req.originalUrl.includes('/intake')) {
        console.log(`[Intake Trace] ${req.method} ${req.originalUrl}`);
        console.log(`[Intake Trace] Content-Type: ${req.headers['content-type']}`);
    }
    next();
});

// Compression: skip small responses, compress everything >= 1KB
app.use(compression({
    level: 6,
    threshold: 1024,
    filter: (req, res) => {
        if (req.headers['x-no-compression']) return false;
        return compression.filter(req, res);
    }
}));
app.use(express.json({ limit: "10mb" }));
app.use(cookieParser());
app.use(mongoSanitize({
    allowDots: true,      // REQUIRED: Meta sends hub.mode, hub.verify_token as dot-notation query params
    replaceWith: '_',     // Replace $ signs instead of stripping
}));

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
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url.split('?')[0]} ${res.statusCode} (${duration}ms)`);
    });
    next();
});

// ─────────────────────────────────────────────────────────────
// ENTERPRISE CACHE LAYER — Applied before route handlers
// Read routes: serve from cache. Write routes: invalidate cache.
// ─────────────────────────────────────────────────────────────
app.use("/api/lookups",  cacheMiddleware(5 * 60 * 1000));   // 5 min
app.use("/api/lookup",   cacheMiddleware(5 * 60 * 1000));   // 5 min
app.use("/api/users",    cacheMiddleware(2 * 60 * 1000));   // 2 min
app.use("/api/teams",    cacheMiddleware(2 * 60 * 1000));   // 2 min
app.use("/api/roles",    cacheMiddleware(5 * 60 * 1000));   // 5 min
app.use("/api/projects", cacheMiddleware(2 * 60 * 1000));   // 2 min

// Invalidate cache on writes
app.use("/api/lookups",  invalidateCache);
app.use("/api/users",    invalidateCache);
app.use("/api/teams",    invalidateCache);
app.use("/api/projects", invalidateCache);

// Route Definitions
app.use("/api/auth", authRoutes);
app.use("/api/marketing", marketingRoutes);
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
app.use("/api/social/webhook", whatsappWebhookV2); // High-performance WhatsApp Webhook v2.0
app.use("/api/intake-webhooks", intakeWebhookRoutes); // AI Auto-Verification webhooks
app.use("/api/settings/ai", integrationSettingsRoutes);
app.use("/api/settings/ai-agents", aiAgentRoutes);
app.use("/api/conversations", conversationRoutes);
app.use("/api/social",        socialRoutes);
app.use("/api/whatsapp-config", whatsappActionRoutes);
app.use("/api/dynamic-forms", dynamicFormRoutes);
app.use("/api/company-groups", companyGroupRoutes);
app.use("/api/contact-groups", contactGroupRoutes);
app.use("/api/portfolios", portfolioRoutes);
app.use("/api/discovery", discoveryRoutes);
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));
app.use("/api/uploads", express.static(path.join(process.cwd(), "uploads")));
app.use("/api/public/uploads", express.static(path.join(process.cwd(), "uploads")));

app.all("*", (req, res, next) => {
    console.error(`[404_FALLBACK] Missing Route: ${req.method} ${req.originalUrl}`);
    next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});


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
    
    // 🛠️ SENIOR DIAGNOSTIC: Log actual error for debugging
    const statusCode = err.statusCode || err.status || 500;
    
    if (statusCode === 400) {
        console.error(`[400_BAD_REQUEST] ${req.method} ${req.url}`);
        console.error(`Payload:`, JSON.stringify(req.body, null, 2));
        console.error(`Reason: ${err.message}`);
    }

    console.error(`[API_ERROR] ${req.method} ${req.url} - ${err.message}`);
    if (err.stack) console.error(err.stack);

    const logPath = path.join(process.cwd(), 'error.log');
    try {
        fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${req.method} ${req.url} (${statusCode})\nBody: ${JSON.stringify(req.body)}\n${err.stack || err.message}\n\n`);
    } catch (fsErr) {
        console.error('Failed to log error to file:', fsErr);
    }

    let message = err.message || "Internal Server Error";
    if (
        message.includes("timed out") || 
        message.includes("27017") || 
        message.includes("MongoNetworkError") || 
        message.includes("MongooseError") ||
        message.includes("ECONNREFUSED")
    ) {
        message = "Database Connection Timeout: The CRM backend could not connect to your MongoDB Atlas database. This is usually caused by an un-whitelisted dynamic IP address on your local internet connection. To permanently fix this: Log into MongoDB Cloud Console (cloud.mongodb.com) -> Security -> Network Access -> Add '0.0.0.0/0' (Allow Access from Anywhere).";
    }

    res.status(statusCode).json({ 
        success: false, 
        message: message,
        // Only include error details if not in production or if it's an operational error
        ...(process.env.NODE_ENV !== 'production' && { error: err.message, details: err.errors })
    });
});

export default app;
