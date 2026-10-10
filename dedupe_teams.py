import re

with open('src/utils/crmHooks.js', 'r') as f:
    content = f.read()

# Remove the first occurrence of useTeams
content = re.sub(r'export function useTeams\(\) \{[\s\S]*?\}\n', '', content, count=1)

with open('src/utils/crmHooks.js', 'w') as f:
    f.write(content)
