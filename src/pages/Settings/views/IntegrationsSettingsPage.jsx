import { useState, useEffect } from 'react';
import { AlertCircle } from 'lucide-react';
import { googleSettingsAPI, systemSettingsAPI, marketingAPI, socialAPI, BASE_BACKEND_URL } from '../../../utils/api';
import toast from 'react-hot-toast';

import WhatsAppCoexistenceConnect from "../../../components/whatsapp/WhatsAppCoexistenceConnect";

import smsService from '../../../services/smsService';
import contactSyncManager from '../../../services/contactSyncManager';
import whatsappService from '../../../services/whatsappService';

const ConnectionModal = ({ type, connectionData, onClose, onConnect }) => {
    const [smsProvider, setSmsProvider] = useState('Twilio');
    const [waAccounts, setWaAccounts] = useState([]);
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
        appId: '',
        appSecret: '',
        redirectUri: `${window.location.origin}/api/marketing/linkedin/callback`,
        orgId: '42752175'
    });

    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState(null);
    const [isSaving, setIsSaving] = useState(false);
    const [lastKnownStatus, setLastKnownStatus] = useState('Not Connected');
    const [isConnectingMeta, setIsConnectingMeta] = useState(false);
    const [isConnectingLinkedIn, setIsConnectingLinkedIn] = useState(false);

    const handleLinkedInOneClickConnect = async () => {
        try {
            setIsConnectingLinkedIn(true);
            const res = await marketingAPI.getLinkedInAuthUrl();
            if (res?.success && res.url) {
                window.location.href = res.url;
            } else {
                toast.error(res?.error || 'Could not initiate LinkedIn login');
            }
        } catch (err) {
            const errDetail = err.response?.data?.error || err.message;
            toast.error(errDetail || 'Failed to initiate LinkedIn OAuth');
        } finally {
            setIsConnectingLinkedIn(false);
        }
    };

    const handleDisconnectLinkedIn = async () => {
        try {
            const res = await marketingAPI.disconnectLinkedIn();
            if (res?.success) {
                toast.success('LinkedIn account disconnected successfully');
                setConfig(prev => ({
                    ...prev,
                    accessToken: '',
                    refreshToken: '',
                    status: 'Disconnected',
                    health: 'DISCONNECTED'
                }));
                setLastKnownStatus('Disconnected');
                if (onConnect) onConnect();
            } else {
                toast.error(res?.error || 'Failed to disconnect LinkedIn');
            }
        } catch (err) {
            toast.error(err.response?.data?.error || err.message || 'Disconnect failed');
        }
    };

    const handleFacebookOneClickConnect = async () => {
        try {
            setIsConnectingMeta(true);
            const res = await socialAPI.getFacebookAuthUrl(window.location.origin);
            if (res?.success && res.url) {
                window.location.href = res.url;
            } else {
                toast.error(res?.error || 'Could not initiate Meta login');
            }
        } catch (err) {
            const errDetail = err.response?.data?.error || err.message;
            toast.error(errDetail || 'Failed to initiate Meta OAuth');
        } finally {
            setIsConnectingMeta(false);
        }
    };

    const handleDisconnectMeta = async () => {
        try {
            const res = await socialAPI.disconnectFacebookOAuth();
            if (res?.success) {
                toast.success('Meta account disconnected successfully');
                setConfig(prev => ({
                    ...prev,
                    pageAccessToken: '',
                    pageId: '',
                    pageName: '',
                    igUserId: '',
                    igUsername: ''
                }));
            }
        } catch (err) {
            toast.error(err.response?.data?.error || err.message || 'Disconnect failed');
        }
    };

    const loadWaAccounts = async () => {
        try {
            const res = await whatsappService.getAccounts();
            if (res?.success && Array.isArray(res.data)) {
                setWaAccounts(res.data);
            }
        } catch (e) {
            console.warn('Failed to load WA accounts', e);
        }
    };

    // Load existing config if available
    useEffect(() => {
        if (type === 'twilio') {
            loadConfig();
        } else if (type?.startsWith('portal_') || type === 'twitter' || ['openai', 'gemini', 'claude', 'knowlarity', 'gupshup', 'linkedin', 'whatsapp', 'facebook', 'instagram'].includes(type)) {
            loadAiConfig();
            if (type === 'whatsapp') {
                loadWaAccounts();
            }
        }
    }, [type]);

    const loadAiConfig = async () => {
        try {
            if (type?.startsWith('portal_')) {
                const portalId = type.replace('portal_', '');
                const res = await systemSettingsAPI.getByKey('portal_syndication_config');
                if (res?.data?.value?.[portalId]) {
                    setConfig(res.data.value[portalId]);
                    setLastKnownStatus('Connected');
                } else {
                    setLastKnownStatus('Disconnected');
                }
                return;
            }

            if (type === 'twitter') {
                const res = await systemSettingsAPI.getByKey('twitter_integration');
                if (res?.data?.value && Object.keys(res.data.value).length > 0) {
                    setConfig(prev => ({ ...prev, ...res.data.value }));
                    setLastKnownStatus(res.data.value.apiKey ? 'Connected' : 'Disconnected');
                } else {
                    setLastKnownStatus('Disconnected');
                }
                return;
            }

            let configKey;
            if (type === 'linkedin') {
                configKey = 'linkedin_integration';
            } else if (type === 'whatsapp') {
                configKey = 'meta_wa_config';
            } else if (type === 'facebook' || type === 'instagram') {
                configKey = 'social_graph_config';
            } else {
                configKey = `ai_${type}_config`;
            }

            const res = await systemSettingsAPI.getByKey(configKey);
            if (res && res.data && res.data.value) {
                const loadedConfig = res.data.value;
                setConfig(prev => ({ 
                    ...loadedConfig, 
                    token: loadedConfig.token || loadedConfig.apiKey || '',
                    redirectUri: type === 'linkedin' ? `https://api.bharatproperties.co/api/marketing/linkedin/callback` : loadedConfig.redirectUri
                }));
                if (type === 'linkedin') {
                    setLastKnownStatus(connectionData?.connected ? 'Connected' : (connectionData?.health === 'EXPIRED' ? 'Expired' : 'Disconnected'));
                } else {
                    setLastKnownStatus('Connected');
                }
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
            if (type?.startsWith('portal_')) {
                const portalId = type.replace('portal_', '');
                await marketingAPI.savePortalConfig(portalId, config);
                setLastKnownStatus('Connected');
                toast.success(`${connectionData?.label || portalId} credentials saved successfully!`);
                if (onConnect) onConnect();
                return;
            }

            if (type === 'twitter') {
                await socialAPI.saveConfig('twitter', config);
                setLastKnownStatus('Connected');
                toast.success('Twitter / X credentials saved successfully!');
                if (onConnect) onConnect();
                return;
            }

            const configKey = type === 'linkedin' ? 'linkedin_integration' : `ai_${type}_config`;
            if (['openai', 'gemini', 'claude', 'knowlarity', 'gupshup', 'linkedin', 'facebook', 'instagram', 'whatsapp'].includes(type)) {
                if (type === 'linkedin') {
                    // ── Senior Professional Fix ──────────────────────────────────────────
                    // Strip out empty SMS fields to prevent leaking garbage into LinkedIn config
                    const { sid, token, from, apiKey, senderId, baseUrl, url, method, headers, bodyTemplate, entityId, route, ...linkedInOnlyConfig } = config;
                    
                    await marketingAPI.saveLinkedInConfig(linkedInOnlyConfig);
                    toast.success('LinkedIn credentials saved. Now click Step 2 to authorize.');
                } else if (['facebook', 'instagram', 'whatsapp', 'messenger'].includes(type)) {
                    if (type === 'whatsapp') {
                        // ── Senior Professional: Auto-trim to prevent whitespace errors ──
                        const whatsappPayload = {
                            token:      (config.token || config.apiKey || '').toString().trim(),
                            phoneId:    (config.phoneId || '').toString().trim(),
                            businessId: (config.businessId || config.wabaId || '').toString().trim(),
                            verifyToken: (config.verifyToken || '').toString().trim()
                        };
                        await socialAPI.saveWhatsAppConfig(whatsappPayload);
                    } else {
                        // For Meta Graph, ensure we send a clean payload
                        const socialPayload = {
                            pageId: config.pageId,
                            pageName: config.pageName,
                            pageAccessToken: config.pageAccessToken,
                            igUserId: config.igUserId,
                            igUsername: config.igUsername,
                            availablePages: config.availablePages,
                            verifyToken: config.verifyToken,
                            appId: config.appId,
                            appSecret: config.appSecret
                        };
                        await socialAPI.saveConfig(type, socialPayload);
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
                    if (onConnect) onConnect();
                } else {
                    setLastKnownStatus('Error');
                    setTestResult({ success: false, message: 'Saved successfully, but connection test failed: ' + testRes.error });
                }
            }
        } catch (err) {
            setLastKnownStatus('Error');
            toast.error('Failed to save configuration: ' + err.message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleTest = async () => {
        setTesting(true);
        setTestResult(null);
        try {
            let res;
            if (['openai', 'gemini', 'claude'].includes(type)) {
                res = await systemSettingsAPI.testAi(type, config);
            } else if (type?.startsWith('portal_')) {
                const portalId = type.replace('portal_', '');
                res = await marketingAPI.testPortalConnection(portalId, config);
            } else if (type === 'twitter') {
                res = await socialAPI.testConnection({ platform: 'twitter', config });
            } else if (['facebook', 'instagram', 'whatsapp'].includes(type)) {
                if (type === 'whatsapp') {
                    // Senior Professional: Real-world connectivity test (sync check)
                    const waRes = await marketingAPI.getWhatsAppTemplates();
                    if (waRes.success && waRes.templates) {
                        res = { 
                            success: true, 
                            message: `✓ Connection Established! ${waRes.templates.length} approved templates synchronized from Meta.` 
                        };
                    } else {
                        res = { 
                            success: false, 
                            error: waRes.message || 'Meta Handshake Failed: Please verify WABA ID mapping and Token scope.' 
                        };
                    }
                } else {
                    res = await socialAPI.testConnection();
                }
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
                        color: 'var(--text-main)',
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
                    showWebhook: true,
                    webhookConfig: {
                        field: 'messages, message_deliveries, message_reads',
                        path: '/api/webhooks/whatsapp-live-bot'
                    }
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
                        'Go to Meta Developer Console.',
                        'Create/Select App and enable "Messenger" & "Webhooks".',
                        'Generate a **Page Access Token** (Long-lived recommended).',
                        'Step 2: Generate a **Page Access Token** via Graph API Explorer.',
                        '**IMPORTANT**: Ensure "publish_actions" is NOT selected. Use "pages_manage_posts" instead.',
                        'Step 3: Setup "Verify Token" and configure Webhook URL in Meta Console.',
                        'Step 4: Subscribe to "leadgen" and "messages" fields.'
                    ],
                    showWebhook: true,
                    webhookConfig: {
                        field: 'leadgen, messages',
                        path: '/api/social/webhook'
                    }
                };
            case 'instagram':
                return {
                    title: 'Instagram Business Setup',
                    icon: 'fab fa-instagram',
                    color: '#E4405F',
                    steps: [
                        'Convert your Instagram to a Business Account.',
                        'Link it to your verified Facebook Page.',
                        'Enable **"instagram_basic"** and **"instagram_content_publish"**.',
                        'Required for Stories/Reels: **"pages_read_engagement"** (Page Token).',
                        'Configure Webhook URL and Verify Token in Meta Console.'
                    ],
                    showWebhook: true,
                    webhookConfig: {
                        field: 'comments, messages',
                        path: '/api/social/webhook'
                    }
                };
            case 'messenger': return { title: 'Facebook Messenger', icon: 'fab fa-facebook-messenger', color: '#006AFF', steps: ['Go to Meta for Developers Console.', 'Create or select your Facebook App.', 'Add the Messenger product to your app.', 'Link your Facebook Page and generate an Access Token.'], showWebhook: true };
            case 'google_calendar': return { title: 'Google Calendar API', icon: 'fab fa-google', color: '#4285F4', steps: ['Go to Google Cloud Console and create a project.', 'Enable the "Google Calendar API" for your project.', 'Configure OAuth Credentials.', 'Copy Client ID and Secret.'] };
            case 'apple_calendar': return { title: 'iCloud Calendar (CalDAV)', icon: 'fab fa-apple', color: 'var(--text-main)', steps: ['Log in to appleid.apple.com', 'Create App-Specific Password.', 'Copy the 16-character code.'], showWebhook: false };
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
                        `Configure Redirect URI: ${window.location.origin}/api/marketing/linkedin/callback`,
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
            case 'webhook': return { title: 'Inbound Webhook', icon: 'fas fa-code', color: 'var(--text-main)', steps: ['Define external API endpoint.', 'Generate API Secret Key.', 'Map incoming data fields.'], showWebhook: true };
            case 'twitter':
                return {
                    title: 'Twitter / X API Integration',
                    icon: 'fab fa-x-twitter',
                    color: '#0f172a',
                    steps: [
                        'Go to developer.x.com and log in with your Twitter/X account.',
                        'Navigate to Developer Portal > Projects & Apps.',
                        'Set User authentication settings to Read and Write.',
                        'Copy your Consumer API Key & API Secret.',
                        'Generate User Access Token & Access Token Secret.',
                        'Enter credentials below to enable live tweets from Promote Studio.'
                    ],
                    showWebhook: false
                };
            default:
                if (type?.startsWith('portal_')) {
                    const portalName = connectionData?.label || type.replace('portal_', '');
                    return {
                        title: `${portalName} Partner Syndication`,
                        icon: connectionData?.icon || 'fas fa-building',
                        color: connectionData?.color || '#005CA8',
                        steps: [
                            `Log in to your ${portalName} developer or channel partner console.`,
                            'Locate your Merchant / Partner / Channel Partner ID.',
                            'Generate or copy your Secret API Key or Auth Token.',
                            'Enter your credentials below and click Save Configuration.',
                            'Your listings in Promote Studio will automatically syndicate to this portal.'
                        ],
                        showWebhook: false
                    };
                }
                return {};
        }
    };

    const guide = getGuideContent();
    const webhookUrl = `https://api.bharatcrm.com/webhooks/v1/sms/active-provider`;

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10002 }}>
            <div style={{ background: 'var(--bg-card)', width: '95vw', maxWidth: '1350px', borderRadius: '24px', display: 'flex', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.3)', border: '1px solid var(--border-color)' }}>
                {/* Left: Setup Guide */}
                <div style={{ flex: 1, background: 'var(--bg-light)', padding: '40px', borderRight: '1px solid #f1f5f9' }}>
                    <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: `${guide.color}15`, color: guide.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', marginBottom: '24px' }}>
                        <i className={guide.icon}></i>
                    </div>
                    <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)' }}>{guide.title}</h3>
                    <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginTop: '8px', lineHeight: '1.5' }}>Follow steps to connect your account.</p>

                    <div style={{ marginTop: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {(guide.steps || []).map((step, idx) => (
                            <div key={idx} style={{ display: 'flex', gap: '12px' }}>
                                <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: 'var(--bg-card)', color: guide.color, border: `2px solid ${guide.color}40`, fontSize: '0.75rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '2px' }}>{idx + 1}</div>
                                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>{step}</div>
                            </div>
                        ))}
                    </div>

                    {guide.showWebhook && (
                        <div style={{ marginTop: '32px', padding: '16px', background: 'var(--bg-card)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                <label style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Webhook Callback URL</label>
                                {guide.webhookConfig?.field && (
                                    <span style={{ fontSize: '0.65rem', color: 'var(--primary-color)', fontWeight: 700, background: 'var(--primary-light)', padding: '2px 6px', borderRadius: '4px' }}>
                                        {guide.webhookConfig.field}
                                    </span>
                                )}
                            </div>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                <div style={{ flex: 1, fontSize: '0.75rem', color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', background: 'var(--bg-light)', padding: '10px', borderRadius: '8px', fontFamily: 'monospace' }}>
                                    {window.location.origin.includes('localhost') ? (config.url || 'https://cd1040f1c478748e-223-178-209-51.serveousercontent.com') : BASE_BACKEND_URL}{guide.webhookConfig?.path || '/api/social/webhook'}
                                </div>
                                <button 
                                    onClick={() => { 
                                        const url = `${window.location.origin.includes('localhost') ? 'https://cd1040f1c478748e-223-178-209-51.serveousercontent.com' : BASE_BACKEND_URL}${guide.webhookConfig?.path || '/api/social/webhook'}`;
                                        navigator.clipboard.writeText(url); 
                                        toast.success('Webhook URL Copied!'); 
                                    }} 
                                    style={{ background: 'none', border: 'none', color: 'var(--primary-color)', cursor: 'pointer', fontSize: '1.1rem' }} 
                                    title="Copy Webhook URL"
                                >
                                    <i className="far fa-copy"></i>
                                </button>
                            </div>
                            <p style={{ marginTop: '12px', fontSize: '0.65rem', color: 'var(--text-muted)', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <i className="fas fa-shield-alt"></i> 
                                <span>Verify Token: <strong>{config.verifyToken || 'bharat-properties-webhook-2026'}</strong></span>
                                <button 
                                    onClick={() => { 
                                        navigator.clipboard.writeText(config.verifyToken || 'bharat-properties-webhook-2026'); 
                                        toast.success('Verify Token Copied!'); 
                                    }}
                                    style={{ background: 'none', border: 'none', color: '#0ea5e9', cursor: 'pointer', padding: '2px' }}
                                    title="Copy Token"
                                >
                                    <i className="far fa-copy" style={{ fontSize: '0.8rem' }}></i>
                                </button>
                            </p>
                        </div>
                    )}

                    <div style={{ marginTop: 'auto', paddingTop: '30px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '16px', background: 'var(--bg-card)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: lastKnownStatus === 'Connected' ? '#10b981' : (lastKnownStatus === 'Expired' || lastKnownStatus === 'Error' ? '#ef4444' : 'var(--text-muted)') }}></div>
                                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                                    Gateway Status: {lastKnownStatus}
                                </span>
                            </div>
                            {testResult && (
                                <div style={{ fontSize: '0.75rem', color: testResult.success ? '#10b981' : '#ef4444', background: testResult.success ? 'var(--stat-property-bg)' : 'var(--danger-bg)', padding: '8px', borderRadius: '6px', border: `1px solid ${testResult.success ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)'}` }}>
                                    <i className={`fas ${testResult.success ? 'fa-check-circle' : 'fa-exclamation-circle'}`} style={{ marginRight: '6px' }}></i>
                                    {testResult.message}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Right: Configuration Form / Templates / Logs */}
                <div style={{ flex: 3, padding: '40px 24px', display: 'flex', flexDirection: 'column', minHeight: '650px', background: 'var(--bg-card)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                        <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-main)' }}>
                            {type === 'twilio' ? 'SMS Communication Hub' : 'Integration Setup'}
                        </h2>
                        <i className="fas fa-times" style={{ cursor: 'pointer', color: 'var(--text-muted)', fontSize: '1.2rem' }} onClick={onClose}></i>
                    </div>


                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto', paddingRight: '4px' }}>
                        {type === 'twilio' && (
                            <div style={{ marginBottom: '24px' }}>
                                <label style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '10px' }}>Select SMS Provider</label>
                                <div style={{ display: 'flex', gap: '10px' }}>
                                    {['Twilio', 'SMSGatewayHub', 'Custom HTTP'].map(p => (
                                        <button
                                            key={p}
                                            onClick={() => setSmsProvider(p)}
                                            style={{
                                                flex: 1,
                                                padding: '10px',
                                                borderRadius: '10px',
                                                border: `2px solid ${smsProvider === p ? 'var(--primary-color)' : 'var(--border-color)'}`,
                                                background: smsProvider === p ? `${guide.color}05` : 'var(--bg-card)',
                                                color: smsProvider === p ? 'var(--primary-color)' : 'var(--text-muted)',
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
                                        <select value={config.channel} onChange={e => setConfig({ ...config, channel: e.target.value })} style={{ width: '100%', padding: '12px', border: '1px solid var(--border-color)', borderRadius: '10px' }}>
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
                                    <select value={config.method} onChange={e => setConfig({ ...config, method: e.target.value })} style={{ width: '100%', padding: '12px', border: '1px solid var(--border-color)', borderRadius: '10px' }}>
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
                                    <select value={config.model || 'gpt-4o'} onChange={e => setConfig({ ...config, model: e.target.value })} style={{ width: '100%', padding: '12px', border: '1px solid var(--border-color)', borderRadius: '10px' }}>
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
                                    <select value={config.model || 'gemini-1.5-pro'} onChange={e => setConfig({ ...config, model: e.target.value })} style={{ width: '100%', padding: '12px', border: '1px solid var(--border-color)', borderRadius: '10px' }}>
                                        <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
                                        <option value="gemini-1.5-pro-latest">Gemini 1.5 Pro (Latest)</option>
                                        <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
                                        <option value="gemini-1.5-flash-latest">Gemini 1.5 Flash (Latest)</option>
                                        <option value="gemini-pro">Gemini 1.0 Pro</option>
                                    </select>
                                </div>
                            </>
                        )}

                        {(type === 'facebook' || type === 'instagram') && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                {/* 🌟 1-Click Meta Connect Hero Card */}
                                <div style={{
                                    background: 'linear-gradient(135deg, rgba(24, 119, 242, 0.08) 0%, rgba(228, 64, 95, 0.08) 100%)',
                                    border: '1.5px solid rgba(24, 119, 242, 0.25)',
                                    borderRadius: '16px', padding: '20px',
                                    display: 'flex', flexDirection: 'column', gap: '16px'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            <div style={{
                                                width: '46px', height: '46px', borderRadius: '12px',
                                                background: 'linear-gradient(135deg, #1877F2 0%, #E4405F 100%)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                color: '#fff', fontSize: '22px', boxShadow: '0 4px 14px rgba(24, 119, 242, 0.3)'
                                            }}>
                                                <i className="fab fa-facebook-f"></i>
                                            </div>
                                            <div>
                                                <h4 style={{ margin: 0, fontSize: '0.96rem', fontWeight: 800, color: 'var(--text-main)' }}>
                                                    Enterprise 1-Click Meta Connect
                                                </h4>
                                                <p style={{ margin: '3px 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                                    Instantly links Facebook Page and Instagram Business Account with zero manual tokens.
                                                </p>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={handleFacebookOneClickConnect}
                                            disabled={isConnectingMeta}
                                            style={{
                                                background: 'linear-gradient(135deg, #1877F2 0%, #165ec9 100%)',
                                                color: '#fff', border: 'none', padding: '10px 18px',
                                                borderRadius: '10px', fontWeight: 800, fontSize: '0.84rem',
                                                cursor: isConnectingMeta ? 'not-allowed' : 'pointer',
                                                display: 'flex', alignItems: 'center', gap: '8px',
                                                boxShadow: '0 4px 12px rgba(24, 119, 242, 0.3)'
                                            }}
                                        >
                                            <i className="fab fa-facebook"></i>
                                            {isConnectingMeta ? 'Opening Meta...' : (config.pageAccessToken ? '🔄 Reconnect Meta' : 'Connect with Facebook & Instagram')}
                                        </button>
                                    </div>

                                    {/* Connection status display */}
                                    {config.pageAccessToken ? (
                                        <>
                                            <div style={{
                                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                padding: '12px 16px', background: 'var(--bg-card)', borderRadius: '10px',
                                                border: '1px solid #bbf7d0', flexWrap: 'wrap', gap: '10px'
                                            }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                    <i className="fas fa-check-circle" style={{ color: '#22c55e', fontSize: '18px' }}></i>
                                                    <div style={{ fontSize: '0.8rem', color: '#166534' }}>
                                                        <div><strong>Facebook Page:</strong> {config.pageName || config.pageId || 'Connected'}</div>
                                                        <div><strong>Instagram:</strong> {config.igUsername ? `@${config.igUsername}` : (config.igUserId ? `ID: ${config.igUserId}` : 'Linked via Page')}</div>
                                                    </div>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={handleDisconnectMeta}
                                                    style={{
                                                        background: 'transparent', color: '#dc2626', border: '1px solid #fecaca',
                                                        padding: '5px 12px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 700,
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    Disconnect
                                                </button>
                                            </div>

                                            {config.availablePages && config.availablePages.length > 0 && (
                                                <div style={{
                                                    padding: '10px 14px', background: 'rgba(24, 119, 242, 0.05)',
                                                    border: '1px solid rgba(24, 119, 242, 0.2)', borderRadius: '10px',
                                                    display: 'flex', flexDirection: 'column', gap: '6px'
                                                }}>
                                                    <label style={{ fontSize: '0.74rem', fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <i className="fas fa-layer-group" style={{ color: '#1877F2' }}></i>
                                                        Select Publishing Page:
                                                    </label>
                                                    <select
                                                        value={config.pageId || ''}
                                                        onChange={(e) => {
                                                            const selected = config.availablePages.find(p => p.id === e.target.value);
                                                            if (selected) {
                                                                setConfig(prev => ({
                                                                    ...prev,
                                                                    pageId: selected.id,
                                                                    pageName: selected.name,
                                                                    igUsername: selected.igUsername || prev.igUsername
                                                                }));
                                                                toast.success(`Switched active page to "${selected.name}". Click Save below to persist.`);
                                                            }
                                                        }}
                                                        style={{
                                                            padding: '8px 12px',
                                                            borderRadius: '8px',
                                                            border: '1px solid var(--border-color)',
                                                            background: 'var(--bg-input, var(--bg-card))',
                                                            color: 'var(--text-main)',
                                                            fontSize: '0.82rem',
                                                            fontWeight: 600,
                                                            outline: 'none'
                                                        }}
                                                    >
                                                        {config.availablePages.map(page => (
                                                            <option key={page.id} value={page.id}>
                                                                {page.name} (ID: {page.id}) {page.hasInstagram ? `• Instagram: @${page.igUsername}` : ''}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>
                                            )}
                                        </>
                                    ) : (
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                                            💡 <strong>How it works:</strong> Click the button above to log into Facebook. Select your Page and Instagram account, and Bharat CRM will automatically configure all permanent publishing tokens.
                                        </div>
                                    )}
                                </div>

                                <div style={{ margin: '15px 0 5px', borderTop: '1px dashed var(--border-color)', position: 'relative' }}>
                                    <span style={{ position: 'absolute', top: '-10px', left: '50%', transform: 'translateX(-50%)', background: 'var(--bg-card)', padding: '0 12px', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 800 }}>
                                        OR CONFIGURE META APP ID & ADVANCED TOKENS
                                    </span>
                                </div>

                                {/* Meta App ID & Secret */}
                                <div className="card-input-group">
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <i className="fas fa-fingerprint" style={{ color: '#1877F2' }}></i>
                                        Meta App ID (from developers.facebook.com)
                                    </label>
                                    <input 
                                        type="text" 
                                        placeholder="e.g. 123456789012345" 
                                        value={config.appId || ''} 
                                        onChange={e => setConfig({ ...config, appId: e.target.value })} 
                                    />
                                </div>
                                <div className="card-input-group">
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <i className="fas fa-key" style={{ color: '#1877F2' }}></i>
                                        Meta App Secret
                                    </label>
                                    <div style={{ position: 'relative' }}>
                                        <input 
                                            type={config.showAppSecret ? "text" : "password"} 
                                            placeholder="••••••••••••" 
                                            value={config.appSecret || ''} 
                                            onChange={e => setConfig({ ...config, appSecret: e.target.value })} 
                                        />
                                        <button 
                                            onClick={() => setConfig({ ...config, showAppSecret: !config.showAppSecret })}
                                            style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                                        >
                                            <i className={`far ${config.showAppSecret ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                                        </button>
                                    </div>
                                </div>

                                {/* Page ID & Token (Optional override) */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                    <div className="card-input-group">
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <i className="fas fa-id-badge" style={{ color: '#1877F2' }}></i>
                                            Facebook Page ID
                                        </label>
                                        <input type="text" placeholder="Auto-detected or custom" value={config.pageId || ''} onChange={e => setConfig({ ...config, pageId: e.target.value })} />
                                    </div>
                                    <div className="card-input-group">
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <i className="fab fa-instagram" style={{ color: '#E4405F' }}></i>
                                            Instagram Business ID
                                        </label>
                                        <input type="text" placeholder="Auto-detected or custom" value={config.igUserId || ''} onChange={e => setConfig({ ...config, igUserId: e.target.value })} />
                                    </div>
                                </div>

                                <div className="card-input-group">
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <i className="fas fa-user-shield" style={{ color: '#1877F2' }}></i>
                                        Page Access Token (Permanent)
                                    </label>
                                    <textarea 
                                        placeholder="Auto-saved via 1-Click Connect above, or paste manually..." 
                                        value={config.pageAccessToken || ''} 
                                        onChange={e => setConfig({ ...config, pageAccessToken: e.target.value })} 
                                        style={{ height: '70px', fontSize: '0.78rem', paddingTop: '10px' }}
                                    />
                                </div>
                            </div>
                        )}

                        {type === 'claude' && (
                            <>
                                <div className="card-input-group">
                                    <label>Anthropic Claude API Key</label>
                                    <input type="password" placeholder="xkeys-..." value={config.apiKey} onChange={e => setConfig({ ...config, apiKey: e.target.value })} />
                                </div>
                                <div className="card-input-group">
                                    <label>Preferred Model</label>
                                    <select value={config.model || 'claude-3-5-sonnet-20240620'} onChange={e => setConfig({ ...config, model: e.target.value })} style={{ width: '100%', padding: '12px', border: '1px solid var(--border-color)', borderRadius: '10px' }}>
                                        <option value="claude-3-5-sonnet-20240620">Claude 3.5 Sonnet (Intelligent & Fast)</option>
                                        <option value="claude-3-opus-20240229">Claude 3 Opus (Most Powerful)</option>
                                        <option value="claude-haiku-4-5-20251001">Claude 3 Haiku (Extremely Fast)</option>
                                    </select>
                                </div>
                            </>
                        )}

                        {!['openai', 'gemini', 'claude'].includes(type) && (
                            <div style={{ padding: '16px', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '12px', border: '1px solid #bfdbfe', display: 'flex', gap: '12px', alignItems: 'center' }}>
                                <i className="fas fa-info-circle" style={{ color: '#3b82f6' }}></i>
                                <div style={{ fontSize: '0.8rem', color: '#1e40af', lineHeight: '1.4' }}>
                                    <strong>Note:</strong> SMS Templates and Delivery Logs have been moved to <strong>Settings &gt; Messaging</strong> for a more centralized experience.
                                </div>
                            </div>
                        )}

                        {type === 'messenger' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                <div className="card-input-group">
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <i className="fab fa-facebook-messenger" style={{ color: '#006AFF' }}></i>
                                        Messenger App ID
                                    </label>
                                    <input type="text" placeholder="1234..." value={config.appId || ''} onChange={e => setConfig({ ...config, appId: e.target.value })} />
                                </div>
                                <div className="card-input-group">
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <i className="fas fa-key" style={{ color: '#006AFF' }}></i>
                                        Messenger App Secret
                                    </label>
                                    <div style={{ position: 'relative' }}>
                                        <input 
                                            type={config.showMsgSecret ? "text" : "password"} 
                                            placeholder="••••••••••••" 
                                            value={config.appSecret || ''} 
                                            onChange={e => setConfig({ ...config, appSecret: e.target.value })} 
                                        />
                                        <button 
                                            onClick={() => setConfig({ ...config, showMsgSecret: !config.showMsgSecret })}
                                            style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                                        >
                                            <i className={`far ${config.showMsgSecret ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                                        </button>
                                    </div>
                                </div>
                                <div className="card-input-group">
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <i className="fas fa-id-badge" style={{ color: '#006AFF' }}></i>
                                        Linked Facebook Page ID
                                    </label>
                                    <input type="text" placeholder="102345..." value={config.pageId || ''} onChange={e => setConfig({ ...config, pageId: e.target.value })} />
                                </div>
                                <div className="card-input-group">
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <i className="fas fa-user-shield" style={{ color: '#006AFF' }}></i>
                                        Page Access Token (Long-lived)
                                    </label>
                                    <textarea 
                                        placeholder="EAA..." 
                                        value={config.pageAccessToken || ''} 
                                        onChange={e => setConfig({ ...config, pageAccessToken: e.target.value })} 
                                        style={{ height: '80px', fontSize: '0.8rem', paddingTop: '12px' }}
                                    />
                                </div>
                                <div className="card-input-group">
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <i className="fas fa-shield-alt" style={{ color: '#006AFF' }}></i>
                                        Webhook Verify Token
                                    </label>
                                    <input type="text" placeholder="Your secret token" value={config.verifyToken || ''} onChange={e => setConfig({ ...config, verifyToken: e.target.value })} style={{ fontWeight: 600, color: 'var(--text-main)' }} />
                                </div>
                            </div>
                        )}
                        {type === 'whatsapp' && (
                            <>
                                {waAccounts.length > 0 && (
                                    <div style={{ marginBottom: '20px', padding: '16px', background: 'var(--bg-subtle, #f8fafc)', borderRadius: '12px', border: '1px solid var(--border-color, #e2e8f0)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                                            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-main, #1e293b)' }}>
                                                <i className="fab fa-whatsapp" style={{ color: '#25D366', marginRight: '6px' }}></i>
                                                Connected WhatsApp Numbers ({waAccounts.length})
                                            </span>
                                            <span style={{ fontSize: '0.72rem', background: '#ecfdf5', color: '#059669', padding: '2px 8px', borderRadius: '12px', fontWeight: 600 }}>
                                                ● Active Multi-Account
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            {waAccounts.map((acc, idx) => (
                                                <div key={acc.id || idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--surface-color, #ffffff)', borderRadius: '8px', border: '1px solid var(--border-color, #e2e8f0)' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                        <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: acc.connectionType === 'COEXISTENCE' ? '#e0f2fe' : '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: acc.connectionType === 'COEXISTENCE' ? '#0284c7' : '#16a34a', fontSize: '0.9rem' }}>
                                                            <i className={`fas ${acc.connectionType === 'COEXISTENCE' ? 'fa-mobile-alt' : 'fa-cloud'}`}></i>
                                                        </div>
                                                        <div>
                                                            <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-main, #0f172a)' }}>
                                                                {acc.displayPhoneNumber} {acc.isDefault && <span style={{ fontSize: '0.68rem', background: '#e0e7ff', color: '#4338ca', padding: '1px 6px', borderRadius: '6px', marginLeft: '6px' }}>DEFAULT</span>}
                                                            </div>
                                                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted, #64748b)' }}>
                                                                {acc.accountLabel || (acc.connectionType === 'COEXISTENCE' ? 'WhatsApp Business App (Coexistence)' : 'Official Cloud API')} &bull; ID: {acc.phoneNumberId}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#16a34a', background: '#dcfce7', padding: '2px 8px', borderRadius: '12px' }}>
                                                        ✓ ACTIVE
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <WhatsAppCoexistenceConnect onComplete={(data) => { loadWaAccounts(); }} />

                                <div style={{ margin: "30px 0", borderTop: "1px dashed var(--border-color)", position: "relative" }}>
                                    <span style={{ position: "absolute", top: "-10px", left: "50%", transform: "translateX(-50%)", background: "white", padding: "0 10px", fontSize: "0.8rem", color: "var(--text-muted)", fontWeight: "bold" }}>OR MANUAL SETUP (ADVANCED)</span>
                                </div>
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
                                    <small style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                                        <i className="fas fa-info-circle"></i> Ensure this is the 15-digit <strong>WhatsApp Business Account ID</strong> found in WhatsApp Manager &gt; Settings.
                                    </small>
                                </div>
                                <div className="card-input-group">
                                    <label>Webhook Verify Token (Optional)</label>
                                    <input type="text" placeholder="my_secret_token" value={config.verifyToken} onChange={e => setConfig({ ...config, verifyToken: e.target.value })} />
                                </div>
                            </>
                        )}
                        {type === 'linkedin' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                {/* 🌟 1-Click LinkedIn Connect Hero Card */}
                                <div style={{
                                    background: 'linear-gradient(135deg, rgba(0, 119, 181, 0.08) 0%, rgba(10, 102, 194, 0.08) 100%)',
                                    border: '1.5px solid rgba(0, 119, 181, 0.25)',
                                    borderRadius: '16px', padding: '20px',
                                    display: 'flex', flexDirection: 'column', gap: '16px'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            <div style={{
                                                width: '46px', height: '46px', borderRadius: '12px',
                                                background: 'linear-gradient(135deg, #0077b5 0%, #0a66c2 100%)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                color: '#fff', fontSize: '22px', boxShadow: '0 4px 14px rgba(0, 119, 181, 0.3)'
                                            }}>
                                                <i className="fab fa-linkedin-in"></i>
                                            </div>
                                            <div>
                                                <h4 style={{ margin: 0, fontSize: '0.96rem', fontWeight: 800, color: 'var(--text-main)' }}>
                                                    Enterprise 1-Click LinkedIn Connect
                                                </h4>
                                                <p style={{ margin: '3px 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                                    Instantly links LinkedIn Account to broadcast property flyers and sync investor leads with zero manual tokens.
                                                </p>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={handleLinkedInOneClickConnect}
                                            disabled={isConnectingLinkedIn}
                                            style={{
                                                background: 'linear-gradient(135deg, #0077b5 0%, #005582 100%)',
                                                color: '#fff', border: 'none', padding: '10px 18px',
                                                borderRadius: '10px', fontWeight: 800, fontSize: '0.84rem',
                                                cursor: isConnectingLinkedIn ? 'not-allowed' : 'pointer',
                                                display: 'flex', alignItems: 'center', gap: '8px',
                                                boxShadow: '0 4px 12px rgba(0, 119, 181, 0.3)'
                                            }}
                                        >
                                            <i className="fab fa-linkedin"></i>
                                            {isConnectingLinkedIn ? 'Opening LinkedIn...' : ((config.accessToken || connectionData?.status === 'connected') ? '🔄 Reconnect LinkedIn' : 'Connect with LinkedIn (1-Click OAuth)')}
                                        </button>
                                    </div>

                                    {/* Connection status display */}
                                    {(config.accessToken || connectionData?.status === 'connected') ? (
                                        <div style={{
                                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                            padding: '12px 16px', background: 'var(--bg-card)', borderRadius: '10px',
                                            border: '1px solid #bbf7d0', flexWrap: 'wrap', gap: '10px'
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                <i className="fas fa-check-circle" style={{ color: '#22c55e', fontSize: '18px' }}></i>
                                                <div style={{ fontSize: '0.8rem', color: '#166534' }}>
                                                    <div><strong>LinkedIn Integration:</strong> Connected & Active</div>
                                                    <div><strong>Token Status:</strong> Auto-Refreshing OAuth 2.0 (Valid until Sept 2027)</div>
                                                    {config.orgId && <div><strong>Target Organization ID:</strong> {config.orgId}</div>}
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={handleDisconnectLinkedIn}
                                                style={{
                                                    background: 'transparent', color: '#dc2626', border: '1px solid #fecaca',
                                                    padding: '5px 12px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 700,
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                Disconnect
                                            </button>
                                        </div>
                                    ) : (
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                                            💡 <strong>How it works:</strong> Click the button above to log into LinkedIn. Grant social publishing and lead sync permissions, and Bharat CRM will automatically store and auto-refresh your tokens.
                                        </div>
                                    )}
                                </div>

                                <div style={{ margin: '15px 0 5px', borderTop: '1px dashed var(--border-color)', position: 'relative' }}>
                                    <span style={{ position: 'absolute', top: '-10px', left: '50%', transform: 'translateX(-50%)', background: 'var(--bg-card)', padding: '0 12px', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 800 }}>
                                        OR CONFIGURE LINKEDIN APP CREDENTIALS & ADVANCED SCOPES
                                    </span>
                                </div>

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
                                        <input type="text" readOnly value={config.redirectUri || (window.location.hostname.includes('localhost') ? 'http://localhost:4000/api/marketing/linkedin/callback' : 'https://api.bharatproperties.co/api/marketing/linkedin/callback')} style={{ background: 'var(--bg-light)', color: 'var(--text-muted)', cursor: 'not-allowed' }} />
                                        <button onClick={() => { navigator.clipboard.writeText(config.redirectUri || (window.location.hostname.includes('localhost') ? 'http://localhost:4000/api/marketing/linkedin/callback' : 'https://api.bharatproperties.co/api/marketing/linkedin/callback')); toast.success('Copied!'); }} style={{ padding: '0 12px', background: 'var(--bg-light)', border: '1px solid var(--border-color)', borderRadius: '8px', cursor: 'pointer' }}><i className="far fa-copy"></i></button>
                                    </div>
                                </div>
                                <div className="card-input-group">
                                    <label>Organization ID</label>
                                    <input type="text" placeholder="e.g. 42752175" value={config.orgId || '42752175'} onChange={e => setConfig({ ...config, orgId: e.target.value })} />
                                </div>
                                <div style={{ background: 'var(--bg-light)', padding: '12px 14px', borderRadius: '12px', border: '1px solid var(--border-color)', marginTop: '10px' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)' }}>
                                        <input
                                            type="checkbox"
                                            checked={!!config.enableOrgScopes}
                                            onChange={e => setConfig({ ...config, enableOrgScopes: e.target.checked })}
                                            style={{ width: '16px', height: '16px', accentColor: '#0077b5' }}
                                        />
                                        Enable Organization / Company Page Scopes
                                    </label>
                                    <p style={{ margin: '4px 0 0 26px', fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                                        Leave unchecked for standard LinkedIn apps (uses <code>openid profile email w_member_social</code>). Check only if your app has <i>Community Management API</i> approved by LinkedIn.
                                    </p>
                                </div>
                            </div>
                        )}
                        {type === 'twitter' && (
                            <>
                                <div className="card-input-group">
                                    <label>API Key (Consumer Key)</label>
                                    <input type="text" placeholder="Twitter API Key" value={config.apiKey || ''} onChange={e => setConfig({ ...config, apiKey: e.target.value })} />
                                </div>
                                <div className="card-input-group">
                                    <label>API Key Secret (Consumer Secret)</label>
                                    <input type="password" placeholder="Twitter API Secret" value={config.apiSecret || ''} onChange={e => setConfig({ ...config, apiSecret: e.target.value })} />
                                </div>
                                <div className="card-input-group">
                                    <label>User Access Token</label>
                                    <input type="text" placeholder="OAuth Access Token" value={config.accessToken || ''} onChange={e => setConfig({ ...config, accessToken: e.target.value })} />
                                </div>
                                <div className="card-input-group">
                                    <label>User Access Token Secret</label>
                                    <input type="password" placeholder="OAuth Access Token Secret" value={config.accessTokenSecret || ''} onChange={e => setConfig({ ...config, accessTokenSecret: e.target.value })} />
                                </div>
                                <div className="card-input-group">
                                    <label>Bearer Token (Optional v2)</label>
                                    <input type="password" placeholder="App-only Bearer Token" value={config.bearerToken || ''} onChange={e => setConfig({ ...config, bearerToken: e.target.value })} />
                                </div>
                            </>
                        )}
                        {type?.startsWith('portal_') && (
                            <>
                                <div className="card-input-group">
                                    <label>Partner ID / Merchant Code / Agency Code</label>
                                    <input 
                                        type="text" 
                                        placeholder="Partner Code (e.g. 99AC-12345 or Merchant UUID)" 
                                        value={config.partnerId || config.clientId || config.vendorId || config.publisherId || config.dealerId || ''} 
                                        onChange={e => setConfig({ ...config, partnerId: e.target.value })} 
                                    />
                                </div>
                                <div className="card-input-group">
                                    <label>API Key / Secret Token / FTP Password</label>
                                    <input 
                                        type="password" 
                                        placeholder="Portal Secret API Key or Token" 
                                        value={config.apiKey || ''} 
                                        onChange={e => setConfig({ ...config, apiKey: e.target.value })} 
                                    />
                                </div>
                                <div className="card-input-group">
                                    <label>Custom Syndication Feed / Endpoint (Optional)</label>
                                    <input 
                                        type="text" 
                                        placeholder="https://api.portal.com/v1/listings (Leave blank for default)" 
                                        value={config.feedUrl || ''} 
                                        onChange={e => setConfig({ ...config, feedUrl: e.target.value })} 
                                    />
                                </div>
                            </>
                        )}
                    </div>



                    {/* Modal Footer: Action Buttons */}
                    <div style={{ marginTop: '24px', paddingTop: '20px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                        <button
                            onClick={onClose}
                            style={{ padding: '12px 24px', borderRadius: '12px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                            className="hover:bg-slate-50 transition-all"
                        >
                            Cancel
                        </button>
                        
                        {!['google_calendar', 'apple_calendar'].includes(type) && (
                            <button
                                onClick={handleTest}
                                disabled={testing}
                                style={{ padding: '12px 24px', borderRadius: '12px', border: '1px solid var(--border-color)', background: 'var(--bg-light)', color: 'var(--text-main)', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                                className="hover:bg-slate-100 transition-all"
                            >
                                {testing ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-vial"></i>}
                                Test Connection
                            </button>
                        )}

                        <button
                            onClick={handleSave}
                            disabled={isSaving}
                            style={{ 
                                padding: '12px 32px', 
                                borderRadius: '12px', 
                                border: 'none', 
                                background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', 
                                color: '#ffffff', 
                                fontWeight: 800, 
                                fontSize: '0.9rem', 
                                cursor: isSaving ? 'not-allowed' : 'pointer', 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '8px',
                                boxShadow: '0 4px 12px rgba(37, 99, 235, 0.2)' 
                            }}
                            className="hover:scale-105 transition-all"
                        >
                            {isSaving ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-save"></i>}
                            {isSaving ? 'Saving...' : 'Save Configuration'}
                        </button>
                    </div>

                    <style>{`
                        .card-input-group { display: flex; flex-direction: column; gap: 8px; }
                        .card-input-group label { font-size: 0.8rem; font-weight: 700; color: #64748b; }
                        .card-input-group input, .card-input-group textarea { width: 100%; padding: 12px; border: 1px solid var(--border-color); border-radius: 10px; font-size: 0.9rem; transition: border 0.2s; }
                        .card-input-group input:focus { border-color: var(--primary-color); outline: none; }
                        .switch { position: relative; display: inline-block; width: 44px; height: 22px; }
                        .switch input { opacity: 0; width: 0; height: 0; }
                        .slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #ccc; transition: .4s; border-radius: 34px; }
                        .slider:before { position: absolute; content: ""; height: 16px; width: 16px; left: 3px; bottom: 3px; background-color: white; transition: .4s; border-radius: 50%; }
                        input:checked + .slider { background-color: var(--primary-color); }
                        input:checked + .slider:before { transform: translateX(22px); }
                    `}</style>
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
        
        // Property Portals & Syndication (11 Major Indian PropTech Networks)
        portal_99acres: { category: 'Property Portals', status: 'disconnected', label: '99acres.com', icon: 'fas fa-building', color: '#005CA8', description: "India's highest traffic property search marketplace (XML Feed / FTP Syndication)." },
        portal_magicbricks: { category: 'Property Portals', status: 'disconnected', label: 'Magicbricks', icon: 'fas fa-city', color: '#E40046', description: 'Times Group flagship property portal with high-intent verified buyer leads.' },
        portal_housing: { category: 'Property Portals', status: 'disconnected', label: 'Housing.com', icon: 'fas fa-home', color: '#00A65A', description: 'REA India group portal with verified mobile-first buyer inquiries.' },
        portal_commonfloor: { category: 'Property Portals', status: 'disconnected', label: 'CommonFloor', icon: 'fas fa-layer-group', color: '#F97316', description: 'Platform for apartment complexes, RWAs, and residential societies.' },
        portal_makaan: { category: 'Property Portals', status: 'disconnected', label: 'Makaan.com', icon: 'fas fa-compass', color: '#8B5CF6', description: 'Seller ratings & algorithm-driven homebuyer discovery reach.' },
        portal_olx: { category: 'Property Portals', status: 'disconnected', label: 'OLX India', icon: 'fas fa-tags', color: '#002F34', description: 'High-volume hyper-local classifieds for resale, land, and apartments.' },
        portal_quikr: { category: 'Property Portals', status: 'disconnected', label: 'Quikr Homes', icon: 'fas fa-bolt', color: '#0083CA', description: 'Regional buyer reach with automated matching algorithms.' },
        portal_proptiger: { category: 'Property Portals', status: 'disconnected', label: 'PropTiger', icon: 'fas fa-chart-line', color: '#EF4444', description: 'Premier primary market developer new launches and advisory sales.' },
        portal_sulekha: { category: 'Property Portals', status: 'disconnected', label: 'Sulekha NoBroker', icon: 'fas fa-user-shield', color: '#D97706', description: 'Direct match property search portal with instant SMS lead alerts.' },
        portal_propertyguide: { category: 'Property Portals', status: 'disconnected', label: 'Property Guide Online', icon: 'fas fa-newspaper', color: '#0284C7', description: 'Digital property catalog, NRI investor syndication, and luxury showcase.' },
        portal_squareyards: { category: 'Property Portals', status: 'disconnected', label: 'Square Yards', icon: 'fas fa-vector-square', color: '#059669', description: "India's largest integrated real estate platform with institutional brokerage." },

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
        twitter: { category: 'Social Marketing', status: 'disconnected', label: 'Twitter / X', icon: 'fab fa-x-twitter', color: '#0f172a', description: 'Direct OAuth 1.0a & v2 tweet publishing with image media upload.' },
        google_calendar: { category: 'Connectivity & Productivity', status: 'disconnected', label: 'Google Calendar (Legacy)', icon: 'fab fa-google', color: '#4285F4' },
        apple_calendar: { category: 'Connectivity & Productivity', status: 'disconnected', label: 'iCloud Calendar', icon: 'fab fa-apple', color: 'var(--text-muted)' },
        webhook: { category: 'Automation', status: 'disconnected', label: 'Custom Inbound Webhook', icon: 'fas fa-code', color: 'var(--text-main)' }
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

            // Unified Social Status (WhatsApp, Messenger, Instagram, Twitter)
            try {
                const socialRes = await socialAPI.getUnifiedStatus();
                if (socialRes && socialRes.success) {
                    if (socialRes.whatsapp && newConnections.whatsapp) {
                        newConnections.whatsapp = { 
                            ...newConnections.whatsapp, 
                            status: socialRes.whatsapp.connected ? 'connected' : 'disconnected',
                            health: socialRes.whatsapp.health 
                        };
                    }
                    if (socialRes.messenger && newConnections.messenger) {
                        newConnections.messenger = { 
                            ...newConnections.messenger, 
                            status: socialRes.messenger.connected ? 'connected' : 'disconnected',
                            health: socialRes.messenger.health 
                        };
                    }
                    if (socialRes.facebook && newConnections.facebook) {
                        newConnections.facebook = { 
                            ...newConnections.facebook, 
                            status: socialRes.facebook.connected ? 'connected' : 'disconnected',
                            health: 'HEALTHY'
                        };
                    }
                    if (socialRes.instagram && newConnections.instagram) {
                        newConnections.instagram = { 
                            ...newConnections.instagram, 
                            status: socialRes.instagram.connected ? 'connected' : 'disconnected',
                            health: 'HEALTHY'
                        };
                    }
                    if (socialRes.twitter && newConnections.twitter) {
                        newConnections.twitter = {
                            ...newConnections.twitter,
                            status: socialRes.twitter.connected ? 'connected' : 'disconnected',
                            health: socialRes.twitter.health || 'DISCONNECTED'
                        };
                    }
                }
            } catch (socErr) {
                console.warn('Social status fetch failed', socErr);
            }

            // Real Estate Property Portals Status
            try {
                const portalRes = await marketingAPI.getPortalStatuses();
                if (portalRes && portalRes.success && Array.isArray(portalRes.portals)) {
                    portalRes.portals.forEach(p => {
                        const portalKey = `portal_${p.id}`;
                        if (newConnections[portalKey]) {
                            newConnections[portalKey] = {
                                ...newConnections[portalKey],
                                status: p.connected ? 'connected' : 'disconnected',
                                health: p.health,
                                lastSyncedAt: p.lastSyncedAt
                            };
                        }
                    });
                }
            } catch (pErr) {
                console.warn('Failed to load portal statuses', pErr);
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
            const res = await googleSettingsAPI.getAuthUrl(window.location.origin);
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
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg-card)', overflow: 'hidden' }}>
            <div style={{ padding: '32px 40px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-main)', textTransform: 'uppercase' }}>Integrations Hub</h2>
                    <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginTop: '8px' }}>Centralized connection management for all your communication channels.</div>
                </div>
                <div style={{ background: 'var(--bg-light)', padding: '10px 20px', borderRadius: '12px', border: '1px solid var(--border-color)', display: 'flex', gap: '20px' }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Connected: <span style={{ fontWeight: 800, color: '#10b981' }}>{Object.values(connections).filter(c => c.status === 'connected').length}</span></div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Pending: <span style={{ fontWeight: 800, color: '#f59e0b' }}>{Object.values(connections).filter(c => c.status === 'disconnected').length}</span></div>
                </div>
            </div>

            <div style={{ flex: 1, padding: '40px', overflowY: 'auto' }}>
                <div style={{ width: '100%' }}>
                    {['AI Intelligence', 'Property Portals', 'Communication Channels', 'Voice & Telephony', 'Social Marketing', 'Connectivity & Productivity', 'Automation'].map(cat => {
                        const catIcons = {
                            'AI Intelligence': 'fas fa-brain',
                            'Property Portals': 'fas fa-network-wired',
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
                                    <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-main)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{cat}</h3>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '24px' }}>
                                    {catItems.map(([key, item]) => (
                                        <div key={key} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '24px', transition: 'all 0.3s ease', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', position: 'relative' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                                                <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: `${item.color}10`, color: item.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem' }}>
                                                    <i className={item.icon}></i>
                                                </div>
                                                <div style={{ 
                                                    background: item.status === 'connected' ? '#ecfdf5' : (item.health === 'EXPIRED' ? 'rgba(245, 158, 11, 0.15)' : 'var(--bg-light)'), 
                                                    color: item.status === 'connected' ? '#059669' : (item.health === 'EXPIRED' ? '#b45309' : 'var(--text-muted)'), 
                                                    padding: '4px 12px', 
                                                    borderRadius: '20px', 
                                                    fontSize: '0.75rem', 
                                                    fontWeight: 700, 
                                                    border: `1px solid ${item.status === 'connected' ? '#d1fae5' : (item.health === 'EXPIRED' ? '#fde68a' : 'var(--border-color)')}` 
                                                }}>
                                                    {item.status === 'connected' ? 'ACTIVE' : (item.health === 'EXPIRED' ? 'RE-AUTHORIZE' : 'DISCONNECTED')}
                                                </div>
                                            </div>
                                            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-main)' }}>{item.label}</h3>
                                            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '8px', lineHeight: '1.6' }}>
                                                {item.description || (
                                                    key === 'openai' ? 'Leverage GPT-4o for high-fidelity content generation and reasoning.' :
                                                    key === 'gemini' ? 'Deep context window analysis and multimodal capabilities by Google.' :
                                                    key === 'claude' ? 'Safe, steerable, and highly intelligent models for complex workflows.' :
                                                    key === 'twilio' ? 'Send and receive high-volume SMS and trigger automated voice calls via Twilio.' :
                                                    key === 'knowlarity' ? 'Indian cloud telephony leader for automated outbound calls and IVR flows.' :
                                                    key === 'gupshup' ? 'Premier omnichannel marketing for WhatsApp Business, SMS, and RCS in India.' :
                                                    key === 'whatsapp' ? 'Connect Meta Business API for verified messaging.' :
                                                    key === 'telegram' ? 'Manage customer engagement via Telegram bots.' :
                                                    key === 'rcs' ? 'The next generation of business messaging with rich media.' :
                                                    key === 'messenger' ? 'Directly sync Facebook Page messages with Bharat CRM.' :
                                                    key === 'linkedin' ? 'Direct lead synchronization and automated posting for LinkedIn company pages.' :
                                                    key === 'google_calendar' ? 'Sync your activities and meetings with Google Calendar.' :
                                                    key === 'apple_calendar' ? 'Connect your iCloud Calendar for seamless scheduling on iOS.' : ''
                                                )}
                                            </p>

                                            <div style={{ marginTop: '24px', borderTop: '1px solid #f1f5f9', paddingTop: '20px', display: 'flex', gap: '12px' }}>
                                                <button onClick={() => setActiveModal(key)} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-main)', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer' }}>
                                                    {item.status === 'connected' ? 'Update Settings' : 'Configure'}
                                                </button>
                                                {item.status === 'connected' && (
                                                    <button style={{ padding: '10px 14px', borderRadius: '8px', border: 'none', background: 'var(--primary-color)', color: '#ffffff', fontSize: '0.85rem', cursor: 'pointer' }}>
                                                        <i className="fas fa-paper-plane" title="Send Test"></i>
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))}

                                    {cat === 'Connectivity & Productivity' && (
                                        <>
                                            {/* Unified Google Suite Integration */}
                                            <div style={{ background: 'var(--bg-card)', border: '2px solid var(--border-color)', borderRadius: '16px', padding: '24px', boxShadow: '0 4px 6px rgba(0,0,0,0.02)', gridColumn: 'span 2' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                                                    <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#4285F410', color: '#4285F4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem' }}>
                                                        <i className="fab fa-google"></i>
                                                    </div>
                                                    <div style={{ padding: '10px 20px', background: 'var(--bg-light)', borderRadius: '12px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>Auto-Sync</span>
                                                        <label className="switch">
                                                            <input type="checkbox" checked={syncConfig.autoSync} onChange={handleAutoSyncToggle} />
                                                            <span className="slider round"></span>
                                                        </label>
                                                    </div>
                                                </div>

                                                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-main)' }}>Google Business Suite (Unified)</h3>
                                                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '8px', lineHeight: '1.6' }}>
                                                    Professional connection for Google Business Profile, YouTube, Contacts, and Gmail.
                                                </p>

                                                {googleStatus.connected ? (
                                                    <div style={{ marginTop: '20px' }}>
                                                        <div style={{ background: 'var(--bg-light)', padding: '12px', borderRadius: '10px', marginBottom: '16px', border: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                            <div>
                                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 800, marginBottom: '4px' }}>Connected Account</div>
                                                                <div style={{ fontSize: '0.9rem', color: 'var(--text-main)', fontWeight: 700 }}>{googleStatus.email}</div>
                                                            </div>
                                                            {googleStatus.needsReauth ? (
                                                                <span style={{ fontSize: '0.72rem', background: '#fef3c7', color: '#b45309', padding: '4px 8px', borderRadius: '6px', fontWeight: 800, border: '1px solid #fde68a' }}>
                                                                    ⚠️ Session Expired
                                                                </span>
                                                            ) : (
                                                                <span style={{ fontSize: '0.72rem', background: '#ecfdf5', color: '#059669', padding: '4px 8px', borderRadius: '6px', fontWeight: 800, border: '1px solid #a7f3d0' }}>
                                                                    ✓ Active
                                                                </span>
                                                            )}
                                                        </div>

                                                        {googleStatus.needsReauth && (
                                                            <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '10px', padding: '12px 14px', marginBottom: '16px', fontSize: '0.8rem', color: '#92400e', lineHeight: '1.5' }}>
                                                                <strong>Action Required:</strong> Google security tokens have expired. Click <strong>"Reconnect Google"</strong> below to refresh access for YouTube and Google Business Profile.
                                                            </div>
                                                        )}

                                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px', marginBottom: '20px' }}>
                                                            <div style={{ background: googleStatus.services?.gmail ? 'var(--stat-property-bg)' : 'var(--bg-light)', padding: '10px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: googleStatus.services?.gmail ? '#166534' : 'var(--text-muted)', border: '1px solid currentColor' }}>
                                                                <i className={googleStatus.services?.gmail ? "fas fa-check-circle" : "fas fa-circle-notch"}></i> Gmail
                                                            </div>
                                                            <div style={{ background: googleStatus.services?.youtube ? '#fefce8' : 'var(--bg-light)', padding: '10px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: googleStatus.services?.youtube ? '#854d0e' : 'var(--text-muted)', border: '1px solid currentColor' }}>
                                                                <i className={googleStatus.services?.youtube ? "fab fa-youtube" : "fas fa-circle-notch"}></i> YouTube
                                                            </div>
                                                            <div style={{ background: googleStatus.services?.business ? '#ecfdf5' : 'var(--bg-light)', padding: '10px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: googleStatus.services?.business ? '#065f46' : 'var(--text-muted)', border: '1px solid currentColor' }}>
                                                                <i className={googleStatus.services?.business ? "fas fa-store" : "fas fa-circle-notch"}></i> Business
                                                            </div>
                                                        </div>
                                                        <div style={{ display: 'flex', gap: '12px' }}>
                                                            <button 
                                                                onClick={handleConnectGoogle} 
                                                                style={{ 
                                                                    flex: 1, padding: '12px', borderRadius: '10px', 
                                                                    background: googleStatus.needsReauth ? '#4285F4' : 'var(--bg-card)', 
                                                                    border: googleStatus.needsReauth ? 'none' : '1px solid var(--border-color)', 
                                                                    color: googleStatus.needsReauth ? '#ffffff' : 'var(--text-main)', 
                                                                    fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                                                                    boxShadow: googleStatus.needsReauth ? '0 2px 8px rgba(66, 133, 244, 0.3)' : 'none'
                                                                }}
                                                            >
                                                                <i className="fas fa-sync-alt"></i> Reconnect Google
                                                            </button>
                                                            <button onClick={handleDisconnectGoogle} style={{ padding: '12px 18px', borderRadius: '10px', background: 'var(--danger-bg)', border: '1px solid rgba(239, 68, 68, 0.15)', color: '#dc2626', fontWeight: 700, cursor: 'pointer' }}>Disconnect</button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <button onClick={handleConnectGoogle} style={{ marginTop: '20px', width: '100%', padding: '14px', borderRadius: '12px', background: '#4285F4', color: '#ffffff', fontWeight: 800, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                                                        <i className="fab fa-google"></i> Connect Google Account
                                                    </button>
                                                )}
                                            </div>

                                            {/* Apple Contacts Integration */}
                                            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '24px', position: 'relative' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                                                    <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#00000010', color: 'var(--text-main)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem' }}>
                                                        <i className="fab fa-apple"></i>
                                                    </div>
                                                    <div style={{ background: syncConfig.apple.connected ? '#ecfdf5' : 'var(--bg-light)', color: syncConfig.apple.connected ? '#059669' : 'var(--text-muted)', padding: '4px 12px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 700, border: `1px solid ${syncConfig.apple.connected ? '#d1fae5' : 'var(--border-color)'}` }}>
                                                        {syncConfig.apple.connected ? '✓ SYNCING' : 'NOT CONNECTED'}
                                                    </div>
                                                </div>
                                                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-main)' }}>iCloud Contact Sync</h3>
                                                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '8px', lineHeight: '1.6' }}>
                                                    Direct synchronization for Apple Contacts and iOS reminders.
                                                </p>
                                                <div style={{ marginTop: '24px' }}>
                                                    {syncConfig.apple.connected ? (
                                                        <button onClick={() => handleDisconnect('apple')} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid rgba(239, 68, 68, 0.15)', background: 'var(--danger-bg)', color: '#dc2626', fontWeight: 700, cursor: 'pointer' }}>Disconnect iCloud</button>
                                                    ) : (
                                                        <button onClick={() => setShowAppleConfig(true)} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-main)', fontWeight: 700, cursor: 'pointer' }}>Setup iCloud Sync</button>
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
