import json
import re

log_file = '/Users/bharatproperties/.gemini/antigravity/brain/9c9ecb84-4d5d-45a9-afe5-d919e89194bb/.system_generated/logs/transcript_full.jsonl'
hooks = {}
hook_steps = {}

with open(log_file, 'r') as f:
    for line in f:
        try:
            step = json.loads(line)
            step_idx = step.get('step_index', 0)
            
            texts = []
            if 'content' in step:
                texts.append(step['content'])
            if 'tool_calls' in step:
                for call in step['tool_calls']:
                    texts.append(json.dumps(call))
                    
            for text in texts:
                if not text: continue
                # EXCLUDE STUBS
                if 'COMPATIBILITY STUB' in text.upper() or 'STUBS FOR PREVIOUS' in text.upper() or 'stub_' in text:
                    continue
                
                # Unescape newlines
                if '\\n' in text:
                    text = text.replace('\\n', '\n').replace('\\\"', '\"').replace('\\\\', '\\')
                    
                parts = text.split('\nexport ')
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
        except Exception as e:
            pass

print(f"Extracted {len(hooks)} unique hooks.")
for name in sorted(hooks.keys()):
    print(f"{name} (from step {hook_steps[name]})")

with open('recovered_hooks_clean.js', 'w') as f:
    for name in sorted(hooks.keys()):
        f.write(hooks[name] + '\n\n')
