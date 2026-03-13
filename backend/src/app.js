import express from "express";
import cors from "cors";

// Existing routes
import authRoutes from "../routes/auth.routes.js";
import leadRoutes from "../routes/lead.routes.js";
import contactRoutes from "../routes/contact.routes.js";
import inventoryRoutes from "../routes/inventory.routes.js";
import projectRoutes from "../routes/project.routes.js";
import lookupRoutes from "../routes/lookup.routes.js";
import activityRoutes from "../routes/activity.routes.js";

// New settings module routes
import myFieldRuleRoutes from "../routes/fieldRule.routes.js"; // My implementation
import myDistributionRuleRoutes from "../routes/distributionRule.routes.js"; // My implementation
import companyRoutes from "../routes/company.routes.js";
import dealRoutes from "../routes/deal.routes.js";

// Existing structure (kept for safety)
// import userRoutes from "./modules/users/user.routes.js"; (Not touching imports unless needed)
import userRoutes from "./modules/users/user.routes.js";
import roleRoutes from "./modules/roles/role.routes.js";
import configLookupRoutes from "./modules/lookups/lookup.routes.js";
import customFieldRoutes from "./modules/customFields/customField.routes.js";
import fieldRuleRoutes from "./modules/rules/fieldRule.routes.js";
import distributionRoutes from "./modules/rules/distribution.routes.js";
// ScoringRule removed (Bug 4: was orphaned — never integrated into scoring pipeline)
import systemRoutes from "./modules/systemSettings/system.routes.js";
import parsingRoutes from "./modules/parsing/parsingRule.routes.js";
import intakeRoutes from "./modules/intake/intake.routes.js";
import smsRoutes from "./modules/sms/sms.routes.js";
import enrichmentRoutes from "./modules/prospectingEnrichment/enrichment.routes.js";
import activityCompletionRoutes from "./modules/activity/activityCompletion.routes.js";
import stageTransitionRoutes from "./modules/rules/stageTransition.routes.js";

// Middleware
import { errorHandler } from "./middlewares/error.middleware.js";

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
app.use(express.json({ limit: "10mb" }));

// Request Logger
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// Existing CRM routes
app.use("/auth", authRoutes);
app.use("/leads", leadRoutes);
app.use("/contacts", contactRoutes);
app.use("/inventory", inventoryRoutes);
app.use("/projects", projectRoutes);
app.use("/lookup", lookupRoutes);
app.use("/lookups", lookupRoutes); // Alias for RESTful style
app.use("/activities", activityRoutes);
app.use("/field-rules", myFieldRuleRoutes);
app.use("/distribution-rules", myDistributionRuleRoutes);
app.use("/companies", companyRoutes);
app.use("/deals", dealRoutes);

// New settings API routes
app.use("/users", userRoutes);
app.use("/roles", roleRoutes);
app.use("/config/lookups", configLookupRoutes);
app.use("/config/fields", customFieldRoutes);
app.use("/rules/field", fieldRuleRoutes);
app.use("/rules/distribution", distributionRoutes);
// app.use("/scoring-rules", scoringRoutes); // Removed: ScoringRule was orphaned (Bug 4)
app.use("/system-settings", systemRoutes);
app.use("/parsing-rules", parsingRoutes);
app.use("/intake", intakeRoutes);
app.use("/enrichment", enrichmentRoutes);
app.use("/activities", activityCompletionRoutes);   // Activity completion pipeline (stage + scoring)
app.use("/rules/stage-transitions", stageTransitionRoutes); // Stage transition rules CRUD
// app.use("/sms-gateway", smsRoutes); (Managed in backend/app.js)

// Error Handling Middleware (must be last)
app.use(errorHandler);

export default app;
