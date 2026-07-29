/**
 * WhatsAppTemplateContext
 * =======================
 * Enterprise-grade single source of truth for all WhatsApp templates.
 *
 * Load priority:
 *   1. Backend DB  (crm_whatsapp_templates system setting) — PRIMARY source
 *   2. Hardcoded defaults (constants/templates.js) — fallback only if DB unavailable
 *
 * Exposes:
 *   - getFeedbackFormTemplate() → template with systemContext=['feedback_form']
 *   - updateTemplates(list)     → called by MessagingSettingsPage after saving context (in-memory sync)
 *   - refreshTemplates()        → re-fetch from DB on demand
 */
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { whatsappTemplates as defaultTemplates } from '../constants/templates';
import { systemSettingsAPI } from '../utils/api';

const WhatsAppTemplateContext = createContext(null);

export const useWhatsAppTemplates = () => {
    const ctx = useContext(WhatsAppTemplateContext);
    if (!ctx) throw new Error('useWhatsAppTemplates must be inside WhatsAppTemplateProvider');
    return ctx;
};

/**
 * Merge a DB list on top of the hardcoded defaults.
 * DB version wins for every matching template id.
 * New templates (not in defaults) are appended.
 */
const mergeWithDefaults = (overlayList) => {
    if (!overlayList || !Array.isArray(overlayList) || overlayList.length === 0) {
        return defaultTemplates;
    }
    const merged = [...defaultTemplates];
    overlayList.forEach(tpl => {
        const idx = merged.findIndex(t => String(t.id) === String(tpl.id));
        if (idx >= 0) merged[idx] = tpl;
        else merged.push(tpl);
    });
    return merged;
};

export const WhatsAppTemplateProvider = ({ children }) => {
    const [templates, setTemplates] = useState(defaultTemplates);
    const [isLoading, setIsLoading] = useState(true);

    const refreshTemplates = useCallback(async () => {
        try {
            const res = await systemSettingsAPI.getByKey('crm_whatsapp_templates');
            // apiRequest returns response.data directly (axios unwrapped)
            // Backend returns: { success: true, data: { key, value: [...templates] } }
            const dbList = res?.data?.value || null;

            if (dbList && Array.isArray(dbList) && dbList.length > 0) {
                setTemplates(mergeWithDefaults(dbList));
                console.log('[WhatsAppTemplateContext] ✅ Loaded', dbList.length, 'templates from backend DB');
            } else {
                console.warn('[WhatsAppTemplateContext] No templates in DB yet, using defaults');
            }
        } catch (err) {
            console.warn('[WhatsAppTemplateContext] Backend fetch failed, using defaults:', err.message);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        refreshTemplates();
    }, [refreshTemplates]);

    /**
     * Called by MessagingSettingsPage right after saving context (in-memory sync).
     * The backend DB is already updated by persistTemplates() — this just keeps
     * the in-memory state in sync so InventoryFeedbackModal gets the update
     * immediately without waiting for a full page reload.
     */
    const updateTemplates = (newList) => {
        if (!Array.isArray(newList)) return;
        setTemplates(newList);
    };

    /**
     * Returns the template that has systemContext = 'feedback_form'.
     * Handles both 'body' and 'content' field naming conventions:
     *   - CRM-created templates use 'body'
     *   - Legacy/hardcoded templates use 'content'
     * Returns null if admin hasn't configured one yet.
     */
    const getFeedbackFormTemplate = useCallback(() => {
        const tpl = templates.find(t =>
            Array.isArray(t.systemContext) && t.systemContext.includes('feedback_form')
        ) || null;
        if (!tpl) return null;
        // Normalize to always expose 'content' for consumers
        return { ...tpl, content: tpl.body || tpl.content || '' };
    }, [templates]);

    return (
        <WhatsAppTemplateContext.Provider value={{
            templates,
            isLoading,
            refreshTemplates,
            getFeedbackFormTemplate,
            updateTemplates
        }}>
            {children}
        </WhatsAppTemplateContext.Provider>
    );
};

export default WhatsAppTemplateContext;
