import re

with open('src/pages/Settings/views/StagePage.jsx', 'r') as f:
    content = f.read()

# Add Stability Lock Config logic
state_block = """
    // Stability Lock Form State
    const [localStabilityConfig, setLocalStabilityConfig] = useState({});
    useEffect(() => {
        if (stabilityLockConfig && Object.keys(stabilityLockConfig).length > 0) {
            setLocalStabilityConfig(stabilityLockConfig);
        }
    }, [stabilityLockConfig]);

    const handleSaveStabilityConfig = async () => {
        try {
            await api.post('/system-settings/sales_config/stage_stability_lock', { value: localStabilityConfig });
            setStabilityLockConfig(localStabilityConfig);
            showToast('Stability Lock Rules saved successfully to database!', 'success');
        } catch (error) {
            showToast('Failed to save rules', 'error');
        }
    };
"""

content = content.replace("    // Engine Observability State", state_block + "\n    // Engine Observability State")

# Upgrade the header in the stability tab
old_header = """<div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
                            <span style={{ fontWeight: 700, fontSize: '14px', color: '#374151' }}>
                                <i className="fas fa-lock" style={{ color: '#6366f1', marginRight: '8px' }} />
                                Stability Rules per Stage
                            </span>
                        </div>"""

new_header = """<div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontWeight: 700, fontSize: '14px', color: '#374151' }}>
                                <i className="fas fa-lock" style={{ color: '#6366f1', marginRight: '8px' }} />
                                Stability Rules per Stage
                            </span>
                            <button 
                                onClick={handleSaveStabilityConfig}
                                style={{ padding: '8px 16px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                            >
                                <i className="fas fa-save" /> Save Rules
                            </button>
                        </div>"""

content = content.replace(old_header, new_header)

# Upgrade the inputs in stability tab
content = content.replace("value={STAGE_STABILITY_CONFIG[stage.label]?.minActivities || 0} disabled", 
                          "value={localStabilityConfig[stage.label]?.minActivities || 0} onChange={e => setLocalStabilityConfig({...localStabilityConfig, [stage.label]: {...(localStabilityConfig[stage.label]||{}), minActivities: Number(e.target.value)}})}")
content = content.replace("value={STAGE_STABILITY_CONFIG[stage.label]?.minDays || 0} disabled", 
                          "value={localStabilityConfig[stage.label]?.minDays || 0} onChange={e => setLocalStabilityConfig({...localStabilityConfig, [stage.label]: {...(localStabilityConfig[stage.label]||{}), minDays: Number(e.target.value)}})}")
content = content.replace("value={STAGE_STABILITY_CONFIG[stage.label]?.label || ''} disabled", 
                          "value={localStabilityConfig[stage.label]?.label || ''} onChange={e => setLocalStabilityConfig({...localStabilityConfig, [stage.label]: {...(localStabilityConfig[stage.label]||{}), label: e.target.value}})}")


with open('src/pages/Settings/views/StagePage.jsx', 'w') as f:
    f.write(content)

print("Stability Upgraded")
