import os
import re

directory = '/Users/bharatproperties/.gemini/antigravity/brain/9c9ecb84-4d5d-45a9-afe5-d919e89194bb/.system_generated/steps'
extracted = []

for root, _, files in os.walk(directory):
    for file in files:
        if file == 'output.txt' or file == 'content.txt':
            filepath = os.path.join(root, file)
            with open(filepath, 'r') as f:
                content = f.read()
                # Find blocks of code that look like they were appended to crmHooks.js
                if 'export const use' in content or 'export function use' in content:
                    if 'queryKey:' in content and 'useQuery' in content:
                        # exclude the step where I created the stub file!
                        if 'AUTOMATIC COMPATIBILITY STUBS' not in content:
                            extracted.append((filepath, content))

print(f"Found {len(extracted)} files with hooks.")
for filepath, _ in extracted:
    print(filepath)
