import React from 'react';
import QRCode from 'react-qr-code';
import { Modal } from './ui';

const QRCodeModal = ({ url, onClose }) => {
    if (!url) return null;

    return (
        <Modal
            isOpen={Boolean(url)}
            onClose={onClose}
            title="Scan QR Code"
            size="sm"
        >
            <div style={{ textAlign: 'center' }}>
                <p style={{ margin: '0 0 24px', fontSize: '0.9rem', color: '#64748b' }}>
                    Share this QR code with the client to collect feedback instantly.
                </p>
                <div style={{ padding: '24px', background: '#f8fafc', borderRadius: '12px', display: 'inline-block' }}>
                    <QRCode value={url} size={200} fgColor="#0f172a" />
                </div>
                <div style={{ marginTop: '24px', fontSize: '0.8rem', color: '#94a3b8', wordBreak: 'break-all', padding: '12px', background: '#f1f5f9', borderRadius: '8px' }}>
                    {url}
                </div>
            </div>
        </Modal>
    );
};

export default QRCodeModal;
