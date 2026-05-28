import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

mongoose.connect(process.env.MONGODB_URI).then(async () => {
    const { default: SystemSetting } = await import("./src/modules/systemSettings/system.model.js");
    const setting = await SystemSetting.findOne({ key: 'leadMasterFields' });
    if(setting) {
        console.log(JSON.stringify(setting.value.campaigns, null, 2));
    } else {
        console.log("No setting found");
    }
    process.exit();
});
