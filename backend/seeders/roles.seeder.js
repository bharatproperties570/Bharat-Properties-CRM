/**
 * Role Seeder
 * Seeds the database with predefined role templates
 */

import Role from '../models/Role.js';
import { ROLE_TEMPLATES } from '../config/roles.config.js';

export const seedRoles = async () => {
    try {
        console.log('🌱 Seeding roles...');

        // Check if roles already exist
        const existingRoles = await Role.countDocuments({ isSystemRole: true });

        if (existingRoles > 0) {
            console.log(`ℹ️  Found ${existingRoles} existing system roles. Skipping seed.`);
            console.log('💡 To re-seed, delete existing system roles first.');
            return;
        }

        // Create all role templates
        const rolesToCreate = Object.values(ROLE_TEMPLATES);

        console.log(`📝 Creating ${rolesToCreate.length} system roles...`);

        const createdRoles = [];

        for (const roleTemplate of rolesToCreate) {
            try {
                const role = await Role.create(roleTemplate);
                createdRoles.push(role);
                console.log(`✅ Created role: ${role.name} (${role.department})`);
            } catch (error) {
                console.error(`❌ Failed to create role ${roleTemplate.name}:`, error.message);
            }
        }

        console.log(`\n✨ Successfully seeded ${createdRoles.length} roles!`);
        console.log('\n📊 Roles by department:');

        // Group by department
        const byDepartment = {};
        createdRoles.forEach(role => {
            if (!byDepartment[role.department]) {
                byDepartment[role.department] = [];
            }
            byDepartment[role.department].push(role.name);
        });

        Object.entries(byDepartment).forEach(([dept, roles]) => {
            console.log(`  ${dept.toUpperCase()}: ${roles.join(', ')}`);
        });

        return createdRoles;
    } catch (error) {
        console.error('❌ Error seeding roles:', error);
        throw error;
    }
};

// Run seeder if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    // Connect to database
    import('../config/db.js').then(async ({ default: connectDB }) => {
        try {
            await connectDB();
            await seedRoles();
            process.exit(0);
        } catch (error) {
            console.error('Seeder failed:', error);
            process.exit(1);
        }
    });
}

export default seedRoles;
