import re

with open('src/pages/Settings/views/StagePage.jsx', 'r') as f:
    content = f.read()

# 1. Add stageEngineAPI to import
content = content.replace("import { stageTransitionRulesAPI } from '../../../utils/api';",
                          "import { stageTransitionRulesAPI, stageEngineAPI } from '../../../utils/api';")

# 2. Define the missing state and fetch function
state_block = """
    // Engine Observability State
    const [engineHealth, setEngineHealth] = useState(null);
    const [failedTransitions, setFailedTransitions] = useState([]);
    const [observabilityLoading, setObservabilityLoading] = useState(false);

    const fetchObservabilityData = useCallback(async () => {
        setObservabilityLoading(true);
        try {
            const healthRes = await stageEngineAPI.getHealth();
            if (healthRes.success) {
                setEngineHealth(healthRes.data);
            }
            const failedRes = await stageEngineAPI.getFailedTransitions(7);
            if (failedRes.success) {
                setFailedTransitions(failedRes.data || []);
            }
        } catch (error) {
            console.error('[StagePage] Failed to fetch observability data:', error);
        } finally {
            setObservabilityLoading(false);
        }
    }, []);

    useEffect(() => {
        if (activeTab === 'status') {
            fetchObservabilityData();
        }
    }, [activeTab, fetchObservabilityData]);

    const handleRestoreDefaults = async () => {
"""

content = content.replace("    const handleRestoreDefaults = async () => {", state_block)

with open('src/pages/Settings/views/StagePage.jsx', 'w') as f:
    f.write(content)

print("StagePage fixed.")
