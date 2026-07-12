import json

file_path = "src/pages/Settings/views/StagePage.jsx"
with open(file_path, "r") as f:
    content = f.read()

status_tab_content = """
            {/* ─── TAB 3: Engine Status ─── */}
            {activeTab === 'status' && (
                <div style={{ padding: '24px 32px', flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
                        <div>
                            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#111827' }}>Engine Observability</h2>
                            <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#6b7280' }}>
                                Real-time monitoring of stage transitions, cache health, and system blocks.
                            </p>
                        </div>
                        <button onClick={fetchObservabilityData} disabled={observabilityLoading} style={{ padding: '8px 16px', background: '#fff', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <i className={`fas fa-sync-alt ${observabilityLoading ? 'fa-spin' : ''}`} /> Refresh
                        </button>
                    </div>

                    {/* System Status Cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                        {[
                            { icon: 'fa-database', label: 'Cache Status', value: engineHealth?.cacheStatus || 'Unknown', color: '#10b981', sub: 'Redis Rules Cache' },
                            { icon: 'fa-check-circle', label: 'Today Success', value: engineHealth?.todayStats?.success || 0, color: '#3b82f6', sub: 'Transitions completed' },
                            { icon: 'fa-times-circle', label: 'Today Blocked', value: (engineHealth?.todayStats?.blocked || 0) + (engineHealth?.todayStats?.missing_fields || 0), color: '#f59e0b', sub: 'Missing forms / KYC' },
                            { icon: 'fa-exclamation-triangle', label: 'Today Failed', value: engineHealth?.todayStats?.no_rule || 0, color: '#ef4444', sub: 'No matching rules' },
                        ].map(card => (
                            <div key={card.label} style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '20px', display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: card.color + '15', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    <i className={`fas ${card.icon}`} style={{ color: card.color, fontSize: '16px' }} />
                                </div>
                                <div>
                                    <div style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600, marginBottom: '2px' }}>{card.label}</div>
                                    <div style={{ fontSize: '20px', fontWeight: 800, color: card.color }}>{card.value}</div>
                                    <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>{card.sub}</div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Failed Transitions Table */}
                    <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
                            <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#374151' }}>Recent Failed & Blocked Transitions</h3>
                        </div>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                            <thead>
                                <tr style={{ background: '#fafafa', borderBottom: '1px solid #f1f5f9' }}>
                                    {['Time', 'Lead', 'Activity', 'Intended Stage', 'Failure Reason'].map(h => (
                                        <th key={h} style={{ padding: '12px 20px', textAlign: 'left', fontWeight: 700, color: '#6b7280', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {failedTransitions.map((log, idx) => (
                                    <tr key={log._id} style={{ borderBottom: idx < failedTransitions.length - 1 ? '1px solid #f8fafc' : 'none' }}>
                                        <td style={{ padding: '12px 20px', color: '#6b7280' }}>
                                            {new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </td>
                                        <td style={{ padding: '12px 20px', fontWeight: 600, color: '#374151' }}>
                                            {log.leadId?.firstName} {log.leadId?.lastName}
                                        </td>
                                        <td style={{ padding: '12px 20px' }}>
                                            <span style={{ background: '#f1f5f9', padding: '2px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 600 }}>{log.activityType}</span>
                                            <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>{log.outcome}</div>
                                        </td>
                                        <td style={{ padding: '12px 20px', color: '#6366f1', fontWeight: 600 }}>
                                            {log.newStage || 'Unknown'}
                                        </td>
                                        <td style={{ padding: '12px 20px' }}>
                                            <span style={{ color: log.status === 'blocked' || log.status === 'missing_fields' ? '#f59e0b' : '#ef4444', fontWeight: 600 }}>
                                                {log.failureReason}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                                {failedTransitions.length === 0 && !observabilityLoading && (
                                    <tr>
                                        <td colSpan="5" style={{ padding: '32px', textAlign: 'center', color: '#94a3b8' }}>
                                            No failed transitions in the last 7 days. Engine is running smoothly!
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
"""

content = content.replace("{/* TAB 3: Lead ↔ Deal Sync Engine */}", status_tab_content + "\n            {/* TAB 4: Lead ↔ Deal Sync Engine */}")

with open(file_path, "w") as f:
    f.write(content)

print("Patch applied")
