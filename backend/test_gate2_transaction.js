import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { updateRole } from './controllers/role.controller.js';
import Role from './models/Role.js';
import AuditLog from './models/AuditLog.js';
import cacheService from './services/cache.service.js';
const redis = cacheService.redis;

let replset;

async function run() {
    const originalLog = AuditLog.create;
    try {
        replset = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
        await mongoose.connect(replset.getUri()); await Role.init(); await AuditLog.init();
        
        const role = await Role.create({
            name: 'TestRoleTransaction',
            description: 'Before Transaction',
            permissions: [], department: 'sales'
        });

        if (redis) {
            redis.keys = async () => [];
            redis.del = async () => {};
            redis.setex = async () => {};
            redis.get = async () => null;
        }

        AuditLog.create = async function() { throw new Error('Simulated Audit Failure'); };

        const req = {
            params: { id: role._id.toString() },
            body: { description: 'After Transaction Mutated' },
            user: { _id: new mongoose.Types.ObjectId() }, // Actor
            get: () => 'dummy-host',
            originalUrl: '/api/roles'
        };
        
        let resStatus;
        let resJson;
        const res = {
            status: (code) => { resStatus = code; return res; },
            json: (data) => { resJson = data; return res; }
        };

        await updateRole(req, res);
        
        AuditLog.create = originalLog;
        
        if (resStatus !== 500) {
            console.error('AC-2 FAIL: Expected HTTP 500, got', resStatus);
            process.exitCode = 1;
            return;
        }
        
        const dbRole = await Role.findById(role._id);
        if (dbRole.description !== 'Before Transaction') {
            console.error('AC-2 FAIL: Role was mutated! Transaction did not rollback!');
            process.exitCode = 1;
            return;
        }
        
        console.log('AC-2 PASS: Transaction successfully rolled back on AuditLog failure.');
        process.exitCode = 0;
    } catch (e) {
        console.error('Test harness error:', e);
        process.exitCode = 1;
    } finally {
        AuditLog.create = originalLog;
        await mongoose.disconnect();
        if (replset) await replset.stop();
    }
}
run();
