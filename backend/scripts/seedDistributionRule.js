import mongoose from 'mongoose';
import dotenv from 'dotenv';
import DistributionRule from '../models/DistributionRule.js';
import User from '../models/User.js';

dotenv.config();

const SURAJ_ID = '698de200eebee6c7a313dd32';

async function seedRule() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        // 1. Check if rule already exists
        const existing = await DistributionRule.findOne({ name: 'Online Portal Distribution' });
        if (existing) {
            console.log('Rule already exists, updating...');
            existing.isActive = true;
            existing.assignedAgents = [SURAJ_ID];
            existing.conditions = [{ field: 'campaign', operator: 'equals', value: 'Online' }];
            await existing.save();
        } else {
            console.log('Creating new distribution rule...');
            await DistributionRule.create({
                name: 'Online Portal Distribution',
                entity: 'lead',
                logic: 'ROUND_ROBIN',
                isActive: true,
                conditions: [{
                    field: 'campaign',
                    operator: 'equals',
                    value: 'Online'
                }],
                assignedAgents: [SURAJ_ID]
            });
        }

        console.log('Distribution rule seeded successfully!');
        process.exit(0);
    } catch (error) {
        console.error('Error seeding rule:', error);
        process.exit(1);
    }
}

seedRule();
