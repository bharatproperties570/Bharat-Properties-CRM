import re

with open('src/components/modals/AddBuiltupDetailsModal.jsx', 'r') as f:
    content = f.read()

regex = re.compile(r"const endpoint = entityType === 'Deal' \? `/deals/\$\{entityId\}` : `/inventory/\$\{entityId\}`;\s*const response = await api\.put\(endpoint, payload\);\s*if\s*\(response\.data && response\.data\.success\)\s*\{\s*toast\.success\('Built-up & Furnishing details updated successfully!',\s*\{\s*id: toastId\s*\}\);\s*if\s*\(onSave\) onSave\(\);\s*onClose\(\);\s*\}\s*else\s*\{\s*throw new Error\(response\.data\?\.error \|\| 'Failed to update details'\);\s*\}", re.DOTALL)

target = """if (entityType === 'Inventory' || entityType === 'Property') {
                await updateInventory({ id: entityId, data: payload });
                toast.success('Built-up & Furnishing details updated successfully!', { id: toastId });
                if (onSave) onSave();
                onClose();
            } else {
                const endpoint = `/deals/${entityId}`;
                const response = await api.put(endpoint, payload);
                if (response.data && response.data.success) {
                    toast.success('Built-up & Furnishing details updated successfully!', { id: toastId });
                    if (onSave) onSave();
                    onClose();
                } else {
                    throw new Error(response.data?.error || 'Failed to update details');
                }
            }"""

content = regex.sub(target, content)

with open('src/components/modals/AddBuiltupDetailsModal.jsx', 'w') as f:
    f.write(content)
