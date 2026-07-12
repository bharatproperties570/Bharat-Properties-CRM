import re
with open('/Users/bharatproperties/.gemini/antigravity/brain/a554ede2-6722-48fe-93f8-4404871259c8/task.md', 'r') as f:
    text = f.read()

text = text.replace('- `[ ]` 3.', '- `[x]` 3.')
text = text.replace('- `[ ]` 4.', '- `[x]` 4.')
text = text.replace('- `[ ]` 5.', '- `[x]` 5.')
text = text.replace('- `[ ]` 6.', '- `[x]` 6.')

with open('/Users/bharatproperties/.gemini/antigravity/brain/a554ede2-6722-48fe-93f8-4404871259c8/task.md', 'w') as f:
    f.write(text)
