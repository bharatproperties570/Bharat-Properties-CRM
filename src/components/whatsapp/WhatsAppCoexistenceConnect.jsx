import React, { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { whatsappOnboardingAPI } from '../../utils/api';

const WhatsAppCoexistenceConnect = ({ onComplete }) => {
    const [status, setStatus] = useState('IDLE');
    const [errorMsg, setErrorMsg] = useState('');
    const pollIntervalRef = useRef(null);
    const sessionRef = useRef(null);
    
    // For handling race conditions between FB.login callback and postMessage
    const authCodeRef = useRef(null);
    const widgetDataRef = useRef(null);

    useEffect(() => {
        if (window.FB) return;
        const script = document.createElement('script');
        script.src = 'https://connect.facebook.net/en_US/sdk.js';
        script.async = true;
        script.defer = true;
        script.crossOrigin = 'anonymous';
        document.body.appendChild(script);

        window.fbAsyncInit = function() {
            window.FB.init({
                appId: import.meta.env.VITE_META_APP_ID || '1473077001025314',
                cookie: true,
                xfbml: true,
                version: 'v20.0'
            });
        };
    }, []);

    const attemptExchange = () => {
        if (authCodeRef.current && widgetDataRef.current && sessionRef.current) {
            setStatus('EXCHANGING');
            whatsappOnboardingAPI.exchange({
                sessionId: sessionRef.current,
                code: authCodeRef.current,
                waba_id: widgetDataRef.current.waba_id,
                phone_number_id: widgetDataRef.current.phone_number_id
            }).then((exchangeRes) => {
                if (exchangeRes.success) {
                    setStatus('POLLING');
                    startPolling(sessionRef.current);
                } else {
                    setStatus('ERROR');
                    setErrorMsg(exchangeRes.error || 'Failed to process Meta authentication');
                }
            }).catch(err => {
                setStatus('ERROR');
                setErrorMsg(err.message || 'Network error during Meta authentication');
            });

            // Clear refs after exchange starts
            authCodeRef.current = null;
            widgetDataRef.current = null;
        }
    };

    useEffect(() => {
        const handleMessage = (event) => {
            if (event.origin !== 'https://www.facebook.com' && event.origin !== 'https://web.facebook.com') {
                return;
            }

            try {
                const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
                
                if (data?.type === 'WA_EMBEDDED_SIGNUP') {
                    if (data.event === 'FINISH') {
                        console.log('[WhatsApp Onboarding] Captured Meta setup_widget_event');
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
                // Ignore parsing errors for other non-JSON messages
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, []);

    const startPolling = (sid) => {
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        
        pollIntervalRef.current = setInterval(async () => {
            try {
                const res = await whatsappOnboardingAPI.getStatus(sid);
                if (res && res.data) {
                    const currentStatus = res.data.onboardingStatus;
                    
                    if (currentStatus === 'CONNECTED') {
                        clearInterval(pollIntervalRef.current);
                        setStatus('SUCCESS');
                        toast.success('WhatsApp Business API connected successfully!');
                        if (onComplete) onComplete(res.data);
                    } else if (currentStatus.startsWith('FAILED') || currentStatus === 'CANCELLED' || currentStatus === 'REVOKED') {
                        clearInterval(pollIntervalRef.current);
                        setStatus('ERROR');
                        setErrorMsg(`Integration failed: ${res.data.failureReason || currentStatus}`);
                    }
                }
            } catch (err) {
                console.error('[WhatsApp Onboarding] Polling error:', err);
            }
        }, 3000);
    };

    const handleConnectClick = async () => {
        try {
            setStatus('STARTING');
            setErrorMsg('');
            authCodeRef.current = null;
            widgetDataRef.current = null;
            
            if (!window.FB) {
                throw new Error('Meta SDK is still loading. Please try again in a few seconds.');
            }

            const startRes = await whatsappOnboardingAPI.start({ connectionType: 'COEXISTENCE' });
            if (!startRes.success) throw new Error('Failed to initiate secure session');
            
            sessionRef.current = startRes.sessionId;
            setStatus('META_POPUP');
            
            const configId = import.meta.env.VITE_META_EMBEDDED_SIGNUP_CONFIG_ID;
            if (!configId) {
                throw new Error('Missing Embedded Signup Config ID in environment variables');
            }

            window.FB.login((response) => {
                if (response.authResponse) {
                    authCodeRef.current = response.authResponse.code;
                    attemptExchange();
                    
                    // Fallback timeout in case postMessage never arrives
                    setTimeout(() => {
                        // We check a state variable indirectly or just check if authCodeRef is still populated
                        if (authCodeRef.current && !widgetDataRef.current) {
                            setStatus('ERROR');
                            setErrorMsg('Did not receive WABA details from Meta popup. Ensure you completed the flow.');
                        }
                    }, 10000); // 10s wait for postMessage
                } else {
                    setStatus('ERROR');
                    setErrorMsg('Meta authorization was cancelled or failed.');
                }
            }, {
                config_id: configId,
                response_type: 'code',
                override_default_response_type: true,
                extras: {
                    feature: 'whatsapp_embedded_signup',
                    setup: {}
                }
            });

        } catch (error) {
            setStatus('ERROR');
            setErrorMsg(error.message || 'An unexpected error occurred');
        }
    };

    useEffect(() => {
        return () => {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
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
