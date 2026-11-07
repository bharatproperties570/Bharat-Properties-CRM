import React, { useEffect, useState, useRef } from 'react';
import { socialAPI } from '../../utils/api';
import { toast } from 'react-hot-toast';

const FacebookCallback = ({ onNavigate }) => {
    const [status, setStatus] = useState('Connecting to Meta...');
    const [errorMsg, setErrorMsg] = useState(null);
    const hasProcessed = useRef(false);

    useEffect(() => {
        const handleCallback = async () => {
            if (hasProcessed.current) return;
            hasProcessed.current = true;

            const params = new URLSearchParams(window.location.search);
            const code = params.get('code');
            const error = params.get('error_description') || params.get('error');

            if (error) {
                console.error('[FacebookCallback] Meta returned error:', error);
                setErrorMsg(error);
                toast.error(`Meta Connection Failed: ${error}`);
                return;
            }

            if (!code) {
                setErrorMsg('No authorization code was found in the Meta callback URL.');
                toast.error('No authorization code found');
                return;
            }

            try {
                setStatus('Exchanging authorization code with Meta for permanent Page & Instagram tokens...');
                const response = await socialAPI.handleFacebookCallback(code, window.location.origin);
                
                if (response.success) {
                    setStatus('✅ Connected successfully!');
                    toast.success(response.message || 'Facebook Page & Instagram connected successfully!', { duration: 5000 });
                    setTimeout(() => {
                        window.history.replaceState({}, document.title, window.location.pathname);
                        if (typeof onNavigate === 'function') {
                            onNavigate('settings');
                        } else {
                            window.location.href = '/settings';
                        }
                    }, 1500);
                } else {
                    setErrorMsg(response.error || 'Failed to complete Meta handshake.');
                    toast.error(response.error || 'Failed to connect Meta account');
                }
            } catch (err) {
                console.error('[FacebookCallback] Fatal handshake error:', err);
                const msg = err.response?.data?.error || err.message || 'An error occurred during Meta connection';
                setErrorMsg(msg);
                toast.error(msg, { duration: 6000 });
            }
        };

        handleCallback();
    }, [onNavigate]);

    return (
        <div style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center', 
            justifyContent: 'center', 
            minHeight: '80vh',
            background: 'var(--bg-light)',
            gap: '24px',
            padding: '20px'
        }}>
            <div style={{ 
                padding: '40px', 
                background: 'var(--bg-card)', 
                borderRadius: '18px', 
                boxShadow: '0 12px 32px rgba(0,0,0,0.08)',
                textAlign: 'center',
                maxWidth: '440px',
                width: '100%',
                border: errorMsg ? '1px solid #fecaca' : '1px solid var(--border-color, #e2e8f0)'
            }}>
                {!errorMsg ? (
                    <>
                        <div style={{
                            width: '64px', height: '64px', borderRadius: '50%',
                            background: 'linear-gradient(135deg, #1877F2 0%, #E4405F 100%)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            margin: '0 auto 20px', color: '#fff', fontSize: '28px',
                            boxShadow: '0 8px 20px rgba(24, 119, 242, 0.3)'
                        }}>
                            <i className="fab fa-facebook-f"></i>
                        </div>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '10px' }}>
                            {status}
                        </h2>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: '1.5' }}>
                            Please wait while we automatically link your Facebook Page and Instagram Business Account.
                        </p>
                    </>
                ) : (
                    <>
                        <div style={{
                            width: '64px', height: '64px', borderRadius: '50%',
                            background: '#fee2e2', color: '#ef4444',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            margin: '0 auto 20px', fontSize: '28px'
                        }}>
                            <i className="fas fa-exclamation-triangle"></i>
                        </div>
                        <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#991b1b', marginBottom: '8px' }}>
                            Connection Failed
                        </h2>
                        <p style={{ fontSize: '0.82rem', color: '#b91c1c', marginBottom: '20px', lineHeight: '1.4' }}>
                            {errorMsg}
                        </p>
                        <button
                            onClick={() => {
                                if (typeof onNavigate === 'function') {
                                    onNavigate('settings');
                                } else {
                                    window.location.href = '/settings';
                                }
                            }}
                            style={{
                                background: '#1877F2', color: '#fff', border: 'none',
                                padding: '10px 20px', borderRadius: '8px', fontWeight: 700,
                                fontSize: '0.85rem', cursor: 'pointer'
                            }}
                        >
                            Return to Settings
                        </button>
                    </>
                )}
            </div>
        </div>
    );
};

export default FacebookCallback;
