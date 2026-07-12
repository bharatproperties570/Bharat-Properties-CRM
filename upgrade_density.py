import re

with open('src/pages/Settings/views/StagePage.jsx', 'r') as f:
    content = f.read()

# Add Density UI Filters
old_density_header = """<div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
                            <div>
                                <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#111827' }}>Stage Density & Bottlenecks</h2>
                                <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#6b7280' }}>Real-time analysis of pipeline velocity</p>
                            </div>
                        </div>"""

new_density_header = """<div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
                            <div>
                                <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#111827' }}>Stage Density & Bottlenecks</h2>
                                <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#6b7280' }}>Real-time analysis of pipeline velocity</p>
                            </div>
                            <div style={{ display: 'flex', gap: '12px' }}>
                                <select 
                                    value={densityEntityType} 
                                    onChange={e => setDensityEntityType(e.target.value)} 
                                    style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '13px', fontWeight: 600 }}
                                >
                                    <option value="leads">Leads Pipeline</option>
                                    <option value="deals">Deals Pipeline</option>
                                </select>
                                <select 
                                    value={densityTimeframe} 
                                    onChange={e => setDensityTimeframe(e.target.value)} 
                                    style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '13px', fontWeight: 600 }}
                                >
                                    <option value="7">Last 7 Days</option>
                                    <option value="30">Last 30 Days</option>
                                    <option value="90">Last 90 Days</option>
                                    <option value="all">All Time</option>
                                </select>
                                <button onClick={fetchStageAnalytics} disabled={analyticsData.loading} style={{ padding: '8px 16px', background: '#fff', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                                    <i className={`fas fa-sync-alt ${analyticsData.loading ? 'fa-spin' : ''}`} style={{ marginRight: '6px' }} /> Refresh
                                </button>
                            </div>
                        </div>"""

content = content.replace(old_density_header, new_density_header)

# Replace densityData assignment
content = content.replace("const densityData = computeStageDensity(analyticsData.leads);", 
                          "const densityData = computeStageDensity(densityEntityType === 'leads' ? analyticsData.leads : analyticsData.deals);")


with open('src/pages/Settings/views/StagePage.jsx', 'w') as f:
    f.write(content)

print("Density Upgraded")
