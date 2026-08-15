import connectDB from "./src/config/db.js";
import SystemSetting from "./src/modules/systemSettings/system.model.js";

async function run() {
    try {
        await connectDB();
        const config = await SystemSetting.findOne({ key: 'linkedin_integration' });
        console.log("LINKEDIN CONFIG:", JSON.stringify(config, null, 2));
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
run();
