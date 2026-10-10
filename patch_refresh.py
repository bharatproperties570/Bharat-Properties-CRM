import re

with open('src/pages/Inventory/InventoryDetailPage.jsx', 'r') as f:
    content = f.read()

content = content.replace("toast.success(`Feedback recorded - Property is now ${targetStatus}`);\n            refresh();\n            setIsFeedbackModalOpen(false);", "toast.success(`Feedback recorded - Property is now ${targetStatus}`);\n            setIsFeedbackModalOpen(false);")

with open('src/pages/Inventory/InventoryDetailPage.jsx', 'w') as f:
    f.write(content)
