// Fix SMSGatewayHub baseUrl in DB - remove the placeholder URL with dummy values
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/bharat-properties-crm';

async function fixSmsConfig() {
    try {
        await mongoose.connect(mongoUri);
        console.log('✅ Connected to MongoDB');

        const result = await mongoose.connection.db.collection('smsproviders').updateOne(
            { provider: 'SMSGatewayHub' },
            {
                $set: {
                    'config.baseUrl': 'https://www.smsgatewayhub.com/api/mt/SendSMS',
                    'config.flash': 0,  // Fix boolean -> integer
                }
            }
        );
        console.log('✅ Updated SMSGatewayHub config:', result.modifiedCount, 'doc(s) modified');

        // Verify
        const provider = await mongoose.connection.db.collection('smsproviders').findOne({ provider: 'SMSGatewayHub' });
        console.log('\n=== Updated Config ===');
        console.log('baseUrl:', provider.config.baseUrl);
        console.log('flash:', provider.config.flash);
        console.log('route:', provider.config.route);
        console.log('entityId:', provider.config.entityId);
        console.log('senderId:', provider.config.senderId);
        console.log('isActive:', provider.isActive);

        process.exit(0);
    } catch (err) {
        console.error('Error:', err.message);
        process.exit(1);
    }
}
fixSmsConfig();
