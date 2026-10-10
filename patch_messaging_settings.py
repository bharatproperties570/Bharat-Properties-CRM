import re

with open('src/pages/Settings/views/MessagingSettingsPage.jsx', 'r') as f:
    content = f.read()

# Replace hook usages and imports
content = content.replace("import { useWhatsAppTemplates } from '../../../context/WhatsAppTemplateContext';", "import { useWhatsAppTemplatesDb, useSaveWhatsAppTemplatesMutation, useSubmitWhatsAppTemplateMutation, useSyncWhatsAppTemplatesCommand } from '../../../utils/crmHooks';")
content = content.replace("const { updateTemplates } = useWhatsAppTemplates();", "")
content = content.replace("await systemSettingsAPI.upsert(key, { value: templateList });", "if (type === 'whatsapp') { await saveWhatsAppTemplates(templateList); } else { await systemSettingsAPI.upsert(key, { value: templateList }); }")

# Add hook calls at top of component
hook_calls = """    const { mutateAsync: saveWhatsAppTemplates } = useSaveWhatsAppTemplatesMutation();
    const { mutateAsync: submitWhatsAppTemplate } = useSubmitWhatsAppTemplateMutation();
    const { mutateAsync: syncWhatsAppTemplates } = useSyncWhatsAppTemplatesCommand();
    const { data: dbWhatsappTemplates } = useWhatsAppTemplatesDb();
"""
# find "const [isSyncing, setIsSyncing] = useState(false);"
content = content.replace("const [isSyncing, setIsSyncing] = useState(false);", "const [isSyncing, setIsSyncing] = useState(false);\n" + hook_calls)

# Replace whatsappService.submitTemplateToMeta with submitWhatsAppTemplate
content = content.replace("await whatsappService.submitTemplateToMeta(savedData);", "await submitWhatsAppTemplate(savedData);")
# Replace whatsappService.syncTemplatesFromMeta with syncWhatsAppTemplates
content = content.replace("await whatsappService.syncTemplatesFromMeta();", "await syncWhatsAppTemplates();")

# Replace updateTemplates(updatedList); with nothing
content = content.replace("if (templateType === 'whatsapp') updateTemplates(updatedList);", "")

with open('src/pages/Settings/views/MessagingSettingsPage.jsx', 'w') as f:
    f.write(content)
