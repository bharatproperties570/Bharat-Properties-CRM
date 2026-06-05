/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * PRICE INTELLIGENCE CARD — Enterprise Grade Component
 * Bharat Properties CRM — Phase 2
 * 
 * Usage:
 *   <PriceIntelligenceCard inventoryId="xxx" />
 *   <PriceIntelligenceCard dealId="xxx" />
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */
import React, { useEffect, useState, useRef } from 'react';
import { pricingAPI, POSITIONING_CONFIG, TREND_CONFIG, PERSONA_CONFIG, formatINRShort, formatINRFull } from '../../utils/pricingAPI';

// ─── Micro sub-components ────────────────────────────────────────────────────

const Pill = ({ label, color, bg, border, icon }) => (
    <span style={{
        display: 'inline-flex', alignItems: 'center', gap: '5px',
        padding: '3px 10px', borderRadius: '999px',
        background: bg, border: `1px solid ${border}`,
        color, fontSize: '0.7rem', fontWeight: 700,
    }}>
        {icon && <i className={`fas ${icon}`} style={{ fontSize: '0.65rem' }} />}
        {label}
    </span>
);

const StatRow = ({ label, value, color, subValue, bold }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
        <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 500 }}>{label}</span>
        <div style={{ textAlign: 'right' }}>
            <span style={{ fontSize: bold ? '0.85rem' : '0.78rem', fontWeight: bold ? 800 : 600, color: color || '#1e293b' }}>
                {value || '—'}
            </span>
            {subValue && <div style={{ fontSize: '0.65rem', color: '#94a3b8', marginTop: '1px' }}>{subValue}</div>}
        </div>
    </div>
);

const ScoreBar = ({ score }) => {
    const color = score >= 70 ? '#16a34a' : score >= 40 ? '#d97706' : '#dc2626';
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
            <div style={{ flex: 1, height: '6px', background: '#e2e8f0', borderRadius: '999px', overflow: 'hidden' }}>
                <div style={{
                    height: '100%', width: `${score}%`,
                    background: `linear-gradient(90deg, ${color}80, ${color})`,
                    borderRadius: '999px', transition: 'width 1s ease'
                }} />
            </div>
            <span style={{ fontSize: '0.7rem', fontWeight: 800, color, minWidth: '28px', textAlign: 'right' }}>{score}/100</span>
        </div>
    );
};

