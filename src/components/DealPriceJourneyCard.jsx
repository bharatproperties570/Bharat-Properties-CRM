/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * DEAL PRICE JOURNEY CARD — Enterprise Grade Component
 * Bharat Properties CRM — Phase 2
 * 
 * Shows the full price journey: Expected → Quoted → Offer → Closed
 * with gap percentages and market comparison.
 * 
 * Usage: <DealPriceJourneyCard dealId="xxx" deal={dealObject} />
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */
import React, { useEffect, useState, useRef } from 'react';
import { pricingAPI, formatINRShort, formatINRFull, POSITIONING_CONFIG } from '../utils/pricingAPI';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const GapBadge = ({ pct }) => {
    if (pct === null || pct === undefined) return null;
    const isNeg = pct < 0;
    const abs = Math.abs(pct);
    return (
        <span style={{
            fontSize: '0.65rem', fontWeight: 800, padding: '2px 7px', borderRadius: '999px',
            background: isNeg ? '#fef2f2' : '#f0fdf4',
            color: isNeg ? '#dc2626' : '#16a34a',
            border: `1px solid ${isNeg ? '#fecaca' : '#bbf7d0'}`,
        }}>
            {isNeg ? '▼' : '▲'} {abs.toFixed(1)}%
        </span>
    );
};

