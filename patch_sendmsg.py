import re

file_path = "/Users/bharatproperties/.gemini/antigravity/scratch/bharat-properties-crm/src/components/SendMessageModal.jsx"

with open(file_path, "r") as f:
    content = f.read()

# 1. Update Props
target_props = """    initialTemplateId = '',
    initialChannel = 'SMS'
}) => {"""

replace_props = """    initialTemplateId = '',
    initialChannel = 'SMS',
    triggerContext = null
}) => {"""

content = content.replace(target_props, replace_props)

# 2. Update loadSmsTemplates
target_sms = """            if (templates && templates.length > 0) {
                setSmsTemplates(templates);
            } else {"""

replace_sms = """            if (templates && templates.length > 0) {
                setSmsTemplates(templates);
                if (triggerContext && !initialTemplateId && isOpen) {
                    const match = templates.find(t => t.systemContext?.includes(triggerContext));
                    if (match && channel === 'SMS') {
                        setTemplateId(match.id || match._id);
                    }
                }
            } else {"""

content = content.replace(target_sms, replace_sms)

# 3. Update loadWhatsAppTemplates
target_wa = """            if (templates && templates.length > 0) {
                setWhatsappTemplates(templates);
            } else {"""

replace_wa = """            if (templates && templates.length > 0) {
                setWhatsappTemplates(templates);
                if (triggerContext && !initialTemplateId && isOpen) {
                    const match = templates.find(t => t.systemContext?.includes(triggerContext));
                    if (match && channel === 'WHATSAPP') {
                        setTemplateId(match.id || match._id);
                    }
                }
            } else {"""

content = content.replace(target_wa, replace_wa)

with open(file_path, "w") as f:
    f.write(content)

print("SendMessageModal.jsx patched successfully.")
