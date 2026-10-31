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
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [countdown, setCountdown] = useState(60);
    const [isSocketAlive, setIsSocketAlive] = useState(false);
    
    const integrationIdRef = useRef(null);
    const pollIntervalRef = useRef(null);
    const pollCountRef = useRef(0);
    const timerIntervalRef = useRef(null);

    // 🚀 ENTERPRISE HYDRATION: Check existing connection and verify live socket
    useEffect(() => {
        let isMounted = true;
        const loadInitialState = async () => {
            try {
                const accRes = await whatsappService.getAccounts();
                if (accRes && accRes.success && Array.isArray(accRes.data)) {
                    const baileysAcc = accRes.data.find(a => a.provider === 'BAILEYS' && (a.status === 'ACTIVE' || a.onboardingStatus === 'CONNECTED'));
                    if (baileysAcc && isMounted) {
                        integrationIdRef.current = baileysAcc.id || baileysAcc._id;
                        setDisplayPhone(baileysAcc.displayPhoneNumber || baileysAcc.phoneNumberId || user?.mobile || '');
                        setAccountLabel(baileysAcc.accountLabel || (user?.fullName ? `${user.fullName} WhatsApp` : 'Personal WhatsApp'));

                        // Verify live socket status with backend
                        try {
                            const statusRes = await socialAPI.getBaileysStatus(baileysAcc.id || baileysAcc._id);
                            if (statusRes && statusRes.success) {
                                setIsSocketAlive(!!statusRes.isSocketAlive);
                                if (statusRes.onboardingStatus === 'CONNECTED' || statusRes.status === 'ACTIVE') {
                                    setStatus('CONNECTED');
                                } else if (statusRes.qrDataUrl) {
                                    setStatus('QR_PENDING');
                                    setQrDataUrl(statusRes.qrDataUrl);
                                } else {
                                    setStatus('CONNECTED');
                                }
                            } else {
                                setStatus('CONNECTED');
                            }
                        } catch (sErr) {
                            setStatus('CONNECTED');
                        }
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
            if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
        };
    }, []);

    // ⏱️ Countdown timer for QR code validity
    useEffect(() => {
        if (status === 'QR_PENDING') {
            setCountdown(60);
            if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
            timerIntervalRef.current = setInterval(() => {
                setCountdown(prev => {
                    if (prev <= 1) {
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        } else {
            if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
        }
        return () => {
            if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
        };
    }, [status, qrDataUrl]);

    // 🔄 Auto-polling for QR code and pairing confirmation
    const checkStatus = async () => {
        if (!integrationIdRef.current) return;
        pollCountRef.current += 1;

        // Auto-stop polling after 120 seconds of inactivity
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
                    setIsSocketAlive(true);
                    if (res.phoneNumber) setDisplayPhone(res.phoneNumber);
                    if (res.accountLabel) setAccountLabel(res.accountLabel);
                    clearInterval(pollIntervalRef.current);
                    toast.success('WhatsApp connected successfully!');
                    if (onComplete) onComplete();
                } else if (res.qrDataUrl) {
                    setStatus('QR_PENDING');
                    setQrDataUrl(res.qrDataUrl);
                } else if (res.onboardingStatus === 'REVOKED') {
                    setStatus('ERROR');
                    setErrorMsg('Connection session expired or revoked.');
                    clearInterval(pollIntervalRef.current);
                } else if (res.onboardingStatus === 'ERROR' || res.status === 'ERROR') {
                    setStatus('ERROR');
                    setErrorMsg(res.error || 'Connection failed: duplicate number or session error.');
                    clearInterval(pollIntervalRef.current);
                }
            }
        } catch (error) {
            console.warn('[WhatsApp QR] Poll notice:', error.message);
        }
    };

    // 🚀 Start QR generation flow immediately
    const handleStartConnect = async (forceReclaim = true) => {
        try {
            setStatus('STARTING');
            setErrorMsg('');
            setQrDataUrl(null);
            pollCountRef.current = 0;
            
            const startRes = await socialAPI.startBaileysConnection({ 
                displayPhoneNumber: displayPhone || '',
                accountLabel: accountLabel || 'Personal WhatsApp',
                forceReclaim: forceReclaim
            });

            if (!startRes || !startRes.success || !startRes.integrationId) {
                throw new Error(startRes?.error || 'Failed to initiate QR connection');
            }

            integrationIdRef.current = startRes.integrationId;
            setStatus('WAITING_FOR_QR');

            // Start polling every 2 seconds
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = setInterval(checkStatus, 2000);
            
            // Initial instant check
            setTimeout(checkStatus, 800);

        } catch (error) {
            setStatus('ERROR');
            const cleanErr = error.response?.data?.error || error.userMessage || error.message || 'Connection failed';
            setErrorMsg(cleanErr);
        }
    };

    // 🔌 Disconnect / Unlink device cleanly
    const handleDisconnect = async () => {
        if (!window.confirm("Are you sure you want to unlink WhatsApp Web from this account?")) {
            return;
        }
        try {
            if (integrationIdRef.current) {
                await socialAPI.disconnectBaileys(integrationIdRef.current);
            }
            setStatus('IDLE');
            setQrDataUrl(null);
            setErrorMsg('');
            setIsSocketAlive(false);
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            toast.success("WhatsApp Web unlinked successfully.");
        } catch (e) {
            toast.error("Failed to unlink: " + e.message);
        }
    };

    const handleCancel = () => {
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
        setQrDataUrl(null);
        setErrorMsg('');
        if (displayPhone && isSocketAlive) {
            setStatus('CONNECTED');
        } else {
            setStatus('IDLE');
        }
    };

    if (isChecking) {
        return (
            <div style={{ padding: '20px', border: '1px solid var(--border-color)', borderRadius: '10px', marginBottom: '24px', background: 'var(--bg-light)' }}>
                <span style={{ fontSize: '0.88rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <i className="fas fa-spinner fa-spin" style={{ color: '#25D366' }}></i> Checking WhatsApp Web connection status...
                </span>
            </div>
        );
    }

    return (
        <div style={{ padding: '22px', border: '1px solid var(--border-color)', borderRadius: '12px', marginBottom: '24px', background: 'var(--card-bg, #ffffff)', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: '#e0f7ea', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <i className="fab fa-whatsapp" style={{ color: '#25D366', fontSize: '1.4rem' }}></i>
                    </div>
                    <div>
                        <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-main, #1e293b)' }}>
                            Connect via WhatsApp Web
                        </h4>
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted, #64748b)' }}>
                            Direct browser-to-phone pairing for group and individual messaging
                        </span>
                    </div>
                </div>

                {status === 'CONNECTED' && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#dcfce7', color: '#15803d', padding: '4px 10px', borderRadius: '16px', fontSize: '0.78rem', fontWeight: 700 }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e' }}></span>
                        Active Live
                    </span>
                )}
            </div>

            {/* State: CONNECTED */}
            {status === 'CONNECTED' && (
                <div style={{ padding: '18px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', marginTop: '14px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
                        <div>
                            <div style={{ color: '#166534', fontWeight: 700, fontSize: '0.98rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <i className="fas fa-check-circle" style={{ color: '#22c55e', fontSize: '1.1rem' }}></i> WhatsApp Web Connected & Synced
                            </div>
                            <div style={{ color: '#15803d', fontSize: '0.85rem', marginTop: '6px' }}>
                                Linked Phone: <strong>+{displayPhone}</strong> • <span style={{ opacity: 0.9 }}>{accountLabel}</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                                <span style={{ fontSize: '0.74rem', background: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>
                                    <i className="fas fa-shield-alt" style={{ marginRight: '4px' }}></i> Dedicated Session Active
                                </span>
                                {isSocketAlive ? (
                                    <span style={{ fontSize: '0.74rem', background: '#ecfdf5', color: '#047857', padding: '2px 8px', borderRadius: '4px' }}>
                                        ● In-memory socket alive
                                    </span>
                                ) : (
                                    <span style={{ fontSize: '0.74rem', background: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: '4px' }}>
                                        ⚠ Auto-reconnecting background socket
                                    </span>
                                )}
                            </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <button
                                onClick={() => handleStartConnect(true)}
                                style={{
                                    padding: '8px 14px',
                                    background: '#25D366',
                                    color: '#ffffff',
                                    border: 'none',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    fontSize: '0.82rem',
                                    fontWeight: 700,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
                                }}
                            >
                                <i className="fas fa-qrcode"></i> Scan New QR / Re-link
                            </button>
                            <button
                                onClick={handleDisconnect}
                                style={{
                                    padding: '8px 12px',
                                    background: '#ffffff',
                                    border: '1px solid #fca5a5',
                                    color: '#dc2626',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    fontSize: '0.82rem',
                                    fontWeight: 600
                                }}
                                title="Unlink WhatsApp session"
                            >
                                <i className="fas fa-unlink" style={{ marginRight: '4px' }}></i> Unlink
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* State: WAITING_FOR_QR or STARTING or QR_PENDING (Interactive Scanner Box) */}
            {(status === 'STARTING' || status === 'WAITING_FOR_QR' || status === 'QR_PENDING') && (
                <div style={{ marginTop: '16px', padding: '20px', border: '1px solid #e2e8f0', borderRadius: '10px', background: '#fafbfc' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '24px', alignItems: 'center', justifyContent: 'center' }}>
                        
                        {/* Left Side: Step-by-Step Instructions */}
                        <div style={{ flex: '1 1 280px', maxWidth: '380px' }}>
                            <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#1e293b', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <i className="fas fa-mobile-alt" style={{ color: '#25D366' }}></i> How to Link WhatsApp:
                            </div>
                            <ol style={{ paddingLeft: '20px', margin: 0, fontSize: '0.85rem', color: '#475569', lineHeight: 1.8 }}>
                                <li>Open <strong>WhatsApp</strong> on your mobile phone.</li>
                                <li>Tap <strong>Settings ⚙️</strong> (iPhone) or <strong>Menu ⋮</strong> (Android).</li>
                                <li>Tap <strong>Linked Devices</strong> &gt; <strong>Link a Device</strong>.</li>
                                <li>Point your phone's camera at this QR code.</li>
                            </ol>
                            <div style={{ marginTop: '16px', padding: '10px 12px', background: '#f0fdf4', border: '1px solid #dcfce7', borderRadius: '6px', fontSize: '0.78rem', color: '#166534' }}>
                                <i className="fas fa-info-circle" style={{ marginRight: '6px' }}></i>
                                Keep WhatsApp open on your phone while scanning. The page will auto-refresh once paired!
                            </div>
                        </div>

                        {/* Right Side: QR Scanner Box */}
                        <div style={{ textAlign: 'center', padding: '14px', background: '#ffffff', borderRadius: '10px', border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                            {status === 'QR_PENDING' && qrDataUrl ? (
                                <>
                                    <div style={{ position: 'relative', display: 'inline-block' }}>
                                        <img 
                                            src={qrDataUrl} 
                                            alt="WhatsApp QR Code Scanner" 
                                            style={{ 
                                                width: '240px', 
                                                height: '240px', 
                                                display: 'block', 
                                                borderRadius: '6px',
                                                border: '1px solid #f1f5f9'
                                            }} 
                                        />
                                        {countdown === 0 && (
                                            <div style={{
                                                position: 'absolute',
                                                inset: 0,
                                                background: 'rgba(255, 255, 255, 0.92)',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                borderRadius: '6px'
                                            }}>
                                                <i className="fas fa-clock" style={{ fontSize: '1.8rem', color: '#f59e0b', marginBottom: '8px' }}></i>
                                                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#1e293b' }}>QR Code Expired</span>
                                                <button
                                                    onClick={() => handleStartConnect(true)}
                                                    style={{
                                                        marginTop: '8px',
                                                        padding: '6px 14px',
                                                        background: '#25D366',
                                                        color: 'white',
                                                        border: 'none',
                                                        borderRadius: '6px',
                                                        fontWeight: 700,
                                                        fontSize: '0.8rem',
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    <i className="fas fa-sync-alt" style={{ marginRight: '4px' }}></i> Click to Reload QR
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                    <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.78rem', color: '#64748b' }}>
                                        <span>
                                            <i className="fas fa-hourglass-half" style={{ marginRight: '4px', color: countdown <= 10 ? '#dc2626' : '#64748b' }}></i>
                                            Expires in: <strong style={{ color: countdown <= 10 ? '#dc2626' : '#1e293b' }}>{countdown}s</strong>
                                        </span>
                                        <button 
                                            onClick={() => handleStartConnect(true)}
                                            style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', padding: 0, fontSize: '0.78rem', fontWeight: 600 }}
                                        >
                                            <i className="fas fa-sync-alt" style={{ marginRight: '3px' }}></i> Refresh
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <div style={{ width: '240px', height: '240px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', borderRadius: '6px', border: '2px dashed #cbd5e1' }}>
                                    <i className="fas fa-circle-notch fa-spin" style={{ fontSize: '2rem', color: '#25D366', marginBottom: '12px' }}></i>
                                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155' }}>
                                        Generating QR Code...
                                    </span>
                                    <span style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '4px' }}>
                                        Connecting to WhatsApp servers
                                    </span>
                                </div>
                            )}

                            <div style={{ marginTop: '12px' }}>
                                <button
                                    onClick={handleCancel}
                                    style={{
                                        padding: '5px 12px',
                                        background: '#f1f5f9',
                                        border: '1px solid #cbd5e1',
                                        color: '#475569',
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                        fontSize: '0.78rem'
                                    }}
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>

                    </div>
                </div>
            )}

            {/* State: IDLE (Scanner Not Yet Open) */}
            {status === 'IDLE' && (
                <div style={{ marginTop: '14px', padding: '18px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px' }}>
                    <p style={{ margin: '0 0 14px 0', fontSize: '0.85rem', color: '#475569' }}>
                        Your phone is not yet connected to WhatsApp Web. Click the button below to generate a real-time QR code and pair instantly with your WhatsApp app.
                    </p>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                        <button
                            onClick={() => handleStartConnect(true)}
                            style={{
                                padding: '10px 20px',
                                background: '#25D366',
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                fontWeight: 700,
                                fontSize: '0.92rem',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '8px',
                                boxShadow: '0 2px 4px rgba(37,211,102,0.2)'
                            }}
                        >
                            <i className="fas fa-qrcode" style={{ fontSize: '1.1rem' }}></i> Open WhatsApp QR Scanner
                        </button>

                        <button
                            type="button"
                            onClick={() => setShowAdvanced(!showAdvanced)}
                            style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '0.78rem', cursor: 'pointer', textDecoration: 'underline' }}
                        >
                            {showAdvanced ? 'Hide advanced settings' : 'Configure phone/label (Optional)'}
                        </button>
                    </div>

                    {showAdvanced && (
                        <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px dashed #cbd5e1', display: 'flex', flexWrap: 'wrap', gap: '12px', maxWidth: '440px' }}>
                            <div style={{ flex: '1 1 180px' }}>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                                    Phone Number (Optional):
                                </label>
                                <input 
                                    type="text" 
                                    placeholder="e.g. 919991000570" 
                                    value={displayPhone} 
                                    onChange={e => setDisplayPhone(e.target.value)}
                                    style={{ padding: '7px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', width: '100%', fontSize: '0.85rem' }}
                                />
                            </div>
                            <div style={{ flex: '1 1 180px' }}>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                                    Account Label:
                                </label>
                                <input 
                                    type="text" 
                                    placeholder="e.g. Suraj WhatsApp" 
                                    value={accountLabel} 
                                    onChange={e => setAccountLabel(e.target.value)}
                                    style={{ padding: '7px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', width: '100%', fontSize: '0.85rem' }}
                                />
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* State: ERROR */}
            {status === 'ERROR' && (
                <div style={{ marginTop: '14px', padding: '16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#b91c1c', fontWeight: 700, fontSize: '0.9rem' }}>
                        <i className="fas fa-exclamation-triangle"></i> QR Connection Notice
                    </div>
                    <p style={{ margin: '8px 0 14px 0', fontSize: '0.84rem', color: '#dc2626' }}>
                        {errorMsg || 'Unable to initialize WhatsApp Web QR code.'}
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <button
                            onClick={() => handleStartConnect(true)}
                            style={{
                                padding: '7px 14px',
                                background: '#dc2626',
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '0.82rem',
                                fontWeight: 700,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px'
                            }}
                        >
                            <i className="fas fa-sync-alt"></i> Try Again / Scan QR
                        </button>
                        <button
                            onClick={handleCancel}
                            style={{
                                padding: '7px 12px',
                                background: '#ffffff',
                                border: '1px solid #cbd5e1',
                                color: '#475569',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '0.82rem'
                            }}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}

        </div>
    );
};

export default WhatsAppQRConnect;
