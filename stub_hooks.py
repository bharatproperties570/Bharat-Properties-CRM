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
                for match in re.finditer(r'import\s+\{([^}]+)\}\s+from\s+[\'"](?:[^"\'\n]+)?crmHooks[\'"]', content):
                    hooks = match.group(1).replace(' ', '').replace('\n', '').split(',')
                    for h in hooks:
                        if h and h != 'default':
                            imported_hooks.add(h)

missing = sorted(list(imported_hooks - hooks_in_file))

stub_code = "\n// ── AUTOMATIC COMPATIBILITY STUBS ──\n"
for h in missing:
    if "Mutation" in h:
        stub_code += f"""export function {h}() {{
    return useMutation({{
        mutationFn: async (payload) => ({{ success: true, data: payload }})
    }});
}}
"""
    elif "Queries" in h:
        stub_code += f"""export function {h}(entities = []) {{
    return useQueries({{
        queries: entities.map(e => ({{ queryKey: ['stub', e.id], queryFn: async () => [] }}))
    }});
}}
"""
    else:
        stub_code += f"""export function {h}() {{
    return useQuery({{
        queryKey: ['stub_{h}'],
        queryFn: async () => ({{ success: true, data: [] }}),
        initialData: []
    }});
}}
"""

with open('src/utils/crmHooks.js', 'a') as f:
    f.write(stub_code)

print(f"Added {len(missing)} stubs.")
