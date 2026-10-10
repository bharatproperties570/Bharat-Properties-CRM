import os
import re

hooks_in_file = set()
with open('src/utils/crmHooks.js', 'r') as f:
    content = f.read()
    for match in re.finditer(r'export function (use[A-Za-z0-9_]+)', content):
        hooks_in_file.add(match.group(1))

imported_hooks = set()
for root, _, files in os.walk('src'):
    for file in files:
        if file.endswith(('.js', '.jsx')):
            with open(os.path.join(root, file), 'r') as f:
                content = f.read()
                # find all: import { hook1, hook2 } from '...crmHooks'
                for match in re.finditer(r'import\s+\{([^}]+)\}\s+from\s+[\'"](?:[^"\'\n]+)?crmHooks[\'"]', content):
                    hooks = match.group(1).replace(' ', '').replace('\n', '').split(',')
                    for h in hooks:
                        if h and h != 'default':
                            imported_hooks.add(h)

missing = imported_hooks - hooks_in_file
print("Missing hooks:", missing)
