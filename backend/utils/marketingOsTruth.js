/**
 * Pure helpers for truthful Marketing OS provider receipts and telemetry.
 * Queue IDs and local CRM IDs are never provider post IDs.
 */
export const extractProviderPostId = (result = {}) => {
    const value = result.postId || result.id || result.videoId || result.xRestliId || result.data?.name || result.urn;
    return typeof value === 'string' && value.trim() ? value.trim() : null;
};

export const extractActivityPostId = (resultData = {}) => extractProviderPostId(resultData);

export const hasVerifiedMetricsResponse = (result) => Boolean(
    result?.success &&
    !result?.pendingQuota &&
    result.metrics &&
    typeof result.metrics === 'object' &&
    !Array.isArray(result.metrics)
);

export const getQueuedContentStatus = (jobs = []) => (
    Array.isArray(jobs) && jobs.some(job => job?.jobId) ? 'scheduled' : 'draft'
);
