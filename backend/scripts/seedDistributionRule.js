import mongoose from 'mongoose';
import dotenv from 'dotenv';
import DistributionRule from '../models/DistributionRule.js';
import { normalizeDistributionRulePayload } from '../controllers/distributionRule.controller.js';
import { validateDistributionTargets } from '../src/validators/distributionTargetValidator.js';

dotenv.config();

async function seedRule() {
    try {
        const targetId = process.env.TARGET_AGENT_ID;
        const targetCampaignId = process.env.TARGET_CAMPAIGN_ID;

        if (!targetId || !targetCampaignId) {
            console.log('TARGET_AGENT_ID or TARGET_CAMPAIGN_ID environment variable not provided.');
            console.log('Skipping seed distribution rule. Please provide both to safely seed this rule with R20 canonical data.');
            return process.exit(0);
        }

        if (!mongoose.Types.ObjectId.isValid(targetCampaignId)) {
            console.log('TARGET_CAMPAIGN_ID must be a valid canonical ObjectId.');
            return process.exit(1);
        }

        await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        const payload = {
            name: 'Online Portal Distribution',
            entity: 'lead',
            logic: 'ROUND_ROBIN',
            isActive: true,
            triggerEvent: ['onCreate', 'onWebCapture'], // Required for R20 structure
            conditions: [{
                field: 'campaign',
                operator: 'equals',
                value: targetCampaignId
            }],
            assignedAgents: [targetId]
        };

        const existing = await DistributionRule.findOne({ name: 'Online Portal Distribution' });
        const normalizedData = normalizeDistributionRulePayload(payload, existing ? existing.toObject() : null);

        // 🛡️ Enforce relational integrity safety check before ANY write
        await validateDistributionTargets(normalizedData);

        if (existing) {
            console.log('Rule already exists, updating safe configuration...');
            await DistributionRule.findByIdAndUpdate(existing._id, normalizedData, { runValidators: true });
        } else {
            console.log('Creating new distribution rule with safe configuration...');
            await DistributionRule.create(normalizedData);
        }

        console.log('Distribution rule seeded safely and successfully!');
        process.exit(0);
    } catch (error) {
        console.error('Error seeding rule:', error.message);
        process.exit(1);
    }
}

seedRule();
