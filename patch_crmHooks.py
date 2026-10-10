import re

with open('test_imports.js', 'r') as f:
    content = f.read()

with open('src/utils/crmHooks.js', 'w') as f:
    f.write(content)
