import { UnrecoverableError } from 'bullmq';

export const isUnrecoverableJobError = (err) => {
    return err instanceof UnrecoverableError || err?.name === 'UnrecoverableError';
};

export const classifyError = (err) => {
    if (!err) {
        return { type: 'UNKNOWN', retryable: true, code: 'UNKNOWN_ERROR' };
    }

    if (isUnrecoverableJobError(err)) {
        return { type: 'UNRECOVERABLE_ERROR', retryable: false, code: err.code || 'UNRECOVERABLE' };
    }

    const message = err.message || '';
    const status = err.status || err.statusCode || err.response?.status;
    const name = err.name || '';

    // HTTP specific permanent errors (400, 401, 403, 404)
    if (status >= 400 && status < 500 && status !== 429) {
        return { type: 'HTTP_CLIENT_ERROR', retryable: false, code: status.toString() };
    }

    // HTTP retryable errors (429, 5xx)
    if (status === 429 || (status >= 500 && status < 600)) {
        return { type: 'HTTP_SERVER_ERROR', retryable: true, code: status.toString() };
    }

    // Network & Timeout errors
    if (['ECONNRESET', 'ENOTFOUND', 'ESOCKETTIMEDOUT', 'ETIMEDOUT', 'ECONNREFUSED', 'EHOSTUNREACH', 'EPIPE'].includes(err.code)) {
        return { type: 'NETWORK_ERROR', retryable: true, code: err.code };
    }

    // Transient MongoDB/Mongoose Errors
    if (name === 'MongoNetworkError' || name === 'MongoTimeoutError' || message.includes('ECONNREFUSED') || message.includes('connection error')) {
        return { type: 'DATABASE_ERROR', retryable: true, code: err.code || 'DB_NETWORK' };
    }
    
    // Mongoose VersionError (optimistic concurrency)
    if (name === 'VersionError' || (name === 'MongoServerError' && err.code === 11000)) {
        return { type: 'CONCURRENCY_ERROR', retryable: true, code: err.code ? err.code.toString() : 'VERSION_ERROR' };
    }

    // Mongoose Validation Error (permanent)
    if (name === 'ValidationError' || name === 'CastError' || name === 'StrictPopulateError') {
        return { type: 'VALIDATION_ERROR', retryable: false, code: name };
    }

    // Missing required invariant entity (Permanent 404-like)
    // Sometimes custom code throws Error('Lead not found')
    if (message.includes('not found') && message.match(/lead|contact|deal|user|activity|project/i)) {
        // Assume transient race condition unless specifically thrown as UnrecoverableError elsewhere,
        // but the prompt says "missing required invariant entity where retry cannot fix it"
        // Wait, the prompt says "race-condition missing entity where retry can succeed" should be RETRYABLE.
        // So we default to retryable for "not found" unless we know it's a permanent 404 (caught above).
        return { type: 'ENTITY_NOT_FOUND', retryable: true, code: 'NOT_FOUND' };
    }

    // Default: Unknown errors are retryable
    return { type: 'UNKNOWN_ERROR', retryable: true, code: err.code || 'UNKNOWN' };
};
