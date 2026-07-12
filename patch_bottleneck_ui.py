import re

with open('src/pages/Settings/views/StagePage.jsx', 'r') as f:
    content = f.read()

# Add an expandedRows state for the density table
if "const [expandedRows, setExpandedRows] = useState({});" not in content:
    content = content.replace("const [densityTimeframe, setDensityTimeframe] = useState('30');", 
                              "const [densityTimeframe, setDensityTimeframe] = useState('30');\n    const [expandedRows, setExpandedRows] = useState({});\n    const toggleRow = (stage) => setExpandedRows(prev => ({...prev, [stage]: !prev[stage]}));")

# Update the row mapping
old_row_start = """<div key={row.stage} style={{ display: 'grid', gridTemplateColumns: '150px 80px 1fr 110px 110px 110px 100px', gap: '0', padding: '14px 20px', borderBottom: idx < densityData.length - 1 ? '1px solid #f8fafc' : 'none', background: row.isBottleneck ? '#fef2f2' : 'transparent', transition: 'background 0.2s' }}>"""

new_row_start = """<React.Fragment key={row.stage}>
                                    <div 
                                        onClick={() => row.isBottleneck && toggleRow(row.stage)}
                                        style={{ display: 'grid', gridTemplateColumns: '150px 80px 1fr 110px 110px 110px 100px', gap: '0', padding: '14px 20px', borderBottom: (idx < densityData.length - 1 && !expandedRows[row.stage]) ? '1px solid #f8fafc' : 'none', background: row.isBottleneck ? '#fef2f2' : 'transparent', transition: 'background 0.2s', cursor: row.isBottleneck ? 'pointer' : 'default' }}>"""

content = content.replace(old_row_start, new_row_start)

# Update the status column to include the dropdown icon
old_status = """                                            {row.isBottleneck ? (
                                                <span style={{ fontSize: '10px', fontWeight: 700, color: '#ef4444', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', padding: '3px 8px' }}>
                                                    <i className="fas fa-exclamation-triangle" style={{ marginRight: '4px' }} />BOTTLENECK
                                                </span>
                                            ) : row.avgDays > row.targetDays ? (
                                                <span style={{ fontSize: '10px', fontWeight: 700, color: '#f59e0b', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '6px', padding: '3px 8px' }}>
                                                    <i className="fas fa-eye" style={{ marginRight: '4px' }} />WATCH
                                                </span>
                                            ) : (
                                                <span style={{ fontSize: '10px', fontWeight: 700, color: '#10b981', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', padding: '3px 8px' }}>
                                                    <i className="fas fa-check" style={{ marginRight: '4px' }} />HEALTHY
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                );"""

new_status = """                                            {row.isBottleneck ? (
                                                <span style={{ fontSize: '10px', fontWeight: 700, color: '#ef4444', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', padding: '3px 8px', display: 'flex', alignItems: 'center' }}>
                                                    <i className="fas fa-exclamation-triangle" style={{ marginRight: '4px' }} />BOTTLENECK
                                                    <i className={`fas fa-chevron-${expandedRows[row.stage] ? 'up' : 'down'}`} style={{ marginLeft: '6px' }} />
                                                </span>
                                            ) : row.avgDays > row.targetDays ? (
                                                <span style={{ fontSize: '10px', fontWeight: 700, color: '#f59e0b', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '6px', padding: '3px 8px' }}>
                                                    <i className="fas fa-eye" style={{ marginRight: '4px' }} />WATCH
                                                </span>
                                            ) : (
                                                <span style={{ fontSize: '10px', fontWeight: 700, color: '#10b981', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', padding: '3px 8px' }}>
                                                    <i className="fas fa-check" style={{ marginRight: '4px' }} />HEALTHY
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    {expandedRows[row.stage] && row.agentBottlenecks && (
                                        <div style={{ background: '#fef2f2', padding: '0 20px 16px 20px', borderBottom: idx < densityData.length - 1 ? '1px solid #f8fafc' : 'none' }}>
                                            <div style={{ padding: '12px', background: '#fff', borderRadius: '8px', border: '1px solid #fecaca' }}>
                                                <h4 style={{ margin: '0 0 12px 0', fontSize: '12px', color: '#991b1b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Agent Bottleneck Report</h4>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                    {row.agentBottlenecks.map(agent => (
                                                        <div key={agent.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px', background: '#f9fafb', borderRadius: '6px' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                                <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, color: '#475569' }}>
                                                                    {agent.name.charAt(0)}
                                                                </div>
                                                                <span style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>{agent.name}</span>
                                                            </div>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                                                <span style={{ fontSize: '13px', fontWeight: 700, color: '#ef4444' }}>{agent.count} stalled</span>
                                                                <button style={{ padding: '4px 12px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>Nudge Agent</button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                    {row.agentBottlenecks.length === 0 && (
                                                        <div style={{ fontSize: '12px', color: '#6b7280' }}>No specific agents identified for this bottleneck.</div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </React.Fragment>
                                );"""

content = content.replace(old_status, new_status)

with open('src/pages/Settings/views/StagePage.jsx', 'w') as f:
    f.write(content)

print("Bottleneck UI patched")
