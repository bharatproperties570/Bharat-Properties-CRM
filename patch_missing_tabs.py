import re

with open('src/pages/Settings/views/StagePage.jsx', 'r') as f:
    stage_page = f.read()

with open('missing_tabs.jsx', 'r') as f:
    missing_tabs = f.read()

# Inject missing tabs
if "{/* TAB 4: Lead ↔ Deal Sync Engine */}" in stage_page:
    stage_page = stage_page.replace("{/* TAB 4: Lead ↔ Deal Sync Engine */}", missing_tabs + "\n            {/* TAB 4: Lead ↔ Deal Sync Engine */}")

# Update the tabs array in navigation
old_tabs = """    const tabs = [
        { id: 'rules', label: 'Rule Table', icon: 'fa-table' },
        { id: 'pipeline', label: 'Stage Pipeline', icon: 'fa-stream' },
        { id: 'status', label: 'Engine Status', icon: 'fa-heartbeat' },
        { id: 'sync', label: 'Lead↔Deal Sync', icon: 'fa-sync-alt' },
    ];"""

new_tabs = """    const tabs = [
        { id: 'rules', label: 'Rule Table', icon: 'fa-table' },
        { id: 'pipeline', label: 'Stage Pipeline', icon: 'fa-stream' },
        { id: 'density', label: 'Stage Density', icon: 'fa-chart-pie' },
        { id: 'stability', label: 'Stability Lock', icon: 'fa-lock' },
        { id: 'status', label: 'Engine Status', icon: 'fa-heartbeat' },
        { id: 'sync', label: 'Lead↔Deal Sync', icon: 'fa-sync-alt' },
    ];"""

stage_page = stage_page.replace(old_tabs, new_tabs)

with open('src/pages/Settings/views/StagePage.jsx', 'w') as f:
    f.write(stage_page)
print("Tabs restored")
