import re

with open('src/components/InventoryFeedbackModal.jsx', 'r') as f:
    content = f.read()

if 'useUpdateInventoryMutation' not in content:
    content = content.replace("import { useAddActivityMutation } from '../utils/crmHooks';", "import { useAddActivityMutation, useUpdateInventoryMutation } from '../utils/crmHooks';")

if 'const { mutateAsync: updateInventory } = useUpdateInventoryMutation();' not in content:
    content = content.replace("const { mutateAsync: addActivity } = useAddActivityMutation();", "const { mutateAsync: addActivity } = useAddActivityMutation();\n    const { mutateAsync: updateInventory } = useUpdateInventoryMutation();")

api_put_regex = re.compile(r"const response = await api\.put\(`inventory/\$\{inventory\._id\}`,\s*updatePayload\);\s*if\s*\(response\.data && response\.data\.success\)\s*\{", re.DOTALL)
api_put_target = """await updateInventory({ id: inventory._id, data: updatePayload });
            if (true) {"""

content = api_put_regex.sub(api_put_target, content)

# Remove toast.error for else block if any since mutation throws error.
error_regex = re.compile(r"\} else \{\s*toast\.error\(response\.data\?\.error \|\| \"Failed to save feedback in database\"\);\s*\}", re.DOTALL)
content = error_regex.sub("", content)

with open('src/components/InventoryFeedbackModal.jsx', 'w') as f:
    f.write(content)
