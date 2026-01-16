import React, { useState } from 'react';

const ConnectionModal = ({ type, onClose, onConnect }) => {
    const [config, setConfig] = useState({
        sid: '',
        token: '',
        apiKey: '',
        botToken: '',
        senderId: '',
        businessId: ''
    });

    const getGuideContent = () => {
        switch (type) {
            case 'twilio':
                return {
                    title: 'Twilio SMS Setup',
                    icon: 'fas fa-sms',
                    color: '#F22F46',
                    steps: [
                        'Log in to your Twilio Console.',
                        'Copy your Account SID and Auth Token.',
                        'Buy a phone number or use an existing one.',
                        'Configure the Webhook URL below in your Twilio Number settings.'
                    ]
                };
            case 'whatsapp':
                return {
                    title: 'WhatsApp Business API',
                    icon: 'fab fa-whatsapp',
                    color: '#25D366',
                    steps: [
                        'Go to Meta Business Suite > WhatsApp Manager.',
                        'Create a Business App and get your Permanent Access Token.',
                        'Copy your WhatsApp Business Account ID.',
                        'Verify your sender phone number.'
                    ]
                };
            case 'telegram':
                return {
                    title: 'Telegram Bot Father',
                    icon: 'fab fa-telegram',
                    color: '#0088cc',
                    steps: [
                        'Open Telegram and search for @BotFather.',
                        'Send /newbot and follow instructions.',
                        'Copy the API Token provided.',
                        'Send a test message to your bot to activate.'
                    ]
                };
            case 'rcs':
                return {
                    title: 'Google RCS Business',
                    icon: 'fas fa-comment-dots',
                    color: '#4285F4',
                    steps: [
                        'Register with a Google RBM partner.',
                        'Create your Business Profile.',
                        'Get your RBM Agent API credentials.',
                        'Enable high-fidelity media messaging.'
                    ]
                };
            case 'messenger':
                return {
                    title: 'Facebook Messenger',
                    icon: 'fab fa-facebook-messenger',
                    color: '#006AFF',
                    steps: [
                        'Go to Meta for Developers Console.',
                        'Create or select your Facebook App.',
                        'Add the Messenger product to your app.',
                        'Link your Facebook Page and generate an Access Token.'
                    ]
                };
            case 'webhook':
                return {
                    title: 'Custom Webhook',
                    icon: 'fas fa-code',
                    color: '#1e293b',
                    steps: [
                        'Define your external API endpoint.',
                        'Generate a secure API Secret Key.',
                        'Set up your server to listen for POST requests.',
                        'Map incoming data fields to Bharat CRM schema.'
                    ]
                };
            default: return {};
        }
    };

    const guide = getGuideContent();
    const webhookUrl = `https://api.bharatcrm.com/webhooks/v1/${type}/12345-67890`;

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10002 }}>
            <div style={{ background: '#fff', width: '800px', borderRadius: '20px', display: 'flex', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.3)' }}>
                {/* Left: Setup Guide */}
                <div style={{ flex: 1, background: '#f8fafc', padding: '40px', borderRight: '1px solid #f1f5f9' }}>
                    <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: `${guide.color}15`, color: guide.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', marginBottom: '24px' }}>
                        <i className={guide.icon}></i>
                    </div>
                    <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#1e293b' }}>Setup Guide</h3>
                    <p style={{ fontSize: '0.9rem', color: '#64748b', marginTop: '8px', lineHeight: '1.5' }}>Follow these steps to connect your {guide.title} account.</p>

                    <div style={{ marginTop: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {guide.steps.map((step, idx) => (
                            <div key={idx} style={{ display: 'flex', gap: '12px' }}>
                                <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: '#e2e8f0', color: '#64748b', fontSize: '0.7rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '2px' }}>{idx + 1}</div>
                                <div style={{ fontSize: '0.85rem', color: '#475569', lineHeight: '1.4' }}>{step}</div>
                            </div>
                        ))}
                    </div>

                    <div style={{ marginTop: '32px', padding: '16px', background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                        <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', display: 'block', marginBottom: '8px', textTransform: 'uppercase' }}>Your Webhook URL</label>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <div style={{ flex: 1, fontSize: '0.8rem', color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', background: '#f1f5f9', padding: '8px', borderRadius: '6px' }}>{webhookUrl}</div>
                            <button style={{ background: 'none', border: 'none', color: 'var(--primary-color)', cursor: 'pointer', fontSize: '0.9rem' }} title="Copy URL">
                                <i className="far fa-copy"></i>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Right: Configuration Form */}
                <div style={{ flex: 1.2, padding: '40px', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
                        <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, color: '#1e293b' }}>Configuration</h2>
                        <i className="fas fa-times" style={{ cursor: 'pointer', color: '#94a3b8', fontSize: '1.2rem' }} onClick={onClose}></i>
                    </div>

                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        {type === 'twilio' && (
                            <>
                                <div>
                                    <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '8px' }}>Account SID</label>
                                    <input type="text" style={{ width: '100%', padding: '12px', border: '1px solid #e2e8f0', borderRadius: '10px' }} placeholder="ACxxxxxxxxxxxxxxxx" value={config.sid} onChange={e => setConfig({ ...config, sid: e.target.value })} />
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '8px' }}>Auth Token</label>
                                    <input type="password" style={{ width: '100%', padding: '12px', border: '1px solid #e2e8f0', borderRadius: '10px' }} placeholder="••••••••••••••••" value={config.token} onChange={e => setConfig({ ...config, token: e.target.value })} />
                                </div>
                            </>
                        )}

                        {type === 'whatsapp' && (
                            <>
                                <div>
                                    <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '8px' }}>Access Token</label>
                                    <input type="password" style={{ width: '100%', padding: '12px', border: '1px solid #e2e8f0', borderRadius: '10px' }} placeholder="EAAG..." value={config.apiKey} onChange={e => setConfig({ ...config, apiKey: e.target.value })} />
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '8px' }}>Business Account ID</label>
                                    <input type="text" style={{ width: '100%', padding: '12px', border: '1px solid #e2e8f0', borderRadius: '10px' }} placeholder="10592837..." value={config.businessId} onChange={e => setConfig({ ...config, businessId: e.target.value })} />
                                </div>
                            </>
                        )}

                        {type === 'telegram' && (
                            <div>
                                <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '8px' }}>Bot Token</label>
                                <input type="text" style={{ width: '100%', padding: '12px', border: '1px solid #e2e8f0', borderRadius: '10px' }} placeholder="123456:ABC-DEF..." value={config.botToken} onChange={e => setConfig({ ...config, botToken: e.target.value })} />
                            </div>
                        )}

                        {type === 'rcs' && (
                            <div>
                                <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '8px' }}>Agent Key (JSON)</label>
                                <textarea style={{ width: '100%', minHeight: '120px', padding: '12px', border: '1px solid #e2e8f0', borderRadius: '10px', fontSize: '0.8rem', fontFamily: 'monospace' }} placeholder='{ "type": "service_account", ... }' value={config.apiKey} onChange={e => setConfig({ ...config, apiKey: e.target.value })} />
                            </div>
                        )}

                        {type === 'messenger' && (
                            <>
                                <div>
                                    <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '8px' }}>Page Access Token</label>
                                    <input type="password" style={{ width: '100%', padding: '12px', border: '1px solid #e2e8f0', borderRadius: '10px' }} placeholder="EAAG..." value={config.token} onChange={e => setConfig({ ...config, token: e.target.value })} />
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '8px' }}>Facebook Page ID</label>
                                    <input type="text" style={{ width: '100%', padding: '12px', border: '1px solid #e2e8f0', borderRadius: '10px' }} placeholder="1029384756..." value={config.businessId} onChange={e => setConfig({ ...config, businessId: e.target.value })} />
                                </div>
                            </>
                        )}

                        {type === 'webhook' && (
                            <>
                                <div>
                                    <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '8px' }}>Endpoint URL</label>
                                    <input type="text" style={{ width: '100%', padding: '12px', border: '1px solid #e2e8f0', borderRadius: '10px' }} placeholder="https://api.yourdomain.com/webhook" value={config.apiKey} onChange={e => setConfig({ ...config, apiKey: e.target.value })} />
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '8px' }}>Secret Signature Key</label>
                                    <input type="password" style={{ width: '100%', padding: '12px', border: '1px solid #e2e8f0', borderRadius: '10px' }} placeholder="sk_live_..." value={config.token} onChange={e => setConfig({ ...config, token: e.target.value })} />
                                </div>
                            </>
                        )}

                        <div>
                            <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '8px' }}>Verified Sender ID / Number</label>
                            <input type="text" style={{ width: '100%', padding: '12px', border: '1px solid #e2e8f0', borderRadius: '10px' }} placeholder="+91 99999 00000" value={config.senderId} onChange={e => setConfig({ ...config, senderId: e.target.value })} />
                        </div>
                    </div>

                    <div style={{ marginTop: '40px', display: 'flex', gap: '12px' }}>
                        <button onClick={onClose} style={{ flex: 1, padding: '14px', borderRadius: '12px', border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
                        <button onClick={onConnect} style={{ flex: 2, padding: '14px', borderRadius: '12px', border: 'none', background: 'var(--primary-color)', color: '#fff', fontWeight: 700, cursor: 'pointer', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}>Save Connection</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

const IntegrationsSettingsView = () => {
    const [activeModal, setActiveModal] = useState(null);
    const [connections, setConnections] = useState({
        twilio: { status: 'disconnected', label: 'SMS Gateway', icon: 'fas fa-sms', color: '#F22F46' },
        whatsapp: { status: 'connected', label: 'WhatsApp Meta', icon: 'fab fa-whatsapp', color: '#25D366' },
        telegram: { status: 'disconnected', label: 'Telegram Bot', icon: 'fab fa-telegram', color: '#0088cc' },
        rcs: { status: 'disconnected', label: 'Google RCS', icon: 'fas fa-comment-dots', color: '#4285F4' },
        messenger: { status: 'disconnected', label: 'FB Messenger', icon: 'fab fa-facebook-messenger', color: '#006AFF' }
    });

    const handleConnect = () => {
        setConnections({
            ...connections,
            [activeModal]: { ...connections[activeModal], status: 'connected' }
        });
        setActiveModal(null);
    };

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#fff', overflow: 'hidden' }}>
            <div style={{ padding: '32px 40px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, color: '#1e293b', textTransform: 'uppercase' }}>Integrations Hub</h2>
                    <div style={{ fontSize: '0.9rem', color: '#64748b', marginTop: '8px' }}>Centralized connection management for all your communication channels.</div>
                </div>
                <div style={{ background: '#f8fafc', padding: '10px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', gap: '20px' }}>
                    <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Connected: <span style={{ fontWeight: 800, color: '#10b981' }}>{Object.values(connections).filter(c => c.status === 'connected').length}</span></div>
                    <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Pending: <span style={{ fontWeight: 800, color: '#f59e0b' }}>{Object.values(connections).filter(c => c.status === 'disconnected').length}</span></div>
                </div>
            </div>

            <div style={{ flex: 1, padding: '40px', overflowY: 'auto' }}>
                <div style={{ maxWidth: '1000px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '24px' }}>
                        {Object.entries(connections).map(([key, item]) => (
                            <div key={key} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '24px', transition: 'all 0.3s ease', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', position: 'relative' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                                    <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: `${item.color}10`, color: item.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem' }}>
                                        <i className={item.icon}></i>
                                    </div>
                                    <div style={{ background: item.status === 'connected' ? '#ecfdf5' : '#f8fafc', color: item.status === 'connected' ? '#059669' : '#64748b', padding: '4px 12px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 700, border: `1px solid ${item.status === 'connected' ? '#d1fae5' : '#e2e8f0'}` }}>
                                        {item.status === 'connected' ? 'ACTIVE' : 'DISCONNECTED'}
                                    </div>
                                </div>
                                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#1e293b' }}>{item.label}</h3>
                                <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '8px', lineHeight: '1.6' }}>
                                    {key === 'twilio' && 'Send and receive high-volume SMS across 200+ countries.'}
                                    {key === 'whatsapp' && 'Connect Meta Business API for verified messaging.'}
                                    {key === 'telegram' && 'Manage customer engagement via Telegram bots.'}
                                    {key === 'rcs' && 'The next generation of business messaging with rich media.'}
                                    {key === 'messenger' && 'Directly sync Facebook Page messages with Bharat CRM.'}
                                </p>

                                <div style={{ marginTop: '24px', borderTop: '1px solid #f1f5f9', paddingTop: '20px', display: 'flex', gap: '12px' }}>
                                    <button onClick={() => setActiveModal(key)} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff', color: '#1e293b', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer' }}>
                                        {item.status === 'connected' ? 'Update Settings' : 'Configure'}
                                    </button>
                                    {item.status === 'connected' && (
                                        <button style={{ padding: '10px 14px', borderRadius: '8px', border: 'none', background: 'var(--primary-color)', color: '#fff', fontSize: '0.85rem', cursor: 'pointer' }}>
                                            <i className="fas fa-paper-plane" title="Send Test"></i>
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}

                        {/* Custom Webhook Card */}
                        <div style={{ background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)', borderRadius: '16px', padding: '24px', color: '#fff', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
                            <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(255,255,255,0.1)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem', marginBottom: '16px' }}>
                                <i className="fas fa-code"></i>
                            </div>
                            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>Custom Webhook</h3>
                            <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '8px', lineHeight: '1.5' }}>Integrate your proprietary messaging systems via REST API.</p>
                            <button onClick={() => setActiveModal('webhook')} style={{ marginTop: '20px', padding: '10px 24px', borderRadius: '8px', border: 'none', background: '#fff', color: '#1e293b', fontSize: '0.85rem', fontWeight: 800, cursor: 'pointer' }}>Add Endpoint</button>
                        </div>
                    </div>
                </div>
            </div>

            {activeModal && <ConnectionModal type={activeModal} onClose={() => setActiveModal(null)} onConnect={handleConnect} />}
        </div>
    );
};

export default IntegrationsSettingsView;
