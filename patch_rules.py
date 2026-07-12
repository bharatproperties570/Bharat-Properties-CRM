import re

filepath = '/Users/bharatproperties/.gemini/antigravity/scratch/bharat-properties-crm/backend/src/services/StageTransitionEngine.js'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace newStage: 'Qualified' with newStage: 'Prospect'
content = content.replace("newStage: 'Qualified',", "newStage: 'Prospect',")

# Remove from sequences
content = content.replace("'incoming': 0, 'prospect': 1, 'qualified': 2,", "'incoming': 0, 'prospect': 1,")
content = content.replace("['incoming', 'prospect', 'qualified']", "['incoming', 'prospect']")

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print("StageTransitionEngine.js rules patched")
