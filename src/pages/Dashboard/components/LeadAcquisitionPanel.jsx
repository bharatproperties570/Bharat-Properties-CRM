import { memo } from 'react';
import Chart from 'react-apexcharts';
import PipelineVelocityFunnel from './PipelineVelocityFunnel';

const LeadAcquisitionPanel = ({ charts, metrics, formatters }) => {
    const { leadTrendChart, sourceChart } = charts;
    const { perf, mtdVisits, leads } = metrics;
    const { fmtNum, fmtCr } = formatters;

    return (
        <div className="dashboard-panel-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '14px', marginBottom: '12px' }}>
            {/* Main Command Center */}
            <div className="glass-card" style={{ padding: '18px 20px', position: 'relative' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                    <div>
                        <h2 style={{ fontSize: '1.05rem', fontWeight: 900, margin: 0, letterSpacing: '-0.02em', color: 'var(--text-main)', lineHeight: 1.2 }}>ACQUISITION COMMAND</h2>
                        <p style={{ fontSize: '0.72rem', color: '#64748b', margin: '2px 0 0 0', fontWeight: 600 }}>REAL-TIME ENGINE TELEMETRY</p>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <div style={{ background: 'rgba(99, 102, 241, 0.1)', padding: '5px 10px', borderRadius: '10px', border: '1px solid rgba(99, 102, 241, 0.2)', textAlign: 'right' }}>
                            <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', display: 'block', fontWeight: 700, lineHeight: 1, marginBottom: '2px' }}>MTD INTAKE</span>
                            <span style={{ fontSize: '0.95rem', fontWeight: 900, color: '#6366f1', lineHeight: 1.1 }}>+{fmtNum(perf.mtdLeads)}</span>
                        </div>
                        <div style={{ background: 'rgba(16, 185, 129, 0.1)', padding: '5px 10px', borderRadius: '10px', border: '1px solid rgba(16, 185, 129, 0.2)', textAlign: 'right' }}>
                            <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', display: 'block', fontWeight: 700, lineHeight: 1, marginBottom: '2px' }}>CONV. RATE</span>
                            <span style={{ fontSize: '0.95rem', fontWeight: 900, color: '#10b981', lineHeight: 1.1 }}>{perf.conversion || 0}%</span>
                        </div>
                    </div>
                </div>

                {/* 1. Lead Volume Trend on Top */}
                <div style={{ marginBottom: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <h3 style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-muted)', margin: 0, letterSpacing: '0.05em' }}>LEAD VOLUME TREND</h3>
                    </div>
                    <div style={{ height: '200px', background: 'var(--panel-bg)', borderRadius: '16px', border: '1px solid var(--border-light)', padding: '12px 10px 0 0', boxSizing: 'border-box' }}>
                        <Chart 
                            options={leadTrendChart.options}
                            series={leadTrendChart.series}
                            type="area"
                            height="100%"
                        />
                    </div>
                </div>

                {/* 2. Bottom Grid: 4 Metric Cards (Left) + Pipeline Velocity Funnel (Right) */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', alignItems: 'stretch' }}>
                    {/* The 4 Telemetry Metric Cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        {[
                            { label: 'AVG RESPONSE', value: perf.avgResponseTime || 'N/A', icon: 'fa-tachometer-alt', color: '#6366f1' },
                            { label: 'LEAD VELOCITY', value: perf.leadVelocity || 'High', icon: 'fa-wind', color: '#10b981' },
                            { label: 'MTD VISITS', value: mtdVisits.reduce((s, v) => s + v.count, 0), icon: 'fa-map-marker-alt', color: '#f59e0b' },
                            { label: 'PIPE VALUE', value: fmtCr(perf.pipelineValue), icon: 'fa-chart-pie', color: '#8b5cf6' }
                        ].map((s, i) => (
                            <div key={i} style={{ background: 'var(--panel-bg)', padding: '14px 16px', borderRadius: '14px', border: '1px solid var(--border-light)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                                <div style={{ color: s.color, marginBottom: '6px', fontSize: '0.85rem' }}><i className={`fas ${s.icon}`}></i></div>
                                <div style={{ fontSize: '1.25rem', fontWeight: 900, color: 'var(--text-main)', letterSpacing: '-0.02em', lineHeight: 1.1 }}>{s.value}</div>
                                <div style={{ fontSize: '0.62rem', color: '#64748b', fontWeight: 700, marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{s.label}</div>
                            </div>
                        ))}
                    </div>

                    {/* Pipeline Velocity Funnel - Cleanly Contained Inside Module */}
                    <div style={{ minHeight: '190px' }}>
                        <PipelineVelocityFunnel leads={leads} formatters={formatters} />
                    </div>
                </div>
            </div>

            {/* Source Breakdown */}
            <div className="glass-card" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column' }}>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '2px', letterSpacing: '0.05em' }}>CHANNEL MIX</h3>
                <p style={{ fontSize: '0.72rem', color: '#64748b', marginBottom: '16px', fontWeight: 600 }}>SOURCE DISTRIBUTION</p>
                
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                    <Chart options={sourceChart.options} series={sourceChart.series} type="donut" width="100%" />
                </div>

                <div style={{ marginTop: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    {sourceChart.options.labels.slice(0, 4).map((label, i) => (
                        <div key={i} style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
                            <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: sourceChart.options.colors[i] }}></div>
                            {label}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default memo(LeadAcquisitionPanel);
