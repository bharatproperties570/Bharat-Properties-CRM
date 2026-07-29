import re

with open("src/pages/Deals/views/DealMatchingPage.jsx", "r") as f:
    content = f.read()

content = content.replace("import { useMemo, useState, useEffect, useCallback } from 'react';", "import { useState, useEffect, useCallback } from 'react';")
content = content.replace("import ComposeEmailModal from '../../Communication/components/ComposeEmailModal';\n", "")
content = content.replace("import SendMessageModal from '../../../components/SendMessageModal';\n", "")
content = content.replace("// Deal Match Template ID (from constants/templates.js)\nconst DEAL_MATCH_TEMPLATE_ID = 8;\nconst DEAL_MATCH_SMS_TEMPLATE_ID = 10;\n", "")

with open("src/pages/Deals/views/DealMatchingPage.jsx", "w") as f:
    f.write(content)
print("Cleaned up unused imports")
