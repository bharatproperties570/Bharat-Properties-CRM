import re

with open('src/pages/Inventory/components/OwnerSuggestionSection.jsx', 'r') as f:
    content = f.read()

content = content.replace("setSuggestions(prev => prev.filter(c => c._id !== contact._id)); else {\n                toast.error(\"Failed to link contact\", { id: toastId });\n            }", "setSuggestions(prev => prev.filter(c => c._id !== contact._id));")

with open('src/pages/Inventory/components/OwnerSuggestionSection.jsx', 'w') as f:
    f.write(content)
