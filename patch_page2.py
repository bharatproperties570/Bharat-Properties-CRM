import re

with open('src/pages/Inventory/InventoryPageV2.jsx', 'r') as f:
    content = f.read()

owner_update_regex = re.compile(r"const res = await api\.put\(`inventory/\$\{selectedProperty\._id\}`,\s*updates\);\s*if\s*\(res\.data\?\.success\)\s*\{\s*toast\.success\(\"Owners updated successfully\"\);\s*refresh\(\);\s*setIsOwnerModalOpen\(false\);\s*\}", re.DOTALL)
owner_update_target = """await updateInventory({ id: selectedProperty._id, data: updates });
                        toast.success("Owners updated successfully");
                        setIsOwnerModalOpen(false);"""
content = owner_update_regex.sub(owner_update_target, content)

with open('src/pages/Inventory/InventoryPageV2.jsx', 'w') as f:
    f.write(content)
