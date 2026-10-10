import re

with open('src/components/InventoryFeedbackModal.jsx', 'r') as f:
    content = f.read()

content = content.replace("                onClose();\n            \n        } catch (err) {", "                onClose();\n            }\n        } catch (err) {")

with open('src/components/InventoryFeedbackModal.jsx', 'w') as f:
    f.write(content)
