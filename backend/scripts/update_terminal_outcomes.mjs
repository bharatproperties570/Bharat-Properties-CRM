import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

import SystemSetting from '../models/SystemSetting.js';

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    
    const setting = await SystemSetting.findOne({ key: 'activityMasterFields' });
    if (!setting) {
        console.log('activityMasterFields not found in DB.');
        process.exit(0);
    }

    let updated = false;
    const value = setting.value;

    const siteVisit = value.activities.find(a => a.name === 'Site Visit');
    if (siteVisit) {
        ['First Visit (Solo)', 'Re-Visit (With Family)'].forEach(purposeName => {
            const purpose = siteVisit.purposes.find(p => p.name === purposeName);
            if (purpose) {
                const hasOutcome = purpose.outcomes.some(o => o.label === 'Owner Denied Access/Not Selling');
                if (!hasOutcome) {
                    purpose.outcomes.push({ label: 'Owner Denied Access/Not Selling', score: -30, stage: 'Closed (Lost)' });
                    updated = true;
                }
            }
        });
    }

    const meeting = value.activities.find(a => a.name === 'Meeting');
    if (meeting) {
        meeting.purposes.forEach(purpose => {
            const hasOutcome = purpose.outcomes.some(o => o.label === 'Postponed Indefinitely');
            if (!hasOutcome) {
                purpose.outcomes.push({ label: 'Postponed Indefinitely', score: -30, stage: 'Closed (Lost)' });
                updated = true;
            }
        });
    }

    if (updated) {
        setting.value = value;
        setting.markModified('value');
        await setting.save();
        console.log('✅ DB updated with new terminal outcomes');
    } else {
        console.log('✅ Outcomes already exist in DB');
    }

    process.exit(0);
}

run();
