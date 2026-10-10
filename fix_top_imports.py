import re

with open('src/utils/crmHooks.js', 'r') as f:
    content = f.read()

top_imports = """import { useMemo } from 'react';
import { useQuery, useQueries, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { api, systemSettingsAPI, activitiesAPI } from './api';
import whatsappService from '../services/whatsappService';
import { whatsappTemplates as defaultTemplates } from '../constants/templates';
import { queryKeys, STALE_TIMES, normalizeDashboardStatsParams } from './queryClient';
import confetti from 'canvas-confetti';
import { normalizeLeadRefs } from './helpers';

// Helper for WhatsApp templates
function mergeWithDefaults(dbList) {
    if (!dbList || !Array.isArray(dbList) || dbList.length === 0) return defaultTemplates;
    const merged = [...defaultTemplates];
    dbList.forEach(dbTpl => {
        const idx = merged.findIndex(t => t.name === dbTpl.name && t.language === dbTpl.language);
        if (idx >= 0) {
            merged[idx] = { ...merged[idx], ...dbTpl, isCustomized: true };
        } else {
            merged.push({ ...dbTpl, isCustomized: true, isCustom: true });
        }
    });
    return merged;
}
"""

# Replace existing imports
content = re.sub(r'import \{.*?\} from \'@tanstack/react-query\';\nimport \{ api \} from \'./api\';\nimport \{ queryKeys, STALE_TIMES \} from \'./queryClient\';', top_imports, content, flags=re.DOTALL)

with open('src/utils/crmHooks.js', 'w') as f:
    f.write(content)
