import re

with open('src/components/modals/AddBuiltupDetailsModal.jsx', 'r') as f:
    content = f.read()

if 'useUpdateInventoryMutation' not in content:
    content = content.replace("import { api } from '../../utils/api';", "import { api } from '../../utils/api';\nimport { useUpdateInventoryMutation } from '../../utils/crmHooks';")

if 'const { mutateAsync: updateInventory } = useUpdateInventoryMutation();' not in content:
    content = content.replace("const AddBuiltupDetailsModal = ({ isOpen, onClose, entityType, entityId, entityData, onSave }) => {", "const AddBuiltupDetailsModal = ({ isOpen, onClose, entityType, entityId, entityData, onSave }) => {\n    const { mutateAsync: updateInventory } = useUpdateInventoryMutation();")

api_put_regex = re.compile(r"const endpoint = entityType === 'Deal' \? `/deals/\$\{entityId\}` : `/inventory/\$\{entityId\}`;\s*const response = await api\.put\(endpoint, payload\);\s*if\s*\(response\.data && response\.data\.success\)\s*\{\s*toast\.success\('Built-up & Furnishing details updated successfully!',\s*\{\s*id: toastId\s*\}\);\s*if\s*\(onSave\) onSave\(\);\s*onClose\(\);\s*\}\s*else\s*\{\s*toast\.error\(response\.data\?\.error \|\| 'Failed to update details',\s*\{\s*id: toastId\s*\}\);\s*\}", re.DOTALL)

api_put_target = """if (entityType === 'Inventory' || entityType === 'Property') {
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
                    toast.error(response.data?.error || 'Failed to update details', { id: toastId });
                }
            }"""

content = api_put_regex.sub(api_put_target, content)

with open('src/components/modals/AddBuiltupDetailsModal.jsx', 'w') as f:
    f.write(content)
