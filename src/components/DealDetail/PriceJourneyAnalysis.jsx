import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { formatINRShort } from '../../../utils/pricingUtils';

// A dynamic, modern visualization for the Deal Price Journey
const PriceJourneyAnalysis = ({ dealId }) => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!dealId) return;
        
        const fetchAnalysis = async () => {
            try {
                setLoading(true);
                const res = await axios.get(`/api/pricing/deal-analysis/${dealId}`);
                if (res.data?.status === 'success') {
                    setData(res.data.data);
                }
            } catch (err) {
                setError('Failed to load price journey analysis.');
            } finally {
                setLoading(false);
            }
        };

        fetchAnalysis();
    }, [dealId]);

    if (loading) return (
        <div style={{ padding: '20px', background: '#fff', borderRadius: '16px', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '200px' }}>
            <div className="spinner"></div>
        </div>
    );

    if (error || !data) return null;

    const { priceJourney, analysis, areaUnitLabel, subCategory } = data;
    
    // Safety check if no journey data is calculable
    if (!priceJourney?.expected?.price) return null;

    // Determine colors based on positioning
    const getBadgeStyle = (positioning) => {
        if (!positioning) return { bg: '#f1f5f9', color: '#475569' };
        if (positioning.includes('Above')) return { bg: '#fef2f2', color: '#ef4444' };
        if (positioning.includes('Below')) return { bg: '#ecfdf5', color: '#10b981' };
        return { bg: '#fefce8', color: '#eab308' }; // Fair
    };

    const marketCompare = analysis?.marketCompare;
    const badgeStyle = getBadgeStyle(marketCompare?.positioning);

    return (
        <div style={{
            background: 'linear-gradient(145deg, #ffffff 0%, #f8fafc 100%)',
            borderRadius: '20px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 10px 30px rgba(0, 0, 0, 0.03)',
            overflow: 'hidden',
            marginBottom: '20px',
            fontFamily: "'Inter', sans-serif"
        }}>
            {/* Header */}
            <div style={{
                padding: '16px 24px',
                borderBottom: '1px solid rgba(226, 232, 240, 0.8)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: 'rgba(255, 255, 255, 0.5)',
                backdropFilter: 'blur(8px)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '14px' }}>
                        <i className="fas fa-chart-line"></i>
                    </div>
                    <div>
                        <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#1e293b' }}>Price Journey Analysis</div>
                        <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>{subCategory} Benchmark</div>
                    </div>
                </div>
                
                {marketCompare && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 800, padding: '4px 10px', borderRadius: '20px', background: badgeStyle.bg, color: badgeStyle.color }}>
                            {marketCompare.positioning}
                        </span>
                        <div style={{ fontSize: '0.65rem', color: '#64748b', marginTop: '4px', fontWeight: 600 }}>
                            vs Market: <strong style={{ color: marketCompare.vsMarketPct > 0 ? '#ef4444' : '#10b981' }}>{marketCompare.vsMarketPct > 0 ? '+' : ''}{marketCompare.vsMarketPct}%</strong>
                        </div>
                    </div>
                )}
            </div>

            {/* Funnel Content */}
            <div style={{ padding: '24px', display: 'flex', gap: '20px' }}>
                
                {/* Left Side: Funnel Visual */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    
                    {[
                        { key: 'expected', color: '#3b82f6', icon: 'fa-tag' },
                        { key: 'quoted', color: '#8b5cf6', icon: 'fa-bullhorn' },
                        { key: 'offer', color: '#f59e0b', icon: 'fa-hand-holding-usd' },
                        { key: 'closed', color: '#10b981', icon: 'fa-check-circle' }
                    ].map((step, idx) => {
                        const stepData = priceJourney[step.key];
                        if (!stepData?.price) return null;

                        return (
                            <div key={step.key} style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                <div style={{ width: '40px', fontSize: '0.7rem', color: '#94a3b8', fontWeight: 800, textAlign: 'right' }}>
                                    {stepData.pct ? `${stepData.pct}%` : ''}
                                </div>
                                <div style={{ flex: 1, position: 'relative', height: '40px', background: '#f1f5f9', borderRadius: '8px', overflow: 'hidden' }}>
                                    <div style={{ 
                                        position: 'absolute', 
                                        left: 0, top: 0, bottom: 0, 
                                        width: `${stepData.pct || 100}%`, 
                                        background: step.color,
                                        opacity: 0.15,
                                        transition: 'width 1s cubic-bezier(0.4, 0, 0.2, 1)'
                                    }}></div>
                                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#334155', fontWeight: 700, fontSize: '0.8rem' }}>
                                            <i className={`fas ${step.icon}`} style={{ color: step.color }}></i>
                                            {stepData.label}
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                                            <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0f172a' }}>{formatINRShort(stepData.price)}</span>
                                            {stepData.ratePerUnit && (
                                                <span style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 600 }}>₹{stepData.ratePerUnit.toLocaleString()} {areaUnitLabel}</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Right Side: Gap Analysis Cards */}
                <div style={{ width: '220px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {analysis?.negotiationGapPct !== null && (
                        <div style={{ padding: '16px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
                            <div style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', marginBottom: '4px' }}>Seller Drop</div>
                            <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#ef4444' }}>{analysis.negotiationGapPct}%</div>
                            <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 500, marginTop: '2px' }}>(Expected vs Closed)</div>
                        </div>
                    )}
                    {analysis?.buyerDiscountAskedPct !== null && (
                        <div style={{ padding: '16px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
                            <div style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', marginBottom: '4px' }}>Buyer Push</div>
                            <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#f59e0b' }}>{analysis.buyerDiscountAskedPct}%</div>
                            <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 500, marginTop: '2px' }}>(Quoted vs Offer)</div>
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
};

export default PriceJourneyAnalysis;