const JourneyStep = ({ icon, label, price, rpu, unitLabel, pct, color, isLast, isCurrent }) => (
    <div style={{ display: 'flex', gap: '14px', position: 'relative' }}>
        {/* Timeline connector */}
        {!isLast && (
            <div style={{
                position: 'absolute', left: '17px', top: '36px',
                width: '2px', height: 'calc(100% - 4px)',
                background: 'linear-gradient(180deg, #e2e8f0 0%, transparent 100%)'
            }} />
        )}

        {/* Icon */}
        <div style={{ flexShrink: 0 }}>
            <div style={{
                width: '34px', height: '34px', borderRadius: '50%',
                background: isCurrent ? `linear-gradient(135deg, ${color}, ${color}dd)` : '#f1f5f9',
                border: `2px solid ${isCurrent ? color : '#e2e8f0'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: isCurrent ? `0 4px 12px ${color}40` : 'none',
            }}>
                <i className={`fas ${icon}`} style={{ fontSize: '0.7rem', color: isCurrent ? '#fff' : '#94a3b8' }} />
            </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, paddingBottom: isLast ? 0 : '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
                    {price ? (
                        <>
                            <div style={{ fontSize: '1rem', fontWeight: 900, color: isCurrent ? color : '#1e293b', marginTop: '2px' }}>
                                {formatINRFull(price)}
                            </div>
                            {rpu && (
                                <div style={{ fontSize: '0.65rem', color: '#94a3b8', marginTop: '1px' }}>
                                    {formatINRFull(rpu)} {unitLabel}
                                </div>
                            )}
                        </>
                    ) : (
                        <div style={{ fontSize: '0.75rem', color: '#cbd5e1', marginTop: '4px', fontStyle: 'italic' }}>Not recorded yet</div>
                    )}
                </div>
                {pct !== null && pct !== undefined && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                        <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>vs Expected</span>
                        <GapBadge pct={pct - 100} />
                    </div>
                )}
            </div>
        </div>
    </div>
);

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DealPriceJourneyCard({ dealId, deal }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const hasFetched = useRef(false);

    useEffect(() => {
        if (hasFetched.current || !dealId) return;
        hasFetched.current = true;
        pricingAPI.getDealAnalysis(dealId)
            .then(res => { if (res.status === 'success') setData(res.data); })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [dealId]);

    if (loading) return (
        <div style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '18px', height: '18px', border: '2px solid #e2e8f0', borderTopColor: '#4f46e5', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Loading price analysis…</span>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );

    if (!data) return null;

    const j = data.priceJourney;
    const a = data.analysis;

    const steps = [
        { icon: 'fa-tag', label: "Seller's Expected Price", price: j.expected?.price, rpu: j.expected?.ratePerUnit, pct: null, color: '#4f46e5', isCurrent: false },
        { icon: 'fa-handshake', label: 'Our Quoted Price', price: j.quoted?.price, rpu: j.quoted?.ratePerUnit, pct: j.quoted?.pct, color: '#0369a1', isCurrent: false },
        { icon: 'fa-user', label: "Buyer's Offer", price: j.offer?.price, rpu: j.offer?.ratePerUnit, pct: j.offer?.pct, color: '#d97706', isCurrent: false },
        { icon: 'fa-flag-checkered', label: 'Final Closed Price', price: j.closed?.price, rpu: j.closed?.ratePerUnit, pct: j.closed?.pct, color: '#16a34a', isCurrent: !!(j.closed?.price) },
    ];

    return (
        <div style={{
            background: '#fff', borderRadius: '18px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
            overflow: 'hidden'
        }}>
            {/* Header */}
            <div style={{
                padding: '14px 20px',
                background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
                display: 'flex', alignItems: 'center', gap: '10px'
            }}>
                <i className="fas fa-chart-bar" style={{ color: '#818cf8', fontSize: '0.9rem' }} />
                <div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#fff' }}>Price Journey Analysis</div>
                    <div style={{ fontSize: '0.63rem', color: '#94a3b8', marginTop: '1px' }}>
                        {data.subCategory} · {data.areaUnitLabel}
                    </div>
                </div>
            </div>

            <div style={{ padding: '20px' }}>
                {/* Journey Steps */}
                {steps.map((step, i) => (
                    <JourneyStep
                        key={i}
                        {...step}
                        unitLabel={data.areaUnitLabel}
                        isLast={i === steps.length - 1}
                    />
                ))}

                {/* Gap Summary */}
                {(a.negotiationGapPct !== null || a.buyerDiscountAskedPct !== null) && (
                    <div style={{
                        marginTop: '16px', padding: '14px 16px', borderRadius: '12px',
                        background: '#f8fafc', border: '1px solid #e2e8f0',
                        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px'
                    }}>
                        {a.negotiationGapPct !== null && (
                            <div>
                                <div style={{ fontSize: '0.63rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>Seller Negotiated</div>
                                <div style={{ fontSize: '0.85rem', fontWeight: 900, color: '#dc2626' }}>▼ {Math.abs(a.negotiationGapPct).toFixed(1)}%</div>
                                <div style={{ fontSize: '0.65rem', color: '#64748b' }}>from Expected to Closed</div>
                            </div>
                        )}
                        {a.buyerDiscountAskedPct !== null && (
                            <div>
                                <div style={{ fontSize: '0.63rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>Buyer Pushed For</div>
                                <div style={{ fontSize: '0.85rem', fontWeight: 900, color: '#d97706' }}>▼ {Math.abs(a.buyerDiscountAskedPct).toFixed(1)}%</div>
                                <div style={{ fontSize: '0.65rem', color: '#64748b' }}>Quoted to Offer gap</div>
                            </div>
                        )}
                    </div>
                )}

                {/* Market Comparison */}
                {a.marketCompare && (
                    <div style={{
                        marginTop: '12px', padding: '14px 16px', borderRadius: '12px',
                        background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
                        border: '1px solid #86efac'
                    }}>
                        <div style={{ fontSize: '0.65rem', color: '#16a34a', fontWeight: 800, textTransform: 'uppercase', marginBottom: '6px' }}>
                            <i className="fas fa-chart-line" style={{ marginRight: '5px' }} />
                            vs Market Average
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <div style={{ fontSize: '0.7rem', color: '#374151', fontWeight: 600 }}>This Deal: {formatINRFull(a.marketCompare.dealRPU)} {data.areaUnitLabel}</div>
                                <div style={{ fontSize: '0.7rem', color: '#374151', fontWeight: 600 }}>Market Avg: {formatINRFull(a.marketCompare.marketAvgRPU)} {data.areaUnitLabel}</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: '0.75rem', fontWeight: 800, color: a.marketCompare.vsMarketPct >= 0 ? '#16a34a' : '#dc2626' }}>
                                    {a.marketCompare.vsMarketPct >= 0 ? '+' : ''}{a.marketCompare.vsMarketPct?.toFixed(1)}%
                                </div>
                                <div style={{ fontSize: '0.63rem', color: '#64748b', marginTop: '2px' }}>{a.marketCompare.positioning}</div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
