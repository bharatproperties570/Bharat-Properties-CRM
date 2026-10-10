import re

with open('src/pages/Inventory/components/OwnerSuggestionSection.jsx', 'r') as f:
    content = f.read()

if 'useUpdateInventoryMutation' not in content:
    content = content.replace("import { useQuery } from '@tanstack/react-query';", "import { useQuery } from '@tanstack/react-query';\nimport { useUpdateInventoryMutation } from '../../../utils/crmHooks';")
    content = content.replace("import { queryKeys } from '../../../utils/crmHooks';", "")

if 'const { mutateAsync: updateInventory } = useUpdateInventoryMutation();' not in content:
    content = content.replace("const OwnerSuggestionSection = ({ inventoryId, currentOwners = [], onRefresh }) => {", "const OwnerSuggestionSection = ({ inventoryId, currentOwners = [], onRefresh }) => {\n    const { mutateAsync: updateInventory } = useUpdateInventoryMutation();")

api_put_regex = re.compile(r"const res = await api\.put\(`inventory/\$\{inventoryId\}`,\s*updates\);\s*if\s*\(res\.data\?\.success\)\s*\{\s*toast\.success\(`\$\{contact\.name\} linked successfully`,\s*\{\s*id: toastId\s*\}\);\s*setSuggestions\(prev => prev\.filter\(c => c\._id !== contact\._id\)\);\s*if\s*\(onRefresh\) onRefresh\(\);\s*\}", re.DOTALL)
api_put_target = """await updateInventory({ id: inventoryId, data: updates });
            toast.success(`${contact.name} linked successfully`, { id: toastId });
            setSuggestions(prev => prev.filter(c => c._id !== contact._id));"""

content = api_put_regex.sub(api_put_target, content)

with open('src/pages/Inventory/components/OwnerSuggestionSection.jsx', 'w') as f:
    f.write(content)
