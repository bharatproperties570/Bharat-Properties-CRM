with open('recovered_hooks_clean_pure.js', 'r') as f:
    content = f.read()

hooks = content.split('\nexport ')
clean_hooks = []
for h in hooks:
    if not h.strip(): continue
    if not h.startswith('export '):
        h = 'export ' + h
        
    lines = h.split('\n')
    js_lines = []
    for l in lines:
        if l.startswith('###') or l.startswith('**TARGET:') or l.startswith('```') or l.startswith('}```') or l.startswith('} ```') or l.startswith('];'):
            break
        js_lines.append(l)
    
    h = '\n'.join(js_lines)
    
    last_brace = h.rfind('}')
    if last_brace != -1:
        h = h[:last_brace+1]
        
    clean_hooks.append(h)

with open('perfect_hooks.js', 'w') as f:
    f.write('\n\n'.join(clean_hooks))
