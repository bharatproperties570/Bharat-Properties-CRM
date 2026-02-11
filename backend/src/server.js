import app from "../app.js";
import connectDB from "./config/db.js";
import config from "./config/env.js";

connectDB().then(() => {
    app.listen(config.port, () => {
        console.log(`🚀 CRM Backend running on port ${config.port}`);
        console.log(`📊 Environment: ${config.nodeEnv}`);
        console.log(`🔧 Mock Mode: ${config.mockMode ? 'Enabled' : 'Disabled'}`);
    });
}).catch(err => {
    console.error("❌ Failed to connect to DB", err);
    process.exit(1);
});
