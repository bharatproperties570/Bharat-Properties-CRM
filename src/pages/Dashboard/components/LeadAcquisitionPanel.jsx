import { memo } from 'react';
import Chart from 'react-apexcharts';

const LeadAcquisitionPanel = ({ charts, metrics, formatters }) => {
    const { leadTrendChart, sourceChart } = charts;
    const { perf, mtdVisits } = metrics;
    const { fmtNum, fmtCr } = formatters;

    return (
        <div className="dashboard-panel-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '24px', marginBottom: '32px' }}>
            {/* Main Command Center */}
            <div className="glass-card" style={{ padding: '24px', position: 'relative' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
                    <div>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 900, margin: 0, letterSpacing: '-0.02em', color: '#fff' }}>ACQUISITION COMMAND</h2>
                        <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '4px 0 0 0', fontWeight: 600 }}>REAL-TIME ENGINE TELEMETRY</p>
                    </div>
                    <div style={{ display: 'flex', gap: '12px' }}>
                        <div style={{ background: 'rgba(99, 102, 241, 0.1)', padding: '10px 16px', borderRadius: '14px', border: '1px solid rgba(99, 102, 241, 0.2)' }}>
                            <span style={{ fontSize: '0.7rem', color: '#94a3b8', display: 'block', fontWeight: 700, marginBottom: '2px' }}>MTD INTAKE</span>
                            <span style={{ fontSize: '1.2rem', fontWeight: 900, color: '#6366f1' }}>+{fmtNum(perf.mtdLeads)}</span>
                        </div>
                        <div style={{ background: 'rgba(16, 185, 129, 0.1)', padding: '10px 16px', borderRadius: '14px', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                            <span style={{ fontSize: '0.7rem', color: '#94a3b8', display: 'block', fontWeight: 700, marginBottom: '2px' }}>CONV. RATE</span>
                            <span style={{ fontSize: '1.2rem', fontWeight: 900, color: '#10b981' }}>{perf.conversion || 0}%</span>
                        </div>
                    </div>
                </div>

                <div className="acq-metric-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '32px' }}>
                    {[
                        { label: 'AVG RESPONSE', value: perf.avgResponseTime || 'N/A', icon: 'fa-tachometer-alt', color: '#6366f1' },
                        { label: 'LEAD VELOCITY', value: perf.leadVelocity || 'STABLE', icon: 'fa-wind', color: '#10b981' },
                        { label: 'MTD VISITS', value: mtdVisits.reduce((s, v) => s + v.count, 0), icon: 'fa-map-marker-alt', color: '#f59e0b' },
                        { label: 'PIPE VALUE', value: fmtCr(perf.pipelineValue), icon: 'fa-chart-pie', color: '#8b5cf6' }
                    ].map((s, i) => (
                        <div key={i} style={{ background: 'rgba(15, 23, 42, 0.4)', padding: '16px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.03)' }}>
                            <div style={{ color: s.color, marginBottom: '8px', fontSize: '0.9rem' }}><i className={`fas ${s.icon}`}></i></div>
                            <div style={{ fontSize: '1.2rem', fontWeight: 900, color: '#fff' }}>{s.value}</div>
                            <div style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 700, marginTop: '4px' }}>{s.label}</div>
                        </div>
                    ))}
                </div>

                <div style={{ height: '260px', marginTop: '10px' }}>
                    <Chart 
                        options={leadTrendChart.options}
                        series={leadTrendChart.series}
                        type="area"
                        height="100%"
                    />
                </div>
            </div>

            {/* Source Breakdown */}
            <div className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 800, color: '#fff', marginBottom: '4px', letterSpacing: '0.05em' }}>CHANNEL MIX</h3>
                <p style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '24px', fontWeight: 600 }}>SOURCE DISTRIBUTION</p>
                
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                    <Chart options={sourceChart.options} series={sourceChart.series} type="donut" width="100%" />
                </div>

                <div style={{ marginTop: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    {sourceChart.options.labels.slice(0, 4).map((label, i) => (
                        <div key={i} style={{ fontSize: '0.7rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
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
