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

// Existing structure (kept for safety)
// import userRoutes from "./modules/users/user.routes.js"; (Not touching imports unless needed)
import userRoutes from "./modules/users/user.routes.js";
import roleRoutes from "./modules/roles/role.routes.js";
import configLookupRoutes from "./modules/lookups/lookup.routes.js";
import customFieldRoutes from "./modules/customFields/customField.routes.js";
import fieldRuleRoutes from "./modules/rules/fieldRule.routes.js";
import distributionRoutes from "./modules/rules/distribution.routes.js";
import scoringRoutes from "./modules/rules/scoring.routes.js";
import systemRoutes from "./modules/systemSettings/system.routes.js";

// Middleware
import { errorHandler } from "./middlewares/error.middleware.js";

const app = express();

app.use(cors());
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

// New settings API routes
app.use("/api/users", userRoutes);
app.use("/api/roles", roleRoutes);
app.use("/api/config/lookups", configLookupRoutes);
app.use("/api/config/fields", customFieldRoutes);
app.use("/api/rules/field", fieldRuleRoutes);
app.use("/api/rules/distribution", distributionRoutes);
app.use("/api/rules/scoring", scoringRoutes);
app.use("/api/system", systemRoutes);

// Error Handling Middleware (must be last)
app.use(errorHandler);

export default app;
