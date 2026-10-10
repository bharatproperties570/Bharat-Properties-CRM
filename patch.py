import re

with open('src/context/PropertyConfigContext.jsx', 'r') as f:
    content = f.read()

# 1. Update useScoringRuleSetting
scoring_rule_original = """    const useScoringRuleSetting = (key, initialValue) => {
        const [value, setValue] = useState(initialValue);
        const [docId, setDocId] = useState(null);

        // Fetch on mount handled centrally in fetchAll to prevent waterfall
        
        const setConfigValue = useCallback((newValue, skipSync = false) => {
            setValue(newValue);
            if (!skipSync) {
                if (docId) {
                    api.put(`/scoring-rules/${docId}`, { name: key, type: 'global_config', configuration: newValue, module: 'global' })
                        .catch(err => console.error(`[ScoringRule] Push failed for ${key}:`, err));
                } else {
                    api.post(`/scoring-rules`, { name: key, type: 'global_config', configuration: newValue, module: 'global' })
                        .then(res => { if (res.data?.data?._id) setDocId(res.data.data._id); })
                        .catch(err => console.error(`[ScoringRule] Create failed for ${key}:`, err));
                }
            }
        }, [key, docId]);

        return [value, setConfigValue, setDocId];
    };"""

scoring_rule_new = """    const useScoringRuleSetting = (key, initialValue) => {
        const [value, setValue] = useState(initialValue);
        const [docId, setDocId] = useState(null);
        const docIdRef = React.useRef(null);

        React.useEffect(() => {
            docIdRef.current = docId;
        }, [docId]);

        // Fetch on mount handled centrally in fetchAll to prevent waterfall
        
        const setConfigValue = useCallback((newValue, skipSync = false) => {
            setValue(newValue);
            if (!skipSync) {
                const currentDocId = docIdRef.current;
                if (currentDocId) {
                    api.put(`/scoring-rules/${currentDocId}`, { name: key, type: 'global_config', configuration: newValue, module: 'global' })
                        .catch(err => console.error(`[ScoringRule] Push failed for ${key}:`, err));
                } else {
                    api.post(`/scoring-rules`, { name: key, type: 'global_config', configuration: newValue, module: 'global' })
                        .then(res => { if (res.data?.data?._id) setDocId(res.data.data._id); })
                        .catch(err => console.error(`[ScoringRule] Create failed for ${key}:`, err));
                }
            }
        }, [key]); // docId removed, using ref

        return [value, setConfigValue, setDocId];
    };"""

content = content.replace(scoring_rule_original, scoring_rule_new)

# 2. Update Context Value
value_obj_regex = re.compile(r'    const value = \{.*?\n    \};', re.DOTALL)
match = value_obj_regex.search(content)

if match:
    original_value = match.group(0)
    
    # Extract keys
    keys = []
    lines = original_value.split('\n')
    for line in lines[1:-1]:
        clean = line.split('//')[0].strip()
        if clean:
            parts = clean.split(',')
            for p in parts:
                p = p.strip()
                if p:
                    keys.append(p)
                    
    deps_string = ", ".join(keys)
    
    new_value = original_value.replace('const value = {', 'const value = React.useMemo(() => ({').replace('    };', f'    }}), [{deps_string}]);')
    content = content.replace(original_value, new_value)
    
    with open('src/context/PropertyConfigContext.jsx', 'w') as f:
        f.write(content)
    print("Patched successfully")
else:
    print("Could not find value object")
