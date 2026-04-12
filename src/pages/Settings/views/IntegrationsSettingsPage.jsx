import { useState, useEffect } from 'react';
import { googleSettingsAPI, systemSettingsAPI, marketingAPI, socialAPI } from '../../../utils/api';
import { toast } from 'react-hot-toast';

import smsService from '../../../services/smsService';
import contactSyncManager from '../../../services/contactSyncManager';

const ConnectionModal = ({ type, connectionData, onClose, onConnect }) => {
    const [smsProvider, setSmsProvider] = useState('Twilio');
    const [config, setConfig] = useState({
        sid: '',
        token: '',
        from: '',
        apiKey: '',
        senderId: '',
        baseUrl: '',
        channel: '2',
        dcs: '0',
        flash: false,
        url: '',
        method: 'POST',
        headers: '{}',
        bodyTemplate: '',
        entityId: '',
        route: 'clickhere',
        clientId: '',
        clientSecret: '',
        redirectUri: 'http://localhost:4000/api/marketing/linkedin/callback',
        orgId: '42752175'
    });

    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState(null);
    const [isSaving, setIsSaving] = useState(false);
    const [lastKnownStatus, setLastKnownStatus] = useState('Not Connected');


    // Load existing config if available
    useEffect(() => {
        if (type === 'twilio') {
            loadConfig();
        } else if (['openai', 'gemini', 'claude', 'knowlarity', 'gupshup', 'linkedin', 'whatsapp'].includes(type)) {
            loadAiConfig();
        }
    }, [type]);

    const loadAiConfig = async () => {
        try {
            const configKey = type === 'linkedin' ? 'linkedin_integration' : (type === 'whatsapp' ? 'meta_wa_config' : `ai_${type}_config`);
            const res = await systemSettingsAPI.getByKey(configKey);
            if (res && res.data && res.data.value) {
                const loadedConfig = res.data.value;
                setConfig(prev => ({ 
                    ...prev, 
                    ...loadedConfig, 
                    token: loadedConfig.token || loadedConfig.apiKey || '',
                    redirectUri: loadedConfig.redirectUri || 'http://localhost:4000/api/marketing/linkedin/callback' 
                }));
                setLastKnownStatus(type === 'linkedin' && connectionData?.health === 'EXPIRED' ? 'Expired' : 'Connected');
            }
        } catch (err) {
            console.error(`Failed to load ${type} config`, err);
        }
    };

    const loadConfig = async () => {
        try {
            const res = await smsService.getProviders();
            const active = res.data.find(p => p.isActive) || res.data[0];
            if (active) {
                setSmsProvider(active.provider);
                setConfig(prev => ({ ...prev, ...active.config }));
                setLastKnownStatus(active.status);
            }
        } catch (err) {
            console.error('Failed to load SMS config', err);
        }
    };


    const handleSave = async () => {
        setIsSaving(true);
        setTestResult(null);
        try {
            const configKey = type === 'linkedin' ? 'linkedin_integration' : `ai_${type}_config`;
            if (['openai', 'gemini', 'claude', 'knowlarity', 'gupshup', 'linkedin', 'facebook', 'instagram', 'whatsapp'].includes(type)) {
                if (type === 'linkedin') {
                    // ── Senior Professional Fix ──────────────────────────────────────────
                    // Strip out empty SMS fields to prevent leaking garbage into LinkedIn config
                    const { sid, token, from, apiKey, senderId, baseUrl, url, method, headers, bodyTemplate, entityId, route, ...linkedInOnlyConfig } = config;
                    
                    await marketingAPI.saveLinkedInConfig(linkedInOnlyConfig);
                    toast.success('LinkedIn credentials saved. Now click Step 2 to authorize.');
                } else if (['facebook', 'instagram', 'whatsapp'].includes(type)) {
                    if (type === 'whatsapp') {
                        // Normalize token/apiKey for Meta
                        const whatsappPayload = {
                            token: config.token || config.apiKey,
                            phoneId: config.phoneId,
                            businessId: config.businessId || config.wabaId
                        };
                        await socialAPI.saveWhatsAppConfig(whatsappPayload);
                    } else {
                        await socialAPI.saveConfig(type, config);
                    }
                    setLastKnownStatus('Connected');
                    toast.success(`${type.charAt(0).toUpperCase() + type.slice(1)} configuration updated successfully!`);
                } else {
                    const payload = { value: config };
                    await systemSettingsAPI.upsert(configKey, payload);
                    setLastKnownStatus('Connected');
                    toast.success(`${type.toUpperCase()} configuration saved successfully!`);
                }
                
                if (onConnect) onConnect();
            } else {
                await smsService.updateConfig(smsProvider, config);
                await smsService.activateProvider(smsProvider);

                const testRes = await smsService.testConnection(smsProvider, '+919876543210', 'Validation Test', config);

                if (testRes.success) {
                    setLastKnownStatus('Connected');
                    setTestResult({ success: true, message: 'Configuration saved and gateway connected!' });
                    onConnect();
                } else {
                    setLastKnownStatus('Error');
                    setTestResult({ success: false, message: 'Saved successfully, but connection test failed: ' + testRes.error });
                }
            }
        } catch (err) {
            setLastKnownStatus('Error');
            alert('Failed to save configuration: ' + err.message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleTest = async () => {
        if (!config.apiKey && !config.sid && !config.token) {
            setTestResult({ success: false, message: 'Please enter credentials first' });
            return;
        }

        setTesting(true);
        setTestResult(null);
        try {
            let res;
            if (['openai', 'gemini', 'claude'].includes(type)) {
                res = await systemSettingsAPI.testAi(type, config);
            } else {
                const phone = prompt('Enter phone number to send test SMS (with country code):', '+91');
                if (!phone) {
                    setTesting(false);
                    return;
                }
                res = await smsService.testConnection(smsProvider, phone, 'Test message from Bharat CRM', config);
            }

            if (res.success) {
                setTestResult({ success: true, message: res.message || 'Test successful!' });
                setLastKnownStatus('Connected');
            } else {
                setTestResult({ success: false, message: res.error || 'Test failed' });
                setLastKnownStatus('Error');
            }
        } catch (err) {
            setTestResult({ success: false, message: err.message });
            setLastKnownStatus('Error');
        } finally {
            setTesting(false);
        }
    };

    const getGuideContent = () => {
        if (type === 'twilio') {
            switch (smsProvider) {
                case 'Twilio':
                    return {
                        title: 'Twilio SMS Setup',
                        icon: 'fas fa-sms',
                        color: '#F22F46',
                        steps: [
                            'Log in to your Twilio Console.',
                            'Copy your Account SID and Auth Token.',
                            'Buy a phone number or use an existing one.',
                            'Configure the Webhook URL below in your Twilio settings.'
                        ],
                        showWebhook: true
                    };
                case 'SMSGatewayHub':
                    return {
                        title: 'SMSGatewayHub Setup',
                        icon: 'fas fa-broadcast-tower',
                        color: '#0ea5e9',
                        steps: [
                            'Log in to smsgatewayhub.com.',
                            'Go to API Settings > API Key.',
                            'Get your Sender ID and Principal Entity ID (for DLT).',
                            'Ensure you have sufficient balance and approved templates.'
                        ],
                        showWebhook: false
                    };
                case 'Custom HTTP':
                    return {
                        title: 'Custom HTTP Gateway',
                        icon: 'fas fa-code',
                        color: '#1e293b',
                        steps: [
                            'Define your API endpoint URL.',
                            'Choose HTTP Method (GET/POST).',
                            'Set headers (JSON format).',
                            'Use {{number}} and {{message}} in templates.'
                        ],
                        showWebhook: false
                    };
                default: return {};
            }
        }

        // Other legacy integrations
        switch (type) {
            case 'whatsapp':
                return {
                    title: 'WhatsApp Business API (Cloud)',
                    icon: 'fab fa-whatsapp',
                    color: '#25D366',
                    steps: [
                        'Go to Meta Business Suite > WhatsApp Manager.',
                        'Create a Business App and generate a **Permanent System User Token**.',
                        'Copy your **Phone Number ID** (from API Setup).',
                        'Copy your **WhatsApp Business Account ID** (WABA ID).',
                        'Configure the Webhook URL below for real-time status updates.'
                    ],
                    showWebhook: true
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
                    ],
                    showWebhook: true
                };
            case 'rcs': return { title: 'Google RCS Business', icon: 'fas fa-comment-dots', color: '#4285F4', steps: ['Register with a Google RBM partner.', 'Create your Business Profile.', 'Get your RBM Agent API credentials.', 'Enable high-fidelity media messaging.'], showWebhook: true };
            case 'facebook':
                return {
                    title: 'Facebook Page Setup',
                    icon: 'fab fa-facebook',
                    color: '#1877F2',
                    steps: [
                        'Go to Meta for Developers Console.',
                        'Create or select your Facebook App.',
                        'Add the Messenger product to your app.',
                        'Link your Facebook Page and generate an Access Token.'
                    ],
                    showWebhook: true
                };
            case 'instagram':
                return {
                    title: 'Instagram Business Setup',
                    icon: 'fab fa-instagram',
                    color: '#E4405F',
                    steps: [
                        'Convert your Instagram to a Business Account.',
                        'Link it to your verified Facebook Page.',
                        'Get your Instagram User ID from Meta Suite.',
                        'Ensure you have permissions: instagram_basic, instagram_manage_comments.'
                    ],
                    showWebhook: true
                };
            case 'messenger': return { title: 'Facebook Messenger', icon: 'fab fa-facebook-messenger', color: '#006AFF', steps: ['Go to Meta for Developers Console.', 'Create or select your Facebook App.', 'Add the Messenger product to your app.', 'Link your Facebook Page and generate an Access Token.'], showWebhook: true };
            case 'google_calendar': return { title: 'Google Calendar API', icon: 'fab fa-google', color: '#4285F4', steps: ['Go to Google Cloud Console and create a project.', 'Enable the "Google Calendar API" for your project.', 'Configure OAuth Credentials.', 'Copy Client ID and Secret.'] };
            case 'apple_calendar': return { title: 'iCloud Calendar (CalDAV)', icon: 'fab fa-apple', color: '#000000', steps: ['Log in to appleid.apple.com', 'Create App-Specific Password.', 'Copy the 16-character code.'], showWebhook: false };
            case 'openai':
                return {
                    title: 'OpenAI (ChatGPT) Setup',
                    icon: 'fas fa-robot',
                    color: '#74aa9c',
                    steps: [
                        'Go to platform.openai.com',
                        'Navigate to API Keys section.',
                        'Create a new secret key.',
                        'Ensure you have sufficient credits in your billing.'
                    ],
                    showWebhook: false
                };
            case 'gemini':
                return {
                    title: 'Google Gemini AI Setup',
                    icon: 'fab fa-google',
                    color: '#4285f4',
                    steps: [
                        'Go to Google AI Studio (aistudio.google.com)',
                        'Click on "Get API key".',
                        'Create or select a Google Cloud project.',
                        'Copy the API Key.'
                    ],
                    showWebhook: false
                };
            case 'claude':
                return {
                    title: 'Anthropic (Claude) Setup',
                    icon: 'fas fa-brain',
                    color: '#d97757',
                    steps: [
                        'Go to console.anthropic.com',
                        'Navigate to Settings > API Keys.',
                        'Generate a new API Key.',
                        'Choose your preferred Claude 3 model.'
                    ],
                    showWebhook: false
                };
            case 'linkedin':
                return {
                    title: 'LinkedIn Business Integration',
                    icon: 'fab fa-linkedin',
                    color: '#0077b5',
                    steps: [
                        'Go to LinkedIn Developer Portal and create a new App.',
                        'Enable "Lead Gen Forms" and "Sign In with LinkedIn" products.',
                        'Configure Redirect URI: http://localhost:4000/api/marketing/linkedin/callback',
                        'Step 1: Save Client ID/Secret below.',
                        'Step 2: Click "Connect LinkedIn via OAuth" button.'
                    ],
                    showWebhook: false
                };
            case 'knowlarity':
                return {
                    title: 'Knowlarity Voice (SR)',
                    icon: 'fas fa-phone-volume',
                    color: '#f37021',
                    steps: [
                        'Log in to your Knowlarity SuperReceptionist portal.',
                        'Go to Settings > Plan Settings to find your API Key.',
                        'Ensure your Virtual Number (SR Number) is active.',
                        'Map your CRM agents to Knowlarity extensions.'
                    ],
                    showWebhook: false
                };
            case 'gupshup':
                return {
                    title: 'Gupshup Messaging',
                    icon: 'fas fa-comment-dots',
                    color: '#00aed9',
                    steps: [
                        'Register a Business Account on Gupshup.',
                        'Create a new project/app in the dashboard.',
                        'Get your API Key from the App Settings.',
                        'Configure the source number and app name below.'
                    ],
                    showWebhook: true
                };
            case 'webhook': return { title: 'Inbound Webhook', icon: 'fas fa-code', color: '#1e293b', steps: ['Define external API endpoint.', 'Generate API Secret Key.', 'Map incoming data fields.'], showWebhook: true };
            default: return {};
        }
    };

    const guide = getGuideContent();
    const webhookUrl = `https://api.bharatcrm.com/webhooks/v1/sms/active-provider`;

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10002 }}>
            <div style={{ background: '#fff', width: '850px', borderRadius: '24px', display: 'flex', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.3)', border: '1px solid #e2e8f0' }}>
                {/* Left: Setup Guide */}
                <div style={{ flex: 1, background: '#f8fafc', padding: '40px', borderRight: '1px solid #f1f5f9' }}>
                    <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: `${guide.color}15`, color: guide.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', marginBottom: '24px' }}>
                        <i className={guide.icon}></i>
                    </div>
                    <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#1e293b' }}>{guide.title}</h3>
                    <p style={{ fontSize: '0.9rem', color: '#64748b', marginTop: '8px', lineHeight: '1.5' }}>Follow steps to connect your account.</p>

                    <div style={{ marginTop: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {(guide.steps || []).map((step, idx) => (
                            <div key={idx} style={{ display: 'flex', gap: '12px' }}>
                                <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: '#fff', color: guide.color, border: `2px solid ${guide.color}40`, fontSize: '0.75rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '2px' }}>{idx + 1}</div>
                                <div style={{ fontSize: '0.85rem', color: '#475569', lineHeight: '1.4' }}>{step}</div>
                            </div>
                        ))}
                    </div>

                    {guide.showWebhook && (
                        <div style={{ marginTop: '32px', padding: '16px', background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                            <label style={{ fontSize: '0.7rem', fontWeight: 800, color: '#94a3b8', display: 'block', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Webhook URL</label>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                <div style={{ flex: 1, fontSize: '0.75rem', color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', background: '#f1f5f9', padding: '10px', borderRadius: '8px', fontFamily: 'monospace' }}>{webhookUrl}</div>
                                <button onClick={() => { navigator.clipboard.writeText(webhookUrl); alert('Copied!'); }} style={{ background: 'none', border: 'none', color: 'var(--primary-color)', cursor: 'pointer', fontSize: '1rem' }} title="Copy URL">
                                    <i className="far fa-copy"></i>
                                </button>
                            </div>
                        </div>
                    )}

                    <div style={{ marginTop: 'auto', paddingTop: '30px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '16px', background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: lastKnownStatus === 'Connected' ? '#10b981' : (lastKnownStatus === 'Expired' || lastKnownStatus === 'Error' ? '#ef4444' : '#94a3b8') }}></div>
                                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569' }}>
                                    Gateway Status: {lastKnownStatus}
                                </span>
                            </div>
                            {testResult && (
                                <div style={{ fontSize: '0.75rem', color: testResult.success ? '#10b981' : '#ef4444', background: testResult.success ? '#f0fdf4' : '#fef2f2', padding: '8px', borderRadius: '6px', border: `1px solid ${testResult.success ? '#dcfce7' : '#fee2e2'}` }}>
                                    <i className={`fas ${testResult.success ? 'fa-check-circle' : 'fa-exclamation-circle'}`} style={{ marginRight: '6px' }}></i>
                                    {testResult.message}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Right: Configuration Form / Templates / Logs */}
                <div style={{ flex: 1.2, padding: '40px', display: 'flex', flexDirection: 'column', minHeight: '650px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                        <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, color: '#1e293b' }}>
                            {type === 'twilio' ? 'SMS Communication Hub' : 'Integration Setup'}
                        </h2>
                        <i className="fas fa-times" style={{ cursor: 'pointer', color: '#94a3b8', fontSize: '1.2rem' }} onClick={onClose}></i>
                    </div>


                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto', paddingRight: '4px' }}>
                        {type === 'twilio' && (
                            <div style={{ marginBottom: '24px' }}>
                                <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '10px' }}>Select SMS Provider</label>
                                <div style={{ display: 'flex', gap: '10px' }}>
                                    {['Twilio', 'SMSGatewayHub', 'Custom HTTP'].map(p => (
                                        <button
                                            key={p}
                                            onClick={() => setSmsProvider(p)}
                                            style={{
                                                flex: 1,
                                                padding: '10px',
                                                borderRadius: '10px',
                                                border: `2px solid ${smsProvider === p ? 'var(--primary-color)' : '#e2e8f0'}`,
                                                background: smsProvider === p ? `${guide.color}05` : '#fff',
                                                color: smsProvider === p ? 'var(--primary-color)' : '#64748b',
                                                fontWeight: 700,
                                                fontSize: '0.85rem',
                                                transition: '0.2s',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            {p}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {type === 'twilio' && smsProvider === 'Twilio' && (
                            <>
                                <div className="card-input-group">
                                    <label>Account SID</label>
                                    <input type="text" placeholder="ACxxxxxxxxxxxxxxxx" value={config.sid} onChange={e => setConfig({ ...config, sid: e.target.value })} />
                                </div>
                                <div className="card-input-group">
                                    <label>Auth Token</label>
                                    <input type="password" placeholder="••••••••••••••••" value={config.token} onChange={e => setConfig({ ...config, token: e.target.value })} />
                                </div>
                                <div className="card-input-group">
                                    <label>Verified Twilio Number</label>
                                    <input type="text" placeholder="+1 234 567 8900" value={config.from} onChange={e => setConfig({ ...config, from: e.target.value })} />
                                </div>
                                <div className="card-input-group">
                                    <label>Messaging Service SID (Optional)</label>
                                    <input type="text" placeholder="MGxxxxxxxxxxxxxxxx" value={config.messagingSid} onChange={e => setConfig({ ...config, messagingSid: e.target.value })} />
                                </div>
                                <div className="card-input-group">
                                    <label>Voice URL (For Webhooks)</label>
                                    <input type="text" placeholder="https://..." value={config.voiceUrl} onChange={e => setConfig({ ...config, voiceUrl: e.target.value })} />
                                </div>
                            </>
                        )}

                        {type === 'twilio' && smsProvider === 'SMSGatewayHub' && (
                            <>
                                <div className="card-input-group">
                                    <label>API Base URL</label>
                                    <input type="text" placeholder="https://login.smsgatewayhub.com/api/mt/SendSMS" value={config.baseUrl} onChange={e => setConfig({ ...config, baseUrl: e.target.value })} />
                                </div>
                                <div className="card-input-group">
                                    <label>API Key</label>
                                    <input type="password" placeholder="••••••••••••••••" value={config.apiKey} onChange={e => setConfig({ ...config, apiKey: e.target.value })} />
                                </div>
                                <div className="card-input-group">
                                    <label>Sender ID</label>
                                    <input type="text" placeholder="BHARAT" value={config.senderId} onChange={e => setConfig({ ...config, senderId: e.target.value })} />
                                </div>
                                <div className="card-input-group">
                                    <label>Principal Entity ID (DLT)</label>
                                    <input type="text" placeholder="1201..." value={config.entityId} onChange={e => setConfig({ ...config, entityId: e.target.value })} />
                                </div>
                                <div className="card-input-group">
                                    <label>Route</label>
                                    <input type="text" placeholder="e.g. clickhere" value={config.route} onChange={e => setConfig({ ...config, route: e.target.value })} />
                                </div>
                                <div style={{ display: 'flex', gap: '12px' }}>
                                    <div className="card-input-group" style={{ flex: 1 }}>
                                        <label>Channel</label>
                                        <select value={config.channel} onChange={e => setConfig({ ...config, channel: e.target.value })} style={{ width: '100%', padding: '12px', border: '1px solid #e2e8f0', borderRadius: '10px' }}>
                                            <option value="1">Promotional</option>
                                            <option value="2">Transactional</option>
                                        </select>
                                    </div>
                                    <div className="card-input-group" style={{ flex: 1 }}>
                                        <label>Flash SMS</label>
                                        <div style={{ display: 'flex', alignItems: 'center', height: '45px' }}>
                                            <label className="switch">
                                                <input type="checkbox" checked={config.flash} onChange={e => setConfig({ ...config, flash: e.target.checked })} />
                                                <span className="slider round"></span>
                                            </label>
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}

                        {type === 'twilio' && smsProvider === 'Custom HTTP' && (
                            <>
                                <div className="card-input-group">
                                    <label>API URL Endpoint</label>
                                    <input type="text" placeholder="https://api.gateway.com/send?to={{number}}&msg={{message}}" value={config.url} onChange={e => setConfig({ ...config, url: e.target.value })} />
                                </div>
                                <div className="card-input-group">
                                    <label>HTTP Method</label>
                                    <select value={config.method} onChange={e => setConfig({ ...config, method: e.target.value })} style={{ width: '100%', padding: '12px', border: '1px solid #e2e8f0', borderRadius: '10px' }}>
                                        <option value="GET">GET</option>
                                        <option value="POST">POST</option>
                                    </select>
                                </div>
                                <div className="card-input-group">
                                    <label>Headers (JSON)</label>
                                    <textarea placeholder='{ "Authorization": "Bearer token" }' value={config.headers} onChange={e => setConfig({ ...config, headers: e.target.value })} style={{ height: '80px', fontFamily: 'monospace', fontSize: '0.8rem' }} />
                                </div>
                                {config.method === 'POST' && (
                                    <div className="card-input-group">
                                        <label>Body Template (JSON)</label>
                                        <textarea placeholder='{ "to": "{{number}}", "text": "{{message}}" }' value={config.bodyTemplate} onChange={e => setConfig({ ...config, bodyTemplate: e.target.value })} style={{ height: '80px', fontFamily: 'monospace', fontSize: '0.8rem' }} />
                                    </div>
                                )}
                            </>
                        )}

                        {type === 'openai' && (
                            <>
                                <div className="card-input-group">
                                    <label>OpenAI API Key</label>
                                    <input type="password" placeholder="sk-..." value={config.apiKey} onChange={e => setConfig({ ...config, apiKey: e.target.value })} />
                                </div>
                                <div className="card-input-group">
                                    <label>Preferred Model</label>
                                    <select value={config.model || 'gpt-4o'} onChange={e => setConfig({ ...config, model: e.target.value })} style={{ width: '100%', padding: '12px', border: '1px solid #e2e8f0', borderRadius: '10px' }}>
                                        <option value="gpt-4o">GPT-4o (Most Powerful)</option>
                                        <option value="gpt-4o-mini">GPT-4o Mini (Fastest)</option>
                                        <option value="gpt-3.5-turbo">GPT-3.5 Turbo (Legacy)</option>
                                    </select>
                                </div>
                            </>
                        )}

                        {type === 'knowlarity' && (
                            <>
                                <div className="card-input-group">
                                    <label>Knowlarity API Key</label>
                                    <input type="password" placeholder="...-....-..." value={config.apiKey} onChange={e => setConfig({ ...config, apiKey: e.target.value })} />
                                </div>
                                <div className="card-input-group">
                                    <label>SR Number (Your Virtual Number)</label>
                                    <input type="text" placeholder="e.g. +911234567890" value={config.srNumber} onChange={e => setConfig({ ...config, srNumber: e.target.value })} />
                                </div>
                                <div className="card-input-group">
                                    <label>Application ID (Optional)</label>
                                    <input type="text" value={config.appId} onChange={e => setConfig({ ...config, appId: e.target.value })} />
                                </div>
                            </>
                        )}

                        {type === 'gupshup' && (
                            <>
                                <div className="card-input-group">
                                    <label>Gupshup API Key</label>
                                    <input type="password" value={config.apiKey} onChange={e => setConfig({ ...config, apiKey: e.target.value })} />
                                </div>
                                <div className="card-input-group">
                                    <label>App Name</label>
                                    <input type="text" placeholder="MyCRMApp" value={config.appName} onChange={e => setConfig({ ...config, appName: e.target.value })} />
                                </div>
                                <div className="card-input-group">
                                    <label>Source Number</label>
                                    <input type="text" placeholder="+91..." value={config.sourceNumber} onChange={e => setConfig({ ...config, sourceNumber: e.target.value })} />
                                </div>
                            </>
                        )}

                        {type === 'gemini' && (
                            <>
                                <div className="card-input-group">
                                    <label>Google Gemini API Key</label>
                                    <input type="password" placeholder="AIza..." value={config.apiKey} onChange={e => setConfig({ ...config, apiKey: e.target.value })} />
                                </div>
                                <div className="card-input-group">
                                    <label>Preferred Model</label>
                                    <select value={config.model || 'gemini-1.5-pro'} onChange={e => setConfig({ ...config, model: e.target.value })} style={{ width: '100%', padding: '12px', border: '1px solid #e2e8f0', borderRadius: '10px' }}>
                                        <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
                                        <option value="gemini-1.5-pro-latest">Gemini 1.5 Pro (Latest)</option>
                                        <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
                                        <option value="gemini-1.5-flash-latest">Gemini 1.5 Flash (Latest)</option>
                                        <option value="gemini-pro">Gemini 1.0 Pro</option>
                                    </select>
                                </div>
                            </>
                        )}

                        {type === 'facebook' && (
                            <>
                                <div className="card-input-group">
                                    <label>Page Access Token (Long-lived)</label>
                                    <input type="password" placeholder="EAA..." value={config.pageAccessToken || ''} onChange={e => setConfig({ ...config, pageAccessToken: e.target.value })} />
                                </div>
                                <div className="card-input-group">
                                    <label>Facebook Page ID</label>
                                    <input type="text" placeholder="102345..." value={config.pageId || ''} onChange={e => setConfig({ ...config, pageId: e.target.value })} />
                                </div>
                            </>
                        )}

                        {type === 'instagram' && (
                            <>
                                <div className="card-input-group">
                                    <label>Instagram Business User ID</label>
                                    <input type="text" placeholder="1784..." value={config.igUserId || ''} onChange={e => setConfig({ ...config, igUserId: e.target.value })} />
                                </div>
                                <div className="card-input-group">
                                    <label>Linked Page Access Token</label>
                                    <input type="password" placeholder="EAA..." value={config.pageAccessToken || ''} onChange={e => setConfig({ ...config, pageAccessToken: e.target.value })} />
                                </div>
                            </>
                        )}

                        {type === 'claude' && (
                            <>
                                <div className="card-input-group">
                                    <label>Anthropic Claude API Key</label>
                                    <input type="password" placeholder="xkeys-..." value={config.apiKey} onChange={e => setConfig({ ...config, apiKey: e.target.value })} />
                                </div>
                                <div className="card-input-group">
                                    <label>Preferred Model</label>
                                    <select value={config.model || 'claude-3-5-sonnet-20240620'} onChange={e => setConfig({ ...config, model: e.target.value })} style={{ width: '100%', padding: '12px', border: '1px solid #e2e8f0', borderRadius: '10px' }}>
                                        <option value="claude-3-5-sonnet-20240620">Claude 3.5 Sonnet (Intelligent & Fast)</option>
                                        <option value="claude-3-opus-20240229">Claude 3 Opus (Most Powerful)</option>
                                        <option value="claude-3-haiku-20240307">Claude 3 Haiku (Extremely Fast)</option>
                                    </select>
                                </div>
                            </>
                        )}

                        {!['openai', 'gemini', 'claude'].includes(type) && (
                            <div style={{ padding: '16px', background: '#eff6ff', borderRadius: '12px', border: '1px solid #bfdbfe', display: 'flex', gap: '12px', alignItems: 'center' }}>
                                <i className="fas fa-info-circle" style={{ color: '#3b82f6' }}></i>
                                <div style={{ fontSize: '0.8rem', color: '#1e40af', lineHeight: '1.4' }}>
                                    <strong>Note:</strong> SMS Templates and Delivery Logs have been moved to <strong>Settings &gt; Messaging</strong> for a more centralized experience.
                                </div>
                            </div>
                        )}

                        {/* Legacy forms kept simple */}
                        {type === 'whatsapp' && (
                            <>
                                <div className="card-input-group">
                                    <label>Permanent Access Token</label>
                                    <input type="password" placeholder="EAA..." value={config.token || ''} onChange={e => setConfig({ ...config, token: e.target.value })} />
                                </div>
                                <div className="card-input-group">
                                    <label>Phone Number ID (REQUIRED)</label>
                                    <input type="text" placeholder="123456789..." value={config.phoneId || ''} onChange={e => setConfig({ ...config, phoneId: e.target.value })} />
                                </div>
                                <div className="card-input-group">
                                    <label>WhatsApp Business Account ID</label>
                                    <input type="text" placeholder="WABA ID..." value={config.businessId || ''} onChange={e => setConfig({ ...config, businessId: e.target.value })} />
                                </div>
                                <div className="card-input-group">
                                    <label>Webhook Verify Token (Optional)</label>
                                    <input type="text" placeholder="my_secret_token" value={config.verifyToken} onChange={e => setConfig({ ...config, verifyToken: e.target.value })} />
                                </div>
                            </>
                        )}
                        {type === 'linkedin' && (
                            <>
                                <div className="card-input-group">
                                    <label>Client ID</label>
                                    <input type="text" placeholder="LinkedIn App Client ID" value={config.clientId || ''} onChange={e => setConfig({ ...config, clientId: e.target.value })} />
                                </div>
                                <div className="card-input-group">
                                    <label>Client Secret</label>
                                    <input type="password" placeholder="LinkedIn App Client Secret" value={config.clientSecret || ''} onChange={e => setConfig({ ...config, clientSecret: e.target.value })} />
                                </div>
                                <div className="card-input-group">
                                    <label>Redirect URI (Standardized)</label>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <input type="text" readOnly value={config.redirectUri || 'http://localhost:4000/api/marketing/linkedin/callback'} style={{ background: '#f8fafc', color: '#64748b', cursor: 'not-allowed' }} />
                                        <button onClick={() => { navigator.clipboard.writeText(config.redirectUri); toast.success('Copied!'); }} style={{ padding: '0 12px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer' }}><i className="far fa-copy"></i></button>
                                    </div>
                                </div>
                                <div className="card-input-group">
                                    <label>Organization ID</label>
                                    <input type="text" placeholder="e.g. 42752175" value={config.orgId || '42752175'} onChange={e => setConfig({ ...config, orgId: e.target.value })} />
                                </div>
                                <div style={{ fontSize: '0.75rem', color: '#64748b', background: '#eff6ff', padding: '12px', borderRadius: '10px', border: '1px solid #bfdbfe', marginTop: '10px', display: 'flex', gap: '8px' }}>
                                    <i className="fas fa-info-circle" style={{ color: '#3b82f6', marginTop: '2px' }}></i>
                                    <div>
                                        <strong style={{ color: '#1e40af' }}>Two-Step Setup:</strong><br/>
                                        1. Click <b>Save Configuration</b> first.<br/>
                                        2. Then click <b>Connect via OAuth</b> to authorize access.
                                    </div>
                                </div>
                            </>
                        )}
                    </div>

                    <style>{`
                        .card-input-group { display: flex; flexDirection: column; gap: 8px; }
                        .card-input-group label { fontSize: 0.8rem; fontWeight: 700; color: #64748b; }
                        .card-input-group input, .card-input-group textarea { width: 100%; padding: 12px; border: 1px solid #e2e8f0; borderRadius: 10px; fontSize: 0.9rem; transition: border 0.2s; }
                        .card-input-group input:focus { border-color: var(--primary-color); outline: none; }
                        .switch { position: relative; display: inline-block; width: 44px; height: 22px; }
                        .switch input { opacity: 0; width: 0; height: 0; }
                        .slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #ccc; transition: .4s; border-radius: 34px; }
                        .slider:before { position: absolute; content: ""; height: 16px; width: 16px; left: 3px; bottom: 3px; background-color: white; transition: .4s; border-radius: 50%; }
                        input:checked + .slider { background-color: var(--primary-color); }
                        input:checked + .slider:before { transform: translateX(22px); }
                    `}</style>


                        {type === 'linkedin' && connectionData?.status === 'connected' && (
                            <div style={{ marginTop: '16px', padding: '12px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                    <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>Connection Health</span>
                                    <span style={{ fontSize: '0.7rem', color: connectionData?.health === 'EXPIRED' ? '#f59e0b' : '#10b981', fontWeight: 800 }}>
                                        {connectionData?.health === 'EXPIRED' ? 'EXPIRED (NEEDS RE-AUTH)' : 'EXCELLENT'}
                                    </span>
                                </div>
                                <div style={{ fontSize: '0.75rem', color: '#1e293b', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span>Token Refresh:</span>
                                        <strong>Every 60 Days (Auto)</strong>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span>Permanent Auth:</span>
                                        <strong>Active (Permanent)</strong>
                                    </div>
                                    {connectionData.expiresAt && (
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', borderTop: '1px dashed #e2e8f0', paddingTop: '4px' }}>
                                            <span>Session Expiry:</span>
                                            <span>{new Date(connectionData.expiresAt).toLocaleDateString()}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {type === 'linkedin' && connectionData?.status === 'connected' && (
                            <div style={{ marginTop: '20px', padding: '16px', borderRadius: '12px', background: '#eff6ff', border: '1px solid #bfdbfe', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <h4 style={{ margin: 0, fontSize: '0.85rem', color: '#1e40af' }}>Lead Generation</h4>
                                    <p style={{ margin: '4px 0 0', fontSize: '0.7rem', color: '#3b82f6' }}>Automated Lead Sync is <strong>Active</strong></p>
                                </div>
                                <button
                                    onClick={async () => {
                                        try {
                                            toast.info('Syncing leads from LinkedIn...');
                                            const res = await marketingAPI.triggerLinkedInSync();
                                            if (res.success) {
                                                toast.success(`Sync Complete: ${res.syncedCount} leads imported.`);
                                            }
                                        } catch (err) {
                                            toast.error('Sync Failed: ' + err.message);
                                        }
                                    }}
                                    style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: '#3b82f6', color: '#fff', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer', boxShadow: '0 4px 10px rgba(59, 130, 246, 0.2)' }}
                                >
                                    <i className="fas fa-sync-alt"></i> Sync Now
                                </button>
                            </div>
                        )}

                        {type === 'linkedin' && (
                            <div style={{ marginTop: '20px', borderTop: '1px solid #e2e8f0', paddingTop: '20px' }}>
                                <button
                                    onClick={async () => {
                                        try {
                                            const res = await marketingAPI.getLinkedInAuthUrl();
                                            if (res.success && res.url) {
                                                window.location.href = res.url;
                                            } else {
                                                toast.error('Failed to get LinkedIn Auth URL');
                                            }
                                        } catch (err) {
                                            toast.error('Connection Error: ' + err.message);
                                        }
                                    }}
                                    style={{ width: '100%', padding: '14px', borderRadius: '12px', border: 'none', background: '#0077b5', color: '#fff', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '15px' }}
                                >
                                    <i className="fab fa-linkedin"></i> {connectionData?.status === 'connected' ? 'Re-Authorize LinkedIn' : (connectionData?.health === 'EXPIRED' ? 'Reconnect LinkedIn' : 'Connect LinkedIn via OAuth')}
                                </button>
                                <p style={{ fontSize: '0.75rem', color: '#64748b', textAlign: 'center' }}>
                                    {connectionData?.status === 'connected' 
                                        ? 'Step 2: Re-Authorize to refresh your active permanent session.' 
                                        : 'Step 2: Connect to LinkedIn via OAuth after saving credentials.'}
                                </p>
                            </div>
                        )}

                        <div style={{ marginTop: 'auto', paddingTop: '30px', display: 'flex', gap: '16px' }}>
                            {['twilio', 'openai', 'gemini', 'claude'].includes(type) && (
                                <button
                                    onClick={handleTest}
                                    disabled={testing}
                                    style={{ flex: 1, padding: '14px', borderRadius: '12px', border: '2px solid #e2e8f0', background: '#fff', color: '#1e293b', fontWeight: 800, cursor: 'pointer', transition: '0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                                >
                                    {testing ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-flask"></i>}
                                    {type === 'twilio' ? 'Test SMS' : 'Test AI'}
                                </button>
                            )}
                            <button
                                onClick={handleSave}
                                disabled={isSaving}
                                style={{ flex: 2, padding: '14px', borderRadius: '12px', border: 'none', background: 'var(--primary-color)', color: '#fff', fontWeight: 800, cursor: 'pointer', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', transition: '0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                            >
                                {isSaving ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-save"></i>}
                                {type === 'linkedin' ? 'Step 1: Save Configuration' : 'Save & Validate Gateway'}
                            </button>
                        </div>
                </div>
            </div>
        </div>
    );
};

const IntegrationsSettingsPage = () => {
    const [activeModal, setActiveModal] = useState(null);
    const [connections, setConnections] = useState({
        openai: { category: 'AI Intelligence', status: 'disconnected', label: 'ChatGPT (OpenAI)', icon: 'fas fa-robot', color: '#74aa9c' },
        gemini: { category: 'AI Intelligence', status: 'disconnected', label: 'Google Gemini', icon: 'fab fa-google', color: '#4285f4' },
        claude: { category: 'AI Intelligence', status: 'disconnected', label: 'Claude (Anthropic)', icon: 'fas fa-brain', color: '#d97757' },
        twilio: { category: 'Communication Channels', status: 'disconnected', label: 'Twilio (Voice & SMS)', icon: 'fas fa-sms', color: '#F22F46' },
        knowlarity: { category: 'Voice & Telephony', status: 'disconnected', label: 'Knowlarity (Voice)', icon: 'fas fa-phone-volume', color: '#f37021' },
        gupshup: { category: 'Communication Channels', status: 'disconnected', label: 'Gupshup (Omnichannel)', icon: 'fas fa-comment-dots', color: '#00aed9' },
        whatsapp: { category: 'Communication Channels', status: 'connected', label: 'WhatsApp Meta', icon: 'fab fa-whatsapp', color: '#25D366' },
        telegram: { category: 'Communication Channels', status: 'disconnected', label: 'Telegram Bot', icon: 'fab fa-telegram', color: '#0088cc' },
        rcs: { category: 'Communication Channels', status: 'disconnected', label: 'Google RCS', icon: 'fas fa-comment-dots', color: '#4285F4' },
        facebook: { category: 'Social Marketing', status: 'disconnected', label: 'Facebook Page', icon: 'fab fa-facebook', color: '#1877F2' },
        instagram: { category: 'Social Marketing', status: 'disconnected', label: 'Instagram Business', icon: 'fab fa-instagram', color: '#E4405F' },
        messenger: { category: 'Social Marketing', status: 'disconnected', label: 'FB Messenger', icon: 'fab fa-facebook-messenger', color: '#006AFF' },
        linkedin: { category: 'Social Marketing', status: 'disconnected', label: 'LinkedIn Business', icon: 'fab fa-linkedin', color: '#0077b5' },
        google_calendar: { category: 'Connectivity & Productivity', status: 'disconnected', label: 'Google Calendar (Legacy)', icon: 'fab fa-google', color: '#4285F4' },
        apple_calendar: { category: 'Connectivity & Productivity', status: 'disconnected', label: 'iCloud Calendar', icon: 'fab fa-apple', color: '#94a3b8' },
        webhook: { category: 'Automation', status: 'disconnected', label: 'Custom Inbound Webhook', icon: 'fas fa-code', color: '#1e293b' }
    });

    const [isConnecting, setIsConnecting] = useState(false);
    const [googleStatus, setGoogleStatus] = useState({ connected: false, email: '' });



    const handleConnect = () => {
        // Refresh SMS status if the active modal was twilio (renamed conceptually to sms)
        if (activeModal === 'twilio') {
            loadSmsStatus();
        } else {
            setConnections({
                ...connections,
                [activeModal]: { ...connections[activeModal], status: 'connected' }
            });
        }
        setActiveModal(null);
    };

    // Contact Sync State
    const [syncConfig, setSyncConfig] = useState({
        autoSync: true,
        google: { enabled: false, connected: false },
        apple: { enabled: false, connected: false }
    });
    const [showAppleConfig, setShowAppleConfig] = useState(false);
    const [appleCredentials, setAppleCredentials] = useState({
        username: '',
        appPassword: ''
    });

    const loadSmsStatus = async () => {
        try {
            const res = await smsService.getProviders();
            const active = res.data.find(p => p.isActive);
            if (active) {
                setConnections(prev => ({
                    ...prev,
                    twilio: {
                        ...prev.twilio,
                        status: active.status === 'Connected' ? 'connected' : 'disconnected',
                        label: active.provider === 'Twilio' ? 'Twilio SMS' : (active.provider === 'SMSGatewayHub' ? 'SMSGateway Hub' : 'Custom Gateway')
                    }
                }));
            }
        } catch (err) {
            console.error('Failed to load SMS status', err);
        }
    };

    const fetchGoogleStatus = async () => {
        try {
            const res = await googleSettingsAPI.getStatus();
            if (res.success) {
                // Ensure res.data is extracted correctly (getStatus returns direct data via apiRequest)
                setGoogleStatus({
                    connected: res.connected ?? false,
                    email: res.email || '',
                    ...res
                });
            }
        } catch (err) {
            console.error('Failed to fetch Google status', err);
        }
    };

    const loadIntegrationStatus = async () => {
        try {
            const providers = ['openai', 'gemini', 'claude', 'knowlarity', 'gupshup'];
            const newConnections = { ...connections };
            
            for (const p of providers) {
                const configKey = `ai_${p}_config`;
                const res = await systemSettingsAPI.getByKey(configKey);
                if (res && res.data && res.data.value && (res.data.value.apiKey || res.data.value.token || res.data.value.sid)) {
                    newConnections[p] = { ...newConnections[p], status: 'connected' };
                }
            }

            // LinkedIn Specific Status (Robust Health States)
            const lnRes = await marketingAPI.getLinkedInStatus();
            if (lnRes.success) {
                newConnections.linkedin = { 
                    ...newConnections.linkedin, 
                    status: lnRes.connected ? 'connected' : 'disconnected',
                    health: lnRes.health,
                    hasConfig: lnRes.hasConfig,
                    expiresAt: lnRes.expiresAt,
                    statusError: lnRes.statusError,
                    refreshTokenExpiresAt: lnRes.refreshTokenExpiresAt
                };
            }

            // Unified Social Status (WhatsApp, Messenger, Instagram)
            try {
                const socialRes = await socialAPI.getUnifiedStatus();
                if (socialRes.success) {
                    newConnections.whatsapp = { 
                        ...newConnections.whatsapp, 
                        status: socialRes.whatsapp.connected ? 'connected' : 'disconnected',
                        health: socialRes.whatsapp.health 
                    };
                    newConnections.messenger = { 
                        ...newConnections.messenger, 
                        status: socialRes.messenger.connected ? 'connected' : 'disconnected',
                        health: socialRes.messenger.health 
                    };
                    newConnections.facebook = { 
                        ...newConnections.facebook, 
                        status: socialRes.facebook.connected ? 'connected' : 'disconnected',
                        health: 'HEALTHY'
                    };
                    newConnections.instagram = { 
                        ...newConnections.instagram, 
                        status: socialRes.instagram.connected ? 'connected' : 'disconnected',
                        health: 'HEALTHY'
                    };
                }
            } catch (socErr) {
                console.warn('Social status fetch failed', socErr);
            }

            setConnections(newConnections);
        } catch (err) {
            console.error('Failed to load integration status', err);
        }
    };
    // Load sync status and SMS status on mount
    useEffect(() => {
        loadSmsStatus();
        loadIntegrationStatus();
        fetchGoogleStatus();

        // ── Professional OAuth Feedback ─────────────────────────────────────
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('connection') === 'success') {
            toast.success('Integrations Hub: Connection Verified Successfully!');
            // Clean URL
            window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
            // Refresh counts/status
            loadIntegrationStatus();
        } else if (urlParams.get('error')) {
            toast.error(`Integration Alert: ${urlParams.get('error')}`);
            window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
        }

        const status = contactSyncManager.getSyncStatus();
        setSyncConfig({
            autoSync: status?.autoSync ?? true,
            google: {
                enabled: status?.providers?.google?.enabled ?? false,
                connected: status?.providers?.google?.connected ?? false
            },
            apple: {
                enabled: status?.providers?.apple?.enabled ?? false,
                connected: status?.providers?.apple?.connected ?? false
            }
        });
    }, []);

    // Handle Google Connect (Unified)
    const handleConnectGoogle = async () => {
        setIsConnecting(true);
        try {
            const res = await googleSettingsAPI.getAuthUrl();
            if (res.success && res.url) {
                window.location.href = res.url;
            } else {
                toast.error(res.error || 'Failed to get authorization URL');
            }
        } catch (err) {
            console.error('Unified Google connect error:', err);
            toast.error('An error occurred while connecting to Google');
        } finally {
            setIsConnecting(false);
        }
    };

    const handleDisconnectGoogle = async () => {
        if (!window.confirm('Are you sure you want to disconnect your Google account? This will stop all Google services (Contacts, Calendar, Email, Drive) from syncing.')) return;
        
        try {
            const res = await googleSettingsAPI.disconnect();
            if (res.success) {
                toast.success('Google account disconnected');
                fetchGoogleStatus();
            } else {
                toast.error(res.error || 'Failed to disconnect');
            }
        } catch (err) {
            console.error('Google disconnect error:', err);
            toast.error('An error occurred during disconnection');
        }
    };

    // Handle Apple Connect
    const handleAppleConnect = async () => {
        try {
            await contactSyncManager.initializeProvider('apple', appleCredentials);
            await contactSyncManager.signIn('apple');

            setSyncConfig(prev => ({
                ...prev,
                apple: { enabled: true, connected: true }
            }));
            setShowAppleConfig(false);
            alert('✅ Apple Contacts connected successfully!');
        } catch (error) {
            alert('❌ Error: ' + error.message);
        }
    };

    // Handle Disconnect
    const handleDisconnect = async (provider) => {
        await contactSyncManager.signOut(provider);
        setSyncConfig(prev => ({
            ...prev,
            [provider]: { enabled: false, connected: false }
        }));
        alert(`Disconnected from ${provider === 'google' ? 'Google' : 'Apple'} Contacts`);
    };

    // Handle Auto-Sync Toggle
    const handleAutoSyncToggle = () => {
        const newValue = !syncConfig.autoSync;
        contactSyncManager.setAutoSync(newValue);
        setSyncConfig(prev => ({ ...prev, autoSync: newValue }));
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
                    {['AI Intelligence', 'Communication Channels', 'Voice & Telephony', 'Social Marketing', 'Connectivity & Productivity', 'Automation'].map(cat => {
                        const catIcons = {
                            'AI Intelligence': 'fas fa-brain',
                            'Communication Channels': 'fas fa-comments',
                            'Voice & Telephony': 'fas fa-phone-alt',
                            'Social Marketing': 'fas fa-share-alt',
                            'Connectivity & Productivity': 'fas fa-sync-alt',
                            'Automation': 'fas fa-code'
                        };

                        const catItems = Object.entries(connections).filter(([_, item]) => item.category === cat);
                        if (catItems.length === 0 && cat !== 'Connectivity & Productivity') return null;

                        return (
                            <div key={cat} style={{ marginBottom: '48px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px', paddingBottom: '12px', borderBottom: '2px solid #f1f5f9' }}>
                                    <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: 'var(--primary-color)10', color: 'var(--primary-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem' }}>
                                        <i className={catIcons[cat]}></i>
                                    </div>
                                    <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#1e293b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{cat}</h3>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '24px' }}>
                                    {catItems.map(([key, item]) => (
                                        <div key={key} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '24px', transition: 'all 0.3s ease', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', position: 'relative' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                                                <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: `${item.color}10`, color: item.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem' }}>
                                                    <i className={item.icon}></i>
                                                </div>
                                                <div style={{ 
                                                    background: item.status === 'connected' ? '#ecfdf5' : (item.health === 'EXPIRED' ? '#fffbeb' : '#f8fafc'), 
                                                    color: item.status === 'connected' ? '#059669' : (item.health === 'EXPIRED' ? '#b45309' : '#64748b'), 
                                                    padding: '4px 12px', 
                                                    borderRadius: '20px', 
                                                    fontSize: '0.75rem', 
                                                    fontWeight: 700, 
                                                    border: `1px solid ${item.status === 'connected' ? '#d1fae5' : (item.health === 'EXPIRED' ? '#fde68a' : '#e2e8f0')}` 
                                                }}>
                                                    {item.status === 'connected' ? 'ACTIVE' : (item.health === 'EXPIRED' ? 'RE-AUTHORIZE' : 'DISCONNECTED')}
                                                </div>
                                            </div>
                                            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#1e293b' }}>{item.label}</h3>
                                            <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '8px', lineHeight: '1.6' }}>
                                                {key === 'openai' && 'Leverage GPT-4o for high-fidelity content generation and reasoning.'}
                                                {key === 'gemini' && 'Deep context window analysis and multimodal capabilities by Google.'}
                                                {key === 'claude' && 'Safe, steerable, and highly intelligent models for complex workflows.'}
                                                {key === 'twilio' && 'Send and receive high-volume SMS and trigger automated voice calls via Twilio.'}
                                                {key === 'knowlarity' && 'Indian cloud telephony leader for automated outbound calls and IVR flows.'}
                                                {key === 'gupshup' && 'Premier omnichannel marketing for WhatsApp Business, SMS, and RCS in India.'}
                                                {key === 'whatsapp' && 'Connect Meta Business API for verified messaging.'}
                                                {key === 'telegram' && 'Manage customer engagement via Telegram bots.'}
                                                {key === 'rcs' && 'The next generation of business messaging with rich media.'}
                                                {key === 'messenger' && 'Directly sync Facebook Page messages with Bharat CRM.'}
                                                {key === 'linkedin' && 'Direct lead synchronization and automated posting for LinkedIn company pages.'}
                                                {key === 'google_calendar' && 'Sync your activities and meetings with Google Calendar.'}
                                                {key === 'apple_calendar' && 'Connect your iCloud Calendar for seamless scheduling on iOS.'}
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

                                    {cat === 'Connectivity & Productivity' && (
                                        <>
                                            {/* Unified Google Suite Integration */}
                                            <div style={{ background: '#fff', border: '2px solid #e2e8f0', borderRadius: '16px', padding: '24px', boxShadow: '0 4px 6px rgba(0,0,0,0.02)', gridColumn: 'span 2' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                                                    <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#4285F410', color: '#4285F4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem' }}>
                                                        <i className="fab fa-google"></i>
                                                    </div>
                                                    <div style={{ padding: '10px 20px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569' }}>Auto-Sync</span>
                                                        <label className="switch">
                                                            <input type="checkbox" checked={syncConfig.autoSync} onChange={handleAutoSyncToggle} />
                                                            <span className="slider round"></span>
                                                        </label>
                                                    </div>
                                                </div>

                                                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#1e293b' }}>Google Business Suite (Unified)</h3>
                                                <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '8px', lineHeight: '1.6' }}>
                                                    Professional connection for Google Business Profile, YouTube, Contacts, and Gmail.
                                                </p>

                                                {googleStatus.connected ? (
                                                    <div style={{ marginTop: '20px' }}>
                                                        <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '10px', marginBottom: '16px', border: '1px solid #e2e8f0' }}>
                                                            <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 800, marginBottom: '4px' }}>Connected Account</div>
                                                            <div style={{ fontSize: '0.9rem', color: '#1e293b', fontWeight: 700 }}>{googleStatus.email}</div>
                                                        </div>
                                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px', marginBottom: '20px' }}>
                                                            <div style={{ background: googleStatus.services?.gmail ? '#f0fdf4' : '#f8fafc', padding: '10px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: googleStatus.services?.gmail ? '#166534' : '#64748b', border: '1px solid currentColor' }}>
                                                                <i className={googleStatus.services?.gmail ? "fas fa-check-circle" : "fas fa-circle-notch"}></i> Gmail
                                                            </div>
                                                            <div style={{ background: googleStatus.services?.youtube ? '#fefce8' : '#f8fafc', padding: '10px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: googleStatus.services?.youtube ? '#854d0e' : '#64748b', border: '1px solid currentColor' }}>
                                                                <i className={googleStatus.services?.youtube ? "fab fa-youtube" : "fas fa-circle-notch"}></i> YouTube
                                                            </div>
                                                            <div style={{ background: googleStatus.services?.business ? '#ecfdf5' : '#f8fafc', padding: '10px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: googleStatus.services?.business ? '#065f46' : '#64748b', border: '1px solid currentColor' }}>
                                                                <i className={googleStatus.services?.business ? "fas fa-store" : "fas fa-circle-notch"}></i> Business
                                                            </div>
                                                        </div>
                                                        <div style={{ display: 'flex', gap: '12px' }}>
                                                            <button onClick={handleConnectGoogle} style={{ flex: 1, padding: '12px', borderRadius: '10px', background: '#fff', border: '1px solid #e2e8f0', color: '#1e293b', fontWeight: 700, cursor: 'pointer' }}>Manage Services</button>
                                                            <button onClick={handleDisconnectGoogle} style={{ padding: '12px', borderRadius: '10px', background: '#fef2f2', border: '1px solid #fee2e2', color: '#dc2626', fontWeight: 700, cursor: 'pointer' }}>Disconnect</button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <button onClick={handleConnectGoogle} style={{ marginTop: '20px', width: '100%', padding: '14px', borderRadius: '12px', background: '#4285F4', color: '#fff', fontWeight: 800, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                                                        <i className="fab fa-google"></i> Connect Google Account
                                                    </button>
                                                )}
                                            </div>

                                            {/* Apple Contacts Integration */}
                                            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '24px', position: 'relative' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                                                    <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#00000010', color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem' }}>
                                                        <i className="fab fa-apple"></i>
                                                    </div>
                                                    <div style={{ background: syncConfig.apple.connected ? '#ecfdf5' : '#f8fafc', color: syncConfig.apple.connected ? '#059669' : '#64748b', padding: '4px 12px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 700, border: `1px solid ${syncConfig.apple.connected ? '#d1fae5' : '#e2e8f0'}` }}>
                                                        {syncConfig.apple.connected ? '✓ SYNCING' : 'NOT CONNECTED'}
                                                    </div>
                                                </div>
                                                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#1e293b' }}>iCloud Contact Sync</h3>
                                                <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '8px', lineHeight: '1.6' }}>
                                                    Direct synchronization for Apple Contacts and iOS reminders.
                                                </p>
                                                <div style={{ marginTop: '24px' }}>
                                                    {syncConfig.apple.connected ? (
                                                        <button onClick={() => handleDisconnect('apple')} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid #fee2e2', background: '#fef2f2', color: '#dc2626', fontWeight: 700, cursor: 'pointer' }}>Disconnect iCloud</button>
                                                    ) : (
                                                        <button onClick={() => setShowAppleConfig(true)} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0', background: '#fff', color: '#1e293b', fontWeight: 700, cursor: 'pointer' }}>Setup iCloud Sync</button>
                                                    )}
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {activeModal && (
                <ConnectionModal 
                    type={activeModal} 
                    connectionData={connections[activeModal]}
                    onClose={() => setActiveModal(null)} 
                    onConnect={handleConnect} 
                />
            )}
        </div>
    );
};

export default IntegrationsSettingsPage;
