/**
 * Phase E.2 — Shadow Comparison Utility
 *
 * Compares automation decisions between:
 *   LEGACY: WorkflowEngine.fireEvent() path (Trigger.find + evaluateRules on FULL entity)
 *   SHADOW: domainEventWorker path (Trigger.find + evaluateRules on Outbox PAYLOAD)
 *
 * This utility does NOT call executeAction() or fireEvent().
 * It replicates ONLY the read/evaluation logic from both paths.
 *
 * IMPORTANT: evaluateCondition() and evaluateRules() below are EXACT COPIES of
 * WorkflowEngine.js L7-66. They are copied here instead of imported because
 * importing WorkflowEngine.js transitively loads mongoose, WhatsApp, etc.
 * which fails in a pure-test environment. The canonical source remains
 * WorkflowEngine.js — this copy is ONLY for offline comparison testing.
 *
 * Purpose: Migration readiness verification.
 */

// ── Static Event Mapping (must match domainEventWorker.js) ────
export const EVENT_MAP = {
    DealCreated:    { module: 'deals',     event: 'deal_created' },
    BookingCreated: { module: 'post_sale', event: 'booking_created' },
};

// ── evaluateCondition / evaluateRules ─────────────────────────
// EXACT COPY of WorkflowEngine.js L7-66.
// DO NOT MODIFY independently. If WorkflowEngine changes, this must be updated.
function evaluateCondition(rule, entityData) {
    let rawValue = entityData[rule.field];

    const extractValue = (v) => {
        if (v && typeof v === 'object') {
            return String(v.lookup_value || v.name || v.title || v._id || v);
        }
        return v !== null && v !== undefined ? String(v) : '';
    };

    const value = Array.isArray(rawValue)
        ? rawValue.map(extractValue).join(',')
        : extractValue(rawValue);

    const valStr = value.toLowerCase();

    switch (rule.operator) {
        case '==': return valStr == String(rule.value || '').toLowerCase();
        case '!=': return valStr != String(rule.value || '').toLowerCase();
        case '>': return value > rule.value;
        case '>=': return value >= rule.value;
        case '<': return value < rule.value;
        case '<=': return value <= rule.value;
        case 'IN': {
            const arr = Array.isArray(rule.value) ? rule.value : String(rule.value || '').split(',').map(s => s.trim().toLowerCase());
            if (Array.isArray(rawValue)) {
                return rawValue.map(extractValue).some(v => arr.includes(v.toLowerCase()));
            }
            return arr.includes(valStr);
        }
        case 'NOT_IN': {
            const arr = Array.isArray(rule.value) ? rule.value : String(rule.value || '').split(',').map(s => s.trim().toLowerCase());
            if (Array.isArray(rawValue)) {
                return !rawValue.map(extractValue).some(v => arr.includes(v.toLowerCase()));
            }
            return !arr.includes(valStr);
        }
        default: return false;
    }
}

export function evaluateRules(conditions, entityData) {
    if (!conditions || typeof conditions !== 'object') return true;

    if (conditions.field && conditions.operator) {
        return evaluateCondition(conditions, entityData);
    }

    if (!conditions.rules || conditions.rules.length === 0) return true;

    if (conditions.operator === 'OR') {
        return conditions.rules.some(rule => evaluateRules(rule, entityData));
    } else {
        return conditions.rules.every(rule => evaluateRules(rule, entityData));
    }
}

/**
 * Simulate the legacy fireEvent() trigger-evaluation path.
 *
 * Legacy path (WorkflowEngine.fireEvent L701-722):
 *   Trigger.find({ module, event, isActive:true, companyId })
 *   .sort({ priority: 1 })
 *   → for each: evaluateRules(trigger.conditions, entityData)
 *   → for each matched: enumerate actions
 *
 * We call the exact same evaluateRules() but do NOT call executeAction().
 */
export function evaluateLegacyPath({ moduleName, eventName, entityData, companyId, triggers }) {
    const results = [];

    for (const trigger of triggers) {
        const conditionResult = evaluateRules(trigger.conditions, entityData);

        if (!conditionResult) {
            results.push({
                triggerId: String(trigger._id), triggerName: trigger.name,
                conditionResult: false, decision: 'SKIP', actions: [],
            });
            continue;
        }

        const actions = (trigger.actions || []).map((action, idx) => ({
            actionIndex: idx, actionType: action.type, decision: 'WOULD_EXECUTE',
        }));

        results.push({
            triggerId: String(trigger._id), triggerName: trigger.name,
            conditionResult: true, decision: 'FIRE', actions,
        });
    }

    return {
        path: 'LEGACY', module: moduleName, event: eventName, companyId,
        triggers: results,
        totalTriggers: triggers.length,
        totalActions: results.reduce((sum, r) => sum + r.actions.length, 0),
    };
}

