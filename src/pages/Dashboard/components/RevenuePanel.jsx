import { memo } from 'react';
import Chart from 'react-apexcharts';

const RevenuePanel = ({ charts, metrics, formatters }) => {
    const { cashFlowChart } = charts;
    const { perf, recentDeals } = metrics;
    const { fmtCr } = formatters;

    return (
        <div className="dashboard-panel-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 400px', gap: '24px', marginBottom: '32px' }}>
            {/* Revenue & Cashflow */}
            <div className="glass-card" style={{ padding: '20px', borderLeft: '4px solid #10b981' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
                    <div>
                        <h3 style={{ fontSize: '1.1rem', fontWeight: 900, color: '#fff', margin: 0, letterSpacing: '0.05em' }}>FINANCIAL INTELLIGENCE</h3>
                        <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px', fontWeight: 600 }}>MTD PERFORMANCE vs TARGET</p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#10b981' }}>{fmtCr(perf.mtdCommission)}</div>
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>TGT: {fmtCr(perf.target)}</div>
                    </div>
                </div>

                <div className="perf-metric-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
                    {[
                        { label: 'MTD SALES PROGRESS', val: Math.min(100, Math.round((perf.achieved / perf.target) * 100)), colors: ['#10b981', '#34d399'] },
                        { label: 'BOOKING VELOCITY', val: perf.bookingTarget || 0, colors: ['#6366f1', '#a5b4fc'] }
                    ].map((t, i) => (
                        <div key={i}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', fontWeight: 700, marginBottom: '10px', color: '#94a3b8' }}>
                                <span>{t.label}</span>
                                <span style={{ color: '#fff' }}>{t.val}%</span>
                            </div>
                            <div style={{ height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '10px', overflow: 'hidden' }}>
                                <div style={{ width: `${t.val}%`, height: '100%', background: `linear-gradient(90deg, ${t.colors[0]}, ${t.colors[1]})`, borderRadius: '10px', boxShadow: `0 0 10px ${t.colors[0]}40` }}></div>
                            </div>
                        </div>
                    ))}
                </div>

                <div style={{ height: '180px' }}>
                    <Chart options={cashFlowChart.options} series={cashFlowChart.series} type="area" height="100%" />
                </div>
            </div>

            {/* Recent High Value Deals */}
            <div className="glass-card" style={{ padding: '24px' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 900, color: '#fff', marginBottom: '4px', letterSpacing: '0.05em' }}>LIVE PIPELINE</h3>
                <p style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '24px', fontWeight: 600 }}>LATEST TRANSACTION FLOW</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {recentDeals.slice(0, 5).map((deal, idx) => (
                        <div key={idx} style={{ padding: '16px', background: 'rgba(15, 23, 42, 0.4)', borderRadius: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid rgba(255,255,255,0.02)' }}>
                            <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{deal.project}</div>
                                <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>{deal.unitNo} • {new Date(deal.updatedAt).toLocaleDateString()}</div>
                            </div>
                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                <div style={{ fontSize: '0.9rem', fontWeight: 900, color: '#10b981' }}>{fmtCr(deal.value)}</div>
                                <div style={{ fontSize: '0.6rem', color: '#6366f1', background: 'rgba(99, 102, 241, 0.1)', padding: '2px 8px', borderRadius: '4px', display: 'inline-block', marginTop: '4px', fontWeight: 700 }}>{deal.stage?.toUpperCase()}</div>
                            </div>
                        </div>
                    ))}
                    {recentDeals.length === 0 && (
                        <div style={{ padding: '60px 20px', textAlign: 'center' }}>
                            <div style={{ color: 'rgba(255,255,255,0.05)', fontSize: '3rem', marginBottom: '12px' }}><i className="fas fa-satellite-dish"></i></div>
                            <p style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 600 }}>SCANNING FOR ACTIVE DEALS...</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default memo(RevenuePanel);
