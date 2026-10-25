/**
 * @file AutomationEngine.js
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  RETIRED — PHASE B — 2026-09-30                                        ║
 * ║  M0.10D Phase B Controlled Retirement                                   ║
 * ╠══════════════════════════════════════════════════════════════════════════╣
 * ║                                                                          ║
 * ║  WHY RETIRED                                                             ║
 * ║  ──────────                                                              ║
 * ║  This singleton was NEVER imported in server.js or any worker startup.   ║
 * ║  Its constructor calls initializeListeners(), which registers EventBus   ║
 * ║  handlers — but since the module was never imported, those handlers       ║
 * ║  were never registered and no execution ever occurred in production.      ║
 * ║                                                                          ║
 * ║  M0.10B forensic audit confirmed: AutomationEngine is dead code.         ║
 * ║  M0.10D Phase B dependency audit confirmed: zero external imports.        ║
 * ║                                                                          ║
 * ║  WHAT IT DID (DESIGN INTENT — NEVER EXECUTED)                            ║
 * ║  ─────────────────────────────────────────────                            ║
 * ║  Listened to EventBus (LEAD_CREATED, LEAD_UPDATED, DEAL_CREATED,         ║
 * ║  DEAL_UPDATED, INVENTORY_CREATED, INVENTORY_UPDATED) and attempted to    ║
 * ║  evaluate Trigger documents, but:                                         ║
 * ║    - queried Trigger without companyId filter (CV-01)                    ║
 * ║    - never wrote AutomationLog (no idempotency, no audit)                ║
 * ║    - executeAction() was a stub (console.log only, no real dispatch)     ║
 * ║                                                                          ║
 * ║  CANONICAL REPLACEMENT                                                   ║
 * ║  ──────────────────────                                                  ║
 * ║  WorkflowEngine.fireEvent() is the active canonical workflow evaluation   ║
 * ║  and action execution engine. It is called imperatively by controllers    ║
 * ║  with full companyId scoping and AutomationLog idempotency.               ║
 * ║                                                                          ║
 * ║  FUTURE DIRECTION                                                        ║
 * ║  ────────────────                                                        ║
 * ║  The TriggerEvaluationConsumer (Phase E) will subscribe to the           ║
 * ║  domain-event-queue (Outbox pattern) and replace the role this engine    ║
 * ║  was designed for, with correct companyId scoping and durable delivery.  ║
 * ║                                                                          ║
 * ║  NOTE ON process-automation-event                                        ║
 * ║  ──────────────────────────────                                          ║
 * ║  AutomationEngine.processEvent() was the sole producer of               ║
 * ║  'process-automation-event' BullMQ jobs. Since this engine was never     ║
 * ║  initialized, no such jobs were ever enqueued via this path.             ║
 * ║  The marketingWorker handler for this job name is preserved because      ║
 * ║  it contains valid SequenceEngine logic that the future TriggerEvaluation ║
 * ║  Consumer or Outbox Publisher may reactivate.                            ║
 * ║                                                                          ║
 * ║  DO NOT IMPORT THIS FILE.                                                ║
 * ║  DO NOT INSTANTIATE AutomationEngine.                                    ║
 * ║  DO NOT REGISTER EventBus listeners from this class.                    ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Original source preserved below for archaeological reference only.
 * This class is NOT executed at runtime.
 */

// ─── RETIRED SOURCE (archaeological reference only) ───────────────────────────

/*
import eventBus from './EventBus.js';
import AutomatedAction from '../models/AutomatedAction.js';
import Trigger from '../models/Trigger.js';
import AutomationLog from '../models/AutomationLog.js';
import sendWhatsAppMessage from './whatsappService.js';
import { SequenceEngine } from '../src/utils/SequenceEngine.js';
import { marketingQueue } from '../src/queues/marketingQueue.js';

class AutomationEngine {
    constructor() {
        this.initializeListeners();
        this.recursionGuard = new Map();
    }

    // ... [full original source available in git history at HEAD c73f464ef6c6] ...
}

const engine = new AutomationEngine();
export default engine;
*/

// No live exports. Nothing is instantiated.
