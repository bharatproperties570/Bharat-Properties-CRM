// Check and fix SMS templates - verify dltHeaderId is the correct senderId
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/bharat-properties-crm';

async function fixTemplates() {
    try {
        await mongoose.connect(mongoUri);
        console.log('✅ Connected to MongoDB');

        const templates = await mongoose.connection.db.collection('smstemplates').find().toArray();
        console.log('\n=== SMS Templates ===');
        templates.forEach(t => {
            console.log(`\nTemplate: ${t.name}`);
            console.log(`  body: ${t.body}`);
            console.log(`  dltTemplateId: ${t.dltTemplateId}`);
            console.log(`  dltHeaderId: ${t.dltHeaderId}  <-- This is used as senderid override`);
            console.log(`  category: ${t.category}`);
            console.log(`  isActive: ${t.isActive}`);
        });

        // Fix: if dltHeaderId is the entityId (numeric 19 char), it should be the senderId (200570)
        // The dltHeaderId in DLT context = DLT Header ID registered, NOT entityId
        // SMSGatewayHub uses this as the senderid override
        // Since user registered senderId as '200570', we should set dltHeaderId to that
        const result = await mongoose.connection.db.collection('smstemplates').updateMany(
            {
                dltHeaderId: { $exists: true, $ne: '' },
                // Only fix if dltHeaderId looks like an entityId (very long numeric)
                $where: 'this.dltHeaderId && this.dltHeaderId.length > 10'
            },
            { $set: { dltHeaderId: '' } }  // Clear wrong value - service will use default senderId from config
        );
        console.log(`\n✅ Fixed dltHeaderId: ${result.modifiedCount} template(s) updated`);

        // Show final state
        const updatedTemplates = await mongoose.connection.db.collection('smstemplates').find().toArray();
        console.log('\n=== Updated Templates ===');
        updatedTemplates.forEach(t => {
            console.log(`  ${t.name}: dltTemplateId=${t.dltTemplateId}, dltHeaderId="${t.dltHeaderId}"`);
        });

        process.exit(0);
    } catch (err) {
        console.error('Error:', err.message);
        process.exit(1);
    }
}
fixTemplates();
