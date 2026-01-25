import React, { useEffect } from 'react';

const Toast = ({ message, type = 'success', onClose, duration = 3000 }) => {
    useEffect(() => {
        const timer = setTimeout(() => {
            onClose();
        }, duration);
        return () => clearTimeout(timer);
    }, [duration, onClose]);

    const bgColors = {
        success: '#10b981', // Emerald 500
        error: '#ef4444',   // Red 500
        info: '#3b82f6',    // Blue 500
    };

    const icons = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        info: 'fa-info-circle'
    };

    return (
        <div style={{
            position: 'fixed',
            bottom: '32px',
            right: '32px',
            background: bgColors[type] || bgColors.info,
            color: '#fff',
            padding: '12px 24px',
            borderRadius: '8px',
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            zIndex: 12000, // Higher than AddSizeModal (11000)
            fontSize: '0.95rem',
            fontWeight: 500,
            animation: 'slideIn 0.3s ease-out'
        }}>
            <i className={`fas ${icons[type] || icons.info}`}></i>
            {message}
            <style>
                {`
                    @keyframes slideIn {
                        from { transform: translateY(100%); opacity: 0; }
                        to { transform: translateY(0); opacity: 1; }
                    }
                `}
            </style>
        </div>
    );
};

export default Toast;
