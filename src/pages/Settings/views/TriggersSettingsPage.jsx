import React from 'react';
import { usePropertyConfig } from '../../../context/PropertyConfigContext';

const TriggersSettingsPage = () => {
    const { masterFields, updateMasterFields } = usePropertyConfig();
    const triggers = masterFields.triggers || {};

    const toggleTrigger = (event, channel) => {
        const updatedTriggers = {
            ...triggers,
            [event]: {
                ...(triggers[event] || { whatsapp: false, sms: false, email: false }),
                [channel]: !triggers[event]?.[channel]
            }
        };
        updateMasterFields('triggers', updatedTriggers);
    };

    const triggerEvents = [
        {
            id: 'Feedback Received',
            label: 'Property Feedback Logged',
            description: 'Triggered when a user logs feedback for a property owner in the Inventory Feedback modal.'
        }
    ];

    const channels = [
        { id: 'whatsapp', label: 'WhatsApp', icon: 'fab fa-whatsapp', color: '#25d366' },
        { id: 'sms', label: 'SMS', icon: 'fas fa-comment-alt', color: '#3b82f6' },
        { id: 'email', label: 'Email', icon: 'fas fa-envelope', color: '#f97316' }
    ];

    return (
        <div style={{ flex: 1, padding: '32px 40px', background: '#fff', overflowY: 'auto' }}>
            <div style={{ marginBottom: '32px' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>Automation Triggers</h2>
                <p style={{ color: '#64748b', fontSize: '0.9rem' }}>Configure global automation rules for different CRM events. When enabled, the system will prepare messages for these channels automatically.</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {triggerEvents.map(event => (
                    <div key={event.id} style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px', background: '#f8fafc' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
                            <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                                    <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1e293b', margin: 0 }}>{event.label}</h3>
                                    <span style={{ fontSize: '0.65rem', padding: '2px 8px', background: '#dcfce7', color: '#15803d', borderRadius: '4px', fontWeight: 700, textTransform: 'uppercase' }}>Active Event</span>
                                </div>
                                <p style={{ fontSize: '0.85rem', color: '#64748b', margin: 0 }}>{event.description}</p>
                            </div>
                        </div>

                        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #e2e8f0' }}>
                                        <th style={{ padding: '12px 20px', textAlign: 'left', fontSize: '0.75rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>Channel</th>
                                        <th style={{ padding: '12px 20px', textAlign: 'center', fontSize: '0.75rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>Status</th>
                                        <th style={{ padding: '12px 20px', textAlign: 'left', fontSize: '0.75rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>Description</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {channels.map(ch => {
                                        const isActive = triggers[event.id]?.[ch.id];
                                        return (
                                            <tr key={ch.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                <td style={{ padding: '16px 20px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                        <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: `${ch.color}10`, color: ch.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem' }}>
                                                            <i className={ch.icon}></i>
                                                        </div>
                                                        <span style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.9rem' }}>{ch.label}</span>
                                                    </div>
                                                </td>
                                                <td style={{ padding: '16px 20px', textAlign: 'center' }}>
                                                    <div
                                                        onClick={() => toggleTrigger(event.id, ch.id)}
                                                        style={{
                                                            width: '44px',
                                                            height: '24px',
                                                            background: isActive ? 'var(--primary-color)' : '#cbd5e1',
                                                            borderRadius: '12px',
                                                            padding: '2px',
                                                            cursor: 'pointer',
                                                            position: 'relative',
                                                            margin: '0 auto',
                                                            transition: 'all 0.3s'
                                                        }}
                                                    >
                                                        <div style={{
                                                            width: '20px',
                                                            height: '20px',
                                                            background: '#fff',
                                                            borderRadius: '50%',
                                                            position: 'absolute',
                                                            left: isActive ? '22px' : '2px',
                                                            transition: 'all 0.3s',
                                                            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                                                        }}></div>
                                                    </div>
                                                </td>
                                                <td style={{ padding: '16px 20px' }}>
                                                    <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
                                                        Automatically {isActive ? 'enables' : 'disables'} {ch.label} toggle in the feedback form.
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ))}

                <div style={{ marginTop: '20px', padding: '20px', background: '#eff6ff', borderRadius: '12px', border: '1px solid #dbeafe', display: 'flex', gap: '16px' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#fff', color: '#1d4ed8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', flexShrink: 0 }}>
                        <i className="fas fa-magic"></i>
                    </div>
                    <div>
                        <h4 style={{ margin: '0 0 4px 0', fontSize: '0.95rem', fontWeight: 700, color: '#1e3a8a' }}>Adaptive Automation</h4>
                        <p style={{ margin: 0, fontSize: '0.85rem', color: '#1e40af', lineHeight: '1.5' }}>
                            You can also set <strong>Rule-Based Overrides</strong> in the Feedback Outcome settings to force specific channels ON or OFF for certain reasons, regardless of these global defaults.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TriggersSettingsPage;
