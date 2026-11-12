/**
 * workerIntegration — Imported by server.js to add heartbeat monitoring
 * to all existing BullMQ workers WITHOUT modifying individual worker files.
 */
import { attachHeartbeat } from './workerHeartbeatMixin.js';

/**
 * Attaches heartbeat monitoring to an array of { name, worker, queue } entries.
 * @param {Array<{name: string, worker: import('bullmq').Worker, queue: string}>} workers
 */
export function initWorkerHeartbeats(workers) {
  const handles = [];

  for (const entry of workers) {
    if (!entry.worker) continue;
    try {
      const handle = attachHeartbeat(entry.worker, {
        workerName: entry.name,
        queue: entry.queue || entry.name,
      });
      handles.push({ name: entry.name, handle });
      console.log(`[WorkerIntegration] Heartbeat attached: ${entry.name}`);
    } catch (err) {
      console.error(`[WorkerIntegration] Failed to attach heartbeat to ${entry.name}:`, err.message);
    }
  }

  return handles;
}

/**
 * Stops all heartbeat handles.
 * @param {Array<{name: string, handle: {stop: Function}}>} handles
 */
export async function stopAllHeartbeats(handles) {
  for (const { name, handle } of handles) {
    try {
      await handle.stop();
    } catch (err) {
      console.warn(`[WorkerIntegration] Failed to stop heartbeat for ${name}:`, err.message);
    }
  }
}

export default { initWorkerHeartbeats, stopAllHeartbeats };
