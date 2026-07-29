import re
import os

# Fix LeadMatchingPage.jsx
lead_file = "/Users/bharatproperties/.gemini/antigravity/scratch/bharat-properties-crm/src/pages/Leads/views/LeadMatchingPage.jsx"
with open(lead_file, "r") as f:
    content = f.read()

# Remove from callback
content = content.replace("    const { isDark } = useTheme();\n", "")

# Add to top of component
target = "const LeadMatchingPage = ({ onNavigate, leadId }) => {"
replacement = "const LeadMatchingPage = ({ onNavigate, leadId }) => {\n    const { isDark } = useTheme();"
content = content.replace(target, replacement)

with open(lead_file, "w") as f:
    f.write(content)


# Fix InventoryMatchingPage.jsx
inv_file = "/Users/bharatproperties/.gemini/antigravity/scratch/bharat-properties-crm/src/pages/Inventory/views/InventoryMatchingPage.jsx"
with open(inv_file, "r") as f:
    content = f.read()

# Add import if missing
if "import { useTheme }" not in content:
    content = "import { useTheme } from '../../../context/ThemeContext';\n" + content

with open(inv_file, "w") as f:
    f.write(content)

print("Fixed hooks and imports!")
