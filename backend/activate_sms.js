import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config({ path: './backend/.env' });

async function activateSms() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const result = await mongoose.connection.db.collection('smsproviders').updateOne(
            { provider: 'SMSGatewayHub' },
            { $set: { isActive: true } }
        );
        
        // Deactivate others
        await mongoose.connection.db.collection('smsproviders').updateMany(
            { provider: { $ne: 'SMSGatewayHub' } },
            { $set: { isActive: false } }
        );

        console.log('✅ SMSGatewayHub activated:', result.modifiedCount);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
activateSms();
