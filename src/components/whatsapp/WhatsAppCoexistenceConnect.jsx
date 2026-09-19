import React, { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { whatsappOnboardingAPI } from '../../utils/api';

const WhatsAppCoexistenceConnect = ({ onComplete }) => {
    const [status, setStatus] = useState('IDLE');
    const [errorMsg, setErrorMsg] = useState('');
    const pollIntervalRef = useRef(null);
    const sessionRef = useRef(null);
    
    // For handling race conditions between popup OAuth redirect and Meta postMessage
    const authCodeRef = useRef(null);
    const widgetDataRef = useRef(null);
    const popupRef = useRef(null);
    const popupPollRef = useRef(null);

    // 1. Detect if THIS window is the OAuth callback popup window
    useEffect(() => {
        if (window.opener && window.location.search) {
            try {
                const params = new URLSearchParams(window.location.search);
                const code = params.get('code');
                const error = params.get('error_description') || params.get('error');

                if (code) {
                    window.opener.postMessage({ type: 'WA_OAUTH_CODE', code }, window.location.origin);
                    window.close();
                } else if (error) {
                    window.opener.postMessage({ type: 'WA_OAUTH_ERROR', error }, window.location.origin);
                    window.close();
                }
            } catch (e) {
                console.error('[WhatsApp Onboarding] Failed to notify opener:', e);
            }
        }
    }, []);

    // 2. Perform Code Exchange
    const attemptExchange = () => {
        if (authCodeRef.current && sessionRef.current) {
            setStatus('EXCHANGING');
            const codeToExchange = authCodeRef.current;
            const sessionToExchange = sessionRef.current;
            const redirectUri = window.location.origin + '/settings';
            const extraData = widgetDataRef.current ? { 
                waba_id: widgetDataRef.current.waba_id,
                phone_number_id: widgetDataRef.current.phone_number_id
            } : {};

            // Clear refs so we don't fire duplicate exchange calls
            authCodeRef.current = null;
            widgetDataRef.current = null;

            whatsappOnboardingAPI.exchange({
                sessionId: sessionToExchange,
                code: codeToExchange,
                redirect_uri: redirectUri,
                ...extraData
            }).then((exchangeRes) => {
                if (exchangeRes.success) {
                    setStatus('POLLING');
                    startPolling(sessionToExchange);
                } else {
                    setStatus('ERROR');
                    setErrorMsg(exchangeRes.error || 'Failed to process Meta authentication');
                }
            }).catch(err => {
                setStatus('ERROR');
                setErrorMsg(err.message || 'Network error during Meta authentication');
            });
        }
    };

    // 3. Listen for postMessages from both our popup callback and Meta's embedded signup
    useEffect(() => {
        const handleMessage = (event) => {
            // A. Callback message from our own popup
            if (event.origin === window.location.origin) {
                if (event.data?.type === 'WA_OAUTH_CODE' && event.data.code) {
                    console.log('[WhatsApp Onboarding] Received OAuth code from popup postMessage');
                    if (popupRef.current && !popupRef.current.closed) {
                        try { popupRef.current.close(); } catch (_) {}
                    }
                    if (popupPollRef.current) {
                        clearInterval(popupPollRef.current);
                        popupPollRef.current = null;
                    }
                    authCodeRef.current = event.data.code;
                    attemptExchange();
                } else if (event.data?.type === 'WA_OAUTH_ERROR') {
                    if (popupRef.current && !popupRef.current.closed) {
                        try { popupRef.current.close(); } catch (_) {}
                    }
                    if (popupPollRef.current) {
                        clearInterval(popupPollRef.current);
                        popupPollRef.current = null;
                    }
                    setStatus('ERROR');
                    setErrorMsg(event.data.error || 'Meta authorization failed.');
                }
                return;
            }

            // B. Meta WA_EMBEDDED_SIGNUP message
            if (event.origin === 'https://www.facebook.com' || event.origin === 'https://web.facebook.com') {
                try {
                    const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
                    
                    if (data?.type === 'WA_EMBEDDED_SIGNUP') {
                        if (data.event === 'FINISH' || data.event === 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING') {
                            console.log('[WhatsApp Onboarding] Captured Meta setup_widget_event:', data.data);
                            widgetDataRef.current = { 
                                waba_id: data.data?.waba_id, 
                                phone_number_id: data.data?.phone_number_id 
                            };
                            attemptExchange();
                        } else if (data.event === 'CANCEL') {
                            setStatus('ERROR');
                            setErrorMsg('Onboarding cancelled by user in Meta window.');
                        } else if (data.event === 'ERROR') {
                            setStatus('ERROR');
                            setErrorMsg('An error occurred inside the Meta setup window.');
                        }
                    }
                } catch (e) {
                    // Ignore non-JSON messages
                }
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, []);

    // 4. Poll backend onboarding status until complete
    const startPolling = (sid) => {
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        
        pollIntervalRef.current = setInterval(async () => {
            try {
                const res = await whatsappOnboardingAPI.getStatus(sid);
                if (res && res.data) {
                    const currentStatus = res.data.onboardingStatus;
                    
                    if (currentStatus === 'CONNECTED') {
                        clearInterval(pollIntervalRef.current);
                        pollIntervalRef.current = null;
                        setStatus('SUCCESS');
                        toast.success('WhatsApp Business API connected successfully!');
                        if (onComplete) onComplete(res.data);
                    } else if (currentStatus.startsWith('FAILED') || currentStatus === 'CANCELLED' || currentStatus === 'REVOKED') {
                        clearInterval(pollIntervalRef.current);
                        pollIntervalRef.current = null;
                        setStatus('ERROR');
                        setErrorMsg(`Integration failed: ${res.data.failureReason || currentStatus}`);
                    }
                }
            } catch (err) {
                console.error('[WhatsApp Onboarding] Polling error:', err);
            }
        }, 3000);
    };

    // 5. Direct URL-based OAuth Popup Trigger
    const handleConnectClick = () => {
        try {
            setStatus('STARTING');
            setErrorMsg('');
            authCodeRef.current = null;
            widgetDataRef.current = null;
            sessionRef.current = null;

            const appId = import.meta.env.VITE_META_APP_ID || '1152326917972472';
            const configId = import.meta.env.VITE_META_CONFIG_ID || '2324217335015739';
            const redirectUri = window.location.origin + '/settings';

            const extras = JSON.stringify({
                featureType: 'whatsapp_business_app_onboarding',
                sessionInfoVersion: '3',
                setup: {}
            });

            const oauthUrl = `https://www.facebook.com/v20.0/dialog/oauth?client_id=${appId}&config_id=${configId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&extras=${encodeURIComponent(extras)}`;

            const width = 600;
            const height = 750;
            const left = window.screenX + Math.max(0, (window.outerWidth - width) / 2);
            const top = window.screenY + Math.max(0, (window.outerHeight - height) / 2);

            const popup = window.open(
                oauthUrl,
                'meta_whatsapp_coexistence',
                `width=${width},height=${height},top=${top},left=${left},scrollbars=yes,status=1`
            );

            if (!popup) {
                throw new Error('Popup blocked! Please allow popups for this site in your browser settings and try again.');
            }

            popupRef.current = popup;
            setStatus('META_POPUP');

            // Initiate backend session
            whatsappOnboardingAPI.start({ connectionType: 'COEXISTENCE' })
                .then(startRes => {
                    if (startRes && startRes.success) {
                        sessionRef.current = startRes.sessionId;
                        attemptExchange();
                    } else {
                        throw new Error('Failed to initiate secure session');
                    }
                })
                .catch(err => {
                    setStatus('ERROR');
                    setErrorMsg(err.message || 'Secure session initiation failed.');
                });

            // Poll popup window location for same-origin redirect
            if (popupPollRef.current) clearInterval(popupPollRef.current);
            popupPollRef.current = setInterval(() => {
                try {
                    if (!popup || popup.closed) {
                        clearInterval(popupPollRef.current);
                        popupPollRef.current = null;
                        return;
                    }

                    if (popup.location && popup.location.origin === window.location.origin) {
                        const params = new URLSearchParams(popup.location.search);
                        const code = params.get('code');
                        const error = params.get('error_description') || params.get('error');

                        if (code) {
                            clearInterval(popupPollRef.current);
                            popupPollRef.current = null;
                            try { popup.close(); } catch (_) {}
                            authCodeRef.current = code;
                            attemptExchange();
                        } else if (error) {
                            clearInterval(popupPollRef.current);
                            popupPollRef.current = null;
                            try { popup.close(); } catch (_) {}
                            setStatus('ERROR');
                            setErrorMsg(`Meta error: ${error}`);
                        }
                    }
                } catch (e) {
                    // Cross-origin while on facebook.com — expected and safely ignored
                }
            }, 350);

        } catch (error) {
            setStatus('ERROR');
            setErrorMsg(error.message || 'An unexpected error occurred');
        }
    };

    // Cleanup timers on unmount
    useEffect(() => {
        return () => {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            if (popupPollRef.current) clearInterval(popupPollRef.current);
        };
    }, []);

    const getStatusUI = () => {
        switch (status) {
            case 'STARTING': return <span style={{color:'var(--primary-color)'}}>Initiating secure connection...</span>;
            case 'META_POPUP': return <span style={{color:'var(--primary-color)'}}>Waiting for Meta completion...</span>;
            case 'EXCHANGING': return <span style={{color:'var(--primary-color)'}}>Verifying credentials securely...</span>;
            case 'POLLING': return <span style={{color:'var(--primary-color)'}}>Finalizing WABA Subscription...</span>;
            case 'SUCCESS': return <span style={{color:'green', fontWeight:'bold'}}>✓ Connected Successfully!</span>;
            case 'ERROR': return <span style={{color:'red'}}>{errorMsg}</span>;
            default: return null;
        }
    };

    return (
        <div style={{ padding: '16px', border: '1px solid var(--border-color)', borderRadius: '8px', marginBottom: '24px', background: 'var(--bg-light)' }}>
            <h4 style={{ margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <i className="fab fa-whatsapp" style={{ color: '#25D366' }}></i> Connect Existing WhatsApp Business App
            </h4>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
                Keep using your WhatsApp Business App on your phone while securely connecting it to Bharat Properties CRM via Meta's Coexistence flow.
            </p>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <button 
                    onClick={handleConnectClick} 
                    disabled={status !== 'IDLE' && status !== 'ERROR'}
                    style={{
                        padding: '10px 20px',
                        background: '#1877F2',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: (status !== 'IDLE' && status !== 'ERROR') ? 'not-allowed' : 'pointer',
                        fontWeight: 'bold',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        opacity: (status !== 'IDLE' && status !== 'ERROR') ? 0.6 : 1
                    }}
                >
                    <i className="fab fa-facebook-f"></i> Connect with Facebook
                </button>
                
                {getStatusUI()}
            </div>
        </div>
    );
};

export default WhatsAppCoexistenceConnect;
