/**
 * Create Test User Script
 * Creates a test user to verify the system is working
 */

import connectDB from '../config/db.js';
import User from '../models/User.js';
import Role from '../models/Role.js';
import bcrypt from 'bcryptjs';

const createTestUser = async () => {
    try {
        console.log('🔧 Creating test user...\n');

        // Get Sales Executive role
        const salesExecRole = await Role.findOne({
            name: 'Sales Executive',
            department: 'sales'
        });

        if (!salesExecRole) {
            console.error('❌ Sales Executive role not found. Please run the role seeder first.');
            process.exit(1);
        }

        console.log(`✅ Found role: ${salesExecRole.name} (ID: ${salesExecRole._id})\n`);

        // Check if test user already exists
        const existingUser = await User.findOne({ email: 'test@bharatproperties.com' });
        if (existingUser) {
            console.log('ℹ️  Test user already exists:');
            console.log(`   Name: ${existingUser.fullName}`);
            console.log(`   Email: ${existingUser.email}`);
            console.log(`   Department: ${existingUser.department}`);
            console.log(`   Role: ${salesExecRole.name}`);
            console.log('\n💡 To create a new test user, delete the existing one first.');
            return;
        }

        // Hash password
        const hashedPassword = await bcrypt.hash('Test@123', 10);

        // Calculate password expiry (90 days from now)
        const passwordExpiresAt = new Date();
        passwordExpiresAt.setDate(passwordExpiresAt.getDate() + 90);

        // Create test user
        const testUser = new User({
            fullName: 'Test User',
            email: 'test@bharatproperties.com',
            mobile: '+91 9876543210',
            username: 'testuser',
            password: hashedPassword,
            department: 'sales',
            role: salesExecRole._id,
            dataScope: 'assigned',
            locationScope: {},
            financialPermissions: {
                canViewMargin: false,
                canEditCommission: false,
                canOverrideCommission: false,
                canApproveDeal: false,
                canApprovePayment: false,
                canApprovePayout: false
            },
            passwordExpiresAt,
            passwordHistory: [{ hash: hashedPassword, changedAt: new Date() }],
            isActive: true,
            status: 'active'
        });

        await testUser.save();

        console.log('✨ Test user created successfully!\n');
        console.log('📋 User Details:');
        console.log(`   Name: ${testUser.fullName}`);
        console.log(`   Email: ${testUser.email}`);
        console.log(`   Mobile: ${testUser.mobile}`);
        console.log(`   Username: ${testUser.username}`);
        console.log(`   Password: Test@123`);
        console.log(`   Department: ${testUser.department}`);
        console.log(`   Role: ${salesExecRole.name}`);
        console.log(`   Data Scope: ${testUser.dataScope}`);
        console.log(`   Status: ${testUser.status}`);
        console.log(`   Password Expires: ${passwordExpiresAt.toLocaleDateString()}`);
        console.log('\n🔐 You can now login with these credentials!');

    } catch (error) {
        console.error('❌ Error creating test user:', error);
        throw error;
    }
};

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    connectDB().then(async () => {
        try {
            await createTestUser();
            process.exit(0);
        } catch (error) {
            console.error('Script failed:', error);
            process.exit(1);
        }
    });
}

export default createTestUser;
