import React, { useState, useEffect, useRef } from 'react';
import { socialAPI } from '../../utils/api';
import whatsappService from '../../services/whatsappService';
import { useUserContext } from '../../context/UserContext';
import toast from 'react-hot-toast';

const WhatsAppQRConnect = ({ onComplete }) => {
    const { user } = useUserContext();
    const [status, setStatus] = useState('IDLE'); // IDLE, STARTING, WAITING_FOR_QR, QR_PENDING, CONNECTED, ERROR
    const [qrDataUrl, setQrDataUrl] = useState(null);
    const [errorMsg, setErrorMsg] = useState('');
    const [displayPhone, setDisplayPhone] = useState(user?.mobile || user?.phone || '');
    const [accountLabel, setAccountLabel] = useState(user?.fullName || user?.name ? `${user?.fullName || user?.name} WhatsApp` : 'Personal WhatsApp');
    const [isChecking, setIsChecking] = useState(true);
    
    const integrationIdRef = useRef(null);
    const pollIntervalRef = useRef(null);
    const pollCountRef = useRef(0);

    // 🚀 ENTERPRISE HYDRATION: Check existing connection on load
    useEffect(() => {
        let isMounted = true;
        const loadInitialState = async () => {
            try {
                const accRes = await whatsappService.getAccounts();
                if (accRes && accRes.success && Array.isArray(accRes.data)) {
                    const baileysAcc = accRes.data.find(a => a.provider === 'BAILEYS' && (a.status === 'ACTIVE' || a.onboardingStatus === 'CONNECTED'));
                    if (baileysAcc && isMounted) {
                        setStatus('CONNECTED');
                        setDisplayPhone(baileysAcc.displayPhoneNumber || baileysAcc.phoneNumberId || user?.mobile || '');
                        setAccountLabel(baileysAcc.accountLabel || (user?.fullName ? `${user.fullName} WhatsApp` : 'Personal WhatsApp'));
                        integrationIdRef.current = baileysAcc.id || baileysAcc._id;
                        setIsChecking(false);
                        return;
                    }
                }
            } catch (e) {
                console.warn('[WhatsApp QR] Auto-detection check:', e.message);
            }
            if (isMounted) setIsChecking(false);
        };

        loadInitialState();

        return () => {
            isMounted = false;
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        };
    }, []);

    const checkStatus = async () => {
        if (!integrationIdRef.current) return;
        pollCountRef.current += 1;

        // Auto-stop polling after 2 minutes of inactivity
        if (pollCountRef.current > 60) {
            clearInterval(pollIntervalRef.current);
            setStatus('ERROR');
            setErrorMsg('QR code timed out. Please click "Regenerate QR Code".');
            return;
        }
        
        try {
            const res = await socialAPI.getBaileysStatus(integrationIdRef.current);
            if (res && res.success) {
                if (res.onboardingStatus === 'CONNECTED' || res.status === 'ACTIVE') {
                    setStatus('CONNECTED');
                    clearInterval(pollIntervalRef.current);
                    toast.success('WhatsApp connected successfully!');
                    if (onComplete) onComplete();
                } else if (res.onboardingStatus === 'QR_PENDING' && res.qrDataUrl) {
                    setStatus('QR_PENDING');
                    setQrDataUrl(res.qrDataUrl);
                } else if (res.onboardingStatus === 'REVOKED') {
                    setStatus('ERROR');
                    setErrorMsg('Connection revoked or expired.');
                    clearInterval(pollIntervalRef.current);
                }
            }
        } catch (error) {
            console.warn('[WhatsApp QR] Poll notice:', error.message);
        }
    };

    const handleConnectClick = async () => {
        if (!displayPhone) {
            return toast.error("Please enter the WhatsApp number first.");
        }
        try {
            setStatus('STARTING');
            setErrorMsg('');
            setQrDataUrl(null);
            pollCountRef.current = 0;
            
            const startRes = await socialAPI.startBaileysConnection({ 
                displayPhoneNumber: displayPhone,
                accountLabel: accountLabel || 'Bharat Properties'
            });

            if (!startRes || !startRes.success || !startRes.integrationId) {
                throw new Error(startRes?.error || 'Failed to initiate QR connection');
            }

            integrationIdRef.current = startRes.integrationId;
            setStatus('WAITING_FOR_QR');

            // Start polling for QR and Status
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = setInterval(checkStatus, 2000);

        } catch (error) {
            setStatus('ERROR');
            const cleanErr = error.response?.data?.error || error.userMessage || error.message || 'Connection failed';
            setErrorMsg(cleanErr);
        }
    };

    const handleDisconnectClick = () => {
        setStatus('IDLE');
        setQrDataUrl(null);
        setErrorMsg('');
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };

    const getStatusUI = () => {
        switch (status) {
            case 'STARTING': 
            case 'WAITING_FOR_QR':
                return <span style={{ color: 'var(--primary-color)' }}><i className="fas fa-circle-notch fa-spin"></i> Initializing QR Code...</span>;
            case 'QR_PENDING': 
                return <span style={{ color: '#F57C00', fontWeight: 600 }}>Scan QR code from WhatsApp &gt; Linked Devices</span>;
            case 'CONNECTED': 
                return <span style={{ color: '#059669', fontWeight: 'bold' }}>✓ Connected Successfully!</span>;
            case 'ERROR': 
                return <span style={{ color: '#dc2626', fontSize: '0.85rem' }}>{errorMsg}</span>;
            default: return null;
        }
    };

    if (isChecking) {
        return (
            <div style={{ padding: '16px', border: '1px solid var(--border-color)', borderRadius: '8px', marginBottom: '24px', background: 'var(--bg-light)' }}>
                <span style={{ fontSize: '0.85rem', color: '#64748b' }}><i className="fas fa-spinner fa-spin"></i> Checking WhatsApp status...</span>
            </div>
        );
    }

    return (
        <div style={{ padding: '18px', border: '1px solid var(--border-color)', borderRadius: '10px', marginBottom: '24px', background: 'var(--bg-light)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <i className="fab fa-whatsapp" style={{ color: '#25D366' }}></i> Connect via WhatsApp Web
                </h4>
                {status === 'CONNECTED' && (
                    <span style={{ background: '#dcfce7', color: '#15803d', padding: '3px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 700 }}>
                        ● Active Live
                    </span>
                )}
            </div>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
                Link your dedicated phone number seamlessly via WhatsApp Web. Ideal for individual and group messaging.
            </p>

            {status === 'CONNECTED' ? (
                <div style={{ padding: '16px', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                            <div style={{ color: '#065f46', fontWeight: 700, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <i className="fas fa-check-circle" style={{ color: '#10b981' }}></i> WhatsApp Web Connected
                            </div>
                            <div style={{ color: '#047857', fontSize: '0.82rem', marginTop: '4px' }}>
                                Linked Phone: <strong>+{displayPhone}</strong> • {accountLabel}
                            </div>
                        </div>
                        <button
                            onClick={handleDisconnectClick}
                            style={{ padding: '6px 12px', background: '#fff', border: '1px solid #f87171', color: '#dc2626', borderRadius: '6px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600 }}
                        >
                            <i className="fas fa-sync-alt" style={{ marginRight: '4px' }}></i> Re-link Device
                        </button>
                    </div>
                </div>
            ) : (
                <>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '14px', maxWidth: '320px' }}>
                        <input 
                            type="text" 
                            placeholder="WhatsApp Number (e.g. 919991333570)" 
                            value={displayPhone} 
                            onChange={e => setDisplayPhone(e.target.value)}
                            style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', width: '100%', fontSize: '0.88rem' }}
                        />
                        <input 
                            type="text" 
                            placeholder="Account Label (Optional)" 
                            value={accountLabel} 
                            onChange={e => setAccountLabel(e.target.value)}
                            style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', width: '100%', fontSize: '0.88rem' }}
                        />
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                        <button
                            onClick={handleConnectClick}
                            disabled={status === 'STARTING' || status === 'WAITING_FOR_QR'}
                            style={{
                                padding: '9px 18px',
                                background: '#25D366',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: (status === 'STARTING' || status === 'WAITING_FOR_QR') ? 'not-allowed' : 'pointer',
                                fontWeight: 'bold',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                fontSize: '0.88rem'
                            }}
                        >
                            <i className="fas fa-sync"></i> {status === 'ERROR' ? 'Retry Connection' : 'Generate QR Code'}
                        </button>

                        {getStatusUI()}
                    </div>

                    {status === 'QR_PENDING' && qrDataUrl && (
                        <div style={{ marginTop: '16px', textAlign: 'center', background: '#fff', padding: '16px', borderRadius: '8px', border: '1px solid #ddd', display: 'inline-block' }}>
                            <img src={qrDataUrl} alt="WhatsApp QR Code" style={{ width: '240px', height: '240px' }} />
                            <p style={{ fontSize: '0.82rem', color: '#666', marginTop: '10px', marginBottom: 0 }}>
                                Open WhatsApp &gt; Settings &gt; Linked Devices &gt; Link a Device.
                            </p>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default WhatsAppQRConnect;
