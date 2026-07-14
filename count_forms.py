import re

with open('src/context/PropertyConfigContext.jsx', 'r') as f:
    text = f.read()

forms = re.findall(r"requiredForms:\s*\[(.*?)\]", text)
print(f"Total Outcomes Updated: {len(forms)}")

# Count unique forms
form_counts = {}
for match in forms:
    for f in match.replace("'", "").replace("\"", "").split(","):
        f = f.strip()
        if f:
            form_counts[f] = form_counts.get(f, 0) + 1

for k, v in form_counts.items():
    print(f"- {k}: mapped to {v} outcomes")

