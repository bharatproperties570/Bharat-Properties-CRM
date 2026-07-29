import re

file_path = "/Users/bharatproperties/.gemini/antigravity/scratch/bharat-properties-crm/src/components/SendMessageModal.jsx"

with open(file_path, "r") as f:
    content = f.read()

# 1. Add toast import
if "react-hot-toast" not in content:
    content = content.replace(
        "import { systemSettingsAPI }",
        "import toast from 'react-hot-toast';\nimport { systemSettingsAPI }"
    )

# 2. Replace alert with toast
content = content.replace("alert(", "toast.error(")
content = content.replace("toast.error('Message sent successfully", "toast.success('Message sent successfully")
content = content.replace("toast.error('Schedule queued successfully", "toast.success('Schedule queued successfully")

# 3. Replace the massive useEffect
new_use_effect = """
    // 🚀 Remote Template Preview Resolver
    useEffect(() => {
        if (!templateId) return;

        const fetchPreview = async () => {
            try {
                // If it's SMS or RCS, we could still do local or rely on backend. For 100% enterprise, we send all to backend.
                // However, SMS/RCS templates might not be fully supported by the new backend method if we only wired whatsappService.previewTemplate.
                // Wait, whatsappService.previewTemplate uses `whatsapp-config/preview` which handles SMS, WHATSAPP, RCS.
                
                const payload = {
                    template: channel === 'SMS' ? smsTemplates.find(t => String(t.id) === String(templateId) || t._id === templateId) 
                            : channel === 'WHATSAPP' ? whatsappTemplates.find(t => String(t.id) === String(templateId) || t.name === templateId)
                            : rcsTemplatesConst.find(t => String(t.id) === String(templateId)),
                    channel,
                    recipient: recipients[0] || {},
                    properties
                };
                
                if (!payload.template) return;

                const response = await whatsappService.previewTemplate(payload);
                if (response.success) {
                    setMessageBody(response.resolvedBody || '');
                    if (channel === 'WHATSAPP') {
                        setWhatsappComponents(response.components || []);
                        setIsTemplateModified(false);
                        if (response.language) setTemplateLanguage(response.language);
                    } else if (channel === 'RCS') {
                        setRcsTitle(response.rcsTitle || '');
                        setRcsActions(response.rcsActions || []);
                    }
                }
            } catch (err) {
                console.error("Failed to fetch template preview:", err);
                toast.error("Failed to generate template preview from server.");
            }
        };

        fetchPreview();
    }, [isOpen, templateId, channel, whatsappTemplates, smsTemplates, recipients, properties]);
"""

# We need to find the start of the useEffect and the end
pattern = re.compile(r"    // 🚀 Reactive Template Resolver.*?    }, \[isOpen, templateId, channel, whatsappTemplates, smsTemplates, recipients, variableRegistry, initialProperty, properties\]\);\n", re.DOTALL)
content = re.sub(pattern, new_use_effect, content)

with open(file_path, "w") as f:
    f.write(content)

print("Done")
