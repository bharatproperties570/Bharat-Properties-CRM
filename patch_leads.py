import sys

filepath = 'src/pages/Leads/LeadsPage.jsx'

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

target = """                    {(() => {
                        // Find latest activity regardless of status
                        const sortedActs = [...(lead.activities || [])].sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
                        const activity = sortedActs[0];
                        
                        if (activity) {
                            return (
                                <div style={{
                                    background: 'var(--bg-gray)',
                                    border: '1px solid var(--border-color)',
                                    borderRadius: '6px',
                                    padding: '4px 8px',
                                    fontSize: '0.7rem',
                                    color: 'var(--text-muted)',
                                    fontWeight: 700
                                }}>
                                    LAST: {renderValue(activity.type).toUpperCase()}
                                </div>
                            );
                        }
                        return <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>No activities</span>;
                    })()}
                    
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {[
                            { icon: 'fa-phone-alt', type: 'Call', color: '#10b981' },
                            { icon: 'fa-sms', type: 'SMS', color: '#3b82f6' },
                            { icon: 'fa-whatsapp', type: 'WhatsApp', color: '#25d366' },
                            { icon: 'fa-envelope', type: 'Email', color: '#ef4444' }
                        ].map(act => {
                            const count = (lead.activities || []).filter(a => a.type === act.type).length;
                            if (count === 0) return null;
                            
                            return (
                                <div key={act.type} style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    fontSize: '0.7rem',
                                    color: act.color,
                                    fontWeight: 700
                                }}>
                                    <i className={`fas ${act.icon}`}></i>
                                    {count}
                                </div>
                            );
                        })}"""

replacement = """                    {(() => {
                        if (lead.activity && lead.activity !== "None") {
                            return (
                                <div style={{
                                    background: 'var(--bg-gray)',
                                    border: '1px solid var(--border-color)',
                                    borderRadius: '6px',
                                    padding: '4px 8px',
                                    fontSize: '0.7rem',
                                    color: 'var(--text-muted)',
                                    fontWeight: 700
                                }}>
                                    LAST: {lead.activity.substring(0, 20).toUpperCase()}{lead.activity.length > 20 ? '...' : ''} 
                                    <span style={{fontSize: '0.6rem', marginLeft: '4px', opacity: 0.8}}>{lead.lastAct}</span>
                                </div>
                            );
                        }
                        return <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>No activities</span>;
                    })()}
                    
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {[
                            { icon: 'fa-phone-alt', type: 'Call', color: '#10b981', key: 'call' },
                            { icon: 'fa-sms', type: 'SMS', color: '#3b82f6', key: 'sms' },
                            { icon: 'fa-whatsapp', type: 'WhatsApp', color: '#25d366', key: 'whatsapp' },
                            { icon: 'fa-envelope', type: 'Email', color: '#ef4444', key: 'email' },
                            { icon: 'fa-handshake', type: 'Meeting', color: '#8b5cf6', key: 'meeting' },
                            { icon: 'fa-building', type: 'Site Visit', color: '#f59e0b', key: 'siteVisit' }
                        ].map(act => {
                            const count = lead.interactionCounts?.[act.key] || 0;
                            if (count === 0) return null;
                            
                            return (
                                <div key={act.type} style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    fontSize: '0.7rem',
                                    color: act.color,
                                    fontWeight: 700
                                }}>
                                    <i className={`fas ${act.icon}`}></i>
                                    {count}
                                </div>
                            );
                        })}"""

if target in content:
    content = content.replace(target, replacement)
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    print("SUCCESS")
else:
    print("NOT FOUND")
