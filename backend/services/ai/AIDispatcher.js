import AIPolicyEngine from './AIPolicyEngine.js';
import AuditLog from '../../models/AuditLog.js';
// We dynamically import side-effect services to avoid circular dependencies and ensure we only load what's authorized
// import WhatsAppService from '../WhatsAppService.js'; 

class AIDispatcher {
    /**
     * Dispatches an authorized AI action.
     * @param {Object} authDecision - Output from AIPolicyEngine.authorize
     * @param {Object} intent - Validated intent containing payload (e.g. content)
     * @param {Object} context - Execution context (e.g. target phone number)
     */
    static async dispatch(authDecision, intent, context) {
        if (!authDecision || authDecision.decision !== AIPolicyEngine.DECISIONS.ALLOW) {
            console.log(`[AIDispatcher] Action blocked or requires human approval. Decision: ${authDecision?.decision}`);
            return { success: false, reason: authDecision?.reasonCode || 'NOT_ALLOWED' };
        }

        try {
            // Deterministic dispatch based strictly on the AUTHORIZED action string.
            // NEVER use intent fields to look up functions or models directly.
            
            if (authDecision.action === 'SEND_WHATSAPP' || authDecision.action === 'RESPOND_USER') {
                if (!context.target) throw new Error('Missing target for WhatsApp send');
                const { default: WhatsAppService } = await import('../WhatsAppService.js');
                
                // Execute side effect safely
                await WhatsAppService.sendMessage(context.target, intent.content);
                
                // Audit the dispatch
                await this._auditDispatch(authDecision, context, 'success');
                return { success: true, dispatched: true };
            } 
            else if (authDecision.action === 'SEND_EMAIL') {
                // Implement safe email dispatch ...
                await this._auditDispatch(authDecision, context, 'success');
                return { success: true, dispatched: true };
            }
            else if (authDecision.action === 'ESCALATE_HUMAN' || authDecision.action === 'NONE' || authDecision.action === 'EXTRACT_DATA' || authDecision.action === 'INTERNAL_ANALYSIS') {
                // No external side effect to execute here, just return success
                await this._auditDispatch(authDecision, context, 'success');
                return { success: true, dispatched: false };
            }
            else {
                // Failsafe for unhandled authorized actions
                throw new Error(`Dispatcher has no handler for authorized action: ${authDecision.action}`);
            }

        } catch (err) {
            console.error(`[AIDispatcher] Dispatch failed for ${authDecision.action}:`, err);
            await this._auditDispatch(authDecision, context, 'failure', err.message);
            return { success: false, error: err.message };
        }
    }

    static async _auditDispatch(authDecision, context, status, errorMessage = null) {
        try {
            await AuditLog.create({
                eventType: 'ai_action_dispatched',
                description: `AI Action Dispatched: ${authDecision.action}`,
                metadata: {
                    capability: authDecision.capability,
                    action: authDecision.action,
                    policyVersion: authDecision.policyVersion
                },
                status: status,
                errorMessage: errorMessage,
                targetType: 'other',
                targetId: context?.entityId || null
            });
        } catch (e) {
            console.error('[AIDispatcher] Failed to audit dispatch execution', e);
        }
    }
}

export default AIDispatcher;
