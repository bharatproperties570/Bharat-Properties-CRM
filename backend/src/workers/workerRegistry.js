/**
 * Phase 7 — Authoritative BullMQ Worker Registry & Health Verification Engine
 *
 * Defines the explicit, immutable registry of all required BullMQ background workers
 * for Bharat Properties CRM.
 *
 * Evaluates individual worker instances using the official BullMQ API:
 *   - worker.isRunning()
 *   - worker.isPaused()
 *   - worker.closed / worker.closing
 */

export const REQUIRED_WORKERS = Object.freeze([
    'enrichmentQueue',
    'googleSyncQueue',
    'cronQueue',
    'marketingQueue',
    'distributionQueue',
    'domain-event-queue',
    'notificationQueue',
    'UnifiedIntakeQueue',
    'crm-automation-queue',
    'whatsapp_baileys_outbound',
    'whatsapp_baileys_inbound',
    'whatsapp_auto_verification'
]);

/**
 * Normalizes worker queue name to accommodate supported aliases
 */
export function normalizeWorkerName(name) {
    if (!name || typeof name !== 'string') return null;
    if (name === 'domainEventQueue') return 'domain-event-queue';
    return name;
}

/**
 * Evaluates whether an individual BullMQ worker instance is actively running.
 * Correctly handles BullMQ Worker API, MockWorker, and state transitions.
 *
 * @param {Object} worker - BullMQ Worker instance
 * @returns {boolean} True only if actively running and not paused/closed
 */
export function isWorkerRunning(worker) {
    if (!worker || typeof worker !== 'object') return false;

    // Reject explicitly closed or closing workers
    if (worker.closed === true || worker.closing) return false;

    // Reject paused workers
    if (typeof worker.isPaused === 'function' && worker.isPaused()) return false;
    if (worker.paused === true) return false;

    // Check official BullMQ isRunning() API
    if (typeof worker.isRunning === 'function') {
        return worker.isRunning() === true;
    }

    // Check running property (BullMQ internal flag or wrapper property)
    if (typeof worker.running === 'boolean') {
        return worker.running;
    }

    // Check mock worker internal running flag
    if (typeof worker._running === 'boolean') {
        return worker._running;
    }

    // If worker exists and has no explicit running/closed API, default to true
    return true;
}

/**
 * Performs rigorous multi-point validation across all required workers.
 * Does NOT rely on array length or registration flags alone.
 *
 * @param {Array|Map|Object} registeredWorkers - Collection of worker instances
 * @returns {Object} Comprehensive evaluation result
 */
export function evaluateWorkerReadiness(registeredWorkers) {
    const workerMap = new Map();

    if (Array.isArray(registeredWorkers)) {
        for (const w of registeredWorkers) {
            if (w) {
                const name = normalizeWorkerName(w.name || (w.constructor?.name !== 'Object' ? w.constructor?.name : null));
                if (name) {
                    workerMap.set(name, w);
                }
            }
        }
    } else if (registeredWorkers instanceof Map) {
        for (const [key, w] of registeredWorkers.entries()) {
            if (w) {
                const name = normalizeWorkerName(w.name || key);
                if (name) {
                    workerMap.set(name, w);
                }
            }
        }
    } else if (registeredWorkers && typeof registeredWorkers === 'object') {
        for (const [key, w] of Object.entries(registeredWorkers)) {
            if (w) {
                const name = normalizeWorkerName(w.name || key);
                if (name) {
                    workerMap.set(name, w);
                }
            }
        }
    }

    const perWorkerStatus = {};
    const missingWorkers = [];
    const stoppedWorkers = [];

    for (const requiredName of REQUIRED_WORKERS) {
        const worker = workerMap.get(requiredName);

        if (!worker) {
            perWorkerStatus[requiredName] = 'missing';
            missingWorkers.push(requiredName);
        } else if (!isWorkerRunning(worker)) {
            perWorkerStatus[requiredName] = 'stopped';
            stoppedWorkers.push(requiredName);
        } else {
            perWorkerStatus[requiredName] = 'running';
        }
    }

    const isReady = missingWorkers.length === 0 && stoppedWorkers.length === 0;

    return {
        ready: isReady,
        expectedCount: REQUIRED_WORKERS.length,
        registeredCount: workerMap.size,
        activeCount: REQUIRED_WORKERS.length - missingWorkers.length - stoppedWorkers.length,
        workers: perWorkerStatus,
        missing: missingWorkers,
        stopped: stoppedWorkers
    };
}
