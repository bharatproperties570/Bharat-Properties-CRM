import dotenv from 'dotenv';
import mongoose from 'mongoose';
import connectDB from './src/config/db.js';
import ParsingRule from './src/modules/parsing/parsingRule.model.js';
import ParsingRuleAudit from './src/modules/parsing/parsingRuleAudit.model.js';
import User from './models/User.js';
import { addRule, deleteRule, bulkAddRules, getAuditLogs } from './src/modules/parsing/parsingRule.controller.js';

dotenv.config();

const run = async () => {
    console.log('Connecting to database...');
    await connectDB();
    console.log('Database connected.');

    const tenantA = new mongoose.Types.ObjectId();
    const tenantB = new mongoose.Types.ObjectId();
    const mockUserA = new mongoose.Types.ObjectId();
    const mockUserB = new mongoose.Types.ObjectId();

    console.log(`Mock Setup:\n  Tenant A: ${tenantA} | User A: ${mockUserA}\n  Tenant B: ${tenantB} | User B: ${mockUserB}`);

    // Clean up
    await ParsingRule.deleteMany({ tenantId: { $in: [tenantA, tenantB] } });
    await ParsingRuleAudit.deleteMany({ tenantId: { $in: [tenantA, tenantB] } });

    // Mock Response Helper
    const createMockResponse = () => ({
        statusCode: 200,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(obj) {
            this.body = obj;
            return this;
        }
    });

    // ==========================================
    // 1. Verify CREATE Audit Logging via addRule
    // ==========================================
    console.log('\n--- 1. Testing Rule Creation Audit Logging ---');
    const reqCreate = {
        body: {
            type: 'CITY',
            value: 'AuditTestCity',
            category: 'Audit'
        },
        user: {
            _id: mockUserA,
            tenantId: tenantA
        }
    };
    const resCreate = createMockResponse();

    await addRule(reqCreate, resCreate);
    const ruleId = resCreate.body.data._id;
    console.log('Created rule ID:', ruleId);

    const createAudit = await ParsingRuleAudit.findOne({ tenantId: tenantA, ruleId, action: 'CREATE' });
    console.log('Found CREATE Audit Log:', createAudit ? 'Yes' : 'No');
    if (createAudit) {
        console.log('  newValue value:', createAudit.newValue?.value);
        console.log('  changedBy User:', createAudit.changedBy);
    }

    if (createAudit && String(createAudit.changedBy) === String(mockUserA) && createAudit.newValue?.value === 'AuditTestCity') {
        console.log('✅ CREATE Audit Log matches expected values!');
    } else {
        console.error('❌ CREATE Audit Log failed validation!');
        process.exit(1);
    }

    // ==============================================
    // 2. Verify CREATE Audit Logging via bulkAddRules
    // ==============================================
    console.log('\n--- 2. Testing Bulk Creation Audit Logging ---');
    const reqBulk = {
        body: {
            rules: [
                { type: 'LOCATION', value: 'BulkLoc1', category: 'Audit' },
                { type: 'LOCATION', value: 'BulkLoc2', category: 'Audit' }
            ]
        },
        user: {
            _id: mockUserA,
            tenantId: tenantA
        }
    };
    const resBulk = createMockResponse();

    await bulkAddRules(reqBulk, resBulk);
    console.log('Bulk Rules count created:', resBulk.body.data?.length);

    const bulkCreatedIds = resBulk.body.data.map(r => r._id);
    const bulkAudits = await ParsingRuleAudit.find({ tenantId: tenantA, ruleId: { $in: bulkCreatedIds }, action: 'CREATE' });
    console.log('Found CREATE audits for bulk insertions:', bulkAudits.length);

    if (bulkAudits.length === 2) {
        console.log('✅ Bulk creation Audit Logs successfully written!');
    } else {
        console.error('❌ Bulk creation Audit Logs missing!');
        process.exit(1);
    }

    // ==========================================
    // 3. Verify DELETE Audit Logging via deleteRule
    // ==========================================
    console.log('\n--- 3. Testing Rule Deletion Audit Logging ---');
    const reqDelete = {
        params: { id: ruleId },
        user: {
            _id: mockUserA,
            tenantId: tenantA
        }
    };
    const resDelete = createMockResponse();

    await deleteRule(reqDelete, resDelete);
    console.log('Deleted rule response:', resDelete.body.success ? 'Success' : 'Failed');

    const deleteAudit = await ParsingRuleAudit.findOne({ tenantId: tenantA, ruleId, action: 'DELETE' });
    console.log('Found DELETE Audit Log:', deleteAudit ? 'Yes' : 'No');
    if (deleteAudit) {
        console.log('  oldValue value:', deleteAudit.oldValue?.value);
        console.log('  changedBy User:', deleteAudit.changedBy);
    }

    if (deleteAudit && String(deleteAudit.changedBy) === String(mockUserA) && deleteAudit.oldValue?.value === 'AuditTestCity') {
        console.log('✅ DELETE Audit Log matches expected values!');
    } else {
        console.error('❌ DELETE Audit Log failed validation!');
        process.exit(1);
    }

    // ================================================
    // 4. Verify Tenant-Isolation on Audit Log endpoint
    // ================================================
    console.log('\n--- 4. Testing Multi-Tenant Isolation for Audit Logs ---');
    
    // Add a rule and audit log for Tenant B to ensure it exists
    const reqCreateB = {
        body: { type: 'CITY', value: 'TenantBCity', category: 'Audit' },
        user: { _id: mockUserB, tenantId: tenantB }
    };
    const resCreateB = createMockResponse();
    await addRule(reqCreateB, resCreateB);

    // Fetch logs as User A (Tenant A)
    const reqGetA = { user: { _id: mockUserA, tenantId: tenantA } };
    const resGetA = createMockResponse();
    await getAuditLogs(reqGetA, resGetA);
    console.log('Tenant A audit logs count in response:', resGetA.body.data?.length);
    const containsTenantBData = resGetA.body.data.some(log => log.newValue?.value === 'TenantBCity');
    console.log('Tenant A logs contain Tenant B rule data:', containsTenantBData);

    // Fetch logs as User B (Tenant B)
    const reqGetB = { user: { _id: mockUserB, tenantId: tenantB } };
    const resGetB = createMockResponse();
    await getAuditLogs(reqGetB, resGetB);
    console.log('Tenant B audit logs count in response:', resGetB.body.data?.length);

    if (resGetA.body.data.length > 0 && !containsTenantBData && resGetB.body.data.length === 1) {
        console.log('✅ Tenant-isolated audit queries work perfectly!');
    } else {
        console.error('❌ Audit logs leak or are not isolated!');
        process.exit(1);
    }

    // Cleanup all test documents
    console.log('\nCleaning up database items...');
    await ParsingRule.deleteMany({ tenantId: { $in: [tenantA, tenantB] } });
    await ParsingRuleAudit.deleteMany({ tenantId: { $in: [tenantA, tenantB] } });
    console.log('Cleanup complete.');

    console.log('\n🎉 ALL COMPLIANCE AUDIT TRAIL TESTS PASSED SUCCESSFULLY!');
    process.exit(0);
};

run().catch(err => {
    console.error('Unexpected error in verification script:', err);
    process.exit(1);
});
