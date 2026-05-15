import React, { useState, useEffect } from 'react';
import { api } from '../utils/api';
import { renderValue } from '../utils/renderUtils';

const AIIntelligenceWidget = () => {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const res = await api.get('dashboard/ai-intelligence');
                if (res.data?.success) setStats(res.data.data);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        fetchStats();
    }, []);

    if (loading) return <div style={{ height: '300px', background: '#fff', borderRadius: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading AI Insights...</div>;
    if (!stats) return null;

    return (
        <div style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', borderRadius: '24px', padding: '24px', color: '#fff', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div>
                    <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <i className="fas fa-brain" style={{ color: '#818cf8' }}></i> AI Intelligence & ROI
                    </h3>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: '#94a3b8' }}>Real-time automation performance metrics</p>
                </div>
                <div style={{ padding: '6px 12px', background: 'rgba(129, 140, 248, 0.1)', borderRadius: '100px', border: '1px solid rgba(129, 140, 248, 0.3)', fontSize: '0.7rem', fontWeight: 800, color: '#818cf8', textTransform: 'uppercase' }}>
                    Active Hub
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '20px' }}>
                {stats.roiSignals.map((signal, idx) => (
                    <div key={idx} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', padding: '20px', borderRadius: '20px' }}>
                        <span style={{ display: 'block', fontSize: '0.7rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', marginBottom: '8px' }}>{renderValue(signal.label)}</span>
                        <div style={{ fontSize: '1.5rem', fontWeight: 900, marginBottom: '4px', color: '#fff' }}>{renderValue(signal.value)}</div>
                        <p style={{ margin: 0, fontSize: '0.7rem', color: '#64748b' }}>{renderValue(signal.detail)}</p>
                    </div>
                ))}
            </div>

            <div style={{ marginTop: '24px', padding: '16px', background: 'rgba(129, 140, 248, 0.05)', borderRadius: '16px', border: '1px dashed rgba(129, 140, 248, 0.3)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(129, 140, 248, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#818cf8' }}>
                        <i className="fas fa-chart-line"></i>
                    </div>
                    <div>
                        <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 700 }}>Discovery Efficiency: {renderValue(stats.discovery.efficiencyGain)}</p>
                        <p style={{ margin: 0, fontSize: '0.75rem', color: '#94a3b8' }}>Matched {renderValue(stats.discovery.newMatchesMTD)} leads proactively this month.</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AIIntelligenceWidget;
