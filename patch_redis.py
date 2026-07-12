import re

filepath = 'backend/src/services/StageTransitionEngine.js'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# Insert import
import_stmt = "import { safeRedisCall } from '../config/redis.js';\n"
if 'safeRedisCall' not in content:
    content = content.replace("import StageTransitionLog from '../../models/StageTransitionLog.js';", "import StageTransitionLog from '../../models/StageTransitionLog.js';\n" + import_stmt)

# Replace the caching logic
old_cache_logic = """let _rulesCache = null;
let _rulesCacheAt = 0;
const RULES_TTL_MS = 5 * 1000; // 5 seconds for rapid updates

export const loadTransitionRules = async () => {
    const now = Date.now();
    if (_rulesCache && (now - _rulesCacheAt) < RULES_TTL_MS) return _rulesCache;

    try {
        const [transitionSetting, mappingSetting] = await Promise.all([
            SystemSetting.findOne({ key: 'stage_transition_rules' }).lean(),
            SystemSetting.findOne({ key: 'stageMappingRules' }).lean()
        ]);

        let rules = transitionSetting?.value?.rules || [];
        
        // Merge in mapping rules (old/revival rules) after normalizing them
        if (mappingSetting?.value && Array.isArray(mappingSetting.value)) {
            const mapped = mappingSetting.value.map(r => ({
                ...r,
                newStage: r.newStage || r.stage, // Normalize 'stage' -> 'newStage'
                active: r.isActive !== undefined ? r.isActive : (r.active !== undefined ? r.active : true)
            }));
            rules = [...rules, ...mapped];
        }

        _rulesCache = rules.length > 0 ? rules : DEFAULT_STAGE_RULES;
    } catch (err) {
        console.error('[StageTransitionEngine] Load rules error:', err.message);
        _rulesCache = DEFAULT_STAGE_RULES;
    }
    _rulesCacheAt = now;
    return _rulesCache;
};

export const invalidateRulesCache = () => {
    _rulesCache = null;
    _rulesCacheAt = 0;
};"""

new_cache_logic = """let _localRulesCache = null;

export const loadTransitionRules = async () => {
    try {
        // 1. Try Redis First
        const redisCache = await safeRedisCall('get', 'stage_rules_cache');
        if (redisCache) {
            const parsed = JSON.parse(redisCache);
            _localRulesCache = parsed;
            return parsed;
        }
        
        // 2. Fallback to DB
        const [transitionSetting, mappingSetting] = await Promise.all([
            SystemSetting.findOne({ key: 'stage_transition_rules' }).lean(),
            SystemSetting.findOne({ key: 'stageMappingRules' }).lean()
        ]);

        let rules = transitionSetting?.value?.rules || [];
        
        if (mappingSetting?.value && Array.isArray(mappingSetting.value)) {
            const mapped = mappingSetting.value.map(r => ({
                ...r,
                newStage: r.newStage || r.stage, 
                active: r.isActive !== undefined ? r.isActive : (r.active !== undefined ? r.active : true)
            }));
            rules = [...rules, ...mapped];
        }

        const finalRules = rules.length > 0 ? rules : DEFAULT_STAGE_RULES;
        
        // 3. Save to Redis (TTL 1 hour, invalidated manually on save)
        await safeRedisCall('setex', 'stage_rules_cache', 3600, JSON.stringify(finalRules));
        _localRulesCache = finalRules;
        return finalRules;
    } catch (err) {
        console.error('[StageTransitionEngine] Load rules error:', err.message);
        return _localRulesCache || DEFAULT_STAGE_RULES;
    }
};

export const invalidateRulesCache = async () => {
    _localRulesCache = null;
    await safeRedisCall('del', 'stage_rules_cache');
};"""

if 'export const invalidateRulesCache' in content:
    content = content.replace(old_cache_logic, new_cache_logic)
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Redis cache logic applied successfully")
else:
    print("Could not find the old cache block")

