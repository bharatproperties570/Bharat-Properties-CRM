import test from 'node:test';
import assert from 'node:assert/strict';
import {
    extractProviderPostId,
    extractActivityPostId,
    hasVerifiedMetricsResponse,
    getQueuedContentStatus
} from '../utils/marketingOsTruth.js';

test('Marketing OS truthfulness helpers', async (t) => {
    await t.test('extracts actual provider post IDs only', () => {
        assert.equal(extractProviderPostId({ postId: 'fb-123' }), 'fb-123');
        assert.equal(extractProviderPostId({ data: { name: 'accounts/1/posts/2' } }), 'accounts/1/posts/2');
        assert.equal(extractProviderPostId({ jobId: 'bullmq-123' }), null);
        assert.equal(extractProviderPostId({}), null);
    });

    await t.test('does not treat queue IDs as activity remote post IDs', () => {
        assert.equal(extractActivityPostId({ jobId: 'job-1' }), null);
        assert.equal(extractActivityPostId({ postId: 'provider-1', jobId: 'job-1' }), 'provider-1');
    });

    await t.test('accepts only successful non-quota provider metrics', () => {
        assert.equal(hasVerifiedMetricsResponse({ success: true, metrics: { reach: 0 } }), true);
        assert.equal(hasVerifiedMetricsResponse({ success: true, pendingQuota: true, metrics: { reach: 0 } }), false);
        assert.equal(hasVerifiedMetricsResponse({ success: false, metrics: { reach: 10 } }), false);
        assert.equal(hasVerifiedMetricsResponse({ success: true, metrics: null }), false);
        assert.equal(hasVerifiedMetricsResponse({ success: true, metrics: {} }), false);
    });

    await t.test('queued content is never represented as published', () => {
        assert.equal(getQueuedContentStatus([{ platform: 'facebook', jobId: '1' }]), 'scheduled');
        assert.equal(getQueuedContentStatus([]), 'draft');
        assert.equal(getQueuedContentStatus([{ platform: 'facebook' }]), 'draft');
    });
});
