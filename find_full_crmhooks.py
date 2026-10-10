import os
import re

directory = '/Users/bharatproperties/.gemini/antigravity/brain/9c9ecb84-4d5d-45a9-afe5-d919e89194bb/.system_generated/steps'
max_lines = 0
best_file = None

for root, _, files in os.walk(directory):
    for file in files:
        if file == 'output.txt' or file == 'content.txt':
            filepath = os.path.join(root, file)
            with open(filepath, 'r') as f:
                content = f.read()
                if "export function useBookings" in content and "export function useDashboardStats" in content:
                    lines = content.split('\n')
                    if len(lines) > max_lines:
                        max_lines = len(lines)
                        best_file = filepath

if best_file:
    print(f"Found best match in {best_file} with {max_lines} lines.")
else:
    print("No file found containing the required hooks.")
