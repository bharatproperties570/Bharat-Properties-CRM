import re

file_path = "/Users/bharatproperties/.gemini/antigravity/scratch/bharat-properties-crm/src/components/AddDealModal.jsx"

with open(file_path, "r") as f:
    content = f.read()

# 1. Add "Auto-Dispatch Active" badge to the UI
search_ui = """                                <div style={{ marginBottom: '12px' }}>
                                    <h5 style={{ margin: '0 0 4px 0', fontSize: '0.9rem', fontWeight: 700, color: '#334155' }}>🎯 AI Lead Matching & Outreach</h5>
                                    <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b' }}>Automatically notify matching leads via selected channels upon deal creation.</p>
                                </div>"""

replace_ui = """                                <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div>
                                        <h5 style={{ margin: '0 0 4px 0', fontSize: '0.9rem', fontWeight: 700, color: '#334155' }}>🎯 AI Lead Matching & Outreach</h5>
                                        <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b' }}>Automatically notify matching leads via selected channels upon deal creation.</p>
                                    </div>
                                    {Object.values(formData.sendMatchedDeal || {}).some(v => v) && (
                                        <span style={{ fontSize: '0.75rem', color: '#10b981', background: 'rgba(16, 185, 129, 0.1)', padding: '4px 8px', borderRadius: '12px', fontWeight: 600 }}>Auto-Dispatch Active</span>
                                    )}
                                </div>"""

content = content.replace(search_ui, replace_ui)

# 2. Change the toast message for no matches
search_toast = "toast.error(`No matching leads found for this deal.`, { id: loadToast });"
replace_toast = "toast.error(`No matching leads found for this deal. Skipping outreach.`, { id: loadToast });"
# Let's change it to toast.success with a info icon or just keep it error but more descriptive
content = content.replace(search_toast, "toast.success(`No matching leads found. Skipping outreach.`, { id: loadToast, icon: 'ℹ️' });")

with open(file_path, "w") as f:
    f.write(content)

print("UI Patching complete.")
