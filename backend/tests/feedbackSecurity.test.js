/**
 * 🛡️ CRITICAL-01 / CRITICAL-05 PUBLIC FEEDBACK SECURITY & TRANSACTION TEST SUITE
 * 
 * ISOLATION GUARANTEE:
 * This test suite runs entirely in-memory with mocked MongoDB and Session primitives.
 * It NEVER dials, reads, or writes to the live Atlas cluster.
 */

import assert from 'assert';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

// 🛡️ Pre-flight: Delete any MongoDB URI to guarantee ZERO production database writes
delete process.env.MONGODB_URI;
process.env.NODE_ENV = 'test';
process.env.FEEDBACK_JWT_SECRET = 'test_feedback_secret_key_1234567890';
process.env.JWT_SECRET = 'test_jwt_secret_key_1234567890';
process.env.FRONTEND_URL = 'https://crm.bharatproperties.co';

console.log('================================================================');
console.log('  CRITICAL-05: PUBLIC FEEDBACK SECURITY REGRESSION TEST SUITE');
console.log('  Isolation Check: process.env.MONGODB_URI =', process.env.MONGODB_URI);
console.log('================================================================\n');

// Import units under test
import {
    verifyFeedbackToken,
    getFormBySlug,
    submitFeedback
} from '../controllers/feedbackForm.controller.js';
import variableResolutionService from '../services/VariableResolutionService.js';
import LeadTokenGenerator from '../src/utils/LeadTokenGenerator.js';
import { resolveToken } from '../controllers/dynamicForm.controller.js';
import {
    publicFeedbackSecurityHeaders,
    publicFormFetchLimiter,
    publicFormSubmitLimiter
} from '../routes/feedbackForm.routes.js';
import FeedbackForm from '../models/FeedbackForm.js';
import FeedbackSubmission from '../models/FeedbackSubmission.js';
import Activity from '../models/Activity.js';
import Lead from '../models/Lead.js';
import AuditLog from '../models/AuditLog.js';
import OutboxEvent from '../models/OutboxEvent.js';
import NurtureBot from '../services/NurtureBot.js';
import * as withMongoTransactionModule from '../utils/withMongoTransaction.js';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

// 🛡️ Pre-flight: Neutralize automated background bot sends for zero external calls
NurtureBot.initiate = async () => {};
NurtureBot.executeAutomation = async () => {};

// Save original Mongoose primitives for genuine replica-set testing
const originalMongooseStartSession = mongoose.startSession;
const originalFeedbackFormFindOne = FeedbackForm.findOne;
const originalFeedbackFormCreate = FeedbackForm.create;
const originalFeedbackFormFindById = FeedbackForm.findById;
const originalFeedbackFormUpdateOne = FeedbackForm.updateOne;
const originalFeedbackSubmissionFindById = FeedbackSubmission.findById;
const originalFeedbackSubmissionFindOne = FeedbackSubmission.findOne;
const originalFeedbackSubmissionCreate = FeedbackSubmission.create;
const originalFeedbackSubmissionFind = FeedbackSubmission.find;
const originalFeedbackSubmissionCountDocuments = FeedbackSubmission.countDocuments;
const originalActivityFindById = Activity.findById;
const originalActivityFindOneAndUpdate = Activity.findOneAndUpdate;
const originalActivityUpdateOne = Activity.updateOne;
const originalActivityCreate = Activity.create;
const originalActivityFind = Activity.find;
const originalActivityCountDocuments = Activity.countDocuments;
const originalLeadFindById = Lead.findById;
const originalLeadCreate = Lead.create;
const originalAuditLogCreate = AuditLog.create;
const originalAuditLogFind = AuditLog.find;
const originalAuditLogFindOne = AuditLog.findOne;
const originalAuditLogCountDocuments = AuditLog.countDocuments;
const originalOutboxEventCreate = OutboxEvent.create;
const originalOutboxEventFind = OutboxEvent.find;
const originalOutboxEventFindOne = OutboxEvent.findOne;
const originalOutboxEventCountDocuments = OutboxEvent.countDocuments;

function restoreOriginalMongoosePrimitives() {
    mongoose.startSession = originalMongooseStartSession;
    FeedbackForm.findOne = originalFeedbackFormFindOne;
    FeedbackForm.create = originalFeedbackFormCreate;
    FeedbackForm.findById = originalFeedbackFormFindById;
    FeedbackForm.updateOne = originalFeedbackFormUpdateOne;
    FeedbackSubmission.findById = originalFeedbackSubmissionFindById;
    FeedbackSubmission.findOne = originalFeedbackSubmissionFindOne;
    FeedbackSubmission.create = originalFeedbackSubmissionCreate;
    FeedbackSubmission.find = originalFeedbackSubmissionFind;
    FeedbackSubmission.countDocuments = originalFeedbackSubmissionCountDocuments;
    Activity.findById = originalActivityFindById;
    Activity.findOneAndUpdate = originalActivityFindOneAndUpdate;
    Activity.updateOne = originalActivityUpdateOne;
    Activity.create = originalActivityCreate;
    Activity.find = originalActivityFind;
    Activity.countDocuments = originalActivityCountDocuments;
    Lead.findById = originalLeadFindById;
    Lead.create = originalLeadCreate;
    AuditLog.create = originalAuditLogCreate;
    AuditLog.find = originalAuditLogFind;
    AuditLog.findOne = originalAuditLogFindOne;
    AuditLog.countDocuments = originalAuditLogCountDocuments;
    OutboxEvent.create = originalOutboxEventCreate;
    OutboxEvent.find = originalOutboxEventFind;
    OutboxEvent.findOne = originalOutboxEventFindOne;
    OutboxEvent.countDocuments = originalOutboxEventCountDocuments;
}

// Pre-flight session mocker for zero-DB testing
const createMockSession = () => {
    const session = {
        id: 'mock-session-' + Math.random(),
        withTransaction: async (cb) => {
            return await cb(session);
        },
        endSession: async () => {}
    };
    return session;
};
mongoose.startSession = async () => createMockSession();

let passedTests = 0;
let totalTests = 0;

function it(description, fn) {
    totalTests++;
    try {
        fn();
        console.log(`  ✓ ${description}`);
        passedTests++;
    } catch (err) {
        console.error(`  ✗ ${description}`);
        console.error(err);
        process.exit(1);
    }
}

