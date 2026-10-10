/**
 * WhatsAppTemplateContext
 * =======================
 * Compatibility Facade for existing synchronous consumers (e.g. InventoryFeedbackModal).
 * Wraps TanStack Query.
 */
import { createContext, useContext, useCallback } from 'react';
import { useWhatsAppTemplatesDb } from '../utils/crmHooks';

const WhatsAppTemplateContext = createContext(null);

export const useWhatsAppTemplates = () => {
    const ctx = useContext(WhatsAppTemplateContext);
    if (!ctx) throw new Error('useWhatsAppTemplates must be inside WhatsAppTemplateProvider');
    return ctx;
};

export const WhatsAppTemplateProvider = ({ children }) => {
    // 1. Fetch canonical data from TanStack Query
    // Supported fallback and loading mechanics inherently resolved by useWhatsAppTemplatesDb
    const { data: templates } = useWhatsAppTemplatesDb();

    // 2. Preserve strictly synchronous legacy accessors
    const getFeedbackFormTemplate = useCallback(() => {
        const tpl = templates.find(t =>
            Array.isArray(t.systemContext) && t.systemContext.includes('feedback_form')
        ) || null;
        if (!tpl) return null;
        return { ...tpl, content: tpl.body || tpl.content || '' };
    }, [templates]);

    // 3. Stubs for removed functions (Obsoleted by standard mutations)
    const updateTemplates = () => {
        console.warn('updateTemplates is deprecated. Use useSaveWhatsAppTemplatesMutation instead.');
    };
    const refreshTemplates = () => {
        console.warn('refreshTemplates is deprecated. Query invalidation handles this automatically.');
    };

    return (
        <WhatsAppTemplateContext.Provider value={{
            templates,
            refreshTemplates,
            getFeedbackFormTemplate,
            updateTemplates
        }}>
            {children}
        </WhatsAppTemplateContext.Provider>
    );
};

export default WhatsAppTemplateContext;
