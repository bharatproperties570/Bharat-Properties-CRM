import os
import re

directory = '/Users/bharatproperties/.gemini/antigravity/brain/9c9ecb84-4d5d-45a9-afe5-d919e89194bb/.system_generated/steps'

hooks = {} # name -> code
hook_steps = {} # name -> highest step_index

for root, _, files in os.walk(directory):
    for file in files:
        if file == 'output.txt' or file == 'content.txt':
            step_idx_match = re.search(r'/steps/(\d+)/', root)
            if not step_idx_match:
                continue
            step_idx = int(step_idx_match.group(1))
            
            filepath = os.path.join(root, file)
            with open(filepath, 'r') as f:
                content = f.read()
                
                # Exclude the stub files
                if 'AUTOMATIC COMPATIBILITY STUBS' in content or 'stub_' in content:
                    continue
                
                # Regex to match export const useX = ... or export function useX(...)
                # This matches from export until the next export or end of file
                matches = re.finditer(r'(export\s+(?:const|function)\s+(use[A-Za-z0-9_]+)[^\{]*\{.*?\n(?=export\s+(?:const|function)|$))', content, re.DOTALL)
                
                for match in matches:
                    code = match.group(1)
                    name = match.group(2)
                    
                    if 'useQuery(' in code or 'useMutation(' in code or 'useQueries(' in code:
                        if name not in hooks or step_idx > hook_steps[name]:
                            hooks[name] = code.strip()
                            hook_steps[name] = step_idx

print(f"Extracted {len(hooks)} unique hooks.")
for name in sorted(hooks.keys()):
    print(f"{name} (from step {hook_steps[name]})")