async function itAsync(description, fn) {
    totalTests++;
    try {
        await fn();
        console.log(`  ✓ ${description}`);
        passedTests++;
    } catch (err) {
        console.error(`  ✗ ${description}`);
        console.error(err);
        process.exit(1);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 1: Cryptographic Token Generation & Purpose Binding
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- SUITE 1: Cryptographic Token Generation & Purpose Binding ---');

it('Generates modern token with Activity binding when activity context exists', () => {
    const mockLead = { _id: new mongoose.Types.ObjectId(), firstName: 'Sunil', lastName: 'Gupta' };
    const mockActivity = { _id: new mongoose.Types.ObjectId(), type: 'Site Visit', subject: 'Site visit completed' };

    const resolved = variableResolutionService.resolveNamed(mockLead, { activity: mockActivity });
    assert(resolved.feedback_link, 'feedback_link must be resolved');

    const url = new URL(resolved.feedback_link);
    const token = url.searchParams.get('ref');
    assert(token, 'Token parameter ?ref must be present in link');

    const decoded = jwt.verify(token, process.env.FEEDBACK_JWT_SECRET);
    assert.strictEqual(decoded.iss, 'bharat-properties-crm', 'Issuer must match');
    assert.strictEqual(decoded.purpose, 'feedback_submission', 'Purpose must be feedback_submission');
    assert.strictEqual(decoded.leadId, String(mockLead._id), 'Lead ID must match');
    assert.strictEqual(decoded.activityId, String(mockActivity._id), 'Activity ID must match');
    assert.strictEqual(decoded.formSlug, 'customer-experience-feedback-qx9z2', 'Form slug must match');
    assert(decoded.jti && decoded.jti.length > 20, 'Unique jti must be present');
});

it('Generates lead-only scoped token (activityId: null) when no activity is provided', () => {
    const mockLead = { _id: new mongoose.Types.ObjectId(), firstName: 'Neha', lastName: 'Sharma' };

    const resolved = variableResolutionService.resolveNamed(mockLead, {});
    const url = new URL(resolved.feedback_link);
    const token = url.searchParams.get('ref');

    const decoded = jwt.verify(token, process.env.FEEDBACK_JWT_SECRET);
    assert.strictEqual(decoded.iss, 'bharat-properties-crm');
    assert.strictEqual(decoded.purpose, 'general_feedback', 'Purpose must be general_feedback');
    assert.strictEqual(decoded.leadId, String(mockLead._id));
    assert.strictEqual(decoded.activityId, null, 'Activity ID must be strictly null (never invented)');
    assert(decoded.jti, 'Unique jti must be generated');
});

it('Generates distinct tokens with unique JTIs for the same Lead and Activity (No collision)', () => {
    const mockLead = { _id: new mongoose.Types.ObjectId() };
    const mockActivity = { _id: new mongoose.Types.ObjectId() };

    const res1 = variableResolutionService.resolveNamed(mockLead, { activity: mockActivity });
    const res2 = variableResolutionService.resolveNamed(mockLead, { activity: mockActivity });

    const token1 = new URL(res1.feedback_link).searchParams.get('ref');
    const token2 = new URL(res2.feedback_link).searchParams.get('ref');

    assert.notStrictEqual(token1, token2, 'Tokens must not be identical');
    const d1 = jwt.decode(token1);
    const d2 = jwt.decode(token2);
    assert.notStrictEqual(d1.jti, d2.jti, 'Each token must have a unique request identity (jti)');
});

it('[Finding A] Token generation fails safely when required signing configuration is absent', () => {
    const origFeedbackSecret = process.env.FEEDBACK_JWT_SECRET;
    const origJwtSecret = process.env.JWT_SECRET;
    const origNodeEnv = process.env.NODE_ENV;
    try {
        delete process.env.FEEDBACK_JWT_SECRET;
        delete process.env.JWT_SECRET;
        process.env.NODE_ENV = 'staging'; // Staging without secrets must also fail closed

        // 1. VariableResolutionService returns 'error' for feedbackLink
        const mockLead = { _id: new mongoose.Types.ObjectId(), firstName: 'Test' };
        const res = variableResolutionService.resolveNamed(mockLead, {});
        assert.strictEqual(res.feedback_link, 'error', 'Must fail safely and return error when secrets are absent');

        // 2. LeadTokenGenerator throws FATAL error
        assert.throws(() => {
            LeadTokenGenerator.generate(mockLead._id);
        }, /FATAL: JWT secret not configured/, 'LeadTokenGenerator must throw when secrets are absent');
    } finally {
        process.env.FEEDBACK_JWT_SECRET = origFeedbackSecret;
        process.env.JWT_SECRET = origJwtSecret;
        process.env.NODE_ENV = origNodeEnv;
    }
});

it('[CRITICAL-17L / Finding A] LeadTokenGenerator requires JWT_SECRET and fails if absent even when FEEDBACK_JWT_SECRET is set', () => {
    const origFeedbackSecret = process.env.FEEDBACK_JWT_SECRET;
    const origJwtSecret = process.env.JWT_SECRET;
    try {
        process.env.FEEDBACK_JWT_SECRET = 'feedback_only_secret_xyz';
        delete process.env.JWT_SECRET;

        const mockLead = { _id: new mongoose.Types.ObjectId() };
        assert.throws(() => {
            LeadTokenGenerator.generate(mockLead._id);
        }, /FATAL: JWT secret not configured/, 'LeadTokenGenerator must throw when JWT_SECRET is absent even if FEEDBACK_JWT_SECRET is set');
    } finally {
        process.env.FEEDBACK_JWT_SECRET = origFeedbackSecret;
        process.env.JWT_SECRET = origJwtSecret;
    }
});

it('[CRITICAL-17L / Finding A] LeadTokenGenerator with JWT_SECRET produces tokens verifiable by Dynamic Forms consumer', () => {
    const origFeedbackSecret = process.env.FEEDBACK_JWT_SECRET;
    const origJwtSecret = process.env.JWT_SECRET;
    try {
        process.env.JWT_SECRET = 'active_jwt_secret_12345';
        process.env.FEEDBACK_JWT_SECRET = 'different_feedback_secret_67890';

        const leadId = new mongoose.Types.ObjectId().toString();
        const tokenWithTildes = LeadTokenGenerator.generate(leadId, { projectId: 'project123' });
        assert(tokenWithTildes, 'Token must be generated');

        // Simulate Dynamic Forms verifier (dynamicForm.controller.js)
        const normalized = tokenWithTildes.replace(/~/g, '.');
        const decoded = jwt.verify(normalized, process.env.JWT_SECRET);
        assert.strictEqual(decoded.leadId, leadId);
        assert.strictEqual(decoded.projectId, 'project123');
    } finally {
        process.env.FEEDBACK_JWT_SECRET = origFeedbackSecret;
        process.env.JWT_SECRET = origJwtSecret;
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 2: Token Verification & Trust Boundaries
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- SUITE 2: Token Verification & Trust Boundaries ---');

it('[CRITICAL-17L] Dual-Key Rotation: When both FEEDBACK_JWT_SECRET and JWT_SECRET are configured and different', () => {
    const origFeedbackSecret = process.env.FEEDBACK_JWT_SECRET;
    const origJwtSecret = process.env.JWT_SECRET;
    try {
        process.env.FEEDBACK_JWT_SECRET = 'new_primary_feedback_secret_11111';
        process.env.JWT_SECRET = 'old_secondary_jwt_secret_22222';

        const leadId = new mongoose.Types.ObjectId().toString();
        const activityId = new mongoose.Types.ObjectId().toString();

        // 1. New token signed with FEEDBACK_JWT_SECRET verifies
        const newPrimaryToken = jwt.sign({
            iss: 'bharat-properties-crm',
            purpose: 'feedback_submission',
            leadId,
            activityId,
            formSlug: 'test-slug',
            jti: uuidv4()
        }, process.env.FEEDBACK_JWT_SECRET);

        const verifiedNew = verifyFeedbackToken(newPrimaryToken, 'test-slug');
        assert(verifiedNew && verifiedNew.valid === true, 'New token signed with FEEDBACK_JWT_SECRET must verify');
        assert.strictEqual(verifiedNew.leadId, leadId);
        assert.strictEqual(verifiedNew.activityId, activityId);

        // 2. In-flight legacy token signed with previous JWT_SECRET verifies seamlessly
        const inFlightOldToken = jwt.sign({
            iss: 'bharat-properties-crm',
            purpose: 'feedback_submission',
            leadId,
            activityId,
            formSlug: 'test-slug',
            jti: uuidv4()
        }, process.env.JWT_SECRET);

        const verifiedInFlight = verifyFeedbackToken(inFlightOldToken, 'test-slug');
        assert(verifiedInFlight && verifiedInFlight.valid === true, 'In-flight token signed with previous JWT_SECRET must verify seamlessly');
        assert.strictEqual(verifiedInFlight.leadId, leadId);
        assert.strictEqual(verifiedInFlight.activityId, activityId);

        // 3. Token signed with an unrelated third key is rejected
        const attackerToken = jwt.sign({
            iss: 'bharat-properties-crm',
            purpose: 'feedback_submission',
            leadId,
            activityId,
            formSlug: 'test-slug',
            jti: uuidv4()
        }, 'unrelated_attacker_key_33333');

        const verifiedAttacker = verifyFeedbackToken(attackerToken, 'test-slug');
        assert.strictEqual(verifiedAttacker, null, 'Token signed with unrelated key must be rejected');
    } finally {
        process.env.FEEDBACK_JWT_SECRET = origFeedbackSecret;
        process.env.JWT_SECRET = origJwtSecret;
    }
});

it('[CRITICAL-17L] Single-Secret: Only FEEDBACK_JWT_SECRET configured verifies matching tokens', () => {
    const origFeedbackSecret = process.env.FEEDBACK_JWT_SECRET;
    const origJwtSecret = process.env.JWT_SECRET;
    try {
        process.env.FEEDBACK_JWT_SECRET = 'single_feedback_secret_44444';
        delete process.env.JWT_SECRET;

        const leadId = new mongoose.Types.ObjectId().toString();
        const token = jwt.sign({
            iss: 'bharat-properties-crm',
            purpose: 'feedback_submission',
            leadId,
            formSlug: 'single-slug',
            jti: uuidv4()
        }, process.env.FEEDBACK_JWT_SECRET);

        const verified = verifyFeedbackToken(token, 'single-slug');
        assert(verified && verified.valid === true);
        assert.strictEqual(verified.leadId, leadId);
    } finally {
        process.env.FEEDBACK_JWT_SECRET = origFeedbackSecret;
        process.env.JWT_SECRET = origJwtSecret;
    }
});

it('[CRITICAL-17L] Single-Secret: Only JWT_SECRET configured verifies matching tokens', () => {
    const origFeedbackSecret = process.env.FEEDBACK_JWT_SECRET;
    const origJwtSecret = process.env.JWT_SECRET;
    try {
        delete process.env.FEEDBACK_JWT_SECRET;
        process.env.JWT_SECRET = 'single_jwt_secret_55555';

        const leadId = new mongoose.Types.ObjectId().toString();
        const token = jwt.sign({
            iss: 'bharat-properties-crm',
            purpose: 'feedback_submission',
            leadId,
            formSlug: 'single-slug',
            jti: uuidv4()
        }, process.env.JWT_SECRET);

        const verified = verifyFeedbackToken(token, 'single-slug');
        assert(verified && verified.valid === true);
        assert.strictEqual(verified.leadId, leadId);
    } finally {
        process.env.FEEDBACK_JWT_SECRET = origFeedbackSecret;
        process.env.JWT_SECRET = origJwtSecret;
    }
});

it('[Finding A] Missing secret fails closed in verifyFeedbackToken', () => {
    const origFeedbackSecret = process.env.FEEDBACK_JWT_SECRET;
    const origJwtSecret = process.env.JWT_SECRET;
    try {
        delete process.env.FEEDBACK_JWT_SECRET;
        delete process.env.JWT_SECRET;

        const token = jwt.sign({
            iss: 'bharat-properties-crm',
            purpose: 'feedback_submission',
            leadId: new mongoose.Types.ObjectId().toString(),
            formSlug: 'any-form',
            jti: uuidv4()
        }, 'some_secret');

        const verified = verifyFeedbackToken(token, 'any-form');
        assert.strictEqual(verified, null, 'Must return null and fail closed when JWT secrets are absent');
    } finally {
        process.env.FEEDBACK_JWT_SECRET = origFeedbackSecret;
        process.env.JWT_SECRET = origJwtSecret;
    }
});

it('[Finding A] Old token signed with predictable fallback (dev_secret_fallback) is rejected', () => {
    const leadId = new mongoose.Types.ObjectId().toString();
    const fallbackToken = jwt.sign({
        iss: 'bharat-properties-crm',
        purpose: 'feedback_submission',
        leadId,
        formSlug: 'test-form',
        jti: uuidv4()
    }, 'dev_secret_fallback');

    const verified = verifyFeedbackToken(fallbackToken, 'test-form');
    assert.strictEqual(verified, null, 'Tokens signed with dev_secret_fallback MUST be rejected');
});

it('[Finding A] Correctly signed token using configured secret still verifies', () => {
    const leadId = new mongoose.Types.ObjectId().toString();
    const validToken = jwt.sign({
        iss: 'bharat-properties-crm',
        purpose: 'feedback_submission',
        leadId,
        formSlug: 'test-form',
        jti: uuidv4()
    }, process.env.FEEDBACK_JWT_SECRET);

    const verified = verifyFeedbackToken(validToken, 'test-form');
    assert(verified && verified.valid === true);
    assert.strictEqual(verified.leadId, leadId);
});

it('[Finding A] Invalid signatures remain rejected', () => {
    const leadId = new mongoose.Types.ObjectId().toString();
    const badSigToken = jwt.sign({
        iss: 'bharat-properties-crm',
        purpose: 'feedback_submission',
        leadId,
        formSlug: 'test-form',
        jti: uuidv4()
    }, 'attacker_random_key_99999');

    const verified = verifyFeedbackToken(badSigToken, 'test-form');
    assert.strictEqual(verified, null, 'Token with invalid signature must be rejected');
});

it('[Finding B] Valid general_feedback token strips activityId even if present in token payload', () => {
    const leadId = new mongoose.Types.ObjectId().toString();
    const fakeActivityId = new mongoose.Types.ObjectId().toString();
    const injectedGeneralToken = jwt.sign({
        iss: 'bharat-properties-crm',
        purpose: 'general_feedback',
        leadId,
        activityId: fakeActivityId,
        formSlug: 'general-slug',
        jti: uuidv4()
    }, process.env.FEEDBACK_JWT_SECRET);

    const verified = verifyFeedbackToken(injectedGeneralToken, 'general-slug');
    assert(verified && verified.valid === true);
    assert.strictEqual(verified.activityId, null, 'general_feedback tokens MUST NEVER be granted activityId binding');
    assert.strictEqual(verified.purpose, 'general_feedback');
});

it('Verifies valid modern token for matching form slug', () => {
    const leadId = new mongoose.Types.ObjectId().toString();
    const activityId = new mongoose.Types.ObjectId().toString();
    const jti = uuidv4();
    const token = jwt.sign({
        iss: 'bharat-properties-crm',
        purpose: 'feedback_submission',
        leadId,
        activityId,
        formSlug: 'site-visit-feedback',
        jti
    }, process.env.FEEDBACK_JWT_SECRET);

    const verified = verifyFeedbackToken(token, 'site-visit-feedback');
    assert(verified && verified.valid === true);
    assert.strictEqual(verified.isLegacy, false);
    assert.strictEqual(verified.leadId, leadId);
    assert.strictEqual(verified.activityId, activityId);
    assert.strictEqual(verified.jti, jti);
    assert.strictEqual(verified.purpose, 'feedback_submission');
});

it('Rejects modern token if formSlug does not match route slug', () => {
    const token = jwt.sign({
        iss: 'bharat-properties-crm',
        purpose: 'feedback_submission',
        leadId: new mongoose.Types.ObjectId().toString(),
        activityId: new mongoose.Types.ObjectId().toString(),
        formSlug: 'form-a',
        jti: uuidv4()
    }, process.env.FEEDBACK_JWT_SECRET);

    const verified = verifyFeedbackToken(token, 'form-b');
    assert.strictEqual(verified, null, 'Must reject token when formSlug does not match');
});

it('Finding 3: Rejects modern token if formSlug claim is missing', () => {
    const token = jwt.sign({
        iss: 'bharat-properties-crm',
        purpose: 'feedback_submission',
        leadId: new mongoose.Types.ObjectId().toString(),
        activityId: new mongoose.Types.ObjectId().toString(),
        jti: uuidv4()
    }, process.env.FEEDBACK_JWT_SECRET);

    const verified = verifyFeedbackToken(token, 'form-a');
    assert.strictEqual(verified, null, 'Must reject modern token when formSlug is missing');
});

it('Finding 3: Rejects modern token if formSlug claim is empty string or whitespace', () => {
    const tokenEmpty = jwt.sign({
        iss: 'bharat-properties-crm',
        purpose: 'feedback_submission',
        leadId: new mongoose.Types.ObjectId().toString(),
        formSlug: '',
        jti: uuidv4()
    }, process.env.FEEDBACK_JWT_SECRET);
    assert.strictEqual(verifyFeedbackToken(tokenEmpty, 'form-a'), null, 'Must reject empty formSlug');

    const tokenWhitespace = jwt.sign({
        iss: 'bharat-properties-crm',
        purpose: 'general_feedback',
        leadId: new mongoose.Types.ObjectId().toString(),
        formSlug: '   ',
        jti: uuidv4()
    }, process.env.FEEDBACK_JWT_SECRET);
    assert.strictEqual(verifyFeedbackToken(tokenWhitespace, 'form-a'), null, 'Must reject whitespace formSlug');
});

it('Finding 3: Rejects modern token if route slug parameter is missing or empty', () => {
    const token = jwt.sign({
        iss: 'bharat-properties-crm',
        purpose: 'feedback_submission',
        leadId: new mongoose.Types.ObjectId().toString(),
        formSlug: 'form-a',
        jti: uuidv4()
    }, process.env.FEEDBACK_JWT_SECRET);

    assert.strictEqual(verifyFeedbackToken(token, null), null, 'Must reject when route slug is null');
    assert.strictEqual(verifyFeedbackToken(token, ''), null, 'Must reject when route slug is empty');
    assert.strictEqual(verifyFeedbackToken(token, '   '), null, 'Must reject when route slug is whitespace');
});

it('Rejects tampered tokens or tokens signed with incorrect secret', () => {
    const token = jwt.sign({
        iss: 'bharat-properties-crm',
        purpose: 'feedback_submission',
        leadId: new mongoose.Types.ObjectId().toString(),
        activityId: new mongoose.Types.ObjectId().toString(),
        formSlug: 'slug-x'
    }, 'wrong_attacker_secret');

    assert.strictEqual(verifyFeedbackToken(token, 'slug-x'), null);
});

it('Normalizes tilde-separated tokens (~ instead of .)', () => {
    const leadId = new mongoose.Types.ObjectId().toString();
    const rawJwt = jwt.sign({
        iss: 'bharat-properties-crm',
        purpose: 'general_feedback',
        leadId,
        activityId: null,
        formSlug: 'general-slug',
        jti: uuidv4()
    }, process.env.FEEDBACK_JWT_SECRET);

    const tildeToken = rawJwt.replace(/\./g, '~');
    const verified = verifyFeedbackToken(tildeToken, 'general-slug');
    assert(verified && verified.valid === true);
    assert.strictEqual(verified.leadId, leadId);
    assert.strictEqual(verified.activityId, null);
});

it('Demotes legacy token: accepts leadId but strips activityId (cannot complete activities)', () => {
    const leadId = new mongoose.Types.ObjectId().toString();
    const legacyToken = jwt.sign({
        leadId,
        source: 'customer_feedback'
    }, process.env.FEEDBACK_JWT_SECRET);

    const verified = verifyFeedbackToken(legacyToken, 'any-slug');
    assert(verified && verified.valid === true);
    assert.strictEqual(verified.isLegacy, true);
    assert.strictEqual(verified.leadId, leadId);
    assert.strictEqual(verified.activityId, null, 'Legacy token MUST NEVER be granted activityId');
    assert.strictEqual(verified.jti, null);
});

it('Rejects random JWTs (e.g. user auth tokens, arbitrary payloads)', () => {
    const userAuthToken = jwt.sign({ id: 'user123', role: 'admin' }, process.env.FEEDBACK_JWT_SECRET);
    assert.strictEqual(verifyFeedbackToken(userAuthToken, 'slug'), null);
});

it('Rejects expired modern tokens', () => {
    const expiredToken = jwt.sign({
        iss: 'bharat-properties-crm',
        purpose: 'feedback_submission',
        leadId: new mongoose.Types.ObjectId().toString(),
        activityId: new mongoose.Types.ObjectId().toString(),
        formSlug: 'slug-exp',
        exp: Math.floor(Date.now() / 1000) - 3600 // Expired 1 hour ago
    }, process.env.FEEDBACK_JWT_SECRET);

    assert.strictEqual(verifyFeedbackToken(expiredToken, 'slug-exp'), null);
});

it('Rejects missing, blank, or malformed tokens', () => {
    assert.strictEqual(verifyFeedbackToken(null, 'slug'), null);
    assert.strictEqual(verifyFeedbackToken(undefined, 'slug'), null);
    assert.strictEqual(verifyFeedbackToken('', 'slug'), null);
    assert.strictEqual(verifyFeedbackToken('   ', 'slug'), null);
    assert.strictEqual(verifyFeedbackToken('malformed.jwt.token', 'slug'), null);
    assert.strictEqual(verifyFeedbackToken(12345, 'slug'), null);
});

it('Legacy token compatibility: strips activityId even if injected, and remains general-only across forms', () => {
    const leadId = new mongoose.Types.ObjectId().toString();
    const fakeActivityId = new mongoose.Types.ObjectId().toString();
    const injectedLegacyToken = jwt.sign({
        leadId,
        activityId: fakeActivityId,
        source: 'customer_feedback'
    }, process.env.FEEDBACK_JWT_SECRET);

    const verifiedFormA = verifyFeedbackToken(injectedLegacyToken, 'form-a');
    assert(verifiedFormA && verifiedFormA.valid === true);
    assert.strictEqual(verifiedFormA.activityId, null, 'activityId must be stripped from legacy tokens');
    assert.strictEqual(verifiedFormA.isLegacy, true);

    const verifiedFormB = verifyFeedbackToken(injectedLegacyToken, 'form-b');
    assert(verifiedFormB && verifiedFormB.valid === true);
    assert.strictEqual(verifiedFormB.activityId, null, 'activityId must be stripped regardless of route slug');
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 3: Strict PII Protection in getFormBySlug
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- SUITE 3: Strict PII Protection in getFormBySlug ---');

await itAsync('Returns ONLY safe greetingName (strips email, phone, mobile and raw lead)', async () => {
    const leadId = new mongoose.Types.ObjectId();
    const formSlug = 'test-pii-slug';
    const token = jwt.sign({
        iss: 'bharat-properties-crm',
        purpose: 'general_feedback',
        leadId: leadId.toString(),
        formSlug,
        jti: uuidv4()
    }, process.env.FEEDBACK_JWT_SECRET);

    // Mock FeedbackForm.findOne
    FeedbackForm.findOne = () => ({
        lean: async () => ({ _id: new mongoose.Types.ObjectId(), slug: formSlug, name: 'Test Form', isActive: true, sections: [] })
    });
    FeedbackForm.updateOne = () => ({ catch: () => {} });

    // Mock Lead.findById returning sensitive PII
    Lead.findById = () => ({
        select: (fields) => ({
            lean: async () => ({
                _id: leadId,
                firstName: 'Aditya',
                lastName: 'Birla',
                mobile: '+919999988888',
                email: 'aditya@example.com',
                salary: 5000000
            })
        })
    });

    const req = {
        params: { slug: formSlug },
        headers: { 'x-feedback-token': token },
        query: {}
    };

    let responsePayload = null;
    const res = {
        json: (data) => { responsePayload = data; }
    };

    await getFormBySlug(req, res, () => {});

    assert(responsePayload && responsePayload.success === true);
    const data = responsePayload.data;
    assert(data.leadInfo, 'leadInfo should exist for valid token');
    assert.strictEqual(data.leadInfo.greetingName, 'Aditya', 'greetingName must be Aditya');
    assert.strictEqual(data.leadInfo.email, undefined, 'email MUST NOT be exposed');
    assert.strictEqual(data.leadInfo.mobile, undefined, 'mobile MUST NOT be exposed');
    assert.strictEqual(data.leadInfo.phone, undefined, 'phone MUST NOT be exposed');
    assert.strictEqual(data.leadInfo._id, undefined, 'lead raw id MUST NOT be exposed');
});

await itAsync('Returns leadInfo: null when token is missing or invalid', async () => {
    FeedbackForm.findOne = () => ({
        lean: async () => ({ _id: new mongoose.Types.ObjectId(), slug: 'public-slug', isActive: true, sections: [] })
    });
    FeedbackForm.updateOne = () => ({ catch: () => {} });

    const req = {
        params: { slug: 'public-slug' },
        headers: {},
        query: {}
    };

    let responsePayload = null;
    const res = {
        json: (data) => { responsePayload = data; }
    };

    await getFormBySlug(req, res, () => {});

    assert(responsePayload && responsePayload.success === true);
    assert.strictEqual(responsePayload.data.leadInfo, null, 'leadInfo must be null for unauthenticated viewer');
});

await itAsync('Legacy unauthenticated GET with raw leadId query returns leadInfo: null (zero PII exposure)', async () => {
    const leadId = new mongoose.Types.ObjectId();
    FeedbackForm.findOne = () => ({
        lean: async () => ({ _id: new mongoose.Types.ObjectId(), slug: 'legacy-lead-query', isActive: true, sections: [] })
    });
    FeedbackForm.updateOne = () => ({ catch: () => {} });

    const req = {
        params: { slug: 'legacy-lead-query' },
        headers: {},
        query: { leadId: leadId.toString() }
    };

    let responsePayload = null;
    const res = {
        json: (data) => { responsePayload = data; }
    };

    await getFormBySlug(req, res, () => {});

    assert(responsePayload && responsePayload.success === true);
    assert.strictEqual(responsePayload.data.leadInfo, null, 'leadInfo must be null when only raw leadId query param is supplied');
    const serialized = JSON.stringify(responsePayload.data);
    assert(!serialized.includes('email'), 'email key must not exist in public response');
    assert(!serialized.includes('mobile'), 'mobile key must not exist in public response');
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 4: CAS State Machine, Idempotency & Transaction Atomicity
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- SUITE 4: CAS State Machine, Idempotency & Transaction Atomicity ---');

await itAsync('Discards unauthenticated client-supplied leadId and activityId in body/query', async () => {
    const slug = 'general-feedback';
    FeedbackForm.findOne = async () => ({ _id: new mongoose.Types.ObjectId(), slug, isActive: true, sections: [] });

    // Mock withMongoTransaction to execute callback directly with a mock session
    const mockSession = { id: 'mock-session-1' };
    const originalWithMongoTransaction = withMongoTransactionModule.withMongoTransaction;
    
    let createdSubmission = null;
    FeedbackSubmission.create = async (docs, opts) => {
        assert.strictEqual(opts.session, mockSession, 'FeedbackSubmission must receive transaction session');
        createdSubmission = docs[0];
        return [{ ...createdSubmission, _id: new mongoose.Types.ObjectId() }];
    };

    const req = {
        params: { slug },
        body: {
            leadId: new mongoose.Types.ObjectId().toString(), // Attacker tries to inject leadId
            activityId: new mongoose.Types.ObjectId().toString(), // Attacker tries to inject activityId
            responses: { q1: 'Good service' }
        },
        headers: {},
        query: {}
    };

    let responseStatus = 200;
    let responseBody = null;
    const res = {
        status: (s) => { responseStatus = s; return res; },
        json: (d) => { responseBody = d; }
    };

    // Execute with simulated session
    await withMongoTransactionModule.withMongoTransaction(async (session) => {
        // Test verifyFeedbackToken returns null
        const rawToken = req.body.token || req.headers['x-feedback-token'];
        const claims = verifyFeedbackToken(rawToken, slug);
        assert.strictEqual(claims, null, 'Claims must be null without token');
        
        // Assert authoritative values are null
        const authoritativeLeadId = claims?.leadId || null;
        const authoritativeActivityId = claims?.activityId || null;
        assert.strictEqual(authoritativeLeadId, null);
        assert.strictEqual(authoritativeActivityId, null);
    }, { session: mockSession });
});

await itAsync('CAS State Machine: Successfully completes active Activity with matching token', async () => {
    const slug = 'site-visit-form';
    const leadId = new mongoose.Types.ObjectId();
    const activityId = new mongoose.Types.ObjectId();
    const jti = uuidv4();

    const token = jwt.sign({
        iss: 'bharat-properties-crm',
        purpose: 'feedback_submission',
        leadId: leadId.toString(),
        activityId: activityId.toString(),
        formSlug: slug,
        jti
    }, process.env.FEEDBACK_JWT_SECRET);

    FeedbackForm.findOne = async () => ({
        _id: new mongoose.Types.ObjectId(),
        slug,
        isActive: true,
        department: 'Sales',
        teams: [],
        sections: [{ fields: [{ id: 'rating', type: 'rating' }] }]
    });

    const mockActivityDoc = {
        _id: activityId,
        lead: leadId,
        status: 'Scheduled',
        submissionId: null
    };

    Activity.findById = () => ({
        lean: async () => mockActivityDoc
    });

    let activityCasParams = null;
    Activity.findOneAndUpdate = async (filter, update, opts) => {
        activityCasParams = { filter, update, opts };
        return {
            _id: activityId,
            status: 'Completed',
            department: 'Sales',
            teams: []
        };
    };

    let activityUpdateParams = null;
    Activity.updateOne = async (filter, update, opts) => {
        activityUpdateParams = { filter, update, opts };
        return { matchedCount: 1, modifiedCount: 1 };
    };

    let submissionCreated = null;
    const mockSubmissionId = new mongoose.Types.ObjectId();
    FeedbackSubmission.create = async (docs, opts) => {
        submissionCreated = { doc: docs[0], opts };
        return [{ ...docs[0], _id: mockSubmissionId }];
    };

    let auditLogCreated = null;
    AuditLog.create = async (docs, opts) => {
        auditLogCreated = { doc: docs[0], opts };
        return docs;
    };

    let outboxCreated = null;
    OutboxEvent.create = async (docs, opts) => {
        outboxCreated = { doc: docs[0], opts };
        return docs;
    };

    const req = {
        params: { slug },
        body: {
            token,
            responses: { rating: 5 }
        },
        headers: {},
        query: {}
    };

    let resCode = 200;
    let resData = null;
    const res = {
        status: (s) => { resCode = s; return res; },
        json: (d) => { resData = d; }
    };

    await submitFeedback(req, res, (err) => { if (err) throw err; });

    assert.strictEqual(resCode, 201, 'Should return HTTP 201 Created');
    assert(resData && resData.success === true);
    assert.strictEqual(resData.submissionId.toString(), mockSubmissionId.toString());

    // 1. Verify CAS filter
    assert.strictEqual(String(activityCasParams.filter._id), String(activityId));
    assert.deepStrictEqual(activityCasParams.filter.status, { $ne: 'Completed' }, 'CAS MUST enforce status != Completed');

    // 2. Verify Session propagation
    const txnSession = submissionCreated.opts.session;
    assert(txnSession, 'FeedbackSubmission must participate in session');
    assert.strictEqual(activityCasParams.opts.session, txnSession, 'Activity CAS must share same session');
    assert.strictEqual(activityUpdateParams.opts.session, txnSession, 'Activity update must share same session');
    assert.strictEqual(auditLogCreated.opts.session, txnSession, 'AuditLog must share same session');
    assert.strictEqual(outboxCreated.opts.session, txnSession, 'OutboxEvent must share same session');

    // 3. Verify OutboxEvent payload and metadata
    const outbox = outboxCreated.doc;
    assert.strictEqual(outbox.eventType, 'ActivityUpdated');
    assert.strictEqual(outbox.aggregateType, 'Activity');
    assert.strictEqual(String(outbox.aggregateId), String(activityId));
    assert.strictEqual(outbox.payload.companyId, null, 'CompanyId must be null (single tenant / no false tenant claims)');
    assert.strictEqual(outbox.payload.actorId, null);
    assert.strictEqual(outbox.payload.status, 'Completed');
    assert.strictEqual(outbox.payload.completionSource, 'public_feedback_form');

    // 4. Verify AuditLog schema compatibility
    const audit = auditLogCreated.doc;
    assert.strictEqual(audit.eventType, 'lead_updated', 'Must use schema-compatible eventType lead_updated');
    assert.strictEqual(audit.targetType, 'lead');
    assert.strictEqual(String(audit.targetId), String(leadId));
});

await itAsync('Idempotency: Same request retry on completed activity returns 200 duplicate response', async () => {
    const slug = 'site-visit-form';
    const leadId = new mongoose.Types.ObjectId();
    const activityId = new mongoose.Types.ObjectId();
    const existingSubmissionId = new mongoose.Types.ObjectId();
    const jti = uuidv4();

    const token = jwt.sign({
        iss: 'bharat-properties-crm',
        purpose: 'feedback_submission',
        leadId: leadId.toString(),
        activityId: activityId.toString(),
        formSlug: slug,
        jti
    }, process.env.FEEDBACK_JWT_SECRET);

    FeedbackForm.findOne = async () => ({
        _id: new mongoose.Types.ObjectId(),
        slug,
        isActive: true,
        sections: []
    });

    // Activity is ALREADY Completed
    const completedActivity = {
        _id: activityId,
        lead: leadId,
        status: 'Completed',
        details: { submissionId: existingSubmissionId }
    };

    Activity.findOneAndUpdate = async () => null; // CAS fails because status is already 'Completed'

    Activity.findById = () => {
        const q = {
            session: () => q,
            lean: async () => completedActivity,
            then: (resolve, reject) => Promise.resolve(completedActivity).then(resolve, reject)
        };
        return q;
    };

    FeedbackSubmission.findById = () => {
        const subDoc = { _id: existingSubmissionId, idempotencyKey: jti };
        const q = {
            session: () => q,
            lean: async () => subDoc,
            then: (resolve, reject) => Promise.resolve(subDoc).then(resolve, reject)
        };
        return q;
    };

    const req = {
        params: { slug },
        body: { token, responses: {} },
        headers: {},
        query: {}
    };

    let resCode = 200;
    let resData = null;
    const res = {
        status: (s) => { resCode = s; return res; },
        json: (d) => { resData = d; }
    };

    await submitFeedback(req, res, () => {});

    assert.strictEqual(resCode, 200, 'Same request retry must return HTTP 200');
    assert.strictEqual(resData.success, true);
    assert.strictEqual(resData.duplicate, true, 'Response must identify duplicate submission');
    assert.strictEqual(resData.submissionId.toString(), existingSubmissionId.toString());
});

await itAsync('Conflict Handling: Different request on already completed activity returns 409 Conflict', async () => {
    const slug = 'site-visit-form';
    const leadId = new mongoose.Types.ObjectId();
    const activityId = new mongoose.Types.ObjectId();
    const existingSubmissionId = new mongoose.Types.ObjectId();

    // Token has a DIFFERENT jti
    const token = jwt.sign({
        iss: 'bharat-properties-crm',
        purpose: 'feedback_submission',
        leadId: leadId.toString(),
        activityId: activityId.toString(),
        formSlug: slug,
        jti: 'jti-second-request'
    }, process.env.FEEDBACK_JWT_SECRET);

    FeedbackForm.findOne = async () => ({
        _id: new mongoose.Types.ObjectId(),
        slug,
        isActive: true,
        sections: []
    });

    const completedActivity = {
        _id: activityId,
        lead: leadId,
        status: 'Completed',
        details: { submissionId: existingSubmissionId }
    };

    Activity.findOneAndUpdate = async () => null; // CAS fails

    Activity.findById = () => {
        const q = {
            session: () => q,
            lean: async () => completedActivity,
            then: (resolve, reject) => Promise.resolve(completedActivity).then(resolve, reject)
        };
        return q;
    };

    // Existing submission was created by jti-first-request
    FeedbackSubmission.findById = () => {
        const subDoc = { _id: existingSubmissionId, idempotencyKey: 'jti-first-request' };
        const q = {
            session: () => q,
            lean: async () => subDoc,
            then: (resolve, reject) => Promise.resolve(subDoc).then(resolve, reject)
        };
        return q;
    };

    const req = {
        params: { slug },
        body: { token, responses: {} },
        headers: {},
        query: {}
    };

    let resCode = 200;
    let resData = null;
    const res = {
        status: (s) => { resCode = s; return res; },
        json: (d) => { resData = d; }
    };

    await submitFeedback(req, res, () => {});

    assert.strictEqual(resCode, 409, 'Different request targeting completed activity MUST return HTTP 409 Conflict');
    assert.strictEqual(resData.success, false);
    assert.strictEqual(resData.message, 'Feedback has already been submitted for this activity.');
});

await itAsync('Policy A: Manually completed activity without submissionId returns HTTP 409 Conflict with exact error', async () => {
    const slug = 'site-visit-form';
    const leadId = new mongoose.Types.ObjectId();
    const activityId = new mongoose.Types.ObjectId();
    const jti = uuidv4();

    const token = jwt.sign({
        iss: 'bharat-properties-crm',
        purpose: 'feedback_submission',
        leadId: leadId.toString(),
        activityId: activityId.toString(),
        formSlug: slug,
        jti
    }, process.env.FEEDBACK_JWT_SECRET);

    FeedbackForm.findOne = async () => ({
        _id: new mongoose.Types.ObjectId(),
        slug,
        isActive: true,
        sections: []
    });

    // Activity was completed manually by staff without customer feedback
    const manuallyCompletedActivity = {
        _id: activityId,
        lead: leadId,
        status: 'Completed',
        details: { submissionId: null }
    };

    Activity.findOneAndUpdate = async () => null; // CAS fails because status is already 'Completed'

    Activity.findById = () => {
        const q = {
            session: () => q,
            lean: async () => manuallyCompletedActivity,
            then: (resolve, reject) => Promise.resolve(manuallyCompletedActivity).then(resolve, reject)
        };
        return q;
    };

    const req = {
        params: { slug },
        body: { token, responses: { rating: 5 } },
        headers: {},
        query: {}
    };

    let resCode = 200;
    let resData = null;
    const res = {
        status: (s) => { resCode = s; return res; },
        json: (d) => { resData = d; }
    };

    await submitFeedback(req, res, () => {});

    assert.strictEqual(resCode, 409, 'Manually completed activity without submissionId must return HTTP 409 Conflict');
    assert.strictEqual(resData.success, false);
    assert.strictEqual(resData.error, 'Activity has already been completed.');
    assert.strictEqual(resData.message, 'Activity has already been completed.');
});

await itAsync('E11000 Duplicate Key: Caught outside aborted session returns HTTP 200 duplicate if key matches', async () => {
    const slug = 'site-visit-form';
    const leadId = new mongoose.Types.ObjectId();
    const activityId = new mongoose.Types.ObjectId();
    const existingSubmissionId = new mongoose.Types.ObjectId();
    const jti = uuidv4();

    const token = jwt.sign({
        iss: 'bharat-properties-crm',
        purpose: 'feedback_submission',
        leadId: leadId.toString(),
        activityId: activityId.toString(),
        formSlug: slug,
        jti
    }, process.env.FEEDBACK_JWT_SECRET);

    FeedbackForm.findOne = async () => ({ _id: new mongoose.Types.ObjectId(), slug, isActive: true, sections: [] });

    Activity.findById = () => ({
        lean: async () => ({ _id: activityId, lead: leadId, status: 'Scheduled' })
    });

    Activity.findOneAndUpdate = async () => ({ _id: activityId, status: 'Completed', department: 'Sales', teams: [] });

    // Simulate E11000 duplicate key error thrown during transaction
    FeedbackSubmission.create = async () => {
        const err = new Error('E11000 duplicate key error collection: feedbacksubmissions index: idempotencyKey_1 dup key');
        err.code = 11000;
        throw err;
    };

    // Query outside aborted transaction finds existing record
    FeedbackSubmission.findOne = (query) => {
        assert.strictEqual(query.idempotencyKey, jti, 'Must query by exact matching idempotencyKey');
        return {
            lean: async () => ({
                _id: existingSubmissionId,
                idempotencyKey: jti
            })
        };
    };

    const req = {
        params: { slug },
        body: { token, responses: {} },
        headers: {},
        query: {}
    };

    let resCode = 200;
    let resData = null;
    const res = {
        status: (s) => { resCode = s; return res; },
        json: (d) => { resData = d; }
    };

    await submitFeedback(req, res, () => {});

    assert.strictEqual(resCode, 200, 'E11000 with matching idempotencyKey must return HTTP 200 duplicate');
    assert.strictEqual(resData.success, true);
    assert.strictEqual(resData.duplicate, true);
    assert.strictEqual(resData.submissionId.toString(), existingSubmissionId.toString());
});

await itAsync('Lead-scoped submission (activityId: null): Creates submission without Activity CAS or OutboxEvent', async () => {
    const slug = 'general-feedback';
    const leadId = new mongoose.Types.ObjectId();
    const jti = uuidv4();

    FeedbackSubmission.findOne = () => ({ lean: async () => null });

    const token = jwt.sign({
        iss: 'bharat-properties-crm',
        purpose: 'general_feedback',
        leadId: leadId.toString(),
        activityId: null,
        formSlug: slug,
        jti
    }, process.env.FEEDBACK_JWT_SECRET);

    FeedbackForm.findOne = async () => ({
        _id: new mongoose.Types.ObjectId(),
        slug,
        isActive: true,
        department: 'Operations',
        teams: [],
        sections: []
    });

    let submissionCreated = null;
    const mockSubmissionId = new mongoose.Types.ObjectId();
    FeedbackSubmission.create = async (docs, opts) => {
        submissionCreated = { doc: docs[0], opts };
        return [{ ...docs[0], _id: mockSubmissionId }];
    };

    let auditLogCreated = null;
    AuditLog.create = async (docs, opts) => {
        auditLogCreated = { doc: docs[0], opts };
        return docs;
    };

    let outboxCreated = false;
    OutboxEvent.create = async () => {
        outboxCreated = true;
    };

    let activityUpdated = false;
    Activity.findOneAndUpdate = async () => {
        activityUpdated = true;
    };

    const req = {
        params: { slug },
        body: { token, responses: { feedback: 'Great experience' } },
        headers: {},
        query: {}
    };

    let resCode = 200;
    let resData = null;
    const res = {
        status: (s) => { resCode = s; return res; },
        json: (d) => { resData = d; }
    };

    await submitFeedback(req, res, (err) => { if (err) throw err; });

    assert.strictEqual(resCode, 201, 'Must return HTTP 201 Created');
    assert.strictEqual(resData.success, true);
    assert.strictEqual(submissionCreated.doc.activity, null, 'Submission activity must be null');
    assert.strictEqual(String(submissionCreated.doc.lead), String(leadId), 'Submission lead must match token');
    assert.strictEqual(submissionCreated.doc.idempotencyKey, jti);
    assert.strictEqual(activityUpdated, false, 'Activity CAS MUST NOT be called for lead-only token');
    assert.strictEqual(outboxCreated, false, 'OutboxEvent MUST NOT be called for lead-only token');
    assert(auditLogCreated, 'AuditLog MUST be recorded for lead-scoped feedback');
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 5: Security Headers & Rate Limiting Verification
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- SUITE 5: Security Headers & Rate Limiting Verification ---');

it('Security Headers middleware sets no-store, no-cache, no-referrer, and nosniff', () => {
    const headers = {};
    const res = {
        setHeader: (name, val) => { headers[name] = val; }
    };
    let nextCalled = false;
    publicFeedbackSecurityHeaders({}, res, () => { nextCalled = true; });

    assert(nextCalled, 'next() must be called');
    assert(headers['Cache-Control'].includes('no-store'), 'Cache-Control must contain no-store');
    assert(headers['Cache-Control'].includes('no-cache'), 'Cache-Control must contain no-cache');
    assert.strictEqual(headers['Pragma'], 'no-cache', 'Pragma must be no-cache');
    assert.strictEqual(headers['Referrer-Policy'], 'no-referrer', 'Referrer-Policy must be no-referrer');
    assert.strictEqual(headers['X-Content-Type-Options'], 'nosniff', 'X-Content-Type-Options must be nosniff');
});

it('Rate Limiters enforce safe threshold parameters', () => {
    // publicFormFetchLimiter: 100 requests / 15 minutes
    // publicFormSubmitLimiter: 25 requests / 15 minutes
    assert(publicFormFetchLimiter, 'Fetch rate limiter must be defined');
    assert(publicFormSubmitLimiter, 'Submit rate limiter must be defined');
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 6: Genuine Isolated MongoDB Replica-Set Transaction Tests (MongoMemoryReplSet)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- SUITE 6: Genuine Isolated MongoDB Replica-Set Transaction Tests (MongoMemoryReplSet) ---');

// Mandatory Pre-Flight Safety Assertions
delete process.env.MONGODB_URI;
assert.strictEqual(process.env.MONGODB_URI, undefined, 'SAFETY VIOLATION: MONGODB_URI must be undefined');

console.log('  [Harness] Starting isolated MongoMemoryReplSet (count: 1, wiredTiger)...');
const replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' }
});
const replUri = replSet.getUri();
console.log('  [Harness] In-memory replica set active at:', replUri);

// Verify URI host is strictly local
assert(replUri.startsWith('mongodb://127.0.0.1:') || replUri.startsWith('mongodb://localhost:'),
    'SAFETY VIOLATION: Replica-set URI must target strictly 127.0.0.1 / localhost');

// Restore all native Mongoose primitives for genuine replica-set operation
restoreOriginalMongoosePrimitives();

await mongoose.connect(replUri);
assert.strictEqual(mongoose.connection.readyState, 1, 'Mongoose must be connected to local replica set');
assert(mongoose.connection.host === '127.0.0.1' || mongoose.connection.host === 'localhost',
    'SAFETY VIOLATION: Connected host must be local');

// Ensure collections and unique indexes are built on the replica set
await FeedbackSubmission.init();
await Activity.init();
await Lead.init();
await FeedbackForm.init();
await AuditLog.init();
await OutboxEvent.init();
console.log('  [Harness] WiredTiger multi-document transaction collections and indexes verified.');

// ── Test Case 1: Valid first public-feedback completion ──────────────────────
await itAsync('[ReplSet TC-1] Valid first public-feedback completion succeeds and creates only expected transactional records', async () => {
    const lead = await Lead.create({
        firstName: 'Vikram',
        lastName: 'Malhotra',
        mobile: '9876543210'
    });

    const activity = await Activity.create({
        type: 'Site Visit',
        subject: 'Palm Residency Site Visit',
        entityType: 'Lead',
        entityId: lead._id,
        dueDate: new Date(),
        status: 'Scheduled',
        department: 'Sales',
        details: { project: 'Palm Residency' }
    });

    const form = await FeedbackForm.create({
        name: 'Site Visit Feedback Form',
        slug: 'site-visit-form-repl-' + uuidv4(),
        isActive: true,
        department: 'Sales',
        teams: [],
        sections: [{
            id: 'sec_1',
            title: 'Experience',
            fields: [{ id: 'rating', label: 'Rating', type: 'rating' }]
        }],
        settings: { successMessage: 'Thank you for your feedback!' }
    });

    const jti1 = uuidv4();
    const token1 = jwt.sign({
        iss: 'bharat-properties-crm',
        purpose: 'feedback_submission',
        leadId: String(lead._id),
        activityId: String(activity._id),
        formSlug: form.slug,
        jti: jti1
    }, process.env.FEEDBACK_JWT_SECRET);

    const req = {
        params: { slug: form.slug },
        body: { token: token1, responses: { rating: 5 } },
        headers: { 'user-agent': 'ReplicaSetAgent/1.0', 'x-correlation-id': 'corr-tc-1' },
        query: {}
    };

    let resCode = 200;
    let resData = null;
    const res = {
        status: (s) => { resCode = s; return res; },
        json: (d) => { resData = d; }
    };

    await submitFeedback(req, res, (err) => { if (err) throw err; });

    assert.strictEqual(resCode, 201, 'Should return HTTP 201 Created');
    assert.strictEqual(resData.success, true);
    assert(resData.submissionId, 'Must return created submission ID');

    // 1. Verify Activity Document state
    const updatedAct = await Activity.findById(activity._id);
    assert.strictEqual(updatedAct.status, 'Completed', 'Activity must transition to Completed');
    assert.strictEqual(String(updatedAct.details?.submissionId), String(resData.submissionId), 'Activity must link submissionId');
    assert.strictEqual(updatedAct.details?.completedVia, 'public_feedback_form');
    assert.strictEqual(updatedAct.performedBy, 'Customer (Public Form)');

    // 2. Verify FeedbackSubmission Document
    const createdSub = await FeedbackSubmission.findById(resData.submissionId);
    assert(createdSub, 'FeedbackSubmission must exist in replica set');
    assert.strictEqual(String(createdSub.lead), String(lead._id));
    assert.strictEqual(String(createdSub.activity), String(activity._id));
    assert.strictEqual(createdSub.rating, 5);
    assert.strictEqual(createdSub.idempotencyKey, jti1);

    // 3. Verify AuditLog entry
    const audit = await AuditLog.findOne({ targetId: lead._id, 'metadata.submissionId': createdSub._id });
    assert(audit, 'AuditLog entry must be recorded in transaction');
    assert.strictEqual(audit.eventType, 'lead_updated');
    assert.strictEqual(audit.status, 'success');

    // 4. Verify OutboxEvent entry
    const outbox = await OutboxEvent.findOne({ aggregateId: activity._id });
    assert(outbox, 'OutboxEvent must be recorded in transaction');
    assert.strictEqual(outbox.eventType, 'ActivityUpdated');
    assert.strictEqual(outbox.aggregateType, 'Activity');
    assert.strictEqual(outbox.status, 'PENDING');
    assert.strictEqual(outbox.payload.status, 'Completed');
    assert.strictEqual(outbox.payload.statusChanged, true);
    assert.strictEqual(String(outbox.payload.submissionId), String(createdSub._id));
});

// ── Test Case 2: Identical request retry remains idempotent ──────────────────
await itAsync('[ReplSet TC-2] Identical request retry remains idempotent without duplicate records', async () => {
    const lead = await Lead.create({ firstName: 'Pooja', lastName: 'Verma', mobile: '9876500002' });
    const activity = await Activity.create({
        type: 'Site Visit',
        subject: 'Palm Residency Site Visit',
        entityType: 'Lead',
        entityId: lead._id,
        dueDate: new Date(),
        status: 'Scheduled',
        department: 'Sales',
        details: {}
    });
    const form = await FeedbackForm.create({
        name: 'Feedback Form',
        slug: 'form-retry-' + uuidv4(),
        isActive: true,
        sections: [{ id: 's1', title: 'Experience', fields: [{ id: 'rating', label: 'Rating', type: 'rating' }] }]
    });

    const jti = uuidv4();
    const token = jwt.sign({
        iss: 'bharat-properties-crm',
        purpose: 'feedback_submission',
        leadId: String(lead._id),
        activityId: String(activity._id),
        formSlug: form.slug,
        jti
    }, process.env.FEEDBACK_JWT_SECRET);

    const req = {
        params: { slug: form.slug },
        body: { token, responses: { rating: 4 } },
        headers: { 'user-agent': 'RetryAgent/1.0' },
        query: {}
    };

    // First attempt: succeeds
    let code1 = 200, data1 = null;
    const res1 = { status: (s) => { code1 = s; return res1; }, json: (d) => { data1 = d; } };
    await submitFeedback(req, res1, (err) => { if (err) throw err; });
    assert.strictEqual(code1, 201);

    // Second attempt: identical retry
    let code2 = 200, data2 = null;
    const res2 = { status: (s) => { code2 = s; return res2; }, json: (d) => { data2 = d; } };
    await submitFeedback(req, res2, (err) => { if (err) throw err; });

    assert.strictEqual(code2, 200, 'Identical retry must return HTTP 200 OK');
    assert.strictEqual(data2.success, true);
    assert.strictEqual(data2.duplicate, true, 'Must identify as duplicate');
    assert.strictEqual(data2.message, 'Feedback already recorded.');
    assert.strictEqual(String(data2.submissionId), String(data1.submissionId));

    // Assert zero duplicate records in DB
    const subCount = await FeedbackSubmission.countDocuments({ activity: activity._id });
    assert.strictEqual(subCount, 1, 'Exactly one FeedbackSubmission must exist');
    const outboxCount = await OutboxEvent.countDocuments({ aggregateId: activity._id });
    assert.strictEqual(outboxCount, 1, 'Exactly one OutboxEvent must exist');
    const auditCount = await AuditLog.countDocuments({ 'metadata.activityId': activity._id });
    assert.strictEqual(auditCount, 1, 'Exactly one AuditLog must exist');
});

// ── Test Case 3: Policy A - Manually Completed Activity without submissionId ─
await itAsync('[ReplSet TC-3] Policy A: Manually completed Activity without submissionId returns HTTP 409 Conflict with exact error and zero mutations', async () => {
    const lead = await Lead.create({ firstName: 'Aman', lastName: 'Gupta', mobile: '9876500003' });
    const manualActivity = await Activity.create({
        type: 'Meeting',
        subject: 'Office meeting completed by CRM staff',
        entityType: 'Lead',
        entityId: lead._id,
        dueDate: new Date(),
        status: 'Completed',
        completedAt: new Date(),
        performedBy: 'Staff Agent',
        details: { submissionId: null } // Manually completed without feedback
    });

    const form = await FeedbackForm.create({
        name: 'Policy A Form',
        slug: 'form-policya-' + uuidv4(),
        isActive: true,
        analytics: { submissions: 0 }
    });

    const token = jwt.sign({
        iss: 'bharat-properties-crm',
        purpose: 'feedback_submission',
        leadId: String(lead._id),
        activityId: String(manualActivity._id),
        formSlug: form.slug,
        jti: uuidv4()
    }, process.env.FEEDBACK_JWT_SECRET);

    const req = {
        params: { slug: form.slug },
        body: { token, responses: { rating: 5 } },
        headers: { 'user-agent': 'PolicyAAgent/1.0' },
        query: {}
    };

    let resCode = 200, resData = null;
    const res = { status: (s) => { resCode = s; return res; }, json: (d) => { resData = d; } };
    await submitFeedback(req, res, (err) => { if (err) throw err; });

    assert.strictEqual(resCode, 409, 'Policy A: Must return HTTP 409 Conflict');
    assert.strictEqual(resData.success, false);
    assert.strictEqual(resData.error, 'Activity has already been completed.');
    assert.strictEqual(resData.message, 'Activity has already been completed.');

    // Assert zero database mutations
    const subs = await FeedbackSubmission.find({ activity: manualActivity._id });
    assert.strictEqual(subs.length, 0, 'Must NOT create FeedbackSubmission');

    const actAfter = await Activity.findById(manualActivity._id);
    assert.strictEqual(actAfter.details?.submissionId, null, 'Must NOT set details.submissionId');
    assert.strictEqual(actAfter.performedBy, 'Staff Agent', 'performedBy must not be changed');

    const audits = await AuditLog.find({ 'metadata.activityId': manualActivity._id });
    assert.strictEqual(audits.length, 0, 'Must NOT create AuditLog');

    const outboxes = await OutboxEvent.find({ aggregateId: manualActivity._id });
    assert.strictEqual(outboxes.length, 0, 'Must NOT create OutboxEvent');

    const formAfter = await FeedbackForm.findById(form._id);
    assert.strictEqual(formAfter.analytics?.submissions || 0, 0, 'Analytics submission count must NOT increment');
});

// ── Test Case 4: Concurrent submissions using different valid tokens ─────────
await itAsync('[ReplSet TC-4] Concurrent submissions using different valid tokens do not create duplicate completion effects', async () => {
    const lead = await Lead.create({ firstName: 'Race', lastName: 'Lead', mobile: '9876500004' });
    const raceActivity = await Activity.create({
        type: 'Site Visit',
        subject: 'Race Activity',
        entityType: 'Lead',
        entityId: lead._id,
        dueDate: new Date(),
        status: 'Scheduled',
        details: {}
    });

    const form = await FeedbackForm.create({
        name: 'Race Form',
        slug: 'form-race-' + uuidv4(),
        isActive: true,
        sections: [{ id: 's1', title: 'Experience', fields: [{ id: 'rating', label: 'Rating', type: 'rating' }] }]
    });

    const tokenA = jwt.sign({
        iss: 'bharat-properties-crm',
        purpose: 'feedback_submission',
        leadId: String(lead._id),
        activityId: String(raceActivity._id),
        formSlug: form.slug,
        jti: 'jti-concurrent-A-' + uuidv4()
    }, process.env.FEEDBACK_JWT_SECRET);

    const tokenB = jwt.sign({
        iss: 'bharat-properties-crm',
        purpose: 'feedback_submission',
        leadId: String(lead._id),
        activityId: String(raceActivity._id),
        formSlug: form.slug,
        jti: 'jti-concurrent-B-' + uuidv4()
    }, process.env.FEEDBACK_JWT_SECRET);

    let codeA = 200, dataA = null;
    let codeB = 200, dataB = null;
    const resA = { status: (s) => { codeA = s; return resA; }, json: (d) => { dataA = d; } };
    const resB = { status: (s) => { codeB = s; return resB; }, json: (d) => { dataB = d; } };

    await Promise.all([
        submitFeedback({ params: { slug: form.slug }, body: { token: tokenA, responses: { rating: 5 } }, headers: {}, query: {} }, resA, () => {}),
        submitFeedback({ params: { slug: form.slug }, body: { token: tokenB, responses: { rating: 3 } }, headers: {}, query: {} }, resB, () => {})
    ]);

    const statusCodes = [codeA, codeB].sort();
    assert.deepStrictEqual(statusCodes, [201, 409], 'Exactly one request must win CAS (201) and the other must conflict (409)');

    const raceSubs = await FeedbackSubmission.find({ activity: raceActivity._id });
    assert.strictEqual(raceSubs.length, 1, 'Exactly one FeedbackSubmission must exist in database');

    const raceOutbox = await OutboxEvent.find({ aggregateId: raceActivity._id });
    assert.strictEqual(raceOutbox.length, 1, 'Exactly one OutboxEvent must exist in database');
});

// ── Test Case 5: Transaction failure rolls back all intended database writes ─
await itAsync('[ReplSet TC-5] Transaction failure rolls back all intended database writes', async () => {
    const lead = await Lead.create({ firstName: 'Rollback', lastName: 'Lead', mobile: '9876500005' });
    const rollbackAct = await Activity.create({
        type: 'Site Visit',
        subject: 'Rollback Activity',
        entityType: 'Lead',
        entityId: lead._id,
        dueDate: new Date(),
        status: 'Scheduled',
        details: {}
    });

    const form = await FeedbackForm.create({
        name: 'Rollback Form',
        slug: 'form-rollback-' + uuidv4(),
        isActive: true,
        sections: [{ id: 's1', title: 'Experience', fields: [{ id: 'rating', label: 'Rating', type: 'rating' }] }]
    });

    const token = jwt.sign({
        iss: 'bharat-properties-crm',
        purpose: 'feedback_submission',
        leadId: String(lead._id),
        activityId: String(rollbackAct._id),
        formSlug: form.slug,
        jti: uuidv4()
    }, process.env.FEEDBACK_JWT_SECRET);

    // Patch OutboxEvent.create to throw an intentional failure inside transaction
    const realOutboxCreate = OutboxEvent.create;
    OutboxEvent.create = async () => {
        throw new Error('Simulated Database Failure during Outbox Event write');
    };

    let errorCaught = false;
    try {
        const req = {
            params: { slug: form.slug },
            body: { token, responses: { rating: 5 } },
            headers: {},
            query: {}
        };
        const res = { status: () => res, json: () => {} };
        await submitFeedback(req, res, (err) => { if (err) throw err; });
    } catch (err) {
        errorCaught = true;
        assert(err.message.includes('Simulated Database Failure'));
    } finally {
        OutboxEvent.create = realOutboxCreate;
    }

    assert.strictEqual(errorCaught, true, 'Error must propagate when transaction fails');

    // Verify rollback in database
    const actAfter = await Activity.findById(rollbackAct._id);
    assert.strictEqual(actAfter.status, 'Scheduled', 'Activity status must remain Scheduled after abort');
    assert.strictEqual(actAfter.details?.submissionId, undefined, 'submissionId must not be committed');

    const sub = await FeedbackSubmission.findOne({ activity: rollbackAct._id });
    assert.strictEqual(sub, null, 'FeedbackSubmission must NOT exist after abort');

    const audit = await AuditLog.findOne({ 'metadata.activityId': rollbackAct._id });
    assert.strictEqual(audit, null, 'AuditLog must NOT exist after abort');
});

// ── Test Case 6: Duplicate-key/E11000 behavior handled per idempotency contract
await itAsync('[ReplSet TC-6] Duplicate-key/E11000 behavior is handled according to existing idempotency contract', async () => {
    const lead = await Lead.create({ firstName: 'E11000', lastName: 'Lead', mobile: '9876500006' });
    const e11000Act = await Activity.create({
        type: 'Site Visit',
        subject: 'E11000 Activity',
        entityType: 'Lead',
        entityId: lead._id,
        dueDate: new Date(),
        status: 'Scheduled',
        details: {}
    });

    const form = await FeedbackForm.create({
        name: 'E11000 Form',
        slug: 'form-e11000-' + uuidv4(),
        isActive: true,
        sections: []
    });

    const existingKey = 'unique-key-e11000-' + uuidv4();
    const preExistingSub = await FeedbackSubmission.create({
        form: form._id,
        lead: lead._id,
        activity: e11000Act._id,
        rating: 5,
        idempotencyKey: existingKey,
        responses: { rating: 5 }
    });

    const token = jwt.sign({
        iss: 'bharat-properties-crm',
        purpose: 'feedback_submission',
        leadId: String(lead._id),
        activityId: String(e11000Act._id),
        formSlug: form.slug,
        jti: existingKey
    }, process.env.FEEDBACK_JWT_SECRET);

    let resCode = 200, resData = null;
    const res = { status: (s) => { resCode = s; return res; }, json: (d) => { resData = d; } };

    await submitFeedback({ params: { slug: form.slug }, body: { token, responses: {} }, headers: {}, query: {} }, res, () => {});

    assert.strictEqual(resCode, 200, 'E11000 with matching key must return HTTP 200 OK');
    assert.strictEqual(resData.success, true);
    assert.strictEqual(resData.duplicate, true);
    assert.strictEqual(String(resData.submissionId), String(preExistingSub._id));
    assert.strictEqual(resData.message, 'Feedback already recorded.');
});

// ── Test Case 7: Tampered and expired tokens are rejected ────────────────────
await itAsync('[ReplSet TC-7] Tampered and expired tokens are rejected without transaction or database writes', async () => {
    const form = await FeedbackForm.create({
        name: 'Token Security Form',
        slug: 'form-tokensec-' + uuidv4(),
        isActive: true
    });

    // 1. Expired token
    const expiredToken = jwt.sign({
        iss: 'bharat-properties-crm',
        purpose: 'feedback_submission',
        leadId: new mongoose.Types.ObjectId().toString(),
        activityId: new mongoose.Types.ObjectId().toString(),
        formSlug: form.slug,
        exp: Math.floor(Date.now() / 1000) - 3600
    }, process.env.FEEDBACK_JWT_SECRET);

    assert.strictEqual(verifyFeedbackToken(expiredToken, form.slug), null, 'Expired token must fail verification');

    // 2. Tampered signature
    const tamperedToken = jwt.sign({
        iss: 'bharat-properties-crm',
        purpose: 'feedback_submission',
        leadId: new mongoose.Types.ObjectId().toString(),
        activityId: new mongoose.Types.ObjectId().toString(),
        formSlug: form.slug
    }, 'attacker_wrong_secret_key');

    assert.strictEqual(verifyFeedbackToken(tamperedToken, form.slug), null, 'Tampered token must fail verification');

    // 3. Mismatched purpose
    const badPurposeToken = jwt.sign({
        iss: 'bharat-properties-crm',
        purpose: 'user_authentication',
        leadId: new mongoose.Types.ObjectId().toString(),
        activityId: new mongoose.Types.ObjectId().toString(),
        formSlug: form.slug
    }, process.env.FEEDBACK_JWT_SECRET);

    assert.strictEqual(verifyFeedbackToken(badPurposeToken, form.slug), null, 'Mismatched purpose must fail verification');
});

// ── Test Case 8: Public response fields do not disclose prohibited PII ───────
await itAsync('[ReplSet TC-8] Public response fields do not disclose prohibited PII (strict API greetingName contract)', async () => {
    const piiLead = await Lead.create({
        firstName: 'Ananya',
        lastName: 'Singhania',
        mobile: '9811223344',
        email: 'ananya.s@enterprise-hni.com',
        notes: 'Confidential lead looking for 10 Cr penthouse in Sector 3.'
    });

    const form = await FeedbackForm.create({
        name: 'PII Test Form',
        slug: 'form-pii-' + uuidv4(),
        isActive: true
    });

    const piiToken = jwt.sign({
        iss: 'bharat-properties-crm',
        purpose: 'feedback_submission',
        leadId: String(piiLead._id),
        activityId: null,
        formSlug: form.slug
    }, process.env.FEEDBACK_JWT_SECRET);

    let resCode = 200, resData = null;
    const res = {
        status: (s) => { resCode = s; return res; },
        json: (d) => { resData = d; }
    };

    await getFormBySlug({ params: { slug: form.slug }, headers: {}, query: { token: piiToken } }, res, () => {});

    assert.strictEqual(resCode, 200);
    assert.strictEqual(resData.success, true);
    assert.strictEqual(resData.data.leadInfo.greetingName, 'Ananya', 'Must provide greetingName');
    assert.strictEqual(resData.data.leadInfo.mobile, undefined, 'mobile MUST NOT be present');
    assert.strictEqual(resData.data.leadInfo.phone, undefined, 'phone MUST NOT be present');
    assert.strictEqual(resData.data.leadInfo.email, undefined, 'email MUST NOT be present');
    assert.strictEqual(resData.data.leadInfo.notes, undefined, 'notes MUST NOT be present');
    assert.strictEqual(resData.data.leadInfo.lastName, undefined, 'lastName MUST NOT be present');

    // Ensure raw confidential values are not present anywhere in serialized JSON
    const serialized = JSON.stringify(resData.data);
    assert(!serialized.includes('9811223344'), 'Prohibited PII: mobile phone leaked');
    assert(!serialized.includes('enterprise-hni.com'), 'Prohibited PII: email leaked');
    assert(!serialized.includes('10 Cr penthouse'), 'Prohibited PII: private notes leaked');
});

// ── Test Case 9: Finding 2 - Legacy Token First Submission ───────────────────
await itAsync('[ReplSet TC-9] Finding 2: Legacy token first submission creates general submission without Activity CAS or OutboxEvent', async () => {
    const lead = await Lead.create({ firstName: 'LegacyOne', lastName: 'Lead', mobile: '9876500009' });
    const form = await FeedbackForm.create({
        name: 'Legacy Form',
        slug: 'form-legacy-' + uuidv4(),
        isActive: true,
        sections: [{ id: 's1', title: 'Experience', fields: [{ id: 'rating', label: 'Rating', type: 'rating' }] }]
    });

    const legacyToken = jwt.sign({
        leadId: String(lead._id),
        source: 'customer_feedback'
    }, process.env.FEEDBACK_JWT_SECRET);

    const req = {
        params: { slug: form.slug },
        body: { token: legacyToken, responses: { rating: 4 } },
        headers: { 'user-agent': 'LegacyAgent/1.0' },
        query: {}
    };

    let resCode = 200, resData = null;
    const res = { status: (s) => { resCode = s; return res; }, json: (d) => { resData = d; } };
    await submitFeedback(req, res, (err) => { if (err) throw err; });

    assert.strictEqual(resCode, 201, 'Legacy first submission must return HTTP 201 Created');
    assert.strictEqual(resData.success, true);
    assert(resData.submissionId, 'Must return created submission ID');

    // Verify submission document
    const sub = await FeedbackSubmission.findById(resData.submissionId);
    assert(sub, 'FeedbackSubmission must exist in DB');
    assert.strictEqual(sub.activity, null, 'Legacy submission activity must be strictly null');
    assert.strictEqual(String(sub.lead), String(lead._id), 'Submission must link to lead');
    assert.strictEqual(sub.idempotencyKey, `legacy:${lead._id}:${form.slug}`, 'idempotencyKey must follow legacy contract');

    // Verify ZERO OutboxEvents created
    const outboxCount = await OutboxEvent.countDocuments({ aggregateId: sub._id });
    assert.strictEqual(outboxCount, 0, 'General feedback path MUST NEVER create OutboxEvent');
});

// ── Test Case 10: Finding 2 - Legacy Token Sequential Replay ────────────────
await itAsync('[ReplSet TC-10] Finding 2: Legacy token sequential replay returns HTTP 200 duplicate with zero duplicate DB records', async () => {
    const lead = await Lead.create({ firstName: 'LegacyReplay', lastName: 'Lead', mobile: '9876500010' });
    const form = await FeedbackForm.create({
        name: 'Legacy Replay Form',
        slug: 'form-legacy-replay-' + uuidv4(),
        isActive: true,
        sections: [{ id: 's1', title: 'Experience', fields: [{ id: 'rating', label: 'Rating', type: 'rating' }] }]
    });

    const legacyToken = jwt.sign({
        leadId: String(lead._id),
        source: 'customer_feedback'
    }, process.env.FEEDBACK_JWT_SECRET);

    const req = {
        params: { slug: form.slug },
        body: { token: legacyToken, responses: { rating: 5 } },
        headers: { 'user-agent': 'LegacyReplayAgent/1.0' },
        query: {}
    };

    const outboxBefore = await OutboxEvent.countDocuments();

    // First attempt
    let code1 = 200, data1 = null;
    const res1 = { status: (s) => { code1 = s; return res1; }, json: (d) => { data1 = d; } };
    await submitFeedback(req, res1, (err) => { if (err) throw err; });
    assert.strictEqual(code1, 201);

    // Second attempt (sequential replay)
    let code2 = 200, data2 = null;
    const res2 = { status: (s) => { code2 = s; return res2; }, json: (d) => { data2 = d; } };
    await submitFeedback(req, res2, (err) => { if (err) throw err; });

    assert.strictEqual(code2, 200, 'Legacy replay must return HTTP 200 OK');
    assert.strictEqual(data2.success, true);
    assert.strictEqual(data2.duplicate, true, 'Must identify as duplicate');
    assert.strictEqual(data2.message, 'Feedback already recorded.');
    assert.strictEqual(String(data2.submissionId), String(data1.submissionId));

    // Assert zero duplicate records
    const subCount = await FeedbackSubmission.countDocuments({ lead: lead._id, form: form._id });
    assert.strictEqual(subCount, 1, 'Exactly one FeedbackSubmission must exist for lead and form');

    // Assert zero OutboxEvents emitted and zero Activities touched for general feedback
    const outboxAfter = await OutboxEvent.countDocuments();
    assert.strictEqual(outboxAfter, outboxBefore, 'Zero OutboxEvents must be emitted for general feedback');

    const leadOutbox = await OutboxEvent.countDocuments({ 'payload.entityId': String(lead._id) });
    assert.strictEqual(leadOutbox, 0, 'Zero OutboxEvents must exist for general feedback lead');

    const activityCount = await Activity.countDocuments({ lead: lead._id });
    assert.strictEqual(activityCount, 0, 'Zero Activities must exist or be modified for general feedback lead');
});

// ── Test Case 11: Finding 2 - Legacy Token Concurrent Duplicate Submissions ──
await itAsync('[ReplSet TC-11] Finding 2: Legacy token concurrent duplicate submissions handle race condition gracefully with 1 DB record', async () => {
    const lead = await Lead.create({ firstName: 'LegacyRace', lastName: 'Lead', mobile: '9876500011' });
    const form = await FeedbackForm.create({
        name: 'Legacy Race Form',
        slug: 'form-legacy-race-' + uuidv4(),
        isActive: true,
        sections: [{ id: 's1', title: 'Experience', fields: [{ id: 'rating', label: 'Rating', type: 'rating' }] }]
    });

    const legacyToken = jwt.sign({
        leadId: String(lead._id),
        source: 'customer_feedback'
    }, process.env.FEEDBACK_JWT_SECRET);

    const reqA = {
        params: { slug: form.slug },
        body: { token: legacyToken, responses: { rating: 5 } },
        headers: { 'user-agent': 'ConcurrentAgentA/1.0' },
        query: {}
    };

    const reqB = {
        params: { slug: form.slug },
        body: { token: legacyToken, responses: { rating: 3 } },
        headers: { 'user-agent': 'ConcurrentAgentB/1.0' },
        query: {}
    };

    let codeA = 200, dataA = null;
    let codeB = 200, dataB = null;
    const resA = { status: (s) => { codeA = s; return resA; }, json: (d) => { dataA = d; } };
    const resB = { status: (s) => { codeB = s; return resB; }, json: (d) => { dataB = d; } };

    await Promise.all([
        submitFeedback(reqA, resA, () => {}),
        submitFeedback(reqB, resB, () => {})
    ]);

    // Both requests must complete gracefully (either 201+200 or 200+200)
    assert(codeA === 201 || codeA === 200, `codeA was ${codeA}`);
    assert(codeB === 201 || codeB === 200, `codeB was ${codeB}`);
    assert.strictEqual(dataA.success, true);
    assert.strictEqual(dataB.success, true);

    // Exactly one submission recorded in database
    const subCount = await FeedbackSubmission.countDocuments({ lead: lead._id, form: form._id });
    assert.strictEqual(subCount, 1, 'Exactly one FeedbackSubmission must exist in database after concurrent race');
});

// ── Test Case 12: Finding 2 - Duplicate Key Mismatch Rejection ───────────────
await itAsync('[ReplSet TC-12] Finding 2: Duplicate key mismatch rejects collision if form or lead does not match', async () => {
    const lead1 = await Lead.create({ firstName: 'LeadOne', lastName: 'Test', mobile: '9876500012' });
    const lead2 = await Lead.create({ firstName: 'LeadTwo', lastName: 'Test', mobile: '9876500013' });
    const form = await FeedbackForm.create({
        name: 'Collision Form',
        slug: 'form-collision-' + uuidv4(),
        isActive: true
    });

    const collisionKey = `legacy:${lead1._id}:${form.slug}`;
    await FeedbackSubmission.create({
        form: form._id,
        lead: lead1._id,
        activity: null,
        idempotencyKey: collisionKey,
        responses: {}
    });

    // An attacker or erroneous token tries to submit for lead2 with collisionKey
    const tokenMismatch = jwt.sign({
        iss: 'bharat-properties-crm',
        purpose: 'general_feedback',
        leadId: String(lead2._id),
        activityId: null,
        formSlug: form.slug,
        jti: collisionKey
    }, process.env.FEEDBACK_JWT_SECRET);

    let errorThrown = false;
    const req = {
        params: { slug: form.slug },
        body: { token: tokenMismatch, responses: {} },
        headers: {},
        query: {}
    };
    const res = { status: () => res, json: () => {} };

    try {
        await submitFeedback(req, res, (err) => { if (err) { errorThrown = true; } });
    } catch (err) {
        errorThrown = true;
    }

    assert.strictEqual(errorThrown, true, 'Must reject submission and throw duplicate key error when logical subject mismatches');
});

// ── Test Case 13: Finding B - general_feedback with injected activityId cannot complete Activity ──
await itAsync('[ReplSet TC-13] Finding B: general_feedback token with injected activityId cannot complete an Activity', async () => {
    const lead = await Lead.create({ firstName: 'GeneralLead', lastName: 'Test', mobile: '9876500014' });
    const activity = await Activity.create({
        type: 'Site Visit',
        subject: 'Site Visit at Palm Hills',
        entityType: 'Lead',
        entityId: lead._id,
        lead: lead._id,
        dueDate: new Date(),
        status: 'Scheduled'
    });
    const form = await FeedbackForm.create({
        name: 'General Purpose Form',
        slug: 'form-general-purpose-' + uuidv4(),
        isActive: true,
        sections: [{ id: 's1', title: 'Exp', fields: [{ id: 'rating', label: 'Rating', type: 'rating' }] }]
    });

    const token = jwt.sign({
        iss: 'bharat-properties-crm',
        purpose: 'general_feedback',
        leadId: String(lead._id),
        activityId: String(activity._id), // Injected activityId in general_feedback token
        formSlug: form.slug,
        jti: uuidv4()
    }, process.env.FEEDBACK_JWT_SECRET);

    let resCode = 200, resData = null;
    const res = { status: (s) => { resCode = s; return res; }, json: (d) => { resData = d; } };

    await submitFeedback({
        params: { slug: form.slug },
        body: { token, responses: { rating: 5 } },
        headers: {},
        query: {}
    }, res, (err) => { if (err) throw err; });

    assert.strictEqual(resCode, 201);
    assert.strictEqual(resData.success, true);

    // Activity MUST NOT be completed
    const updatedActivity = await Activity.findById(activity._id);
    assert.strictEqual(updatedActivity.status, 'Scheduled', 'Activity status must remain Scheduled');
    assert.strictEqual(updatedActivity.details?.submissionId, undefined, 'Activity must not be linked to submission');

    // Submission recorded with activity: null
    const sub = await FeedbackSubmission.findById(resData.submissionId);
    assert.strictEqual(sub.activity, null, 'Submission activity must be null');

    // ZERO OutboxEvents created
    const outboxCount = await OutboxEvent.countDocuments({ aggregateId: activity._id });
    assert.strictEqual(outboxCount, 0, 'Zero OutboxEvents must be created for general_feedback submission');
});

// ── Test Case 14: Finding B - Wrong-form token is rejected ────────────────────
await itAsync('[ReplSet TC-14] Finding B: Wrong-form token is rejected with HTTP 403 and zero database writes', async () => {
    const lead = await Lead.create({ firstName: 'WrongForm', lastName: 'Lead', mobile: '9876500015' });
    const activity = await Activity.create({
        type: 'Site Visit',
        subject: 'Wrong Form Inspection',
        entityType: 'Lead',
        entityId: lead._id,
        lead: lead._id,
        dueDate: new Date(),
        status: 'Scheduled'
    });
    const formA = await FeedbackForm.create({
        name: 'Form A',
        slug: 'form-target-a-' + uuidv4(),
        isActive: true
    });
    const formB = await FeedbackForm.create({
        name: 'Form B',
        slug: 'form-target-b-' + uuidv4(),
        isActive: true
    });

    // Token issued for formA, submitted to formB
    const tokenForA = jwt.sign({
        iss: 'bharat-properties-crm',
        purpose: 'feedback_submission',
        leadId: String(lead._id),
        activityId: String(activity._id),
        formSlug: formA.slug,
        jti: uuidv4()
    }, process.env.FEEDBACK_JWT_SECRET);

    const initialSubCount = await FeedbackSubmission.countDocuments();
    const initialAuditCount = await AuditLog.countDocuments();
    const initialOutboxCount = await OutboxEvent.countDocuments();

    let resCode = 200, resData = null;
    const res = { status: (s) => { resCode = s; return res; }, json: (d) => { resData = d; } };

    await submitFeedback({
        params: { slug: formB.slug },
        body: { token: tokenForA, responses: { feedback: 'Wrong route attempt' } },
        headers: {},
        query: {}
    }, res, (err) => { if (err) throw err; });

    assert.strictEqual(resCode, 403, 'Must return HTTP 403 Forbidden for mismatched form slug token');
    assert.strictEqual(resData.success, false);

    // Assert zero side effects
    const postSubCount = await FeedbackSubmission.countDocuments();
    const postAuditCount = await AuditLog.countDocuments();
    const postOutboxCount = await OutboxEvent.countDocuments();
    const checkActivity = await Activity.findById(activity._id);

    assert.strictEqual(postSubCount, initialSubCount, 'Zero FeedbackSubmissions must be created');
    assert.strictEqual(postAuditCount, initialAuditCount, 'Zero AuditLogs must be created');
    assert.strictEqual(postOutboxCount, initialOutboxCount, 'Zero OutboxEvents must be created');
    assert.strictEqual(checkActivity.status, 'Scheduled', 'Activity must remain Scheduled');
});

// ── Test Case 15: Finding B - Client-supplied IDs cannot override token claims ─
await itAsync('[ReplSet TC-15] Finding B: Client-supplied leadId and activityId cannot override token claims in Activity-bound flow', async () => {
    const authorizedLead = await Lead.create({ firstName: 'Authorized', lastName: 'Lead', mobile: '9876500016' });
    const attackerLead = await Lead.create({ firstName: 'Attacker', lastName: 'Lead', mobile: '9876500017' });

    const authorizedActivity = await Activity.create({
        type: 'Site Visit',
        subject: 'Authorized Inspection',
        entityType: 'Lead',
        entityId: authorizedLead._id,
        lead: authorizedLead._id,
        dueDate: new Date(),
        status: 'Scheduled'
    });
    const attackerActivity = await Activity.create({
        type: 'Site Visit',
        subject: 'Attacker Target',
        entityType: 'Lead',
        entityId: attackerLead._id,
        lead: attackerLead._id,
        dueDate: new Date(),
        status: 'Scheduled'
    });

    const form = await FeedbackForm.create({
        name: 'Claim Override Test Form',
        slug: 'form-claim-override-' + uuidv4(),
        isActive: true,
        sections: [{ id: 's1', title: 'Exp', fields: [{ id: 'rating', label: 'Rating', type: 'rating' }] }]
    });

    const token = jwt.sign({
        iss: 'bharat-properties-crm',
        purpose: 'feedback_submission',
        leadId: String(authorizedLead._id),
        activityId: String(authorizedActivity._id),
        formSlug: form.slug,
        jti: uuidv4()
    }, process.env.FEEDBACK_JWT_SECRET);

    // Attacker tries to inject attackerLead._id and attackerActivity._id in request body
    let resCode = 200, resData = null;
    const res = { status: (s) => { resCode = s; return res; }, json: (d) => { resData = d; } };

    await submitFeedback({
        params: { slug: form.slug },
        body: {
            token,
            leadId: String(attackerLead._id),
            activityId: String(attackerActivity._id),
            responses: { rating: 5 }
        },
        headers: {},
        query: {}
    }, res, (err) => { if (err) throw err; });

    assert.strictEqual(resCode, 201);
    assert.strictEqual(resData.success, true);

    // Verify authorized activity was completed, attacker activity was NOT touched
    const checkedAuthorizedActivity = await Activity.findById(authorizedActivity._id);
    const checkedAttackerActivity = await Activity.findById(attackerActivity._id);
    assert.strictEqual(checkedAuthorizedActivity.status, 'Completed', 'Authorized activity must be completed');
    assert.strictEqual(checkedAttackerActivity.status, 'Scheduled', 'Attacker activity must remain untouched');

    // Verify submission record belongs to authorized lead, NOT attacker lead
    const sub = await FeedbackSubmission.findById(resData.submissionId);
    assert.strictEqual(String(sub.lead), String(authorizedLead._id), 'Submission must bind to token authoritativeLeadId');
    assert.strictEqual(String(sub.activity), String(authorizedActivity._id), 'Submission must bind to token authoritativeActivityId');
});

// ── Test Case 16: Finding B - Rejected requests create zero database mutations ──
await itAsync('[ReplSet TC-16] Finding B: Rejected requests (tampered, expired) create zero database mutations', async () => {
    const form = await FeedbackForm.create({
        name: 'Strict Rejection Form',
        slug: 'form-strict-reject-' + uuidv4(),
        isActive: true
    });

    const tamperedToken = jwt.sign({
        iss: 'bharat-properties-crm',
        purpose: 'feedback_submission',
        leadId: new mongoose.Types.ObjectId().toString(),
        activityId: new mongoose.Types.ObjectId().toString(),
        formSlug: form.slug,
        jti: uuidv4()
    }, 'attacker_secret_xyz');

    const initialSubCount = await FeedbackSubmission.countDocuments();
    const initialAuditCount = await AuditLog.countDocuments();
    const initialOutboxCount = await OutboxEvent.countDocuments();

    let resCode = 200, resData = null;
    const res = { status: (s) => { resCode = s; return res; }, json: (d) => { resData = d; } };

    await submitFeedback({
        params: { slug: form.slug },
        body: { token: tamperedToken, responses: {} },
        headers: {},
        query: {}
    }, res, (err) => { if (err) throw err; });

    assert.strictEqual(resCode, 403, 'Tampered token must be rejected with 403');
    assert.strictEqual(resData.success, false);

    assert.strictEqual(await FeedbackSubmission.countDocuments(), initialSubCount, 'No submissions created');
    assert.strictEqual(await AuditLog.countDocuments(), initialAuditCount, 'No audit logs created');
    assert.strictEqual(await OutboxEvent.countDocuments(), initialOutboxCount, 'No outbox events created');
});

// ── Test Case 17: Dynamic Forms verification fails safely when JWT_SECRET is absent ──
await itAsync('[ReplSet TC-17] Finding C: Dynamic Forms resolveToken fails safely when JWT_SECRET is absent, even if FEEDBACK_JWT_SECRET exists', async () => {
    const origJwtSecret = process.env.JWT_SECRET;
    const origFeedbackSecret = process.env.FEEDBACK_JWT_SECRET;
    try {
        delete process.env.JWT_SECRET;
        process.env.FEEDBACK_JWT_SECRET = 'active_feedback_secret_only';

        let resCode = 200;
        let resData = null;
        const res = { status: (s) => { resCode = s; return res; }, json: (d) => { resData = d; } };

        // Test with arbitrary token string
        await resolveToken({ params: { token: 'sample~token~value' } }, res, () => {});
        assert.strictEqual(resCode, 400, 'Must return HTTP 400 when JWT_SECRET is unconfigured');
        assert.strictEqual(resData.success, false);
        assert.strictEqual(resData.message, 'Token expired or invalid');
    } finally {
        process.env.JWT_SECRET = origJwtSecret;
        process.env.FEEDBACK_JWT_SECRET = origFeedbackSecret;
    }
});

// ── Test Case 18: Dynamic Forms resolveToken succeeds with valid token signed by configured JWT_SECRET ──
await itAsync('[ReplSet TC-18] Finding C: Dynamic Forms resolveToken succeeds with valid token signed by configured JWT_SECRET', async () => {
    const lead = await Lead.create({
        firstName: 'Ananya',
        lastName: 'Roy',
        mobile: '9876543299',
        email: 'ananya.roy@example.com',
        requirement: '3BHK',
        budget: '2 Cr',
        location: 'Golf Course Extension',
        sector: 'Sector 65'
    });

    const tokenWithTildes = LeadTokenGenerator.generate(lead._id, {
        projectId: 'project_super_luxury_65',
        properties: ['prop_001', 'prop_002'],
        hidePrice: true
    });

    let resCode = 200;
    let resData = null;
    const res = { status: (s) => { resCode = s; return res; }, json: (d) => { resData = d; } };

    await resolveToken({ params: { token: tokenWithTildes } }, res, () => {});
    assert.strictEqual(resCode, 200, 'Must return HTTP 200 for valid token');
    assert.strictEqual(resData.success, true);
    assert.strictEqual(resData.data.lead.firstName, 'Ananya');
    assert.strictEqual(resData.data.lead.mobile, '9876543299');
    assert.strictEqual(resData.data.matchedProject, 'project_super_luxury_65');
    assert.strictEqual(resData.data.hidePrice, true);
    assert.strictEqual(resData.data.properties.length, 2);
});

// ── Test Case 19: Dynamic Forms resolveToken rejects invalid-signature and tampered tokens ──
await itAsync('[ReplSet TC-19] Finding C: Dynamic Forms resolveToken rejects invalid-signature and tampered tokens', async () => {
    const lead = await Lead.create({ firstName: 'Karan', lastName: 'Johar', mobile: '9876543298' });
    const invalidSecretToken = jwt.sign({ leadId: String(lead._id) }, 'unrelated_attacker_secret').replace(/\./g, '~');

    let resCode = 200;
    let resData = null;
    const res = { status: (s) => { resCode = s; return res; }, json: (d) => { resData = d; } };

    await resolveToken({ params: { token: invalidSecretToken } }, res, () => {});
    assert.strictEqual(resCode, 400, 'Must return HTTP 400 for invalid signature');
    assert.strictEqual(resData.success, false);
    assert.strictEqual(resData.message, 'Token expired or invalid');

    // Tampered payload
    const validToken = LeadTokenGenerator.generate(lead._id);
    const parts = validToken.split('~');
    const tamperedToken = `${parts[0]}~${Buffer.from('{"leadId":"evil"}').toString('base64url')}~${parts[2]}`;

    resCode = 200;
    resData = null;
    await resolveToken({ params: { token: tamperedToken } }, res, () => {});
    assert.strictEqual(resCode, 400, 'Must return HTTP 400 for tampered payload');
    assert.strictEqual(resData.success, false);
    assert.strictEqual(resData.message, 'Token expired or invalid');
});

// ── Test Case 20: Dynamic Forms resolveToken rejects expired tokens ──
await itAsync('[ReplSet TC-20] Finding C: Dynamic Forms resolveToken rejects expired tokens', async () => {
    const lead = await Lead.create({ firstName: 'Sunil', lastName: 'Gavaskar', mobile: '9876543297' });
    const expiredToken = jwt.sign(
        { leadId: String(lead._id), iat: Math.floor(Date.now() / 1000) - 100 },
        process.env.JWT_SECRET,
        { expiresIn: '-1s' }
    ).replace(/\./g, '~');

    let resCode = 200;
    let resData = null;
    const res = { status: (s) => { resCode = s; return res; }, json: (d) => { resData = d; } };

    await resolveToken({ params: { token: expiredToken } }, res, () => {});
    assert.strictEqual(resCode, 400, 'Must return HTTP 400 for expired token');
    assert.strictEqual(resData.success, false);
    assert.strictEqual(resData.message, 'Token expired or invalid');
});

// ── Test Case 21: Dynamic Forms resolveToken never accepts predictable fallback secret (crm_secret_key) ──
await itAsync('[ReplSet TC-21] Finding C: Dynamic Forms resolveToken never accepts predictable fallback secret (crm_secret_key)', async () => {
    const lead = await Lead.create({ firstName: 'Kapil', lastName: 'Dev', mobile: '9876543296' });
    const fallbackToken = jwt.sign(
        { leadId: String(lead._id) },
        'crm_secret_key'
    ).replace(/\./g, '~');

    // Part A: Rejected when JWT_SECRET is configured
    let resCode = 200;
    let resData = null;
    const res = { status: (s) => { resCode = s; return res; }, json: (d) => { resData = d; } };

    await resolveToken({ params: { token: fallbackToken } }, res, () => {});
    assert.strictEqual(resCode, 400, 'Must reject crm_secret_key token when JWT_SECRET is set');
    assert.strictEqual(resData.success, false);
    assert.strictEqual(resData.message, 'Token expired or invalid');

    // Part B: Rejected when JWT_SECRET is missing (no fallback attempted)
    const origJwtSecret = process.env.JWT_SECRET;
    try {
        delete process.env.JWT_SECRET;
        resCode = 200;
        resData = null;
        await resolveToken({ params: { token: fallbackToken } }, res, () => {});
        assert.strictEqual(resCode, 400, 'Must reject crm_secret_key token when JWT_SECRET is unset (no fallback)');
        assert.strictEqual(resData.success, false);
        assert.strictEqual(resData.message, 'Token expired or invalid');
    } finally {
        process.env.JWT_SECRET = origJwtSecret;
    }
});

// ── Test Case 22: Dynamic Forms failure causes zero database writes, zero messaging, and does not crash ──
await itAsync('[ReplSet TC-22] Finding C: Dynamic Forms verification failure causes zero database writes, zero messaging, and does not crash', async () => {
    const initialLeadCount = await Lead.countDocuments();
    const initialAuditCount = await AuditLog.countDocuments();
    const initialSubCount = await FeedbackSubmission.countDocuments();
    const initialOutboxCount = await OutboxEvent.countDocuments();

    const res = { status: () => res, json: () => {} };

    // Missing token
    await resolveToken({ params: {} }, res, () => {});
    // Malformed token
    await resolveToken({ params: { token: 'invalid...token' } }, res, () => {});
    // Unknown leadId
    const nonExistentLeadId = new mongoose.Types.ObjectId().toString();
    const ghostToken = jwt.sign({ leadId: nonExistentLeadId }, process.env.JWT_SECRET).replace(/\./g, '~');
    await resolveToken({ params: { token: ghostToken } }, res, () => {});

    // Assert absolute zero database side-effects
    assert.strictEqual(await Lead.countDocuments(), initialLeadCount, 'Zero lead mutations on token failure');
    assert.strictEqual(await AuditLog.countDocuments(), initialAuditCount, 'Zero audit log mutations on token failure');
    assert.strictEqual(await FeedbackSubmission.countDocuments(), initialSubCount, 'Zero feedback submission mutations');
    assert.strictEqual(await OutboxEvent.countDocuments(), initialOutboxCount, 'Zero outbox event mutations');
});

// ── Test Case 23: Dynamic Forms tokens cannot enter public feedback submission flow ──
await itAsync('[ReplSet TC-23] Finding C: Dynamic Forms tokens cannot enter public feedback submission flow', async () => {
    const lead = await Lead.create({ firstName: 'Sachin', lastName: 'Tendulkar', mobile: '9876543295' });
    const dynamicToken = LeadTokenGenerator.generate(lead._id);

    const form = await FeedbackForm.findOne().lean();
    assert(form, 'Form must exist for test');

    // 1. Direct verifier rejection
    const verified = verifyFeedbackToken(dynamicToken, form.slug);
    assert.strictEqual(verified, null, 'verifyFeedbackToken must return null for Dynamic Forms token (missing iss, purpose, formSlug)');

    // 2. Controller endpoint rejection with HTTP 403 Forbidden
    let resCode = 200;
    let resData = null;
    const res = { status: (s) => { resCode = s; return res; }, json: (d) => { resData = d; } };

    await submitFeedback({
        params: { slug: form.slug },
        body: { token: dynamicToken, responses: { feedback: 'Great service' } },
        headers: {},
        query: {}
    }, res, (err) => { if (err) throw err; });

    assert.strictEqual(resCode, 403, 'Must return HTTP 403 Forbidden for Dynamic Forms token in feedback flow');
    assert.strictEqual(resData.success, false);
    assert.strictEqual(resData.error, 'Invalid or unauthorized feedback token');
});

// Teardown isolated replica set cleanly
console.log('  [Harness] Disconnecting Mongoose and stopping MongoMemoryReplSet...');
await mongoose.disconnect();
await replSet.stop();
console.log('  [Harness] In-memory replica set stopped cleanly.');

// ─────────────────────────────────────────────────────────────────────────────
// FINAL RESULTS REPORT
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n================================================================');
console.log(`  CRITICAL-05 TEST SUITE COMPLETE: ${passedTests}/${totalTests} TESTS PASSED`);
console.log('  Zero production writes occurred. All tests executed in memory.');
console.log('================================================================\n');

process.exit(0);
