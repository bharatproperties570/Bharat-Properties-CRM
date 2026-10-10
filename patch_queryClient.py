import re

with open('src/utils/queryClient.js', 'r') as f:
    content = f.read()

# Add whatsappTemplates query keys
whatsapp_keys = """export const queryKeys = {
    whatsappTemplates: {
        localDb: () => ['whatsapp-templates', 'local-db'],
    },
"""
content = content.replace("export const queryKeys = {", whatsapp_keys)

with open('src/utils/queryClient.js', 'w') as f:
    f.write(content)
