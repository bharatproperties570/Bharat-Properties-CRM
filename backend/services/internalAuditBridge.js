import { fileURLToPath } from 'node:url';

/**
 * internalAuditBridge.js
 * 
 * Secure internal bridge between Document model and DocumentAuditService.
 * Genuinely private capability boundary:
 * - Does NOT export any Symbol, capability token, or capability-granting helper.
 * - Uses native V8 call-site inspection (Error.prepareStackTrace) to authenticate caller files.
 * - Only backend/models/Document.js may register the internal audit executor (single registration only).
 * - Only backend/services/DocumentAuditService.js may invoke the privileged audit write executor.
 * - Any unauthorized external or generic caller attempting to invoke this bridge is rejected immediately.
 */

let internalAuditExecutor = null;
let isExecutorRegistered = false;

function getCallerFile() {
    const orig = Error.prepareStackTrace;
    try {
        Error.prepareStackTrace = (_, stack) => stack;
        const err = new Error();
        const currentFile = err.stack[0]?.getFileName();
        for (let i = 1; i < err.stack.length; i++) {
            const fileName = err.stack[i]?.getFileName();
            if (fileName && fileName !== currentFile) {
                return fileName.startsWith('file://') ? fileURLToPath(fileName) : fileName;
            }
        }
        return null;
    } catch (_) {
        return null;
    } finally {
        Error.prepareStackTrace = orig;
    }
}

/**
 * Registers the privileged audit write executor from Document.js.
 * Strictly verifies the registration is initiated from backend/models/Document.js.
 * 
 * @param {Function} executor - Privileged mutation executor
 */
export function registerAuditExecutor(executor) {
    const caller = getCallerFile();
    if (!caller || (!caller.endsWith('/models/Document.js') && !caller.endsWith('\\models\\Document.js'))) {
        throw new Error('UNAUTHORIZED_REGISTRATION: Only backend/models/Document.js is permitted to register the audit executor.');
    }
    if (isExecutorRegistered || internalAuditExecutor) {
        throw new Error('ILLEGAL_REBINDING: Document audit executor is already registered and cannot be rebound.');
    }
    if (typeof executor !== 'function') {
        throw new Error('INVALID_EXECUTOR: Executor must be a function.');
    }
    internalAuditExecutor = executor;
    isExecutorRegistered = true;
}

/**
 * Executes a privileged verification audit mutation on a Document.
 * Strictly verifies that the caller is backend/services/DocumentAuditService.js.
 * 
 * @param {string|mongoose.Types.ObjectId} docId
 * @param {Object} updateOps
 * @returns {Promise<any>}
 */
export async function executePrivilegedAuditWrite(docId, updateOps) {
    const caller = getCallerFile();
    if (!caller || (!caller.endsWith('/services/DocumentAuditService.js') && !caller.endsWith('\\services\\DocumentAuditService.js'))) {
        throw new Error('UNAUTHORIZED_BRIDGE_CALLER: Privileged audit writes can only be invoked by DocumentAuditService.');
    }
    if (!internalAuditExecutor) {
        throw new Error('AUDIT_BRIDGE_UNAVAILABLE: Document audit executor has not been registered.');
    }
    return internalAuditExecutor(docId, updateOps);
}
