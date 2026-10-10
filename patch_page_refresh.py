import re

with open('src/pages/Inventory/InventoryPageV2.jsx', 'r') as f:
    content = f.read()

content = content.replace("toast.success(\"Deleted successfully\");\n            setSelectedIds([]);\n            refresh();", "toast.success(\"Deleted successfully\");\n            setSelectedIds([]);")
content = content.replace("toast.success(\"Property deleted successfully\");\n                    refresh();", "toast.success(\"Property deleted successfully\");")

with open('src/pages/Inventory/InventoryPageV2.jsx', 'w') as f:
    f.write(content)
