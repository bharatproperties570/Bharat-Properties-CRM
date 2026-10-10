import re

with open('src/utils/crmHooks.js', 'r') as f:
    content = f.read()

hooks_code = """
// ── WHATSAPP TEMPLATES (SERVER STATE) ──

import { systemSettingsAPI } from './api';
import whatsappService from '../services/whatsappService';
import { whatsappTemplates as defaultTemplates } from '../constants/templates';

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

export function useWhatsAppTemplatesDb() {
    return useQuery({
        queryKey: queryKeys.whatsappTemplates.localDb(),
        queryFn: async () => {
            const res = await systemSettingsAPI.getByKey('crm_whatsapp_templates');
            const dbList = res?.data?.value || null;
            if (dbList && Array.isArray(dbList) && dbList.length > 0) {
                return mergeWithDefaults(dbList);
            }
            return defaultTemplates;
        },
        initialData: defaultTemplates,
        staleTime: 5 * 60 * 1000 // 5 minutes
    });
}

export function useSaveWhatsAppTemplatesMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (templateList) => {
            const res = await systemSettingsAPI.upsert('crm_whatsapp_templates', { value: templateList });
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.whatsappTemplates.localDb() });
        }
    });
}

export function useSubmitWhatsAppTemplateMutation() {
    return useMutation({
        mutationFn: async (savedData) => {
            const res = await whatsappService.submitTemplateToMeta(savedData);
            return res; // returns { success, id }
        }
    });
}

export function useSyncWhatsAppTemplatesCommand() {
    // Explicit command, not a query key
    return useMutation({
        mutationFn: async () => {
            const res = await whatsappService.syncTemplatesFromMeta();
            return res; // returns { success, data }
        }
    });
}
"""

# Wait, we need to make sure the imports don't cause duplicate declarations.
# crmHooks already imports `systemSettingsAPI`? Let's check.
