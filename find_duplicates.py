with open('src/utils/crmHooks.js', 'r') as f:
    content = f.read()

import re
matches = re.findall(r'^export\s+(?:const|function)\s+(use[A-Za-z0-9_]+)', content, re.MULTILINE)
seen = set()
dupes = set()
for m in matches:
    if m in seen:
        dupes.add(m)
    seen.add(m)

print("Duplicates:", dupes)
