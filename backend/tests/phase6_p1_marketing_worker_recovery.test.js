process.env.NODE_ENV = 'test';
process.env.ALLOW_TRANSACTION_TEST_FALLBACK = 'true';

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

import MarketingDispatchReceipt from '../models/MarketingDispatchReceipt.js';
import Activity from '../models/Activity.js';
import { processMarketingJob } from '../src/workers/marketingWorker.js';
import whatsAppService from '../services/WhatsAppService.js';

describe('Phase 6 — P1 Marketing Worker Resumable Recovery & State Machine Suite', () => {
    let replset;

    before(async () => {
        replset = await MongoMemoryReplSet.create({
            replSet: { count: 1, storageEngine: 'wiredTiger' }
        });
        await mongoose.connect(replset.getUri());
    });

    after(async () => {
        await mongoose.disconnect();
        if (replset) await replset.stop();
    });

    beforeEach(async () => {
        await MarketingDispatchReceipt.deleteMany({});
        await Activity.deleteMany({});
    });

    it('P1.1 100-recipient campaign: crash after recipient 20 -> BullMQ retry resumes 21-100 without resending 1-20', async () => {
        const campaignId = 'camp_resumable_100_recipients';
        const recipients = Array.from({ length: 100 }, (_, i) => ({
            id: `lead_${i + 1}`,
            mobile: `98765432${String(i).padStart(2, '0')}`,
            name: `Recipient ${i + 1}`
        }));

        let progressCount = 0;
        let crashAfter20 = true;

        const job = {
            id: `job_${campaignId}`,
            name: 'blast',
            data: {
                channel: 'whatsapp',
                campaignId,
                leads: recipients,
                message: 'Hello {{name}} from Bharat Properties'
            },
            log: async () => {},
            updateProgress: async (percent) => {
                progressCount++;
                if (crashAfter20 && progressCount === 20) {
                    // Simulate worker crash / sudden termination after completing recipient 20
                    throw new Error('SIMULATED_WORKER_CRASH_AT_RECIPIENT_20');
                }
            }
        };

        const dispatchedMobiles = [];

        const originalSendMessage = whatsAppService.sendMessage;
        try {
            whatsAppService.sendMessage = async (mobile, message, options) => {
                dispatchedMobiles.push(mobile);
                return { success: true, messageId: `msg_${mobile}_${Date.now()}` };
            };

            // Attempt 1: First worker starts processing
            await assert.rejects(
                processMarketingJob(job),
                /SIMULATED_WORKER_CRASH_AT_RECIPIENT_20/,
                'First attempt must crash at recipient 20'
            );

            assert.equal(dispatchedMobiles.length, 20, 'First attempt must have dispatched exactly 20 recipients before crash');

            // Verify first 20 receipts exist in MongoDB with status SENT
            const completedCount = await MarketingDispatchReceipt.countDocuments({
                campaignId,
                status: 'SENT'
            });
            assert.equal(completedCount, 20, 'First 20 receipts must be recorded as SENT in MongoDB');

            // Attempt 2: BullMQ Retry executes the same job (same job.id and payload)
            // It must resume at recipient 21 and process all remaining recipients up to 100
            crashAfter20 = false;
            const retryResult = await processMarketingJob(job);

            // Total dispatches across attempt 1 and retry must be exactly 100 (20 on attempt 1 + 80 on retry)
            assert.equal(dispatchedMobiles.length, 100, 'Total provider dispatches must be exactly 100 across both attempts');

            // Proof: Each mobile from recipient 1 to 100 was called exactly ONCE
            const mobileCounts = {};
            dispatchedMobiles.forEach(m => {
                mobileCounts[m] = (mobileCounts[m] || 0) + 1;
            });

            for (let i = 0; i < 100; i++) {
                const mob = recipients[i].mobile;
                assert.equal(mobileCounts[mob], 1, `Mobile ${mob} must have been dispatched exactly ONCE`);
            }

            // Verify all 100 recipient receipts in MongoDB are now SENT
            const totalSentReceipts = await MarketingDispatchReceipt.countDocuments({
                campaignId,
                status: 'SENT'
            });
            assert.equal(totalSentReceipts, 100, 'All 100 receipts must be durably recorded as SENT in MongoDB');

            // Verify the job-level receipt was finally marked COMPLETED on retry completion
            const jobReceipt = await MarketingDispatchReceipt.findOne({ dispatchKey: job.id });
            assert.ok(jobReceipt, 'Job-level receipt must exist');
            assert.equal(jobReceipt.status, 'COMPLETED', 'Job-level receipt must be COMPLETED after all 100 recipients accounted for');
            assert.equal(jobReceipt.result?.sent, 100, 'Campaign total sent count must reflect all 100 recipients accounted for');
        } finally {
            whatsAppService.sendMessage = originalSendMessage;
        }
    });

    it('P1.2 Two concurrent workers cannot send the same recipient twice', async () => {
        let providerCalls = 0;
        const originalSendMessage = whatsAppService.sendMessage;
        try {
            whatsAppService.sendMessage = async () => {
                providerCalls++;
                // Small latency to expose any concurrency race window
                await new Promise(r => setTimeout(r, 20));
                return { success: true, messageId: 'wa_msg_race_success' };
            };

            const recipientId = 'lead_race_001';
            const campaignId = 'camp_race_test';
            const rcptKey = `rcpt_${campaignId}_whatsapp_${recipientId}`;

            // Two workers race to claim the same recipient simultaneously
            const [claim1, claim2] = await Promise.all([
                MarketingDispatchReceipt.claimDispatch({
                    dispatchKey: rcptKey,
                    idempotencyKey: rcptKey,
                    jobName: 'blast',
                    channel: 'whatsapp',
                    campaignId,
                    recipientId
                }),
                MarketingDispatchReceipt.claimDispatch({
                    dispatchKey: rcptKey,
                    idempotencyKey: rcptKey,
                    jobName: 'blast',
                    channel: 'whatsapp',
                    campaignId,
                    recipientId
                })
            ]);

            // Exactly ONE worker must succeed
            const successCount = [claim1, claim2].filter(c => c.canDispatch).length;
            const skippedCount = [claim1, claim2].filter(c => !c.canDispatch && (c.status === 'SKIPPED_CONCURRENT' || c.status === 'SKIPPED_IN_FLIGHT')).length;

            assert.equal(successCount, 1, 'Exactly one worker must win the recipient claim');
            assert.equal(skippedCount, 1, 'Losing worker must be skipped safely');

            // Execute dispatch only from the winning worker
            if (claim1.canDispatch) {
                await whatsAppService.sendMessage();
                await MarketingDispatchReceipt.recordSuccess(rcptKey, { providerRef: 'msg_1', claimToken: claim1.claimToken });
            }
            if (claim2.canDispatch) {
                await whatsAppService.sendMessage();
                await MarketingDispatchReceipt.recordSuccess(rcptKey, { providerRef: 'msg_2', claimToken: claim2.claimToken });
            }

            assert.equal(providerCalls, 1, 'Provider must be called strictly once');
        } finally {
            whatsAppService.sendMessage = originalSendMessage;
        }
    });

    it('P1.3 Active claim prevents competing dispatch (status SKIPPED_IN_FLIGHT)', async () => {
        const rcptKey = 'rcpt_active_lease_claim_001';

        // Worker A claims with a 5-minute lease
        const claimA = await MarketingDispatchReceipt.claimDispatch({
            dispatchKey: rcptKey,
            jobName: 'blast',
            channel: 'whatsapp',
            leaseMs: 300000
        });
        assert.equal(claimA.canDispatch, true);
        assert.equal(claimA.status, 'DISPATCHING');

        // Worker B tries to claim while lease is active
        const claimB = await MarketingDispatchReceipt.claimDispatch({
            dispatchKey: rcptKey,
            jobName: 'blast',
            channel: 'whatsapp',
            leaseMs: 300000
        });
        assert.equal(claimB.canDispatch, false, 'Active in-flight claim must prevent competing worker');
        assert.equal(claimB.status, 'SKIPPED_IN_FLIGHT');
        assert.equal(claimB.reason, 'CONCURRENT_CLAIM_ACTIVE');
    });

    it('P1.4 Expired claim is handled safely: marked AMBIGUOUS and never automatically resent', async () => {
        const rcptKey = 'rcpt_expired_claim_safety_001';

        // Worker claims with a 10ms lease
        const claim1 = await MarketingDispatchReceipt.claimDispatch({
            dispatchKey: rcptKey,
            jobName: 'blast',
            channel: 'whatsapp',
            leaseMs: 10
        });
        assert.equal(claim1.canDispatch, true);

        // Wait 30ms for lease to expire
        await new Promise(r => setTimeout(r, 30));

        // Competing or retrying worker comes in after lease expiration
        const claim2 = await MarketingDispatchReceipt.claimDispatch({
            dispatchKey: rcptKey,
            jobName: 'blast',
            channel: 'whatsapp',
            leaseMs: 10
        });

        // Safe failure: expired in-flight claim transitions to AMBIGUOUS rather than blind resend
        assert.equal(claim2.canDispatch, false, 'Expired claim must not be blindly resent');
        assert.equal(claim2.status, 'AMBIGUOUS');
        assert.equal(claim2.reason, 'LEASE_EXPIRED_MARKED_AMBIGUOUS');

        // Verify receipt in DB is now AMBIGUOUS
        const receiptInDb = await MarketingDispatchReceipt.findOne({ dispatchKey: rcptKey });
        assert.equal(receiptInDb.status, 'AMBIGUOUS');

        // Subsequent retry must continue to be blocked
        const claim3 = await MarketingDispatchReceipt.claimDispatch({
            dispatchKey: rcptKey,
            jobName: 'blast',
            channel: 'whatsapp'
        });
        assert.equal(claim3.canDispatch, false);
        assert.equal(claim3.status, 'AMBIGUOUS');
    });

    it('P1.5 Receipt database outage before provider call causes ZERO provider calls', async () => {
        let providerCalled = 0;
        const originalSendMessage = whatsAppService.sendMessage;
        whatsAppService.sendMessage = async () => {
            providerCalled++;
            return { success: true };
        };

        const originalClaimDispatch = MarketingDispatchReceipt.claimDispatch;
        MarketingDispatchReceipt.claimDispatch = async () => {
            const dbErr = new Error('RECEIPT_DB_UNAVAILABLE: Connection refused');
            dbErr.code = 'RECEIPT_DB_UNAVAILABLE';
            throw dbErr;
        };

        const job = {
            id: 'job_db_outage_before_send',
            name: 'blast',
            data: {
                channel: 'whatsapp',
                leads: [{ mobile: '9876500099', name: 'DB Drop Test' }],
                message: 'Hello'
            },
            log: async () => {}
        };

        try {
            await assert.rejects(
                processMarketingJob(job),
                /RECEIPT_DB_UNAVAILABLE/
            );
            assert.equal(providerCalled, 0, 'Provider call count must remain strictly zero when receipt DB is unreachable');
        } finally {
            whatsAppService.sendMessage = originalSendMessage;
            MarketingDispatchReceipt.claimDispatch = originalClaimDispatch;
        }
    });

    it('P1.6 Receipt completion database failure throws RECEIPT_COMPLETION_FAILED and allows operator reconciliation', async () => {
        const key = 'rcpt_completion_fail_reconcile_001';
        let providerCalled = false;

        const originalSendMessage = whatsAppService.sendMessage;
        whatsAppService.sendMessage = async () => {
            providerCalled = true;
            return { success: true, messageId: 'wa_accepted_123' };
        };

        const originalRecordSuccess = MarketingDispatchReceipt.recordSuccess;
        MarketingDispatchReceipt.recordSuccess = async () => {
            const compErr = new Error('RECEIPT_COMPLETION_FAILED: Cluster write timed out after provider accept');
            compErr.code = 'RECEIPT_COMPLETION_FAILED';
            throw compErr;
        };

        const job = {
            id: 'job_comp_fail_test',
            name: 'blast',
            data: {
                channel: 'whatsapp',
                campaignId: 'camp_comp_fail',
                leads: [{ id: 'lead_cf_1', mobile: '9876500088', name: 'Completion Failure Lead' }],
                message: 'Hello'
            },
            log: async () => {}
        };

        try {
            // Must throw RECEIPT_COMPLETION_FAILED rather than reporting clean success
            await assert.rejects(
                processMarketingJob(job),
                /RECEIPT_COMPLETION_FAILED/
            );

            assert.equal(providerCalled, true);

            // Restore recordSuccess and manually mark ambiguous as the worker does in recovery
            MarketingDispatchReceipt.recordSuccess = originalRecordSuccess;
            await MarketingDispatchReceipt.recordFailure(
                'rcpt_camp_comp_fail_whatsapp_lead_cf_1',
                { error: 'RECEIPT_COMPLETION_FAILED', isAmbiguous: true, reconciliationNotes: 'Provider accepted dispatch but receipt completion persistence failed.' }
            );

            const ambiguousReceipt = await MarketingDispatchReceipt.findOne({ dispatchKey: 'rcpt_camp_comp_fail_whatsapp_lead_cf_1' });
            assert.equal(ambiguousReceipt.status, 'AMBIGUOUS');

            // Operator reconciles ambiguous receipt using reconcileAmbiguous
            const reconciled = await MarketingDispatchReceipt.reconcileAmbiguous(
                'rcpt_camp_comp_fail_whatsapp_lead_cf_1',
                { resolution: 'CONFIRM_DELIVERED', operatorNotes: 'Verified delivered via provider webhook' }
            );

            assert.equal(reconciled.status, 'COMPLETED');
            assert.equal(reconciled.reconciliationStatus, 'CONFIRMED_DELIVERED');
            assert.match(reconciled.reconciliationNotes, /CONFIRM_DELIVERED/);
        } finally {
            whatsAppService.sendMessage = originalSendMessage;
            MarketingDispatchReceipt.recordSuccess = originalRecordSuccess;
        }
    });

    it('P1.7 Stale worker cannot overwrite a newer claim or operator reconciliation (claim token fencing)', async () => {
        const rcptKey = 'rcpt_stale_fencing_test_001';

        // Worker 1 claims with claimToken 1
        const claim1 = await MarketingDispatchReceipt.claimDispatch({
            dispatchKey: rcptKey,
            jobName: 'blast',
            channel: 'whatsapp'
        });
        assert.ok(claim1.claimToken);

        // Simulate operator manual reconciliation before Worker 1 finishes
        await MarketingDispatchReceipt.reconcileAmbiguous(rcptKey, {
            resolution: 'CONFIRM_FAILED',
            operatorNotes: 'Customer unsubscribed; manually marked failed'
        });

        // Worker 1 wakes up and attempts to record success with stale claimToken
        await assert.rejects(
            MarketingDispatchReceipt.recordSuccess(rcptKey, {
                providerRef: 'stale_ref',
                result: { success: true },
                claimToken: claim1.claimToken
            }),
            /STALE_CLAIM_REJECTED/,
            'Stale worker must be rejected from overwriting operator reconciliation'
        );

        // Verify receipt state was NOT overwritten by stale worker
        const finalReceipt = await MarketingDispatchReceipt.findOne({ dispatchKey: rcptKey });
        assert.equal(finalReceipt.status, 'FAILED');
        assert.equal(finalReceipt.reconciliationStatus, 'CONFIRMED_FAILED');
    });

    it('P1.8 recordFailure does not silently swallow database errors (fails closed)', async () => {
        try {
            // Temporarily simulate disconnected state
            Object.defineProperty(mongoose.connection, 'readyState', { value: 0, configurable: true, writable: true });

            await assert.rejects(
                MarketingDispatchReceipt.recordFailure('any_key', { error: 'some error' }),
                /RECEIPT_DB_UNAVAILABLE/,
                'recordFailure must throw RECEIPT_DB_UNAVAILABLE when database is disconnected'
            );
        } finally {
            Object.defineProperty(mongoose.connection, 'readyState', { value: 1, configurable: true, writable: true });
        }
    });
});
