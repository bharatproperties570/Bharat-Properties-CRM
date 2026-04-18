import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Role from '../models/Role.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../.env') });

const syncPermissions = async () => {
    try {
        console.log('🚀 Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected');

        const roleNames = ['Sales Manager', 'Sales Executive'];
        console.log(`🔍 Searching for roles: ${roleNames.join(', ')}`);

        const roles = await Role.find({ name: { $in: roleNames } });
        console.log(`📊 Found ${roles.length} roles to update.`);

        for (const role of roles) {
            console.log(`\n⚙️  Updating role: ${role.name}`);
            
            // Ensure moduleAccess exists
            if (!role.moduleAccess) role.moduleAccess = {};
            
            // Leads permission
            if (!role.moduleAccess.leads) role.moduleAccess.leads = { view: true, create: true, edit: true, delete: false };
            role.moduleAccess.leads.edit = true;
            console.log('  - Leads: edit = true');

            // Contacts permission
            if (!role.moduleAccess.contacts) role.moduleAccess.contacts = { view: true, create: true, edit: true, delete: false };
            role.moduleAccess.contacts.edit = true;
            console.log('  - Contacts: edit = true');

            // Keep existing delete permissions if already true (e.g. for Manager)
            if (role.name === 'Sales Manager') {
                role.moduleAccess.leads.delete = true;
                role.moduleAccess.contacts.delete = true;
            }

            role.markModified('moduleAccess');
            await role.save();
            console.log('  ✅ Saved');
        }

        console.log('\n✨ All requested permissions have been aligned in the database.');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error syncing permissions:', error);
        process.exit(1);
    }
};

syncPermissions();
