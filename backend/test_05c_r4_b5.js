import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import assert from 'assert';

let mongoServer;

async function runTests() {
    console.log('Starting R4-B5 Tests...');
    mongoServer = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    process.env.MONGODB_URI = mongoServer.getUri();
    await mongoose.connect(mongoServer.getUri());
    
    let passed = 0;
    let failed = 0;
    let total = 0;

    const assertTest = async (name, testFn) => {
        total++;
        try {
            await testFn();
            passed++;
            console.log(`✅ PASS: ${name}`);
        } catch (e) {
            failed++;
            console.error(`❌ FAIL: ${name}`);
            console.error(e);
        }
    };

    const { authorizeTargetEntity } = await import('./utils/authorization.js');
    const { DomainEventPublisher } = await import('./utils/DomainEventPublisher.js');
    const OutboxEvent = (await import('./models/OutboxEvent.js')).default;
    const Activity = (await import('./models/Activity.js')).default;
    const Lead = (await import('./models/Lead.js')).default;
    
    global.getCorrelationId = () => 'test-correlation-id';

    const teamId1 = new mongoose.Types.ObjectId();
    const teamId2 = new mongoose.Types.ObjectId();
    const userA_id = new mongoose.Types.ObjectId();
    const userB_id = new mongoose.Types.ObjectId();
    
    const userA = { _id: userA_id, role: { name: 'agent' }, department: 'sales', teams: [teamId1], isSuperAdmin: false };
    const userB = { _id: userB_id, role: { name: 'agent' }, department: 'sales', teams: [teamId2], isSuperAdmin: false };
    
    const leadA = await Lead.create({ firstName: 'Lead', lastName: 'A', email: 'leadA@example.com', mobile: '9999999999', owner: userA._id, teams: [teamId1] });

    await assertTest('1. authorized Activity target', async () => {
        const target = await authorizeTargetEntity(userA, 'Lead', leadA._id);
        assert.strictEqual(target._id.toString(), leadA._id.toString());
    });

    await assertTest('2. unauthorized Activity target', async () => {
        try {
            await authorizeTargetEntity(userB, 'Lead', leadA._id);
            assert.fail('Should have thrown 403');
        } catch (e) {
            assert.strictEqual(e.statusCode || e.status, 403);
        }
    });

    await assertTest('3. invalid event type rejected', async () => {
        try {
            const session = await mongoose.startSession();
            await DomainEventPublisher.publishFromHttp({ user: userA }, session, {
                eventType: 'InvalidEvent',
                aggregateType: 'Lead',
                aggregateId: leadA._id,
                payload: {}
            });
            assert.fail('Should have thrown');
        } catch (e) {
            assert.ok(e.message.includes('Unauthorized event type'));
        }
    });
    
    await assertTest('4. missing session rejected', async () => {
        try {
            await DomainEventPublisher.publishFromHttp({ user: userA }, null, {
                eventType: 'LeadUpdated',
                aggregateType: 'Lead',
                aggregateId: leadA._id,
                payload: {}
            });
            assert.fail('Should have thrown');
        } catch (e) {
            assert.ok(e.message.includes('Transaction session is required'));
        }
    });

    await assertTest('5. provenance derivation', async () => {
        const session = await mongoose.startSession();
        await session.withTransaction(async () => {
            await DomainEventPublisher.publishFromMobile({ user: userA }, session, {
                eventType: 'LeadUpdated',
                aggregateType: 'Lead',
                aggregateId: leadA._id,
                payload: {}
            });
        });
        const evt = await OutboxEvent.findOne({ aggregateId: leadA._id });
        assert.ok(evt);
        assert.strictEqual(evt.provenance.source, 'MOBILE');
        assert.strictEqual(evt.provenance.actorType, 'HUMAN');
        assert.strictEqual(evt.provenance.actorId.toString(), userA._id.toString());
        assert.strictEqual(evt.provenance.correlationId, 'test-correlation-id');
    });

    console.log(`\nResults: ${passed}/${total} passed`);
    if (failed > 0) process.exit(1);
    
    await mongoose.disconnect();
    await mongoServer.stop();
}

runTests();
