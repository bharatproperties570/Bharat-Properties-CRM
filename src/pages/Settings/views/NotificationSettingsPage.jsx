import { useState, useEffect } from 'react';
import { api } from '../../../utils/api';
import toast from 'react-hot-toast';

const NotificationSettingsPage = () => {
    const [subTab, setSubTab] = useState('preset'); // preset | personalized | web
    const [loading, setLoading] = useState(false);
    const [settings, setSettings] = useState({
        presets: {},
        personalizedRules: [],
        webPermissions: {
            incomingCalls: true,
            incomingTexts: true
        }
    });

    const fetchSettings = async () => {
        try {
            setLoading(true);
            const res = await api.get('/notification-settings');
            if (res.data.success) {
                setSettings(res.data.data);
            }
        } catch (error) {
            console.error('Failed to fetch notification settings:', error);
            toast.error('Failed to load settings');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSettings();
    }, []);

    const handlePresetToggle = async (category, channel) => {
        const currentVal = settings.presets[category]?.[channel] ?? true;
        const newPresets = {
            ...settings.presets,
            [category]: {
                ...(settings.presets[category] || {}),
                [channel]: !currentVal
            }
        };

        try {
            const res = await api.put('/notification-settings', { presets: newPresets });
            if (res.data.success) {
                setSettings({ ...settings, presets: newPresets });
                toast.success('Settings updated');
            }
        } catch (error) {
            toast.error('Failed to update settings');
        }
    };

    const handleWebPermissionToggle = async (key) => {
        const newVal = !settings.webPermissions[key];
        const newPermissions = { ...settings.webPermissions, [key]: newVal };

        try {
            const res = await api.put('/notification-settings', { webPermissions: newPermissions });
            if (res.data.success) {
                setSettings({ ...settings, webPermissions: newPermissions });
                toast.success('Permission updated');
            }
        } catch (error) {
            toast.error('Failed to update permissions');
        }
    };

    const categories = [
        { id: 'assignments', name: 'Leads & Deals Assignments', icon: 'fas fa-bullseye' },
        { id: 'reminders', name: 'Activity Reminders', icon: 'fas fa-clock' },
        { id: 'mentions', name: 'Mentions & Comments', icon: 'fas fa-at' },
        { id: 'stageChanges', name: 'Stage Transitions', icon: 'fas fa-exchange-alt' },
        { id: 'system', name: 'System & Web Alerts', icon: 'fas fa-bell' }
    ];

    return (
        <div style={{ flex: 1, background: '#f8fafc', padding: '40px', overflowY: 'auto' }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', marginBottom: '32px' }}>Notification Settings</h1>

            <div style={{ display: 'flex', gap: '32px', borderBottom: '1px solid #e2e8f0', marginBottom: '32px' }}>
                <div
                    onClick={() => setSubTab('preset')}
                    style={{
                        paddingBottom: '16px',
                        fontSize: '0.95rem',
                        fontWeight: 700,
                        color: subTab === 'preset' ? '#3b82f6' : '#64748b',
                        borderBottom: `2px solid ${subTab === 'preset' ? '#3b82f6' : 'transparent'}`,
                        cursor: 'pointer'
                    }}
                >
                    Preset Notifications
                </div>
                <div
                    onClick={() => setSubTab('personalized')}
                    style={{
                        paddingBottom: '16px',
                        fontSize: '0.95rem',
                        fontWeight: 700,
                        color: subTab === 'personalized' ? '#3b82f6' : '#64748b',
                        borderBottom: `2px solid ${subTab === 'personalized' ? '#3b82f6' : 'transparent'}`,
                        cursor: 'pointer'
                    }}
                >
                    Personalized Notifications
                </div>
                <div
                    onClick={() => setSubTab('web')}
                    style={{
                        paddingBottom: '16px',
                        fontSize: '0.95rem',
                        fontWeight: 700,
                        color: subTab === 'web' ? '#3b82f6' : '#64748b',
                        borderBottom: `2px solid ${subTab === 'web' ? '#3b82f6' : 'transparent'}`,
                        cursor: 'pointer'
                    }}
                >
                    Web Notifications (Alerts)
                </div>
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: '50px' }}>
                    <i className="fas fa-spinner fa-spin" style={{ fontSize: '1.5rem', color: '#64748b' }}></i>
                </div>
            ) : subTab === 'preset' ? (
                <div style={{ maxWidth: '900px' }}>
                    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                    <th style={{ textAlign: 'left', padding: '16px 24px', fontSize: '0.85rem', fontWeight: 700, color: '#64748b' }}>Activity Type</th>
                                    <th style={{ padding: '16px 24px', fontSize: '0.85rem', fontWeight: 700, color: '#64748b' }}>Web</th>
                                    <th style={{ padding: '16px 24px', fontSize: '0.85rem', fontWeight: 700, color: '#64748b' }}>Email</th>
                                    <th style={{ padding: '16px 24px', fontSize: '0.85rem', fontWeight: 700, color: '#64748b' }}>WhatsApp</th>
                                </tr>
                            </thead>
                            <tbody>
                                {categories.map(cat => (
                                    <tr key={cat.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                        <td style={{ padding: '20px 24px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                <i className={cat.icon} style={{ color: '#64748b' }}></i>
                                                <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#1e293b' }}>{cat.name}</span>
                                            </div>
                                        </td>
                                        <td style={{ textAlign: 'center' }}>
                                            <input
                                                type="checkbox"
                                                checked={settings.presets[cat.id]?.web ?? true}
                                                onChange={() => handlePresetToggle(cat.id, 'web')}
                                                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                                            />
                                        </td>
                                        <td style={{ textAlign: 'center' }}>
                                            <input
                                                type="checkbox"
                                                checked={settings.presets[cat.id]?.email ?? true}
                                                onChange={() => handlePresetToggle(cat.id, 'email')}
                                                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                                            />
                                        </td>
                                        <td style={{ textAlign: 'center' }}>
                                            <input
                                                type="checkbox"
                                                checked={settings.presets[cat.id]?.whatsapp ?? true}
                                                onChange={() => handlePresetToggle(cat.id, 'whatsapp')}
                                                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                                            />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : subTab === 'personalized' ? (
                <div style={{ maxWidth: '900px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                        <p style={{ margin: 0, color: '#64748b', fontSize: '0.9rem' }}>Create custom notification rules for specific entities.</p>
                        <button className="btn-primary" style={{ padding: '8px 16px', borderRadius: '6px', fontSize: '0.85rem' }}>Add New Rule</button>
                    </div>

                    {settings.personalizedRules.length === 0 ? (
                        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '48px', textAlign: 'center' }}>
                            <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px auto', color: '#94a3b8', fontSize: '1.5rem' }}>
                                <i className="fas fa-magic"></i>
                            </div>
                            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1e293b', marginBottom: '8px' }}>No personalized rules yet</h3>
                            <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '0' }}>Rules help you stay updated on specifically what matters to you.</p>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            {settings.personalizedRules.map((rule, idx) => (
                                <div key={idx} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1e293b', marginBottom: '4px' }}>
                                            Notify me when a {rule.entity} matching "{rule.filter} {rule.value}" is updated.
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            {(rule.channels || []).map(c => <span key={c} style={{ fontSize: '0.75rem', background: '#f1f5f9', padding: '2px 8px', borderRadius: '4px', color: '#64748b' }}>{c}</span>)}
                                        </div>
                                    </div>
                                    <button style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}><i className="fas fa-trash"></i></button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            ) : (
                <div style={{ maxWidth: '700px' }}>
                    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '32px' }}>
                        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1e293b', marginBottom: '24px' }}>In-app Web Permissions</h3>
                        
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                            <div>
                                <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#1e293b', marginBottom: '2px' }}>Incoming Call Alerts</div>
                                <div style={{ fontSize: '0.85rem', color: '#64748b' }}>Show popup when a call is routed to you.</div>
                            </div>
                            <input 
                                type="checkbox" 
                                checked={settings.webPermissions?.incomingCalls ?? true} 
                                onChange={() => handleWebPermissionToggle('incomingCalls')}
                                style={{ width: '20px', height: '20px', cursor: 'pointer' }} 
                            />
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#1e293b', marginBottom: '2px' }}>WhatsApp/SMS Web Alerts</div>
                                <div style={{ fontSize: '0.85rem', color: '#64748b' }}>Show web notification for new messages.</div>
                            </div>
                            <input 
                                type="checkbox" 
                                checked={settings.webPermissions?.incomingTexts ?? true} 
                                onChange={() => handleWebPermissionToggle('incomingTexts')}
                                style={{ width: '20px', height: '20px', cursor: 'pointer' }} 
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default NotificationSettingsPage;
