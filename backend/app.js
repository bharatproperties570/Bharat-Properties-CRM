import express from "express";
import cors from "cors";

import authRoutes from "./routes/auth.routes.js";
import leadRoutes from "./routes/lead.routes.js";
import contactRoutes from "./routes/contact.routes.js";
import inventoryRoutes from "./routes/inventory.routes.js";
import projectRoutes from "./routes/project.routes.js";
import lookupRoutes from "./routes/lookup.routes.js";
import activityRoutes from "./routes/activity.routes.js";
import fieldRuleRoutes from "./routes/fieldRule.routes.js";
import distributionRuleRoutes from "./routes/distributionRule.routes.js";

const app = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));

// Request Logger
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

app.use("/auth", authRoutes);
app.use("/leads", leadRoutes);
app.use("/contacts", contactRoutes);
app.use("/inventory", inventoryRoutes);
app.use("/projects", projectRoutes);
app.use("/lookup", lookupRoutes); // This now supports legacy query params
app.use("/lookups", lookupRoutes); // Alias for RESTful style
app.use("/activities", activityRoutes);
app.use("/field-rules", fieldRuleRoutes);
app.use("/distribution-rules", distributionRuleRoutes);

// Error Handling Middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ success: false, message: "Internal Server Error" });
});

export default app;
