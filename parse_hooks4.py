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
                
                # Remove line numbers from cat -n outputs, e.g. "   493\texport " or "493:export "
                content = re.sub(r'^\s*\d+[:\t\s]+', '', content, flags=re.MULTILINE)
                # Remove common diff prefixes like '+' or '-'
                # Actually, only '+' if we are restoring from diffs, but wait, '-' means removed.
                # Let's just find "export const/function use..."
                
                matches = re.finditer(r'^(?:\+)?\s*(export\s+(?:const|function)\s+(use[A-Za-z0-9_]+)[^\{]*\{.*?^\})', content, re.MULTILINE | re.DOTALL)
                for match in matches:
                    code = match.group(1).strip()
                    name = match.group(2)
                    
                    if 'useQuery(' in code or 'useMutation(' in code or 'useQueries(' in code or 'queryClient' in code:
                        # Clean up diff pluses from inside the code block if it came from a diff
                        if code.startswith('+'):
                            lines = code.split('\n')
                            lines = [l[1:] if l.startswith('+') else l for l in lines]
                            code = '\n'.join(lines)
                            
                        # To prevent matching way past the function end, let's find the closing brace that balances the opening brace.
                        # Simple brace counting:
                        brace_count = 0
                        cut_idx = -1
                        for i, char in enumerate(code):
                            if char == '{': brace_count += 1
                            elif char == '}': 
                                brace_count -= 1
                                if brace_count == 0:
                                    cut_idx = i
                                    break
                        if cut_idx != -1:
                            code = code[:cut_idx+1]
                        
                        if name not in hooks or step_idx > hook_steps[name]:
                            hooks[name] = code
                            hook_steps[name] = step_idx

print(f"Extracted {len(hooks)} unique hooks.")
for name in sorted(hooks.keys()):
    print(f"{name} (from step {hook_steps[name]})")

with open('recovered_hooks.js', 'w') as f:
    for name in sorted(hooks.keys()):
        f.write(hooks[name] + '\n\n')
