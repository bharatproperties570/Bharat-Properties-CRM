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

var _bridgeState;
function _getState() {
    if (!_bridgeState) {
        _bridgeState = {
            isRegistered: false,
            isBound: false,
            registeredExecutor: null,
            pendingConsumer: null
        };
    }
    return _bridgeState;
}

/**
 * Registers the privileged audit write executor from Document.js.
 * Can only be called once during startup.
 * 
 * @param {Function} executor - Privileged mutation executor
 */
export function registerAuditExecutor(executor) {
    const state = _getState();
    if (state.isRegistered || state.registeredExecutor) {
        throw new Error('ILLEGAL_REBINDING: Audit executor is already registered and cannot be rebound.');
    }
    if (typeof executor !== 'function') {
        throw new Error('INVALID_EXECUTOR: Executor must be a function.');
    }
    state.isRegistered = true;
    if (state.pendingConsumer) {
        const consumer = state.pendingConsumer;
        state.pendingConsumer = null;
        consumer(executor);
    } else {
        state.registeredExecutor = executor;
    }
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
    const state = _getState();
    if (state.isBound) {
        throw new Error('AUDIT_CHANNEL_ALREADY_BOUND: The audit persistence channel is already bound and cannot be accessed.');
    }
    if (typeof consumer !== 'function') {
        throw new Error('INVALID_CONSUMER: Consumer must be a function.');
    }
    state.isBound = true;
    if (state.registeredExecutor) {
        const executor = state.registeredExecutor;
        state.registeredExecutor = null; // Clear bridge reference permanently
        consumer(executor);
    } else {
        state.pendingConsumer = consumer;
    }
}

// Eagerly import Document and DocumentAuditService so that registration and binding
// complete synchronously at module evaluation time.
// Any caller importing internalAuditBridge.js will find isBound === true and isRegistered === true,
// preventing any pre-binding hijack or executor replacement.
import '../models/Document.js';
import './DocumentAuditService.js';



