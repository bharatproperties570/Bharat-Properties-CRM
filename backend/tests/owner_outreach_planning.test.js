import test from 'node:test';
import assert from 'node:assert/strict';
import OwnerOutreachCampaign from '../models/OwnerOutreachCampaign.js';
import OwnerOutreachBatch from '../models/OwnerOutreachBatch.js';
import OwnerOutreachRecipient from '../models/OwnerOutreachRecipient.js';
import OwnerOutreachPlanningService from '../services/OwnerOutreachPlanningService.js';
import mongoose from 'mongoose';

function chain(value) {
    return { select: () => ({ lean: async () => value }), lean: async () => value };
}

test('planner marks a valid consented ledger batch PLANNED without dispatch', async () => {
    const originals = {
        campaignFindOne: OwnerOutreachCampaign.findOne,
        campaignExists: OwnerOutreachCampaign.exists,
        campaignUpdateOne: OwnerOutreachCampaign.updateOne,
        startSession: mongoose.startSession,
        recipientFind: OwnerOutreachRecipient.find,
        batchFindOneAndUpdate: OwnerOutreachBatch.findOneAndUpdate
    };
    const released = [];
    const batch = { _id: 'batch-1', campaignId: 'campaign-1', recipientIds: ['r1', 'r2'] };
    const fakeSession = { withTransaction: async (callback) => callback(), endSession: async () => {} };
    mongoose.startSession = async () => fakeSession;
    OwnerOutreachCampaign.findOne = () => ({ select: () => ({
        lean: async () => ({ _id: 'campaign-1', status: 'APPROVED' }),
        session: () => ({ lean: async () => ({ _id: 'campaign-1', status: 'APPROVED' }) })
    }) });
    OwnerOutreachCampaign.updateOne = async (filter, update, options) => {
        assert.equal(filter._id, 'campaign-1');
        assert.deepEqual(filter.status, { $in: ['APPROVED', 'ACTIVE'] });
        assert.equal(update.$inc.__v, 1);
        assert.equal(options.session, fakeSession);
        return { modifiedCount: 1 };
    };
    OwnerOutreachCampaign.exists = async () => true;
    OwnerOutreachRecipient.find = () => ({
        select: () => ({ lean: async () => [
            { _id: 'r1', eligibility: 'ELIGIBLE', consentState: 'CONSENTED', dispatchState: 'PENDING' },
            { _id: 'r2', eligibility: 'ELIGIBLE', consentState: 'CONSENTED', dispatchState: 'PENDING' }
        ] })
    });
    OwnerOutreachBatch.findOneAndUpdate = (filter, update, options) => ({ select: () => ({ lean: async () => {
        assert.equal(filter.status, 'CLAIMED');
        assert.equal(filter['claim.token'], 'fenced-token');
        assert.equal(update.$set.status, 'PLANNED');
        assert.equal(update.$set.counts.selected, 2);
        assert.equal(options.session, fakeSession);
        return { _id: 'batch-1', status: 'PLANNED', counts: { selected: 2 } };
    } }) });
    const scheduler = {
        claimNextDueBatch: async () => ({ batch, claimToken: 'fenced-token' }),
        releaseClaim: async (args) => released.push(args)
    };
    try {
        const result = await new OwnerOutreachPlanningService({ scheduler }).processOne({ workerId: 'test-worker', now: new Date() });
        assert.equal(result.code, 'BATCH_PLANNED');
        assert.equal(result.plannedRecipients, 2);
        assert.equal(result.dispatchEnabled, false);
        assert.equal(released.length, 0);
    } finally {
        OwnerOutreachCampaign.findOne = originals.campaignFindOne;
        OwnerOutreachCampaign.exists = originals.campaignExists;
        OwnerOutreachCampaign.updateOne = originals.campaignUpdateOne;
        mongoose.startSession = originals.startSession;
        OwnerOutreachRecipient.find = originals.recipientFind;
        OwnerOutreachBatch.findOneAndUpdate = originals.batchFindOneAndUpdate;
    }
});

test('planner releases batch when recipient consent or eligibility is no longer valid', async () => {
    const originals = {
        campaignFindOne: OwnerOutreachCampaign.findOne,
        recipientFind: OwnerOutreachRecipient.find
    };
    const released = [];
    const batch = { _id: 'batch-2', campaignId: 'campaign-2', recipientIds: ['r1'] };
    OwnerOutreachCampaign.findOne = () => ({ select: () => ({ lean: async () => ({ _id: 'campaign-2', status: 'APPROVED' }) }) });
    OwnerOutreachRecipient.find = () => ({
        select: () => ({ lean: async () => [
            { _id: 'r1', eligibility: 'ELIGIBLE', consentState: 'OPTED_OUT', dispatchState: 'PENDING' }
        ] })
    });
    const scheduler = {
        claimNextDueBatch: async () => ({ batch, claimToken: 'fenced-token' }),
        releaseClaim: async (args) => released.push(args)
    };
    try {
        const result = await new OwnerOutreachPlanningService({ scheduler }).processOne({ workerId: 'test-worker' });
        assert.equal(result.code, 'RECIPIENT_LEDGER_REVALIDATION_FAILED');
        assert.equal(released.length, 1);
        assert.equal(released[0].reasonCode, 'RECIPIENT_LEDGER_REVALIDATION_FAILED');
    } finally {
        OwnerOutreachCampaign.findOne = originals.campaignFindOne;
        OwnerOutreachRecipient.find = originals.recipientFind;
    }
});
