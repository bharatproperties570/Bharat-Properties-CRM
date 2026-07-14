import React, { useState, useEffect } from 'react';
import { api } from '../utils/api';
import { formatIndianCurrency } from '../utils/numberToWords';

const getStageBadgeStyle = (stage) => {
    const s = String(stage || 'Open').toLowerCase();
    if (s.includes('won') || s.includes('booked') || s === 'closed') {
        return { background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.25)' };
    }
    if (s.includes('negotiation') || s.includes('quote')) {
        return { background: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6', border: '1px solid rgba(59, 130, 246, 0.25)' };
    }
    if (s.includes('lost') || s.includes('cancel') || s === 'cancelled') {
        return { background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.25)' };
    }
    if (s.includes('stalled') || s.includes('hold')) {
        return { background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', border: '1px solid rgba(245, 158, 11, 0.25)' };
    }
    return { background: 'rgba(13, 148, 136, 0.15)', color: '#0d9488', border: '1px solid rgba(13, 148, 136, 0.25)' };
};

const getStageLeftBarColor = (stage) => {
    const s = String(stage || 'Open').toLowerCase();
    if (s.includes('won') || s.includes('booked') || s === 'closed') return '#10b981'; 
    if (s.includes('negotiation') || s.includes('quote')) return '#3b82f6'; 
    if (s.includes('lost') || s.includes('cancel') || s === 'cancelled') return '#ef4444'; 
    if (s.includes('stalled') || s.includes('hold')) return '#f59e0b'; 
    return '#6366f1'; 
};

const EngagedDealsCard = ({ leadId, activities = [], onNavigate }) => {
    const [deals, setDeals] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!leadId) return;
        const fetchDeals = async () => {
            try {
                const res = await api.get(`/deals?leadId=${leadId}&limit=10`);
                if (res.data?.success) {
                    setDeals(res.data.data || []);
                }
            } catch (err) {
                console.error('Failed to fetch engaged deals', err);
            } finally {
                setLoading(false);
            }
        };
        fetchDeals();
    }, [leadId]);

    const cardStyle = {
        background: '#fff',
        borderRadius: '20px',
        border: '1px solid #e2e8f0',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.05)',
        marginBottom: '24px',
        overflow: 'hidden'
    };

    const sectionHeaderStyle = {
        padding: '20px 24px',
        borderBottom: '1px solid #f1f5f9',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: 'linear-gradient(to right, #fff, #f8fafc)'
    };

    const sectionTitleStyle = {
        fontSize: '0.95rem',
        fontWeight: 900,
        color: '#0f172a',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        margin: 0,
        display: 'flex',
        alignItems: 'center',
        gap: '12px'
    };

    if (loading) {
        return (
            <div style={cardStyle}>
                <div style={sectionHeaderStyle}>
                    <h3 style={sectionTitleStyle}>
                        <div style={{ width: '32px', height: '32px', background: '#f8fafc', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: '8px' }}>
                            <i className="fas fa-building text-slate-400" style={{ fontSize: '0.9rem' }}></i>
                        </div>
                        <span style={{ color: '#475569' }}>Engaged Deals</span>
                    </h3>
                </div>
                <div style={{ padding: '30px', textAlign: 'center' }}>
                    <div className="spinner-border text-primary" style={{ width: '1.5rem', height: '1.5rem', borderWidth: '2px' }} role="status"></div>
                </div>
            </div>
        );
    }

    if (!deals || deals.length === 0) {
        return (
            <div style={cardStyle}>
                <div style={sectionHeaderStyle}>
                    <h3 style={sectionTitleStyle}>
                        <div style={{ width: '32px', height: '32px', background: '#f8fafc', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: '8px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                            <i className="fas fa-building text-slate-400" style={{ fontSize: '0.9rem' }}></i>
                        </div>
                        <span style={{ color: '#475569' }}>Engaged Deals</span>
                    </h3>
                </div>
                <div style={{ padding: '30px', textAlign: 'center' }}>
                    <i className="fas fa-handshake-slash" style={{ fontSize: '2rem', color: '#cbd5e1', marginBottom: '10px' }}></i>
                    <p style={{ fontSize: '0.9rem', color: '#94a3b8', margin: 0 }}>This lead has not engaged with any deals yet.</p>
                </div>
            </div>
        );
    }

    return (
        <div style={cardStyle}>
            <style>
                {`
                .enterprise-deal-card {
                    background: var(--contact-card-bg, #ffffff);
                    border: 1px solid var(--border-color, #e2e8f0);
                    border-radius: 12px;
                    padding: 14px 16px;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
                    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
                    position: relative;
                    overflow: hidden;
                    cursor: pointer;
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                    margin-bottom: 12px;
                }
                .enterprise-deal-card:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 12px 24px rgba(0, 0, 0, 0.15);
                    border-color: rgba(99, 102, 241, 0.3);
                }
                `}
            </style>
            <div style={{ ...sectionHeaderStyle, background: '#f0fdf4', borderBottom: '1px solid #dcfce7' }}>
                <h3 style={sectionTitleStyle}>
                    <div style={{ width: '32px', height: '32px', background: '#ffffff', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: '8px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                        <i className="fas fa-handshake text-emerald-600" style={{ fontSize: '0.9rem' }}></i>
                    </div>
                    <span style={{ color: '#166534' }}>Engaged Deals ({deals.length})</span>
                </h3>
            </div>
            
            <div style={{ padding: '20px' }}>
                {deals.map((deal, index) => {
                    const dealName = deal.projectName || 'Property Deal';
                    const dealStage = typeof deal.stage === 'object' ? deal.stage?.lookup_value : deal.stage;
                    const stageStyle = getStageBadgeStyle(dealStage);
                    const leftBarColor = getStageLeftBarColor(dealStage);

                    // Find latest activity associated with this deal
                    const dealActs = activities.filter(a => {
                        if (a.entityType === 'Deal' && String(a.entityId) === String(deal._id)) return true;
                        if (a.relatedTo && Array.isArray(a.relatedTo)) {
                            return a.relatedTo.some(r => r.model === 'Deal' && String(r.id) === String(deal._id));
                        }
                        return false;
                    });
                    dealActs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                    const latestAct = dealActs[0];

                    return (
                        <div 
                            key={deal._id || index} 
                            className="enterprise-deal-card"
                            onClick={() => onNavigate('deal', deal._id)}
                        >
                            <div style={{
                                position: 'absolute',
                                left: 0,
                                top: 0,
                                bottom: 0,
                                width: '4px',
                                background: leftBarColor,
                                borderTopLeftRadius: '12px',
                                borderBottomLeftRadius: '12px'
                            }}></div>
                            
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div style={{ flex: 1, paddingLeft: '8px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                                        <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-color, #1e293b)' }}>
                                            {dealName}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '12px', fontSize: '0.8rem', color: 'var(--text-muted, #64748b)' }}>
                                        {deal.unitNo && (
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--bg-card, #f8fafc)', padding: '2px 8px', borderRadius: '4px' }}>
                                                <i className="fas fa-door-open" style={{ color: '#94a3b8' }}></i> {deal.unitNo}
                                            </span>
                                        )}
                                        {deal.price > 0 && (
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 700, color: 'var(--text-color, #334155)' }}>
                                                <i className="fas fa-tag" style={{ color: '#94a3b8' }}></i> {formatIndianCurrency(deal.price)}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div>
                                    <span style={{
                                        fontSize: '0.65rem',
                                        fontWeight: 800,
                                        padding: '4px 10px',
                                        borderRadius: '20px',
                                        ...stageStyle,
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.5px'
                                    }}>
                                        {dealStage || 'OPEN'}
                                    </span>
                                </div>
                            </div>
                            
                            {latestAct && (
                                <div style={{
                                    marginTop: '12px',
                                    paddingTop: '12px',
                                    borderTop: '1px dashed var(--border-color, #e2e8f0)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '12px',
                                    fontSize: '0.75rem'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted, #64748b)' }}>
                                        <i className="far fa-calendar-check" style={{ color: '#6366f1' }}></i>
                                        <span style={{ fontWeight: 600 }}>{latestAct.type}</span> 
                                        {latestAct.details?.purpose && `(${latestAct.details.purpose})`}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <span style={{
                                            padding: '2px 6px',
                                            borderRadius: '4px',
                                            background: latestAct.status === 'Completed' ? '#dcfce7' : '#fef9c3',
                                            color: latestAct.status === 'Completed' ? '#166534' : '#854d0e',
                                            fontWeight: 700
                                        }}>
                                            {latestAct.status}
                                        </span>
                                    </div>
                                    {latestAct.details?.completionResult && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-color, #334155)' }}>
                                            <i className="fas fa-angle-right" style={{ color: '#94a3b8' }}></i>
                                            <span style={{ fontWeight: 700 }}>{latestAct.details.completionResult}</span>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default EngagedDealsCard;
