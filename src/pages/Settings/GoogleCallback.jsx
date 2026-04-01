import { useEffect, useState } from 'react';
import { googleSettingsAPI } from '../../utils/api';
import { toast } from 'react-hot-toast';

const GoogleCallback = ({ onNavigate }) => {
    const [status, setStatus] = useState('Processing...');

    useEffect(() => {
        const handleCallback = async () => {
            const params = new URLSearchParams(window.location.search);
            const success = params.get('success');
            const code = params.get('code');

            if (success === 'true') {
                toast.success('Google account connected successfully!');
                onNavigate('settings');
                return;
            }

            if (!code) {
                toast.error('No authorization code found');
                onNavigate('settings');
                return;
            }

            try {
                setStatus('Connecting your Google account...');
                const response = await googleSettingsAPI.handleCallback(code);
                if (response.success) {
                    toast.success('Google account connected successfully!');
                } else {
                    toast.error(response.error || 'Failed to connect Google account');
                }
            } catch (error) {
                console.error('Google callback error:', error);
                toast.error('An error occurred during connection');
            } finally {
                // Return to settings
                onNavigate('settings');
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
            background: '#f8fafc',
            gap: '24px'
        }}>
            <div style={{ 
                padding: '40px', 
                background: 'white', 
                borderRadius: '16px', 
                boxShadow: '0 10px 25px rgba(0,0,0,0.05)',
                textAlign: 'center',
                maxWidth: '400px',
                width: '100%'
            }}>
                <div className="sync-orbit-container" style={{ margin: '0 auto 24px', width: '48px', height: '48px' }}>
                    <div className="sync-orbit-ring" style={{ width: '48px', height: '48px' }}></div>
                    <div className="sync-orbit-dot" style={{ width: '8px', height: '8px' }}></div>
                </div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1e293b', marginBottom: '8px' }}>{status}</h2>
                <p style={{ fontSize: '0.875rem', color: '#64748b' }}>Please do not close this window while we finish the setup.</p>
            </div>
        </div>
    );
};

export default GoogleCallback;
