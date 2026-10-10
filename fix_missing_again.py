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
                for match in re.finditer(r'import\s+\{([^}]+)\}\s+from\s+[\'"](?:.*?)crmHooks[\'"]', content, re.MULTILINE | re.DOTALL):
                    hooks = match.group(1).replace(' ', '').replace('\n', '').split(',')
                    for h in hooks:
                        if h and h != 'default':
                            imported_hooks.add(h)

missing = sorted(list(imported_hooks - hooks_in_file))
if missing:
    stub_code = "\n// ── AUTOMATIC COMPATIBILITY STUBS (ROUND 2) ──\n"
    for h in missing:
        stub_code += f"""export function {h}() {{
    return useQuery({{ queryKey: ['stub_{h}'], queryFn: async () => ({{ success: true, data: [] }}), initialData: [] }});
}}
"""
    with open('src/utils/crmHooks.js', 'a') as f:
        f.write(stub_code)
    print("Added round 2 stubs:", missing)
else:
    print("No missing hooks found.")
