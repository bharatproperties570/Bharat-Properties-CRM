import re

with open('src/utils/crmHooks.js', 'r') as f:
    content = f.read()

# Remove imports from middle
content = content.replace("import { systemSettingsAPI } from './api';", "")
content = content.replace("import whatsappService from '../services/whatsappService';", "")
content = content.replace("import { whatsappTemplates as defaultTemplates } from '../constants/templates';", "")

# Add them to top
top_imports = """import { useMemo } from 'react';
import { useQuery, useQueries, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { api, systemSettingsAPI, activitiesAPI } from './api';
import whatsappService from '../services/whatsappService';
import { whatsappTemplates as defaultTemplates } from '../constants/templates';
import { queryKeys, STALE_TIMES, normalizeDashboardStatsParams } from './queryClient';
import confetti from 'canvas-confetti';
"""

# Replace all original imports at the top
content = re.sub(r'import \{ useMemo \}.*?import confetti from \'canvas-confetti\';', top_imports, content, flags=re.DOTALL)
# It's possible we missed activitiesAPI if it was separate.

with open('src/utils/crmHooks.js', 'w') as f:
    f.write(content)
