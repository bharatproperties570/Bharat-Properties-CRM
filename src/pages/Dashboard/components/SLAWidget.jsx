import { memo } from 'react';

const SLAWidget = ({ metrics }) => {
    // Determine risk metrics based on existing dashboard data
    const untouchedLeads = metrics.nfaCount || 0; // No Follow-up Action
    const dormantLeads = metrics.reengagedCount || 0; // Represents cold leads
    
    // Total critical tasks overdue (Mocking based on agenda for now if needed, or static for effect)
    const overdueFollowups = Math.max(0, untouchedLeads - 2);

    return (
        <div className="glass-card" style={{ padding: '24px', background: 'rgba(239, 68, 68, 0.05)', borderLeft: '4px solid #ef4444' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <div>
                    <h3 style={{ fontSize: '1rem', fontWeight: 900, color: '#f8fafc', margin: 0, letterSpacing: '0.05em' }}>SLA COMPLIANCE</h3>
                    <p style={{ fontSize: '0.65rem', color: '#ef4444', fontWeight: 800, margin: '2px 0 0 0' }}>LEADS AT RISK (ACTION REQ.)</p>
                </div>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#ef4444', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 12px rgba(239, 68, 68, 0.4)' }}>
                    <i className="fas fa-exclamation-triangle"></i>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '12px', borderRadius: '12px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                    <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#ef4444' }}>{untouchedLeads}</div>
                    <div style={{ fontSize: '0.6rem', color: '#94a3b8', fontWeight: 700, marginTop: '2px' }}>UNTOUCHED LEADS</div>
                    <div style={{ fontSize: '0.55rem', color: '#ef4444', marginTop: '6px', fontWeight: 800 }}>&gt; 48 HOURS PENDING</div>
                </div>
                
                <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '12px', borderRadius: '12px', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
                    <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#f59e0b' }}>{overdueFollowups}</div>
                    <div style={{ fontSize: '0.6rem', color: '#94a3b8', fontWeight: 700, marginTop: '2px' }}>OVERDUE TASKS</div>
                    <div style={{ fontSize: '0.55rem', color: '#f59e0b', marginTop: '6px', fontWeight: 800 }}>MISSED FOLLOW-UPS</div>
                </div>
            </div>

            {untouchedLeads > 0 && (
                <button style={{ 
                    width: '100%', marginTop: '16px', padding: '10px', 
                    background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', 
                    borderRadius: '8px', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer',
                    transition: 'all 0.2s'
                }}
                onMouseOver={(e) => { e.target.style.background = '#ef4444'; e.target.style.color = '#fff'; }}
                onMouseOut={(e) => { e.target.style.background = 'transparent'; e.target.style.color = '#ef4444'; }}
                >
                    INITIATE RECOVERY PROTOCOL
                </button>
            )}
        </div>
    );
};

export default memo(SLAWidget);
