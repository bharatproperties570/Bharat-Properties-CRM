/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * MARKET PULSE WIDGET — Dashboard KPI Component
 * Bharat Properties CRM — Phase 2
 * 
 * Shows: Hot Markets (appreciating) + Buyer's Markets (declining) + Stable
 * Usage: <MarketPulseWidget />
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */
import React, { useEffect, useState } from 'react';
import { pricingAPI, formatINRFull } from '../utils/pricingAPI';

const AREA_UNIT_LABELS = {
    PER_SQ_FT:  '/Sq.Ft.',
    PER_SQ_YD:  '/Sq.Yd.',
    PER_KANAL:  '/Kanal',
    PER_ACRE:   '/Acre',
    PER_MARLA:  '/Marla',
};

const MarketRow = ({ location, subCategory, avgClosedRPU, trendPct, dealCount, areaUnit, color, icon }) => (
    <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '10px 0', borderBottom: '1px solid #f1f5f9',
    }}>
        <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {location}
            </div>
            <div style={{ fontSize: '0.63rem', color: '#94a3b8', marginTop: '2px' }}>
                {subCategory} · {dealCount} closed deals
            </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '12px' }}>
            {avgClosedRPU && (
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#374151' }}>
                    {formatINRFull(avgClosedRPU)}{AREA_UNIT_LABELS[areaUnit] || ''}
                </div>
            )}
            {trendPct !== null && trendPct !== undefined && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px', marginTop: '2px' }}>
                    <i className={`fas ${icon}`} style={{ fontSize: '0.6rem', color }} />
                    <span style={{ fontSize: '0.65rem', fontWeight: 800, color }}>
                        {trendPct >= 0 ? '+' : ''}{trendPct?.toFixed(1)}%
                    </span>
                </div>
            )}
        </div>
    </div>
);

const EmptyState = ({ message }) => (
    <div style={{ padding: '20px 0', textAlign: 'center' }}>
        <i className="fas fa-chart-bar" style={{ fontSize: '1.5rem', color: '#e2e8f0', marginBottom: '8px' }} />
        <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{message}</div>
    </div>
);

export default function MarketPulseWidget() {
    const [pulse, setPulse] = useState(null);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState('hot'); // 'hot' | 'stable' | 'down'

    useEffect(() => {
        pricingAPI.getMarketPulse({ limit: 5 })
            .then(res => { if (res.status === 'success') setPulse(res.data); })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    const tabs = [
        { key: 'hot',    label: 'Hot Markets',  icon: 'fa-fire', color: '#16a34a', data: pulse?.hotMarkets },
        { key: 'stable', label: 'Stable',        icon: 'fa-minus', color: '#d97706', data: pulse?.stableMarkets },
        { key: 'down',   label: 'Declining',     icon: 'fa-arrow-trend-down', color: '#dc2626', data: pulse?.downMarkets },
    ];

    const activeTab = tabs.find(t => t.key === tab);

    return (
        <div style={{
            background: '#fff', borderRadius: '18px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
            overflow: 'hidden',
        }}>
            {/* Header */}
            <div style={{
                padding: '16px 20px',
                background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '32px', height: '32px', background: 'rgba(255,255,255,0.2)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <i className="fas fa-pulse" style={{ color: '#fff', fontSize: '0.85rem' }} />
                    </div>
                    <div>
                        <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#fff' }}>Market Pulse</div>
                        <div style={{ fontSize: '0.63rem', color: 'rgba(255,255,255,0.7)', marginTop: '1px' }}>Real-time price trend by location</div>
                    </div>
                </div>
                {!loading && pulse && (
                    <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: '20px', padding: '3px', display: 'flex', gap: '2px' }}>
                        {tabs.map(t => (
                            <button key={t.key} onClick={() => setTab(t.key)} style={{
                                padding: '4px 10px', borderRadius: '16px', border: 'none', cursor: 'pointer', fontSize: '0.63rem', fontWeight: 700,
                                background: tab === t.key ? '#fff' : 'transparent',
                                color: tab === t.key ? '#4f46e5' : 'rgba(255,255,255,0.8)',
                                transition: 'all 0.2s ease',
                            }}>{t.label}</button>
                        ))}
                    </div>
                )}
            </div>

            <div style={{ padding: '16px 20px' }}>
                {loading ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 0' }}>
                        <div style={{ width: '16px', height: '16px', border: '2px solid #e2e8f0', borderTopColor: '#4f46e5', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                        <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Loading market data…</span>
                        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                    </div>
                ) : !pulse ? (
                    <EmptyState message="Run benchmark aggregation to populate market data." />
                ) : (
                    <>
                        {/* Tab indicator */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '14px' }}>
                            <i className={`fas ${activeTab.icon}`} style={{ color: activeTab.color, fontSize: '0.8rem' }} />
                            <span style={{ fontSize: '0.72rem', fontWeight: 800, color: activeTab.color }}>{activeTab.label}</span>
                            <span style={{ fontSize: '0.65rem', color: '#94a3b8', marginLeft: '4px' }}>
                                ({activeTab.data?.length || 0} locations)
                            </span>
                        </div>

                        {/* Market rows */}
                        {activeTab.data?.length > 0 ? (
                            activeTab.data.map((m, i) => (
                                <MarketRow
                                    key={i}
                                    {...m}
                                    color={activeTab.color}
                                    icon={activeTab.icon}
                                />
                            ))
                        ) : (
                            <EmptyState message={`No ${activeTab.label.toLowerCase()} markets found. More closed deals needed.`} />
                        )}

                        {/* Refresh trigger */}
                        <div style={{ marginTop: '14px', textAlign: 'center' }}>
                            <button
                                onClick={() => {
                                    setLoading(true);
                                    pricingAPI.aggregate({ trailingDays: 90 })
                                        .then(() => pricingAPI.getMarketPulse({ limit: 5 }))
                                        .then(res => { if (res.status === 'success') setPulse(res.data); })
                                        .catch(() => {})
                                        .finally(() => setLoading(false));
                                }}
                                style={{
                                    fontSize: '0.65rem', color: '#4f46e5', background: 'none', border: 'none',
                                    cursor: 'pointer', fontWeight: 700, textDecoration: 'underline',
                                }}
                            >
                                <i className="fas fa-sync-alt" style={{ marginRight: '4px', fontSize: '0.6rem' }} />
                                Refresh Benchmarks
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