/**
 * Simulate the shadow domainEventWorker trigger-evaluation path.
 *
 * Shadow path (domainEventWorker.js):
 *   EVENT_MAP[eventType] → { module, event }
 *   Trigger.find({ module, event, isActive:true, companyId: null })
 *   .sort({ priority: 1 })
 *   → for each: evaluateRules(trigger.conditions, outboxPayload)
 *   → for each matched: enumerate actions as WOULD_EXECUTE
 */
export function evaluateShadowPath({ eventType, outboxPayload, triggers }) {
    const mapping = EVENT_MAP[eventType];
    if (!mapping) {
        return {
            path: 'SHADOW', module: null, event: null, companyId: null,
            triggers: [], totalTriggers: 0, totalActions: 0,
            error: `Unknown eventType: ${eventType}`,
        };
    }

    const { module: triggerModule, event: triggerEvent } = mapping;
    const results = [];

    for (const trigger of triggers) {
        const conditionResult = evaluateRules(trigger.conditions, outboxPayload);

        if (!conditionResult) {
            results.push({
                triggerId: String(trigger._id), triggerName: trigger.name,
                conditionResult: false, decision: 'SKIP', actions: [],
            });
            continue;
        }

        const actions = (trigger.actions || []).map((action, idx) => ({
            actionIndex: idx, actionType: action.type, decision: 'WOULD_EXECUTE',
        }));

        results.push({
            triggerId: String(trigger._id), triggerName: trigger.name,
            conditionResult: true, decision: 'FIRE', actions,
        });
    }

    return {
        path: 'SHADOW', module: triggerModule, event: triggerEvent, companyId: null,
        triggers: results,
        totalTriggers: triggers.length,
        totalActions: results.reduce((sum, r) => sum + r.actions.length, 0),
    };
}

/**
 * Compare legacy and shadow automation decisions.
 */
export function compareAutomationDecisions({
    eventType, eventId, entityType, entityId,
    legacyResult, shadowResult,
}) {
    const differences = [];

    if (legacyResult.module !== shadowResult.module) {
        differences.push({ type: 'MODULE_MISMATCH', legacy: legacyResult.module, shadow: shadowResult.module });
    }
    if (legacyResult.event !== shadowResult.event) {
        differences.push({ type: 'EVENT_MISMATCH', legacy: legacyResult.event, shadow: shadowResult.event });
    }
    if (legacyResult.totalTriggers !== shadowResult.totalTriggers) {
        differences.push({ type: 'TRIGGER_COUNT_MISMATCH', legacy: legacyResult.totalTriggers, shadow: shadowResult.totalTriggers });
    }

    const maxLen = Math.max(legacyResult.triggers.length, shadowResult.triggers.length);
    for (let i = 0; i < maxLen; i++) {
        const lt = legacyResult.triggers[i];
        const st = shadowResult.triggers[i];

        if (!lt && st) { differences.push({ type: 'TRIGGER_ONLY_IN_SHADOW', index: i, shadow: st }); continue; }
        if (lt && !st) { differences.push({ type: 'TRIGGER_ONLY_IN_LEGACY', index: i, legacy: lt }); continue; }

        if (lt.triggerId !== st.triggerId) {
            differences.push({ type: 'TRIGGER_ORDER_MISMATCH', index: i, legacy: lt.triggerId, shadow: st.triggerId });
        }
        if (lt.conditionResult !== st.conditionResult) {
            differences.push({ type: 'CONDITION_RESULT_MISMATCH', triggerId: lt.triggerId, triggerName: lt.triggerName, legacy: lt.conditionResult, shadow: st.conditionResult });
        }
        if (lt.decision !== st.decision) {
            differences.push({ type: 'DECISION_MISMATCH', triggerId: lt.triggerId, legacy: lt.decision, shadow: st.decision });
        }

        if (lt.actions.length !== st.actions.length) {
            differences.push({ type: 'ACTION_COUNT_MISMATCH', triggerId: lt.triggerId, legacy: lt.actions.length, shadow: st.actions.length });
        }

        const maxActions = Math.max(lt.actions.length, st.actions.length);
        for (let j = 0; j < maxActions; j++) {
            const la = lt.actions[j];
            const sa = st.actions[j];
            if (la?.actionType !== sa?.actionType) {
                differences.push({ type: 'ACTION_TYPE_MISMATCH', triggerId: lt.triggerId, actionIndex: j, legacy: la?.actionType, shadow: sa?.actionType });
            }
        }
    }

    const companyIdEquivalent =
        (legacyResult.companyId === undefined || legacyResult.companyId === null) &&
        (shadowResult.companyId === undefined || shadowResult.companyId === null);

    if (!companyIdEquivalent) {
        differences.push({ type: 'COMPANY_ID_MISMATCH', legacy: legacyResult.companyId, shadow: shadowResult.companyId });
    }

    return {
        equivalent: differences.length === 0,
        eventId, eventType, entityType, entityId,
        legacy: {
            triggers: legacyResult.triggers.map(t => ({
                triggerId: t.triggerId, triggerName: t.triggerName,
                conditionResult: t.conditionResult, decision: t.decision,
                actionTypes: t.actions.map(a => a.actionType),
            })),
        },
        shadow: {
            triggers: shadowResult.triggers.map(t => ({
                triggerId: t.triggerId, triggerName: t.triggerName,
                conditionResult: t.conditionResult, decision: t.decision,
                actionTypes: t.actions.map(a => a.actionType),
            })),
        },
        differences,
        companyIdNote: 'Legacy: undefined (Mongoose strips → matches all). Shadow: null (matches null/absent). Functionally equivalent in single-org.',
        timestamp: new Date().toISOString(),
    };
}

