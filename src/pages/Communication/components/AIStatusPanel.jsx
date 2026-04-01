import React from 'react';

const AIStatusPanel = ({ activeBots = 3, conversationsHandled = 142, leadsGenerated = 28 }) => {
    return (
        <div style={{
            background: 'rgba(255, 255, 255, 0.9)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(14, 165, 233, 0.2)',
            borderRadius: '12px',
            padding: '1.5rem',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
            minWidth: '280px'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <i className="fas fa-brain" style={{ color: '#0ea5e9', fontSize: '1.2rem' }}></i>
                    <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#1e293b' }}>AI Status</h3>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{
                        width: '8px',
                        height: '8px',
                        backgroundColor: '#10b981',
                        borderRadius: '50%',
                        display: 'inline-block',
                        boxShadow: '0 0 8px #10b981'
                    }}></span>
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#10b981' }}>SYSTEM ONLINE</span>
                </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748b' }}>
                        <i className="fas fa-robot"></i>
                        <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>Active Bots</span>
                    </div>
                    <span style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>{activeBots}</span>
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748b' }}>
                        <i className="fas fa-comments"></i>
                        <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>Conversations Today</span>
                    </div>
                    <span style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>{conversationsHandled}</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748b' }}>
                        <i className="fas fa-user-plus"></i>
                        <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>Leads Generated</span>
                    </div>
                    <span style={{ fontSize: '1.1rem', fontWeight: 800, color: '#10b981' }}>+{leadsGenerated}</span>
                </div>
            </div>

            <div style={{
                marginTop: '0.5rem',
                padding: '0.5rem',
                background: '#f0fdf4',
                border: '1px solid #bbf7d0',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                color: '#16a34a',
                fontSize: '0.75rem',
                fontWeight: 600
            }}>
                <i className="fas fa-check-circle"></i>
                <span>CRM Auto-Sync Active</span>
            </div>
        </div>
    );
};

export default AIStatusPanel;
