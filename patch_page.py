import re

with open('src/pages/Inventory/InventoryPageV2.jsx', 'r') as f:
    content = f.read()

if 'useDeleteInventoryMutation' not in content:
    content = content.replace("import { useInventories, useInventoryListActions, queryKeys } from '../../utils/crmHooks';", "import { useInventories, useInventoryListActions, useUpdateInventoryMutation, useDeleteInventoryMutation, useBulkDeleteInventoryMutation, queryKeys } from '../../utils/crmHooks';")

if 'const { mutateAsync: updateInventory } = useUpdateInventoryMutation();' not in content:
    content = content.replace("const { getLookupValue } = usePropertyConfig();", "const { getLookupValue } = usePropertyConfig();\n    const { mutateAsync: updateInventory } = useUpdateInventoryMutation();\n    const { mutateAsync: deleteInventory } = useDeleteInventoryMutation();\n    const { mutateAsync: bulkDeleteInventory } = useBulkDeleteInventoryMutation();")


bulk_delete_regex = re.compile(r"await api\.post\(`inventory/bulk-delete`, \{ ids: selectedIds \}\);", re.DOTALL)
content = bulk_delete_regex.sub("await bulkDeleteInventory({ ids: selectedIds });", content)

single_delete_regex = re.compile(r"await api\.delete\(`inventory/\$\{item\._id\}`\);", re.DOTALL)
content = single_delete_regex.sub("await deleteInventory(item._id);", content)

inline_update_regex = re.compile(r"const res = await api\.put\(`inventory/\$\{selectedProperty\._id\}`,\s*updates\);\s*if\s*\(res\.data\?\.success\)\s*\{\s*toast\.success\(\"Inventory updated successfully\"\);\s*setIsEditModalOpen\(false\);\s*refresh\(\);\s*\}\s*else\s*\{\s*toast\.error\(res\.data\?\.error \|\| \"Update failed\"\);\s*\}", re.DOTALL)
inline_update_target = """await updateInventory({ id: selectedProperty._id, data: updates });
                        toast.success("Inventory updated successfully");
                        setIsEditModalOpen(false);"""
content = inline_update_regex.sub(inline_update_target, content)

with open('src/pages/Inventory/InventoryPageV2.jsx', 'w') as f:
    f.write(content)
