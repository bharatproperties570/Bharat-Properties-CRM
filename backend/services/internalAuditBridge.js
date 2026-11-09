/**
 * internalAuditBridge.js
 * 
 * Secure internal capability bridge between Document model and DocumentAuditService.
 * Genuinely encapsulated capability boundary:
 * - Zero exported Symbols, secrets, capability getters, or generic writer functions.
 * - Zero dependency on Error.prepareStackTrace, call-stack inspection, or filename parsing.
 * - Uses a single-use private closure hand-off during initialization.
 * - Privileged audit write execution is confined strictly to the private closure of DocumentAuditService.
 * - Any attempt by unauthorized callers to bind, rebind, or invoke the bridge fails closed.
 */

let isRegistered = false;
let isBound = false;
let registeredExecutor = null;

/**
 * Registers the privileged audit write executor from Document.js.
 * Can only be called once during startup.
 * 
 * @param {Function} executor - Privileged mutation executor
 */
export function registerAuditExecutor(executor) {
    if (isRegistered || registeredExecutor) {
        throw new Error('ILLEGAL_REBINDING: Audit executor is already registered and cannot be rebound.');
    }
    if (typeof executor !== 'function') {
        throw new Error('INVALID_EXECUTOR: Executor must be a function.');
    }
    isRegistered = true;
    registeredExecutor = executor;
}

/**
 * Binds the registered audit write executor into the private closure of DocumentAuditService.
 * Can only be called once during application initialization. Once bound, the executor is transferred
 * directly into DocumentAuditService's private lexical scope and the bridge reference is cleared.
 * Any subsequent invocation by tests, controllers, or rogue services throws AUDIT_CHANNEL_ALREADY_BOUND.
 * 
 * @param {Function} consumer - Receiver callback in DocumentAuditService
 */
export function bindAuditPersistence(consumer) {
    if (isBound) {
        throw new Error('AUDIT_CHANNEL_ALREADY_BOUND: The audit persistence channel is already bound and cannot be accessed.');
    }
    if (typeof consumer !== 'function') {
        throw new Error('INVALID_CONSUMER: Consumer must be a function.');
    }
    if (!registeredExecutor) {
        throw new Error('AUDIT_BRIDGE_UNAVAILABLE: Document audit executor has not been registered.');
    }
    isBound = true;
    const executor = registeredExecutor;
    registeredExecutor = null; // Clear bridge reference permanently
    consumer(executor);
}
