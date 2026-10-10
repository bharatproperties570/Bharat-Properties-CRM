import os
import re

directory = '/Users/bharatproperties/.gemini/antigravity/brain/9c9ecb84-4d5d-45a9-afe5-d919e89194bb/.system_generated/steps'
hooks = {}
hook_steps = {}

for root, _, files in os.walk(directory):
    for file in files:
        if file in ['output.txt', 'content.txt']:
            m = re.search(r'/steps/(\d+)', root)
            if not m: continue
            step_idx = int(m.group(1))
            filepath = os.path.join(root, file)
            with open(filepath, 'r') as f:
                content = f.read()
                if 'AUTOMATIC COMPATIBILITY STUBS' in content or 'stub_' in content:
                    continue
                
                parts = content.split('\nexport ')
                for i, part in enumerate(parts):
                    if i > 0:
                        part = 'export ' + part
                    elif part.startswith('export '):
                        pass
                    else:
                        continue
                    
                    match = re.search(r'^export\s+(?:const|function)\s+(use[A-Za-z0-9_]+)', part)
                    if match:
                        name = match.group(1)
                        if 'useQuery(' in part or 'useMutation(' in part or 'useQueries(' in part or 'queryClient' in part:
                            # Clean up the part by cutting it off before the next JS top-level declaration if needed?
                            # Actually, splitting by `\nexport ` should be mostly clean.
                            # Just take up to the last closing brace.
                            last_brace = part.rfind('}')
                            if last_brace != -1:
                                part = part[:last_brace+1]
                            
                            if name not in hooks or step_idx > hook_steps[name]:
                                hooks[name] = part.strip()
                                hook_steps[name] = step_idx

print(f"Extracted {len(hooks)} unique hooks.")
for name in sorted(hooks.keys()):
    print(f"{name} (from step {hook_steps[name]})")
