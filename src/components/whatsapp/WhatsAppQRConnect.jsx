import React, { useState, useEffect, useRef } from 'react';
import { socialAPI } from '../../utils/api';
import toast from 'react-hot-toast';

const WhatsAppQRConnect = ({ onComplete }) => {
    const [status, setStatus] = useState('IDLE'); // IDLE, STARTING, QR_PENDING, CONNECTED, ERROR
    const [qrDataUrl, setQrDataUrl] = useState(null);
    const [errorMsg, setErrorMsg] = useState('');
    const [displayPhone, setDisplayPhone] = useState('');
    const [accountLabel, setAccountLabel] = useState('');
    
    const integrationIdRef = useRef(null);
    const pollIntervalRef = useRef(null);

    const checkStatus = async () => {
        if (!integrationIdRef.current) return;
        
        try {
            const res = await socialAPI.getBaileysStatus(integrationIdRef.current);
            if (res && res.success) {
                if (res.onboardingStatus === 'QR_PENDING' && res.qrDataUrl) {
                    setStatus('QR_PENDING');
                    setQrDataUrl(res.qrDataUrl);
                } else if (res.onboardingStatus === 'CONNECTED' || res.status === 'ACTIVE') {
                    setStatus('CONNECTED');
                    clearInterval(pollIntervalRef.current);
                    toast.success('WhatsApp connected successfully!');
                    if (onComplete) onComplete();
                } else if (res.onboardingStatus === 'REVOKED') {
                    setStatus('ERROR');
                    setErrorMsg('Connection revoked or timed out.');
                    clearInterval(pollIntervalRef.current);
                }
            }
        } catch (error) {
            console.error('[WhatsApp QR] Error checking status:', error);
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
            
            const startRes = await socialAPI.startBaileysConnection({ 
                displayPhoneNumber: displayPhone,
                accountLabel: accountLabel || 'QR WhatsApp Web'
            });

            if (!startRes || !startRes.success || !startRes.integrationId) {
                throw new Error('Failed to initiate QR connection');
            }

            integrationIdRef.current = startRes.integrationId;
            setStatus('WAITING_FOR_QR');

            // Start polling for QR and Status
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = setInterval(checkStatus, 2000);

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
            case 'STARTING': 
            case 'WAITING_FOR_QR':
                return <span style={{ color: 'var(--primary-color)' }}><i className="fas fa-circle-notch fa-spin"></i> Generating QR Code...</span>;
            case 'QR_PENDING': 
                return <span style={{ color: '#F57C00' }}>Scan the QR code with your WhatsApp app</span>;
            case 'CONNECTED': 
                return <span style={{ color: 'green', fontWeight: 'bold' }}>✓ Connected Successfully!</span>;
            case 'ERROR': 
                return <span style={{ color: 'red' }}>{errorMsg}</span>;
            default: return null;
        }
    };

    return (
        <div style={{ padding: '16px', border: '1px solid var(--border-color)', borderRadius: '8px', marginBottom: '24px', background: 'var(--bg-light)' }}>
            <h4 style={{ margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <i className="fas fa-qrcode" style={{ color: '#25D366' }}></i> Connect via QR Scanner (Web)
            </h4>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
                Link your secondary number seamlessly just like WhatsApp Web. Best for groups and paced automations.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px', maxWidth: '300px' }}>
                <input 
                    type="text" 
                    placeholder="WhatsApp Number (e.g. 919991333570)" 
                    value={displayPhone} 
                    onChange={e => setDisplayPhone(e.target.value)}
                    style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', width: '100%' }}
                />
                <input 
                    type="text" 
                    placeholder="Account Label (Optional)" 
                    value={accountLabel} 
                    onChange={e => setAccountLabel(e.target.value)}
                    style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', width: '100%' }}
                />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <button
                    onClick={handleConnectClick}
                    disabled={status === 'STARTING' || status === 'WAITING_FOR_QR'}
                    style={{
                        padding: '10px 20px',
                        background: '#25D366',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: (status === 'STARTING' || status === 'WAITING_FOR_QR') ? 'not-allowed' : 'pointer',
                        fontWeight: 'bold',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                    }}
                >
                    <i className="fas fa-sync"></i> {status === 'ERROR' ? 'Retry Connection' : 'Generate QR Code'}
                </button>

                {getStatusUI()}
            </div>

            {status === 'QR_PENDING' && qrDataUrl && (
                <div style={{ marginTop: '20px', textAlign: 'center', background: '#fff', padding: '16px', borderRadius: '8px', border: '1px solid #ddd', display: 'inline-block' }}>
                    <img src={qrDataUrl} alt="WhatsApp QR Code" style={{ width: '256px', height: '256px' }} />
                    <p style={{ fontSize: '0.85rem', color: '#666', marginTop: '12px' }}>
                        Open WhatsApp on your phone &gt; Settings &gt; Linked Devices &gt; Link a Device.
                    </p>
                </div>
            )}
        </div>
    );
};

export default WhatsAppQRConnect;
