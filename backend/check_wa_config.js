import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    const SystemSetting = mongoose.connection.db.collection('systemsettings');
    const wa = await SystemSetting.findOne({ key: 'meta_wa_config' });
    console.log('WA CONFIG:', wa ? 'EXISTS' : 'MISSING');
    if (wa) {
        console.log(wa.value.token ? (wa.value.token.includes('YOUR_') ? 'PLACEHOLDER TOKEN' : 'VALID TOKEN FORMAT') : 'NO TOKEN');
    }
    
    // Let's also check if they have email config
    const email = await SystemSetting.findOne({ key: 'email_config' });
    console.log('EMAIL CONFIG:', email ? 'EXISTS' : 'MISSING');
    
    process.exit(0);
}
run();
