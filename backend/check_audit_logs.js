import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

mongoose.connect(process.env.MONGODB_URI).then(async () => {
    const { default: AuditLog } = await import("./models/AuditLog.js");
    // Find logs that might have the old leadMasterFields state or campaign updates
    const logs = await AuditLog.find({ 
        $or: [
            { resourceModel: 'SystemSetting' },
            { action: { $regex: /setting/i } },
            { details: { $regex: /campaign/i } }
        ]
    }).sort({ createdAt: -1 }).limit(50);
    
    console.log(`Found ${logs.length} logs`);
    logs.forEach(log => {
        console.log(`[${log.createdAt}] Action: ${log.action}, Resource: ${log.resourceModel}, Details: ${log.details}`);
        // If there's a payload or previousState, it might have the old campaigns
        if (log.previousState && typeof log.previousState === 'string' && log.previousState.includes('campaign')) {
            console.log(`Found old state!`);
            // console.log(log.previousState.substring(0, 200));
        }
    });
    process.exit();
});
