import React from 'react';
import { getInitials } from '../utils/helpers';
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

const EngagedLeadsCard = ({ leads, activities = [], onNavigate }) => {
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

    if (!leads || leads.length === 0) {
        return (
            <div style={cardStyle}>
                <div style={{ ...sectionHeaderStyle, background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <h3 style={sectionTitleStyle}>
                        <div style={{ width: '32px', height: '32px', background: '#ffffff', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: '8px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                            <i className="fas fa-users text-indigo-500" style={{ fontSize: '0.9rem' }}></i>
                        </div>
                        <span style={{ color: '#334155' }}>Engaged Leads</span>
                    </h3>
                </div>
                <div style={{ padding: '30px', textAlign: 'center' }}>
                    <i className="fas fa-user-clock" style={{ fontSize: '2rem', color: '#cbd5e1', marginBottom: '10px' }}></i>
                    <p style={{ fontSize: '0.9rem', color: '#94a3b8', margin: 0 }}>No leads have engaged with this deal yet.</p>
                </div>
            </div>
        );
    }

    return (
        <div style={cardStyle}>
            <div style={{ ...sectionHeaderStyle, background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <h3 style={sectionTitleStyle}>
                    <div style={{ width: '32px', height: '32px', background: '#ffffff', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: '8px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                        <i className="fas fa-users text-indigo-500" style={{ fontSize: '0.9rem' }}></i>
                    </div>
                    <span style={{ color: '#334155' }}>Engaged Leads ({leads.length})</span>
                </h3>
            </div>
            
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {leads.map((lead, index) => {
                    const leadName = (lead.firstName || lead.lastName) ? `${lead.firstName || ''} ${lead.lastName || ''}`.trim() : 'Unknown Lead';
                    const leadStage = typeof lead.stage === 'object' ? lead.stage?.lookup_value : lead.stage;
                    const stageStyle = getStageBadgeStyle(leadStage);
                    const leftBarColor = getStageLeftBarColor(leadStage);

                    // Find latest activity associated with this lead
                    const leadActs = activities.filter(a => {
                        if (a.entityType === 'Lead' && String(a.entityId) === String(lead._id)) return true;
                        if (a.relatedTo && Array.isArray(a.relatedTo)) {
                            return a.relatedTo.some(r => (r.model === 'Lead' || r.model === 'Contact') && String(r.id) === String(lead._id));
                        }
                        return false;
                    });
                    leadActs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                    const latestAct = leadActs[0];

                    return (
                        <div 
                            key={lead._id || index} 
                            style={{
                                padding: '16px', background: '#fff', borderRadius: '12px', border: '1px solid #f1f5f9',
                                boxShadow: '0 4px 6px -2px rgba(0, 0, 0, 0.02)', transition: 'all 0.2s',
                                cursor: 'pointer', position: 'relative', overflow: 'hidden'
                            }} 
                            className="hover:shadow-md hover:border-indigo-200 group" 
                            onClick={() => onNavigate('contact', lead._id)}
                        >
                            <div style={{
                                position: 'absolute',
                                left: 0,
                                top: 0,
                                bottom: 0,
                                width: '4px',
                                background: leftBarColor
                            }}></div>
                            
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingLeft: '8px' }}>
                                    <div style={{
                                        width: '40px',
                                        height: '40px',
                                        borderRadius: '50%',
                                        background: 'linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%)',
                                        color: '#4f46e5',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontWeight: 'bold',
                                        fontSize: '1rem',
                                        flexShrink: 0
                                    }}>
                                        {getInitials(leadName)}
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-color, #1e293b)' }}>
                                            {leadName}
                                        </div>
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted, #64748b)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <i className="fas fa-phone-alt" style={{ fontSize: '0.7rem', opacity: 0.7 }}></i> 
                                            {lead.mobile || 'No Mobile'}
                                        </div>
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
                                        {leadStage || 'NEW'}
                                    </span>
                                </div>
                            </div>

                            {latestAct && (
                                <div style={{
                                    marginTop: '12px',
                                    paddingTop: '12px',
                                    borderTop: '1px dashed #f1f5f9',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '12px',
                                    fontSize: '0.75rem',
                                    paddingLeft: '8px'
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

export default EngagedLeadsCard;
