import re

with open('src/pages/Inventory/InventoryDetailPage.jsx', 'r') as f:
    content = f.read()

# 1. Remove setInventory
set_inventory_regex = re.compile(r"const setInventory = useCallback\(\(updater\) => \{.*?\},\s*\[queryClient,\s*inventoryId\]\);\n", re.DOTALL)
content = set_inventory_regex.sub('', content)

# 2. Add useUpdateInventoryMutation import
if 'useUpdateInventoryMutation' not in content:
    content = content.replace("import { useInventory, useInventoryMatches, queryKeys } from '../../utils/crmHooks';", "import { useInventory, useInventoryMatches, useUpdateInventoryMutation, queryKeys } from '../../utils/crmHooks';")

# 3. Instantiate useUpdateInventoryMutation
if 'const { mutateAsync: updateInventory } = useUpdateInventoryMutation();' not in content:
    content = content.replace("const { \n        data: matchResponse,", "const { mutateAsync: updateInventory } = useUpdateInventoryMutation();\n\n    const { \n        data: matchResponse,")

# 4. Remove setInventory from useInventoryActions
content = content.replace("= useInventoryActions(inventory, setInventory, null, onAddDeal);", "= useInventoryActions(inventory, null, onAddDeal);")

# 5. Replace inline api.put in AddInventoryDocumentModal
doc_update_regex = re.compile(r"const response = await api\.put\(`inventory/\$\{inventoryId\}`,\s*updates\);\s*if\s*\(response\.data\?\.success\)\s*\{\s*toast\.success\(\"Documents archived\"\);\s*refresh\(\);\s*setIsDocumentModalOpen\(false\);\s*\}", re.DOTALL)
doc_update_target = """await updateInventory({ id: inventoryId, data: updates });
                        toast.success("Documents archived");
                        setIsDocumentModalOpen(false);"""
content = doc_update_regex.sub(doc_update_target, content)

# 6. Replace inline api.put in AddOwnerModal
owner_update_regex = re.compile(r"const res = await api\.put\(`inventory/\$\{inventoryId\}`,\s*updates\);\s*if\s*\(res\.data\?\.success\)\s*\{\s*toast\.success\(\"Contacts updated successfully\"\);\s*refresh\(\);\s*setIsOwnerModalOpen\(false\);\s*\}\s*else\s*\{\s*toast\.error\(res\.data\?\.message \|\| \"Failed to update contacts\"\);\s*\}", re.DOTALL)
owner_update_target = """await updateInventory({ id: inventoryId, data: updates });
                        toast.success("Contacts updated successfully");
                        setIsOwnerModalOpen(false);"""
content = owner_update_regex.sub(owner_update_target, content)

# 7. Replace inline api.put in ManageTagsModal
tags_update_regex = re.compile(r"const res = await api\.put\(`inventory/\$\{inventoryId\}`,\s*\{ tags: data\.tags\.join\(\', \'\\*\) \}\);\s*if\s*\(res\.data\?\.success\)\s*\{\s*toast\.success\(\"Tags updated\"\);\s*refresh\(\);\s*setIsTagsModalOpen\(false\);\s*\}", re.DOTALL)
tags_update_target = """await updateInventory({ id: inventoryId, data: { tags: data.tags.join(', ') } });
                    toast.success("Tags updated");
                    setIsTagsModalOpen(false);"""
content = tags_update_regex.sub(tags_update_target, content)

# 8. AddBuiltupDetailsModal already uses onSave={refresh}. But wait, does it still need refresh()?
# AddBuiltupDetailsModal internally calls api.put, we need to change it inside AddBuiltupDetailsModal itself! 
# So for InventoryDetailPage, we can remove onSave={refresh} or leave it. Wait, the instructions say "Remove only redundant mutation-specific refresh logic". Let's leave onSave={refresh} here and remove refresh() internally if we migrate BuiltupModal. Wait, if BuiltupModal is migrated, it uses canonical mutation and doesn't need to call onSave() for invalidation. But let's just leave onSave={() => {}} for safety.
content = content.replace("onSave={refresh}", "onSave={() => {}}")

with open('src/pages/Inventory/InventoryDetailPage.jsx', 'w') as f:
    f.write(content)