/**
 * Build a DealCreated Outbox payload from a full Deal entity.
 * Replicates deal.controller.js L2203-2215 exactly.
 */
export function buildDealOutboxPayload(deal) {
    return {
        dealId:      deal.dealId      || null,
        stage:       deal.stage       || 'Open',
        projectName: deal.projectName || null,
        block:       deal.block       || null,
        unitNo:      deal.unitNo      || null,
        inventoryId: deal.inventoryId || null,
        assignedTo:  deal.assignedTo  || null,
        source:      deal.source      || null,
        dealType:    deal.dealType    || null,
        companyId:   deal.companyId   || null,
        createdAt:   deal.createdAt   || new Date(),
    };
}

/**
 * Build a BookingCreated Outbox payload from a full Booking entity.
 * Replicates booking.controller.js L208-228 exactly.
 */
export function buildBookingOutboxPayload(booking, occurredAt = new Date()) {
    return {
        applicationNo: booking.applicationNo || null,
        dealId:        booking.dealId        || null,
        property:      booking.property      || null,
        lead:          booking.lead          || null,
        salesAgent:    booking.salesAgent    || null,
        bookingDate:   booking.bookingDate   || occurredAt,
        status:        booking.status        || 'Pending',
        type:          booking.type          || 'Sale',
        companyId:     null,
    };
}

/**
 * Field-level comparison between full entity and Outbox payload.
 *
 * Classifies each field used by trigger conditions:
 *   A — Present identically in Outbox payload
 *   B — Present but structurally different
 *   C — Available only on live entity (not in Outbox)
 *   D — Derived/enriched after creation
 *   E — Unknown
 */
export function compareEntityFields(fullEntity, outboxPayload, conditionFields) {
    const results = [];

    for (const field of conditionFields) {
        const liveValue     = fullEntity[field];
        const snapshotValue = outboxPayload[field];
        const inOutbox      = field in outboxPayload;

        let classification;
        let risk;

        if (!inOutbox) {
            classification = liveValue !== undefined ? 'C' : 'E';
            risk = liveValue !== undefined ? 'HIGH' : 'NONE';
        } else if (String(liveValue) === String(snapshotValue)) {
            classification = 'A';
            risk = 'NONE';
        } else {
            classification = 'B';
            risk = 'MEDIUM';
        }

        results.push({ field, classification, liveValue: liveValue !== undefined ? String(liveValue) : '(undefined)', snapshotValue: inOutbox ? String(snapshotValue) : '(absent)', inOutbox, risk });
    }

    return results;
}
