import connectDB from "./src/config/db.js";
import linkedInService from "./services/LinkedInService.js";

async function run() {
    try {
        await connectDB();
        const status = await linkedInService.getConnectionHealth();
        console.log("LINKEDIN STATUS:", JSON.stringify(status, null, 2));
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
run();
