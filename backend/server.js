import "dotenv/config";
import app from "./app.js";
import connectDB from "./config/db.js";

// dotenv.config(); 

const PORT = process.env.PORT || 5000;

connectDB().then(() => {
    app.listen(PORT, () => {
        console.log(`🚀 CRM Backend running on port ${PORT}`);
    });
}).catch(err => {
    console.error("❌ Failed to connect to DB", err);
    process.exit(1);
});
