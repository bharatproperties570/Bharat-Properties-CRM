import re

filepath = '/Users/bharatproperties/.gemini/antigravity/scratch/bharat-properties-crm/backend/migrate_qualified_stage_to_status.js'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace("type: 'Stage'", "lookup_type: 'Stage'")
content = content.replace("value: { $regex:", "lookup_value: { $regex:")
content = content.replace("type: 'Status'", "lookup_type: 'Status'")
content = content.replace("value: 'Qualified'", "lookup_value: 'Qualified'")

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)
