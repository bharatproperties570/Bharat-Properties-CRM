import React from 'react';
import { LucideX } from 'lucide-react';
import QRCode from 'react-qr-code';

const QRCodeModal = ({ url, onClose }) => {
    if (!url) return null;
    
    return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
            <div style={{ background: '#fff', padding: '32px', borderRadius: '16px', maxWidth: '400px', width: '100%', position: 'relative', textAlign: 'center' }}>
                <button onClick={onClose} style={{ position: 'absolute', top: '16px', right: '16px', background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
                    <LucideX size={24} />
                </button>
                <h3 style={{ margin: '0 0 16px', fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>Scan QR Code</h3>
                <p style={{ margin: '0 0 24px', fontSize: '0.9rem', color: '#64748b' }}>Share this QR code with the client to collect feedback instantly.</p>
                <div style={{ padding: '24px', background: '#f8fafc', borderRadius: '12px', display: 'inline-block' }}>
                    <QRCode value={url} size={200} fgColor="#0f172a" />
                </div>
                <div style={{ marginTop: '24px', fontSize: '0.8rem', color: '#94a3b8', wordBreak: 'break-all', padding: '12px', background: '#f1f5f9', borderRadius: '8px' }}>
                    {url}
                </div>
            </div>
        </div>
    );
};

export default QRCodeModal;
