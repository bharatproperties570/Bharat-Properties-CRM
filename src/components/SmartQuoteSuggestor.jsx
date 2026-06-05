import { useState, useEffect } from 'react';
import { api } from '../utils/api';
import toast from 'react-hot-toast';
import { renderValue } from '../utils/renderUtils';

/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * SMART QUOTE SUGGESTOR WIDGET — Enterprise Grade
 * Phase 3 Intelligence Integration
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * Displays Market Benchmarks and Orientation Premium for a given property
 * and provides 1-click price autofill for the agent creating a deal.
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */

const SmartQuoteSuggestor = ({ inventoryId, onSelectPrice }) => {
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!inventoryId) {
            setData(null);
            return;
        }

        const fetchSuggestion = async () => {
            setLoading(true);
            setError(null);
            try {
                const response = await api.get(`/pricing/suggest?inventoryId=${inventoryId}`);
                if (response.data?.success) {
                    setData(response.data.data);
                } else {
                    setError('Unable to load market data.');
                }
            } catch (err) {
                console.error('[SmartQuoteSuggestor] Fetch Error:', err);
                setError('Failed to fetch pricing intelligence.');
            } finally {
                setLoading(false);
            }
        };

        fetchSuggestion();
    }, [inventoryId]);

    if (!inventoryId) {
        return (
            <div style={{ padding: '16px', background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '8px', textAlign: 'center', color: '#64748b', fontSize: '0.85rem' }}>
                <i className="fas fa-magic" style={{ marginRight: '6px', opacity: 0.5 }}></i>
                Select a property to view AI Price Suggestions
            </div>
        );
    }

    if (loading) {
        return (
            <div style={{ padding: '16px', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '8px', color: '#0369a1', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <i className="fas fa-circle-notch fa-spin"></i>
                Analyzing market benchmarks...
            </div>
        );
    }

    if (error) {
        return (
            <div style={{ padding: '12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#991b1b', fontSize: '0.85rem' }}>
                <i className="fas fa-exclamation-circle" style={{ marginRight: '6px' }}></i>
                {error}
            </div>
        );
    }

    if (!data) return null;

    const { benchmark, priceBands, orientationAnalysis, areaInStdUnit, areaUnitLabel } = data;

    // Check if we have enough data to show suggestions
    if (!benchmark || !priceBands) {
        return (
            <div style={{ padding: '16px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', color: '#92400e', fontSize: '0.85rem' }}>
                <div style={{ fontWeight: 700, marginBottom: '4px' }}>Insufficient Market Data</div>
                We need at least 3 recent closed deals for <strong>{renderValue(data.subCategory)}</strong> in <strong>{renderValue(data.location)}</strong> to generate AI suggestions.
                
                {/* Still show orientation if we have it */}
                {orientationAnalysis && orientationAnalysis.totalPremiumPct !== 0 && (
                    <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #fef3c7' }}>
                        <strong>Orientation Premium Note:</strong> Based on the facing/road width, this property carries a <strong>{orientationAnalysis.totalPremiumPct > 0 ? '+' : ''}{orientationAnalysis.totalPremiumPct}%</strong> valuation adjustment.
                    </div>
                )}
            </div>
        );
    }

    return (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
            
            {/* Header */}
            <div style={{ background: 'linear-gradient(90deg, #1e293b 0%, #334155 100%)', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <i className="fas fa-brain" style={{ color: '#38bdf8' }}></i>
                    <h4 style={{ margin: 0, color: '#fff', fontSize: '0.9rem', fontWeight: 700 }}>AI Price Suggestor</h4>
                </div>
                <div style={{ color: '#cbd5e1', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <i className="fas fa-map-marker-alt"></i> {benchmark.location}
                </div>
            </div>

            <div style={{ padding: '16px' }}>
                
                {/* Context Stats */}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid #f1f5f9' }}>
                    <div>
                        <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', marginBottom: '2px' }}>Area Specs</div>
                        <div style={{ fontSize: '0.85rem', color: '#0f172a', fontWeight: 600 }}>{areaInStdUnit} {areaUnitLabel}</div>
                    </div>
                    <div>
                        <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', marginBottom: '2px' }}>Market Avg RPU</div>
                        <div style={{ fontSize: '0.85rem', color: '#0f172a', fontWeight: 600 }}>₹{benchmark.avgClosedRPU?.toLocaleString('en-IN')}</div>
                    </div>
                    <div>
                        <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', marginBottom: '2px' }}>Premium</div>
                        <div style={{ fontSize: '0.85rem', color: orientationAnalysis.totalPremiumPct >= 0 ? '#10b981' : '#ef4444', fontWeight: 600 }}>
                            {orientationAnalysis.totalPremiumPct > 0 ? '+' : ''}{orientationAnalysis.totalPremiumPct}%
                        </div>
                    </div>
                </div>

                {/* Price Bands Buttons */}
                <div style={{ marginBottom: '8px', fontSize: '0.8rem', fontWeight: 700, color: '#334155' }}>Select Suggested Quote:</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px' }}>
                    
                    {/* Fair Market Value (Primary) */}
                    <button 
                        onClick={(e) => { e.preventDefault(); onSelectPrice(priceBands.fair.value); toast.success('Fair Market Value Applied'); }}
                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', cursor: 'pointer', transition: 'all 0.2s' }}
                        className="hover-shadow"
                    >
                        <div style={{ textAlign: 'left' }}>
                            <div style={{ color: '#1d4ed8', fontWeight: 800, fontSize: '0.95rem', marginBottom: '2px' }}>{priceBands.fair.label}</div>
                            <div style={{ color: '#3b82f6', fontSize: '0.7rem', fontWeight: 600 }}>{priceBands.fair.note}</div>
                        </div>
                        <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#dbeafe', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <i className="fas fa-check"></i>
                        </div>
                    </button>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        {/* Aggressive (Quick Sale) */}
                        <button 
                            onClick={(e) => { e.preventDefault(); onSelectPrice(priceBands.aggressive.value); toast.success('Aggressive Price Applied'); }}
                            style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '10px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer' }}
                        >
                            <div style={{ color: '#0f172a', fontWeight: 700, fontSize: '0.85rem' }}>{priceBands.aggressive.label}</div>
                            <div style={{ color: '#64748b', fontSize: '0.65rem', fontWeight: 600 }}>{priceBands.aggressive.note}</div>
                        </button>

                        {/* Patient (Hold for Premium) */}
                        <button 
                            onClick={(e) => { e.preventDefault(); onSelectPrice(priceBands.patient.value); toast.success('Patient Price Applied'); }}
                            style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '10px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer' }}
                        >
                            <div style={{ color: '#0f172a', fontWeight: 700, fontSize: '0.85rem' }}>{priceBands.patient.label}</div>
                            <div style={{ color: '#64748b', fontSize: '0.65rem', fontWeight: 600 }}>{priceBands.patient.note}</div>
                        </button>
                    </div>

                </div>

            </div>
        </div>
    );
};

export default SmartQuoteSuggestor;