const PriceBandRow = ({ band, value, note, highlight }) => (
    <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '10px 14px', borderRadius: '10px', marginBottom: '6px',
        background: highlight ? 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)' : '#f8fafc',
        border: highlight ? '1.5px solid #86efac' : '1px solid #e2e8f0',
    }}>
        <div>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#1e293b' }}>{band}</div>
            <div style={{ fontSize: '0.65rem', color: '#94a3b8', marginTop: '2px' }}>{note}</div>
        </div>
        <div style={{ fontSize: highlight ? '1rem' : '0.85rem', fontWeight: 800, color: highlight ? '#16a34a' : '#374151' }}>
            {value}
        </div>
    </div>
);

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PriceIntelligenceCard({ inventoryId, dealId, compact = false }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [expanded, setExpanded] = useState(!compact);
    const hasFetched = useRef(false);

    useEffect(() => {
        if (hasFetched.current) return;
        if (!inventoryId && !dealId) return;
        hasFetched.current = true;

        const params = inventoryId ? { inventoryId } : { dealId };
        setLoading(true);
        pricingAPI.suggest(params)
            .then(res => {
                if (res.status === 'success') setData(res.data);
                else setError('Could not fetch price intelligence');
            })
            .catch(() => setError('Pricing service unavailable'))
            .finally(() => setLoading(false));
    }, [inventoryId, dealId]);

    if (loading) return (
        <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '24px', height: '24px', border: '3px solid #e2e8f0', borderTopColor: '#4f46e5', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 600 }}>Analyzing market prices…</span>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );

    if (error || !data) return (
        <div style={{ background: '#fef2f2', borderRadius: '16px', border: '1px solid #fecaca', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <i className="fas fa-info-circle" style={{ color: '#94a3b8' }} />
            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                {error || 'No pricing data available. Add closed deals in this location to enable market intelligence.'}
            </span>
        </div>
    );

    const pos = POSITIONING_CONFIG[data.marketPositioning] || POSITIONING_CONFIG.no_data;
    const trend = TREND_CONFIG[data.benchmark?.trend] || TREND_CONFIG.insufficient_data;
    const persona = PERSONA_CONFIG[data.buyerPersona] || PERSONA_CONFIG.neutral;
    const oa = data.orientationAnalysis;

    return (
        <div style={{
            background: 'linear-gradient(135deg, #ffffff 0%, #fafbff 100%)',
            borderRadius: '18px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 4px 20px rgba(79,70,229,0.06)',
            overflow: 'hidden',
        }}>
            {/* ── Header ── */}
            <div
                onClick={() => compact && setExpanded(e => !e)}
                style={{
                    padding: '16px 20px',
                    borderBottom: expanded ? '1px solid #f1f5f9' : 'none',
                    background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
                    cursor: compact ? 'pointer' : 'default',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '32px', height: '32px', background: 'rgba(255,255,255,0.2)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <i className="fas fa-brain" style={{ color: '#fff', fontSize: '0.85rem' }} />
                    </div>
                    <div>
                        <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.01em' }}>Price Intelligence</div>
                        <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.75)', marginTop: '1px' }}>
                            {data.subCategory} · {data.location || 'Location'}
                        </div>
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Pill {...pos} label={pos.shortLabel} />
                    {compact && (
                        <i className={`fas fa-chevron-${expanded ? 'up' : 'down'}`} style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.75rem' }} />
                    )}
                </div>
            </div>

            {expanded && (
                <div style={{ padding: '20px' }}>

                    {/* ── Market Positioning Banner ── */}
                    <div style={{
                        padding: '12px 16px', borderRadius: '12px', marginBottom: '18px',
                        background: pos.bg, border: `1px solid ${pos.border}`,
                        display: 'flex', alignItems: 'flex-start', gap: '12px'
                    }}>
                        <i className={`fas ${pos.icon}`} style={{ color: pos.color, marginTop: '2px', fontSize: '1rem' }} />
                        <div>
                            <div style={{ fontSize: '0.78rem', fontWeight: 800, color: pos.color }}>{pos.label}</div>
                            <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '3px' }}>{pos.tip}</div>
                        </div>
                    </div>

                    {/* ── Rate Per Unit ── */}
                    {data.currentRatePerUnit && (
                        <div style={{ display: 'flex', gap: '12px', marginBottom: '18px' }}>
                            <div style={{ flex: 1, background: '#f8fafc', borderRadius: '12px', padding: '14px', border: '1px solid #e2e8f0' }}>
                                <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>This Property</div>
                                <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#1e293b', marginTop: '4px' }}>
                                    {formatINRFull(data.currentRatePerUnit)}
                                </div>
                                <div style={{ fontSize: '0.65rem', color: '#64748b', marginTop: '2px' }}>{data.areaUnitLabel}</div>
                            </div>
                            {data.benchmark?.avgClosedRPU && (
                                <div style={{ flex: 1, background: '#f0fdf4', borderRadius: '12px', padding: '14px', border: '1px solid #bbf7d0' }}>
                                    <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Market Avg (Closed)</div>
                                    <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#16a34a', marginTop: '4px' }}>
                                        {formatINRFull(data.benchmark.avgClosedRPU)}
                                    </div>
                                    <div style={{ fontSize: '0.65rem', color: '#64748b', marginTop: '2px' }}>
                                        {data.areaUnitLabel} · {data.benchmark.dealCount} deals
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── Price Bands ── */}
                    {data.priceBands && (
                        <div style={{ marginBottom: '18px' }}>
                            <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#374151', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                <i className="fas fa-sliders" style={{ marginRight: '6px', color: '#4f46e5' }} />
                                Suggested Price Bands
                            </div>
                            <PriceBandRow band="🔴 Aggressive — Quick Sale" note={data.priceBands.aggressive.note} value={formatINRShort(data.priceBands.aggressive.value)} />
                            <PriceBandRow band="🟢 Fair Market Value" note={data.priceBands.fair.note} value={formatINRShort(data.priceBands.fair.value)} highlight />
                            <PriceBandRow band="🟡 Patient Price — Hold" note={data.priceBands.patient.note} value={formatINRShort(data.priceBands.patient.value)} />
                        </div>
                    )}

                    {/* ── Orientation Analysis ── */}
                    <div style={{ marginBottom: '18px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                            <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                <i className="fas fa-compass" style={{ marginRight: '6px', color: '#4f46e5' }} />
                                Orientation Premium
                            </div>
                            <div style={{ fontSize: '0.9rem', fontWeight: 900, color: oa.totalPremiumPct >= 0 ? '#16a34a' : '#dc2626' }}>
                                {oa.totalPremiumPct >= 0 ? '+' : ''}{oa.totalPremiumPct}%
                            </div>
                        </div>

                        <ScoreBar score={oa.orientationScore} />

                        <div style={{ marginTop: '12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                            {[
                                { label: 'Facing', val: oa.facing, pct: oa.facingPremiumPct },
                                { label: 'Direction', val: oa.direction, pct: oa.directionPremiumPct },
                                { label: 'Road Width', val: oa.roadWidth, pct: oa.roadWidthPremiumPct },
                                { label: 'Unit/Floor', val: oa.orientation, pct: oa.unitPremiumPct },
                            ].map(({ label, val, pct }) => val ? (
                                <div key={label} style={{ background: '#f8fafc', borderRadius: '8px', padding: '8px 10px', border: '1px solid #e2e8f0' }}>
                                    <div style={{ fontSize: '0.6rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>{label}</div>
                                    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#1e293b', marginTop: '2px' }}>{val}</div>
                                    <div style={{ fontSize: '0.68rem', fontWeight: 800, color: pct >= 0 ? '#16a34a' : '#dc2626', marginTop: '2px' }}>
                                        {pct >= 0 ? '+' : ''}{pct}%
                                    </div>
                                </div>
                            ) : null)}
                        </div>

                        {oa.tags?.length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginTop: '10px' }}>
                                {oa.tags.map(tag => (
                                    <span key={tag} style={{
                                        padding: '2px 8px', borderRadius: '999px', fontSize: '0.63rem', fontWeight: 700,
                                        background: '#f0f0ff', color: '#4f46e5', border: '1px solid #c7d2fe'
                                    }}>{tag}</span>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* ── Market Trend + Buyer Persona ── */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
                        {data.benchmark?.trend && (
                            <div style={{ background: '#f8fafc', borderRadius: '10px', padding: '12px', border: '1px solid #e2e8f0' }}>
                                <div style={{ fontSize: '0.6rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', marginBottom: '6px' }}>Market Trend</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <i className={`fas ${trend.icon}`} style={{ color: trend.color, fontSize: '0.8rem' }} />
                                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: trend.color }}>{trend.label}</span>
                                </div>
                                {data.benchmark.trendPct !== null && (
                                    <div style={{ fontSize: '0.65rem', color: '#64748b', marginTop: '4px' }}>
                                        {data.benchmark.trendPct >= 0 ? '+' : ''}{data.benchmark.trendPct}% vs prev period
                                    </div>
                                )}
                            </div>
                        )}
                        <div style={{ background: persona.bg, borderRadius: '10px', padding: '12px', border: '1px solid #e2e8f0' }}>
                            <div style={{ fontSize: '0.6rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', marginBottom: '6px' }}>Best Suited For</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <i className={`fas ${persona.icon}`} style={{ color: persona.color, fontSize: '0.8rem' }} />
                                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: persona.color }}>{persona.label}</span>
                            </div>
                        </div>
                    </div>

                    {/* ── Negotiation Intelligence ── */}
                    {data.benchmark?.avgNegotiationGapPct !== null && data.benchmark?.avgNegotiationGapPct !== undefined && (
                        <div style={{ background: '#fffbeb', borderRadius: '10px', padding: '12px 14px', border: '1px solid #fde68a', display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <i className="fas fa-handshake" style={{ color: '#d97706', fontSize: '0.9rem' }} />
                            <div>
                                <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#92400e' }}>Negotiation Insight</div>
                                <div style={{ fontSize: '0.67rem', color: '#78350f', marginTop: '2px' }}>
                                    In this market, sellers typically accept <strong>{data.benchmark.avgNegotiationGapPct?.toFixed(1)}%</strong> below their asking price.
                                    {data.benchmark.avgBuyerDiscountPct && ` Buyers push for ~${data.benchmark.avgBuyerDiscountPct?.toFixed(1)}% discount.`}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── Data freshness disclaimer ── */}
                    {data.benchmark && (
                        <div style={{ marginTop: '12px', textAlign: 'center' }}>
                            <span style={{ fontSize: '0.6rem', color: '#cbd5e1' }}>
                                Based on {data.benchmark.dealCount} closed deals · {data.benchmark.period}
                            </span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
