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
                
                # Remove line numbers from cat -n outputs
                content = re.sub(r'^\s*\d+[:\t\s]+', '', content, flags=re.MULTILINE)
                
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
                            # Clean up diff pluses from inside the code block if it came from a diff
                            if part.startswith('+'):
                                lines = part.split('\n')
                                lines = [l[1:] if l.startswith('+') else l for l in lines]
                                part = '\n'.join(lines)
                            
                            brace_count = 0
                            cut_idx = -1
                            started = False
                            for idx, char in enumerate(part):
                                if char == '{': 
                                    brace_count += 1
                                    started = True
                                elif char == '}': 
                                    brace_count -= 1
                                    if started and brace_count == 0:
                                        cut_idx = idx
                                        break
                            if cut_idx != -1:
                                part = part[:cut_idx+1]
                            
                            if name not in hooks or step_idx > hook_steps[name]:
                                hooks[name] = part.strip()
                                hook_steps[name] = step_idx

print(f"Extracted {len(hooks)} unique hooks.")
for name in sorted(hooks.keys()):
    print(f"{name} (from step {hook_steps[name]})")

with open('recovered_hooks.js', 'w') as f:
    for name in sorted(hooks.keys()):
        f.write(hooks[name] + '\n\n')
