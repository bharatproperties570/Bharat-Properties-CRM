import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const SmsProviderSchema = new mongoose.Schema({
    providerName: String,
    isActive: Boolean,
    config: mongoose.Schema.Types.Mixed
}, { collection: 'smsproviders' });

const SmsProvider = mongoose.model('SmsProvider', SmsProviderSchema);

async function check() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');
        
        const providers = await SmsProvider.find({ isActive: true });
        console.log(`Active SMS Providers: ${providers.length}`);
        providers.forEach(p => {
            console.log(`- ${p.providerName}: APIKey=${p.config?.apiKey ? 'EXISTS' : 'MISSING'}`);
        });
        
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

check();
