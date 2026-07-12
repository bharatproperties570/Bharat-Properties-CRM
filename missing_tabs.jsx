            {activeTab === 'density' && (() => {
                // Mock leads data for density computation — in prod these come from API
                const mockLeads = [
                    ...Array(12).fill(null).map(() => ({ stage: 'New', createdAt: new Date(Date.now() - 86400000 * 1), stageChangedAt: null })),
                    ...Array(8).fill(null).map(() => ({ stage: 'Prospect', createdAt: new Date(Date.now() - 86400000 * 8), stageChangedAt: new Date(Date.now() - 86400000 * 7) })),
                    ...Array(5).fill(null).map(() => ({ stage: 'Qualified', createdAt: new Date(Date.now() - 86400000 * 15), stageChangedAt: new Date(Date.now() - 86400000 * 12) })),
                    ...Array(4).fill(null).map(() => ({ stage: 'Opportunity', createdAt: new Date(Date.now() - 86400000 * 22), stageChangedAt: new Date(Date.now() - 86400000 * 20) })),
                    ...Array(3).fill(null).map(() => ({ stage: 'Negotiation', createdAt: new Date(Date.now() - 86400000 * 35), stageChangedAt: new Date(Date.now() - 86400000 * 30) })),
                    ...Array(1).fill(null).map(() => ({ stage: 'Booked', createdAt: new Date(Date.now() - 86400000 * 50), stageChangedAt: new Date(Date.now() - 86400000 * 45) })),
                ];
                const densityData = computeStageDensity(mockLeads, DEFAULT_STAGE_DENSITY_TARGETS);
                const maxCount = Math.max(...densityData.map(d => d.count), 1);

                return (
                    <div style={{ padding: '24px 32px', flex: 1 }}>
                        {/* Header */}
                        <div style={{ marginBottom: '24px' }}>
                            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#111827' }}>Stage Density Dashboard</h2>
                            <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#6b7280' }}>
                                Conversion %, Drop-off %, Avg Days per stage — identify pipeline bottlenecks
                            </p>
                        </div>

                        {/* Summary Cards */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '28px' }}>
                            {[
                                {
                                    icon: 'fa-filter', color: '#6366f1', label: 'Avg Conversion Rate',
                                    value: Math.round(densityData.slice(0, -1).reduce((s, d) => s + d.conversionRate, 0) / Math.max(densityData.length - 1, 1)) + '%',
                                    sub: 'Stage-to-stage progression'
                                },
                                {
                                    icon: 'fa-exclamation-triangle', color: '#ef4444', label: 'Bottleneck Stages',
                                    value: densityData.filter(d => d.isBottleneck).length,
                                    sub: densityData.filter(d => d.isBottleneck).map(d => d.stage).join(', ') || 'None detected'
                                },
                                {
                                    icon: 'fa-clock', color: '#f59e0b', label: 'Longest Avg Stage',
                                    value: (() => { const s = [...densityData].sort((a, b) => b.avgDays - a.avgDays)[0]; return s ? `${s.avgDays}d (${s.stage})` : '—'; })(),
                                    sub: 'Most time spent here'
                                },
                            ].map(c => (
                                <div key={c.label} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '18px 20px', display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                                    <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: c.color + '15', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                        <i className={`fas ${c.icon}`} style={{ color: c.color, fontSize: '15px' }} />
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>{c.label}</div>
                                        <div style={{ fontSize: '22px', fontWeight: 800, color: c.color, lineHeight: 1.2 }}>{c.value}</div>
                                        <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>{c.sub}</div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Funnel Table */}
                        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '14px', overflow: 'hidden' }}>
                            <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <i className="fas fa-chart-bar" style={{ color: '#6366f1', fontSize: '14px' }} />
                                <span style={{ fontWeight: 700, fontSize: '14px', color: '#374151' }}>Pipeline Funnel Analysis</span>
                                <span style={{ fontSize: '11px', color: '#94a3b8', marginLeft: 'auto' }}>Based on current lead distribution · Connect real API for live data</span>
                            </div>

                            {/* Column Headers */}
                            <div style={{ display: 'grid', gridTemplateColumns: '150px 80px 1fr 110px 110px 110px 100px', gap: '0', borderBottom: '1px solid #f1f5f9', padding: '10px 20px', backgroundColor: '#fafafa' }}>
                                {['Stage', 'Count', 'Volume Bar', 'Conv. Rate', 'Drop-off', 'Avg Days', 'Status'].map(h => (
                                    <div key={h} style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</div>
                                ))}
                            </div>

                            {densityData.map((row, idx) => {
                                const stageInfo = STAGE_PIPELINE.find(s => s.label === row.stage) || { color: '#94a3b8', icon: 'fa-circle' };
                                const barWidth = Math.round((row.count / maxCount) * 100);

                                return (
                                    <div key={row.stage} style={{ display: 'grid', gridTemplateColumns: '150px 80px 1fr 110px 110px 110px 100px', gap: '0', padding: '14px 20px', borderBottom: idx < densityData.length - 1 ? '1px solid #f8fafc' : 'none', background: row.isBottleneck ? '#fef2f2' : 'transparent', transition: 'background 0.2s' }}>
                                        {/* Stage Name */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: stageInfo.color, flexShrink: 0 }} />
                                            <span style={{ fontSize: '13px', fontWeight: 700, color: '#374151' }}>{row.stage}</span>
                                            <span style={{ fontSize: '10px', fontWeight: 700, color: stageInfo.color, background: stageInfo.color + '15', borderRadius: '4px', padding: '1px 6px' }}>{getStageProbability(row.stage)}%</span>
                                        </div>
                                        {/* Count */}
                                        <div style={{ fontSize: '14px', fontWeight: 800, color: '#111827', display: 'flex', alignItems: 'center' }}>{row.count}</div>
                                        {/* Bar */}
                                        <div style={{ display: 'flex', alignItems: 'center', paddingRight: '20px' }}>
                                            <div style={{ flex: 1, height: '8px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                                                <div style={{ width: `${barWidth}%`, height: '100%', background: row.isBottleneck ? '#ef4444' : stageInfo.color, borderRadius: '4px', transition: 'width 0.5s ease' }} />
                                            </div>
                                        </div>
                                        {/* Conversion Rate */}
                                        <div style={{ display: 'flex', alignItems: 'center' }}>
                                            <span style={{ fontSize: '13px', fontWeight: 700, color: row.conversionRate >= 50 ? '#10b981' : row.conversionRate >= 25 ? '#f59e0b' : '#ef4444' }}>
                                                {idx < densityData.length - 1 ? `${row.conversionRate}%` : '—'}
                                            </span>
                                        </div>
                                        {/* Drop-off */}
                                        <div style={{ display: 'flex', alignItems: 'center' }}>
                                            <span style={{ fontSize: '13px', fontWeight: 700, color: row.dropOffRate > 70 ? '#ef4444' : row.dropOffRate > 40 ? '#f59e0b' : '#10b981' }}>
                                                {idx < densityData.length - 1 ? `${row.dropOffRate}%` : '—'}
                                            </span>
                                        </div>
                                        {/* Avg Days */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <span style={{ fontSize: '13px', fontWeight: 700, color: row.avgDays > row.targetDays ? '#f59e0b' : '#374151' }}>{row.avgDays}d</span>
                                            <span style={{ fontSize: '10px', color: '#94a3b8' }}>/ {row.targetDays}d target</span>
                                        </div>
                                        {/* Status */}
                                        <div style={{ display: 'flex', alignItems: 'center' }}>
                                            {row.isBottleneck ? (
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
                                );
                            })}
                        </div>

                        {/* Legend */}
                        <div style={{ marginTop: '16px', display: 'flex', gap: '20px', fontSize: '12px', color: '#94a3b8' }}>
                            <span><span style={{ color: '#10b981', fontWeight: 700 }}>●</span> Conv. Rate ≥ 50% = Healthy</span>
                            <span><span style={{ color: '#f59e0b', fontWeight: 700 }}>●</span> 25–50% = Watch</span>
                            <span><span style={{ color: '#ef4444', fontWeight: 700 }}>●</span> &lt;25% = Bottleneck</span>
                            <span style={{ marginLeft: 'auto' }}>Probability % shown as win probability per stage</span>
                        </div>
                    </div>
                );
            })()}

            {/* ─── TAB: Stability Lock Config ─── */}
            {activeTab === 'stability' && (
                <div style={{ padding: '24px 32px', flex: 1 }}>
                    <div style={{ marginBottom: '24px' }}>
                        <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#111827' }}>Stage Stability Lock</h2>
                        <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#6b7280' }}>
                            Prevents false regressions — a stage cannot downgrade until minimum activity thresholds are met
                        </p>
                    </div>

                    {/* How it works */}
                    <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '12px', padding: '16px 20px', marginBottom: '24px', display: 'flex', gap: '12px' }}>
                        <i className="fas fa-info-circle" style={{ color: '#3b82f6', fontSize: '16px', marginTop: '2px', flexShrink: 0 }} />
                        <div style={{ fontSize: '13px', color: '#1e40af', lineHeight: 1.6 }}>
                            <strong>How it works:</strong> When an activity is saved and the computed stage is lower than the current stage (a downgrade), the engine checks
                            if the minimum thresholds are met. If not, the stage stays at its current value and a warning is logged. This prevents a simple
                            "re-introduction call" from accidentally moving a lead from <em>Negotiation</em> back to <em>Prospect</em>.
                        </div>
                    </div>

                    {/* Stability Rules Table */}
                    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '14px', overflow: 'hidden' }}>
                        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
                            <span style={{ fontWeight: 700, fontSize: '14px', color: '#374151' }}>
                                <i className="fas fa-lock" style={{ color: '#6366f1', marginRight: '8px' }} />
                                Stability Rules per Stage
                            </span>
                        </div>

                        {/* Header Row */}
                        <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr 1fr 1fr', padding: '10px 20px', borderBottom: '1px solid #f1f5f9', background: '#fafafa' }}>
                            {['Stage', 'Min Activities (to downgrade)', 'Min Days in Stage', 'Lock Reason'].map(h => (
                                <div key={h} style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</div>
                            ))}
                        </div>

                        {STAGE_PIPELINE.filter(s => !['New', 'Closed Won', 'Closed Lost', 'Stalled'].includes(s.label)).map((stage, idx, arr) => {
                            const lock = STAGE_STABILITY_CONFIG[stage.label];
                            return (
                                <div key={stage.id} style={{ display: 'grid', gridTemplateColumns: '180px 1fr 1fr 1fr', padding: '16px 20px', borderBottom: idx < arr.length - 1 ? '1px solid #f8fafc' : 'none', alignItems: 'center' }}>
                                    {/* Stage */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: stage.color }} />
                                        <span style={{ fontWeight: 700, fontSize: '14px', color: '#374151' }}>{stage.label}</span>
                                    </div>
                                    {/* Min Activities */}
                                    <div>
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#eff6ff', color: '#3b82f6', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '4px 12px', fontSize: '13px', fontWeight: 700 }}>
                                            <i className="fas fa-tasks" style={{ fontSize: '11px' }} />
                                            {lock ? (lock.minActivities >= 999 ? 'Locked ∞' : `${lock.minActivities} activity`) : '—'}
                                        </span>
                                    </div>
                                    {/* Min Days */}
                                    <div>
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: '6px', padding: '4px 12px', fontSize: '13px', fontWeight: 700 }}>
                                            <i className="fas fa-clock" style={{ fontSize: '11px' }} />
                                            {lock ? `${lock.minDays} day${lock.minDays !== 1 ? 's' : ''}` : '—'}
                                        </span>
                                    </div>
                                    {/* Label */}
                                    <div style={{ fontSize: '12px', color: '#6b7280', fontStyle: 'italic' }}>
                                        {lock?.label || 'No lock configured'}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Probability Calibration */}
                    <div style={{ marginTop: '24px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '14px', overflow: 'hidden' }}>
                        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
                            <span style={{ fontWeight: 700, fontSize: '14px', color: '#374151' }}>
                                <i className="fas fa-percentage" style={{ color: '#f59e0b', marginRight: '8px' }} />
                                Win Probability per Stage (Forecast Calibration)
                            </span>
                        </div>
                        <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px' }}>
                            {STAGE_PIPELINE.map(stage => (
                                <div key={stage.id} style={{ background: stage.color + '10', border: `1px solid ${stage.color}40`, borderRadius: '10px', padding: '14px 16px', textAlign: 'center' }}>
                                    <i className={`fas ${stage.icon}`} style={{ color: stage.color, fontSize: '18px', marginBottom: '8px', display: 'block' }} />
                                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#374151', marginBottom: '4px' }}>{stage.label}</div>
                                    <div style={{ fontSize: '24px', fontWeight: 900, color: stage.color }}>{stage.probability}%</div>
                                    <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '4px' }}>Win Probability</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* ─── TAB 3: Engine Status ─── */}
