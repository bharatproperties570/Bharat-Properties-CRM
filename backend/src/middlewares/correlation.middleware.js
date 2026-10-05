import { v4 as uuidv4 } from 'uuid';
import { correlationStore } from '../utils/logger.js';

const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Validates an incoming correlation ID.
 * Must be alphanumeric with hyphens/underscores, max 50 chars.
 * Rejects control characters or oversized payloads.
 */
function isValidRequestId(id) {
    if (!id || typeof id !== 'string') return false;
    if (id.length > 50) return false;
    return /^[a-zA-Z0-9\-_]+$/.test(id);
}

export const correlationMiddleware = (req, res, next) => {
    let reqId = req.headers[REQUEST_ID_HEADER];

    // If missing, invalid, or malicious, replace it
    if (!isValidRequestId(reqId)) {
        reqId = uuidv4();
    }

    // Set on response header
    res.setHeader(REQUEST_ID_HEADER, reqId);
    
    // Also attach to req for local synchronous access if needed
    req.reqId = reqId;

    // Run the rest of the request within the AsyncLocalStorage context
    correlationStore.run(reqId, () => {
        next();
    });
};
