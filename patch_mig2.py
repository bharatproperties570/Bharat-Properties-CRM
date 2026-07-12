import re

filepath = '/Users/bharatproperties/.gemini/antigravity/scratch/bharat-properties-crm/backend/migrate_qualified_stage_to_status.js'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

content = "import 'dotenv/config';\n" + content

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)
