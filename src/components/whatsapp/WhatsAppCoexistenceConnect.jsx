import React, { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { whatsappOnboardingAPI } from '../../utils/api';

const WhatsAppCoexistenceConnect = ({ onComplete }) => {
    const [status, setStatus] = useState('IDLE');
    const [errorMsg, setErrorMsg] = useState('');
    const [displayPhone, setDisplayPhone] = useState('+91 99913 33570');
    const [checkingStatus, setCheckingStatus] = useState(false);

    const pollIntervalRef = useRef(null);
    const sessionRef = useRef(null);

    // Coordination refs between Meta FB.login callback and WA_EMBEDDED_SIGNUP postMessage
    const authCodeRef = useRef(null);
    const finishEventRef = useRef(false);
    const widgetDataRef = useRef(null);
    const exchangeInProgressRef = useRef(false);

    // 1. Initialize Meta Facebook JavaScript SDK dynamically
    useEffect(() => {
        const appId = import.meta.env.VITE_META_APP_ID || '1152326917972472';

        window.fbAsyncInit = function() {
            if (window.FB) {
                window.FB.init({
                    appId: appId,
                    cookie: true,
                    xfbml: true,
                    version: 'v20.0'
                });
                console.log('[WhatsApp Coexistence] Meta FB SDK initialized successfully');
            }
        };

        if (!document.getElementById('facebook-jssdk')) {
            const js = document.createElement('script');
            js.id = 'facebook-jssdk';
            js.src = 'https://connect.facebook.net/en_US/sdk.js';
            js.async = true;
            js.defer = true;
            js.crossOrigin = 'anonymous';
            document.body.appendChild(js);
        } else if (window.FB && window.FB.init) {
            window.FB.init({
                appId: appId,
                cookie: true,
                xfbml: true,
                version: 'v20.0'
            });
        }
    }, []);

    // 2. Perform Code Exchange when both Auth Code and Finish Event are captured
    const attemptExchange = () => {
        if (
            authCodeRef.current &&
            sessionRef.current &&
            finishEventRef.current &&
            !exchangeInProgressRef.current
        ) {
            exchangeInProgressRef.current = true;
            setStatus('EXCHANGING');
            const codeToExchange = authCodeRef.current;
            const sessionToExchange = sessionRef.current;
            const extraData = widgetDataRef.current ? {
                waba_id: widgetDataRef.current.waba_id,
                phone_number_id: widgetDataRef.current.phone_number_id
            } : {};

            whatsappOnboardingAPI.exchange({
                sessionId: sessionToExchange,
                code: codeToExchange,
                redirect_uri: '', // Empty string prevents Meta OAuth 36008 error
                ...extraData
            }).then((exchangeRes) => {
                if (exchangeRes.success) {
                    const obStatus = exchangeRes.onboardingStatus;
                    const intStatus = exchangeRes.status;
                    const phone = exchangeRes.data?.displayPhoneNumber || exchangeRes.displayPhoneNumber;
                    if (phone) setDisplayPhone(phone);

                    if (obStatus === 'HANDSHAKE_PENDING' || intStatus === 'PENDING') {
                        setStatus('HANDSHAKE_PENDING');
                        startPolling(sessionToExchange);
                    } else if (obStatus === 'CONNECTED' || intStatus === 'ACTIVE') {
                        setStatus('SUCCESS');
                        toast.success('WhatsApp Business API connected successfully!');
                        if (onComplete) onComplete(exchangeRes.data || exchangeRes);
                    } else {
                        setStatus('POLLING');
                        startPolling(sessionToExchange);
                    }
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

    // 3. Listen for postMessages from Meta's Embedded Signup wizard
    useEffect(() => {
        const handleMessage = (event) => {
            if (event.origin !== 'https://www.facebook.com' && event.origin !== 'https://web.facebook.com') {
                return;
            }

            try {
                const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
                if (data?.type === 'WA_EMBEDDED_SIGNUP') {
                    console.log(`[WhatsApp Coexistence] WA_EMBEDDED_SIGNUP event: ${data.event}`, data.data);

                    if (data.event === 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING' || data.event === 'FINISH') {
                        finishEventRef.current = true;
                        if (data.data?.phone_number_id || data.data?.waba_id) {
                            widgetDataRef.current = {
                                waba_id: data.data.waba_id,
                                phone_number_id: data.data.phone_number_id
                            };
                        }
                        attemptExchange();
                    } else if (data.event === 'CANCEL') {
                        if (!exchangeInProgressRef.current) {
                            setStatus('ERROR');
                            setErrorMsg('Onboarding cancelled by user in Meta window.');
                        }
                    } else if (data.event === 'ERROR') {
                        if (!exchangeInProgressRef.current) {
                            setStatus('ERROR');
                            setErrorMsg(data.data?.error_message || 'An error occurred inside Meta Embedded Signup.');
                        }
                    }
                }
            } catch (e) {
                // Ignore non-JSON messages
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, []);

    // 4. Poll backend onboarding status
    const startPolling = (sid) => {
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);

        pollIntervalRef.current = setInterval(async () => {
            try {
                const res = await whatsappOnboardingAPI.getStatus(sid);
                if (res && res.data) {
                    const currentStatus = res.data.onboardingStatus || res.onboardingStatus;
                    const phone = res.data.displayPhoneNumber;
                    if (phone) setDisplayPhone(phone);

                    if (currentStatus === 'CONNECTED' || res.data.status === 'ACTIVE') {
                        clearInterval(pollIntervalRef.current);
                        pollIntervalRef.current = null;
                        setStatus('SUCCESS');
                        toast.success('WhatsApp Business App connected and verified successfully!');
                        if (onComplete) onComplete(res.data);
                    } else if (currentStatus === 'HANDSHAKE_PENDING' || res.data.status === 'PENDING') {
                        setStatus('HANDSHAKE_PENDING');
                    } else if (currentStatus?.startsWith('FAILED') || currentStatus === 'CANCELLED' || currentStatus === 'REVOKED') {
                        clearInterval(pollIntervalRef.current);
                        pollIntervalRef.current = null;
                        setStatus('ERROR');
                        setErrorMsg(`Integration failed: ${res.data.failureReason || currentStatus}`);
                    }
                }
            } catch (err) {
                console.error('[WhatsApp Coexistence] Polling error:', err);
            }
        }, 3000);
    };

    // Manual status re-check
    const checkStatusNow = async () => {
        if (!sessionRef.current) return;
        setCheckingStatus(true);
        try {
            const res = await whatsappOnboardingAPI.getStatus(sessionRef.current);
            if (res && res.data) {
                const currentStatus = res.data.onboardingStatus || res.onboardingStatus;
                const phone = res.data.displayPhoneNumber;
                if (phone) setDisplayPhone(phone);

                if (currentStatus === 'CONNECTED' || res.data.status === 'ACTIVE') {
                    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
                    pollIntervalRef.current = null;
                    setStatus('SUCCESS');
                    toast.success('WhatsApp Coexistence verified and connected!');
                    if (onComplete) onComplete(res.data);
                } else if (currentStatus === 'HANDSHAKE_PENDING' || res.data.status === 'PENDING') {
                    toast('Still waiting for in-app confirmation on WhatsApp Business App...', { icon: '⏳' });
                } else if (currentStatus?.startsWith('FAILED') || currentStatus === 'CANCELLED' || currentStatus === 'REVOKED') {
                    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
                    pollIntervalRef.current = null;
                    setStatus('ERROR');
                    setErrorMsg(`Integration failed: ${res.data.failureReason || currentStatus}`);
                }
            }
        } catch (err) {
            toast.error('Failed to check status: ' + err.message);
        } finally {
            setCheckingStatus(false);
        }
    };

    // 5. Official Meta FB.login Embedded Signup Launch
    const handleConnectClick = async () => {
        try {
            if (!window.FB) {
                throw new Error('Meta Facebook SDK is still loading. Please try again in a few moments.');
            }

            setStatus('STARTING');
            setErrorMsg('');
            authCodeRef.current = null;
            finishEventRef.current = false;
            widgetDataRef.current = null;
            exchangeInProgressRef.current = false;
            sessionRef.current = null;

            const configId = import.meta.env.VITE_META_CONFIG_ID || '2324217335015739';

            // Initiate backend onboarding session
            const startRes = await whatsappOnboardingAPI.start({ connectionType: 'COEXISTENCE' });
            if (!startRes || !startRes.success || !startRes.sessionId) {
                throw new Error('Failed to initiate secure onboarding session');
            }

            sessionRef.current = startRes.sessionId;
            setStatus('META_POPUP');

            // Launch Meta WhatsApp Embedded Signup Wizard
            window.FB.login(
                (response) => {
                    if (response.authResponse && response.authResponse.code) {
                        console.log('[WhatsApp Coexistence] FB.login received authorization code');
                        authCodeRef.current = response.authResponse.code;
                        attemptExchange();
                    } else {
                        console.warn('[WhatsApp Coexistence] FB.login completed without code:', response);
                        if (!exchangeInProgressRef.current && !finishEventRef.current) {
                            setStatus('ERROR');
                            setErrorMsg('Meta authorization was cancelled or failed.');
                        }
                    }
                },
                {
                    config_id: configId,
                    response_type: 'code',
                    override_default_response_type: true,
                    extras: {
                        featureType: 'whatsapp_business_app_onboarding',
                        sessionInfoVersion: '3',
                        setup: {}
                    }
                }
            );
        } catch (error) {
            setStatus('ERROR');
            setErrorMsg(error.message || 'An unexpected error occurred');
        }
    };

    // Cleanup timers on unmount
    useEffect(() => {
        return () => {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        };
    }, []);

    const getStatusUI = () => {
        switch (status) {
            case 'STARTING': return <span style={{ color: 'var(--primary-color)' }}>Initiating secure connection...</span>;
            case 'META_POPUP': return <span style={{ color: 'var(--primary-color)' }}>Complete setup in the Facebook window...</span>;
            case 'EXCHANGING': return <span style={{ color: 'var(--primary-color)' }}>Verifying credentials with Meta...</span>;
            case 'POLLING': return <span style={{ color: 'var(--primary-color)' }}>Finalizing WABA Subscription...</span>;
            case 'SUCCESS': return <span style={{ color: 'green', fontWeight: 'bold' }}>✓ Connected Successfully!</span>;
            case 'ERROR': return <span style={{ color: 'red' }}>{errorMsg}</span>;
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
                    disabled={status !== 'IDLE' && status !== 'ERROR' && status !== 'HANDSHAKE_PENDING'}
                    style={{
                        padding: '10px 20px',
                        background: '#1877F2',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: (status !== 'IDLE' && status !== 'ERROR' && status !== 'HANDSHAKE_PENDING') ? 'not-allowed' : 'pointer',
                        fontWeight: 'bold',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        opacity: (status !== 'IDLE' && status !== 'ERROR' && status !== 'HANDSHAKE_PENDING') ? 0.6 : 1
                    }}
                >
                    <i className="fab fa-facebook-f"></i> Connect with Facebook
                </button>

                {getStatusUI()}
            </div>

            {/* Handshake Pending Notification Banner */}
            {status === 'HANDSHAKE_PENDING' && (
                <div style={{
                    marginTop: '16px',
                    padding: '14px 18px',
                    background: '#FFF8E1',
                    border: '1px solid #FFE082',
                    borderRadius: '6px'
                }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                        <i className="fas fa-mobile-alt" style={{ fontSize: '1.5rem', color: '#F57C00', marginTop: '2px' }}></i>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 'bold', color: '#E65100', fontSize: '0.95rem', marginBottom: '4px' }}>
                                Handshake Pending: Action Required on WhatsApp Business App
                            </div>
                            <p style={{ margin: '0 0 10px 0', fontSize: '0.875rem', color: '#5D4037', lineHeight: '1.4' }}>
                                Meta has initiated Coexistence linking. Please open the WhatsApp Business App on <strong>{displayPhone}</strong> and tap <strong>"Connect to the Business Platform"</strong> to approve the connection.
                            </p>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <button
                                    onClick={checkStatusNow}
                                    disabled={checkingStatus}
                                    style={{
                                        padding: '6px 14px',
                                        background: '#F57C00',
                                        color: '#fff',
                                        border: 'none',
                                        borderRadius: '4px',
                                        cursor: checkingStatus ? 'not-allowed' : 'pointer',
                                        fontSize: '0.85rem',
                                        fontWeight: 'bold',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px'
                                    }}
                                >
                                    {checkingStatus ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-sync-alt"></i>}
                                    Check Status Now
                                </button>
                                <span style={{ fontSize: '0.8rem', color: '#8D6E63', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <i className="fas fa-spinner fa-spin"></i> Auto-checking every 3 seconds...
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default WhatsAppCoexistenceConnect;
