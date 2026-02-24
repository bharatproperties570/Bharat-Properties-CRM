import React, { useState, useEffect } from 'react';
import { emailAPI } from '../../../utils/api';

const ViewEmailModal = ({ isOpen, onClose, email }) => {
    const [content, setContent] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (isOpen && email && email.id) {
            fetchContent();
        }
    }, [isOpen, email]);

    const fetchContent = async () => {
        setIsLoading(true);
        try {
            const response = await emailAPI.getContent(email.id);
            if (response && response.success) {
                setContent(response.data);
            } else {
                setContent('Failed to load email content.');
            }
        } catch (error) {
            console.error('Error fetching email content:', error);
            setContent('An error occurred while loading the email.');
        } finally {
            setIsLoading(false);
        }
    };

    if (!isOpen || !email) return null;

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.6)',
            backdropFilter: 'blur(4px)',
            zIndex: 2000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
        }}>
            <div style={{
                backgroundColor: '#fff',
                borderRadius: '16px',
                width: '800px',
                maxWidth: '95vw',
                height: '80vh',
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden'
            }}>
                <div style={{
                    padding: '24px',
                    borderBottom: '1px solid #e2e8f0',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    background: '#f8fafc'
                }}>
                    <div style={{ flex: 1 }}>
                        <h2 style={{ margin: '0 0 8px 0', fontSize: '1.25rem', fontWeight: 800, color: '#1e293b' }}>
                            {email.subject || '(No Subject)'}
                        </h2>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', color: '#64748b' }}>
                            <span style={{ fontWeight: 600, color: '#475569' }}>From:</span>
                            <span>{email.participant}</span>
                            <span style={{ marginLeft: '12px', fontWeight: 600, color: '#475569' }}>Date:</span>
                            <span>{email.date}</span>
                        </div>
                    </div>
                    <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '1.4rem', color: '#64748b', padding: '0 0 0 16px' }}>
                        <i className="fas fa-times"></i>
                    </button>
                </div>

                <div style={{
                    flex: 1,
                    padding: '32px',
                    overflowY: 'auto',
                    backgroundColor: '#fff',
                    lineHeight: '1.6',
                    fontSize: '0.95rem',
                    color: '#334155'
                }}>
                    {isLoading ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '16px', color: '#94a3b8' }}>
                            <i className="fas fa-spinner fa-spin fa-2x"></i>
                            <p>Loading email content...</p>
                        </div>
                    ) : (
                        <div
                            dangerouslySetInnerHTML={{ __html: content }}
                            style={{ whiteSpace: 'pre-wrap' }}
                        />
                    )}
                </div>

                <div style={{
                    padding: '16px 24px',
                    borderTop: '1px solid #e2e8f0',
                    display: 'flex',
                    justifyContent: 'flex-end',
                    background: '#f8fafc'
                }}>
                    <button
                        onClick={onClose}
                        style={{
                            padding: '10px 24px',
                            borderRadius: '8px',
                            border: '1px solid #e2e8f0',
                            background: '#fff',
                            color: '#475569',
                            fontWeight: 700,
                            cursor: 'pointer'
                        }}
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ViewEmailModal;
