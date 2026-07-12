import re
with open('/Users/bharatproperties/.gemini/antigravity/brain/a554ede2-6722-48fe-93f8-4404871259c8/task.md', 'r') as f:
    text = f.read()

text = text.replace('- `[ ]` 1.', '- `[x]` 1.')
text = text.replace('- `[ ]` 2.', '- `[x]` 2.')

with open('/Users/bharatproperties/.gemini/antigravity/brain/a554ede2-6722-48fe-93f8-4404871259c8/task.md', 'w') as f:
    f.write(text)
